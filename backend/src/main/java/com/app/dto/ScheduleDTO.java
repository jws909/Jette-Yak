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
    private Long userId;
    private Long cabinetId;
    private Long routineId;
    private String scheduledDate;
    private Boolean isCancelled;
    private Long prescriptionId;   // 연결된 처방전 ID
    private String slot;           // breakfast, lunch, dinner, bedtime
    private String slotLabel;      // 아침, 점심, 저녁, 취침전

    public Long getScheduleId() { return scheduleId; }
    public void setScheduleId(Long scheduleId) { this.scheduleId = scheduleId; }

    public String getMedicationId() { return medicationId; }
    public void setMedicationId(String medicationId) { this.medicationId = medicationId; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public String getTime() { return time; }
    public void setTime(String time) { this.time = time; }

    public String getTakenAt() { return takenAt; }
    public void setTakenAt(String takenAt) { this.takenAt = takenAt; }

    public Boolean getAlarmEnabled() { return alarmEnabled; }
    public void setAlarmEnabled(Boolean alarmEnabled) { this.alarmEnabled = alarmEnabled; }

    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }

    public Long getCabinetId() { return cabinetId; }
    public void setCabinetId(Long cabinetId) { this.cabinetId = cabinetId; }

    public Long getRoutineId() { return routineId; }
    public void setRoutineId(Long routineId) { this.routineId = routineId; }

    public String getScheduledDate() { return scheduledDate; }
    public void setScheduledDate(String scheduledDate) { this.scheduledDate = scheduledDate; }

    public Boolean getIsCancelled() { return isCancelled; }
    public void setIsCancelled(Boolean isCancelled) { this.isCancelled = isCancelled; }

    public Long getPrescriptionId() { return prescriptionId; }
    public void setPrescriptionId(Long prescriptionId) { this.prescriptionId = prescriptionId; }

    public String getSlot() { return slot; }
    public void setSlot(String slot) { this.slot = slot; }

    public String getSlotLabel() { return slotLabel; }
    public void setSlotLabel(String slotLabel) { this.slotLabel = slotLabel; }
}