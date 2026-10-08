package com.app.push;

/** 커뮤니티 알림과 수신 기기 연결. 알림 본문·닉네임은 잠금 화면 전송 대상에서 제외 */
public class CommunityPushDelivery extends PushSubscription {
    private Long notificationId;
    private Long postId;
    private String notificationType;

    public Long getNotificationId() { return notificationId; }
    public void setNotificationId(Long value) { notificationId = value; }
    public Long getPostId() { return postId; }
    public void setPostId(Long value) { postId = value; }
    public String getNotificationType() { return notificationType; }
    public void setNotificationType(String value) { notificationType = value; }
}
