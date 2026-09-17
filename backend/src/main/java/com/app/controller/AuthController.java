package com.app.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.app.dto.LoginRequest;
import com.app.dto.LoginResponse;

/**
 * 로그인 화면 동작 확인용 임시 컨트롤러.
 * DB 연동 전이므로 아이디/비밀번호를 하드코딩된 값과 비교합니다.
 * 실제 사용자 저장소가 준비되면 이 부분을 서비스 계층 + Repository 호출로 교체하면 됩니다.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    // TODO: DB 연동 시 이 하드코딩된 값 대신 UserRepository 조회로 교체
    private static final String TEST_USERNAME = "test";
    private static final String TEST_PASSWORD = "1234";

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@RequestBody LoginRequest request) {
        boolean isValid = TEST_USERNAME.equals(request.getUsername())
                && TEST_PASSWORD.equals(request.getPassword());

        if (!isValid) {
            LoginResponse failResponse = new LoginResponse(
                    null,
                    request.getUsername(),
                    "아이디 또는 비밀번호가 올바르지 않습니다."
            );
            return ResponseEntity.status(401).body(failResponse);
        }

        LoginResponse successResponse = new LoginResponse(
                "dummy-token",
                request.getUsername(),
                "로그인 성공"
        );
        return ResponseEntity.ok(successResponse);
    }
}
