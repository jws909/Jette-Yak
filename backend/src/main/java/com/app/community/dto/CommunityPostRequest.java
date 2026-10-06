/**
 * 역할: 게시글 작성·수정 화면에서 전달한 내용과 복용 경험 정보 보관
 * 약 연결 기준: medicationId가 있을 때만 공식 제품과 연결, medicationName은 표시용 문자열
 */
package com.app.community.dto;

public class CommunityPostRequest {
    // 공식 의약품 연결 정보
    private String medicationId;
    private String medicationName;
    // 게시글 기본 내용
    private String category;
    private String title;
    private String content;
    // 사용자가 선택적으로 작성하는 복용 경험 정보
    private String experienceDuration;
    private String ageGroup;
    private String purpose;
    private String occurrenceTiming;
    private Boolean currentlyTaking;

    public String getMedicationId() { return medicationId; }
    public void setMedicationId(String medicationId) { this.medicationId = medicationId; }
    public String getMedicationName() { return medicationName; }
    public void setMedicationName(String medicationName) { this.medicationName = medicationName; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
    public String getExperienceDuration() { return experienceDuration; }
    public void setExperienceDuration(String experienceDuration) { this.experienceDuration = experienceDuration; }
    public String getAgeGroup() { return ageGroup; }
    public void setAgeGroup(String ageGroup) { this.ageGroup = ageGroup; }
    public String getPurpose() { return purpose; }
    public void setPurpose(String purpose) { this.purpose = purpose; }
    public String getOccurrenceTiming() { return occurrenceTiming; }
    public void setOccurrenceTiming(String occurrenceTiming) { this.occurrenceTiming = occurrenceTiming; }
    public Boolean getCurrentlyTaking() { return currentlyTaking; }
    public void setCurrentlyTaking(Boolean currentlyTaking) { this.currentlyTaking = currentlyTaking; }
}
