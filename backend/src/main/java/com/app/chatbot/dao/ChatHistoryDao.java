/**
 * 역할: 사용자별 챗봇 대화방과 메시지를 MyBatis SQL로 저장·조회
 * 소유권 기준: conversationId와 userId를 함께 사용해 다른 사용자의 대화 접근 차단
 */
package com.app.chatbot.dao;

import java.util.List;
import java.util.Map;
import org.apache.ibatis.session.SqlSession;
import org.springframework.stereotype.Repository;
import com.app.chatbot.dto.ChatHistoryMessageDto;

@Repository
public class ChatHistoryDao {
    private static final String NS="com.app.chatbot.dao.ChatHistoryDao.";
    private final SqlSession session;
    public ChatHistoryDao(SqlSession session){this.session=session;}
    public long nextConversationId(){return session.selectOne(NS+"nextConversationId");}
    public long nextMessageId(){return session.selectOne(NS+"nextMessageId");}
    public int insertConversation(Map<String,Object> values){return session.insert(NS+"insertConversation",values);}
    public int updateConversation(Map<String,Object> values){return session.update(NS+"updateConversation",values);}
    public int insertMessage(Map<String,Object> values){return session.insert(NS+"insertMessage",values);}
    public int countOwned(long userId,long conversationId){return session.selectOne(NS+"countOwned",Map.of("userId",userId,"conversationId",conversationId));}
    public List<Map<String,Object>> findConversations(long userId){return session.selectList(NS+"findConversations",Map.of("userId",userId));}
    public Map<String,Object> findConversation(long userId,long conversationId){return session.selectOne(NS+"findConversation",Map.of("userId",userId,"conversationId",conversationId));}
    public List<ChatHistoryMessageDto> findMessages(long userId,long conversationId){return session.selectList(NS+"findMessages",Map.of("userId",userId,"conversationId",conversationId));}
    public int deleteConversation(long userId,long conversationId){return session.delete(NS+"deleteConversation",Map.of("userId",userId,"conversationId",conversationId));}
    public int deleteAllConversations(long userId){return session.delete(NS+"deleteAllConversations",userId);}
}
