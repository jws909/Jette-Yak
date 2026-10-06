/**
 * 역할: 게시글·댓글 신고 대상과 사용자가 작성한 상세 사유 전달
 * 보안 기준: 신고자 번호는 DTO에서 받지 않고 서버 세션에서 결정
 */
package com.app.community.dto;

public class CommunityReportRequest {
    // POST 또는 COMMENT
    private String targetType;
    // 신고할 게시글 번호 또는 댓글 번호
    private Long targetId;
    // 서버 허용 목록에 포함된 분류 코드
    private String reason;
    // 관리자 화면에 표시할 사용자의 설명
    private String detail;
    public String getTargetType() { return targetType; }
    public void setTargetType(String targetType) { this.targetType = targetType; }
    public Long getTargetId() { return targetId; }
    public void setTargetId(Long targetId) { this.targetId = targetId; }
    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
    public String getDetail() { return detail; }
    public void setDetail(String detail) { this.detail = detail; }
}
