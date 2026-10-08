package com.app.push;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.logging.Logger;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 댓글·도움 표시·관리자 처리 결과를 앱 종료 후에도 전달.
 * HTTP 요청 안에서 보내지 않고 커밋된 user_notifications만 조회해 롤백된 이벤트 발송 방지.
 */
@Component
public class CommunityPushScheduler {
    private static final Logger LOG = Logger.getLogger(CommunityPushScheduler.class.getName());
    private static final Duration MAX_AGE = Duration.ofMinutes(10);
    private final CommunityPushDao queue;
    private final PushDao devices;
    private final PushSender sender;
    private final PushSubscriptionService subscriptions;
    private final Clock clock;
    private final ObjectMapper json = new ObjectMapper();
    private long nextSchemaCheck;
    private long nextCleanup;
    private long nextWarning;
    private boolean schemaReady;

    @Autowired public CommunityPushScheduler(CommunityPushDao queue, PushDao devices, PushSender sender,
            PushSubscriptionService subscriptions) {
        this(queue, devices, sender, subscriptions, Clock.systemUTC());
    }
    public CommunityPushScheduler(CommunityPushDao queue, PushDao devices, PushSender sender,
            PushSubscriptionService subscriptions, Clock clock) {
        this.queue = queue; this.devices = devices; this.sender = sender;
        this.subscriptions = subscriptions; this.clock = clock;
    }

    @Scheduled(initialDelay = 20000, fixedDelay = 15000) public void tick() {
        if (!available()) return;
        Instant now = clock.instant();
        long started = System.nanoTime();
        try {
            if (clock.millis() >= nextCleanup) {
                queue.cleanup(now.minus(Duration.ofDays(7)));
                nextCleanup = clock.millis() + 3_600_000;
            }
            queue.enqueue(now, now.minus(MAX_AGE));
            int sends = 0;
            for (CommunityPushDelivery delivery : queue.pending(now, now.minus(MAX_AGE))) {
                // 복약 스케줄러와 같은 실행기를 사용하므로 한 번에 오래 점유하지 않도록 제한
                if (sends >= 20 || System.nanoTime() - started >= Duration.ofSeconds(12).toNanos()) break;
                Instant attemptAt = clock.instant();
                String token = queue.claim(delivery, attemptAt, attemptAt.minus(MAX_AGE));
                if (token == null) continue;
                sends++;
                deliver(delivery, token);
            }
        } catch (RuntimeException unavailable) { warnOnce(); }
    }

    /** 복약 연결 준비와 별개로 커뮤니티 저장소 준비 상태를 설정 화면에 전달 */
    public synchronized boolean available() {
        if (!subscriptions.available()) return false;
        if (clock.millis() >= nextSchemaCheck) {
            try { schemaReady = queue.schemaReady(); }
            catch (RuntimeException missingSchema) { schemaReady = false; warnOnce(); }
            nextSchemaCheck = clock.millis() + 30_000;
        }
        return schemaReady;
    }

    private void deliver(CommunityPushDelivery delivery, String token) {
        try {
            // 대기 중 로그아웃·계정 전환·읽음 처리·전체 알림 끄기를 해도 이전 계정 알림이 나가지 않도록 재확인
            PushSubscription current = devices.find(delivery.getEndpointHash());
            Instant now = clock.instant();
            if (current == null || !delivery.getSubscriptionId().equals(current.getSubscriptionId())
                    || !delivery.getUserId().equals(current.getUserId()) || !devices.userEnabled(delivery.getUserId())
                    || !queue.eligible(delivery, now, now.minus(MAX_AGE))) {
                queue.finish(delivery, token, false, false, now);
                return;
            }
            int status = sender.send(delivery, payload(delivery), 300);
            if (status == 404 || status == 410) { devices.removeExpired(delivery.getSubscriptionId()); return; }
            queue.finish(delivery, token, status >= 200 && status < 300,
                status == 408 || status == 429 || status >= 500, clock.instant());
        } catch (Exception failed) {
            if (failed instanceof InterruptedException) Thread.currentThread().interrupt();
            queue.finish(delivery, token, false, true, clock.instant());
            warnOnce();
        }
    }

    String payload(CommunityPushDelivery delivery) throws com.fasterxml.jackson.core.JsonProcessingException {
        // 화면 잠금 상태에 민감한 게시글·신고 내용, 약 이름, 작성자 이름을 노출하지 않음
        String url = "ADMIN_REPORT".equals(delivery.getNotificationType()) ? "/admin"
            : delivery.getPostId() != null && delivery.getPostId() > 0 ? "/community?postId=" + delivery.getPostId() : "/";
        return json.writeValueAsString(Map.of("type", "community-notification", "title", "제때약 새 알림",
            "body", "새로운 커뮤니티 알림이 있어요. 제때약에서 확인해 주세요.",
            "tag", "jette-yak-notification-" + delivery.getNotificationId(), "url", url,
            "notificationId", delivery.getNotificationId()));
    }

    private void warnOnce() {
        if (clock.millis() >= nextWarning) {
            nextWarning = clock.millis() + 300_000;
            LOG.warning("커뮤니티 푸시 일부를 처리하지 못함. 커뮤니티 알림 전송 테이블과 서버 연결 확인 필요");
        }
    }
}
