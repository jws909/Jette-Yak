package com.app.dto;

import lombok.Getter;
import lombok.Setter;
import lombok.ToString;

@Getter
@Setter
@ToString
public class FamilyMemberRequest {
    private Long guardianId;   // 현재 보호자 user_id
    private String name;       // 등록할 가족/아기 이름
    private String role;       // 역할 (PROT, GUAR 등)
    private String sex;        // 성별 ('M' / 'F')
    private String birthdate;  // 생년월일 (YYYY-MM-DD)
    private String isVirtual;  // 가상 유저 여부 ('Y' / 'N')
}
