/**
 * 파일 역할: 의약품 허가정보를 품목기준코드 기준으로 저장·갱신하는 DAO 계약입니다.
 * 핵심 규칙: 동일 값이면 updated_at을 바꾸지 않는 MERGE 정책은 매퍼 SQL에 구현되어 있습니다.
 */
package com.app.medication.dao;
import com.app.medication.dto.MedicationPermitDto;

public interface MedicationDao {
    int mergePermitMedication(MedicationPermitDto medication);
    int countMedications();
}
