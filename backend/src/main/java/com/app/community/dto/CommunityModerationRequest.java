package com.app.community.dto;

public class CommunityModerationRequest {
    private String status;
    private String resolutionNote;
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getResolutionNote() { return resolutionNote; }
    public void setResolutionNote(String resolutionNote) { this.resolutionNote = resolutionNote; }
}
