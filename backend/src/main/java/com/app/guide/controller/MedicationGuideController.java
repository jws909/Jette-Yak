/**
 * 역할: 제품 기본정보와 DUR 주의정보를 내 약 관리 화면에 제공
 * 응답 기준: 제품 없음과 DUR 기록 없음을 서로 다른 상태로 구분
 */
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
    private final com.app.chatbot.client.GeminiService gemini;

    public MedicationGuideController(MedicationGuideDao dao, DurGuideService dur) {
        this(dao, dur, null);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public MedicationGuideController(MedicationGuideDao dao, DurGuideService dur, com.app.chatbot.client.GeminiService gemini) {
        this.dao = dao;
        this.dur = dur;
        this.gemini = gemini;
    }
    // 로그인 성공 시 서버가 세션에 저장한 users.user_id만 신뢰한다.
    // 클라이언트가 userId를 바꿔 다른 사용자의 등록 약을 조회하지 못하게 한다.
    @GetMapping(value="/api/guides/my-medications", produces="application/json")
    public ResponseEntity<?> registered(javax.servlet.http.HttpServletRequest request) {
        var session = request.getSession(false);
        Object value = session == null ? null : session.getAttribute("userId");
        Long targetId = value instanceof Number ? ((Number) value).longValue() : null;
        if (targetId == null || targetId <= 0L)
            return ResponseEntity.status(401).header("Cache-Control", "no-store")
                .body(Map.of("error", "로그인이 필요합니다."));
        try {
            return ResponseEntity.ok().header("Cache-Control", "no-store")
                .body(Map.of("items", dao.findRegistered(targetId)));
        } catch (DataAccessException e) {
            LogManager.getLogger(getClass()).error("등록 약 목록 DB 조회 실패", e);
            return ResponseEntity.status(500).header("Cache-Control", "no-store")
                .body(Map.of("error", "등록한 약을 불러오지 못했습니다. 다시 시도해주세요."));
        }
    }
    public ResponseEntity<?> get(String id) {
        return get(id, true);
    }

    @GetMapping(value="/api/guides/medications/{id}", produces="application/json")
    public ResponseEntity<?> get(@PathVariable("id") String id,
            @RequestParam(value="includeAi", defaultValue="true") boolean includeAi) {
        if (id.isBlank() || id.length() > 20) return ResponseEntity.badRequest().body(Map.of("error", "약 선택 정보를 확인해주세요."));
        try {
            var medication = dao.find(id);
            if (medication == null) return ResponseEntity.status(404).body(Map.of("error", "등록된 약을 찾지 못했습니다. 다시 검색해주세요."));

            // [On-Demand Caching] AI 요약 정보가 NULL 또는 빈 값이면 AI 호출 후 DB 영구 캐싱
            // 주의사항 선조회는 AI 응답을 기다리지 않고 공식 기록부터 전달
            if (includeAi && (medication.getAiSummaryJson() == null || medication.getAiSummaryJson().isBlank()) && gemini != null) {
                try {
                    String generated = gemini.getOrGenerateMedicationSummary(
                        medication.getItemName(),
                        medication.getClassName(),
                        medication.getMaterialName(),
                        medication.getEfficacy(),
                        medication.getUsageDosage()
                    );
                    if (generated != null && !generated.isBlank()) {
                        dao.updateAiSummary(medication.getMedicationId(), generated);
                        medication.setAiSummaryJson(generated);
                    }
                } catch (Exception ex) {
                    LogManager.getLogger(getClass()).warn("AI 요약 생성/캐싱 실패: {}", ex.getMessage());
                }
            }

            boolean hasAiSummary = medication.getAiSummaryJson() != null && !medication.getAiSummaryJson().isBlank();
            return ResponseEntity.ok(Map.of("medication", medication, "source", "등록된 식약처 허가정보 · e약은요 · DUR 자료 · AI 요약",
                "dur", dur != null ? dur.find(medication.getMedicationId(), medication.getMaterialName()) : Map.of(),
                "coverage", Map.of("lifestyle", hasAiSummary, "sideEffects", hasAiSummary, "dur", true)));
        } catch (DataAccessException e) {
            LogManager.getLogger(getClass()).error("생활가이드 DB 조회 실패", e);
            return ResponseEntity.status(500).body(Map.of("error", "약 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요."));
        }
    }
}
