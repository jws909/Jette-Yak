/**
 * 파일 역할: 관리자가 게시글 노출 상태 또는 신고 처리 상태를 변경할 때 사용하는 요청 DTO입니다.
 * 핵심 규칙: 허용 상태값 검증과 관리자 권한 확인은 서비스에서 수행합니다.
 */
package com.app.community.dto;

public class CommunityModerationRequest {
    private String status;
    private String resolutionNote;
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getResolutionNote() { return resolutionNote; }
    public void setResolutionNote(String resolutionNote) { this.resolutionNote = resolutionNote; }
}
