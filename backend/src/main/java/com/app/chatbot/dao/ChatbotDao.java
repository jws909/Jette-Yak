package com.app.chatbot.dao;
import com.app.chatbot.dto.MedicationChatDto;
import java.util.List;

public interface ChatbotDao {
    MedicationChatDto findChatMedicationByItemSeq(String itemSeq);
    List<MedicationChatDto> searchChatMedicationsByName(String keyword, int offset, int limit);
    int countChatMedicationsByName(String keyword);
}
