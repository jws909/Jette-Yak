package com.app.push;

import java.time.Clock;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpSession;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/** 구독 저장과 해제, 기기별 테스트 전송. 다른 사용자 구독을 덮어쓰지 않는 경계 */
@Service
public class PushSubscriptionService {
    static final String SESSION_ENDPOINTS = "pushSubscribedEndpoints";
    private static final String SESSION_CLOSED = "pushSessionClosed";
    private static final String SESSION_TEST_AT = "pushLastTestAt";
    private final PushDao dao;
    private final PushSender sender;
    private final Clock clock;
    private volatile long nextHealthCheck;
    private volatile boolean healthy;

    @Autowired public PushSubscriptionService(PushDao dao, PushSender sender) {
        this(dao, sender, Clock.systemUTC());
    }
    public PushSubscriptionService(PushDao dao, PushSender sender, Clock clock) {
        this.dao = dao; this.sender = sender; this.clock = clock;
    }

    public boolean available() {
        if (!sender.ready()) return false;
        long now = clock.millis();
        if (now >= nextHealthCheck) synchronized (this) {
            if (now >= nextHealthCheck) {
                try { healthy = dao.schemaReady(); }
                catch (RuntimeException missingSchema) { healthy = false; }
                nextHealthCheck = now + 30_000;
            }
        }
        return healthy;
    }
    public String publicKey() { return sender.publicKey(); }
    public void requireAvailable() {
        if (!available()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
            "앱을 닫은 뒤 받는 알림은 서버 준비가 필요해요. 잠시 후 다시 확인해 주세요.");
    }

    public void subscribe(long userId, PushInput input, HttpSession session) {
        requireAvailable();
        if (input == null || input.keys == null) badInput();
        PushSubscription subscription = new PushSubscription();
        subscription.setUserId(userId);
        subscription.setEndpoint(PushSafety.endpoint(input.endpoint));
        subscription.setEndpointHash(PushSafety.hash(input.endpoint));
        subscription.setPublicKey(PushSafety.key(input.keys.p256dh, 65));
        subscription.setAuthSecret(PushSafety.key(input.keys.auth, 16));
        if (input.expirationTime != null && input.expirationTime <= clock.millis()) badInput();
        // 키 길이뿐 아니라 실제 P-256 곡선 위의 점인지 확인
        try { nl.martijndwars.webpush.Utils.loadPublicKey(subscription.getPublicKey()); }
        catch (Exception invalidPoint) { badInput(); }
        // 같은 세션의 로그아웃과 등록이 겹쳐도 로그아웃 뒤 구독이 남지 않도록 함께 잠금
        synchronized (session) {
            requireOpen(session);
            try {
                PushSubscription existing = dao.find(subscription.getEndpointHash());
                if (existing == null) {
                    try { dao.insert(subscription); }
                    catch (DuplicateKeyException simultaneous) {
                        existing = dao.find(subscription.getEndpointHash());
                        ensureOwner(existing, userId);
                        if (dao.updateOwned(subscription) != 1) databaseUnavailable();
                    }
                } else {
                    ensureOwner(existing, userId);
                    if (dao.updateOwned(subscription) != 1) databaseUnavailable();
                }
            } catch (DataAccessException unavailable) { databaseUnavailable(); }
            Set<String> endpoints = sessionEndpoints(session);
            endpoints.add(subscription.getEndpointHash());
            session.setAttribute(SESSION_ENDPOINTS, endpoints);
        }
    }

    public boolean subscribed(long userId, String endpoint, HttpSession session) {
        if (!available()) return false;
        PushSubscription existing;
        try { existing = dao.find(PushSafety.hash(PushSafety.endpoint(endpoint))); }
        catch (DataAccessException unavailable) { databaseUnavailable(); return false; }
        boolean owned = existing != null && Long.valueOf(userId).equals(existing.getUserId());
        if (owned) synchronized (session) {
            requireOpen(session);
            Set<String> endpoints = sessionEndpoints(session);
            endpoints.add(existing.getEndpointHash());
            session.setAttribute(SESSION_ENDPOINTS, endpoints);
        }
        return owned;
    }

