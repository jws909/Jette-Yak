package com.app.dto.medications;

import lombok.Data;

@Data
public class MedicationsDTO {
	 /** 식약처 품목코드 (PK) */                                                                                         
    private String medicationId;                                                                                        
                                                                                                                        
    /** 건강보험 청구용 9자리 EDI 코드 */                                                                               
    private String ediCode;                                                                                             
                                                                                                                        
    /** 공식 의약품명 */                                                                                                
    private String itemName;                                                                                            
                                                                                                                        
    /** 제조/수입 제약회사명 */                                                                                         
    private String entpName;                                                                                            
                                                                                                                        
    /** 효능군 분류명 (예: 해열·진통·소염제) */                                                                         
    private String className;                                                                                           
                                                                                                                        
    /** 원료약품 및 분량 규격 (DUR 파싱 원천) */                                                                        
    private String materialName;                                                                                        
                                                                                                                        
    /** 전문/일반의약품 구분 (전문의약품, 일반의약품) */                                                                
    private String etcOtcCode;                                                                                          
                                                                                                                        
    /** 효능 / 효과 요약 */                                                                                             
    private String efficacy;                                                                                            
                                                                                                                        
    /** 용법 / 용량 (복용법 및 주의 투약량) */                                                                          
    private String usageDosage;                                                                                         
                                                                                                                        
    /** e약은요 알약 외형 사진 URL */                                                                                   
    private String itemImageUrl;                                                                                        
                                                                                                                        
    /** AI 요약 원본 JSON 문자열 */                                                                                     
    private String aiSummaryJson;                                                                                       
                                                                                                                                                                                                                                                                                                                              
    /** 판매중단/회수 여부 (true: 판매중단, false: 정상 유통) */                                                        
    private Boolean isDiscontinued;                                                                                     
                                                                                                                        
    /** 최종 갱신 일시 */                                                                                               
    private String updatedAt;
}
