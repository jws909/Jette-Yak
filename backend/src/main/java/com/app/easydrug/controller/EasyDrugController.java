/**
 * 파일 역할: 식약처 e약은요 데이터를 시험 또는 전체 동기화하는 관리용 API입니다.
 * 핵심 규칙: 대량 동기화는 외부 API와 DB 부하가 있으므로 일반 사용자 화면에서 직접 호출하지 않습니다.
 */
package com.app.easydrug.controller;
import java.util.Map;
import javax.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import com.app.easydrug.service.EasyDrugService;
import com.app.util.AdminSession;
@RestController
public class EasyDrugController {
    private final EasyDrugService medicationService;
    public EasyDrugController(EasyDrugService medicationService) { this.medicationService = medicationService; }
    @PostMapping({"/api/admin/data/easy/test", "/medications/easy-sync-test"})
    public ResponseEntity<Map<String,Object>> syncEasyMedicationTest(HttpServletRequest request) {
        if (!isAdmin(request)) return forbidden();
        int count = medicationService.syncEasyMedicationTest();
        return ResponseEntity.ok(Map.of("count", count, "message", count + "건 e약은요 테스트 동기화를 완료했습니다."));
    }

    @PostMapping({"/api/admin/data/easy/all", "/medications/easy-sync-all"})
    public ResponseEntity<Map<String,Object>> syncEasyMedicationAll(HttpServletRequest request) {
        if (!isAdmin(request)) return forbidden();
        int count = medicationService.syncEasyMedicationAll();
        return ResponseEntity.ok(Map.of("count", count, "message", count + "건 e약은요 전체 동기화를 완료했습니다."));
    }

    private static boolean isAdmin(HttpServletRequest request) {
        return AdminSession.isAdmin(request);
    }
    private static ResponseEntity<Map<String,Object>> forbidden() {
        return ResponseEntity.status(403).body(Map.of("message","관리자만 의약품 데이터를 동기화할 수 있습니다."));
    }
}
