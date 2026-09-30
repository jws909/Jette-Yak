package com.app.chatbot.service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.app.chatbot.dao.ChatHistoryDao;
import com.app.chatbot.dto.ChatHistoryMessageDto;
import com.app.chatbot.dto.MedicationChatRequest;
import com.app.chatbot.dto.MedicationChatDto;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

/** 사용자별 챗봇 대화방을 저장하고 화면에서 다시 열 수 있는 형태로 복원한다. */
@Service
public class ChatHistoryService {
    private final ChatHistoryDao dao;
    private final ObjectMapper mapper=new ObjectMapper();
    public ChatHistoryService(ChatHistoryDao dao){this.dao=dao;}

    @Transactional
    public long saveExchange(long userId,MedicationChatRequest request,Map<String,Object> response){
        Long conversationId=request.getConversationId();
        if(conversationId==null){
            conversationId=dao.nextConversationId();
            Map<String,Object> conversation=new LinkedHashMap<>();
            conversation.put("conversationId",conversationId);conversation.put("userId",userId);
            conversation.put("title",title(request.getQuestion()));conversation.put("medicationId",medicationId(request,response));
            dao.insertConversation(conversation);
        }else if(conversationId<=0||dao.countOwned(userId,conversationId)!=1){
            throw new IllegalArgumentException("대화 기록을 찾을 수 없습니다. 새 대화를 시작해주세요.");
        }
        insertMessage(conversationId,"USER",request.getQuestion(),json(request));
        String answer=String.valueOf(response.getOrDefault("answer","답변이 저장되지 않았습니다."));
        if(answer.isBlank())answer="답변이 저장되지 않았습니다.";
        insertMessage(conversationId,"ASSISTANT",answer,json(response));
        Map<String,Object> update=new LinkedHashMap<>();
        update.put("conversationId",conversationId);update.put("userId",userId);
        update.put("medicationId",medicationId(request,response));
        if(dao.updateConversation(update)!=1)throw new IllegalArgumentException("대화 기록을 갱신하지 못했습니다.");
        return conversationId;
    }

    public List<Map<String,Object>> conversations(long userId){return dao.findConversations(userId);}

    public Map<String,Object> conversation(long userId,long conversationId){
        if(conversationId<=0)throw new IllegalArgumentException("대화 기록을 확인해주세요.");
        Map<String,Object> conversation=dao.findConversation(userId,conversationId);
        if(conversation==null)throw new IllegalArgumentException("대화 기록을 찾을 수 없습니다.");
        List<Map<String,Object>> exchanges=new ArrayList<>();
        Map<String,Object> current=null;
        for(ChatHistoryMessageDto message:dao.findMessages(userId,conversationId)){
            if("USER".equals(message.getRole())){
                current=new LinkedHashMap<>();
                current.put("id","history-"+message.getMessageId());
                current.put("question",message.getContent());
                current.put("answer",null);current.put("sources",List.of());current.put("choices",List.of());
                exchanges.add(current);
            }else if("ASSISTANT".equals(message.getRole())){
                if(current==null){
                    current=new LinkedHashMap<>();current.put("id","history-"+message.getMessageId());
                    current.put("question","저장된 질문");exchanges.add(current);
                }
                Map<String,Object> payload=parse(message.getPayloadJson());
                current.putAll(payload);
                current.put("answer",message.getContent());
                current.putIfAbsent("sources",List.of());current.putIfAbsent("choices",List.of());
            }
        }
        Map<String,Object> result=new LinkedHashMap<>();
        result.put("conversation",conversation);result.put("messages",exchanges);
        return result;
    }

    @Transactional
    public void delete(long userId,long conversationId){
        if(conversationId<=0||dao.deleteConversation(userId,conversationId)!=1)
            throw new IllegalArgumentException("삭제할 대화 기록을 찾을 수 없습니다.");
    }

    private void insertMessage(long conversationId,String role,String content,String payload){
        Map<String,Object> values=new LinkedHashMap<>();
        values.put("messageId",dao.nextMessageId());values.put("conversationId",conversationId);
        values.put("role",role);values.put("content",content);values.put("payloadJson",payload);
        dao.insertMessage(values);
    }
    private String medicationId(MedicationChatRequest request,Map<String,Object> response){
        Object active=response.get("activeMedication");
        if(active instanceof Map<?,?> map&&map.get("itemSeq")!=null)return String.valueOf(map.get("itemSeq"));
        if(active instanceof MedicationChatDto medication&&medication.getItemSeq()!=null)return medication.getItemSeq();
        return request.getItemSeq()==null||request.getItemSeq().isBlank()?null:request.getItemSeq();
    }
    private static String title(String question){
        String value=question==null?"새 대화":question.trim().replaceAll("\\s+"," ");
        return value.length()>40?value.substring(0,40)+"…":value;
    }
    private String json(Object value){
        try{return mapper.writeValueAsString(value);}catch(Exception e){throw new IllegalStateException("대화 기록 변환에 실패했습니다.",e);}
    }
    private Map<String,Object> parse(String value){
        if(value==null||value.isBlank())return new LinkedHashMap<>();
        try{return mapper.readValue(value,new TypeReference<LinkedHashMap<String,Object>>(){});}
        catch(Exception ignored){return new LinkedHashMap<>();}
    }
}
