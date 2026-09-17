package com.app.medication.dao;
import com.app.medication.dto.MedicationPermitDto;

public interface MedicationDao {
    int mergePermitMedication(MedicationPermitDto medication);
    int countMedications();
}
