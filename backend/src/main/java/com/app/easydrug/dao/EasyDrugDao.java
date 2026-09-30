/**
 * 파일 역할: e약은요의 효능·용법·이미지를 기존 의약품 행에 보강하는 DAO 계약입니다.
 * 핵심 규칙: 품목기준코드가 이미 존재하는 허가정보 행만 갱신합니다.
 */
package com.app.easydrug.dao;
import com.app.easydrug.dto.MedicationEasyDto;

public interface EasyDrugDao {
    int updateEasyMedication(MedicationEasyDto medication);
}
