/**
 * 역할: 제품명 검색과 품목코드 상세 조회 DAO 계약
 * 반환 기준: 화면과 AI에 필요한 필드만 MedicationChatDto로 전달
 */
package com.app.chatbot.dao;
import com.app.chatbot.dto.MedicationChatDto;
import java.util.List;

public interface ChatbotDao {
    MedicationChatDto findChatMedicationByItemSeq(String itemSeq);
    List<MedicationChatDto> searchChatMedicationsByName(String keyword, int offset, int limit);
    int countChatMedicationsByName(String keyword);
}
