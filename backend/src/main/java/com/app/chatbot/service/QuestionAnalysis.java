package com.app.chatbot.service;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import com.fasterxml.jackson.databind.*;
import com.app.chatbot.client.GeminiException;

/** AI output is untrusted. Only validated literal entities may reach a bound DB query. */
public record QuestionAnalysis(Intent intent, List<String> medications, List<String> foods,
        List<String> topics, boolean useSelectedMedication, boolean needsClarification, CatalogQuery query, String clarificationQuestion) {
    public enum Intent { MEDICATION_INFO, FOOD_INTERACTION, DRUG_INTERACTION, LIFESTYLE, MY_MEDICATIONS, MY_DUR, DB_SEARCH, DUR_INFO, DOSAGE_RISK, MEDICATION_MISUSE, OTHER }
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

    private static boolean containsAny(String text, String... values) {
        for (String value : values) if (text.contains(value)) return true;
        return false;
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
