package com.app.dto;

/**
 * 로그인 응답 바디
 * 지금은 DB/토큰 없이 화면 확인용으로만 사용하는 단순 응답입니다.
 * { "token": "dummy-token", "username": "...", "message": "..." }
 */
public class LoginResponse {

    private String token;
    private Long userId;
    private String username;
    private String nickname;
    private String email;
    private String message;

    public LoginResponse(String token, String username, String message) {
        this(token, null, username, null, null, message);
    }

    public LoginResponse(String token, String username, String nickname, String email, String message) {
        this(token, null, username, nickname, email, message);
    }

    public LoginResponse(String token, Long userId, String username, String nickname, String email, String message) {
        this.token = token;
        this.userId = userId;
        this.username = username;
        this.nickname = nickname;
        this.email = email;
        this.message = message;
    }

    public Long getUserId() {
        return userId;
    }

    public String getToken() {
        return token;
    }

    public String getUsername() {
        return username;
    }

    public String getNickname() {
        return nickname;
    }

    public String getEmail() {
        return email;
    }

    public String getMessage() {
        return message;
    }
}
