package com.app.guide.dto;

/**
 * 제품에 적힌 원문 성분과 내부 표준 성분의 연결 결과다.
 * ingredientId가 null이면 아직 검증된 별칭을 찾지 못한 성분이다.
 */
public class MedicationIngredientDto {
    private Long ingredientId;
    private String canonicalName;
    private String rawName;
    private String normalizedName;
    private String matchStatus;

    public Long getIngredientId() { return ingredientId; }
    public void setIngredientId(Long ingredientId) { this.ingredientId = ingredientId; }
    public String getCanonicalName() { return canonicalName; }
    public void setCanonicalName(String canonicalName) { this.canonicalName = canonicalName; }
    public String getRawName() { return rawName; }
    public void setRawName(String rawName) { this.rawName = rawName; }
    public String getNormalizedName() { return normalizedName; }
    public void setNormalizedName(String normalizedName) { this.normalizedName = normalizedName; }
    public String getMatchStatus() { return matchStatus; }
    public void setMatchStatus(String matchStatus) { this.matchStatus = matchStatus; }
}
