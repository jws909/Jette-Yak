package com.app.dto;

import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
public class FamilyMemberResponse {
    private Long userId;
    private String name;
    private String role;
    private String isVirtual;
}
