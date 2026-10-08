import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.Properties;
import java.util.UUID;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.session.Configuration;
import org.apache.ibatis.session.SqlSessionFactoryBuilder;
import org.mybatis.spring.SqlSessionTemplate;
import org.mybatis.spring.transaction.SpringManagedTransactionFactory;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.TransactionTemplate;
import com.app.medication.dao.impl.MedicationDaoImpl;
import com.app.medication.service.IngredientIndexService;

/** 실제 Oracle 저장점 회귀. 신규 품목과 성분 연결을 만들고 부모 트랜잭션까지 모두 롤백 */
public class IngredientIndexTransactionCheck {
    private static int checks;

    public static void main(String[] args) throws Exception {
        Properties settings = new Properties();
        try (var reader = Files.newBufferedReader(Path.of("backend/src/main/resources/config/db.properties"))) { settings.load(reader); }
        var source = new DriverManagerDataSource(settings.getProperty("jdbc.url"), settings.getProperty("jdbc.username"), settings.getProperty("jdbc.password"));
        var configuration = new Configuration(new Environment("ingredient-savepoint-check", new SpringManagedTransactionFactory(), source));
        configuration.setDefaultStatementTimeout(10);
        Path file = Path.of("backend/src/main/webapp/WEB-INF/mybatis/mapper/medication/medication_mapper.xml");
        try (var stream = Files.newInputStream(file)) {
            new XMLMapperBuilder(stream, configuration, file.toString(), configuration.getSqlFragments()).parse();
        }
        var session = new SqlSessionTemplate(new SqlSessionFactoryBuilder().build(configuration));
        var manager = new DataSourceTransactionManager(source);
        var jdbc = new JdbcTemplate(source);
        jdbc.setQueryTimeout(10);
        String product = "QA_TX_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        String ingredient = jdbc.queryForObject("SELECT alias_name FROM ingredient_aliases WHERE normalized_alias='acetaminophen' AND verified=1", String.class);
        var transaction = new TransactionTemplate(manager);
        transaction.setTimeout(30);
        transaction.execute(status -> {
            status.setRollbackOnly();
            jdbc.update("INSERT INTO medications(medication_id,item_name,material_name,is_discontinued,updated_at) VALUES(?,?,?,0,SYSDATE)", product, "QA index transaction rollback fixture", ingredient);
            var index = proxied(new IngredientIndexService(new MedicationDaoImpl(session)), manager);
            check(index.indexMedication(product, ingredient + "/" + ingredient.toUpperCase(java.util.Locale.ROOT)), "new uncommitted product indexed without a separate FK connection");
            check(count(jdbc, product) == 1, "normalized variants indexed once");
            var failing = new MedicationDaoImpl(session) {
                boolean fail = true;
                @Override public int insertMedicationIngredient(Map<String,Object> values) {
                    if (fail) { fail = false; throw new DataIntegrityViolationException("fixture failure after delete"); }
                    return super.insertMedicationIngredient(values);
                }
            };
            var retryable = proxied(new IngredientIndexService(failing), manager);
            check(!retryable.indexMedication(product, ingredient), "single product index failure reported");
            check(count(jdbc, product) == 1, "failed delete-and-rebuild rolled back to nested savepoint");
            check(jdbc.queryForObject("SELECT COUNT(*) FROM medications WHERE medication_id=?", Integer.class, product) == 1, "parent product insert survives nested rollback");
            check(retryable.indexMedication(product, ingredient), "transient error does not disable subsequent indexing");
            return null;
        });
        check(jdbc.queryForObject("SELECT COUNT(*) FROM medications WHERE medication_id=?", Integer.class, product) == 0, "parent fixture rolled back");
        check(count(jdbc, product) == 0, "fixture mappings rolled back");
        System.out.println("TOTAL " + checks);
    }

    private static IngredientIndexService proxied(IngredientIndexService target, DataSourceTransactionManager manager) {
        var factory = new ProxyFactory(target);
        factory.addAdvice(new TransactionInterceptor(manager, new AnnotationTransactionAttributeSource()));
        return (IngredientIndexService) factory.getProxy();
    }

    private static int count(JdbcTemplate jdbc, String product) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM medication_ingredients WHERE medication_id=?", Integer.class, product);
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
        checks++;
        System.out.println("PASS " + message);
    }
}
