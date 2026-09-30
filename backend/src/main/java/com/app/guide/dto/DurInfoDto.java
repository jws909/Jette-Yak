/**
 * 파일 역할: 성분 기준 DUR 금기 한 건의 유형, 상대 성분, 효과, 연령·임부 등급을 전달합니다.
 * 핵심 규칙: TABOO_TYPE에 따라 AGE_BASE, GRADE, INGR_B_NAME 중 일부는 비어 있을 수 있습니다.
 */
package com.app.guide.dto;
import lombok.Data;
@Data
public class DurInfoDto {
    private String ingrAName;
    private String ingrBName;
    private int tabooType;
    private String tabooEffect;
    private String ageBase;
    private String grade;
    private String updatedAt;
}
