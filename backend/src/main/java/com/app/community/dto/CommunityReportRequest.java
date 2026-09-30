/**
 * 파일 역할: 게시글 또는 댓글 신고 대상과 사용자가 작성한 사유를 받는 요청 DTO입니다.
 * 핵심 규칙: 신고자는 서버 세션에서 정하며 같은 사용자의 중복 신고 여부는 서비스·DB에서 확인합니다.
 */
package com.app.community.dto;

public class CommunityReportRequest {
    private String targetType;
    private Long targetId;
    private String reason;
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
