/**
 * 역할: 의약품 허가정보와 표준 성분 인덱스 DB 작업 계약
 * 갱신 기준: 실제 값이 달라진 경우에만 MERGE UPDATE와 updated_at 변경
 */
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
