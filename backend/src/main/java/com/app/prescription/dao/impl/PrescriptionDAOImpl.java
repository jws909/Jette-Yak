package com.app.prescription.dao.impl;

import java.util.List;
import org.apache.ibatis.session.SqlSession;
import org.springframework.stereotype.Repository;
import com.app.prescription.dao.PrescriptionDAO;
import com.app.prescription.dto.PrescriptionDTO;
import com.app.prescription.dto.PrescriptionItemDTO;
import com.app.prescription.dto.MatchedMedicationDTO;

@Repository
public class PrescriptionDAOImpl implements PrescriptionDAO {
    private static final String NAMESPACE = "com.app.prescription.dao.PrescriptionDAO.";
    private final SqlSession sqlSession;

    public PrescriptionDAOImpl(SqlSession sqlSession) {
        this.sqlSession = sqlSession;
    }

    @Override
    public int insertPrescription(PrescriptionDTO prescription) {
        return sqlSession.insert(NAMESPACE + "insertPrescription", prescription);
    }

    @Override
    public int insertPrescriptionItem(PrescriptionItemDTO item) {
        return sqlSession.insert(NAMESPACE + "insertPrescriptionItem", item);
    }

    @Override
    public PrescriptionDTO getLatestPrescriptionByUserId(Long userId) {
        return sqlSession.selectOne(NAMESPACE + "getLatestPrescriptionByUserId", userId);
    }

    @Override
    public List<PrescriptionItemDTO> getPrescriptionItemsByPrescriptionId(Long prescriptionId) {
        return sqlSession.selectList(NAMESPACE + "getPrescriptionItemsByPrescriptionId", prescriptionId);
    }

    @Override
    public MatchedMedicationDTO findMedicationByEdiCode(String ediCode) {
        return sqlSession.selectOne(NAMESPACE + "findMedicationByEdiCode", ediCode);
    }

    @Override
    public MatchedMedicationDTO findMedicationByName(String keyword) {
        return sqlSession.selectOne(NAMESPACE + "findMedicationByName", keyword);
    }

    @Override
    public int deletePrescription(Long prescriptionId) {
        return sqlSession.delete(NAMESPACE + "deletePrescription", prescriptionId);
    }
}
