package com.app.medication.dao;
import java.util.Map;
import com.app.medication.dto.MedicationPermitDto;

public interface MedicationDao {
    int mergePermitMedication(MedicationPermitDto medication);
    int countMedications();
    Long findIngredientIdByAlias(String normalizedAlias);
    Long nextIngredientId();
    int insertIngredientMaster(Map<String,Object> values);
    int insertIngredientAlias(Map<String,Object> values);
    int deleteMedicationIngredients(String medicationId);
    int insertMedicationIngredient(Map<String,Object> values);
}
