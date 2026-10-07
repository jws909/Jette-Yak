package com.app.push;

/** PushSubscription.toJSON()의 필요한 필드만 받는 요청 */
public class PushInput {
    public String endpoint;
    public Long expirationTime;
    public Keys keys;
    public static class Keys {
        public String p256dh;
        public String auth;
    }
}
