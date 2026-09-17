package com.app.controller;

import com.app.dto.SignupRequest;
import com.app.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 회원가입 / 중복확인 컨트롤러 (DB 연동 버전).
 * 이전에 만든 하드코딩 테스트용 UserController를 대체합니다.
 */
@RestController
@RequestMapping("/api/users")
public class UserController {

    @Autowired
    private UserService userService;

    @GetMapping(value = "/check-username", produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Boolean> checkUsername(@RequestParam("value") String value) {
        return Map.of("available", userService.isLoginIdAvailable(value));
    }

    @GetMapping(value = "/check-email", produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Boolean> checkEmail(@RequestParam("value") String value) {
        return Map.of("available", userService.isEmailAvailable(value));
    }

    @GetMapping(value = "/check-nickname", produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Boolean> checkNickname(@RequestParam("value") String value) {
        return Map.of("available", userService.isNicknameAvailable(value));
    }

    @PostMapping(value = "/signup", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, String>> signup(@RequestBody SignupRequest request) {
        try {
            userService.signup(request);
            return ResponseEntity.ok(Map.of("message", "회원가입이 완료되었습니다."));
        } catch (IllegalStateException e) {
            // 아이디/이메일/닉네임 중복
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("message", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("message", "회원가입 처리 중 오류가 발생했습니다."));
        }
    }
}
