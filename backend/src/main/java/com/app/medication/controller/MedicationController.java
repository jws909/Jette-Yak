/**
 * 파일 역할: 의약품 허가정보 시험·전체 동기화를 실행하는 관리용 API입니다.
 * 핵심 규칙: 외부 API 전체 수집은 오래 걸릴 수 있으므로 호출 결과로 처리 건수를 반환합니다.
 */
package com.app.medication.controller;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import com.app.medication.service.MedicationService;
@RestController
public class MedicationController {
    private final MedicationService medicationService;
    public MedicationController(MedicationService medicationService) { this.medicationService = medicationService; }
    @PostMapping("/medications/permit-sync-test")
    public String syncPermitTest() {

		int count = medicationService.syncPermitTest();

		return count + "건 API 처리 완료";
	}

    @PostMapping("/medications/permit-sync-all")
    public String syncPermitAll() {

		/*
		 * 식약처 의약품 제품 허가정보
		 * 전체 데이터를 DB에 동기화한다.
		 */
		int count = medicationService.syncPermitAll();

		return count + "건 전체 허가정보 동기화 완료";
	}
}
