package com.app.dto;

import lombok.Data;
import java.util.List;

@Data
public class PrescriptionScheduleGenerateDTO {
    private Long prescriptionId;
    private Long userId;
    private String startDate;    // 처방 시작일 ("YYYY-MM-DD")
    private int totalDays;       // 처방전 총 일수 (예: 7, 14)
    private List<PrescriptionMedicineDTO> medicines;

    @Data
    public static class PrescriptionMedicineDTO {
        private String medicationId;
        private List<String> intakeTimes; // 복용 시간대 목록 (예: ["08:00", "12:30", "19:00"])
    }
}