package com.app.dto;

/**
 * 로그인 응답 바디
 * 지금은 DB/토큰 없이 화면 확인용으로만 사용하는 단순 응답입니다.
 * { "token": "dummy-token", "username": "...", "message": "..." }
 */
public class LoginResponse {

    private String token;
    private String username;
    private String message;

    public LoginResponse(String token, String username, String message) {
        this.token = token;
        this.username = username;
        this.message = message;
    }

    public String getToken() {
        return token;
    }

    public String getUsername() {
        return username;
    }

    public String getMessage() {
        return message;
    }
}
