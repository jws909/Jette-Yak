/**
 * 파일 역할: 챗봇 검색·질문 API의 입력값을 검증하고 로그인 세션의 사용자 ID를 서비스에 전달합니다.
 * 핵심 규칙: 클라이언트가 보낸 userId는 신뢰하지 않고 서버 세션을 사용자 식별 기준으로 사용합니다.
 */
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
import com.app.chatbot.service.ChatHistoryService;
import com.app.chatbot.client.GeminiException;

@RestController
public class ChatController {
    private static final Logger log = LogManager.getLogger(ChatController.class);
    private final MedicationChatService service;
    private final ChatHistoryService history;
    public ChatController(MedicationChatService service) { this(service,null); }
    @org.springframework.beans.factory.annotation.Autowired
    public ChatController(MedicationChatService service,ChatHistoryService history) { this.service=service;this.history=history; }

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
    public ResponseEntity<Map<String, Object>> chat(@RequestBody MedicationChatRequest request, javax.servlet.http.HttpServletRequest http) {
        var session=http.getSession(false);var value=session==null?null:session.getAttribute("userId");
        var response=chatForUser(request,value instanceof Long && (Long)value>0?(Long)value:null);
        return ResponseEntity.status(response.getStatusCode()).header("Cache-Control","no-store").body(response.getBody());
    }
    public ResponseEntity<Map<String,Object>> chat(MedicationChatRequest request) { return chatForUser(request,null); }
    private ResponseEntity<Map<String,Object>> chatForUser(MedicationChatRequest request, Long userId) {
        if (request.getQuestion() == null || request.getQuestion().isBlank()
                || request.getQuestion().length() > 1000)
            return ResponseEntity.badRequest().body(Map.of("error", "질문을 1~1000자로 입력해주세요."));
        if (request.getRecentQuestions().size() > 4 || request.getRecentQuestions().stream().anyMatch(q -> q == null || q.isBlank() || q.length() > 1000))
            return ResponseEntity.badRequest().body(Map.of("error", "최근 대화 정보를 확인해주세요."));
        int conversationLength = request.getConversation().stream()
            .filter(java.util.Objects::nonNull)
            .mapToInt(turn -> turn.getContent() == null ? 0 : turn.getContent().length()).sum();
        if (request.getConversation().size() > 12 || conversationLength > 10000
                || request.getConversation().stream().anyMatch(turn -> turn == null
                    || !("user".equals(turn.getRole()) || "assistant".equals(turn.getRole()))
                    || turn.getContent() == null || turn.getContent().isBlank() || turn.getContent().length() > 1500))
            return ResponseEntity.badRequest().body(Map.of("error", "대화 이력을 확인해주세요."));
        if ((request.getItemSeq() != null && request.getItemSeq().length() > 30)
                || (request.getConversationId()!=null&&request.getConversationId()<=0)
                || request.getSelections().size() > 8
                || request.getSelections().entrySet().stream().anyMatch(e ->
                    e.getKey() == null || e.getKey().length() > 100 ||
                    e.getValue() == null || e.getValue().length() > 30))
            return ResponseEntity.badRequest().body(Map.of("error", "약 선택 정보를 확인해주세요."));
        try {
            Map<String,Object> answer=new java.util.LinkedHashMap<>(service.chat(request,userId));
            if(userId!=null&&history!=null){
                long conversationId=history.saveExchange(userId,request,answer);
                answer.put("conversationId",conversationId);
            }
            return ResponseEntity.ok(answer);
        }
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

    @GetMapping(value="/api/chat/conversations",produces="application/json")
    public ResponseEntity<?> conversations(javax.servlet.http.HttpServletRequest request){
        Long userId=authenticatedUser(request);
        if(userId==null)return ResponseEntity.status(401).body(Map.of("error","로그인이 필요합니다."));
        try{return ResponseEntity.ok(Map.of("items",history.conversations(userId)));}
        catch(DataAccessException e){log.error("챗봇 대화 목록 조회 실패",e);return ResponseEntity.status(500).body(Map.of("error","대화 기록을 불러오지 못했습니다."));}
    }

    @GetMapping(value="/api/chat/conversations/{id}",produces="application/json")
    public ResponseEntity<?> conversation(@PathVariable("id") long id,javax.servlet.http.HttpServletRequest request){
        Long userId=authenticatedUser(request);
        if(userId==null)return ResponseEntity.status(401).body(Map.of("error","로그인이 필요합니다."));
        try{return ResponseEntity.ok(history.conversation(userId,id));}
        catch(IllegalArgumentException e){return ResponseEntity.status(404).body(Map.of("error",e.getMessage()));}
        catch(DataAccessException e){log.error("챗봇 대화 조회 실패",e);return ResponseEntity.status(500).body(Map.of("error","대화 기록을 불러오지 못했습니다."));}
    }

    @DeleteMapping(value="/api/chat/conversations/{id}",produces="application/json")
    public ResponseEntity<?> deleteConversation(@PathVariable("id") long id,javax.servlet.http.HttpServletRequest request){
        Long userId=authenticatedUser(request);
        if(userId==null)return ResponseEntity.status(401).body(Map.of("error","로그인이 필요합니다."));
        try{history.delete(userId,id);return ResponseEntity.ok(Map.of("success",true));}
        catch(IllegalArgumentException e){return ResponseEntity.status(404).body(Map.of("error",e.getMessage()));}
        catch(DataAccessException e){log.error("챗봇 대화 삭제 실패",e);return ResponseEntity.status(500).body(Map.of("error","대화 기록을 삭제하지 못했습니다."));}
    }

    private static Long authenticatedUser(javax.servlet.http.HttpServletRequest request){
        var session=request.getSession(false);Object value=session==null?null:session.getAttribute("userId");
        return value instanceof Long&&(Long)value>0?(Long)value:null;
    }
}
