package com.app.guide;
import java.nio.file.*;import java.util.*;import java.sql.*;
import com.app.guide.dao.MedicationGuideDao;
import com.app.guide.service.DurGuideService;
import com.app.guide.controller.MedicationGuideController;
import org.apache.ibatis.datasource.unpooled.UnpooledDataSource;
import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.session.*;
import org.apache.ibatis.transaction.jdbc.JdbcTransactionFactory;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
public class DurGuideCheck {
 static int checks;static void check(boolean ok,String message){if(!ok)throw new AssertionError(message);checks++;System.out.println("PASS "+message);}
 public static void main(String[] args)throws Exception{
 String base=args[0];var p=new Properties();try(var r=Files.newBufferedReader(Path.of(base,"src/main/resources/config/db.properties"))){p.load(r);}
 var ds=new UnpooledDataSource(p.getProperty("jdbc.driver"),p.getProperty("jdbc.url"),p.getProperty("jdbc.username"),p.getProperty("jdbc.password"));
 var config=new Configuration(new Environment("test",new JdbcTransactionFactory(),ds));
 var mapper=Path.of(base,"src/main/webapp/WEB-INF/mybatis/mapper/guide/guide_mapper.xml");
 try(var in=Files.newInputStream(mapper)){new XMLMapperBuilder(in,config,mapper.toString(),config.getSqlFragments()).parse();}
 try(var session=new SqlSessionFactoryBuilder().build(config).openSession();var connection=ds.getConnection()){
 var dao=new MedicationGuideDao(session);var service=new DurGuideService(dao);
 check(service.find(null).status().equals("NO_INGREDIENTS"),"missing ingredient status");
 check(DurGuideService.ingredients(" A / a /B /").equals(List.of("A","B")),"split and deduplicate compound ingredients");
 check(service.find("nonexistent-test-ingredient").status().equals("NO_MATCH"),"no match is separate from safety");
 check(service.find("Acet").items().isEmpty(),"no partial ingredient matching");
 check(!DurGuideService.normalize("Cyproheptadine Orotate Hydrate").equals(DurGuideService.normalize("Cyproheptadine")),"salt forms never silently equated");
 for(int type=1;type<=4;type++){
 try(var st=connection.prepareStatement("SELECT ingr_a_name,ingr_b_name FROM medication_interactions WHERE taboo_type=? AND ingr_a_name IS NOT NULL FETCH FIRST 1 ROWS ONLY")){
 st.setInt(1,type);try(var rs=st.executeQuery()){if(!rs.next())throw new AssertionError("missing DUR fixture");
 String a=rs.getString(1),b=rs.getString(2);int expectedType=type;
 var result=service.find(a);check(result.items().stream().anyMatch(row->row.getTabooType()==expectedType),"type "+type+" by A ingredient");
 if(type==1)check(result.items().stream().anyMatch(row->row.getTabooType()==1&&row.getGrade()!=null),"pregnancy grade mapped");
 if(type==3)check(result.items().stream().anyMatch(row->row.getTabooType()==3&&row.getAgeBase()!=null),"age criterion mapped");
 if(type==4&&b!=null){var reverse=service.find(b);check(reverse.items().stream().anyMatch(row->a.equals(row.getIngrAName())&&b.equals(row.getIngrBName())),"B-side interaction retrieved");}
 check(result.items().stream().allMatch(row->DurGuideService.normalize(a).equals(DurGuideService.normalize(row.getIngrAName()))||(row.getTabooType()==4&&DurGuideService.normalize(a).equals(DurGuideService.normalize(row.getIngrBName())))),"only exact matched rows for type "+type);
 }}
 }
 var result=service.find("Acetaminophen/UNMATCHED_TEST");check(result.matchedIngredients().contains("Acetaminophen")&&result.unmatchedIngredients().contains("UNMATCHED_TEST"),"partial coverage disclosed");
 var controller=new MedicationGuideController(dao,service);check(controller.get("202106092").getStatusCodeValue()==200,"medication guide including DUR response");
 check(controller.get("missing").getStatusCodeValue()==404,"missing medication still 404");
 System.out.println("TOTAL "+checks+" checks passed");
 }
 }
}
