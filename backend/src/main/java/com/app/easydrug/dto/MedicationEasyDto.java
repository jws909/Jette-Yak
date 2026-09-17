package com.app.easydrug.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/*
 * =========================================================
 * e약은요 API 의약품 1건 DTO
 * =========================================================
 *
 * e약은요 API에서는 여러 정보를 내려주지만
 * 현재 MEDICATIONS 테이블에서 사용할 정보만 받는다.
 *
 * itemSeq
 *      → MEDICATIONS.ITEM_SEQ와 연결
 *
 * efcyQesitm
 *      → MEDICATIONS.EFFICACY
 *
 * useMethodQesitm
 *      → MEDICATIONS.USAGE_DOSAGE
 *
 * itemImage
 *      → MEDICATIONS.ITEM_IMAGE_URL
 *
 * 나머지 API 필드는 ignoreUnknown = true 때문에
 * DTO에 선언하지 않아도 오류가 발생하지 않는다.
 * =========================================================
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class MedicationEasyDto {

	/*
	 * 식약처 품목기준코드
	 *
	 * 허가정보 API에서 저장한
	 * MEDICATIONS.ITEM_SEQ와 연결되는 핵심 값
	 */
	@JsonProperty("itemSeq")
	private String itemSeq;

	/*
	 * 효능 / 효과
	 */
	@JsonProperty("efcyQesitm")
	private String efficacy;

	/*
	 * 사용법 / 용법
	 */
	@JsonProperty("useMethodQesitm")
	private String usageDosage;

	/*
	 * 의약품 이미지 URL
	 */
	@JsonProperty("itemImage")
	private String itemImageUrl;

	public String getItemSeq() {
		return itemSeq;
	}

	public void setItemSeq(String itemSeq) {
		this.itemSeq = itemSeq;
	}

	public String getEfficacy() {
		return efficacy;
	}

	public void setEfficacy(String efficacy) {
		this.efficacy = efficacy;
	}

	public String getUsageDosage() {
		return usageDosage;
	}

	public void setUsageDosage(String usageDosage) {
		this.usageDosage = usageDosage;
	}

	public String getItemImageUrl() {
		return itemImageUrl;
	}

	public void setItemImageUrl(String itemImageUrl) {
		this.itemImageUrl = itemImageUrl;
	}
}