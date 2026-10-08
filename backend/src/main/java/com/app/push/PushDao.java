package com.app.push;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.apache.ibatis.session.SqlSession;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Repository;

/** 구독 소유권과 전송 기록을 DB에 보관. 서버 재시작 후에도 중복 전송을 차단 */
@Repository
public class PushDao {
    private static final String NS = "com.app.push.PushDao.";
    private final SqlSession sql;
    public PushDao(SqlSession sql) { this.sql = sql; }

    public boolean schemaReady() {
        sql.selectOne(NS + "schemaReady");
        return true;
    }
    public PushSubscription find(String endpointHash) { return sql.selectOne(NS + "find", endpointHash); }
    public void insert(PushSubscription subscription) { sql.insert(NS + "insert", subscription); }
    public int updateOwned(PushSubscription subscription) { return sql.update(NS + "updateOwned", subscription); }
    public int removeOwned(long userId, String endpointHash) {
        return sql.delete(NS + "removeOwned", Map.of("userId", userId, "endpointHash", endpointHash));
    }
    public List<PushSubscription> activeSubscriptions() { return sql.selectList(NS + "activeSubscriptions"); }
    public boolean userEnabled(long userId) { return Integer.valueOf(1).equals(sql.selectOne(NS + "userEnabled", userId)); }
    public void removeExpired(long subscriptionId) { sql.delete(NS + "removeExpired", subscriptionId); }

    public String claim(long subscriptionId, String date, String time, String kind, Instant now) {
        Map<String,Object> values = delivery(subscriptionId, date, time, kind, now);
        try { sql.insert(NS + "ensureDelivery", values); }
        catch (DuplicateKeyException alreadyExists) { /* 다른 실행 또는 재시작 전에 만든 전송 기록 */ }
        String token = UUID.randomUUID().toString();
        values.put("claimToken", token);
        values.put("leaseUntil", Timestamp.from(now.plusSeconds(45)));
        return sql.update(NS + "claim", values) == 1 ? token : null;
    }
    public void finish(long subscriptionId, String date, String time, String kind, String token,
            boolean success, boolean retry, Instant now) {
        Map<String,Object> values = delivery(subscriptionId, date, time, kind, now);
        values.put("claimToken", token);
        values.put("status", success ? "SENT" : retry ? "RETRY" : "FAILED");
        values.put("retryAt", Timestamp.from(now.plusSeconds(30)));
        sql.update(NS + "finish", values);
    }
    public void cleanup(Instant before) { sql.delete(NS + "cleanup", Timestamp.from(before)); }

    private static Map<String,Object> delivery(long subscriptionId, String date, String time, String kind, Instant now) {
        Map<String,Object> values = new HashMap<>();
        values.put("subscriptionId", subscriptionId);
        values.put("doseDate", date);
        values.put("doseTime", time);
        values.put("kind", kind);
        values.put("now", Timestamp.from(now));
        return values;
    }
}
