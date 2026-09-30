package com.app.chatbot.dao;

import java.util.List;
import java.util.Map;
import org.apache.ibatis.session.SqlSession;
import org.springframework.stereotype.Repository;
import com.app.chatbot.dto.ChatHistoryMessageDto;

/** 로그인 사용자가 소유한 챗봇 대화와 메시지만 읽고 쓴다. */
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
}
