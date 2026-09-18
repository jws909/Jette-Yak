package com.app.prescription.dao;

import java.util.List;
import com.app.prescription.dto.PrescriptionDTO;
import com.app.prescription.dto.PrescriptionItemDTO;
import com.app.prescription.dto.MatchedMedicationDTO;

public interface PrescriptionDAO {
    int insertPrescription(PrescriptionDTO prescription);
    int insertPrescriptionItem(PrescriptionItemDTO item);
    PrescriptionDTO getLatestPrescriptionByUserId(Long userId);
    List<PrescriptionItemDTO> getPrescriptionItemsByPrescriptionId(Long prescriptionId);
    MatchedMedicationDTO findMedicationByEdiCode(String ediCode);
    MatchedMedicationDTO findMedicationByName(String keyword);
}
