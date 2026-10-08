/**
 * 역할: 의약품 허가정보 시험·전체 동기화 서비스 계약
 * 구현 범위: 외부 API 페이지 순회, 응답 검증, DAO MERGE 호출
 */
package com.app.medication.service;

public interface MedicationService {
    int syncPermitTest();
    int syncPermitAll();
}
