package com.app.controller;

import java.lang.reflect.Field;
import java.lang.reflect.Proxy;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.UUID;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpSession;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.datasource.unpooled.UnpooledDataSource;
import org.apache.ibatis.logging.nologging.NoLoggingImpl;
import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.session.Configuration;
import org.apache.ibatis.session.SqlSessionFactoryBuilder;
import org.apache.ibatis.type.JdbcType;
import org.mybatis.spring.SqlSessionTemplate;
import org.mybatis.spring.transaction.SpringManagedTransactionFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DataSourceUtils;
import org.springframework.transaction.support.TransactionTemplate;
import com.app.dao.ScheduleDAO;
import com.app.guide.dao.MedicationGuideDao;
import com.app.mapper.UserMapper;
import com.app.util.UserAccess;

/**
 * 실제 Oracle의 약 등록·목록 조회를 확인하는 선택 실행 검사.
 * --oracle-rollback을 명시한 경우만 실행. 체험 계정의 합성 등록은 항상 롤백.
 * 제품·사용자 원본, 일정, 알림에는 쓰지 않고 AI 학습·푸시 빈도 연결하지 않음.
 */
public class MedicationRegistrationOracleCheck {
    private static int checks;
    private record GuideCache(String content, Timestamp updatedAt) {}

    private static void check(boolean value, String label) {
        if (!value) throw new AssertionError(label);
        checks++;
    }

    private static void field(Object target, String name, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(name);
        field.setAccessible(true);
        field.set(target, value);
    }

    private static HttpServletRequest request(long userId) {
        HttpSession session = (HttpSession) Proxy.newProxyInstance(HttpSession.class.getClassLoader(),
                new Class<?>[] {HttpSession.class}, (proxy, method, args) -> {
                    if (!"getAttribute".equals(method.getName())) throw new AssertionError("Unexpected session operation");
                    if ("userId".equals(args[0])) return userId;
                    if ("authenticated".equals(args[0])) return true;
                    return null;
                });
        return (HttpServletRequest) Proxy.newProxyInstance(HttpServletRequest.class.getClassLoader(),
                new Class<?>[] {HttpServletRequest.class}, (proxy, method, args) -> {
                    if (!"getSession".equals(method.getName())) throw new AssertionError("Unexpected request operation");
                    return session;
                });
    }

    private static int count(JdbcTemplate jdbc, String sql, Object... values) {
        Integer result = jdbc.queryForObject(sql, Integer.class, values);
        return result == null ? 0 : result;
    }

    private static List<GuideCache> cache(JdbcTemplate jdbc, long userId) {
        return jdbc.query("SELECT ai_guide, med_updated_at FROM medication_overall_guide WHERE user_id=?",
                (row, index) -> new GuideCache(row.getString(1), row.getTimestamp(2)), userId);
    }

    private static void success(ResponseEntity<?> response, String label) {
        check(response.getStatusCodeValue() == 200, label + ": HTTP 200");
        check(response.getBody() instanceof Map<?, ?> data && Boolean.TRUE.equals(data.get("success")), label + ": saved result");
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 2 || !"--oracle-rollback".equals(args[1])) {
            System.out.println("SKIP: supply backend path and --oracle-rollback for the optional Oracle check");
            return;
        }
        Path backend = Path.of(args[0]);
        Properties properties = new Properties();
        try (var reader = Files.newBufferedReader(backend.resolve("src/main/resources/config/db.properties"))) {
            properties.load(reader);
        }
        var dataSource = new UnpooledDataSource(properties.getProperty("jdbc.driver"), properties.getProperty("jdbc.url"),
                properties.getProperty("jdbc.username"), properties.getProperty("jdbc.password"));
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        jdbc.setQueryTimeout(20);

        // 롤백 밖으로 쓰기·네트워크 작업을 내보내는 사용자 트리거가 있다면 검사 자체를 중단.
        List<String> triggers = jdbc.query("SELECT trigger_body FROM user_triggers WHERE status='ENABLED' "
                        + "AND table_name IN ('CABINET_MEDICATIONS','ROUTINE_MEDICATIONS','MEDICATION_USE_STATES','MEDICATION_OVERALL_GUIDE')",
                (row, index) -> row.getString(1));
        check(triggers.stream().map(value -> value == null ? "" : value.toUpperCase(java.util.Locale.ROOT))
                .noneMatch(value -> value.contains("AUTONOMOUS_TRANSACTION") || value.contains("NOTIFICATION")
                        || value.contains("UTL_HTTP") || value.contains("DBMS_SCHEDULER")
                        || value.matches("(?s).*\\b(COMMIT|ROLLBACK)\\b.*")), "registration triggers do not escape rollback or send notifications");

        Long userId = jdbc.queryForObject("SELECT user_id FROM users WHERE login_id=?", Long.class, "test12");
        check(userId != null && userId > 0, "dedicated demo account exists");
        String medicationId = jdbc.queryForObject("SELECT medication_id FROM medications m WHERE NOT EXISTS "
                + "(SELECT 1 FROM cabinet_medications c WHERE c.user_id=? AND c.medication_id=m.medication_id) AND ROWNUM=1",
                String.class, userId);
        check(medicationId != null, "unregistered existing product available without changing product data");
        String routineName = "QA_ROLLBACK_" + UUID.randomUUID();
        check(count(jdbc, "SELECT COUNT(*) FROM routine_medications WHERE user_id=? AND supplement_name=?", userId, routineName) == 0,
                "synthetic routine name is unused");
        List<GuideCache> originalCache = cache(jdbc, userId);

