package com.app.dto;

import lombok.Data;

@Data
public class ScheduleDTO {
    private Long scheduleId;
    private String medicationId;
    private String name;           // medications.item_name
    private String type;           // prescription, regular, supplement
    private String time;           // HH24:MI 문자열
    private String takenAt;        // null 여부로 체크 판단
    private Boolean alarmEnabled;
}