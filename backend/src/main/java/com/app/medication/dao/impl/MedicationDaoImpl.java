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
}