        Configuration config = new Configuration(new Environment("oracle-rollback", new SpringManagedTransactionFactory(), dataSource));
        config.setMapUnderscoreToCamelCase(true);
        config.setJdbcTypeForNull(JdbcType.NULL);
        config.setLogImpl(NoLoggingImpl.class);
        for (String name : List.of("user_mapper.xml", "schedule/schedule_mapper.xml", "guide/guide_mapper.xml")) {
            Path mapper = backend.resolve("src/main/webapp/WEB-INF/mybatis/mapper").resolve(name);
            try (var in = Files.newInputStream(mapper)) {
                new XMLMapperBuilder(in, config, mapper.toString(), config.getSqlFragments()).parse();
            }
        }
        SqlSessionTemplate session = new SqlSessionTemplate(new SqlSessionFactoryBuilder().build(config));
        UserMapper users = session.getMapper(UserMapper.class);
        ScheduleDAO schedules = new ScheduleDAO();
        field(schedules, "sqlSession", session);
        MedicationGuideDao guides = new MedicationGuideDao(session);
        UserController controller = new UserController();
        field(controller, "userAccess", new UserAccess(users));
        field(controller, "userMapper", users);
        field(controller, "scheduleDAO", schedules);
        field(controller, "medicationGuideDao", guides);
        HttpServletRequest actor = request(userId);
        long[] ids = new long[2];
        TransactionTemplate transaction = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
        transaction.setTimeout(30);
        Throwable failure = null;
        try {
            transaction.execute(status -> {
                // 첫 SQL 쓰기 전부터 commit 경로 차단. 예외·성공 여부와 관계없이 전체 롤백.
                status.setRollbackOnly();
                try {
                    check(!DataSourceUtils.getConnection(dataSource).getAutoCommit(), "actual DAO connection uses one managed transaction");
                } catch (java.sql.SQLException error) { throw new IllegalStateException("Transaction verification failed", error); }
                success(controller.addEverydayMed(Map.of("userId", userId, "type", "CABINET", "medicationId", medicationId), actor), "Oracle cabinet registration");
                check(count(jdbc, "SELECT COUNT(*) FROM cabinet_medications WHERE user_id=? AND medication_id=?", userId, medicationId) == 1,
                        "cabinet INSERT persisted inside rollback transaction");
                ids[0] = jdbc.queryForObject("SELECT cabinet_id FROM cabinet_medications WHERE user_id=? AND medication_id=?", Long.class, userId, medicationId);
                success(controller.addEverydayMed(Map.of("userId", userId, "type", "ROUTINE", "name", routineName, "notes", "QA rollback only"), actor), "Oracle routine registration");
                check(count(jdbc, "SELECT COUNT(*) FROM routine_medications WHERE user_id=? AND supplement_name=?", userId, routineName) == 1,
                        "routine INSERT persisted inside rollback transaction");
                ids[1] = jdbc.queryForObject("SELECT routine_id FROM routine_medications WHERE user_id=? AND supplement_name=?", Long.class, userId, routineName);
                check(count(jdbc, "SELECT COUNT(*) FROM medication_use_states WHERE user_id=? AND registration_id=? AND use_status='PAUSED'", userId, "R:" + ids[1]) == 1,
                        "routine state saved by actual guide mapper");
                var collection = guides.collection(userId);
                check(collection.stream().anyMatch(value -> ("C:" + ids[0]).equals(value.getRegistrationId()) && "STORED".equals(value.getUseStatus())),
                        "actual collection returns newly registered cabinet product");
                check(collection.stream().anyMatch(value -> ("R:" + ids[1]).equals(value.getRegistrationId()) && routineName.equals(value.getItemName())),
                        "actual collection returns newly registered routine");
                success(controller.addEverydayMed(Map.of("userId", userId, "type", "CABINET", "medicationId", medicationId), actor), "repeat cabinet registration");
                check(count(jdbc, "SELECT COUNT(*) FROM cabinet_medications WHERE user_id=? AND medication_id=?", userId, medicationId) == 1,
                        "repeat cabinet request reuses existing registration");
                success(controller.addEverydayMed(Map.of("userId", userId, "type", "ROUTINE", "name", routineName), actor), "repeat routine registration");
                check(count(jdbc, "SELECT COUNT(*) FROM routine_medications WHERE user_id=? AND supplement_name=?", userId, routineName) == 1,
                        "repeat routine request reuses existing registration");
                check(count(jdbc, "SELECT COUNT(*) FROM schedules WHERE user_id=? AND (cabinet_id=? OR routine_id=?)", userId, ids[0], ids[1]) == 0,
                        "registration creates no schedule or scheduled push");
                return null;
            });
        } catch (RuntimeException | Error error) {
            failure = error;
        } finally {
            // 트랜잭션 종료 후 새 연결로 확인. 합성 행과 가이드 캐시가 실제로 원상 복구됐는지 검사.
            check(count(jdbc, "SELECT COUNT(*) FROM cabinet_medications WHERE user_id=? AND medication_id=?", userId, medicationId) == 0,
                    "cabinet registration fully rolled back");
            check(count(jdbc, "SELECT COUNT(*) FROM routine_medications WHERE user_id=? AND supplement_name=?", userId, routineName) == 0,
                    "routine registration fully rolled back");
            check(count(jdbc, "SELECT COUNT(*) FROM medication_use_states WHERE user_id=? AND registration_id IN (?,?)", userId, "C:" + ids[0], "R:" + ids[1]) == 0,
                    "synthetic registration states fully rolled back");
            check(originalCache.equals(cache(jdbc, userId)), "pre-existing guide cache content and timestamp restored");
        }
        if (failure instanceof Error error) throw error;
        if (failure instanceof RuntimeException error) throw error;
        System.out.println("PASS: Oracle medication registration " + checks + " checks; all synthetic rows rolled back");
    }
}
