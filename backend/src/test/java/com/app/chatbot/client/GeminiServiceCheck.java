/**
 * 역할: Gemini 요청 형식, 오류 매핑, JSON 응답 검증 점검
 * 실행 방식: 실제 API 키와 외부 네트워크 없이 로컬 가짜 HTTP 서버 사용
 */
package com.app.chatbot.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.io.IOException;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.http.HttpMethod;
import org.springframework.http.client.ClientHttpRequest;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;
import com.app.chatbot.dto.ChatTurn;

// 독립 실행 계약 점검: main()을 실행하며 로컬 가짜 HTTP 서버만 사용한다.
public class GeminiServiceCheck {
    private static int httpStatus = 200;
    private static String response;
    private static JsonNode sent;
    private static String key;
    private static String url;
    private static final ObjectMapper JSON = new ObjectMapper();
    private static int checks;

    public static void main(String[] args) throws Exception {
        AtomicInteger calls = new AtomicInteger();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            calls.incrementAndGet();
            key = exchange.getRequestHeaders().getFirst("x-goog-api-key");
            sent = JSON.readTree(exchange.getRequestBody());
            byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
            exchange.sendResponseHeaders(httpStatus, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        server.start();
        try {
            RestTemplate client = new RestTemplate(new SimpleClientHttpRequestFactory() {
                @Override public ClientHttpRequest createRequest(URI uri, HttpMethod method) throws IOException {
                    url = uri.toString();
                    return super.createRequest(URI.create("http://127.0.0.1:" + server.getAddress().getPort()), method);
                }
            });
            GeminiService service = new GeminiService(client, "fake-test-key", null);
            response = "{\"candidates\":[{\"finishReason\":\"STOP\",\"content\":{\"parts\":["
                + "{\"thought\":true,\"text\":\"hidden\"},{\"text\":\"등록된 \"},{\"text\":\"정보입니다.\"}]}}]}";
            check(service.ask("효능은?", "[{\"efficacy\":\"시험\"}]").equals("등록된 정보입니다."), "Korean answer and thought exclusion");
            check(url.equals("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent"), "HTTPS model endpoint");
            check(key.equals("fake-test-key") && !url.contains(key), "Key in header only");
            check(sent.path("contents").get(0).path("parts").get(0).path("text").asText().contains("시험"), "DB reference serialization");
            check(sent.has("systemInstruction") && !sent.has("tools"), "DB-only instructions, no search tools");
            service.analyzeQuestion("텐텐이랑 맥주?", "텐텐츄정");
            check(sent.path("generationConfig").path("responseMimeType").asText().equals("application/json"), "Classifier JSON response format");
            check(sent.path("generationConfig").path("responseJsonSchema").path("required").size() == 8, "Classifier output schema");
            service.analyzeQuestion("그럼 임산부는?", "텐텐츄정", java.util.List.of("노인이 주의할 약 알려줘"));
            String prompt = sent.path("contents").get(0).path("parts").get(0).path("text").asText();
            check(prompt.contains("노인이 주의할 약 알려줘") && prompt.contains("그럼 임산부는?"), "Classifier receives recent and current questions");
            String classifierRules = sent.path("systemInstruction").path("parts").get(0).path("text").asText();
            check(classifierRules.contains("약봉투") && classifierRules.contains("영양제 등록"), "Medication registration questions route to site help");
            check(sent.path("generationConfig").path("responseJsonSchema").path("properties").has("clarificationQuestion"), "Targeted clarification schema");
            check(sent.path("generationConfig").path("responseJsonSchema").path("properties").path("intent").path("enum").toString().contains("SYMPTOM_CONSULTATION"), "Symptom intent in classifier schema");
            check(sent.path("generationConfig").path("responseJsonSchema").path("properties").path("intent").path("enum").toString().contains("SITE_HELP"), "Site-help intent in classifier schema");
            response = "{\"candidates\":[{\"finishReason\":\"STOP\",\"content\":{\"parts\":[{\"text\":\"{\\\"answer\\\":\\\"차근차근 확인할게요.\\\",\\\"followUpQuestions\\\":[\\\"언제부터 시작됐나요?\\\"],\\\"urgency\\\":\\\"ROUTINE\\\"}\"}]}}]}";
            ChatTurn prior = new ChatTurn(); prior.setRole("user"); prior.setContent("어제부터 아파");
            ConversationAnswer counsel = service.counsel("머리가 아파", "[]", java.util.List.of(prior));
            check(counsel.followUpQuestions().size() == 1 && counsel.urgency().equals("ROUTINE"), "Structured counseling response");
            String counselPrompt = sent.path("contents").get(0).path("parts").get(0).path("text").asText();
            check(counselPrompt.contains("어제부터 아파") && counselPrompt.contains("머리가 아파"), "Counselor receives both prior and current context");
            String counselRules = sent.path("systemInstruction").path("parts").get(0).path("text").asText();
            check(counselRules.contains("약 등록 페이지") && counselRules.contains("내 약 관리"), "Counselor knows the medication registration flow");
            service.counsel("검색해줘", "[]", java.util.List.of(), "DB 검색 결과가 0건임");
            check(sent.path("contents").get(0).path("parts").get(0).path("text").asText().contains("DB 검색 결과가 0건임"), "Counselor receives trusted server context");
            int before = calls.get();
            expect(new GeminiService(client, null, null), 503);
            expect(new GeminiService(client, "fake", "../bad"), 503);
            check(calls.get() == before, "Missing key and invalid model make no HTTP call");
            for (int status : new int[]{400, 401, 403, 404, 429, 500}) {
                httpStatus = status;
                response = "{\"error\":{\"message\":\"private-provider-payload\"}}";
                expect(service, status == 429 ? 429 : status == 401 || status == 403 || status == 404 ? 503 : 502);
            }
            httpStatus = 200;
            for (String body : new String[]{
                "{}",
                "{\"promptFeedback\":{\"blockReason\":\"SAFETY\"}}",
                "{\"candidates\":[{\"finishReason\":\"MAX_TOKENS\",\"content\":{\"parts\":[{\"text\":\"partial dosage\"}]}}]}",
                "{\"candidates\":[{\"finishReason\":\"STOP\",\"content\":{\"parts\":[]}}]}",
                "not-json"
            }) {
                response = body;
                expect(service, 502);
            }
            System.out.println("PASS: " + checks + " checks (local mock HTTP only)");
        } finally { server.stop(0); }
    }

    private static void expect(GeminiService service, int status) {
        try { service.ask("test", "[]"); throw new AssertionError("Expected error " + status); }
        catch (GeminiException e) {
            check(e.getStatus() == status && !e.getMessage().contains("private-provider-payload")
                && e.getCause() == null, "Sanitized error " + status);
        }
    }
    private static void check(boolean ok, String label) {
        if (!ok) throw new AssertionError(label);
        checks++;
    }
}
