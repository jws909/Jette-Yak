package com.app.guide;
import java.nio.file.*;import java.util.*;import java.sql.*;import java.lang.reflect.Proxy;
import javax.servlet.http.*;
import org.apache.ibatis.datasource.unpooled.UnpooledDataSource;
import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.session.*;
import org.apache.ibatis.transaction.jdbc.JdbcTransactionFactory;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import com.app.guide.dao.MedicationGuideDao;
import com.app.guide.controller.MedicationGuideController;
public class RegisteredGuideCheck {
 static void check(boolean value,String name){if(!value)throw new AssertionError(name);System.out.println("PASS "+name);}
 static HttpServletRequest request(Object id){
  var session=(HttpSession)Proxy.newProxyInstance(HttpSession.class.getClassLoader(),new Class[]{HttpSession.class},(p,m,a)->m.getName().equals("getAttribute")?id:null);
  return (HttpServletRequest)Proxy.newProxyInstance(HttpServletRequest.class.getClassLoader(),new Class[]{HttpServletRequest.class},(p,m,a)->m.getName().equals("getSession")?session:null);
 }
 public static void main(String[] args)throws Exception{
  Path base=Path.of(args[0]);var p=new Properties();try(var r=Files.newBufferedReader(base.resolve("src/main/resources/config/db.properties"))){p.load(r);}
  var ds=new UnpooledDataSource(p.getProperty("jdbc.driver"),p.getProperty("jdbc.url"),p.getProperty("jdbc.username"),p.getProperty("jdbc.password"));
  var config=new Configuration(new Environment("test",new JdbcTransactionFactory(),ds));
  var file=base.resolve("src/main/webapp/WEB-INF/mybatis/mapper/guide/guide_mapper.xml");
  try(var in=Files.newInputStream(file)){new XMLMapperBuilder(in,config,file.toString(),config.getSqlFragments()).parse();}
  try(var session=new SqlSessionFactoryBuilder().build(config).openSession()){
   check(new MedicationGuideDao(session).findRegistered(-1).isEmpty(),"real schema accepts query for nonexistent user");
  }
  String sql=config.getMappedStatement("com.app.guide.dao.MedicationGuideDao.findRegistered").getBoundSql(Map.of("userId",11L)).getSql();
  // Read-only CTE fixtures exercise the real mapper SQL without inserting personal records.
  String fixtures="""
   WITH today AS (SELECT TRUNC(CAST(SYSTIMESTAMP AT TIME ZONE 'Asia/Seoul' AS DATE)) d FROM dual),
   prescriptions AS (
     SELECT 1 prescription_id,11 user_id,d dispensed_date FROM today UNION ALL
     SELECT 2,11,d-2 FROM today UNION ALL SELECT 3,11,d+1 FROM today UNION ALL
     SELECT 4,22,d FROM today UNION ALL SELECT 5,11,d-1 FROM today),
   prescription_items AS (
     SELECT 1 item_id,1 prescription_id,'M1' medication_id,1 total_days,'meal' usage_timing FROM dual UNION ALL
     SELECT 2,2,'M1',2,'meal' FROM dual UNION ALL SELECT 3,3,'M1',3,'meal' FROM dual UNION ALL
     SELECT 4,4,'M1',3,'meal' FROM dual UNION ALL SELECT 5,5,'M1',2,'meal' FROM dual),
   medications AS (SELECT 'M1' medication_id,'fixture' item_name,'maker' entp_name FROM dual),
   cabinet_medications AS (SELECT 1 cabinet_id,11 user_id,'M1' medication_id FROM dual UNION ALL SELECT 2,22,'M1' FROM dual),
   routine_medications AS (
     SELECT 1 routine_id,11 user_id,'supplement' supplement_name,'08:00' take_time,'note' notes,'ACTIVE' status FROM dual UNION ALL
     SELECT 2,11,'paused','08:00','note','PAUSED' FROM dual UNION ALL
     SELECT 3,22,'other','08:00','note','ACTIVE' FROM dual UNION ALL
     SELECT 4,11,'ended','08:00','note','ENDED' FROM dual)
   """;
  try(var c=ds.getConnection();var st=c.prepareStatement(fixtures+sql)){
   for(int i=1;i<=3;i++)st.setLong(i,11L);
   Set<String> ids=new HashSet<>();try(var rs=st.executeQuery()){while(rs.next())ids.add(rs.getString("registration_id"));}
   check(ids.equals(Set.of("P:1","P:5","C:1","R:1")),"owner isolation, start/end inclusivity, expired/future exclusion, active routines");
  }
  final long[] seen={0};
  var dao=new MedicationGuideDao(null){@Override public List<com.app.guide.dto.RegisteredMedicationDto> findRegistered(long id){seen[0]=id;return List.of();}};
  var controller=new MedicationGuideController(dao,null);
  check(controller.registered(request(null)).getStatusCodeValue()==401,"missing session identity rejected");
  check(controller.registered(request("11")).getStatusCodeValue()==401,"unverified string identity rejected");
  check(controller.registered(request(-1L)).getStatusCodeValue()==401,"invalid identity rejected");
  var response=controller.registered(request(11L));
  check(response.getStatusCodeValue()==200 && seen[0]==11L,"server identity scopes query");
  check("no-store".equals(response.getHeaders().getCacheControl()),"private results never cached");
 }
}
