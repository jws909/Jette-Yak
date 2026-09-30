/**
 * 파일 역할: Gemini가 반환한 상담 답변, 후속 질문, 긴급도를 묶어 전달하는 불변 응답 객체입니다.
 * 핵심 규칙: MedicationChatService는 이 값을 화면 응답 형식으로 변환합니다.
 */
package com.app.chatbot.client;

import java.util.List;

public record ConversationAnswer(String answer, List<String> followUpQuestions, String urgency) {}
