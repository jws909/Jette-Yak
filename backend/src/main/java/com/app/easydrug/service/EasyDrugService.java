/**
 * 파일 역할: e약은요 시험 동기화와 전체 동기화 기능을 정의하는 서비스 계약입니다.
 * 핵심 규칙: 구현체는 페이지 순회, API 오류 확인, 변경된 행 갱신을 담당합니다.
 */
package com.app.easydrug.service;

public interface EasyDrugService {
    int syncEasyMedicationTest();
    int syncEasyMedicationAll();
}
