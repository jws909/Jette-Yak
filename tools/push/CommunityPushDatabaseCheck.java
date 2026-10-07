import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.List;
import java.util.Properties;
import java.util.UUID;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.session.Configuration;
import org.apache.ibatis.session.SqlSessionFactoryBuilder;
import org.mybatis.spring.SqlSessionTemplate;
import org.mybatis.spring.transaction.SpringManagedTransactionFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import com.app.push.CommunityPushDao;
import com.app.push.CommunityPushDelivery;
import com.app.push.PushDao;
import com.app.push.PushSafety;
import com.app.push.PushSubscription;

/** 실제 Oracle 회귀 검증. 미래 시각의 임시 행만 생성해 기존 알림과 분리, 외부 전송 없이 전부 롤백 */
public class CommunityPushDatabaseCheck {
    private static int assertions;
    private static final Instant NOW = Instant.parse("2099-01-01T00:10:00Z");
    private static final Instant CUTOFF = NOW.minusSeconds(600);

    public static void main(String[] args) throws Exception {
        Path backend = Path.of("backend");
        Properties settings = new Properties();
        try (var reader = Files.newBufferedReader(backend.resolve("src/main/resources/config/db.properties"))) { settings.load(reader); }
        DriverManagerDataSource source = new DriverManagerDataSource(settings.getProperty("jdbc.url"),
            settings.getProperty("jdbc.username"), settings.getProperty("jdbc.password"));
        Configuration configuration = new Configuration(new Environment("community-push-check", new SpringManagedTransactionFactory(), source));
        for (String file : List.of("push_mapper.xml", "community_push_mapper.xml")) {
            Path mapper = backend.resolve("src/main/webapp/WEB-INF/mybatis/mapper/" + file);
            try (InputStream stream = Files.newInputStream(mapper)) {
                new XMLMapperBuilder(stream, configuration, mapper.toString(), configuration.getSqlFragments()).parse();
            }
        }
        SqlSessionTemplate session = new SqlSessionTemplate(new SqlSessionFactoryBuilder().build(configuration));
        PushDao devices = new PushDao(session);
        CommunityPushDao queue = new CommunityPushDao(session);
        JdbcTemplate jdbc = new JdbcTemplate(source);
        check(queue.schemaReady(), "community queue schema available");
        Long owner = jdbc.queryForObject("SELECT user_id FROM users WHERE push_enabled IS NULL OR UPPER(TRIM(CAST(push_enabled AS VARCHAR2(10)))) IN ('1','Y','TRUE') ORDER BY CASE WHEN UPPER(TRIM(CAST(is_admin AS VARCHAR2(10)))) IN ('1','Y','YES','TRUE','ADMIN') THEN 0 ELSE 1 END,user_id FETCH FIRST 1 ROW ONLY", Long.class);
        if (owner == null) throw new IllegalStateException("An existing enabled account is required; no user settings were changed");
        String marker = "QA community push rollback " + UUID.randomUUID();
        String endpoint = "https://fcm.googleapis.com/fcm/send/local-community-check-" + UUID.randomUUID();
        TransactionTemplate transaction = new TransactionTemplate(new DataSourceTransactionManager(source));
        transaction.execute(status -> {
            status.setRollbackOnly();
            PushSubscription input = new PushSubscription();
            input.setEndpoint(endpoint); input.setEndpointHash(PushSafety.hash(endpoint)); input.setUserId(owner);
            input.setPublicKey(Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[65]));
            input.setAuthSecret(Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[16]));
            devices.insert(input);
            PushSubscription device = devices.find(input.getEndpointHash());
            // 예전 구독 created_at이 한국 시각으로 +9시간 저장돼 있어도 새 커뮤니티 시작 기준으로 조회되는지 확인
            jdbc.update("UPDATE user_push_subscriptions SET created_at=?,community_started_at=? WHERE subscription_id=?", utc(NOW.plusSeconds(9 * 3600)), utc(NOW.minusSeconds(60)), device.getSubscriptionId());
            long firstId = notification(jdbc, owner, marker, "POST_COMMENT", NOW, null, false);
            for (String type : List.of("COMMENT_REPLY", "POST_HELPFUL", "COMMENT_HELPFUL", "ADMIN_REPORT", "INFO_REVIEW", "REPORT_RESULT")) {
                notification(jdbc, owner, marker, type, NOW, null, false);
            }
            notification(jdbc, owner, marker, "POST_COMMENT", NOW.minusSeconds(601), null, false);
            notification(jdbc, owner, marker, "POST_COMMENT", NOW.minusSeconds(61), null, false);
            notification(jdbc, owner, marker, "POST_COMMENT", NOW, null, true);
            notification(jdbc, owner, marker, "POST_COMMENT", NOW, owner, false);
            notification(jdbc, owner, marker, "OTHER_EVENT", NOW, null, false);

            // 다른 DB 연결에서 커밋 전 행은 보이지 않으므로 주기 발송기가 롤백될 이벤트를 보내지 않음
            try (var separate = source.getConnection(); var query = separate.prepareStatement("SELECT COUNT(*) FROM user_notifications WHERE notification_id=?")) {
                query.setLong(1, firstId);
                try (var row = query.executeQuery()) { row.next(); check(row.getInt(1) == 0, "uncommitted events invisible to dispatcher connection"); }
            } catch (Exception failed) { throw new IllegalStateException("transaction isolation verification failed", failed); }
            queue.enqueue(NOW, CUTOFF);
            List<CommunityPushDelivery> pending = queue.pending(NOW, CUTOFF).stream()
                .filter(row -> device.getSubscriptionId().equals(row.getSubscriptionId())).toList();
            String adminFlag = jdbc.queryForObject("SELECT CAST(is_admin AS VARCHAR2(10)) FROM users WHERE user_id=?", String.class, owner);
            boolean isAdmin = adminFlag != null && List.of("1", "Y", "YES", "TRUE", "ADMIN").contains(adminFlag.trim().toUpperCase(java.util.Locale.ROOT));
            int expected = isAdmin ? 7 : 6;
            check(pending.size() == expected, "supported types only; old, before-subscription, read, self, unknown and non-admin excluded");
            check(!pending.isEmpty(), "legacy subscription wall time plus nine hours does not suppress new community events");
            queue.enqueue(NOW, CUTOFF);
            check(jdbc.queryForObject("SELECT COUNT(*) FROM community_push_deliveries WHERE subscription_id=?", Integer.class, device.getSubscriptionId()) == expected, "enqueue remains idempotent");
            CommunityPushDelivery first = pending.stream().filter(row -> row.getNotificationId() == firstId).findFirst().orElseThrow();
            check(owner.equals(first.getUserId()) && endpoint.equals(first.getEndpoint()), "queue maps only recipient's device");
            check(queue.eligible(first, NOW, CUTOFF), "recipient and device remain eligible");
            // 값 변경은 이 롤백 전용 트랜잭션 안에서만 보임. 다른 요청·발송기에는 기존 설정 유지
            String pushFlag = jdbc.queryForObject("SELECT CAST(push_enabled AS VARCHAR2(10)) FROM users WHERE user_id=?", String.class, owner);
            jdbc.update("UPDATE users SET push_enabled=0 WHERE user_id=?", owner);
            check(!queue.eligible(first, NOW, CUTOFF), "global notification off blocks queued delivery");
            jdbc.update("UPDATE users SET push_enabled=? WHERE user_id=?", pushFlag, owner);
            if (isAdmin) {
                CommunityPushDelivery admin = pending.stream().filter(row -> "ADMIN_REPORT".equals(row.getNotificationType())).findFirst().orElseThrow();
                jdbc.update("UPDATE users SET is_admin=0 WHERE user_id=?", owner);
                check(!queue.eligible(admin, NOW, CUTOFF), "revoked administrator cannot receive queued report notification");
                check(queue.eligible(first, NOW, CUTOFF), "revoking admin does not suppress ordinary community notifications");
                jdbc.update("UPDATE users SET is_admin=? WHERE user_id=?", adminFlag, owner);
            }
            first.setUserId(-1L);
            check(!queue.eligible(first, NOW, CUTOFF), "other user cannot claim recipient notification");
            first.setUserId(owner);
            String token = queue.claim(first, NOW, CUTOFF);
            check(token != null, "initial delivery lease obtained");
            check(queue.claim(first, NOW, CUTOFF) == null, "active lease prevents concurrent dispatch");
            queue.finish(first, "wrong-token", true, false, NOW);
            check(queue.claim(first, NOW.plusSeconds(1), CUTOFF) == null, "wrong claim token cannot complete lease");
            queue.finish(first, token, true, false, NOW);
            check(queue.claim(first, NOW.plusSeconds(46), CUTOFF) == null, "sent event never claimed again");

            CommunityPushDelivery retry = pending.stream().filter(row -> row.getNotificationId() != firstId).findFirst().orElseThrow();
            String attempt = queue.claim(retry, NOW, CUTOFF);
            queue.finish(retry, attempt, false, true, NOW);
            check(queue.claim(retry, NOW.plusSeconds(29), CUTOFF) == null, "retry backoff enforced in Oracle");
            attempt = queue.claim(retry, NOW.plusSeconds(30), CUTOFF);
            check(attempt != null, "second attempt allowed after 30 seconds");
            queue.finish(retry, attempt, false, true, NOW.plusSeconds(30));
            attempt = queue.claim(retry, NOW.plusSeconds(60), CUTOFF);
            check(attempt != null, "third attempt allowed");
            queue.finish(retry, attempt, false, true, NOW.plusSeconds(60));
            check(queue.claim(retry, NOW.plusSeconds(90), CUTOFF) == null, "fourth attempt blocked in Oracle");
            check("FAILED".equals(jdbc.queryForObject("SELECT status FROM community_push_deliveries WHERE notification_id=? AND subscription_id=?", String.class, retry.getNotificationId(), retry.getSubscriptionId())), "exhausted retry stored as final failure");
            CommunityPushDelivery leased = pending.stream().filter(row -> !row.getNotificationId().equals(first.getNotificationId()) && !row.getNotificationId().equals(retry.getNotificationId())).findFirst().orElseThrow();
            check(queue.claim(leased, NOW, CUTOFF) != null, "separate notification has independent lease");
            check(queue.claim(leased, NOW.plusSeconds(46), CUTOFF) != null, "abandoned lease recovered after timeout");

            jdbc.update("UPDATE user_notifications SET read_at=CAST(? AS DATE) WHERE notification_id=?", utc(NOW), leased.getNotificationId());
            check(!queue.eligible(leased, NOW, CUTOFF), "read while waiting blocks delivery");
            jdbc.update("UPDATE user_notifications SET read_at=NULL WHERE notification_id=?", leased.getNotificationId());
            check(!queue.eligible(leased, NOW.plusSeconds(601), NOW.plusSeconds(1)), "notification older than ten minutes excluded");
            jdbc.update("DELETE FROM user_notifications WHERE notification_id=?", leased.getNotificationId());
            check(jdbc.queryForObject("SELECT COUNT(*) FROM community_push_deliveries WHERE notification_id=?", Integer.class, leased.getNotificationId()) == 0, "notification deletion cascades to delivery record");
            check(devices.removeOwned(owner, device.getEndpointHash()) == 1, "recipient can unlink temporary device");
            check(jdbc.queryForObject("SELECT COUNT(*) FROM community_push_deliveries WHERE subscription_id=?", Integer.class, device.getSubscriptionId()) == 0, "device deletion cascades to queue");
            // 주입한 미래 시각 외에도 기존 알림과 같은 실제 SYSDATE 저장값을 대조해 JVM 한국 시간대의 +9시간 바인딩 누락 방지
            devices.insert(input);
            PushSubscription currentDevice = devices.find(input.getEndpointHash());
            check(jdbc.queryForObject("SELECT CASE WHEN community_started_at BETWEEN SYS_EXTRACT_UTC(SYSTIMESTAMP)-INTERVAL '1' MINUTE AND SYS_EXTRACT_UTC(SYSTIMESTAMP)+INTERVAL '1' MINUTE THEN 1 ELSE 0 END FROM user_push_subscriptions WHERE subscription_id=?", Integer.class, currentDevice.getSubscriptionId()) == 1, "fresh subscription community start defaults to UTC now");
            jdbc.update("UPDATE user_push_subscriptions SET community_started_at=SYS_EXTRACT_UTC(SYSTIMESTAMP)-INTERVAL '1' MINUTE WHERE subscription_id=?", currentDevice.getSubscriptionId());
            Long realTimeId = jdbc.queryForObject("SELECT user_notifications_seq.NEXTVAL FROM dual", Long.class);
            jdbc.update("INSERT INTO user_notifications(notification_id,user_id,notification_type,title,content,created_at) VALUES(?,?,'POST_COMMENT',?,? ,SYSDATE)", realTimeId, owner, marker, "Uncommitted clock check");
            CommunityPushDelivery current = new CommunityPushDelivery();
            current.setSubscriptionId(currentDevice.getSubscriptionId()); current.setUserId(owner); current.setNotificationId(realTimeId);
            Instant actualNow = Instant.now().plusSeconds(2);
            check(queue.eligible(current, actualNow, actualNow.minusSeconds(600)), "real SYSDATE event eligible regardless of JVM local timezone");
            return null;
        });
        check(jdbc.queryForObject("SELECT COUNT(*) FROM user_notifications WHERE title=?", Integer.class, marker) == 0, "temporary notifications rolled back");
        check(devices.find(PushSafety.hash(endpoint)) == null, "temporary device rolled back");
        System.out.println("CommunityPushDatabaseCheck: " + assertions + " checks passed; no notifications sent; temporary data rolled back.");
    }

    private static long notification(JdbcTemplate jdbc, long userId, String marker, String type, Instant created, Long actor, boolean read) {
        Long id = jdbc.queryForObject("SELECT user_notifications_seq.NEXTVAL FROM dual", Long.class);
        jdbc.update("INSERT INTO user_notifications(notification_id,user_id,actor_id,notification_type,title,content,created_at,read_at) VALUES(?,?,?,?,?,?,CAST(? AS DATE),CAST(? AS DATE))",
            id, userId, actor, type, marker, "No external notification; rollback check", utc(created), read ? utc(created) : null);
        return id;
    }
    private static Timestamp utc(Instant instant) { return Timestamp.valueOf(LocalDateTime.ofInstant(instant, ZoneOffset.UTC)); }
    private static void check(boolean condition, String label) {
        if (!condition) throw new AssertionError(label);
        assertions++;
    }
}
