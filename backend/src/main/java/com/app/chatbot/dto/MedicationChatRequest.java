package com.app.chatbot.dto;
import java.util.Map;
public class MedicationChatRequest {
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
