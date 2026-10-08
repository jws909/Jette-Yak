package com.app.push;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.apache.ibatis.session.SqlSession;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Repository;

/** 저장 완료된 사용자 알림을 기기별 발송 대기열로 연결. UNIQUE와 임대 토큰으로 중복 차단 */
@Repository
public class CommunityPushDao {
    private static final String NS = "com.app.push.CommunityPushDao.";
    private final SqlSession sql;
    public CommunityPushDao(SqlSession sql) { this.sql = sql; }

    public boolean schemaReady() { sql.selectOne(NS + "schemaReady"); return true; }

    public void enqueue(Instant now, Instant cutoff) {
        try { sql.insert(NS + "enqueue", window(now, cutoff)); }
        catch (DuplicateKeyException simultaneous) { /* 다른 서버가 같은 알림·기기를 먼저 연결. 다음 조회에서 이어 처리 */ }
    }

    public List<CommunityPushDelivery> pending(Instant now, Instant cutoff) {
        return sql.selectList(NS + "pending", window(now, cutoff));
    }

    public String claim(CommunityPushDelivery delivery, Instant now, Instant cutoff) {
        Map<String,Object> values = key(delivery, now);
        String token = UUID.randomUUID().toString();
        values.put("claimToken", token);
        values.put("leaseUntil", utc(now.plusSeconds(45)));
        values.put("cutoff", utc(cutoff));
        return sql.update(NS + "claim", values) == 1 ? token : null;
    }

    public boolean eligible(CommunityPushDelivery delivery, Instant now, Instant cutoff) {
        Map<String,Object> values = key(delivery, now);
        values.put("cutoff", utc(cutoff));
        return Integer.valueOf(1).equals(sql.selectOne(NS + "eligible", values));
    }

    public void finish(CommunityPushDelivery delivery, String token, boolean sent, boolean retry, Instant now) {
        Map<String,Object> values = key(delivery, now);
        values.put("claimToken", token);
        values.put("status", sent ? "SENT" : retry ? "RETRY" : "FAILED");
        values.put("retryAt", utc(now.plusSeconds(30)));
        sql.update(NS + "finish", values);
    }

    public void cleanup(Instant before) { sql.delete(NS + "cleanup", utc(before)); }

    private static Map<String,Object> key(CommunityPushDelivery delivery, Instant now) {
        Map<String,Object> values = new HashMap<>();
        values.put("subscriptionId", delivery.getSubscriptionId());
        values.put("notificationId", delivery.getNotificationId());
        values.put("userId", delivery.getUserId());
        values.put("now", utc(now));
        return values;
    }
    private static Map<String,Object> window(Instant now, Instant cutoff) {
        return Map.of("now", utc(now), "cutoff", utc(cutoff));
    }
    // Oracle DATE·TIMESTAMP는 시간대가 없는 값. JVM 지역과 관계없이 기존 SYSDATE 저장값과 같은 UTC 벽시각 전달
    private static Timestamp utc(Instant instant) { return Timestamp.valueOf(LocalDateTime.ofInstant(instant, ZoneOffset.UTC)); }
}
