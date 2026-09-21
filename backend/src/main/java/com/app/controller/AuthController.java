package com.app.controller;

import java.util.UUID;

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
}
