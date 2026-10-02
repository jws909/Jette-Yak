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

    public LoginResponse() {
    }

    public LoginResponse(String username, String message) {
        this(null, username, null, null, "USER", false, message);
    }

    public LoginResponse(Long userId, String username, String nickname, String email, String message) {
        this(userId, username, nickname, email, "USER", false, message);
    }

    public LoginResponse(Long userId, String username, String nickname, String email, String role, String message) {
        this(userId, username, nickname, email, role, "ADMIN".equalsIgnoreCase(role), message);
    }

    public LoginResponse(Long userId, String username, String nickname, String email, String role, boolean isAdmin, String message) {
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

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getNickname() {
        return nickname;
    }

    public void setNickname(String nickname) {
        this.nickname = nickname;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }

    public boolean getIsAdmin() {
        return isAdmin;
    }

    public boolean isAdmin() {
        return isAdmin;
    }

    public void setIsAdmin(boolean isAdmin) {
        this.isAdmin = isAdmin;
    }

    public void setAdmin(boolean isAdmin) {
        this.isAdmin = isAdmin;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }
}

