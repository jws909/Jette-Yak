package com.app.chatbot.service;
import java.util.*;import java.nio.file.*;
import com.app.chatbot.client.GeminiService;import com.app.chatbot.dao.*;import com.app.chatbot.dao.impl.ChatbotDaoImpl;
import com.app.chatbot.dto.*;import com.app.chatbot.controller.ChatController;
import com.app.guide.dao.MedicationGuideDao;import com.app.guide.service.DurGuideService;
import org.apache.ibatis.datasource.unpooled.UnpooledDataSource;import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.session.*;import org.apache.ibatis.transaction.jdbc.JdbcTransactionFactory;import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import com.fasterxml.jackson.databind.ObjectMapper;
public class ExpandedChatCheck {
 static String analysis;static int answerCalls;static int checks;static final ObjectMapper json=new ObjectMapper();
 static void check(boolean ok,String name){if(!ok)throw new AssertionError(name);checks++;System.out.println("PASS "+name);}
 static String intent(String name,CatalogQuery query)throws Exception{return json.writeValueAsString(Map.of("intent",name,"medications",List.of(),"foods",List.of(),"topics",List.of(),"useSelectedMedication",!name.equals("DB_SEARCH"),"needsClarification",false,"query",query));}
 public static void main(String[] args)throws Exception{
  Path base=Path.of(args[0]);var p=new Properties();try(var r=Files.newBufferedReader(base.resolve("src/main/resources/config/db.properties"))){p.load(r);}
  var ds=new UnpooledDataSource(p.getProperty("jdbc.driver"),p.getProperty("jdbc.url"),p.getProperty("jdbc.username"),p.getProperty("jdbc.password"));
  var conf=new Configuration(new Environment("test",new JdbcTransactionFactory(),ds));
  for(String name:List.of("chatbot/catalog_mapper.xml","chatbot/chatbot_mapper.xml","guide/guide_mapper.xml")){
   var f=base.resolve("src/main/webapp/WEB-INF/mybatis/mapper/"+name);try(var in=Files.newInputStream(f)){new XMLMapperBuilder(in,conf,f.toString(),conf.getSqlFragments()).parse();}
  }
  var ai=new GeminiService(){@Override public String analyzeQuestion(String q,String selected){return analysis;}@Override public String ask(String q,String refs){answerCalls++;return "test";}};
  try(var session=new SqlSessionFactoryBuilder().build(conf).openSession()){
   var dur=new DurGuideService(new MedicationGuideDao(session));var catalog=new CatalogService(new CatalogDao(session),dur);
   var service=new MedicationChatService(new ChatbotDaoImpl(session),ai,catalog,dur);var controller=new ChatController(service);
   var request=new MedicationChatRequest();request.setQuestion("임산부가 먹으면 안되는 약들이 뭐야?");
   analysis=intent("DB_SEARCH",new CatalogQuery("MEDICATIONS",List.of(),1,"","","ANY"));
   var result=controller.chat(request);var data=json.valueToTree(result.getBody());
   check(result.getStatusCodeValue()==200 && data.path("catalog").path("total").asInt()>0,"pregnancy question returns public product catalog");
   check(data.path("sources").isEmpty()&&!data.has("activeMedication"),"catalog does not silently select a product");
   check(data.path("catalog").path("items").get(0).path("durEvidence").get(0).has("grade"),"pregnancy grade accompanies product evidence");
   Files.writeString(Path.of(args[1]),json.writeValueAsString(result.getBody()));
   request.setQuestion("이 약의 연령금기는?");request.setItemSeq("202106092");analysis=intent("DUR_INFO",new CatalogQuery("DUR",List.of(),3,"","","ANY"));
   data=json.valueToTree(controller.chat(request).getBody());check(data.path("durReports").get(0).path("total").asInt()>0,"selected drug routes to real DUR");
   check(data.path("durReports").get(0).path("items").get(0).path("ageBase").asText().contains("12"),"age criterion retained");
   check(answerCalls==0,"DUR and catalog replies do not invent AI medical explanations");
   var invalid=json.readTree("{\"query\":{\"kind\":\"USERS\",\"filters\":[],\"tabooType\":0,\"grade\":\"\",\"ageBase\":\"\",\"status\":\"ANY\"},\"page\":1}");
   check(controller.catalog(invalid).getStatusCodeValue()==400,"controller rejects private table query");
   var query=new CatalogQuery("MEDICATIONS",List.of(new CatalogQuery.Filter("COMPANY","삼진"),new CatalogQuery.Filter("CATEGORY","일반")),0,"","","ANY");
   var response=controller.catalog(json.valueToTree(Map.of("query",query,"page",1)));var items=json.valueToTree(response.getBody()).path("items");
   check(response.getStatusCodeValue()==200&&!items.isEmpty(),"multiple search filters combined");
   for(var item:items)check(item.path("entpName").asText().contains("삼진")&&item.path("etcOtcCode").asText().contains("일반"),"AND filters respected");
  }
  System.out.println("TOTAL "+checks);
 }
}
