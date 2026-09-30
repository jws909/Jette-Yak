package com.app.chatbot.dto;

/** 저장된 챗봇 메시지 한 건을 복원하기 위한 DTO다. */
public class ChatHistoryMessageDto {
    private long messageId;
    private String role;
    private String content;
    private String payloadJson;
    private String createdAt;
    public long getMessageId(){return messageId;}
    public void setMessageId(long value){messageId=value;}
    public String getRole(){return role;}
    public void setRole(String value){role=value;}
    public String getContent(){return content;}
    public void setContent(String value){content=value;}
    public String getPayloadJson(){return payloadJson;}
    public void setPayloadJson(String value){payloadJson=value;}
    public String getCreatedAt(){return createdAt;}
    public void setCreatedAt(String value){createdAt=value;}
}
