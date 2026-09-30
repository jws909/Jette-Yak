/**
 * 파일 역할: EasyDrugDao 호출을 easydrug_mapper.xml의 MyBatis 구문과 연결합니다.
 * 핵심 규칙: 매퍼 namespace 또는 SQL id 변경 시 이 구현체의 식별자도 함께 수정해야 합니다.
 */
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
