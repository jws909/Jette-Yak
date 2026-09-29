package com.app.chatbot.service;

import java.util.*;
import org.springframework.stereotype.Service;
import com.app.chatbot.dao.ChatbotDao;
import com.app.chatbot.client.GeminiService;
import com.app.chatbot.client.ConversationAnswer;
import com.app.chatbot.dto.MedicationChatDto;
import com.app.chatbot.dto.MedicationChatRequest;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class MedicationChatService {
    private final ChatbotDao medicationDao;
    private final GeminiService geminiService;
    private final CatalogService catalog;
    private final com.app.guide.service.DurGuideService dur;
    public Map<String,Object> catalog(CatalogQuery query, int page) { return catalog.search(query,page); }
    private final ObjectMapper objectMapper = new ObjectMapper();
    private static final int PAGE_SIZE = 20;

    private final com.app.guide.service.MedicationManagementService management;
    @org.springframework.beans.factory.annotation.Autowired
    public MedicationChatService(ChatbotDao dao, GeminiService ai, CatalogService catalog, com.app.guide.service.DurGuideService dur, com.app.guide.service.MedicationManagementService management) {
        this.medicationDao=dao;this.geminiService=ai;this.catalog=catalog;this.dur=dur;this.management=management;
    }
    public MedicationChatService(ChatbotDao medicationDao, GeminiService geminiService, CatalogService catalog, com.app.guide.service.DurGuideService dur) {
        this(medicationDao,geminiService,catalog,dur,null);
    }

    public Map<String, Object> search(String keyword, int page) {
        String normalized = normalize(keyword);
        int total = medicationDao.countChatMedicationsByName(normalized);
        List<MedicationChatDto> items = medicationDao.searchChatMedicationsByName(
            normalized, (page - 1) * PAGE_SIZE, PAGE_SIZE);
        return Map.of("items", items, "total", total, "page", page,
            "hasMore", (long) page * PAGE_SIZE < total);
    }

    public Map<String,Object> chat(MedicationChatRequest request) { return chat(request,null); }
    public Map<String, Object> chat(MedicationChatRequest request, Long userId) {
        String question = request.getQuestion().trim();
        MedicationChatDto selected = request.getItemSeq() == null || request.getItemSeq().isBlank() ? null
            : medicationDao.findChatMedicationByItemSeq(request.getItemSeq().trim());

        if (QuestionAnalysis.hasEmergencySignal(question))
            return emergencyReply(selected);
        Optional<QuestionAnalysis.Intent> directSafetyIntent = QuestionAnalysis.safetyIntent(question);
        if (directSafetyIntent.isPresent())
            return safetyReply(directSafetyIntent.get(), selected);

        List<String> userHistory = request.getConversation().stream()
            .filter(turn -> "user".equals(turn.getRole()))
            .map(turn -> turn.getContent().trim()).toList();
        if (userHistory.size() > 4) userHistory = userHistory.subList(userHistory.size() - 4, userHistory.size());
        if (userHistory.isEmpty()) userHistory = request.getRecentQuestions();
        String classification = geminiService.analyzeQuestion(
            question, selected == null ? null : selected.getItemName(), userHistory, request.getConversation());
        QuestionAnalysis analysis;
        try {
            analysis = QuestionAnalysis.parse(classification, question, userHistory);
        } catch (com.app.chatbot.client.GeminiException invalidClassification) {
            // The provider succeeded but returned a classification that failed our trust boundary.
            // Treat this as a recoverable conversation result instead of an HTTP 5xx failure.
            return counselReply(question, selected == null ? registeredContext(question, userId) : List.of(selected), request,
                "질문 분류 결과가 유효하지 않았음. 사용자의 목적을 추측해 단정하지 말고 자연스럽게 답하거나 한 가지를 확인할 것.");
        }
        if (analysis.intent() == QuestionAnalysis.Intent.DOSAGE_RISK
                || analysis.intent() == QuestionAnalysis.Intent.MEDICATION_MISUSE)
            return safetyReply(analysis.intent(), selected);
        boolean conversational = analysis.intent() == QuestionAnalysis.Intent.SYMPTOM_CONSULTATION
            || analysis.intent() == QuestionAnalysis.Intent.GENERAL_HEALTH
            || analysis.intent() == QuestionAnalysis.Intent.SITE_HELP
            || QuestionAnalysis.shouldPreferCounseling(question, userHistory);
        if (analysis.needsClarification()) {
            List<MedicationChatDto> context = analysis.useSelectedMedication() && selected != null
                ? List.of(selected) : registeredContext(question, userId);
            return counselReply(question, context, request,
                analysis.clarificationQuestion().isBlank() ? "질문의 목적이나 대상이 아직 명확하지 않음"
                    : "분류기가 확인이 필요하다고 판단함: " + analysis.clarificationQuestion());
        }
        if (analysis.intent() == QuestionAnalysis.Intent.MY_MEDICATIONS || analysis.intent() == QuestionAnalysis.Intent.MY_DUR) {
            if(userId==null || userId<=0) { var response=reply("내 약 조회는 로그인이 필요합니다.",List.of(),List.of());response.put("loginRequired",true);return response; }
            var response=reply(analysis.intent()==QuestionAnalysis.Intent.MY_DUR ? "복용 중 상태인 약 사이의 DUR 기록입니다." : "현재 복용 중인 약 목록입니다. 제품을 선택해 질문을 이어가세요.",List.of(),List.of());
            if(analysis.intent()==QuestionAnalysis.Intent.MY_DUR) response.put("comparison",management.myComparison(userId));
            else response.put("registeredMedications",activeRegistrations(management.collection(userId)));
            return response;
        }
        if (analysis.intent() == QuestionAnalysis.Intent.OTHER)
            return counselReply(question, selected != null && analysis.useSelectedMedication() ? List.of(selected) : List.of(), request,
                "서비스 범위와의 관련성이 불명확함. 사용자의 말을 무시하지 말고 필요한 도움을 한 번 확인할 것.");
        if (analysis.intent() == QuestionAnalysis.Intent.DB_SEARCH && !conversational) {
            var data = catalog.search(analysis.query(), 1);
            if (((Number)data.getOrDefault("total", 0)).longValue() == 0)
                return counselReply(question, List.of(), request,
                    "구조화된 의약품 DB 검색 결과가 0건임. 결과가 있다고 만들지 말고, 검색 의도를 설명한 뒤 더 적절한 제품명·성분명·조건을 한 가지씩 확인할 것.");
            var response = reply("조건에 맞는 DB 기록 " + data.get("total") + "건을 찾았습니다. 아래 목록과 원문을 확인해주세요.", List.of(), List.of());
            response.put("catalog", data); return response;
        }
        List<String> hints = analysis.medications();
        if (hints.size() > 8) return reply("약 이름을 짧게 적거나, 왼쪽 검색에서 약을 선택해주세요.", List.of(), List.of());
        LinkedHashMap<String, MedicationChatDto> targets = new LinkedHashMap<>();
        List<String> missing = new ArrayList<>();
        if (analysis.useSelectedMedication()) {
            if (selected == null && conversational)
                return counselReply(question, registeredContext(question, userId), request);
            if (selected == null) return reply("어떤 약이 궁금한가요? 약 이름을 적거나 검색에서 선택해주세요.", List.of(), List.of());
            targets.put(selected.getItemSeq(), selected);
        }

        if (conversational && hints.isEmpty() && targets.isEmpty())
            return counselReply(question, registeredContext(question, userId), request);

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
        if (conversational)
            return counselReply(question, sources, request);
        String names = String.join(", ", sources.stream().map(MedicationChatDto::getItemName).toList());
        if (analysis.intent() == QuestionAnalysis.Intent.FOOD_INTERACTION)
            return reply("현재 조회한 " + names + " 자료에는 " + String.join(", ", analysis.foods())
                + "와 함께 섭취할 때의 정보가 없어 함께 복용해도 되는지 판단할 수 없습니다.", sources, List.of());
        if (analysis.intent() == QuestionAnalysis.Intent.LIFESTYLE)
            return reply("현재 조회한 " + names + " 자료에는 " + String.join(", ", analysis.topics())
                + " 관련 주의사항이 없어 해당 활동의 안전 여부를 판단할 수 없습니다.", sources, List.of());
        if (analysis.intent() == QuestionAnalysis.Intent.DRUG_INTERACTION || analysis.intent() == QuestionAnalysis.Intent.DUR_INFO)
            return durReply(sources, analysis);
        String references = referenceJson(sources);
        String answer = geminiService.ask(question, references, request.getConversation());
        return reply(answer, sources, List.of());
    }

    private Map<String,Object> counselReply(String question, List<MedicationChatDto> sources, MedicationChatRequest request) {
        return counselReply(question, sources, request, "없음");
    }

    private Map<String,Object> counselReply(String question, List<MedicationChatDto> sources, MedicationChatRequest request, String serverContext) {
        String references = referenceJson(sources);
        ConversationAnswer counsel = geminiService.counsel(question, references, request.getConversation(), serverContext);
        String answer = counsel.answer();
        if ("EMERGENCY".equals(counsel.urgency()) && !answer.contains("119") && !answer.contains("응급실"))
            answer = "지금은 추가 답변을 기다리지 말고 119에 연락하거나 가까운 응급실로 가세요.\n\n" + answer;
        Map<String,Object> response = reply(answer, sources, List.of());
        response.put("conversationMode", true);
        response.put("followUpQuestions", counsel.followUpQuestions());
        response.put("urgency", counsel.urgency());
        return response;
    }

    private String referenceJson(List<MedicationChatDto> sources) {
        try {
            String full = objectMapper.writeValueAsString(sources);
            if (full.length() <= 30000) return full;
            List<Map<String,Object>> compact = new ArrayList<>();
            for (MedicationChatDto source : sources) {
                Map<String,Object> item = new LinkedHashMap<>();
                item.put("itemSeq", source.getItemSeq()); item.put("itemName", source.getItemName());
                item.put("entpName", source.getEntpName()); item.put("materialName", source.getMaterialName());
                item.put("className", source.getClassName()); item.put("etcOtcCode", source.getEtcOtcCode());
                item.put("efficacy", clip(source.getEfficacy(), 1500));
                item.put("usageDosage", clip(source.getUsageDosage(), 1500));
                item.put("isDiscontinued", source.getIsDiscontinued()); item.put("updatedAt", source.getUpdatedAt());
                compact.add(item);
            }
            return objectMapper.writeValueAsString(compact);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("약 정보 변환 실패", e);
        }
    }

    private static String clip(String value, int max) {
        return value == null || value.length() <= max ? value : value.substring(0, max) + "…";
    }

    private List<MedicationChatDto> registeredContext(String question, Long userId) {
        if (userId == null || userId <= 0 || management == null) return List.of();
        String text = normalize(question);
        if (!(text.contains("내약") || text.contains("먹는약") || text.contains("먹고있는약")
                || text.contains("복용중") || text.contains("복용하는약") || text.contains("처방약")))
            return List.of();
        LinkedHashMap<String,MedicationChatDto> result = new LinkedHashMap<>();
        for (var registration : activeRegistrations(management.collection(userId))) {
            if (registration.getMedicationId() == null) continue;
            MedicationChatDto medication = medicationDao.findChatMedicationByItemSeq(registration.getMedicationId());
            if (medication != null) result.put(medication.getItemSeq(), medication);
            if (result.size() == 8) break;
        }
        return List.copyOf(result.values());
    }

    static List<com.app.guide.dto.RegisteredMedicationDto> activeRegistrations(
            List<com.app.guide.dto.RegisteredMedicationDto> registrations) {
        if (registrations == null) return List.of();
        return registrations.stream().filter(registration -> registration != null
            && "ACTIVE".equals(registration.getUseStatus())
            && !"ENDED".equals(registration.getPeriodState())
            && !"UPCOMING".equals(registration.getPeriodState())).toList();
    }

    private static Map<String,Object> emergencyReply(MedicationChatDto selected) {
        Map<String,Object> response = reply("지금 적어주신 내용은 즉시 확인이 필요한 응급 신호일 수 있어요. "
            + "추가 답변을 기다리지 말고 119에 연락하거나 가까운 응급실로 가세요. 혼자라면 주변 사람에게 바로 도움을 요청하세요.",
            selected == null ? List.of() : List.of(selected), List.of());
        response.put("conversationMode", true);
        response.put("followUpQuestions", List.of());
        response.put("urgency", "EMERGENCY");
        return response;
    }

    private static Map<String,Object> safetyReply(QuestionAnalysis.Intent intent, MedicationChatDto selected) {
        List<MedicationChatDto> context = selected == null ? List.of() : List.of(selected);
        if (intent == QuestionAnalysis.Intent.DOSAGE_RISK) {
            String subject = selected == null ? "해당 약을" : "선택한 약 ‘" + selected.getItemName() + "’을";
            Map<String,Object> response = reply(subject + " 질문에 적은 양만큼 복용하지 마세요. 이미 복용했거나 바로 복용하려는 상황이면 "
                + "챗봇 답변을 기다리지 말고 즉시 119 또는 가까운 응급실에 도움을 요청하세요.", context, List.of());
            response.put("urgency", "EMERGENCY");
            return response;
        }
        return reply("의약품을 발효·가공해 술로 만들거나 허가된 방법과 다르게 사용하는 방법은 안내할 수 없어요. "
            + "약은 제품에 등록된 용법대로 사용해주세요. 정상 복용법이나 DB에 등록된 상호작용은 확인해드릴 수 있어요.",
            context, List.of());
    }

    private Map<String,Object> durReply(List<MedicationChatDto> sources, QuestionAnalysis analysis) {
        boolean pair = analysis.intent() == QuestionAnalysis.Intent.DRUG_INTERACTION && sources.size() > 1;
        int type = analysis.intent() == QuestionAnalysis.Intent.DRUG_INTERACTION ? 4 : analysis.query().tabooType();
        List<Map<String,Object>> reports = new ArrayList<>();
        List<Set<String>> ingredients = sources.stream().map(m -> Set.copyOf(com.app.guide.service.DurGuideService.ingredients(m.getMaterialName()).stream().map(MedicationChatService::normalize).toList())).toList();
        LinkedHashMap<String,com.app.guide.dto.DurInfoDto> pairs = new LinkedHashMap<>();
        List<String> unmatched = new ArrayList<>();
        for (MedicationChatDto source : sources) {
            var found = dur.find(source.getMaterialName());
            unmatched.addAll(found.unmatchedIngredients());
            var rows = found.items().stream().filter(r -> (type == 0 || r.getTabooType() == type)
                && (analysis.query().grade().isEmpty() || analysis.query().grade().equals(r.getGrade()))
                && (analysis.query().ageBase().isEmpty() || r.getAgeBase() != null && r.getAgeBase().contains(analysis.query().ageBase()))).toList();
            if (pair) {
                for (var row : rows) if (bridges(ingredients, row))
                    pairs.put(row.getIngrAName()+"|"+row.getIngrBName()+"|"+row.getTabooEffect(),row);
            } else reports.add(Map.of("label",source.getItemName(),"items",rows.stream().limit(100).toList(),"total",rows.size(),
                "unmatchedIngredients",found.unmatchedIngredients(),"status",found.status()));
        }
        if (pair) reports.add(Map.of("label","선택한 약 사이의 병용금기", "items",pairs.values().stream().limit(100).toList(),"total",pairs.size(),
            "unmatchedIngredients",unmatched.stream().distinct().toList(),"status",pairs.isEmpty()?"NO_MATCH":"MATCHED"));
        var response = reply(pair ? "선택한 약들의 성분을 서로 대조한 병용금기 조회 결과입니다."
            : "선택한 약의 성분에 연결된 DUR 조회 결과입니다.",sources,List.of());
        response.put("durReports",reports);
        response.put("durNotice","성분명 일치로 조회한 DB 원문입니다. 표기가 다른 성분은 연결되지 않을 수 있습니다. 조회 기록이 없다고 안전하다고 판단할 수 없습니다. 개인별 복용 가능 여부를 판정한 결과가 아닙니다. 기록은 항목별 최대 100건까지 표시합니다.");
        return response;
    }
    static boolean bridges(List<Set<String>> ingredients, com.app.guide.dto.DurInfoDto row) {
        if (row.getTabooType()!=4 || row.getIngrBName()==null) return false;
        for(int i=0;i<ingredients.size();i++) for(int j=0;j<ingredients.size();j++)
            if(i!=j && ingredients.get(i).contains(normalize(row.getIngrAName())) && ingredients.get(j).contains(normalize(row.getIngrBName()))) return true;
        return false;
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
