package com.app.util;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpSession;

/**
 * 로그인 세션에 저장된 USERS.IS_ADMIN 값을 기준으로 관리자 여부를 판단한다.
 * 가족 내 역할을 나타내는 role과 관리자 권한을 섞지 않도록 모든 관리 API가 이 메서드를 사용한다.
 */
public final class AdminSession {

    private AdminSession() {
    }

    public static boolean isAdmin(HttpServletRequest request) {
        HttpSession session = request == null ? null : request.getSession(false);
        if (session == null
                || !(session.getAttribute("userId") instanceof Number)
                || !Boolean.TRUE.equals(session.getAttribute("authenticated"))) {
            return false;
        }

        Object value = session.getAttribute("isAdmin");
        return Boolean.TRUE.equals(value)
                || (value instanceof Number && ((Number) value).intValue() == 1)
                || "1".equals(String.valueOf(value));
    }
}
