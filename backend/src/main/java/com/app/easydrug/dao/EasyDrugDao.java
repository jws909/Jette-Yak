/**
 * 역할: e약은요 효능·용법·이미지를 기존 의약품 행에 보강하는 DAO 계약
 * 연결 기준: 허가정보로 먼저 저장된 품목기준코드 행만 갱신
 */
package com.app.easydrug.dao;
import com.app.easydrug.dto.MedicationEasyDto;

public interface EasyDrugDao {
    int updateEasyMedication(MedicationEasyDto medication);
}