    public void remove(long userId, String endpoint, HttpSession session) {
        requireAvailable();
        String hash = PushSafety.hash(PushSafety.endpoint(endpoint));
        try { dao.removeOwned(userId, hash); }
        catch (DataAccessException unavailable) { databaseUnavailable(); }
        synchronized (session) {
            Set<String> endpoints = sessionEndpoints(session);
            endpoints.remove(hash);
            session.setAttribute(SESSION_ENDPOINTS, endpoints);
        }
    }

    public void test(long userId, String endpoint, HttpSession session) {
        requireAvailable();
        String hash = PushSafety.hash(PushSafety.endpoint(endpoint));
        PushSubscription subscription;
        try { subscription = dao.find(hash); }
        catch (DataAccessException unavailable) { databaseUnavailable(); return; }
        ensureOwner(subscription, userId);
        if (!dao.userEnabled(userId)) throw new ResponseStatusException(HttpStatus.CONFLICT, "먼저 복약 알림 설정을 켜 주세요.");
        synchronized (session) {
            requireOpen(session);
            Object previous = session.getAttribute(SESSION_TEST_AT);
            if (previous instanceof Long && clock.millis() - (Long) previous < 30_000)
                throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "테스트 알림은 30초 뒤 다시 보낼 수 있어요.");
            session.setAttribute(SESSION_TEST_AT, clock.millis());
        }
        try {
            String payload = new ObjectMapper().writeValueAsString(Map.of("type", "notification-permission",
                "title", "제때약 알림 연결 확인", "body", "앱을 닫아도 이 기기에서 복약 알림을 받을 수 있어요.",
                "tag", "jette-yak-push-test", "url", "/"));
            int status = sender.send(subscription, payload, 60);
            if (status == 404 || status == 410) {
                dao.removeOwned(userId, hash);
                throw new ResponseStatusException(HttpStatus.GONE, "알림 연결이 만료됐어요. 이 기기의 알림을 다시 켜 주세요.");
            }
            if (status < 200 || status >= 300) throw new IllegalStateException();
        } catch (ResponseStatusException expected) { throw expected; }
        catch (Exception failed) {
            if (failed instanceof InterruptedException) Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "테스트 알림을 보내지 못했어요. 잠시 후 다시 시도해 주세요.");
        }
    }

    /** 로그아웃한 기기만 해제. 로그인 만료만으로 다른 기기의 알림까지 끄지 않음 */
    public void removeForSession(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session == null) return;
        Object userId = session.getAttribute("userId");
        if (!(userId instanceof Number)) return;
        synchronized (session) {
            session.setAttribute(SESSION_CLOSED, true);
            try {
                for (String hash : new ArrayList<>(sessionEndpoints(session))) dao.removeOwned(((Number) userId).longValue(), hash);
            } catch (DataAccessException unavailable) {
                session.removeAttribute(SESSION_CLOSED);
                databaseUnavailable();
            }
            session.removeAttribute(SESSION_ENDPOINTS);
        }
    }

    @SuppressWarnings("unchecked") private static Set<String> sessionEndpoints(HttpSession session) {
        Object value = session.getAttribute(SESSION_ENDPOINTS);
        return value instanceof Set ? new LinkedHashSet<>((Set<String>) value) : new LinkedHashSet<>();
    }
    private static void ensureOwner(PushSubscription subscription, long userId) {
        if (subscription == null || !Long.valueOf(userId).equals(subscription.getUserId()))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "다른 계정의 알림 연결이에요. 이 기기의 알림을 해제한 뒤 다시 켜 주세요.");
    }
    private static void requireOpen(HttpSession session) {
        if (Boolean.TRUE.equals(session.getAttribute(SESSION_CLOSED)))
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "다시 로그인한 뒤 알림을 설정해 주세요.");
    }
    private static void badInput() { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "알림 연결 정보를 다시 확인해 주세요."); }
    private void databaseUnavailable() {
        healthy = false; nextHealthCheck = clock.millis() + 30_000;
        throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "알림 저장소에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
}
