/**
 * 역할: 질문 분류, DB 조회, 안전 응답, Gemini 상담 순서 조정
 * 안전 기준: 응급·과다복용 질문 우선 처리, AI 보완 정보에는 DB 외 정보 경고 표시
 */
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
        MedicationChatDto selectedByItem = request.getItemSeq() == null || request.getItemSeq().isBlank() ? null
            : medicationDao.findChatMedicationByItemSeq(request.getItemSeq().trim());

        // 1. 생명·안전에 직접 관련된 표현은 AI 분류 결과를 기다리지 않고 규칙으로 먼저 처리한다.
        //    이 순서를 바꾸면 외부 API 지연이나 오분류 때문에 응급 안내가 늦어질 수 있다.
        if (QuestionAnalysis.hasEmergencySignal(question))
            return emergencyReply(selectedByItem);
        Optional<QuestionAnalysis.Intent> directSafetyIntent = QuestionAnalysis.safetyIntent(question);
        if (directSafetyIntent.isPresent())
            return safetyReply(directSafetyIntent.get(), selectedByItem);

        // 제품 선택 목록에서 방금 고른 품목코드는 질문을 다시 분석하기 전에 확정한다.
        // 이전에 대화하던 약보다 새 선택을 우선해야 선택 직후 같은 약 이름을 되묻지 않는다.
        LinkedHashMap<String,MedicationChatDto> explicitSelections=resolveSelections(request,question);
        boolean confirmedChoice=request.isSelectionConfirmed()&&selectedByItem!=null;
        MedicationChatDto selected=explicitSelections.size()==1
            ? explicitSelections.values().iterator().next() : selectedByItem;

        // 2. 최근 사용자 발화만 추려 질문 분류 문맥으로 사용한다.
        //    전체 대화를 계속 보내면 비용과 지연이 커지므로 분류에는 최대 4개 질문만 사용한다.
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
            // Gemini 호출은 성공했지만 서버가 허용하지 않은 분류값 또는 형식이 반환된 경우다.
            // 사용자가 5xx 오류만 보게 하지 않고, 제한된 상담 모드에서 필요한 내용을 다시 확인한다.
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
        boolean explicitProductChosen=confirmedChoice||!explicitSelections.isEmpty();
        boolean productSelectionResolved=explicitProductChosen
            && (analysis.intent()==QuestionAnalysis.Intent.MEDICATION_INFO
                || analysis.intent()==QuestionAnalysis.Intent.DB_SEARCH);
        if (analysis.needsClarification()&&!productSelectionResolved) {
            List<MedicationChatDto> context = analysis.useSelectedMedication() && selected != null
                ? List.of(selected) : registeredContext(question, userId);
            return counselReply(question, context, request,
                analysis.clarificationQuestion().isBlank() ? "질문의 목적이나 대상이 아직 명확하지 않음"
                    : "분류기가 확인이 필요하다고 판단함: " + analysis.clarificationQuestion());
        }
        // 3. "내 약" 데이터는 로그인 세션의 userId가 있을 때만 조회한다.
        //    요청 본문의 품목코드와 달리 사용자 소유 데이터이므로 인증 여부를 반드시 확인해야 한다.
        if (analysis.intent() == QuestionAnalysis.Intent.MY_MEDICATIONS || analysis.intent() == QuestionAnalysis.Intent.MY_DUR) {
            if(userId==null || userId<=0) { var response=reply("내 약 조회는 로그인이 필요합니다.",List.of(),List.of());response.put("loginRequired",true);return response; }
            var registrations=activeRegistrations(management.collection(userId));
            if(analysis.intent()==QuestionAnalysis.Intent.MY_DUR) {
                if(registrations.isEmpty())
                    return reply("현재 복용 중으로 등록된 약이 없어요. 약 등록 페이지에서 처방전·상비약·영양제를 등록하면 함께 먹을 때 확인할 내용을 정리해드릴게요.",List.of(),List.of());
                if(registrations.size()==1)
                    return reply("현재 복용 중으로 등록된 약이 한 가지라서 약 사이의 주의정보를 비교할 수 없어요. 다른 약도 복용 중이라면 약 등록 페이지에서 추가하거나 약 이름을 질문에 적어주세요.",activeMedicationSources(registrations),List.of());
                var comparison=management.myComparison(userId);
                List<MedicationChatDto> sources=activeMedicationSources(registrations);
                if(!hasInteractionEvidence(comparison)) {
                    String activeNames=registrations.stream().map(com.app.guide.dto.RegisteredMedicationDto::getItemName)
                        .filter(Objects::nonNull).distinct().collect(java.util.stream.Collectors.joining(", "));
                    var response=generalKnowledgeReply(question,sources,request,
                        "현재 복용 중인 약(" + activeNames + ") 조합을 상호작용 DB에서 조회했지만 직접 일치하는 병용금기 또는 중복성분 기록이 0건임.");
                    response.put("comparison",comparison);
                    return response;
                }
                var response=reply("현재 복용 중인 약 사이에서 확인이 필요한 주의정보를 찾았어요. 아래 내용을 먼저 확인하고, 복용 여부가 불확실하면 의사나 약사에게 문의해주세요.",sources,List.of());
                response.put("comparison",comparison);
                return response;
            }
            var response=reply("현재 복용 중인 약 목록입니다. 제품을 선택해 질문을 이어가세요.",List.of(),List.of());
            response.put("registeredMedications",registrations);
            return response;
        }
        if (analysis.intent() == QuestionAnalysis.Intent.OTHER)
            return counselReply(question, !explicitSelections.isEmpty()?List.copyOf(explicitSelections.values()):
                (selected != null && analysis.useSelectedMedication() ? List.of(selected) : List.of()), request,
                "서비스 범위와의 관련성이 불명확함. 사용자의 말을 무시하지 말고 필요한 도움을 한 번 확인할 것.");
        // 4. 목록을 요구한 질문은 자연어 답변보다 구조화 DB 검색 결과를 우선 반환한다.
        if (analysis.intent() == QuestionAnalysis.Intent.DB_SEARCH && !conversational && !explicitProductChosen) {
            var data = catalog.search(analysis.query(), 1);
            if (((Number)data.getOrDefault("total", 0)).longValue() == 0)
                return counselReply(question, List.of(), request,
                    "구조화된 의약품 DB 검색 결과가 0건임. 결과가 있다고 만들지 말고, 검색 의도를 설명한 뒤 더 적절한 제품명·성분명·조건을 한 가지씩 확인할 것.");
            var response = reply("조건에 맞는 DB 기록 " + data.get("total") + "건을 찾았습니다. 아래 목록과 원문을 확인해주세요.", List.of(), List.of());
            response.put("catalog", data); return response;
        }
        // 5. 질문에서 추출한 약 이름을 실제 DB 품목과 연결한다.
        //    후보가 여러 개면 임의로 하나를 고르지 않고 사용자에게 제품 선택 목록을 돌려준다.
        // 후보 목록에서 사용자가 제품을 직접 골랐다면 그 선택이 약 이름 분석보다 우선한다.
        // 최초 질문의 짧은 검색어를 다시 조회하면 같은 후보 목록이 반복되므로, 선택 직후에는
        // 이름 검색을 생략하고 확정된 품목코드로 원래 질문에 바로 답한다.
        List<String> hints = explicitProductChosen ? List.of() : analysis.medications();
        if (hints.size() > 8) return reply("약 이름을 짧게 적거나, 왼쪽 검색에서 약을 선택해주세요.", List.of(), List.of());
        LinkedHashMap<String, MedicationChatDto> targets = new LinkedHashMap<>();
        explicitSelections.values().forEach(value->targets.put(value.getItemSeq(),value));
        if(confirmedChoice) targets.put(selectedByItem.getItemSeq(),selectedByItem);
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
            // 화면에서 선택한 품목코드도 그대로 신뢰하지 않고 DB 존재 여부와 검색어 일치를 재검증한다.
            String chosenId = request.getSelections().get(hint);
            if (chosenId != null) {
                MedicationChatDto chosen=explicitSelections.get(hint);
                targets.put(chosen.getItemSeq(), chosen);
                continue;
            }
            // 분류기가 선택 전 검색어를 조금 다르게 돌려줘도 이미 확정된 제품이면 재검색하지 않는다.
            if(explicitSelections.values().stream().anyMatch(chosen->normalize(chosen.getItemName()).contains(keyword)))continue;
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
        // 6. 증상·건강 상담은 확인된 약 자료를 문맥으로 전달하고 후속 질문이 가능한 상담 응답을 만든다.
        if (conversational)
            return counselReply(question, sources, request);
        String names = String.join(", ", sources.stream().map(MedicationChatDto::getItemName).toList());
        if (analysis.intent() == QuestionAnalysis.Intent.FOOD_INTERACTION)
            return generalKnowledgeReply(question,sources,request,"우리 DB에는 " + names + "과(와) "
                + String.join(", ", analysis.foods()) + "의 섭취 관련 직접 기록이 없음.");
        if (analysis.intent() == QuestionAnalysis.Intent.LIFESTYLE)
            return generalKnowledgeReply(question,sources,request,"우리 DB에는 " + names + "의 "
                + String.join(", ", analysis.topics()) + " 관련 직접 기록이 없음.");
        if (analysis.intent() == QuestionAnalysis.Intent.DRUG_INTERACTION || analysis.intent() == QuestionAnalysis.Intent.DUR_INFO)
            return durReply(question,sources,analysis,request);
        if(shouldUseGeneralKnowledge(question,sources))
            return generalKnowledgeReply(question,sources,request,
                "사용자가 선택한 제품은 확인했지만 질문한 항목이 우리 DB에서 비어 있음. 선택 제품을 바꾸거나 목록을 다시 보여주지 말고 해당 제품을 기준으로 일반 의약 지식을 보완할 것.");
        String references = referenceJson(sources);
        String answer = geminiService.ask(question, references, request.getConversation());
        return reply(answer, sources, List.of());
    }

    private LinkedHashMap<String,MedicationChatDto> resolveSelections(MedicationChatRequest request,String question){
        LinkedHashMap<String,MedicationChatDto> result=new LinkedHashMap<>();
        String normalizedQuestion=normalize(question);
        for(var entry:request.getSelections().entrySet()){
            String hint=entry.getKey()==null?"":entry.getKey().trim();
            String id=entry.getValue()==null?"":entry.getValue().trim();
            if(hint.isBlank()||id.isBlank()||!normalizedQuestion.contains(normalize(hint)))
                throw new IllegalArgumentException("선택한 약의 검색어를 확인할 수 없습니다. 다시 선택해주세요.");
            MedicationChatDto chosen=medicationDao.findChatMedicationByItemSeq(id);
            if(chosen==null||!normalize(chosen.getItemName()).contains(normalize(hint)))
                throw new IllegalArgumentException("선택한 약이 검색어와 일치하지 않습니다. 다시 선택해주세요.");
            result.put(hint,chosen);
        }
        return result;
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

    private Map<String,Object> generalKnowledgeReply(String question,List<MedicationChatDto> sources,
            MedicationChatRequest request,String serverContext) {
        ConversationAnswer counsel;
        try {
            counsel=geminiService.counselWithGeneralKnowledge(question,referenceJson(sources),
                request.getConversation(),serverContext);
        } catch(com.app.chatbot.client.GeminiException unavailable) {
            Map<String,Object> response=reply("우리 의약품 DB에서는 질문과 직접 일치하는 주의정보를 확인하지 못했어요. 기록이 없다는 사실만으로 함께 복용해도 안전하다고 판단할 수는 없습니다. 현재 AI 보완 안내도 연결되지 않아, 복용 전 약 봉투나 설명서를 확인하고 의사 또는 약사에게 함께 복용 중인 제품명을 보여주세요.",sources,List.of());
            response.put("evidenceLimited",true);
            response.put("evidenceWarning","DB에서 직접 확인된 기록이 없고 AI 보완 안내도 이용할 수 없는 상태입니다.");
            return response;
        }
        Map<String,Object> response=reply(counsel.answer(),sources,List.of());
        response.put("conversationMode",true);
        response.put("followUpQuestions",counsel.followUpQuestions());
        response.put("urgency",counsel.urgency());
        response.put("aiSupplemented",true);
        response.put("evidenceWarning","우리 의약품 DB에서 직접 확인되지 않은 내용은 Gemini의 일반 의약 지식으로 보완했습니다.\n\n복용을 결정하기 전 의사나 약사에게 확인해주세요.");
        return response;
    }

    private String referenceJson(List<MedicationChatDto> sources) {
        try {
            String full = objectMapper.writeValueAsString(sources);
            if (full.length() <= 30000) return full;
            // 효능·용법 원문이 길어 프롬프트가 과도하게 커지면 핵심 필드만 남기고 각 원문을 자른다.
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

    private static boolean shouldUseGeneralKnowledge(String question,List<MedicationChatDto> sources) {
        if(sources==null||sources.isEmpty()) return false;
        String text=normalize(question);
        if(text.contains("효능")||text.contains("효과")||text.contains("어디에쓰")||text.contains("무슨약"))
            return sources.stream().allMatch(source->blank(source.getEfficacy()));
        if(text.contains("복용법")||text.contains("용법")||text.contains("어떻게먹")||text.contains("먹는방법"))
            return sources.stream().allMatch(source->blank(source.getUsageDosage()));
        if(text.contains("성분"))
            return sources.stream().allMatch(source->blank(source.getMaterialName()));
        if(text.contains("부작용")||text.contains("이상반응")) return true;
        return false;
    }

    private static boolean blank(String value) { return value==null||value.isBlank(); }

    private List<MedicationChatDto> registeredContext(String question, Long userId) {
        // 사용자가 "내가 먹는 약"을 명시한 경우에만 활성 등록 약을 자동 문맥으로 붙인다.
        // 일반 증상 질문마다 전체 복용약을 보내면 불필요한 개인정보와 토큰이 증가하므로 제한한다.
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

    private List<MedicationChatDto> activeMedicationSources(
            List<com.app.guide.dto.RegisteredMedicationDto> registrations) {
        LinkedHashMap<String,MedicationChatDto> result=new LinkedHashMap<>();
        for(var registration:registrations) {
            if(registration.getMedicationId()==null) continue;
            MedicationChatDto medication=medicationDao.findChatMedicationByItemSeq(registration.getMedicationId());
            if(medication!=null) result.put(medication.getItemSeq(),medication);
            if(result.size()==8) break;
        }
        return List.copyOf(result.values());
    }

    private static boolean hasInteractionEvidence(Map<String,Object> comparison) {
        return nonEmptyList(comparison.get("pairs")) || nonEmptyList(comparison.get("duplicates"))
            || nonEmptyList(comparison.get("singleDurAlerts"));
    }

    private static boolean nonEmptyList(Object value) {
        return value instanceof Collection<?> collection && !collection.isEmpty();
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

    private Map<String,Object> durReply(String question,List<MedicationChatDto> sources, QuestionAnalysis analysis,
            MedicationChatRequest request) {
        // 병용 질문이면 A약 성분과 B약 성분이 DUR 행의 양쪽 성분을 실제로 연결하는지 대조한다.
        // 단일 약 DUR 조회에서는 임부·노인·연령·병용 유형과 등급 조건만 필터링한다.
        boolean pair = analysis.intent() == QuestionAnalysis.Intent.DRUG_INTERACTION && sources.size() > 1;
        int type = analysis.intent() == QuestionAnalysis.Intent.DRUG_INTERACTION ? 4 : analysis.query().tabooType();
        List<Map<String,Object>> reports = new ArrayList<>();
        List<com.app.guide.service.DurGuideService.DurResult> findings=sources.stream()
            .map(source->dur.find(source.getItemSeq(),source.getMaterialName())).toList();
        Map<String,Long> canonicalNames=new LinkedHashMap<>();
        findings.forEach(found->canonicalNames.putAll(found.canonicalIngredientIds()));
        List<Set<String>> ingredients=findings.stream().map(found->Set.copyOf(found.queriedIngredients().stream()
            .map(name->ingredientKey(name,canonicalNames)).toList())).toList();
        LinkedHashMap<String,com.app.guide.dto.DurInfoDto> pairs = new LinkedHashMap<>();
        List<String> unmatched = new ArrayList<>();
        for (int sourceIndex=0;sourceIndex<sources.size();sourceIndex++) {
            MedicationChatDto source=sources.get(sourceIndex);
            var found=findings.get(sourceIndex);
            unmatched.addAll(found.unmatchedIngredients());
            var rows = found.items().stream().filter(r -> (type == 0 || r.getTabooType() == type)
                && (analysis.query().grade().isEmpty() || analysis.query().grade().equals(r.getGrade()))
                && (analysis.query().ageBase().isEmpty() || r.getAgeBase() != null && r.getAgeBase().contains(analysis.query().ageBase()))).toList();
            if (pair) {
                for (var row : rows) if (bridgesCanonical(ingredients, row, canonicalNames))
                    pairs.put(row.getIngrAName()+"|"+row.getIngrBName()+"|"+row.getTabooEffect(),row);
            } else reports.add(Map.of("label",source.getItemName(),"items",rows.stream().limit(100).toList(),"total",rows.size(),
                "unmatchedIngredients",found.unmatchedIngredients(),"status",found.status()));
        }
        if (pair) reports.add(Map.of("label","선택한 약 사이의 병용금기", "items",pairs.values().stream().limit(100).toList(),"total",pairs.size(),
            "unmatchedIngredients",unmatched.stream().distinct().toList(),"status",pairs.isEmpty()?"NO_MATCH":"MATCHED"));
        if(pair && pairs.isEmpty()) {
            var response=generalKnowledgeReply(question,sources,request,
                "선택한 제품들의 성분을 상호작용 DB에서 대조했지만 직접 일치하는 병용금기 기록이 0건임.");
            response.put("durReports",reports);
            return response;
        }
        boolean hasRows=reports.stream().anyMatch(report->report.get("total") instanceof Number count
            && count.longValue()>0);
        if(!pair && !hasRows) {
            var response=generalKnowledgeReply(question,sources,request,
                "선택한 제품의 성분을 복용 주의정보 DB에서 조회했지만 질문과 직접 일치하는 기록이 0건임.");
            response.put("durReports",reports);
            return response;
        }
        var response = reply(pair ? "선택한 약 사이에서 확인이 필요한 주의정보를 찾았어요."
            : "선택한 약의 성분에 연결된 DUR 조회 결과입니다.",sources,List.of());
        response.put("durReports",reports);
        response.put("durNotice","제품 성분과 검증된 별칭을 표준 성분으로 연결해 조회한 DUR 원문입니다. 아직 검증되지 않은 별칭은 누락될 수 있습니다. 조회 기록이 없다고 안전하다고 판단할 수 없습니다. 개인별 복용 가능 여부를 판정한 결과가 아닙니다. 기록은 항목별 최대 100건까지 표시합니다.");
        return response;
    }
    static boolean bridges(List<Set<String>> ingredients, com.app.guide.dto.DurInfoDto row) {
        if (row.getTabooType()!=4 || row.getIngrBName()==null) return false;
        for(int i=0;i<ingredients.size();i++) for(int j=0;j<ingredients.size();j++)
            if(i!=j && ingredients.get(i).contains(normalize(row.getIngrAName())) && ingredients.get(j).contains(normalize(row.getIngrBName()))) return true;
        return false;
    }
    private static boolean bridgesCanonical(List<Set<String>> ingredients,com.app.guide.dto.DurInfoDto row,Map<String,Long> canonicalIds){
        if(row.getTabooType()!=4||row.getIngrBName()==null)return false;
        String a=ingredientKey(row.getIngrAName(),canonicalIds),b=ingredientKey(row.getIngrBName(),canonicalIds);
        for(int i=0;i<ingredients.size();i++)for(int j=0;j<ingredients.size();j++)
            if(i!=j&&ingredients.get(i).contains(a)&&ingredients.get(j).contains(b))return true;
        return false;
    }
    private static String ingredientKey(String name,Map<String,Long> canonicalIds){
        String normalized=com.app.guide.service.DurGuideService.normalize(name);
        Long id=canonicalIds.get(normalized);
        return id==null?"name:"+normalized:"id:"+id;
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
