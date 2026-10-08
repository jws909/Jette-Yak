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
    private Integer repeatDays; // 복용 반복 일수 (1: 당일만, 7, 14, 30, 90 등)
    private String weekdayTime; // 평일 복용 시간 (HH:mm)
    private String weekendTime; // 주말 복용 시간 (HH:mm)

    public Long getScheduleId() { return scheduleId; }
    public void setScheduleId(Long scheduleId) { this.scheduleId = scheduleId; }

    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public String getMedicationId() { return medicationId; }
    public void setMedicationId(String medicationId) { this.medicationId = medicationId; }

    public Long getRoutineId() { return routineId; }
    public void setRoutineId(Long routineId) { this.routineId = routineId; }

    public Long getCabinetId() { return cabinetId; }
    public void setCabinetId(Long cabinetId) { this.cabinetId = cabinetId; }

    public Long getPrescriptionId() { return prescriptionId; }
    public void setPrescriptionId(Long prescriptionId) { this.prescriptionId = prescriptionId; }

    public Integer getAlarmEnabled() { return alarmEnabled; }
    public void setAlarmEnabled(Integer alarmEnabled) { this.alarmEnabled = alarmEnabled; }

    public String getScheduledDate() { return scheduledDate; }
    public void setScheduledDate(String scheduledDate) { this.scheduledDate = scheduledDate; }

    public String getScheduledTime() { return scheduledTime; }
    public void setScheduledTime(String scheduledTime) { this.scheduledTime = scheduledTime; }

    public Integer getRepeatDays() { return repeatDays; }
    public void setRepeatDays(Integer repeatDays) { this.repeatDays = repeatDays; }

    public String getWeekdayTime() { return weekdayTime; }
    public void setWeekdayTime(String weekdayTime) { this.weekdayTime = weekdayTime; }

    public String getWeekendTime() { return weekendTime; }
    public void setWeekendTime(String weekendTime) { this.weekendTime = weekendTime; }
}