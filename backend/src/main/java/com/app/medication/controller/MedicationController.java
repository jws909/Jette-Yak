/**
 * 역할: 의약품 허가정보 시험·전체 동기화를 실행하는 관리자 API
 * 권한 기준: 서버 세션의 관리자 여부를 확인한 뒤 장시간 동기화 시작
 */
package com.app.medication.controller;
import java.util.Map;
import javax.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import com.app.medication.service.MedicationService;
import com.app.util.AdminSession;
@RestController
public class MedicationController {
    private final MedicationService medicationService;
    public MedicationController(MedicationService medicationService) { this.medicationService = medicationService; }
    @PostMapping({"/api/admin/data/permit/test", "/medications/permit-sync-test"})
    public ResponseEntity<Map<String,Object>> syncPermitTest(HttpServletRequest request) {
        if (!isAdmin(request)) return forbidden();
        int count = medicationService.syncPermitTest();
        return ResponseEntity.ok(Map.of("count", count, "message", count + "건 허가정보 테스트 동기화를 완료했습니다."));
    }

    @PostMapping({"/api/admin/data/permit/all", "/medications/permit-sync-all"})
    public ResponseEntity<Map<String,Object>> syncPermitAll(HttpServletRequest request) {
        if (!isAdmin(request)) return forbidden();

		/*
		 * 식약처 의약품 제품 허가정보
		 * 전체 데이터를 DB에 동기화한다.
		 */
		int count = medicationService.syncPermitAll();

		return ResponseEntity.ok(Map.of("count", count, "message", count + "건 전체 허가정보 동기화를 완료했습니다."));
	}

    private static boolean isAdmin(HttpServletRequest request) {
        return AdminSession.isAdmin(request);
    }
    private static ResponseEntity<Map<String,Object>> forbidden() {
        return ResponseEntity.status(403).body(Map.of("message","관리자만 의약품 데이터를 동기화할 수 있습니다."));
    }
}
