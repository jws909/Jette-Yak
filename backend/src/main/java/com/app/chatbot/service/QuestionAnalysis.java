/**
 * 파일 역할: AI 분류 JSON을 서버가 신뢰할 수 있는 Intent와 검색 조건으로 변환합니다.
 * 핵심 규칙: 응급 신호와 과다복용 표현은 규칙으로도 검사해 AI 분류 실패 시 안전망을 제공합니다.
 */
package com.app.chatbot.service;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import com.fasterxml.jackson.databind.*;
import com.app.chatbot.client.GeminiException;

/** AI output is untrusted. Only validated literal entities may reach a bound DB query. */
public record QuestionAnalysis(Intent intent, List<String> medications, List<String> foods,
        List<String> topics, boolean useSelectedMedication, boolean needsClarification, CatalogQuery query, String clarificationQuestion) {
    public enum Intent { MEDICATION_INFO, FOOD_INTERACTION, DRUG_INTERACTION, LIFESTYLE, MY_MEDICATIONS, MY_DUR, DB_SEARCH, DUR_INFO, SYMPTOM_CONSULTATION, GENERAL_HEALTH, SITE_HELP, DOSAGE_RISK, MEDICATION_MISUSE, OTHER }
    private static final Pattern DOSAGE_COUNT = Pattern.compile("(\\d{1,4})\\s*(개|알|정|캡슐|포|병)");

    /**
     * Urgent or misuse questions must not depend on an external model returning valid JSON.
     * Keep this deliberately narrow; the semantic classifier handles ordinary dosage questions.
     */
    public static Optional<Intent> safetyIntent(String question) {
        String text = normalize(question == null ? "" : question);
        boolean intake = containsAny(text, "먹", "복용", "삼키");
        if (intake && containsAny(text, "과다복용", "과량", "한꺼번에", "몽땅", "전부먹", "많이먹", "몇십"))
            return Optional.of(Intent.DOSAGE_RISK);

        if (intake) {
            Matcher matcher = DOSAGE_COUNT.matcher(text);
            while (matcher.find()) {
                try {
                    if (Integer.parseInt(matcher.group(1)) >= 10)
                        return Optional.of(Intent.DOSAGE_RISK);
                } catch (NumberFormatException ignored) {
                    // The regular expression already limits the value to four digits.
                }
            }
        }

        boolean alcoholManufacture = text.contains("술로만들")
            || (text.contains("발효") && containsAny(text, "술", "알코올"));
        boolean alteredAdministration = containsAny(text, "빻아서", "갈아서", "태워서")
            && containsAny(text, "흡입", "코로", "연기", "마시");
        if (alcoholManufacture || alteredAdministration || text.contains("주사로만들"))
            return Optional.of(Intent.MEDICATION_MISUSE);
        return Optional.empty();
    }

    /** Red flags are handled locally so malformed or unavailable AI output cannot suppress urgent advice. */
    public static boolean hasEmergencySignal(String question) {
        String text = normalize(question == null ? "" : question);
        return containsAny(text,
            "숨을못쉬", "숨이안쉬", "호흡곤란", "질식", "의식을잃", "의식이없", "기절했",
            "경련해", "경련중", "피를토", "토혈", "검은변", "대량출혈", "심한가슴통증",
            "가슴이찢어", "입술이파래", "혀가부어", "목이부어숨", "전신두드러기숨",
            "마비가왔", "말이안나와", "극단적선택", "자살하고", "죽고싶어", "자해했");
    }

    private static boolean containsAny(String text, String... values) {
        for (String value : values) if (text.contains(value)) return true;
        return false;
    }

    /**
     * Personal symptom statements must never become a product recommendation list merely because
     * the classifier produced DB_SEARCH. Explicit factual catalog requests remain searchable.
     */
    public static boolean shouldPreferCounseling(String question, List<String> recentQuestions) {
        String text = normalize(question == null ? "" : question);
        boolean explicitCatalog = containsAny(text, "효능", "성분", "제품목록", "약목록", "목록으로",
            "검색해", "검색할", "조회해", "db에서", "등록된약", "제조사", "품목코드", "edicode");
        boolean personalAction = containsAny(text, "약알려", "약을알려", "무슨약", "어떤약", "약추천",
            "추천해", "뭘먹", "뭐먹", "먹어야", "먹어도", "복용해도", "써도돼", "사용해도");
        boolean symptom = containsAny(text,
            "아파", "아픈데", "아프고", "통증", "두통", "복통", "어지러", "메스꺼", "구역질",
            "토했", "토할", "구토", "설사", "열이나", "열나", "발열", "기침", "콧물", "코막",
            "두드러기", "가려", "부었", "붓고", "속쓰", "속이불편", "소화가안", "저려", "마비",
            "숨이차", "숨쉬기", "피곤", "졸려", "불면", "잠이안", "잠을못자", "감기", "몸살",
            "생리통", "치통", "인후통", "근육통", "편두통", "소화불량", "변비", "충혈", "다쳤",
            "우울", "불안", "공황", "혈압이높", "혈당이높", "증상이", "증상은");

        if (symptom && personalAction) return true;
        if (symptom && !explicitCatalog) return true;
        if (explicitCatalog) return false;

        boolean followUp = containsAny(text, "어제부터", "오늘부터", "방금부터", "며칠", "일주일", "계속",
            "가끔", "더심해", "나아졌", "점정도", "정도야", "열도", "없어", "있어", "그래", "맞아");
        followUp = followUp || text.matches(".*\\d+(시간|일|주|개월)(째|됐어?|전|동안)?.*")
            || text.matches(".*\\d+(/10|점).*?");
        if (!followUp || recentQuestions == null) return false;
        return recentQuestions.stream().skip(Math.max(0, recentQuestions.size() - 2L))
            .anyMatch(previous -> shouldPreferCounseling(previous, List.of()));
    }
    public static QuestionAnalysis parse(String json, String question) {
        return parse(json, question, List.of());
    }
    public static QuestionAnalysis parse(String json, String question, List<String> recentQuestions) {
        try {
            if (recentQuestions.size() > 4 || recentQuestions.stream().anyMatch(q -> q == null || q.length() > 1000)) throw new IllegalArgumentException();
            String evidence = String.join("\n", recentQuestions) + "\n" + question;
            JsonNode root = new ObjectMapper().reader().with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).readTree(json);
            if (root == null || !root.isObject() || !root.path("intent").isTextual()
                    || !root.path("useSelectedMedication").isBoolean() || !root.path("needsClarification").isBoolean())
                throw new IllegalArgumentException();
            Intent intent = Intent.valueOf(root.path("intent").asText());
            if (intent == Intent.DB_SEARCH && !root.path("query").isObject()) throw new IllegalArgumentException();
            CatalogQuery query = CatalogQuery.parse(root.path("query"));
            query.validateQuestion(evidence);
            List<String> meds = entities(root.path("medications"), evidence);
            List<String> foods = entities(root.path("foods"), evidence);
            List<String> topics = entities(root.path("topics"), evidence);
            Set<String> others = new HashSet<>();
            foods.forEach(v -> others.add(normalize(v))); topics.forEach(v -> others.add(normalize(v)));
            if (meds.stream().anyMatch(v -> others.contains(normalize(v)))) throw new IllegalArgumentException();
            boolean clarify = root.path("needsClarification").asBoolean()
                || (intent == Intent.FOOD_INTERACTION && foods.isEmpty())
                || (intent == Intent.LIFESTYLE && topics.isEmpty());
            // Food/activity entities always take precedence over an inconsistent general-info label.
            if (intent == Intent.MEDICATION_INFO || intent == Intent.OTHER) {
                if (!foods.isEmpty()) intent = Intent.FOOD_INTERACTION;
                else if (!topics.isEmpty()) intent = Intent.LIFESTYLE;
            }
            String clarification = root.path("clarificationQuestion").asText("").trim();
            if (clarification.length() > 200) throw new IllegalArgumentException();
            return new QuestionAnalysis(intent, meds, foods, topics,
                root.path("useSelectedMedication").asBoolean(), clarify, query, clarification);
        } catch (Exception e) {
            throw new GeminiException(502, "질문의 약 이름과 대상을 구분하지 못했습니다. 약 이름과 궁금한 내용을 구체적으로 적어주세요.");
        }
    }
    private static List<String> entities(JsonNode array, String question) {
        if (!array.isArray() || array.size() > 8) throw new IllegalArgumentException();
        LinkedHashSet<String> result = new LinkedHashSet<>();
        for (JsonNode value : array) {
            if (!value.isTextual()) throw new IllegalArgumentException();
            String text = value.asText().trim();
            if (text.isEmpty() || text.length() > 100 || !normalize(question).contains(normalize(text)))
                throw new IllegalArgumentException();
            result.add(text);
        }
        return List.copyOf(result);
    }
    private static String normalize(String value) { return value.replaceAll("\\s+", "").toLowerCase(Locale.ROOT); }
}
