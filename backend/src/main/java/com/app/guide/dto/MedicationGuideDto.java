package com.app.guide.dto;
import lombok.Data;
@Data
public class MedicationGuideDto {
    private String medicationId;
    private String itemName;
    private String itemImageUrl;
    private String entpName;
    private String materialName;
    private String etcOtcCode;
    private String efficacy;
    private String usageDosage;
}
