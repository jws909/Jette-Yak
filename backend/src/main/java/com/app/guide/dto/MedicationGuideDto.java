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
    private String className;
    private String efficacy;
    private String usageDosage;
    private String aiSummaryJson;

    public String getMedicationId() { return medicationId; }
    public void setMedicationId(String medicationId) { this.medicationId = medicationId; }

    public String getItemName() { return itemName; }
    public void setItemName(String itemName) { this.itemName = itemName; }

    public String getItemImageUrl() { return itemImageUrl; }
    public void setItemImageUrl(String itemImageUrl) { this.itemImageUrl = itemImageUrl; }

    public String getEntpName() { return entpName; }
    public void setEntpName(String entpName) { this.entpName = entpName; }

    public String getMaterialName() { return materialName; }
    public void setMaterialName(String materialName) { this.materialName = materialName; }

    public String getEtcOtcCode() { return etcOtcCode; }
    public void setEtcOtcCode(String etcOtcCode) { this.etcOtcCode = etcOtcCode; }

    public String getClassName() { return className; }
    public void setClassName(String className) { this.className = className; }

    public String getEfficacy() { return efficacy; }
    public void setEfficacy(String efficacy) { this.efficacy = efficacy; }

    public String getUsageDosage() { return usageDosage; }
    public void setUsageDosage(String usageDosage) { this.usageDosage = usageDosage; }

    public String getAiSummaryJson() { return aiSummaryJson; }
    public void setAiSummaryJson(String aiSummaryJson) { this.aiSummaryJson = aiSummaryJson; }
}
