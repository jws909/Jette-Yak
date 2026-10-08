/**
 * 역할: 활성 복용약 전체를 기준으로 생성한 AI 통합 복약 가이드 전달
 * 캐시 기준: 입력 약 목록 서명과 생성 결과를 함께 관리해 불필요한 재생성 방지
 */
package com.app.guide.dto;

import lombok.Data;

@Data
public class OverallGuideDto {
    private Long userId;
    private String aiGuide;
    private String medUpdatedAt;

    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }

    public String getAiGuide() { return aiGuide; }
    public void setAiGuide(String aiGuide) { this.aiGuide = aiGuide; }

    public String getMedUpdatedAt() { return medUpdatedAt; }
    public void setMedUpdatedAt(String medUpdatedAt) { this.medUpdatedAt = medUpdatedAt; }
}
