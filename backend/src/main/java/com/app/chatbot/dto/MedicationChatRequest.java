/**
 * 파일 역할: 챗봇 질문, 선택한 품목코드, 최근 질문과 대화 이력을 받는 요청 DTO입니다.
 * 핵심 규칙: 사용자 식별값은 포함하지 않으며 로그인 사용자는 서버 세션에서 확인합니다.
 */
package com.app.chatbot.dto;
import java.util.List;
import java.util.Map;
public class MedicationChatRequest {
    private List<String> recentQuestions = List.of();
    private List<ChatTurn> conversation = List.of();
    public List<String> getRecentQuestions() { return recentQuestions; }
    public void setRecentQuestions(List<String> value) { recentQuestions = value == null ? List.of() : value; }
    public List<ChatTurn> getConversation() { return conversation; }
    public void setConversation(List<ChatTurn> value) { conversation = value == null ? List.of() : value; }
    private String itemSeq;
    private String question;
    private Map<String, String> selections = Map.of();
    public String getItemSeq() { return itemSeq; }
    public void setItemSeq(String value) { itemSeq = value; }
    public String getQuestion() { return question; }
    public void setQuestion(String value) { question = value; }
    public Map<String, String> getSelections() { return selections; }
    public void setSelections(Map<String, String> value) { selections = value == null ? Map.of() : value; }
}
