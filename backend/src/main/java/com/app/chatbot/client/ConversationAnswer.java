/**
 * 역할: Gemini 상담 답변, 후속 질문, 긴급도를 묶는 불변 응답
 * 사용 흐름: MedicationChatService에서 화면용 응답 Map으로 변환
 */
package com.app.chatbot.client;

import java.util.List;

public record ConversationAnswer(String answer, List<String> followUpQuestions, String urgency) {}
