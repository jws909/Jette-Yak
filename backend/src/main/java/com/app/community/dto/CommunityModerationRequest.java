/**
 * 역할: 관리자 상태 변경값과 처리 메모 전달
 * 검증 위치: 관리자 세션과 허용 상태값을 서비스에서 재확인
 */
package com.app.community.dto;

public class CommunityModerationRequest {
    // 처리 대상에 따라 VISIBLE, HIDDEN, RESOLVED 같은 제한된 값 사용
    private String status;
    // 신고·정보 제보 처리 결과를 사용자에게 전달할 필수 사유
    private String resolutionNote;
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getResolutionNote() { return resolutionNote; }
    public void setResolutionNote(String resolutionNote) { this.resolutionNote = resolutionNote; }
}
