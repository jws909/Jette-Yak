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
