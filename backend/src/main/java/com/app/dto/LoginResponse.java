package com.app.dto;

/**
 * 로그인 응답 바디
 * 세션 기반 인증 환경에서 로그인 사용자 프로필 및 성공 메시지를 전달합니다.
 */
public class LoginResponse {

    private Long userId;
    private String username;
    private String nickname;
    private String email;
    private String role;
    private boolean isAdmin;
    private String message;

    public LoginResponse(String username, String message) {
        this(null, username, null, null, "USER", message);
    }

    public LoginResponse(Long userId, String username, String nickname, String email, String message) {
        this(userId, username, nickname, email, "USER", message);
    }

    public LoginResponse(Long userId, String username, String nickname, String email, String role, String message) {
        this.userId = userId;
        this.username = username;
        this.nickname = nickname;
        this.email = email;
        this.role = role;
        this.isAdmin = isAdmin;
        this.message = message;
    }

    public Long getUserId() {
        return userId;
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

    public String getRole() {
        return role;
    }

    public boolean getIsAdmin() { return isAdmin; }

    public String getMessage() {
        return message;
    }
}
