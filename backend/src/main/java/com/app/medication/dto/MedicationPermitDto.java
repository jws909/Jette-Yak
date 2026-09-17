package com.app.medication.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/*
 * 식약처 의약품 제품 허가정보 API에서
 * 의약품 1건의 정보를 받기 위한 DTO
 *
 * API에는 우리가 사용하지 않는 필드도 많이 존재하므로
 * DTO에 없는 JSON 필드는 무시하도록 설정한다.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class MedicationPermitDto {

    /*
     * 식약처 품목기준코드
     *
     * API:
     * ITEM_SEQ = "195700013"
     *
     * DB:
     * medications.item_seq
     *
     * 우리 의약품 마스터의 PK로 그대로 사용한다.
     */
    @JsonProperty("ITEM_SEQ")
    private String itemSeq;


    /*
     * 건강보험 EDI 코드
     *
     * 하나의 품목에 여러 EDI 코드가 존재하면
     * 쉼표로 연결된 문자열로 내려올 수도 있다.
     */
    @JsonProperty("EDI_CODE")
    private String ediCode;


    // 공식 의약품명
    @JsonProperty("ITEM_NAME")
    private String itemName;


    // 제조 / 수입 업체명
    @JsonProperty("ENTP_NAME")
    private String entpName;


    /*
     * 의약품 분류
     *
     * 예:
     * [03230]당류제
     * [03310]혈액대용제
     */
    @JsonProperty("PRDUCT_TYPE")
    private String className;


    /*
     * 허가정보 API의 성분명
     *
     * 예:
     * Glucose
     * Glucose/Sodium Chloride
     *
     * 우선 material_name에 저장하고,
     * 추후 DUR의 더 상세한 원료약품 정보가 필요하면
     * 보강하는 방향으로 사용할 수 있다.
     */
    @JsonProperty("ITEM_INGR_NAME")
    private String materialName;


    /*
     * 전문 / 일반 의약품 구분
     *
     * 예:
     * 전문의약품
     * 일반의약품
     */
    @JsonProperty("SPCLTY_PBLC")
    private String etcOtcCode;


    /*
     * 허가 취소 날짜
     *
     * 정상 품목이면 일반적으로 NULL
     */
    @JsonProperty("CANCEL_DATE")
    private String cancelDate;


    /*
     * 허가 상태
     *
     * 현재 확인한 정상 데이터:
     * CANCEL_NAME = "정상"
     */
    @JsonProperty("CANCEL_NAME")
    private String cancelName;


    /*
     * DB의 is_discontinued에 저장할 값을 계산한다.
     *
     * 정상      → 0
     * 허가취소  → 1
     *
     * 별도의 필드로 API에서 내려오는 값이 아니라
     * CANCEL_DATE / CANCEL_NAME을 기반으로 계산한다.
     */
    public int getIsDiscontinued() {

        /*
         * 취소 날짜가 존재한다면
         * 허가취소된 품목으로 판단
         */
        if (cancelDate != null
                && !cancelDate.trim().isEmpty()) {

            return 1;
        }


        /*
         * CANCEL_NAME이 존재하고
         * "정상"이 아니라면 허가취소 상태로 처리
         */
        if (cancelName != null
                && !cancelName.trim().isEmpty()
                && !"정상".equals(cancelName)) {

            return 1;
        }


        return 0;
    }


    public String getItemSeq() {
        return itemSeq;
    }

    public void setItemSeq(String itemSeq) {
        this.itemSeq = itemSeq;
    }


    public String getEdiCode() {
        return ediCode;
    }

    public void setEdiCode(String ediCode) {
        this.ediCode = ediCode;
    }


    public String getItemName() {
        return itemName;
    }

    public void setItemName(String itemName) {
        this.itemName = itemName;
    }


    public String getEntpName() {
        return entpName;
    }

    public void setEntpName(String entpName) {
        this.entpName = entpName;
    }


    public String getClassName() {
        return className;
    }

    public void setClassName(String className) {
        this.className = className;
    }


    public String getMaterialName() {
        return materialName;
    }

    public void setMaterialName(String materialName) {
        this.materialName = materialName;
    }


    public String getEtcOtcCode() {
        return etcOtcCode;
    }

    public void setEtcOtcCode(String etcOtcCode) {
        this.etcOtcCode = etcOtcCode;
    }


    public String getCancelDate() {
        return cancelDate;
    }

    public void setCancelDate(String cancelDate) {
        this.cancelDate = cancelDate;
    }


    public String getCancelName() {
        return cancelName;
    }

    public void setCancelName(String cancelName) {
        this.cancelName = cancelName;
    }
}