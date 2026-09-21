package com.app.dto;

import lombok.Data;

@Data
public class ScheduleAddDTO {
    private Long userId;
    private String name;
    private String type;
    private String medicationId;
    private String scheduledDate; 
    private String scheduledTime; 
}