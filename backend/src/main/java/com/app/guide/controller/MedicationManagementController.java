/**
 * 파일 역할: 로그인 사용자의 처방약·직접 추가 약 목록과 복용 상태 변경 API를 제공합니다.
 * 핵심 규칙: userId는 요청에서 받지 않고 세션에서 읽어 다른 사용자의 약 목록 접근을 막습니다.
 */
package com.app.guide.controller;

import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

import javax.servlet.http.HttpServletRequest;

import org.apache.logging.log4j.LogManager;
import org.springframework.http.ResponseEntity;
import org.springframework.dao.DataAccessException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.app.guide.service.MedicationManagementService;

@RestController
@RequestMapping("/api/guides")
public class MedicationManagementController {
    private final MedicationManagementService service;

    public MedicationManagementController(MedicationManagementService service) {
        this.service = service;
    }

    /**
     * 사용자 소유 자료는 쿼리 파라미터가 아니라 로그인 세션으로만 식별한다.
     * Number로 받으면 세션 구현체가 Long 이외의 숫자 타입을 사용해도 안전하게 처리할 수 있다.
     */
    private Long authenticatedUser(HttpServletRequest request) {
        var session = request.getSession(false);
        Object value = session == null ? null : session.getAttribute("userId");
        if (!(value instanceof Number)) return null;

        long userId = ((Number) value).longValue();
        return userId > 0 ? userId : null;
    }

    private ResponseEntity<?> call(Supplier<Object> action) {
        try {
            return ResponseEntity.ok().header("Cache-Control", "no-store").body(action.get());
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (DataAccessException e) {
            LogManager.getLogger(getClass()).error("내 약 관리 조회/저장 실패", e);
            return ResponseEntity.status(500)
                .body(Map.of("error", "약 정보를 처리하지 못했습니다. 잠시 후 다시 시도해주세요."));
        }
    }

    private ResponseEntity<?> unauthorized() {
        return ResponseEntity.status(401).header("Cache-Control", "no-store")
            .body(Map.of("error", "로그인이 필요합니다."));
    }

    @GetMapping("/collection")
    public ResponseEntity<?> collection(HttpServletRequest request) {
        Long userId = authenticatedUser(request);
        return userId == null ? unauthorized() : call(() -> Map.of("items", service.collection(userId)));
    }

    public record StatusRequest(String status) {}

    @PatchMapping("/collection/{registrationId}")
    public ResponseEntity<?> update(
            @PathVariable("registrationId") String registrationId,
            @RequestBody(required = false) StatusRequest body,
            HttpServletRequest request) {
        Long userId = authenticatedUser(request);
        if (userId == null) return unauthorized();

        return call(() -> {
            service.update(userId, registrationId, body == null ? null : body.status());
            return Map.of("message", "복용 상태를 저장했습니다.");
        });
    }

    @GetMapping("/collection/dur")
    public ResponseEntity<?> mine(HttpServletRequest request) {
        Long userId = authenticatedUser(request);
        return userId == null ? unauthorized() : call(() -> service.myComparison(userId));
    }

    @GetMapping("/overall")
    public ResponseEntity<?> overall(
            @RequestParam(value = "refresh", defaultValue = "false") boolean refresh,
            HttpServletRequest request) {
        Long userId = authenticatedUser(request);
        return userId == null ? unauthorized() : call(() -> service.getOverallGuide(userId, refresh));
    }

    @PostMapping("/overall/refresh")
    public ResponseEntity<?> refreshOverall(HttpServletRequest request) {
        Long userId = authenticatedUser(request);
        return userId == null ? unauthorized() : call(() -> service.getOverallGuide(userId, true));
    }

    public record CompareRequest(List<String> medicationIds) {}

    @PostMapping("/compare")
    public ResponseEntity<?> compare(@RequestBody CompareRequest body) {
        // 공식 약 ID만 비교하며 사용자 등록 자료는 읽지 않는 공개 정보 조회 API다.
        return call(() -> service.compare(body == null ? null : body.medicationIds()));
    }
}
