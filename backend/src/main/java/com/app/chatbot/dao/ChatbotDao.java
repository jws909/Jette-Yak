/**
 * 파일 역할: 제품명 검색과 품목코드 상세 조회를 제공하는 챗봇용 DAO 계약입니다.
 * 핵심 규칙: 화면에 전달할 필드는 MedicationChatDto로 제한합니다.
 */
package com.app.chatbot.dao;
import com.app.chatbot.dto.MedicationChatDto;
import java.util.List;

public interface ChatbotDao {
    MedicationChatDto findChatMedicationByItemSeq(String itemSeq);
    List<MedicationChatDto> searchChatMedicationsByName(String keyword, int offset, int limit);
    int countChatMedicationsByName(String keyword);
}
