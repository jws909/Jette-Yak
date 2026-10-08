/**
 * 역할: 질문 의도별 안전 응답, 제품 선택, DB 검색, 자연어 상담 분기 점검
 * 실행 방식: 외부 AI와 DB 대신 모의 구현 사용
 */
package com.app.chatbot.service;
import java.util.*;
import com.app.chatbot.client.*;
import com.app.chatbot.dao.ChatbotDao;
import com.app.chatbot.dto.*;
import com.fasterxml.jackson.databind.ObjectMapper;

public class QuestionRoutingCheck {
    static int checks;
    static String analysis;
    static int answerCalls;
    static String serverContext;
    static final List<String> queries = new ArrayList<>();
    static MedicationChatDto med(String id, String name) {
        var m = new MedicationChatDto(); m.setItemSeq(id); m.setItemName(name); m.setUsageDosage("fixture usage"); return m;
    }
    static com.app.guide.dto.RegisteredMedicationDto registration(String id, String useStatus, String periodState) {
        var value = new com.app.guide.dto.RegisteredMedicationDto();
        value.setRegistrationId(id); value.setMedicationId(id); value.setUseStatus(useStatus); value.setPeriodState(periodState);
        return value;
    }
    static final MedicationChatDto tenten = med("1", "텐텐츄정");
    static final MedicationChatDto tylenol = med("2", "타이레놀정");
    static final MedicationChatDto tylenol2 = med("3", "타이레놀서방정");
    static final ChatbotDao dao = new ChatbotDao() {
        public MedicationChatDto findChatMedicationByItemSeq(String id) { return Map.of("1", tenten, "2", tylenol, "3", tylenol2).get(id); }
        public List<MedicationChatDto> searchChatMedicationsByName(String q, int offset, int limit) {
            queries.add(q);
            return List.of(tenten, tylenol, tylenol2).stream().filter(m -> m.getItemName().contains(q)).toList();
        }
        public int countChatMedicationsByName(String q) { return searchChatMedicationsByName(q, 0, 20).size(); }
    };
    static final GeminiService ai = new GeminiService() {
        @Override public String analyzeQuestion(String q, String selected) { return analysis; }
        @Override public String analyzeQuestion(String q, String selected, List<String> history) { return analysis; }
        @Override public String ask(String q, String refs, List<ChatTurn> history) { return ask(q, refs); }
        @Override public ConversationAnswer counselWithGeneralKnowledge(String q, String refs, List<ChatTurn> history, String context) {
            serverContext=context;
            return new ConversationAnswer(context + " 복용 전 약사에게 확인하세요.", List.of(), "ROUTINE");
        }
        @Override public String ask(String q, String refs) { answerCalls++; return "DB 답변"; }
        @Override public ConversationAnswer counsel(String q, String refs, List<ChatTurn> history) {
            return new ConversationAnswer("증상 상담 답변", List.of("언제부터 시작됐나요?"), "ROUTINE");
        }
        @Override public ConversationAnswer counsel(String q, String refs, List<ChatTurn> history, String context) {
            serverContext=context;
            return new ConversationAnswer("대화형 답변", List.of("조금 더 알려주시겠어요?"), "ROUTINE");
        }
    };
    static {
        // 모의 구현을 빠뜨린 새 호출 경로가 생겨도 실제 외부 요청은 허용하지 않습니다.
        try {
            var field=GeminiService.class.getDeclaredField("restTemplate");field.setAccessible(true);
            field.set(ai,new org.springframework.web.client.RestTemplate((uri,method)-> {
                throw new AssertionError("Offline check attempted an external HTTP request");
            }));
        } catch(ReflectiveOperationException error) { throw new ExceptionInInitializerError(error); }
    }
    static String parsed(String intent, List<String> meds, List<String> foods, List<String> topics, boolean selected, boolean clarify) throws Exception {
        return new ObjectMapper().writeValueAsString(Map.of("intent",intent,"medications",meds,"foods",foods,"topics",topics,
            "useSelectedMedication",selected,"needsClarification",clarify));
    }
    static String catalogParsed(String value) throws Exception {
        return new ObjectMapper().writeValueAsString(Map.of(
            "intent","DB_SEARCH","medications",List.of(),"foods",List.of(),"topics",List.of(),
            "useSelectedMedication",false,"needsClarification",false,"clarificationQuestion","",
            "query",Map.of("kind","MEDICATIONS","filters",List.of(Map.of("field","EFFICACY","value",value)),
                "tabooType",0,"grade","","ageBase","","status","ANY")));
    }
    static Map<String,Object> chat(String question, String id, Map<String,String> choices) {
        return chat(question,id,choices,List.of());
    }
    static Map<String,Object> chat(String question, String id, Map<String,String> choices, List<String> history) {
        queries.clear(); var r=new MedicationChatRequest(); r.setQuestion(question); r.setItemSeq(id); r.setSelections(choices);r.setRecentQuestions(history);
        return new MedicationChatService(dao,ai,null,new com.app.guide.service.DurGuideService(null) {
            @Override public DurResult find(String material) { return new DurResult("NO_MATCH",List.of(),List.of(),List.of(),List.of()); }
        }).chat(r);
    }
    static void check(boolean b,String label) { if(!b)throw new AssertionError(label); checks++; }
    public static void main(String[] args) throws Exception {
        analysis=parsed("FOOD_INTERACTION",List.of("텐텐"),List.of("맥주"),List.of(),false,false);
        var result=chat("텐텐이랑 맥주랑 같이 먹어도 돼?","1",Map.of());
        check(Boolean.TRUE.equals(result.get("aiSupplemented")) && result.get("evidenceWarning").toString().contains("DB에서 직접 확인되지 않은")
            && serverContext.contains("맥주") && serverContext.contains("직접 기록이 없음"),"food-specific missing evidence is disclosed separately from AI supplementation");
        check(!queries.contains("맥주") && answerCalls==0,"food never queried as drug or presented as a DB-supported answer");
        for(String food:List.of("맥주","커피","우유")) {
            analysis=parsed("FOOD_INTERACTION",List.of(),List.of(food),List.of(),true,false);
            result=chat(food+"랑 같이 먹어도 돼?","1",Map.of());
            check(result.get("activeMedication")==tenten && queries.isEmpty(),"selected drug with "+food);
        }
        check(chat("우유랑 같이 먹어도 돼?",null,Map.of()).get("answer").toString().contains("어떤 약"),"no selected medicine asks a question");
        analysis=parsed("LIFESTYLE",List.of(),List.of(),List.of("운전"),true,false);
        check(chat("운전해도 돼?","1",Map.of()).get("answer").toString().contains("운전"),"activity not a medicine");
        analysis=parsed("MEDICATION_INFO",List.of("타이레놀정"),List.of(),List.of(),false,false);
        check(chat("타이레놀정은?","1",Map.of()).get("activeMedication")==tylenol,"new explicit drug switches context");
        analysis=parsed("MEDICATION_INFO",List.of(),List.of(),List.of(),true,false);
        check(chat("그럼 언제 먹어?","1",Map.of()).get("activeMedication")==tenten,"name-free followup");
        analysis=parsed("MEDICATION_INFO",List.of("없는약"),List.of(),List.of(),false,false);
        check(((List<?>)chat("없는약은?","1",Map.of()).get("sources")).isEmpty(),"unknown drug never falls back");
        analysis=parsed("MEDICATION_INFO",List.of("타이레놀"),List.of(),List.of(),false,false);
        check(((List<?>)chat("타이레놀은?","1",Map.of()).get("choices")).size()==2,"ambiguous name asks selection");
        check(chat("타이레놀은?","1",Map.of("타이레놀","2")).get("activeMedication")==tylenol,"confirmed selection preserved");
        analysis=parsed("MEDICATION_INFO",List.of("타이레놀"),List.of(),List.of(),false,true);
        result=chat("타이레놀 복용법은?","1",Map.of("타이레놀","2"));
        check(result.get("activeMedication")==tylenol && "DB 답변".equals(result.get("answer"))
            && !Boolean.TRUE.equals(result.get("conversationMode")),
            "confirmed product bypasses repeated name clarification and replaces prior context");
        try {chat("타이레놀은?","1",Map.of("타이레놀","1"));throw new AssertionError("forged selection accepted");}catch(IllegalArgumentException expected){checks++;}
        analysis=parsed("DRUG_INTERACTION",List.of("타이레놀정"),List.of(),List.of(),true,false);
        check(((List<?>)chat("이 약이랑 타이레놀정 함께 먹어?","1",Map.of()).get("sources")).size()==2,"current plus explicit second medicine");
        analysis=parsed("DRUG_INTERACTION",List.of(),List.of(),List.of(),true,true);
        check(Boolean.TRUE.equals(chat("그거랑 같이 먹어?","1",Map.of()).get("conversationMode")),"unclear pronoun becomes a conversational clarification");
        analysis="not-json";
        result=chat("텐텐 하루에 50개 먹으면 어떻게 돼?","1",Map.of());
        check(result.get("answer").toString().contains("119") && result.get("activeMedication")==tenten,
            "overdose wording bypasses model classification and returns urgent guidance");
        result=chat("숨이 안 쉬어지고 입술이 파래",null,Map.of());
        check(result.get("answer").toString().contains("119") && "EMERGENCY".equals(result.get("urgency")),
            "emergency symptom bypasses model and returns emergency guidance");
        analysis=parsed("SYMPTOM_CONSULTATION",List.of(),List.of(),List.of(),false,false);
        result=chat("어제부터 머리가 아파",null,Map.of());
        check(Boolean.TRUE.equals(result.get("conversationMode"))
            && ((List<?>)result.get("followUpQuestions")).size()==1,"symptom conversation returns a focused follow-up");
        analysis=catalogParsed("머리가 아픈");
        result=chat("머리가 아픈데 약을 알려줘",null,Map.of());
        check(Boolean.TRUE.equals(result.get("conversationMode")) && !result.containsKey("catalog"),
            "personal symptom cannot become a zero-result catalog search even when classifier is wrong");
        for(String symptom : List.of("배가 아픈데 무슨 약을 먹어야 해?", "어지러운데 뭐 먹지?", "열이 나고 기침해",
                "약 먹고 두드러기가 생겼어", "감기 걸렸는데 약 알려줘", "잠을 못 자는데 무슨 약 먹어?",
                "혈압이 높은데 약 추천해줘", "우울하고 불안한데 약 알려줘"))
            check(QuestionAnalysis.shouldPreferCounseling(symptom,List.of()),"symptom phrasing routes to counseling: "+symptom);
        check(!QuestionAnalysis.shouldPreferCounseling("두통 효능이 있는 약 목록",List.of()),
            "explicit factual efficacy list remains a catalog query");
        check(QuestionAnalysis.shouldPreferCounseling("어제부터고 7점 정도야",List.of("머리가 아픈데 약 알려줘")),
            "short symptom follow-up keeps counseling context");
        check(QuestionAnalysis.shouldPreferCounseling("3일 됐어",List.of("배가 계속 아파")),
            "duration-only answer keeps counseling context");
        analysis="not-json";
        result=chat("머리가 아픈데 약 알려줘",null,Map.of());
        check(Boolean.TRUE.equals(result.get("conversationMode")),
            "personal symptom still reaches counseling when classifier JSON is malformed");
        analysis=parsed("OTHER",List.of(),List.of(),List.of(),false,false);
        result=chat("안녕, 뭘 도와줄 수 있어?",null,Map.of());
        check(Boolean.TRUE.equals(result.get("conversationMode")),"greeting and unknown intent stay conversational");
        analysis=parsed("SITE_HELP",List.of(),List.of(),List.of(),false,false);
        result=chat("처방전 등록은 어디서 해?",null,Map.of());
        check(Boolean.TRUE.equals(result.get("conversationMode")),"site usage question reaches site-aware counselor");
        analysis=catalogParsed("존재하지않는효능");
        var zeroCatalog=new CatalogService(null,null){@Override public Map<String,Object> search(CatalogQuery q,int page){return Map.of("total",0,"items",List.of());}};
        var zeroRequest=new MedicationChatRequest();zeroRequest.setQuestion("존재하지않는효능 효능으로 검색해줘");
        result=new MedicationChatService(dao,ai,zeroCatalog,new com.app.guide.service.DurGuideService(null)).chat(zeroRequest);
        check(Boolean.TRUE.equals(result.get("conversationMode")) && serverContext.contains("0건"),
            "zero-result DB search recovers into a useful conversation");
        result=chat("졸피뎀을 당발효 시켜서 술로 만들건데 어때?",null,Map.of());
        check(result.get("answer").toString().contains("안내할 수 없어요"),
            "medicine misuse wording returns a normal refusal response");
        analysis="not-json";
        result=chat("이 약 설명해줘","1",Map.of());
        check(Boolean.TRUE.equals(result.get("conversationMode")) && result.get("activeMedication")==tenten,
            "malformed classifier output recovers through conversation with selected medicine context");
        for(String bad:List.of("{}", "not-json", parsed("MEDICATION_INFO",List.of("임의생성약"),List.of(),List.of(),false,false),
            parsed("FOOD_INTERACTION",List.of("맥주"),List.of("맥주"),List.of(),false,false))) {
            try {QuestionAnalysis.parse(bad,"맥주");throw new AssertionError("bad classification accepted");}catch(GeminiException expected){checks++;}
        }
        String catalogJson = "{\"intent\":\"DB_SEARCH\",\"medications\":[],\"foods\":[],\"topics\":[\"임산부\"],\"useSelectedMedication\":false,\"needsClarification\":false,\"query\":{\"kind\":\"MEDICATIONS\",\"filters\":[],\"tabooType\":1,\"grade\":\"\",\"ageBase\":\"\",\"status\":\"ANY\"}}";
        check(QuestionAnalysis.parse(catalogJson,"임산부가 피할 약은?").intent()==QuestionAnalysis.Intent.DB_SEARCH,"population topic does not override catalog intent");
        String inherited = parsed("MEDICATION_INFO",List.of("타이레놀"),List.of(),List.of(),false,false);
        check(QuestionAnalysis.parse(inherited,"그 약의 성분은?",List.of("타이레놀 알려줘")).medications().equals(List.of("타이레놀")),"followup can reference prior literal medicine");
        try {QuestionAnalysis.parse(inherited,"그 약의 성분은?");throw new AssertionError("invented entity accepted");}catch(GeminiException expected){checks++;}
        try {QuestionAnalysis.parse(inherited,"성분은?",java.util.Collections.nCopies(5,"타이레놀"));throw new AssertionError("unbounded history accepted");}catch(GeminiException expected){checks++;}
        var active = MedicationChatService.activeRegistrations(List.of(
            registration("active", "ACTIVE", "CURRENT"),
            registration("ended-status", "ENDED", "CURRENT"),
            registration("ended-period", "ACTIVE", "ENDED"),
            registration("upcoming", "ACTIVE", "UPCOMING"),
            registration("stored", "STORED", "CURRENT")));
        check(active.size()==1 && "active".equals(active.get(0).getRegistrationId()),
            "chat medication selection contains only currently active registrations");
        var managementDao = new com.app.guide.dao.MedicationGuideDao(null) {
            @Override public List<com.app.guide.dto.RegisteredMedicationDto> collection(long userId) {
                return List.of(registration("active", "ACTIVE", "CURRENT"),
                    registration("finished", "ENDED", "ENDED"), registration("future", "UPCOMING", "UPCOMING"));
            }
        };
        var management = new com.app.guide.service.MedicationManagementService(managementDao, null);
        var service = new MedicationChatService(dao, ai, null, new com.app.guide.service.DurGuideService(null), management);
        var myRequest = new MedicationChatRequest(); myRequest.setQuestion("내가 등록한 약 보여줘");
        analysis=parsed("MY_MEDICATIONS",List.of(),List.of(),List.of(),false,false);
        var myResult = service.chat(myRequest, 11L);
        var visible = (List<?>)myResult.get("registeredMedications");
        check(visible.size()==1 && myResult.get("answer").toString().contains("현재 복용 중"),
            "MY_MEDICATIONS response excludes completed and upcoming registrations");
        System.out.println("PASS: "+checks+" intent routing and validation checks");
    }
}
