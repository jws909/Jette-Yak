package com.app.community.dto;

public class CommunityPostRequest {
    private String medicationId;
    private String medicationName;
    private String category;
    private String title;
    private String content;
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
