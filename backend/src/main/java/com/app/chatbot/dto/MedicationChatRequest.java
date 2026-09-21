package com.app.chatbot.dto;
import java.util.Map;
public class MedicationChatRequest {
    private java.util.List<String> recentQuestions = java.util.List.of();
    public java.util.List<String> getRecentQuestions() { return recentQuestions; }
    public void setRecentQuestions(java.util.List<String> value) { recentQuestions = value == null ? java.util.List.of() : value; }
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
