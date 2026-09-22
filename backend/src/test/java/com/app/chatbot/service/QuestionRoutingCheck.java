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
    static final List<String> queries = new ArrayList<>();
    static MedicationChatDto med(String id, String name) {
        var m = new MedicationChatDto(); m.setItemSeq(id); m.setItemName(name); return m;
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
        @Override public String ask(String q, String refs) { answerCalls++; return "DB 답변"; }
    };
    static String parsed(String intent, List<String> meds, List<String> foods, List<String> topics, boolean selected, boolean clarify) throws Exception {
        return new ObjectMapper().writeValueAsString(Map.of("intent",intent,"medications",meds,"foods",foods,"topics",topics,
            "useSelectedMedication",selected,"needsClarification",clarify));
    }
    static Map<String,Object> chat(String question, String id, Map<String,String> choices) {
        queries.clear(); var r=new MedicationChatRequest(); r.setQuestion(question); r.setItemSeq(id); r.setSelections(choices);
        return new MedicationChatService(dao,ai,null,new com.app.guide.service.DurGuideService(null) {
            @Override public DurResult find(String material) { return new DurResult("NO_MATCH",List.of(),List.of(),List.of(),List.of()); }
        }).chat(r);
    }
    static void check(boolean b,String label) { if(!b)throw new AssertionError(label); checks++; }
    public static void main(String[] args) throws Exception {
        analysis=parsed("FOOD_INTERACTION",List.of("텐텐"),List.of("맥주"),List.of(),false,false);
        var result=chat("텐텐이랑 맥주랑 같이 먹어도 돼?","1",Map.of());
        check(result.get("answer").toString().contains("맥주") && result.get("answer").toString().contains("판단할 수 없습니다"),"food-specific missing evidence");
        check(!queries.contains("맥주") && answerCalls==0,"food never queried as drug or answered from general knowledge");
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
        try {chat("타이레놀은?","1",Map.of("타이레놀","1"));throw new AssertionError("forged selection accepted");}catch(IllegalArgumentException expected){checks++;}
        analysis=parsed("DRUG_INTERACTION",List.of("타이레놀정"),List.of(),List.of(),true,false);
        check(((List<?>)chat("이 약이랑 타이레놀정 함께 먹어?","1",Map.of()).get("sources")).size()==2,"current plus explicit second medicine");
        analysis=parsed("DRUG_INTERACTION",List.of(),List.of(),List.of(),true,true);
        check(chat("그거랑 같이 먹어?","1",Map.of()).get("answer").toString().contains("궁금한가요"),"unclear pronoun clarified");
        analysis="not-json";
        result=chat("텐텐 하루에 50개 먹으면 어떻게 돼?","1",Map.of());
        check(result.get("answer").toString().contains("119") && result.get("activeMedication")==tenten,
            "overdose wording bypasses model classification and returns urgent guidance");
        result=chat("졸피뎀을 당발효 시켜서 술로 만들건데 어때?",null,Map.of());
        check(result.get("answer").toString().contains("안내할 수 없어요"),
            "medicine misuse wording returns a normal refusal response");
        result=chat("이 약 설명해줘","1",Map.of());
        check(result.get("answer").toString().contains("정확히 해석하지 못했어요") && result.get("activeMedication")==tenten,
            "malformed classifier output is recoverable");
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
        System.out.println("PASS: "+checks+" intent routing and validation checks");
    }
}
