package com.app.chatbot.service;

import java.util.*;
import org.springframework.stereotype.Service;
import com.app.chatbot.dao.ChatbotDao;
import com.app.chatbot.client.GeminiService;
import com.app.chatbot.dto.MedicationChatDto;
import com.app.chatbot.dto.MedicationChatRequest;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class MedicationChatService {
    private final ChatbotDao medicationDao;
    private final GeminiService geminiService;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private static final int PAGE_SIZE = 20;

    public MedicationChatService(ChatbotDao medicationDao, GeminiService geminiService) {
        this.medicationDao = medicationDao;
        this.geminiService = geminiService;
    }

    public Map<String, Object> search(String keyword, int page) {
        String normalized = normalize(keyword);
        int total = medicationDao.countChatMedicationsByName(normalized);
        List<MedicationChatDto> items = medicationDao.searchChatMedicationsByName(
            normalized, (page - 1) * PAGE_SIZE, PAGE_SIZE);
        return Map.of("items", items, "total", total, "page", page,
            "hasMore", (long) page * PAGE_SIZE < total);
    }

    public Map<String, Object> chat(MedicationChatRequest request) {
        String question = request.getQuestion().trim();
        MedicationChatDto selected = request.getItemSeq() == null || request.getItemSeq().isBlank() ? null
            : medicationDao.findChatMedicationByItemSeq(request.getItemSeq().trim());
        QuestionAnalysis analysis = QuestionAnalysis.parse(
            geminiService.analyzeQuestion(question, selected == null ? null : selected.getItemName()), question);
        if (analysis.needsClarification())
            return reply("어떤 약과 무엇에 관한 질문인지 조금 더 구체적으로 알려주세요.", List.of(), List.of());
        if (analysis.intent() == QuestionAnalysis.Intent.OTHER)
            return reply("약 이름과 궁금한 효능·복용법·생활 관련 내용을 질문해주세요.", List.of(), List.of());
        List<String> hints = analysis.medications();
        if (hints.size() > 8) return reply("약 이름을 짧게 적거나, 왼쪽 검색에서 약을 선택해주세요.", List.of(), List.of());
        LinkedHashMap<String, MedicationChatDto> targets = new LinkedHashMap<>();
        List<String> missing = new ArrayList<>();
        if (analysis.useSelectedMedication()) {
            if (selected == null) return reply("어떤 약이 궁금한가요? 약 이름을 적거나 검색에서 선택해주세요.", List.of(), List.of());
            targets.put(selected.getItemSeq(), selected);
        }

        for (String hint : hints) {
            String keyword = normalize(hint);
            // Confirmed choices are revalidated against the database and name hint.
            String chosenId = request.getSelections().get(hint);
            if (chosenId != null) {
                MedicationChatDto chosen = medicationDao.findChatMedicationByItemSeq(chosenId);
                if (chosen == null || !normalize(chosen.getItemName()).contains(keyword))
                    throw new IllegalArgumentException("선택한 약이 검색어와 일치하지 않습니다. 다시 선택해주세요.");
                targets.put(chosen.getItemSeq(), chosen);
                continue;
            }
            List<MedicationChatDto> matches = medicationDao.searchChatMedicationsByName(keyword, 0, PAGE_SIZE);
            if (matches.isEmpty()) { missing.add(hint); continue; }
            List<MedicationChatDto> exact = matches.stream()
                .filter(m -> normalize(m.getItemName()).equals(keyword)).toList();
            if (exact.size() == 1) {
                MedicationChatDto full = medicationDao.findChatMedicationByItemSeq(exact.get(0).getItemSeq());
                targets.put(full.getItemSeq(), full);
                continue;
            }
            int total = medicationDao.countChatMedicationsByName(keyword);
            if (total == 1) {
                MedicationChatDto full = medicationDao.findChatMedicationByItemSeq(matches.get(0).getItemSeq());
                targets.put(full.getItemSeq(), full);
            } else {
                Map<String, Object> response = reply("‘" + hint + "’에 해당하는 약이 " + total
                    + "개 있어요. 질문할 제품을 선택해주세요.", List.of(), matches);
                response.put("choiceKeyword", hint);
                response.put("choiceTotal", total);
                return response;
            }
        }

        if (!missing.isEmpty()) {
            return reply("‘" + String.join(", ", missing)
                + "’을 약 이름으로 확인하지 못했어요. 이름을 짧게 검색하거나 정확한 제품명을 알려주세요.",
                List.of(), List.of());
        }
        if (targets.isEmpty())
            return reply("어떤 약이 궁금한가요? 약 이름을 적거나 검색에서 선택해주세요.", List.of(), List.of());
        List<MedicationChatDto> sources = new ArrayList<>(targets.values());
        String names = String.join(", ", sources.stream().map(MedicationChatDto::getItemName).toList());
        if (analysis.intent() == QuestionAnalysis.Intent.FOOD_INTERACTION)
            return reply("현재 조회한 " + names + " 자료에는 " + String.join(", ", analysis.foods())
                + "와 함께 섭취할 때의 정보가 없어 함께 복용해도 되는지 판단할 수 없습니다.", sources, List.of());
        if (analysis.intent() == QuestionAnalysis.Intent.LIFESTYLE)
            return reply("현재 조회한 " + names + " 자료에는 " + String.join(", ", analysis.topics())
                + " 관련 주의사항이 없어 해당 활동의 안전 여부를 판단할 수 없습니다.", sources, List.of());
        if (analysis.intent() == QuestionAnalysis.Intent.DRUG_INTERACTION) {
            if (sources.size() < 2) return reply("함께 복용하려는 다른 약 이름도 알려주세요.", sources, List.of());
            return reply("현재 조회 자료에는 약 사이의 병용금기·상호작용 정보가 없어 함께 복용해도 되는지 판단할 수 없습니다.", sources, List.of());
        }
        String references;
        try { references = objectMapper.writeValueAsString(sources); }
        catch (JsonProcessingException e) { throw new IllegalStateException("약 정보 변환 실패", e); }
        if (references.length() > 2500)
            return reply("등록된 자료가 길어 원문을 제공합니다. 아래 참고 정보에서 확인해주세요.", sources, List.of());
        String answer = geminiService.ask(question, references);
        return reply(answer, sources, List.of());
    }

    private static String normalize(String text) {
        return text == null ? "" : text.replaceAll("\\s+", "").toLowerCase(Locale.ROOT);
    }

    private static Map<String, Object> reply(String answer, List<MedicationChatDto> sources,
            List<MedicationChatDto> choices) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("answer", answer);
        result.put("sources", sources);
        result.put("choices", choices);
        if (sources.size() == 1) result.put("activeMedication", sources.get(0));
        return result;
    }
}
