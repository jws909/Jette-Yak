package com.app.prescription.dto;

import lombok.Data;

@Data
public class MatchedMedicationDTO {
    private String itemSeq;
    private String ediCode;
    private String itemName;
    private String className;
    private Boolean isDiscontinued;
}
