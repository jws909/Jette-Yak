package com.app.dto;

import lombok.Data;

@Data
public class ScheduleAddDTO {
    private Long scheduleId;
    private Long userId;
    private String name;
    private String type; // 'regular' | 'supplement' | 'prescription'
    private String medicationId;
    private Long routineId;
    private Long cabinetId;
    private Long prescriptionId;
    private Integer alarmEnabled;
    private String scheduledDate; 
    private String scheduledTime; 
}