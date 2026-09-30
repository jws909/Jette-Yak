/**
 * 파일 역할: 댓글 작성에 필요한 게시글 ID와 본문을 받는 요청 DTO입니다.
 * 핵심 규칙: 작성자 ID는 위·변조 방지를 위해 서버 세션에서 채웁니다.
 */
package com.app.community.dto;

public class CommunityCommentRequest {
    private String content;
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
}
