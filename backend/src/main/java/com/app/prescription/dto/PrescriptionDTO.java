package com.app.prescription.dto;

import java.util.Date;
import java.util.List;
import lombok.Data;

@Data
public class PrescriptionDTO {
    /** 처방전 고유 식별 번호 (PK) */
    private Long prescriptionId;

    /** 사용자 식별 번호 (FK) */
    private Long userId;

    /** 처방/조제 일자 */
    private Date dispensedDate;

    /** 총 투약 일수 */
    private Integer totalDays;

    /** 업로드된 처방전 이미지 파일 경로 */
    private String prescriptionImageUrl;

    /** AI 요약 원본 JSON 문자열 */
    private String aiSummaryJson;

    /** 판매중단/주의 의약품 포함 여부 (0: 정상, 1: 주의) */
    private Integer hasDiscontinuedDrug;

    /** 등록 일시 */
    private Date createdAt;

    /** 포함된 처방 약품 목록 */
    private List<PrescriptionItemDTO> items;

    /** 병원명 (AI 분석 추출용 가상 필드) */
    private String hospitalName;

    /** 의사/약사명 (AI 분석 추출용 가상 필드) */
    private String doctorName;
}
