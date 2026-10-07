package com.app.push;

/** 브라우저별 알림 주소와 암호화 키. 로그·화면에 노출하지 않는 전송용 데이터 */
public class PushSubscription {
    private Long subscriptionId;
    private Long userId;
    private String endpoint;
    private String endpointHash;
    private String publicKey;
    private String authSecret;

    public Long getSubscriptionId() { return subscriptionId; }
    public void setSubscriptionId(Long value) { subscriptionId = value; }
    public Long getUserId() { return userId; }
    public void setUserId(Long value) { userId = value; }
    public String getEndpoint() { return endpoint; }
    public void setEndpoint(String value) { endpoint = value; }
    public String getEndpointHash() { return endpointHash; }
    public void setEndpointHash(String value) { endpointHash = value; }
    public String getPublicKey() { return publicKey; }
    public void setPublicKey(String value) { publicKey = value; }
    public String getAuthSecret() { return authSecret; }
    public void setAuthSecret(String value) { authSecret = value; }
}
