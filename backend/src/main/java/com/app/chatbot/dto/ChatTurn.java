/**
 * 파일 역할: 이전 대화 한 건의 역할(user/assistant)과 내용을 표현합니다.
 * 핵심 규칙: 컨트롤러에서 허용 역할, 길이, 대화 개수를 검증한 뒤 AI 문맥으로 사용합니다.
 */
package com.app.chatbot.dto;

/** A validated, bounded turn supplied only to preserve conversational context. */
public class ChatTurn {
    private String role;
    private String content;

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
}
