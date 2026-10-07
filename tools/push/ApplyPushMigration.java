import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Properties;

/**
 * 저장소 루트에서 실행하는 푸시 전용 DB 준비 도구
 * 기존 사용자·복약 데이터는 변경하지 않고 새 구독·발송 기록 객체만 생성
 */
public class ApplyPushMigration {
    public static void main(String[] args) throws Exception {
        Path backend = Path.of("backend");
        Properties settings = new Properties();
        try (var reader = Files.newBufferedReader(backend.resolve("src/main/resources/config/db.properties"), StandardCharsets.UTF_8)) {
            settings.load(reader);
        }
        String migration = Files.readString(backend.resolve("src/main/resources/db/20261007_web_push.sql"), StandardCharsets.UTF_8);
        try (Connection connection = DriverManager.getConnection(settings.getProperty("jdbc.url"),
                settings.getProperty("jdbc.username"), settings.getProperty("jdbc.password"));
                Statement statement = connection.createStatement()) {
            connection.setAutoCommit(false);
            statement.setQueryTimeout(30);
            for (String part : migration.split("(?m)^/\\s*$")) {
                String sql = part.trim();
                if (sql.isEmpty()) continue;
                if (sql.equals("COMMIT;")) connection.commit();
                else statement.execute(sql);
            }
            try (var rows = statement.executeQuery("SELECT table_name FROM user_tables WHERE table_name IN ('USER_PUSH_SUBSCRIPTIONS','PUSH_DELIVERIES') ORDER BY table_name")) {
                int count = 0;
                while (rows.next()) { System.out.println("준비 완료: " + rows.getString(1)); count++; }
                if (count != 2) throw new IllegalStateException("푸시 테이블 생성 결과 확인 필요");
            }
        } catch (SQLException error) {
            // 연결 문자열·계정·구독 키를 출력하지 않음
            System.err.println("푸시 DB 준비 실패: Oracle 오류 코드 " + error.getErrorCode());
            System.exit(1);
        }
    }
}
