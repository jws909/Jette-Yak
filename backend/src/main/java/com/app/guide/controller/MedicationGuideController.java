package com.app.guide.controller;
import java.util.Map;
import org.springframework.dao.DataAccessException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.apache.logging.log4j.LogManager;
import com.app.guide.dao.MedicationGuideDao;
import com.app.guide.service.DurGuideService;
@RestController
public class MedicationGuideController {
    private final MedicationGuideDao dao;
    private final DurGuideService dur;
    public MedicationGuideController(MedicationGuideDao dao, DurGuideService dur) { this.dao = dao; this.dur = dur; }
    // 로그인 성공 시 서버에서 검증한 users.user_id를 Long으로 세션에 저장한다.
    // 요청 파라미터나 demo-token을 사용자 ID로 사용하지 않는다.
    @GetMapping(value="/api/guides/my-medications", produces="application/json")
    public ResponseEntity<?> registered(javax.servlet.http.HttpServletRequest request) {
        var session = request.getSession(false);
        Object value = session == null ? null : session.getAttribute("userId");
        if (!(value instanceof Long) || ((Long) value) <= 0)
            return ResponseEntity.status(401).header("Cache-Control", "no-store")
                .body(Map.of("error", "로그인이 필요합니다."));
        try {
            return ResponseEntity.ok().header("Cache-Control", "no-store")
                .body(Map.of("items", dao.findRegistered((Long) value)));
        } catch (DataAccessException e) {
            LogManager.getLogger(getClass()).error("등록 약 목록 DB 조회 실패", e);
            return ResponseEntity.status(500).header("Cache-Control", "no-store")
                .body(Map.of("error", "등록한 약을 불러오지 못했습니다. 다시 시도해주세요."));
        }
    }
    @GetMapping(value="/api/guides/medications/{id}", produces="application/json")
    public ResponseEntity<?> get(@PathVariable("id") String id) {
        if (id.isBlank() || id.length() > 20) return ResponseEntity.badRequest().body(Map.of("error", "약 선택 정보를 확인해주세요."));
        try {
            var medication = dao.find(id);
            if (medication == null) return ResponseEntity.status(404).body(Map.of("error", "등록된 약을 찾지 못했습니다. 다시 검색해주세요."));
            return ResponseEntity.ok(Map.of("medication", medication, "source", "등록된 식약처 허가정보 · e약은요 · DUR 자료",
                "dur", dur.find(medication.getMaterialName()),
                "coverage", Map.of("lifestyle", false, "sideEffects", false, "dur", true)));
        } catch (DataAccessException e) {
            LogManager.getLogger(getClass()).error("생활가이드 DB 조회 실패", e);
            return ResponseEntity.status(500).body(Map.of("error", "약 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요."));
        }
    }
}
