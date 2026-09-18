package com.app.chatbot.service;

import java.util.*;
import com.fasterxml.jackson.databind.*;
import com.app.chatbot.client.GeminiException;

/** AI output is untrusted. Only validated literal entities may reach a bound DB query. */
public record QuestionAnalysis(Intent intent, List<String> medications, List<String> foods,
        List<String> topics, boolean useSelectedMedication, boolean needsClarification) {
    public enum Intent { MEDICATION_INFO, FOOD_INTERACTION, DRUG_INTERACTION, LIFESTYLE, OTHER }
    public static QuestionAnalysis parse(String json, String question) {
        try {
            JsonNode root = new ObjectMapper().reader().with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).readTree(json);
            if (root == null || !root.isObject() || !root.path("intent").isTextual()
                    || !root.path("useSelectedMedication").isBoolean() || !root.path("needsClarification").isBoolean())
                throw new IllegalArgumentException();
            Intent intent = Intent.valueOf(root.path("intent").asText());
            List<String> meds = entities(root.path("medications"), question);
            List<String> foods = entities(root.path("foods"), question);
            List<String> topics = entities(root.path("topics"), question);
            Set<String> others = new HashSet<>();
            foods.forEach(v -> others.add(normalize(v))); topics.forEach(v -> others.add(normalize(v)));
            if (meds.stream().anyMatch(v -> others.contains(normalize(v)))) throw new IllegalArgumentException();
            boolean clarify = root.path("needsClarification").asBoolean()
                || (intent == Intent.FOOD_INTERACTION && foods.isEmpty())
                || (intent == Intent.LIFESTYLE && topics.isEmpty());
            // Food/activity entities always take precedence over an inconsistent general-info label.
            if (!foods.isEmpty()) intent = Intent.FOOD_INTERACTION;
            else if (!topics.isEmpty()) intent = Intent.LIFESTYLE;
            return new QuestionAnalysis(intent, meds, foods, topics,
                root.path("useSelectedMedication").asBoolean(), clarify);
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
