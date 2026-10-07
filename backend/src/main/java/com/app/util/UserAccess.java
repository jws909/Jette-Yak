package com.app.util;

import javax.servlet.http.HttpServletRequest;
import com.app.domain.User;
import com.app.mapper.UserMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/** 서버 세션으로 본인을 확인하고, 약·일정 관리는 같은 가족에게만 위임합니다. */
@Component
public class UserAccess {
    private final UserMapper users;
    public UserAccess(UserMapper users) { this.users = users; }

    public long currentUser(HttpServletRequest request) {
        var session = request == null ? null : request.getSession(false);
        Object value = session == null ? null : session.getAttribute("userId");
        if (session == null || !Boolean.TRUE.equals(session.getAttribute("authenticated"))
                || !(value instanceof Number) || ((Number)value).longValue() <= 0)
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다.");
        return ((Number)value).longValue();
    }

    public long selfUser(HttpServletRequest request, Long requested, String username) {
        long actor = currentUser(request);
        Long target = targetId(requested, username);
        if (target != null && target != actor) forbidden();
        return actor;
    }

    public long familyUser(HttpServletRequest request, Long requested) {
        return familyUser(request, requested, null);
    }

    public long familyManager(HttpServletRequest request, Long requested, boolean allowNewFamily) {
        long actor = selfUser(request, requested, null);
        User owner = users.findById(actor);
        if (owner == null) forbidden();
        // 기존 가족 관리는 DB의 보호자 역할만 허용하고, 미소속 본인의 최초 생성은 유지
        if (owner.getFamilyId() == null || owner.getFamilyId() <= 0) {
            if (!allowNewFamily) forbidden();
        } else if (owner.getRole() == null || !"GUAR".equalsIgnoreCase(owner.getRole().trim())) {
            forbidden();
        }
        return actor;
    }

    public long familyUser(HttpServletRequest request, Long requested, String username) {
        long actor = currentUser(request);
        Long target = targetId(requested, username);
        if (target == null || target == actor) return actor;
        User owner = users.findById(actor);
        User member = users.findById(target);
        if (owner == null || member == null || owner.getFamilyId() == null
                || owner.getFamilyId() <= 0 || !owner.getFamilyId().equals(member.getFamilyId())) forbidden();
        return target;
    }

    private Long targetId(Long requested, String username) {
        if (requested != null && requested <= 0)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "사용자 정보를 확인해 주세요.");
        if (username != null && !username.isBlank()) {
            String login = "demo".equalsIgnoreCase(username.trim()) ? "test12" : username.trim();
            User named = users.findByLoginId(login);
            if (named == null || named.getUserId() == null) forbidden();
            if (requested != null && !requested.equals(named.getUserId())) forbidden();
            return named.getUserId();
        }
        return requested;
    }

    public static Long requestedId(Object value) {
        if (value == null || value.toString().isBlank()) return null;
        try { return Long.valueOf(value.toString().trim()); }
        catch (NumberFormatException bad) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "사용자 정보를 확인해 주세요.");
        }
    }

    private static void forbidden() {
        throw new ResponseStatusException(HttpStatus.FORBIDDEN, "접근 권한이 없습니다.");
    }
}
