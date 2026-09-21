package com.app.chatbot.service;
import java.nio.file.*;import java.util.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.ibatis.datasource.unpooled.UnpooledDataSource;
import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.session.*;
import org.apache.ibatis.transaction.jdbc.JdbcTransactionFactory;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import com.app.chatbot.dao.CatalogDao;
import com.app.guide.dao.MedicationGuideDao;
import com.app.guide.service.DurGuideService;
import com.app.guide.dto.DurInfoDto;
public class CatalogCheck {
 static int checks;
 static void check(boolean ok,String name){if(!ok)throw new AssertionError(name);checks++;System.out.println("PASS "+name);}
 static CatalogQuery q(String kind,String field,String value,int type){return new CatalogQuery(kind,field.isEmpty()?List.of():List.of(new CatalogQuery.Filter(field,value)),type,"","","ANY");}
 static void invalid(Runnable r,String name){try{r.run();throw new AssertionError(name);}catch(IllegalArgumentException expected){check(true,name);}}
 public static void main(String[] args)throws Exception{
  invalid(()->q("USERS","NAME","x",0),"private tables cannot be selected");
  invalid(()->q("MEDICATIONS","password_hash","x",0),"unknown columns rejected");
  invalid(()->q("DUR","COMPANY","x",0),"incompatible fields rejected");
  invalid(()->q("DUR","","",9),"unknown DUR type rejected");
  invalid(()->CatalogQuery.empty().parameters(0),"page zero rejected");
  invalid(()->CatalogQuery.empty().parameters(100001),"unbounded page rejected");
  invalid(()->q("MEDICATIONS","INGREDIENT","invented",0).validateQuestion("텐텐 성분"),"invented translated ingredients rejected");
  check(CatalogQuery.normalize(" A B ").equals("ab"),"normalization");
  var row=new DurInfoDto();row.setIngrAName("A");row.setIngrBName("B");row.setTabooType(4);
  check(MedicationChatService.bridges(List.of(Set.of("b"),Set.of("a")),row),"reverse pair matches");
  check(!MedicationChatService.bridges(List.of(Set.of("a","b"),Set.of("c")),row),"same product pair not treated as cross-product interaction");
  check(!MedicationChatService.bridges(List.of(Set.of("a"),Set.of("c")),row),"unrelated pair excluded");
  var p=new Properties();Path base=Path.of(args[0]);try(var reader=Files.newBufferedReader(base.resolve("src/main/resources/config/db.properties"))){p.load(reader);}
  var ds=new UnpooledDataSource(p.getProperty("jdbc.driver"),p.getProperty("jdbc.url"),p.getProperty("jdbc.username"),p.getProperty("jdbc.password"));
  var config=new Configuration(new Environment("test",new JdbcTransactionFactory(),ds));
  for(String name:List.of("chatbot/catalog_mapper.xml","guide/guide_mapper.xml")){
   var file=base.resolve("src/main/webapp/WEB-INF/mybatis/mapper/"+name);try(var in=Files.newInputStream(file)){new XMLMapperBuilder(in,config,file.toString(),config.getSqlFragments()).parse();}
  }
  try(var session=new SqlSessionFactoryBuilder().build(config).openSession()){
   var dao=new CatalogDao(session);var svc=new CatalogService(dao,new DurGuideService(new MedicationGuideDao(session)));
   for(var query:List.of(q("MEDICATIONS","NAME","텐텐",0),q("MEDICATIONS","INGREDIENT","아세트아미노펜",0),q("MEDICATIONS","EFFICACY","두통",0),q("MEDICATIONS","USAGE","식전",0),q("MEDICATIONS","COMPANY","삼진",0),q("MEDICATIONS","CLASSIFICATION","중추",0),q("MEDICATIONS","CODE","197400262",0),q("MEDICATIONS","CATEGORY","일반",0),q("DUR","INGREDIENT","acetaminophen",0),q("DUR","EFFECT","태아",1))){
    long t=System.currentTimeMillis();int n=dao.count(query);var items=dao.search(query,1);check(n>0&&!items.isEmpty(),"DB "+query.kind()+" "+query.filters().get(0).field()+" ("+(System.currentTimeMillis()-t)+"ms)");
   }
   for(int type=1;type<=4;type++){
    var query=q("DUR","","",type);var items=dao.search(query,1);check(!items.isEmpty()&&items.stream().allMatch(v->Integer.parseInt(v.get("tabooType").toString())==query.tabooType()),"DUR type "+type);
   }
   var query=new CatalogQuery("DUR",List.of(),1,"1등급","","ANY");check(dao.search(query,1).stream().allMatch(v->"1등급".equals(v.get("grade"))),"grade filter");
   query=new CatalogQuery("DUR",List.of(),3,"","12세 미만","ANY");check(!dao.search(query,1).isEmpty(),"age text filter");
   var one=dao.search(CatalogQuery.empty(),1);var two=dao.search(CatalogQuery.empty(),2);check(one.size()==20&&two.size()==20&&one.stream().noneMatch(a->two.stream().anyMatch(b->a.get("itemSeq").equals(b.get("itemSeq")))),"pagination has no overlapping products");
   check(dao.count(q("MEDICATIONS","NAME","' OR 1=1 --",0))==0,"SQL syntax remains a bound literal");
   long t=System.currentTimeMillis();var pregnancy=svc.search(q("MEDICATIONS","","",1),1);
   check((int)pregnancy.get("total")>0,"pregnancy medication list with evidence ("+(System.currentTimeMillis()-t)+"ms)");
   var entries=(List<Map<String,Object>>)pregnancy.get("items");check(entries.stream().allMatch(v->((int)v.get("durEvidenceTotal"))>0),"each pregnancy product has matched evidence");
  }
  System.out.println("TOTAL "+checks);
 }
}
