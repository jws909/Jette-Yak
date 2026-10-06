/**
 * 역할: 사용자 알림 저장, 목록 조회, 읽음 처리를 담당하는 MyBatis 접근 계층
 * 보안 기준: 조회와 변경 SQL은 항상 로그인한 userId를 조건에 포함
 */
package com.app.community.notification;

import java.util.List;
import java.util.Map;
import org.apache.ibatis.session.SqlSession;
import org.springframework.stereotype.Repository;

@Repository
public class NotificationDao {
    private static final String NS="com.app.community.NotificationMapper.";
    private final SqlSession session;
    public NotificationDao(SqlSession session){this.session=session;}
    public void insert(Map<String,Object> values){session.insert(NS+"insert",values);}
    public void insertForAdmins(Map<String,Object> values){session.insert(NS+"insertForAdmins",values);}
    public List<Map<String,Object>> findByUser(long userId){return session.selectList(NS+"findByUser",userId);}
    public int markRead(long notificationId,long userId){return session.update(NS+"markRead",Map.of("notificationId",notificationId,"userId",userId));}
    public int markAllRead(long userId){return session.update(NS+"markAllRead",userId);}
}
