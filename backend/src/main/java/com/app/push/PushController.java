package com.app.push;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpSession;
import com.app.util.UserAccess;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** 세션 본인 인증 + 같은 출처 요청 + 세션별 CSRF 토큰으로 기기 알림을 관리 */
@RestController
@RequestMapping(value = "/api/push", produces = "application/json;charset=UTF-8")
public class PushController {
    static final String CSRF_SESSION = "pushCsrfToken";
    private final UserAccess access;
    private final PushSubscriptionService service;
    public PushController(UserAccess access, PushSubscriptionService service) { this.access = access; this.service = service; }

    @GetMapping("/config") public ResponseEntity<Map<String,Object>> config(HttpServletRequest request) {
        access.currentUser(request);
        sameOrigin(request, true);
        HttpSession session = request.getSession(false);
        String token;
        synchronized (session) {
            token = (String) session.getAttribute(CSRF_SESSION);
            if (token == null) {
                byte[] random = new byte[32]; new SecureRandom().nextBytes(random);
                token = Base64.getUrlEncoder().withoutPadding().encodeToString(random);
                session.setAttribute(CSRF_SESSION, token);
            }
        }
        boolean ready = service.available();
        Map<String,Object> body = new LinkedHashMap<>();
        body.put("enabled", ready); body.put("publicKey", ready ? service.publicKey() : ""); body.put("csrfToken", token);
        body.put("message", ready ? "" : "앱을 닫은 뒤 받는 알림은 서버 준비가 필요해요.");
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(body);
    }
    @PostMapping("/subscriptions") public Map<String,Boolean> subscribe(HttpServletRequest request, @RequestBody PushInput input) {
        long userId = authenticatedWrite(request);
        service.subscribe(userId, input, request.getSession(false));
        return Map.of("subscribed", true);
    }
    @PostMapping("/subscriptions/status") public ResponseEntity<Map<String,Boolean>> status(HttpServletRequest request, @RequestBody PushInput input) {
        long userId = authenticatedWrite(request);
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(Map.of("subscribed",
            service.subscribed(userId, input.endpoint, request.getSession(false))));
    }
    @PostMapping("/subscriptions/remove") public Map<String,Boolean> remove(HttpServletRequest request, @RequestBody PushInput input) {
        long userId = authenticatedWrite(request);
        service.remove(userId, input.endpoint, request.getSession(false));
        return Map.of("subscribed", false);
    }
    @PostMapping("/test") public Map<String,Boolean> test(HttpServletRequest request, @RequestBody PushInput input) {
        long userId = authenticatedWrite(request);
        service.test(userId, input.endpoint, request.getSession(false));
        return Map.of("sent", true);
    }
    private long authenticatedWrite(HttpServletRequest request) {
        long userId = access.currentUser(request);
        sameOrigin(request, false);
        Object expected = request.getSession(false).getAttribute(CSRF_SESSION);
        String actual = request.getHeader("X-Push-CSRF");
        if (!(expected instanceof String) || actual == null || actual.length() > 100
                || !MessageDigest.isEqual(((String) expected).getBytes(StandardCharsets.UTF_8), actual.getBytes(StandardCharsets.UTF_8)))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "알림 설정 화면을 다시 열어 주세요.");
        return userId;
    }

    static void sameOrigin(HttpServletRequest request, boolean configGet) {
        String site = request.getHeader("Sec-Fetch-Site");
        // Vite 프록시가 Host를 바꾸므로 Host 비교 대신 브라우저의 요청 출처 정보를 사용
        if ((site != null && !site.equals("same-origin") && !site.equals("none"))
                || (configGet && request.getHeader("Origin") != null))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "제때약 화면에서 알림을 설정해 주세요.");
    }
    @ExceptionHandler(ResponseStatusException.class) public ResponseEntity<Map<String,Object>> error(ResponseStatusException error) {
        return ResponseEntity.status(error.getStatus()).header("Cache-Control", "no-store")
            .body(Map.of("message", error.getReason() == null ? "알림 요청을 처리하지 못했어요." : error.getReason()));
    }
}
