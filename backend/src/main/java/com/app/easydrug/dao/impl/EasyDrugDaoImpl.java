package com.app.easydrug.dao.impl;
import java.util.Map;
import org.apache.ibatis.session.SqlSession;
import org.springframework.stereotype.Repository;
import com.app.easydrug.dao.EasyDrugDao;
import com.app.easydrug.dto.MedicationEasyDto;
@Repository
public class EasyDrugDaoImpl implements EasyDrugDao {
    private static final String NAMESPACE = "com.app.easydrug.dao.EasyDrugDao.";
    private final SqlSession sqlSession;
    public EasyDrugDaoImpl(SqlSession sqlSession) { this.sqlSession = sqlSession; }
    @Override
    public int updateEasyMedication(MedicationEasyDto medication) {

		/*
		 * medication_mapper.xml
		 *
		 * namespace:
		 * com.app.easydrug.dao.EasyDrugDao
		 *
		 * id:
		 * updateEasyMedication
		 */
		return sqlSession.update(NAMESPACE + "updateEasyMedication", medication);
	}
}
