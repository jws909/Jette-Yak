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
