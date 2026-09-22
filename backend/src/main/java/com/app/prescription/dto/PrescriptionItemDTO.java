package com.app.prescription.dto;

import lombok.Data;

@Data
public class PrescriptionItemDTO {
    /** 처방 항목 고유 식별 번호 (PK) */
    private Long itemId;

    /** 처방전 번호 (FK) */
    private Long prescriptionId;

    /** 식약처 품목코드 (FK -> medications.item_seq / medication_id) */
    private String medicationId;

    /** 1회 투약량 (정/포 단위) */
    private Double dailyDose;

    /** 1일 투약 횟수 */
    private Integer dailyFrequency;

    /** 총 투약 일수 */
    private Integer totalDays;

    /** 복용 시점 및 용법 (예: 식후 30분, 아침/저녁) */
    private String usageTiming;

    // --- medications 조인 조회 필드 ---
    /** 공식 의약품명 */
    private String itemName;

    /** 보험 청구 코드 (EDI 코드) */
    private String ediCode;

    /** 효능군 분류명 (예: 혈압강하제, 소화기관용약) */
    private String className;

    /** 주성분명 */
    private String materialName;

    /** 효능·효과 상세 */
    private String efficacy;

    /** 용법·용량 상세 */
    private String usageDosage;

    /** 판매중단 여부 */
    private Boolean isDiscontinued;
}
