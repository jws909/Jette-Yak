/**
 * 역할: 대화 소유권, 질문·답변 저장, 화면 응답 복원을 DB 없이 점검
 * 실행 방식: main 메서드에서 모의 DAO 사용
 */
package com.app.chatbot;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import com.app.chatbot.dao.ChatHistoryDao;
import com.app.chatbot.dto.ChatHistoryMessageDto;
import com.app.chatbot.dto.MedicationChatRequest;
import com.app.chatbot.service.ChatHistoryService;

public class ChatHistoryServiceCheck {
    static void check(boolean value,String message){if(!value)throw new AssertionError(message);}
    public static void main(String[] args){
        List<Map<String,Object>> saved=new ArrayList<>();
        ChatHistoryDao dao=new ChatHistoryDao(null){
            @Override public long nextConversationId(){return 31;}
            @Override public long nextMessageId(){return saved.size()+101;}
            @Override public int insertConversation(Map<String,Object> value){saved.add(new LinkedHashMap<>(value));return 1;}
            @Override public int insertMessage(Map<String,Object> value){saved.add(new LinkedHashMap<>(value));return 1;}
            @Override public int updateConversation(Map<String,Object> value){return 1;}
            @Override public int countOwned(long userId,long id){return userId==7&&id==31?1:0;}
            @Override public Map<String,Object> findConversation(long userId,long id){return userId==7&&id==31?Map.of("conversationId",31L,"title","머리가 아파"):null;}
            @Override public List<ChatHistoryMessageDto> findMessages(long userId,long id){
                var user=new ChatHistoryMessageDto();user.setMessageId(1);user.setRole("USER");user.setContent("머리가 아파");
                var assistant=new ChatHistoryMessageDto();assistant.setMessageId(2);assistant.setRole("ASSISTANT");assistant.setContent("증상을 더 알려주세요.");assistant.setPayloadJson("{\"conversationMode\":true,\"followUpQuestions\":[\"언제부터 아팠나요?\"]}");
                return List.of(user,assistant);
            }
            @Override public int deleteConversation(long userId,long id){return userId==7&&id==31?1:0;}
        };
        var service=new ChatHistoryService(dao);var request=new MedicationChatRequest();request.setQuestion("머리가 아파");
        long id=service.saveExchange(7,request,new LinkedHashMap<>(Map.of("answer","증상을 더 알려주세요.")));
        check(id==31,"new conversation id");check(saved.size()==3,"conversation and two messages saved");
        var loaded=service.conversation(7,31);var messages=(List<?>)loaded.get("messages");
        check(messages.size()==1,"message pair restored as exchange");
        check(Boolean.TRUE.equals(((Map<?,?>)messages.get(0)).get("conversationMode")),"assistant payload restored");
        try{service.conversation(8,31);throw new AssertionError("other user history exposed");}catch(IllegalArgumentException expected){}
        service.delete(7,31);
        System.out.println("PASS: chat history ownership and restoration");
    }
}
