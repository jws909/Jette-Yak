import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Base64;
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
import com.app.push.PushDao;
import com.app.push.PushSafety;
import com.app.push.PushSubscription;

/** 실제 Oracle과 MyBatis SQL 검증. 임시 구독·전송 행은 전체 롤백, 푸시는 전송하지 않음 */
public class PushDatabaseCheck {
    private static int assertions;
    public static void main(String[] args) throws Exception {
        Path backend = Path.of("backend");
        Properties settings = new Properties();
        try (var reader = Files.newBufferedReader(backend.resolve("src/main/resources/config/db.properties"))) { settings.load(reader); }
        DriverManagerDataSource source = new DriverManagerDataSource(settings.getProperty("jdbc.url"),
            settings.getProperty("jdbc.username"), settings.getProperty("jdbc.password"));
        Configuration configuration = new Configuration(new Environment("push-check", new SpringManagedTransactionFactory(), source));
        Path mapper = backend.resolve("src/main/webapp/WEB-INF/mybatis/mapper/push_mapper.xml");
        try (InputStream stream = Files.newInputStream(mapper)) {
            new XMLMapperBuilder(stream, configuration, mapper.toString(), configuration.getSqlFragments()).parse();
        }
        SqlSessionTemplate session = new SqlSessionTemplate(new SqlSessionFactoryBuilder().build(configuration));
        PushDao dao = new PushDao(session);
        JdbcTemplate jdbc = new JdbcTemplate(source);
        check(dao.schemaReady(), "schema available");
        Long owner = jdbc.queryForObject("SELECT MIN(user_id) FROM users", Long.class);
        if (owner == null) throw new IllegalStateException("Existing user required for FK check");
        int before = jdbc.queryForObject("SELECT COUNT(*) FROM user_push_subscriptions", Integer.class);
        TransactionTemplate transaction = new TransactionTemplate(new DataSourceTransactionManager(source));
        transaction.execute(status -> {
            status.setRollbackOnly();
            String endpoint = "https://fcm.googleapis.com/fcm/send/local-check-" + UUID.randomUUID();
            PushSubscription device = new PushSubscription();
            device.setEndpoint(endpoint); device.setEndpointHash(PushSafety.hash(endpoint)); device.setUserId(owner);
            device.setPublicKey(Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[65]));
            device.setAuthSecret(Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[16]));
            dao.insert(device);
            PushSubscription stored = dao.find(device.getEndpointHash());
            check(stored != null && stored.getUserId().equals(owner), "subscription persisted and mapped");
            check(dao.removeOwned(-1, device.getEndpointHash()) == 0, "other user cannot remove subscription");
            device.setUserId(-1L);
            check(dao.updateOwned(device) == 0, "other user cannot change keys");
            device.setUserId(owner);
            check(dao.updateOwned(device) == 1, "owner can update keys");
            Instant now = Instant.parse("2026-10-07T00:00:00Z");
            long id = stored.getSubscriptionId();
            String first = dao.claim(id, "2026-10-07", "09:00", "DUE", now);
            check(first != null, "first delivery claimed");
            check(dao.claim(id, "2026-10-07", "09:00", "DUE", now) == null, "live lease prevents duplicate");
            dao.finish(id, "2026-10-07", "09:00", "DUE", "wrong-token", true, false, now);
            check(dao.claim(id, "2026-10-07", "09:00", "DUE", now.plusSeconds(1)) == null, "wrong token cannot finish claim");
            dao.finish(id, "2026-10-07", "09:00", "DUE", first, true, false, now);
            check(dao.claim(id, "2026-10-07", "09:00", "DUE", now.plusSeconds(100)) == null, "sent delivery remains deduplicated");
            String retry = dao.claim(id, "2026-10-07", "09:30", "PRE", now);
            dao.finish(id, "2026-10-07", "09:30", "PRE", retry, false, true, now);
            check(dao.claim(id, "2026-10-07", "09:30", "PRE", now.plusSeconds(29)) == null, "retry waits 30 seconds");
            String second = dao.claim(id, "2026-10-07", "09:30", "PRE", now.plusSeconds(30));
            check(second != null, "retry available after backoff");
            dao.finish(id, "2026-10-07", "09:30", "PRE", second, false, true, now.plusSeconds(30));
            String third = dao.claim(id, "2026-10-07", "09:30", "PRE", now.plusSeconds(60));
            check(third != null, "third attempt allowed");
            dao.finish(id, "2026-10-07", "09:30", "PRE", third, false, true, now.plusSeconds(60));
            check(dao.claim(id, "2026-10-07", "09:30", "PRE", now.plusSeconds(90)) == null, "retry stops after three attempts");
            check(dao.claim(id, "2026-10-07", "10:00", "DUE", now) != null, "new reminder independent");
            check(dao.claim(id, "2026-10-07", "10:00", "DUE", now.plusSeconds(46)) != null, "expired lease recovered");
            check(dao.activeSubscriptions() != null, "enabled user query works for actual column type");
            dao.userEnabled(owner);
            check(dao.removeOwned(owner, device.getEndpointHash()) == 1, "owner can remove own device");
            int remaining = jdbc.queryForObject("SELECT COUNT(*) FROM push_deliveries WHERE subscription_id=?", Integer.class, id);
            check(remaining == 0, "device removal cascades to delivery records");
            return null;
        });
        check(jdbc.queryForObject("SELECT COUNT(*) FROM user_push_subscriptions", Integer.class) == before, "temporary rows rolled back");
        System.out.println("PushDatabaseCheck: " + assertions + " checks passed; no notifications sent; all temporary rows rolled back.");
    }
    private static void check(boolean condition, String label) {
        if (!condition) throw new AssertionError(label);
        assertions++;
    }
}
