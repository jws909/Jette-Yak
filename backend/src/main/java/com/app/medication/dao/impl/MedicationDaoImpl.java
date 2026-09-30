/**
 * 파일 역할: MedicationDao를 medication_mapper.xml의 MyBatis 구문과 연결합니다.
 * 핵심 규칙: SqlSession 반환값은 실제 INSERT 또는 변경 UPDATE가 수행된 행 수입니다.
 */
package com.app.medication.dao.impl;
import java.util.Map;
import org.apache.ibatis.session.SqlSession;
import org.springframework.stereotype.Repository;
import com.app.medication.dao.MedicationDao;
import com.app.medication.dto.MedicationPermitDto;
@Repository
public class MedicationDaoImpl implements MedicationDao {
    private static final String NAMESPACE = "com.app.medication.dao.MedicationDao.";
    private final SqlSession sqlSession;
    public MedicationDaoImpl(SqlSession sqlSession) { this.sqlSession = sqlSession; }
    @Override
    public int mergePermitMedication(MedicationPermitDto medication) {

		/*
		 * 실행되는 XML:
		 *
		 * namespace:
		 * com.app.medication.dao.MedicationDao
		 *
		 * id:
		 * mergePermitMedication
		 */

		String statement = "com.app.medication.dao.MedicationDao.mergePermitMedication";

		System.out.println("찾는 SQL : " + statement);

		System.out.println("Mapper 등록 여부 : " + sqlSession.getConfiguration().hasStatement(statement));

		return sqlSession.update(NAMESPACE + "mergePermitMedication", medication);
	}

    @Override
    public int countMedications() {

		/*
		 * XML:
		 *
		 * <select id="countMedications">
		 */
		return sqlSession.selectOne(NAMESPACE + "countMedications");
	}
    @Override public Long findIngredientIdByAlias(String value) { return sqlSession.selectOne(NAMESPACE+"findIngredientIdByAlias", value); }
    @Override public Long nextIngredientId() { return sqlSession.selectOne(NAMESPACE+"nextIngredientId"); }
    @Override public int insertIngredientMaster(Map<String,Object> values) { return sqlSession.insert(NAMESPACE+"insertIngredientMaster", values); }
    @Override public int insertIngredientAlias(Map<String,Object> values) { return sqlSession.insert(NAMESPACE+"insertIngredientAlias", values); }
    @Override public int deleteMedicationIngredients(String medicationId) { return sqlSession.delete(NAMESPACE+"deleteMedicationIngredients", medicationId); }
    @Override public int insertMedicationIngredient(Map<String,Object> values) { return sqlSession.insert(NAMESPACE+"insertMedicationIngredient", values); }
}
