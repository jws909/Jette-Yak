package com.app.push;

/** 테스트에서 실제 외부 전송을 대체할 수 있는 경계 */
public interface PushSender {
    boolean ready();
    String publicKey();
    int send(PushSubscription subscription, String payload, int ttlSeconds) throws Exception;
}
