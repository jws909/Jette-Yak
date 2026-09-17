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
