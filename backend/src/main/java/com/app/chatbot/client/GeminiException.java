/**
 * 파일 역할: Gemini 호출 실패를 HTTP 상태와 사용자용 메시지로 전달하는 예외입니다.
 * 핵심 규칙: API 키, 모델, 할당량, 응답 형식 오류를 컨트롤러까지 일관되게 전달할 때 사용합니다.
 */
package com.app.chatbot.client;

public class GeminiException extends RuntimeException {
    private final int status;
    public GeminiException(int status, String message) {
        super(message);
        this.status = status;
    }
    public int getStatus() { return status; }
}