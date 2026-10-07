import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.Properties;
import java.util.UUID;

/** 실제 Oracle에서 정규화 중복·검증 별칭·재실행 검증. 임시 제품만 생성하고 항상 롤백 */
public class IngredientIndexDatabaseCheck {
    private static int checks;

    public static void main(String[] args) throws Exception {
        Properties settings = new Properties();
        try (var reader = Files.newBufferedReader(Path.of("backend/src/main/resources/config/db.properties"))) {
            settings.load(reader);
        }
        String sql = Files.readString(Path.of("backend/src/main/resources/db/20261007_ingredient_index_backfill.sql"));
        sql = sql.substring(sql.indexOf("MERGE INTO")).strip().replaceFirst(";\\s*$", "");
        String token = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        String product = "QA_ING_" + token;
        String raw = "QA-" + token;
        String normalized = "qa" + token;
        String unknown = normalized + "unknown";
        try (Connection connection = DriverManager.getConnection(settings.getProperty("jdbc.url"),
                settings.getProperty("jdbc.username"), settings.getProperty("jdbc.password"))) {
            connection.setAutoCommit(false);
            long before = number(connection, "SELECT COUNT(*) FROM medication_ingredients");
            try {
                long ingredient = number(connection, "SELECT MIN(ingredient_id) FROM ingredient_master");
                if (ingredient <= 0) throw new IllegalStateException("Ingredient master migration required");
                update(connection, "INSERT INTO medications(medication_id,item_name,material_name,is_discontinued,updated_at) VALUES(?,?,?,0,SYSDATE)",
                    product, "QA ingredient rollback fixture", raw + "/QA " + token + "/" + raw + " / ;" + unknown + "/" + raw + " Hydrate");
                update(connection, "INSERT INTO ingredient_aliases(normalized_alias,ingredient_id,alias_name,source,verified) VALUES(?,?,?,'MANUAL',1)", normalized, ingredient, raw);
                update(connection, "INSERT INTO ingredient_aliases(normalized_alias,ingredient_id,alias_name,source,verified) VALUES(?,?,?,'MANUAL',0)", unknown, ingredient, unknown);
                String scoped = sql.replace("WHERE m.material_name IS NOT NULL", "WHERE m.material_name IS NOT NULL AND m.medication_id='" + product + "'");
                check(execute(connection, scoped) == 3, "punctuation/space variants collapse to one product ingredient");
                check(number(connection, "SELECT COUNT(*) FROM medication_ingredients WHERE medication_id='" + product + "'") == 3, "empty segments excluded and hydrate kept separate");
                check(number(connection, "SELECT COUNT(*) FROM medication_ingredients WHERE medication_id='" + product + "' AND ingredient_id=" + ingredient + " AND match_status='ALIAS'") == 1, "verified manual alias linked with provenance");
                check(number(connection, "SELECT COUNT(*) FROM medication_ingredients WHERE medication_id='" + product + "' AND ingredient_id IS NULL AND match_status='UNMATCHED'") == 2, "unverified and hydrate names not automatically merged");
                check(execute(connection, scoped) == 0, "unchanged rerun updates no rows");
                update(connection, "UPDATE ingredient_aliases SET verified=1 WHERE normalized_alias=?", unknown);
                check(execute(connection, scoped) == 1, "newly verified alias refreshes existing product mapping");
                check(number(connection, "SELECT COUNT(*) FROM ingredient_aliases WHERE normalized_alias IN ('" + normalized + "','" + unknown + "') AND source='MANUAL'") == 2, "backfill preserves alias dictionary and manual provenance");
                connection.rollback();
                check(number(connection, "SELECT COUNT(*) FROM medication_ingredients") == before, "public mappings unchanged after rollback");
                check(number(connection, "SELECT COUNT(*) FROM medications WHERE medication_id='" + product + "'") == 0, "temporary product rolled back");
                check(number(connection, "SELECT COUNT(*) FROM ingredient_aliases WHERE normalized_alias IN ('" + normalized + "','" + unknown + "')") == 0, "temporary aliases rolled back");
            } finally {
                connection.rollback();
            }
        } catch (SQLException failed) {
            // SQL 예외 원문은 연결 정보나 데이터가 포함될 수 있어 Oracle 코드만 출력
            throw new IllegalStateException("Ingredient regression failed: Oracle " + failed.getErrorCode());
        }
        System.out.println("TOTAL " + checks);
    }

    private static int execute(Connection connection, String sql) throws SQLException {
        try (var statement = connection.createStatement()) {
            statement.setQueryTimeout(60);
            return statement.executeUpdate(sql);
        }
    }

    private static int update(Connection connection, String sql, Object... values) throws SQLException {
        try (var statement = connection.prepareStatement(sql)) {
            statement.setQueryTimeout(30);
            for (int index = 0; index < values.length; index++) statement.setObject(index + 1, values[index]);
            return statement.executeUpdate();
        }
    }

    private static long number(Connection connection, String sql) throws SQLException {
        try (var statement = connection.createStatement()) {
            statement.setQueryTimeout(60);
            try (var rows = statement.executeQuery(sql)) { rows.next(); return rows.getLong(1); }
        }
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
        checks++;
        System.out.println("PASS " + message);
    }
}
