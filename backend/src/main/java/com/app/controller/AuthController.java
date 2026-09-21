package com.app.controller;

import java.util.UUID;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.app.dto.LoginRequest;
import com.app.dto.LoginResponse;
import com.app.dto.EmailCodeRequest;
import com.app.dto.EmailVerifyRequest;
import com.app.dto.PasswordResetRequest;
import com.app.domain.User;
import com.app.mapper.UserMapper;
import com.app.service.EmailVerificationService;
import com.app.util.PasswordUtil;

/**
 * 로그인 화면 동작 확인용 임시 컨트롤러.
 * DB 연동 전이므로 아이디/비밀번호를 하드코딩된 값과 비교합니다.
 * 실제 사용자 저장소가 준비되면 이 부분을 서비스 계층 + Repository 호출로 교체하면 됩니다.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    @Autowired
    private UserMapper userMapper;

    @Autowired
    private EmailVerificationService emailVerificationService;

    private static final String EMAIL_PATTERN = "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$";
    private static final long PASSWORD_RESET_VERIFICATION_EXPIRY_MILLIS = 5 * 60 * 1000L;
    private final Map<String, PasswordResetVerification> verifiedPasswordResetEmails = new ConcurrentHashMap<>();

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@RequestBody LoginRequest request) {
        User user = request.getUsername() == null ? null : userMapper.findByLoginId(request.getUsername());
        boolean isValid = user != null && request.getPassword() != null
                && user.getPasswordHash().equals(PasswordUtil.sha256(request.getPassword()));

        if (!isValid) {
            LoginResponse failResponse = new LoginResponse(
                    null,
                    request.getUsername(),
                    "아이디 또는 비밀번호가 올바르지 않습니다."
            );
            return ResponseEntity.status(401).body(failResponse);
        }

        LoginResponse successResponse = new LoginResponse(
                UUID.randomUUID().toString(),
                user.getLoginId(),
                user.getNickname(),
                user.getEmail(),
                "로그인 성공"
        );
        return ResponseEntity.ok(successResponse);
    }

    @PostMapping("/find-id/send-code")
    public ResponseEntity<?> sendFindIdCode(@RequestBody EmailCodeRequest request) {
        String email = request.getEmail() == null ? "" : request.getEmail().trim();
        if (!email.matches(EMAIL_PATTERN)) {
            return ResponseEntity.badRequest().body(java.util.Map.of("message", "올바른 이메일 형식을 입력해 주세요."));
        }
        if (userMapper.findByEmail(email) == null) {
            return ResponseEntity.status(404).body(java.util.Map.of("message", "등록된 이메일을 찾을 수 없습니다."));
        }

        try {
            emailVerificationService.clearVerification(email);
            emailVerificationService.sendCode(email);
            return ResponseEntity.ok(java.util.Map.of("message", "인증번호를 이메일로 보냈습니다."));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(java.util.Map.of("message", "인증번호 발송에 실패했습니다."));
        }
    }

    @PostMapping("/find-id/verify-code")
    public ResponseEntity<?> verifyFindIdCode(@RequestBody EmailVerifyRequest request) {
        String email = request.getEmail() == null ? "" : request.getEmail().trim();
        if (!email.matches(EMAIL_PATTERN) || !emailVerificationService.verifyCode(email, request.getCode())) {
            return ResponseEntity.badRequest().body(java.util.Map.of("message", "인증번호가 올바르지 않거나 만료되었습니다."));
        }

        User user = userMapper.findByEmail(email);
        if (user == null) {
            return ResponseEntity.status(404).body(java.util.Map.of("message", "등록된 이메일을 찾을 수 없습니다."));
        }
        return ResponseEntity.ok(java.util.Map.of("username", user.getLoginId()));
    }

    @PostMapping("/reset-password/send-code")
    public ResponseEntity<?> sendPasswordResetCode(@RequestBody PasswordResetRequest request) {
        User user = findUserByUsernameAndEmail(request.getUsername(), request.getEmail());
        if (user == null) {
            return ResponseEntity.status(404).body(java.util.Map.of("message", "아이디와 이메일이 일치하는 계정을 찾을 수 없습니다."));
        }

        try {
            String email = request.getEmail().trim();
            verifiedPasswordResetEmails.remove(user.getLoginId());
            emailVerificationService.clearVerification(email);
            emailVerificationService.sendCode(email);
            return ResponseEntity.ok(java.util.Map.of("message", "인증번호를 등록된 이메일로 보냈습니다."));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(java.util.Map.of("message", "인증번호 발송에 실패했습니다."));
        }
    }

    @PostMapping("/reset-password/verify-code")
    public ResponseEntity<?> verifyPasswordResetCode(@RequestBody PasswordResetRequest request) {
        User user = findUserByUsernameAndEmail(request.getUsername(), request.getEmail());
        String email = request.getEmail() == null ? "" : request.getEmail().trim();
        if (user == null || !emailVerificationService.verifyCode(email, request.getCode())) {
            return ResponseEntity.badRequest().body(java.util.Map.of("message", "인증번호가 올바르지 않거나 만료되었습니다."));
        }
        verifiedPasswordResetEmails.put(
                user.getLoginId(),
                new PasswordResetVerification(email, System.currentTimeMillis() + PASSWORD_RESET_VERIFICATION_EXPIRY_MILLIS)
        );
        return ResponseEntity.ok(java.util.Map.of("message", "이메일 인증이 완료되었습니다."));
    }

    @PostMapping("/reset-password")
    public ResponseEntity<?> resetPassword(@RequestBody PasswordResetRequest request) {
        User user = findUserByUsernameAndEmail(request.getUsername(), request.getEmail());
        String email = request.getEmail() == null ? "" : request.getEmail().trim();
        PasswordResetVerification verification = user == null ? null : verifiedPasswordResetEmails.get(user.getLoginId());
        if (verification == null || System.currentTimeMillis() > verification.expiresAt
                || !email.equalsIgnoreCase(verification.email)) {
            if (user != null) {
                verifiedPasswordResetEmails.remove(user.getLoginId());
            }
            return ResponseEntity.status(403).body(java.util.Map.of("message", "이메일 인증 후 비밀번호를 재설정할 수 있습니다."));
        }
        if (request.getNewPassword() == null || request.getNewPassword().length() < 8) {
            return ResponseEntity.badRequest().body(java.util.Map.of("message", "새 비밀번호는 8자 이상이어야 합니다."));
        }

        userMapper.updatePasswordHash(user.getLoginId(), PasswordUtil.sha256(request.getNewPassword()));
        verifiedPasswordResetEmails.remove(user.getLoginId());
        emailVerificationService.clearVerification(email);
        return ResponseEntity.ok(java.util.Map.of("message", "비밀번호가 재설정되었습니다."));
    }

    private User findUserByUsernameAndEmail(String username, String email) {
        if (username == null || username.isBlank() || email == null || !email.trim().matches(EMAIL_PATTERN)) {
            return null;
        }
        User user = userMapper.findByLoginId(username.trim());
        return user != null && user.getEmail() != null && user.getEmail().equalsIgnoreCase(email.trim()) ? user : null;
    }

    private static class PasswordResetVerification {
        private final String email;
        private final long expiresAt;

        private PasswordResetVerification(String email, long expiresAt) {
            this.email = email;
            this.expiresAt = expiresAt;
        }
    }
}
