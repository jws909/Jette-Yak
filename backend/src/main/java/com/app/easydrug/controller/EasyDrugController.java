/**
 * 파일 역할: 식약처 e약은요 데이터를 시험 또는 전체 동기화하는 관리용 API입니다.
 * 핵심 규칙: 대량 동기화는 외부 API와 DB 부하가 있으므로 일반 사용자 화면에서 직접 호출하지 않습니다.
 */
package com.app.easydrug.controller;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import com.app.easydrug.service.EasyDrugService;
@RestController
public class EasyDrugController {
    private final EasyDrugService medicationService;
    public EasyDrugController(EasyDrugService medicationService) { this.medicationService = medicationService; }
    @PostMapping("/medications/easy-sync-test")
    public String syncEasyMedicationTest() {

		int count = medicationService.syncEasyMedicationTest();

		return count + "건 e약은요 테스트 처리 완료";
	}

    @PostMapping("/medications/easy-sync-all")
    public String syncEasyMedicationAll() {

		int count = medicationService.syncEasyMedicationAll();

		return count + "건 e약은요 전체 동기화 완료";
	}
}
