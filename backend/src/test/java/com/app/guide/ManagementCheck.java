package com.app.guide;
import java.nio.file.*;import java.util.*;import java.sql.*;
import org.apache.ibatis.datasource.unpooled.UnpooledDataSource;
import org.apache.ibatis.mapping.Environment;import org.apache.ibatis.session.*;
import org.apache.ibatis.transaction.jdbc.JdbcTransactionFactory;import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import com.app.guide.dao.MedicationGuideDao;import com.app.guide.service.*;import com.app.guide.dto.*;
public class ManagementCheck {
 static int checks;static void check(boolean ok,String name){if(!ok)throw new AssertionError(name);checks++;}
 static MedicationGuideDto med(String id,String ingredient){var m=new MedicationGuideDto();m.setMedicationId(id);m.setItemName(id);m.setMaterialName(ingredient);return m;}
 static RegisteredMedicationDto registered(String id,String state){var r=new RegisteredMedicationDto();r.setRegistrationId(id);r.setMedicationId(id);r.setItemName(id);r.setUseStatus(state);return r;}
 public static void main(String[] args)throws Exception{
  var a=med("A","Alpha/Beta");var b=med("B","Gamma/Alpha");var c=med("C",null);
  var row=new DurInfoDto();row.setTabooType(4);row.setIngrAName("Gamma");row.setIngrBName("Beta");row.setTabooEffect("fixture pair");
  final long[] owner={0};
  var dao=new MedicationGuideDao(null){
   @Override public MedicationGuideDto find(String id){return Map.of("A",a,"B",b,"C",c).get(id);}
   @Override public List<DurInfoDto> findDur(List<String> names){return names.contains("beta")||names.contains("gamma")?List.of(row):List.of();}
   @Override public List<RegisteredMedicationDto> collection(long userId){owner[0]=userId;var unlinked=registered("free","ACTIVE");unlinked.setMedicationId(null);return List.of(registered("A","ACTIVE"),registered("A","ACTIVE"),registered("B","ACTIVE"),registered("C","STORED"),registered("C","UNCONFIRMED"),unlinked);}
   @Override public int updateStatus(long userId,String id,String status){owner[0]=userId;return id.equals("P:1")?1:0;}
  };
  var service=new MedicationManagementService(dao,new DurGuideService(dao));
  var result=service.myComparison(11L);
  check(owner[0]==11,"session owner passed");check(((List<?>)result.get("medications")).size()==2,"only confirmed active and unique products");
  check(((List<?>)result.get("pairs")).size()==1,"reversed DUR matches distinct products");
  check(((List<?>)result.get("duplicates")).size()==1,"shared ingredient shown");
  check(((List<?>)result.get("unlinked")).size()==1,"unlinked active routine disclosed");
  check(((Number)result.get("unconfirmedCount")).longValue()==1,"unconfirmed excluded explicitly");
  check(((List<?>)service.compare(List.of("A","A")).get("pairs")).isEmpty(),"no self-pair for duplicate registrations");
  check(((List<?>)service.compare(List.of("A","C")).get("unresolved")).size()==2,"unknown ingredient and partial coverage disclosed");
  check(((List<?>)service.compare(List.of()).get("pairs")).isEmpty(),"empty comparison");
  for(var ids:List.of(List.of("missing"),Collections.nCopies(51,"A"))){try{service.compare(ids);throw new AssertionError("invalid selection accepted");}catch(IllegalArgumentException expected){checks++;}}
  service.update(22L,"P:1","PAUSED");check(owner[0]==22,"write owner scoped");
  for(var entry:List.of(List.of("P:1","bad"),List.of("bad","ACTIVE"),List.of("P:999","ACTIVE"))){try{service.update(11,entry.get(0),entry.get(1));throw new AssertionError("invalid mutation accepted");}catch(IllegalArgumentException expected){checks++;}}
  Path base=Path.of(args[0]);var props=new Properties();try(var r=Files.newBufferedReader(base.resolve("src/main/resources/config/db.properties"))){props.load(r);}
  var ds=new UnpooledDataSource(props.getProperty("jdbc.driver"),props.getProperty("jdbc.url"),props.getProperty("jdbc.username"),props.getProperty("jdbc.password"));
  var config=new Configuration(new Environment("test",new JdbcTransactionFactory(),ds));var file=base.resolve("src/main/webapp/WEB-INF/mybatis/mapper/guide/guide_mapper.xml");
  try(var in=Files.newInputStream(file)){new XMLMapperBuilder(in,config,file.toString(),config.getSqlFragments()).parse();}
  try(var session=new SqlSessionFactoryBuilder().build(config).openSession(false)){
   var real=new MedicationGuideDao(session);check(real.collection(-1).isEmpty(),"real Oracle collection SQL and state schema");
   check(real.updateStatus(-1,"P:1","ACTIVE")==0,"non-owner cannot update or insert a state");session.rollback();
  }
  var controller=new com.app.guide.controller.MedicationManagementController(service);
  check(controller.collection(RegisteredGuideCheck.request(null)).getStatusCodeValue()==401,"anonymous collection denied");
  check(controller.mine(RegisteredGuideCheck.request("11")).getStatusCodeValue()==401,"forged string identity denied");
  check(controller.collection(RegisteredGuideCheck.request(11L)).getStatusCodeValue()==200&&owner[0]==11,"collection controller uses verified owner");
  check(controller.update("P:1",new com.app.guide.controller.MedicationManagementController.StatusRequest("ACTIVE"),RegisteredGuideCheck.request(null)).getStatusCodeValue()==401,"anonymous mutation denied");
  String sql=config.getMappedStatement("com.app.guide.dao.MedicationGuideDao.collection").getBoundSql(Map.of("userId",11L)).getSql();
  String fixture="""
   WITH today AS (SELECT TRUNC(CAST(SYSTIMESTAMP AT TIME ZONE 'Asia/Seoul' AS DATE)) d FROM dual),
   prescriptions AS (SELECT 1 prescription_id,11 user_id,d dispensed_date FROM today UNION ALL SELECT 2,11,d-3 FROM today UNION ALL SELECT 3,11,d+1 FROM today UNION ALL SELECT 4,22,d FROM today),
   prescription_items AS (SELECT 1 item_id,1 prescription_id,'M' medication_id,1 total_days,'meal' usage_timing FROM dual UNION ALL SELECT 2,2,'M',1,'meal' FROM dual UNION ALL SELECT 3,3,'M',1,'meal' FROM dual UNION ALL SELECT 4,4,'M',1,'meal' FROM dual),
   medications AS (SELECT 'M' medication_id,'fixture' item_name,'maker' entp_name,'Alpha' material_name,CAST(NULL AS VARCHAR2(100)) item_image_url FROM dual),
   cabinet_medications AS (SELECT 1 cabinet_id,11 user_id,'M' medication_id FROM dual UNION ALL SELECT 2,22,'M' FROM dual UNION ALL SELECT 3,11,'M' FROM dual UNION ALL SELECT 4,11,'M' FROM dual),
   routine_medications AS (SELECT 1 routine_id,11 user_id,'supplement' supplement_name,'08:00' take_time,'note' notes,'ACTIVE' status FROM dual UNION ALL SELECT 2,11,'ended','08:00','note','ENDED' FROM dual UNION ALL SELECT 3,11,'paused','08:00','note','PAUSED' FROM dual),
   medication_use_states AS (SELECT 11 user_id,'C:3' registration_id,'STORED' use_status FROM dual UNION ALL SELECT 11,'C:4','ENDED' FROM dual UNION ALL SELECT 11,'P:2','ACTIVE' FROM dual UNION ALL SELECT 22,'C:1','STORED' FROM dual)
   """;
  try(var connection=ds.getConnection();var st=connection.prepareStatement(fixture+sql)){
   for(int i=1;i<=4;i++)st.setLong(i,11L);
   var states=new HashMap<String,String>();int remaining=0;
   try(var rs=st.executeQuery()){while(rs.next()){states.put(rs.getString("registration_id"),rs.getString("use_status"));if(rs.getString("registration_id").equals("P:1"))remaining=rs.getInt("days_remaining");}}
   check(states.size()==9,"history includes past and future without other users");
   check("ACTIVE".equals(states.get("P:1"))&&remaining==1,"new prescription defaults active and today included");
   check("ENDED".equals(states.get("P:2")),"expired prescription overrides old active marker");
   check("UPCOMING".equals(states.get("P:3")),"future prescription excluded from active");
   check("ACTIVE".equals(states.get("C:1")),"another user's marker cannot affect cabinet status");
   check("ACTIVE".equals(states.get("R:1"))&&"ENDED".equals(states.get("R:2")),"new routine defaults active and ended stays ended");
  }
  // Stored/manual states must remain explicit overrides, not be bulk-reset.
  try(var connection=ds.getConnection();var st=connection.prepareStatement(fixture+sql)) {
   for(int i=1;i<=4;i++)st.setLong(i,11L);
   var states=new HashMap<String,String>();try(var rs=st.executeQuery()){while(rs.next())states.put(rs.getString("registration_id"),rs.getString("use_status"));}
   check("STORED".equals(states.get("C:3")),"user stored override preserved");
   check("ENDED".equals(states.get("C:4")),"user ended override preserved");
   check("PAUSED".equals(states.get("R:3")),"paused routine preserved");
  }
  System.out.println("PASS: "+checks+" management comparison, state and Oracle checks");
 }
}
