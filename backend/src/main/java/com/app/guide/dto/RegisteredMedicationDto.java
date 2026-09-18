package com.app.guide.dto;
import lombok.Data;
@Data
public class RegisteredMedicationDto {
    private String registrationId;
    private String source;
    private String medicationId;
    private String itemName;
    private String entpName;
    private String startDate;
    private String endDate;
    private String notes;
    private String takeTime;
}
