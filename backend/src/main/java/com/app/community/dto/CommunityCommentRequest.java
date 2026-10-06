/**
 * 역할: 댓글 작성 요청의 본문 전달
 * 보안 기준: 작성자 번호는 DTO에 두지 않고 로그인 세션에서만 확인
 */
package com.app.community.dto;

public class CommunityCommentRequest {
    private String content;
    // 값이 있으면 해당 댓글 아래에 표시되는 답글로 저장
    private Long parentCommentId;
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
    public Long getParentCommentId() { return parentCommentId; }
    public void setParentCommentId(Long parentCommentId) { this.parentCommentId = parentCommentId; }
}
