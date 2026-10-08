/**
 * 역할: 챗봇 답변 근거로 사용하는 의약품 DB 조회 결과
 * 포함 범위: 제품명, 성분, 효능, 용법 등 화면과 AI에 필요한 필드
 */
package com.app.chatbot.dto;

import lombok.Data;

@Data
public class MedicationChatDto {

	private String itemSeq;
	private String itemName;
	private String entpName;
	private String materialName;
	private String className;
	private String etcOtcCode;
	private String efficacy;
	private String usageDosage;
    private String ediCode;
    private Integer isDiscontinued;
    private String updatedAt;
}
