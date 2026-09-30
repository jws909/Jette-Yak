/**
 * 파일 역할: 의약품 허가정보 시험·전체 동기화 기능을 정의하는 서비스 계약입니다.
 * 핵심 규칙: 구현체는 외부 API 페이지 처리와 DAO MERGE 호출을 담당합니다.
 */
package com.app.medication.service;

public interface MedicationService {
    int syncPermitTest();
    int syncPermitAll();
}
