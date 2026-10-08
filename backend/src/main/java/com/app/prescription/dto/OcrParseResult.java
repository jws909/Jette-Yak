package com.app.prescription.dto;

import java.util.Date;
import java.util.List;
import lombok.Data;

@Data
public class OcrParseResult {
    private String hospitalName;
    private String doctorName;
    private Date dispensedDate;
    private Integer totalDays;
    private List<ParsedItem> items;
    private String rawOcrText;

    @Data
    public static class ParsedItem {
        private String ediCode;
        private String medicineName;
        private Double dailyDose;
        private Integer dailyFrequency;
        private Integer totalDays;
        private String usageTiming;
    }
}
