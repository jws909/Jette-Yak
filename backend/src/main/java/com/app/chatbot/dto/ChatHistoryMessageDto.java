/**
 * 역할: DB에 저장된 챗봇 메시지 한 건을 화면 응답으로 복원
 * payloadJson: 답변 근거, 선택 목록, 경고 같은 부가 응답 보관
 */
package com.app.chatbot.dto;

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
