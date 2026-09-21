package com.app.chatbot.service;
import java.util.*;
import com.fasterxml.jackson.databind.JsonNode;

/** Only fixed query fields and bound values are accepted; never model-generated SQL. */
public record CatalogQuery(String kind, List<Filter> filters, int tabooType, String grade, String ageBase, String status) {
    public record Filter(String field, String value) {}
    public CatalogQuery {
        if (!Set.of("MEDICATIONS", "DUR").contains(kind) || filters == null || filters.size() > 6
            || tabooType < 0 || tabooType > 4 || grade == null || !Set.of("", "1등급", "2등급", "M등급").contains(grade)
            || ageBase == null || ageBase.length() > 20 || !Set.of("ANY", "ACTIVE", "DISCONTINUED").contains(status))
            throw new IllegalArgumentException("검색 조건을 확인해주세요.");
        filters = List.copyOf(filters);
        for (Filter f : filters) {
            if (f == null || !Set.of("NAME","INGREDIENT","EFFICACY","USAGE","COMPANY","CLASSIFICATION","CODE","CATEGORY","EFFECT").contains(f.field())
                || f.value() == null || f.value().isBlank() || f.value().length() > 100)
                throw new IllegalArgumentException("검색 항목과 검색어를 확인해주세요.");
            if (kind.equals("DUR") && !Set.of("INGREDIENT","EFFECT").contains(f.field()))
                throw new IllegalArgumentException("DUR 기록은 성분과 금기 설명으로 검색해주세요.");
            if (kind.equals("MEDICATIONS") && f.field().equals("EFFECT"))
                throw new IllegalArgumentException("금기 설명은 DUR 기록에서 검색해주세요.");
        }
        if (!grade.isEmpty() && tabooType != 1 || !ageBase.isEmpty() && tabooType != 3
            || kind.equals("DUR") && !status.equals("ANY")) throw new IllegalArgumentException("금기 검색 조건을 확인해주세요.");
    }
    public static CatalogQuery empty() { return new CatalogQuery("MEDICATIONS", List.of(), 0, "", "", "ANY"); }
    public static CatalogQuery parse(JsonNode n) {
        if (n == null || n.isMissingNode() || n.isNull()) return empty();
        if (!n.isObject() || !n.path("filters").isArray() || !n.path("tabooType").isIntegralNumber() || !n.path("tabooType").canConvertToInt()) throw new IllegalArgumentException("검색 조건 형식이 올바르지 않습니다.");
        List<Filter> filters = new ArrayList<>();
        for (JsonNode f : n.path("filters")) filters.add(new Filter(f.path("field").asText(), f.path("value").asText()));
        return new CatalogQuery(n.path("kind").asText(), filters, n.path("tabooType").asInt(), n.path("grade").asText(), n.path("ageBase").asText(), n.path("status").asText());
    }
    public void validateQuestion(String question) {
        for(Filter f:filters) if(!normalize(question).contains(normalize(f.value()))) throw new IllegalArgumentException("질문에 없는 검색어입니다.");
        if(!ageBase.isEmpty() && !normalize(question).contains(normalize(ageBase))) throw new IllegalArgumentException("질문에 없는 연령 기준입니다.");
        if(!grade.isEmpty() && !normalize(question).contains(normalize(grade))) throw new IllegalArgumentException("질문에 없는 등급입니다.");
    }
    public Map<String,Object> parameters(int page) {
        if (page < 1 || page > 100000) throw new IllegalArgumentException("페이지 범위를 확인해주세요.");
        return Map.of("filters", filters.stream().map(f -> Map.of("field",f.field(),"value",normalize(f.value()))).toList(),
            "tabooType",tabooType,"grade",grade,"ageBase",ageBase,"status",status,"offset",(page-1)*20,"limit",20);
    }
    public static String normalize(String text) { return text.replaceAll("\\s+", "").toLowerCase(Locale.ROOT); }
}
