package com.app.chatbot.client;

public class GeminiException extends RuntimeException {
    private final int status;
    public GeminiException(int status, String message) {
        super(message);
        this.status = status;
    }
    public int getStatus() { return status; }
}