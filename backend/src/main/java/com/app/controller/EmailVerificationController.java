package com.app.controller;

import com.app.dto.EmailCodeRequest;
import com.app.dto.EmailVerifyRequest;
import com.app.service.EmailVerificationService;
import com.app.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/users/email")
public class EmailVerificationController {

    @Autowired
    private EmailVerificationService emailVerificationService;

    @Autowired
    private UserService userService;

    @PostMapping(value = "/send-code", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, String>> sendCode(@RequestBody EmailCodeRequest request) {
        if (request.getEmail() == null || request.getEmail().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("message", "이메일을 입력해 주세요."));
        }
        if (!userService.isEmailAvailable(request.getEmail())) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("message", "이미 가입된 이메일입니다."));
        }
        try {
            emailVerificationService.sendCode(request.getEmail());
            return ResponseEntity.ok(Map.of("message", "인증번호가 발송되었습니다."));
        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("message", "인증 메일 발송에 실패했습니다: " + (e.getCause() != null ? e.getCause().getMessage() : e.getMessage())));
        }
    }

    @PostMapping(value = "/verify-code", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, Object>> verifyCode(@RequestBody EmailVerifyRequest request) {
        boolean verified = emailVerificationService.verifyCode(request.getEmail(), request.getCode());
        if (!verified) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("verified", false, "message", "인증번호가 올바르지 않거나 만료되었습니다."));
        }
        return ResponseEntity.ok(Map.of("verified", true, "message", "이메일 인증이 완료되었습니다."));
    }
}
