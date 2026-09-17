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

// Standalone contract check: run main(). Uses only a local fake HTTP server.
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