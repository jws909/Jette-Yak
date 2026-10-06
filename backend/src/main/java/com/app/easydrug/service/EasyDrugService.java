/**
 * 역할: e약은요 시험·전체 동기화 서비스 계약
 * 구현 범위: 페이지 순회, API 오류 확인, 변경 행 갱신
 */
package com.app.easydrug.service;

public interface EasyDrugService {
    int syncEasyMedicationTest();
    int syncEasyMedicationAll();
}
