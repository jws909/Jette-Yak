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
}