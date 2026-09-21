package com.app.chatbot.controller;

import java.util.Map;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.springframework.dao.DataAccessException;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClientException;
import com.app.chatbot.dto.MedicationChatRequest;
import com.app.chatbot.service.MedicationChatService;
import com.app.chatbot.client.GeminiException;

@RestController
public class ChatController {
    private static final Logger log = LogManager.getLogger(ChatController.class);
    private final MedicationChatService service;
    public ChatController(MedicationChatService service) { this.service = service; }

    @GetMapping(value = "/api/medications/search", produces = "application/json")
    public ResponseEntity<Map<String, Object>> search(
            @RequestParam("q") String keyword,
            @RequestParam(value = "page", defaultValue = "1") int page) {
        if (keyword.isBlank() || keyword.length() > 100 || page < 1 || page > 100000)
            return ResponseEntity.badRequest().body(Map.of("error", "약 이름을 1~100자로 입력해주세요."));
        try { return ResponseEntity.ok(service.search(keyword.trim(), page)); }
        catch (DataAccessException e) {
            log.error("약 이름 검색 실패", e);
            return ResponseEntity.status(500).body(Map.of("error", "약 검색에 실패했습니다."));
        }
    }

    @PostMapping(value="/api/chat/catalog", consumes="application/json", produces="application/json")
    public ResponseEntity<Map<String,Object>> catalog(@RequestBody com.fasterxml.jackson.databind.JsonNode request) {
        try {
            var query = com.app.chatbot.service.CatalogQuery.parse(request.path("query"));
            if (!request.path("page").isIntegralNumber() || !request.path("page").canConvertToInt())
                throw new IllegalArgumentException("페이지 번호를 확인해주세요.");
            return ResponseEntity.ok(service.catalog(query, request.path("page").asInt()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error",e.getMessage()));
        } catch (DataAccessException e) {
            log.error("챗봇 조건 검색 실패",e);
            return ResponseEntity.status(500).body(Map.of("error","검색에 실패했습니다. 조건을 좁혀 다시 시도해주세요."));
        }
    }

    @PostMapping(value = "/api/chat", consumes = "application/json", produces = "application/json")
    public ResponseEntity<Map<String, Object>> chat(@RequestBody MedicationChatRequest request) {
        if (request.getQuestion() == null || request.getQuestion().isBlank()
                || request.getQuestion().length() > 1000)
            return ResponseEntity.badRequest().body(Map.of("error", "질문을 1~1000자로 입력해주세요."));
        if (request.getRecentQuestions().size() > 4 || request.getRecentQuestions().stream().anyMatch(q -> q == null || q.isBlank() || q.length() > 1000))
            return ResponseEntity.badRequest().body(Map.of("error", "최근 대화 정보를 확인해주세요."));
        if ((request.getItemSeq() != null && request.getItemSeq().length() > 30)
                || request.getSelections().size() > 8
                || request.getSelections().entrySet().stream().anyMatch(e ->
                    e.getKey() == null || e.getKey().length() > 100 ||
                    e.getValue() == null || e.getValue().length() > 30))
            return ResponseEntity.badRequest().body(Map.of("error", "약 선택 정보를 확인해주세요."));
        try { return ResponseEntity.ok(service.chat(request)); }
        catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (DataAccessException e) {
            log.error("챗봇 의약품 DB 조회 실패", e);
            return ResponseEntity.status(500).body(Map.of("error", "DB 조회에 실패했습니다."));
        } catch (GeminiException e) {
            log.warn("Gemini 요청 실패: HTTP {}", e.getStatus());
            return ResponseEntity.status(e.getStatus()).body(Map.of("error", e.getMessage()));
        } catch (RestClientException | IllegalStateException e) {
            log.error("챗봇 답변 실패", e);
            return ResponseEntity.status(502).body(Map.of("error", "AI 답변 처리에 실패했습니다."));
        }
    }
}
