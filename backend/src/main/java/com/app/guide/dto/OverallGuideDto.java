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
