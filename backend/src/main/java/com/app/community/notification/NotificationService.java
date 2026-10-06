/**
 * 역할: 커뮤니티와 관리자 기능에서 발생한 이벤트를 수신자별 알림으로 기록
 * 개인정보 기준: 알림 목록은 세션 사용자 자신의 기록만 반환
 */
package com.app.community.notification;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class NotificationService {
    private final NotificationDao dao;
    public NotificationService(NotificationDao dao){this.dao=dao;}

    public List<Map<String,Object>> list(long userId){return dao.findByUser(userId);}

    @Transactional
    public void notifyUser(long userId,Long actorId,String type,String title,String content,String targetType,Long targetId,Long postId){
        if(userId<=0||(actorId!=null&&actorId.longValue()==userId))return;
        Map<String,Object> values=new HashMap<>();
        values.put("userId",userId);values.put("actorId",actorId);values.put("type",type);
        values.put("title",trim(title,150));values.put("content",trim(content,1000));
        values.put("targetType",targetType);values.put("targetId",targetId);values.put("postId",postId);
        dao.insert(values);
    }

    @Transactional
    public void notifyAdmins(long actorId,String title,String content,String targetType,Long targetId,Long postId){
        Map<String,Object> values=new HashMap<>();
        values.put("actorId",actorId);values.put("type","ADMIN_REPORT");values.put("title",trim(title,150));
        values.put("content",trim(content,1000));values.put("targetType",targetType);values.put("targetId",targetId);values.put("postId",postId);
        dao.insertForAdmins(values);
    }

    public void markRead(long notificationId,long userId){
        if(notificationId<=0||dao.markRead(notificationId,userId)==0)throw new IllegalArgumentException("알림을 찾을 수 없습니다.");
    }
    public void markAllRead(long userId){dao.markAllRead(userId);}
    private static String trim(String value,int max){String v=value==null?"":value.trim();return v.length()>max?v.substring(0,max):v;}
}
