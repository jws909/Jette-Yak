/**
 * 역할: ChatbotDao 메서드를 MyBatis SqlSession 호출로 연결
 * 매핑 기준: SQL 식별자는 chatbot_mapper.xml의 namespace와 id에 맞춤
 */
package com.app.chatbot.dao.impl;
import java.util.Map;
import org.apache.ibatis.session.SqlSession;
import org.springframework.stereotype.Repository;
import com.app.chatbot.dao.ChatbotDao;
import com.app.chatbot.dto.MedicationChatDto;
import java.util.List;
@Repository
public class ChatbotDaoImpl implements ChatbotDao {
    private static final String NAMESPACE = "com.app.chatbot.dao.ChatbotDao.";
    private final SqlSession sqlSession;
    public ChatbotDaoImpl(SqlSession sqlSession) { this.sqlSession = sqlSession; }
    @Override
    public MedicationChatDto findChatMedicationByItemSeq(String itemSeq) {

		return sqlSession.selectOne(NAMESPACE + "findChatMedicationByItemSeq", Map.of("itemSeq", itemSeq));
	}

    @Override
    public List<MedicationChatDto> searchChatMedicationsByName(String keyword, int offset, int limit) {
        return sqlSession.selectList(NAMESPACE + "searchChatMedicationsByName",
            Map.of("keyword", keyword, "offset", offset, "limit", limit));
    }

    @Override
    public int countChatMedicationsByName(String keyword) {
        return sqlSession.selectOne(NAMESPACE + "countChatMedicationsByName", Map.of("keyword", keyword));
    }
}
