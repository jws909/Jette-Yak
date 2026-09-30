/**
 * 파일 역할: 처방전 또는 직접 추가로 등록된 약과 현재 복용 상태를 화면에 전달합니다.
 * 핵심 규칙: 같은 제품도 등록 출처가 다르면 별도 등록 행으로 유지될 수 있습니다.
 */
package com.app.guide.dto;
import lombok.Data;
@Data
public class RegisteredMedicationDto {
    private String registrationId;
    private String source;
    private String useStatus;
    private String materialName;
    private String itemImageUrl;
    private Integer daysRemaining;
    private String periodState;
    private String medicationId;
    private String itemName;
    private String entpName;
    private String startDate;
    private String endDate;
    private String notes;
    private String takeTime;
}
