package com.app.push;

import java.lang.reflect.Proxy;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpSession;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.session.Configuration;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.app.util.UserAccess;

/** 실제 사용자 알림을 보내지 않고 커밋 후 조회·기기 소유권·재시도·잠금 화면 내용을 확인 */
public class CommunityPushCheck {
    private static int checks;
    private static final Instant START = Instant.parse("2026-10-07T03:00:00Z");

    public static void main(String[] args) throws Exception {
        deliveryAndPayload(); disabledAndChangedOwner(); retryAndExpired(); boundedBatch(); configReadiness(); mapper();
        System.out.println("CommunityPushCheck: " + checks + " checks passed; no external push sent.");
    }
    private static void check(boolean condition, String label) {
        if (!condition) throw new AssertionError(label);
        checks++;
    }

    private static CommunityPushDelivery delivery(long notificationId, long subscriptionId) {
        CommunityPushDelivery d = new CommunityPushDelivery();
        d.setNotificationId(notificationId); d.setSubscriptionId(subscriptionId); d.setUserId(41L);
        d.setEndpoint("https://fcm.googleapis.com/fcm/send/mocked-device-" + subscriptionId);
        d.setEndpointHash("hash-" + subscriptionId); d.setPublicKey("unused"); d.setAuthSecret("unused");
        d.setNotificationType("POST_COMMENT"); d.setPostId(57L);
        return d;
    }
    private static class MutableClock extends Clock {
        Instant now = START;
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }
    private static class Devices extends PushDao {
        boolean enabled = true;
        final Map<String,PushSubscription> rows = new HashMap<>();
        Devices() { super(null); }
        @Override public boolean schemaReady() { return true; }
        @Override public PushSubscription find(String hash) { return rows.get(hash); }
        @Override public boolean userEnabled(long userId) { return enabled; }
        @Override public void removeExpired(long id) { rows.values().removeIf(d -> d.getSubscriptionId().equals(id)); }
    }
    private static class Queue extends CommunityPushDao {
        final List<CommunityPushDelivery> committed = new ArrayList<>();
        final Map<String,String> statuses = new HashMap<>();
        final Map<String,Integer> attempts = new HashMap<>();
        final Map<String,Instant> retryAt = new HashMap<>();
        boolean available = true;
        boolean eligible = true;
        Instant cutoff;
        Runnable beforeSend = () -> {};
        Queue() { super(null); }
        String key(CommunityPushDelivery d) { return d.getNotificationId() + ":" + d.getSubscriptionId(); }
        @Override public boolean schemaReady() { return available; }
        @Override public void enqueue(Instant now, Instant cutoff) {
            this.cutoff = cutoff;
            for (CommunityPushDelivery d : committed) statuses.putIfAbsent(key(d), "PENDING");
        }
        @Override public List<CommunityPushDelivery> pending(Instant now, Instant cutoff) {
            return committed.stream().filter(d -> List.of("PENDING", "RETRY").contains(statuses.get(key(d))))
                .filter(d -> attempts.getOrDefault(key(d), 0) < 3 && !now.isBefore(retryAt.getOrDefault(key(d), START)))
                .toList();
        }
        @Override public String claim(CommunityPushDelivery d, Instant now, Instant cutoff) {
            String key = key(d);
            if (!List.of("PENDING", "RETRY").contains(statuses.get(key))) return null;
            statuses.put(key, "SENDING"); attempts.merge(key, 1, Integer::sum); beforeSend.run(); return "owned-token";
        }
        @Override public boolean eligible(CommunityPushDelivery d, Instant now, Instant cutoff) { return eligible; }
        @Override public void finish(CommunityPushDelivery d, String token, boolean sent, boolean retry, Instant now) {
            if (!"owned-token".equals(token)) throw new AssertionError("wrong token");
            statuses.put(key(d), sent ? "SENT" : retry ? "RETRY" : "FAILED"); retryAt.put(key(d), now.plusSeconds(30));
        }
        @Override public void cleanup(Instant before) { }
    }
    private static class Sender implements PushSender {
        int code = 201;
        boolean ready = true;
        boolean fail;
        final List<String> payloads = new ArrayList<>();
        @Override public boolean ready() { return ready; }
        @Override public String publicKey() { return "unused"; }
        @Override public int send(PushSubscription d, String payload, int ttl) {
            check(ttl == 300, "커뮤니티 알림은 오래 저장되지 않도록 TTL 5분");
            payloads.add(payload);
            if (fail) throw new IllegalStateException("simulated network failure");
            return code;
        }
    }
    private record Fixture(Queue queue, Devices devices, Sender sender, MutableClock clock, CommunityPushScheduler scheduler) {
        Fixture() { this(new Queue(), new Devices(), new Sender(), new MutableClock()); }
        Fixture(Queue q, Devices d, Sender s, MutableClock c) {
            this(q, d, s, c, new CommunityPushScheduler(q, d, s, new PushSubscriptionService(d, s, c), c));
        }
        CommunityPushDelivery add(long notificationId, long subscriptionId) {
            CommunityPushDelivery row = delivery(notificationId, subscriptionId);
            queue.committed.add(row); devices.rows.put(row.getEndpointHash(), row); return row;
        }
    }

