package com.app.push;

import java.lang.reflect.Proxy;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Security;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpSession;
import com.app.dto.ScheduleDTO;
import com.app.service.ScheduleService;
import com.app.util.UserAccess;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.session.Configuration;
import org.bouncycastle.jce.interfaces.ECPublicKey;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.bouncycastle.jce.spec.ECNamedCurveParameterSpec;
import org.bouncycastle.jce.ECNamedCurveTable;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.web.server.ResponseStatusException;

/** 실제 DB·외부 푸시 없이 소유권, CSRF, 한국 시각, 재전송과 잠금화면 개인정보를 확인 */
public class BackgroundPushCheck {
    private static int checks;
    private static String publicKey;
    private static String privateKey;
    private static final String ENDPOINT = "https://fcm.googleapis.com/fcm/send/test-device";
    private static final String AUTH = Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[16]);

    private static void check(boolean pass, String description) {
        if (!pass) throw new AssertionError(description);
        checks++;
    }
    private static void status(int expected, Runnable action, String description) {
        try { action.run(); throw new AssertionError(description + " (예외 없음)"); }
        catch (ResponseStatusException error) { check(error.getStatus().value() == expected, description); }
    }
    private static PushInput input(String endpoint) {
        PushInput input = new PushInput(); input.endpoint = endpoint;
        input.keys = new PushInput.Keys(); input.keys.p256dh = publicKey; input.keys.auth = AUTH;
        return input;
    }
    private static class MemoryDao extends PushDao {
        final Map<String,PushSubscription> devices = new LinkedHashMap<>();
        final Map<String,String> claims = new HashMap<>();
        final Map<String,String> outcomes = new HashMap<>();
        boolean enabled = true;
        boolean unavailable;
        int removals;
        int schemaReads;
        MemoryDao() { super(null); }
        @Override public boolean schemaReady() { schemaReads++; if (unavailable) throw new DataAccessResourceFailureException("unavailable"); return true; }
        @Override public PushSubscription find(String hash) { return devices.get(hash); }
        @Override public void insert(PushSubscription subscription) { subscription.setSubscriptionId((long) devices.size() + 1); devices.put(subscription.getEndpointHash(), subscription); }
        @Override public int updateOwned(PushSubscription subscription) {
            PushSubscription old = devices.get(subscription.getEndpointHash());
            if (old == null || !old.getUserId().equals(subscription.getUserId())) return 0;
            subscription.setSubscriptionId(old.getSubscriptionId()); devices.put(subscription.getEndpointHash(), subscription); return 1;
        }
        @Override public int removeOwned(long userId, String hash) {
            PushSubscription old = devices.get(hash);
            if (old == null || old.getUserId() != userId) return 0;
            if (unavailable) throw new DataAccessResourceFailureException("unavailable");
            devices.remove(hash); removals++; return 1;
        }
        @Override public List<PushSubscription> activeSubscriptions() { return enabled ? new ArrayList<>(devices.values()) : List.of(); }
        @Override public boolean userEnabled(long userId) { return enabled; }
        @Override public void removeExpired(long id) { devices.values().removeIf(device -> device.getSubscriptionId().equals(id)); removals++; }
        @Override public String claim(long id, String date, String time, String kind, Instant now) {
            String key = id + ":" + date + ":" + time + ":" + kind;
            if (claims.containsKey(key) && !"RETRY".equals(outcomes.get(key))) return null;
            claims.put(key, "test-token"); outcomes.put(key, "SENDING"); return "test-token";
        }
        @Override public void finish(long id, String date, String time, String kind, String token, boolean success, boolean retry, Instant now) {
            outcomes.put(id + ":" + date + ":" + time + ":" + kind, success ? "SENT" : retry ? "RETRY" : "FAILED");
        }
        @Override public void cleanup(Instant before) { }
    }
    private static class Sender implements PushSender {
        boolean ready = true;
        int code = 201;
        int count;
        final List<String> payloads = new ArrayList<>();
        @Override public boolean ready() { return ready; }
        @Override public String publicKey() { return publicKey; }
        @Override public int send(PushSubscription subscription, String payload, int ttl) { count++; payloads.add(payload); check(ttl <= 120, "오래된 알림은 푸시 서비스에 장기 보관하지 않음"); return code; }
    }
    private static class MutableClock extends Clock {
        Instant now;
        MutableClock(String value) { now = Instant.parse(value); }
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }
    private static class Request {
        final Map<String,Object> attributes = new HashMap<>();
        final Map<String,String> headers = new HashMap<>();
        final HttpSession session;
        final HttpServletRequest request;
        Request(long userId) {
            attributes.put("userId", userId); attributes.put("authenticated", true);
            session = (HttpSession) Proxy.newProxyInstance(getClass().getClassLoader(), new Class<?>[]{HttpSession.class}, (proxy, method, args) -> switch (method.getName()) {
                case "getAttribute" -> attributes.get(args[0]);
                case "setAttribute" -> { attributes.put((String) args[0], args[1]); yield null; }
                case "removeAttribute" -> { attributes.remove(args[0]); yield null; }
                case "getId" -> "test-session";
                default -> null;
            });
            request = (HttpServletRequest) Proxy.newProxyInstance(getClass().getClassLoader(), new Class<?>[]{HttpServletRequest.class}, (proxy, method, args) -> switch (method.getName()) {
                case "getSession" -> session;
                case "getHeader" -> headers.get(args[0]);
                default -> null;
            });
        }
    }
    private static ScheduleDTO schedule(long user, String time) {
        ScheduleDTO result = new ScheduleDTO(); result.setUserId(user); result.setTime(time); result.setAlarmEnabled(true);
        result.setName("잠금화면에 표시하면 안 되는 약 이름"); return result;
    }
    private static ScheduleService schedules(Map<String,List<ScheduleDTO>> days, List<String> dates) {
        return (ScheduleService) Proxy.newProxyInstance(BackgroundPushCheck.class.getClassLoader(), new Class<?>[]{ScheduleService.class}, (proxy, method, args) -> {
            if (method.getName().equals("getDailySchedules")) { dates.add((String) args[1]); return days.getOrDefault(args[1], List.of()); }
            throw new UnsupportedOperationException(method.getName());
        });
    }

    public static void main(String[] args) throws Exception {
        Security.addProvider(new BouncyCastleProvider());
        KeyPairGenerator generator = KeyPairGenerator.getInstance("ECDH", "BC");
        generator.initialize(ECNamedCurveTable.getParameterSpec("prime256v1"));
        KeyPair keys = generator.generateKeyPair();
        publicKey = Base64.getUrlEncoder().withoutPadding().encodeToString(nl.martijndwars.webpush.Utils.encode((ECPublicKey) keys.getPublic()));
        byte[] scalar = ((org.bouncycastle.jce.interfaces.ECPrivateKey) keys.getPrivate()).getD().toByteArray();
        byte[] padded = new byte[32];
        System.arraycopy(scalar, Math.max(0, scalar.length - 32), padded, Math.max(0, 32 - scalar.length), Math.min(32, scalar.length));
        privateKey = Base64.getUrlEncoder().withoutPadding().encodeToString(padded);
        safety(); crypto(); subscriptions(); logoutRace(); routing(); scheduler(); ownershipRace(); mapper();
        System.out.println("BackgroundPushCheck: " + checks + " checks passed");
    }
    private static void crypto() throws Exception {
        WebPushSender configured = new WebPushSender(publicKey, privateKey, "https://github.com/jws909/Jette-Yak");
        check(configured.ready(), "실제 P-256 VAPID 키 쌍으로 전송기 준비");
        var field = WebPushSender.class.getDeclaredField("signer"); field.setAccessible(true);
        nl.martijndwars.webpush.PushService signer = (nl.martijndwars.webpush.PushService) field.get(configured);
        String plain = "앱 종료 후 알림 암호화 확인";
        var post = signer.preparePost(new nl.martijndwars.webpush.Notification(ENDPOINT, publicKey, AUTH,
            plain.getBytes(java.nio.charset.StandardCharsets.UTF_8), 60), nl.martijndwars.webpush.Encoding.AES128GCM);
        check(post.getFirstHeader("Authorization").getValue().startsWith("vapid t="), "실제 VAPID ES256 서명 생성");
        check(post.getFirstHeader("Content-Encoding").getValue().equals("aes128gcm"), "iOS·Android 공통 AES128GCM 암호화");
        byte[] encrypted = org.apache.http.util.EntityUtils.toByteArray(post.getEntity());
        check(encrypted.length > plain.getBytes(java.nio.charset.StandardCharsets.UTF_8).length
            && !new String(encrypted, java.nio.charset.StandardCharsets.UTF_8).contains(plain), "평문을 HTTP 본문에 전송하지 않음");
        check(post.getFirstHeader("TTL").getValue().equals("60"), "실제 푸시 요청의 보관 기한 지정");
    }
    private static void safety() {
        for (String endpoint : List.of(ENDPOINT, "https://web.push.apple.com/QAbc123", "https://updates.push.services.mozilla.com/wpush/v2/a", "https://abc.notify.windows.com/w/?token=a"))
            check(PushSafety.endpoint(endpoint).equals(endpoint), "알려진 HTTPS 푸시 서비스 허용");
        for (String endpoint : List.of("http://fcm.googleapis.com/a", "https://fcm.googleapis.com.attacker.test/a", "https://fcm.googleapis.com@127.0.0.1/a",
                "https://127.0.0.1/a", "https://fcm.googleapis.com:8080/a", "https://web.push.apple.com/a#secret", "https://localhost/a"))
            status(400, () -> PushSafety.endpoint(endpoint), "임의 주소·로컬망·포트·URL 변조 차단");
        check(PushSafety.hash(ENDPOINT).length() == 64, "구독 주소의 고정 길이 해시");
        status(400, () -> PushSafety.key("not-a-key", 65), "잘못된 암호화 키 길이 거절");
        check(!new WebPushSender("", "", "").ready(), "미설정 키로 서버 기동을 막지 않음");
    }
    private static void subscriptions() {
        MemoryDao dao = new MemoryDao(); Sender sender = new Sender(); MutableClock clock = new MutableClock("2026-10-07T03:00:00Z");
        PushSubscriptionService service = new PushSubscriptionService(dao, sender, clock);
        Request first = new Request(11); Request second = new Request(12);
        check(service.available(), "키와 스키마 준비 상태 확인");
        service.available(); check(dao.schemaReads == 1, "준비 상태 확인을 30초 동안 재사용");
        service.subscribe(11, input(ENDPOINT), first.session);
        check(dao.devices.size() == 1, "현재 세션 사용자에게 기기 등록");
        service.subscribe(11, input(ENDPOINT), first.session);
        check(dao.devices.size() == 1, "같은 기기의 재등록은 중복을 만들지 않음");
        status(409, () -> service.subscribe(12, input(ENDPOINT), second.session), "다른 계정 구독 덮어쓰기 차단");
        check(!service.subscribed(12, ENDPOINT, second.session), "다른 계정의 구독 상태 노출 금지");
        service.remove(12, ENDPOINT, second.session); check(dao.devices.size() == 1, "다른 계정 구독 삭제 차단");
        Request fresh = new Request(11);
        check(service.subscribed(11, ENDPOINT, fresh.session), "새 로그인 세션에서 기존 기기 조회");
        service.removeForSession(fresh.request); check(dao.devices.isEmpty(), "상태 조회도 세션에 연결하여 로그아웃 해제 가능");
        status(401, () -> service.subscribe(11, input(ENDPOINT), fresh.session), "로그아웃 처리 후 뒤늦게 도착한 등록 요청 차단");
        service.subscribe(11, input(ENDPOINT), first.session);
        service.test(11, ENDPOINT, first.session); check(sender.count == 1, "본인 기기에만 테스트 전송");
        status(429, () -> service.test(11, ENDPOINT, first.session), "테스트 전송 30초 제한");
        clock.now = clock.now.plusSeconds(31); sender.code = 410;
        status(410, () -> service.test(11, ENDPOINT, first.session), "만료된 기기 안내");
        check(dao.devices.isEmpty(), "만료된 구독 정리");
        service.subscribe(11, input(ENDPOINT), first.session); dao.unavailable = true;
        status(503, () -> service.removeForSession(first.request), "활성 구독 해제 실패 시 로그아웃을 중단하여 이전 계정 알림 방지");
        dao.unavailable = false; sender.ready = false;
        check(!service.available(), "키가 없으면 푸시 기능만 비활성화");
        clock.now = clock.now.plusSeconds(31);
        PushInput expired = input(ENDPOINT); expired.expirationTime = clock.millis() - 1; sender.ready = true;
        status(400, () -> service.subscribe(11, expired, first.session), "만료된 브라우저 구독 등록 거절");
    }
    private static void routing() {
        MemoryDao dao = new MemoryDao(); Sender sender = new Sender();
        PushSubscriptionService service = new PushSubscriptionService(dao, sender);
        PushController controller = new PushController(new UserAccess(null), service);
        Request request = new Request(11);
        Map<String,Object> config = controller.config(request.request).getBody();
        String token = (String) config.get("csrfToken");
        check(token != null && token.length() >= 40, "세션별 난수 CSRF 토큰");
        check(controller.config(request.request).getBody().get("csrfToken").equals(token), "동일 세션 토큰 유지");
        status(403, () -> controller.subscribe(request.request, input(ENDPOINT)), "CSRF 토큰 없이 구독 변경 거절");
        request.headers.put("X-Push-CSRF", token); request.headers.put("Sec-Fetch-Site", "same-origin");
        check(controller.subscribe(request.request, input(ENDPOINT)).get("subscribed"), "같은 출처와 세션 토큰으로 등록");
        request.headers.put("Sec-Fetch-Site", "cross-site");
        status(403, () -> controller.config(request.request), "다른 사이트가 CORS를 통해 CSRF 토큰 읽는 요청 차단");
        status(403, () -> controller.subscribe(request.request, input(ENDPOINT)), "토큰을 알아도 교차 사이트 쓰기 차단");
        request.headers.put("Sec-Fetch-Site", "same-site"); status(403, () -> controller.config(request.request), "다른 서브도메인의 토큰 읽기 차단");
        request.headers.clear(); request.headers.put("Origin", "https://attacker.test");
        status(403, () -> controller.config(request.request), "Fetch Metadata 없는 교차 Origin 읽기 차단");
        Request anonymous = new Request(11); anonymous.attributes.remove("authenticated");
        status(401, () -> controller.config(anonymous.request), "로그인 없이 공개키와 세션 토큰 조회 금지");
    }
    private static void scheduler() throws Exception {
        MemoryDao dao = new MemoryDao(); Sender sender = new Sender(); MutableClock clock = new MutableClock("2026-10-07T14:45:30Z");
        PushSubscriptionService service = new PushSubscriptionService(dao, sender, clock);
        service.subscribe(11, input(ENDPOINT), new Request(11).session);
        ScheduleDTO today = schedule(11, "23:45"); ScheduleDTO tomorrow = schedule(11, "00:15");
        ScheduleDTO taken = schedule(11, "23:45"); taken.setTakenAt("2026-10-07 23:45");
        ScheduleDTO off = schedule(11, "23:45"); off.setAlarmEnabled(false);
        ScheduleDTO cancelled = schedule(11, "23:45"); cancelled.setIsCancelled(true);
        ScheduleDTO invalid = schedule(11, "99:99");
        Map<String,List<ScheduleDTO>> days = Map.of("2026-10-07", List.of(today, today, taken, off, cancelled, invalid, schedule(12, "23:45")), "2026-10-08", List.of(tomorrow));
        List<String> queriedDates = new ArrayList<>();
        MedicationPushScheduler scheduler = new MedicationPushScheduler(schedules(days, queriedDates), dao, sender, service, clock);
        List<MedicationPushScheduler.Reminder> due = scheduler.dueForUser(11L, clock.instant());
        check(due.size() == 2, "완료·해제·취소·타인 일정 제외 및 같은 시각 묶기");
        check(queriedDates.contains("2026-10-08"), "자정을 넘는 30분 전 알림은 다음 날 일정도 확인");
        check(due.stream().anyMatch(item -> item.kind().equals("PRE") && item.date().equals("2026-10-08")), "다음 날 새벽 복약 알림 구분");
        String payload = scheduler.payload(due.get(0));
        check(!payload.contains("약 이름") && payload.contains("\"url\":\"/\""), "잠금화면에 약 이름 없이 홈 화면 이동 정보만 전달");
        scheduler.tick(); check(sender.count == 2, "30분 전·정시 알림 모두 서버 전송");
        scheduler.tick(); check(sender.count == 2, "같은 전송 기록 재실행 시 중복 알림 차단");
        MedicationPushScheduler restarted = new MedicationPushScheduler(schedules(days, queriedDates), dao, sender, service, clock);
        restarted.tick(); check(sender.count == 2, "서버 작업 객체 재생성 후에도 DB 기록으로 중복 차단");
        check(!MedicationPushScheduler.withinWindow(clock.instant().plusSeconds(1), clock.instant()), "예정 시각 이전 조기 발송 금지");
        check(MedicationPushScheduler.withinWindow(clock.instant().minusSeconds(120), clock.instant()), "2분 이내 지연 허용");
        check(!MedicationPushScheduler.withinWindow(clock.instant().minusSeconds(121), clock.instant()), "오래된 누락 알림 몰아 보내기 금지");
        dao.enabled = false; dao.claims.clear(); dao.outcomes.clear(); scheduler.tick(); check(sender.count == 2, "전체 알림 해제 시 서버 발송 중단");
        dao.enabled = true; sender.code = 503; scheduler.tick(); check(sender.count == 4 && dao.outcomes.containsValue("RETRY"), "푸시 서비스 일시 오류는 재시도 기록");
        sender.code = 201; clock.now = clock.now.plusSeconds(31); scheduler.tick(); check(sender.count == 6 && !dao.outcomes.containsValue("RETRY"), "재시도 성공 후 완료 기록");
        dao.claims.clear(); dao.outcomes.clear(); sender.code = 410; scheduler.tick(); check(dao.devices.isEmpty(), "정기 발송 중 만료 기기 제거");
    }
    private static void mapper() throws Exception {
        Path mapper = Path.of("src/main/webapp/WEB-INF/mybatis/mapper/push_mapper.xml");
        Configuration config = new Configuration();
        try (var input = Files.newInputStream(mapper)) { new XMLMapperBuilder(input, config, "push_mapper.xml", config.getSqlFragments()).parse(); }
        check(config.hasStatement("com.app.push.PushDao.claim"), "MyBatis 전송 권한 SQL 등록");
        String claimSql = config.getMappedStatement("com.app.push.PushDao.claim").getBoundSql(Map.of("subscriptionId", 1, "doseDate", "2026-10-07", "doseTime", "12:00", "kind", "DUE", "now", Timestamp.from(Instant.now()), "leaseUntil", Timestamp.from(Instant.now()), "claimToken", "x")).getSql();
        check(claimSql.contains("attempts < 3") && claimSql.contains("lease_until <="), "최대 3회와 임대 만료를 SQL 조건으로 보장");
        String migration = Files.readString(Path.of("src/main/resources/db/20261007_web_push.sql"));
        check(migration.contains("UNIQUE(subscription_id,dose_date,dose_time,reminder_kind)"), "DB 유일 제약으로 동시 전송 권한 중복 차단");
        check(migration.contains("ON DELETE CASCADE"), "기기 해제와 사용자 삭제 시 전송 기록 함께 정리");
    }
    private static void ownershipRace() {
        MemoryDao dao = new MemoryDao() {
            @Override public String claim(long id, String date, String time, String kind, Instant now) {
                String token = super.claim(id, date, time, kind, now);
                if (token != null) {
                    PushSubscription changed = new PushSubscription();
                    changed.setSubscriptionId(999L); changed.setUserId(12L); changed.setEndpoint(ENDPOINT);
                    changed.setEndpointHash(PushSafety.hash(ENDPOINT)); changed.setPublicKey(publicKey); changed.setAuthSecret(AUTH);
                    devices.put(changed.getEndpointHash(), changed);
                }
                return token;
            }
        };
        Sender sender = new Sender(); MutableClock clock = new MutableClock("2026-10-07T03:00:30Z");
        PushSubscriptionService service = new PushSubscriptionService(dao, sender, clock);
        service.subscribe(11, input(ENDPOINT), new Request(11).session);
        var scheduler = new MedicationPushScheduler(schedules(Map.of("2026-10-07", List.of(schedule(11, "12:00"))), new ArrayList<>()), dao, sender, service, clock);
        scheduler.tick();
        check(sender.count == 0, "발송 대기 중 기기 소유 계정이 바뀌면 이전 계정 알림 차단");
    }
    private static void logoutRace() throws Exception {
        var inserting = new java.util.concurrent.CountDownLatch(1);
        var release = new java.util.concurrent.CountDownLatch(1);
        MemoryDao dao = new MemoryDao() {
            @Override public void insert(PushSubscription subscription) {
                inserting.countDown();
                try {
                    if (!release.await(3, java.util.concurrent.TimeUnit.SECONDS)) throw new AssertionError("등록 잠금 테스트 시간 초과");
                } catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); throw new AssertionError(interrupted); }
                super.insert(subscription);
            }
        };
        PushSubscriptionService service = new PushSubscriptionService(dao, new Sender());
        Request request = new Request(11);
        var threads = java.util.concurrent.Executors.newFixedThreadPool(2);
        try {
            var registration = threads.submit(() -> service.subscribe(11, input(ENDPOINT), request.session));
            if (!inserting.await(3, java.util.concurrent.TimeUnit.SECONDS)) throw new AssertionError("등록 요청 시작 실패");
            var logout = threads.submit(() -> service.removeForSession(request.request));
            release.countDown();
            registration.get(3, java.util.concurrent.TimeUnit.SECONDS); logout.get(3, java.util.concurrent.TimeUnit.SECONDS);
            check(dao.devices.isEmpty(), "등록과 로그아웃이 동시에 진행돼도 구독이 남지 않음");
            status(401, () -> service.subscribe(11, input(ENDPOINT), request.session), "로그아웃 중 닫힌 세션에는 재등록 금지");
        } finally { release.countDown(); threads.shutdownNow(); }
    }
}