    private static void deliveryAndPayload() throws Exception {
        Fixture f = new Fixture();
        f.scheduler.tick();
        check(f.sender.payloads.isEmpty(), "커밋되지 않아 조회되지 않은 알림은 발송하지 않음");
        CommunityPushDelivery first = f.add(101, 1); f.add(101, 2);
        f.scheduler.tick();
        check(f.sender.payloads.size() == 2, "같은 알림을 수신자 자신의 기기별로 전송");
        check(f.queue.cutoff.equals(START.minusSeconds(600)), "최근 10분 조회창 전달");
        f.scheduler.tick();
        check(f.sender.payloads.size() == 2, "다음 실행에서 완료한 알림은 재발송하지 않음");
        Map<?,?> payload = new ObjectMapper().readValue(f.sender.payloads.get(0), Map.class);
        check("community-notification".equals(payload.get("type")), "서비스 워커 커뮤니티 타입");
        check("/community?postId=57".equals(payload.get("url")), "알림 클릭은 해당 게시글 주소");
        check("jette-yak-notification-101".equals(payload.get("tag")), "재시도에서도 같은 알림 태그 유지");
        check(!payload.containsKey("content") && !payload.containsKey("actorName") && !payload.containsKey("userId"), "잠금 화면에 본문·이름·사용자 번호 제외");
        check(((Number) payload.get("notificationId")).longValue() == 101, "알림 식별자만 전송");
        first.setNotificationType("ADMIN_REPORT");
        check(f.scheduler.payload(first).contains("\"url\":\"/admin\""), "관리자 신고 알림은 관리자 페이지로 이동");
        first.setNotificationType("REPORT_RESULT"); first.setPostId(null);
        check(f.scheduler.payload(first).contains("\"url\":\"/\""), "게시글이 없는 처리 결과는 안전한 홈 경로");
    }
    private static void disabledAndChangedOwner() {
        Fixture disabled = new Fixture(); disabled.add(201, 1); disabled.devices.enabled = false; disabled.scheduler.tick();
        check(disabled.sender.payloads.isEmpty(), "계정 전체 알림 끄기면 발송 차단");
        Fixture removed = new Fixture(); removed.add(202, 1); removed.queue.beforeSend = () -> removed.devices.rows.clear(); removed.scheduler.tick();
        check(removed.sender.payloads.isEmpty(), "발송 대기 중 로그아웃으로 해제된 기기는 발송 차단");
        Fixture owner = new Fixture(); CommunityPushDelivery row = owner.add(203, 1);
        owner.queue.beforeSend = () -> {
            PushSubscription changed = delivery(203, 1); changed.setUserId(99L); owner.devices.rows.put(row.getEndpointHash(), changed);
        };
        owner.scheduler.tick(); check(owner.sender.payloads.isEmpty(), "같은 주소의 소유자가 바뀌면 이전 계정 알림 차단");
        Fixture read = new Fixture(); read.add(204, 1); read.queue.eligible = false; read.scheduler.tick();
        check(read.sender.payloads.isEmpty() && read.queue.statuses.containsValue("FAILED"), "대기 중 읽었거나 기간이 지난 알림 차단");
        Fixture schema = new Fixture(); schema.add(205, 1); schema.queue.available = false; schema.scheduler.tick();
        check(schema.sender.payloads.isEmpty(), "새 테이블 미준비 시 기존 알림·페이지와 분리해 중단");
        Fixture keys = new Fixture(); keys.add(206, 1); keys.sender.ready = false; keys.scheduler.tick();
        check(keys.sender.payloads.isEmpty(), "서버 키 준비 전 발송 중단");
    }
    private static void retryAndExpired() {
        Fixture f = new Fixture(); CommunityPushDelivery row = f.add(301, 1); f.sender.code = 503; f.scheduler.tick();
        check("RETRY".equals(f.queue.statuses.get(f.queue.key(row))), "서버 일시 오류는 재시도 대기");
        f.clock.now = START.plusSeconds(29); f.scheduler.tick(); check(f.sender.payloads.size() == 1, "30초 이전 재시도 금지");
        f.clock.now = START.plusSeconds(30); f.scheduler.tick(); f.clock.now = START.plusSeconds(60); f.scheduler.tick();
        f.clock.now = START.plusSeconds(90); f.scheduler.tick(); check(f.sender.payloads.size() == 3, "전송 최대 3회로 제한");
        Fixture permanent = new Fixture(); CommunityPushDelivery bad = permanent.add(302, 1); permanent.sender.code = 403; permanent.scheduler.tick();
        check("FAILED".equals(permanent.queue.statuses.get(permanent.queue.key(bad))), "권한 오류는 반복 전송하지 않음");
        for (int status : List.of(404, 410)) {
            Fixture expired = new Fixture(); expired.add(303, 1); expired.sender.code = status; expired.scheduler.tick();
            check(expired.devices.rows.isEmpty(), "만료된 기기 구독 제거 " + status);
        }
        Fixture network = new Fixture(); CommunityPushDelivery pending = network.add(304, 1); network.sender.fail = true; network.scheduler.tick();
        check("RETRY".equals(network.queue.statuses.get(network.queue.key(pending))), "통신 예외도 재시도 기록");
    }
    private static void boundedBatch() {
        Fixture f = new Fixture(); for (int i = 1; i <= 25; i++) f.add(400 + i, i);
        f.scheduler.tick(); check(f.sender.payloads.size() == 20, "한 실행에서 최대 20기기로 제한");
        f.scheduler.tick(); check(f.sender.payloads.size() == 25, "남은 기기는 다음 실행에서 이어 처리");
    }
    private static void configReadiness() {
        Map<String,Object> attributes = new HashMap<>(Map.of("userId", 41L, "authenticated", true));
        HttpSession session = (HttpSession) Proxy.newProxyInstance(CommunityPushCheck.class.getClassLoader(), new Class<?>[]{HttpSession.class}, (proxy, method, args) -> switch (method.getName()) {
            case "getAttribute" -> attributes.get(args[0]);
            case "setAttribute" -> { attributes.put((String) args[0], args[1]); yield null; }
            default -> null;
        });
        HttpServletRequest request = (HttpServletRequest) Proxy.newProxyInstance(CommunityPushCheck.class.getClassLoader(), new Class<?>[]{HttpServletRequest.class}, (proxy, method, args) -> switch (method.getName()) {
            case "getSession" -> session;
            case "getHeader" -> null;
            default -> null;
        });
        Fixture f = new Fixture();
        PushSubscriptionService service = new PushSubscriptionService(f.devices, f.sender, f.clock);
        PushController controller = new PushController(new UserAccess(null), service, f.scheduler);
        Map<String,Object> config = controller.config(request).getBody();
        check(Boolean.TRUE.equals(config.get("enabled")) && Boolean.TRUE.equals(config.get("communityEnabled")), "복약과 커뮤니티 준비 상태를 각각 전달");
        f.queue.available = false; f.clock.now = START.plusSeconds(31);
        config = controller.config(request).getBody();
        check(Boolean.TRUE.equals(config.get("enabled")) && Boolean.FALSE.equals(config.get("communityEnabled")), "커뮤니티 테이블이 없어도 복약 알림 유지");
        f.queue.available = true; f.clock.now = START.plusSeconds(62);
        check(Boolean.TRUE.equals(controller.config(request).getBody().get("communityEnabled")), "테이블 준비 뒤 재확인으로 복구");
        f.sender.ready = false;
        config = controller.config(request).getBody();
        check(Boolean.FALSE.equals(config.get("enabled")) && Boolean.FALSE.equals(config.get("communityEnabled")), "공통 전송 키가 없으면 두 준비 상태 모두 비활성");
        check(Boolean.FALSE.equals(new PushController(new UserAccess(null), service).config(request).getBody().get("communityEnabled")), "이전 두 인자 생성자 계약 유지");
    }
    private static void mapper() throws Exception {
        Path mapper = Path.of("src/main/webapp/WEB-INF/mybatis/mapper/community_push_mapper.xml");
        Configuration configuration = new Configuration();
        try (var input = Files.newInputStream(mapper)) { new XMLMapperBuilder(input, configuration, mapper.toString(), configuration.getSqlFragments()).parse(); }
        Map<String,Object> params = Map.of("notificationId", 1, "subscriptionId", 1, "userId", 41,
            "now", Timestamp.from(START), "cutoff", Timestamp.from(START.minusSeconds(600)),
            "leaseUntil", Timestamp.from(START.plusSeconds(45)), "claimToken", "test");
        String pending = configuration.getMappedStatement("com.app.push.CommunityPushDao.pending").getBoundSql(params).getSql();
        check(pending.contains("n.user_id=p.user_id") && pending.contains("n.read_at IS NULL"), "수신자와 기기 소유권·읽음 조건 SQL");
        check(pending.contains("CAST(p.community_started_at AS DATE)") && !pending.contains("CAST(p.created_at AS DATE)"), "커뮤니티 UTC 참여 시각 기준. 예전 구독 시각의 시간대와 분리");
        check(pending.contains("'ADMIN_REPORT'") && pending.contains("'COMMENT_REPLY'") && !pending.contains("'INVITATION'"), "커뮤니티·관리자 이벤트만 허용");
        check(pending.contains("CAST(u.is_admin AS VARCHAR2(10))"), "관리자 권한을 회수한 계정의 신고 알림 제외");
        String claim = configuration.getMappedStatement("com.app.push.CommunityPushDao.claim").getBoundSql(params).getSql();
        check(claim.contains("attempts < 3") && claim.contains("lease_until <=") && claim.contains("p.user_id=?"), "조건부 임대 획득·재시도·소유권 SQL");
        var eligibility = configuration.getMappedStatement("com.app.push.CommunityPushDao.eligible");
        check(eligibility.isFlushCacheRequired() && !eligibility.isUseCache(), "발송 직전 설정·권한 확인은 트랜잭션 로컬 캐시도 재사용하지 않음");
        String migration = Files.readString(Path.of("src/main/resources/db/20261007_community_web_push.sql"));
        check(migration.contains("PRIMARY KEY(notification_id,subscription_id)"), "알림·기기 조합을 DB에서 중복 차단");
        check(migration.contains("ON DELETE CASCADE") && migration.contains("SQLCODE != -955"), "구독 삭제 연결과 재실행 보존");
        check(migration.contains("community_started_at TIMESTAMP DEFAULT SYS_EXTRACT_UTC(SYSTIMESTAMP) NOT NULL") && migration.contains("SQLCODE != -1430"), "기존 기기의 커뮤니티 시작점을 UTC로 추가하고 재실행 시 유지");
    }
}
