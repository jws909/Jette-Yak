/**
 * 역할: 게시글 삭제의 작성자·관리자 권한과 거부 응답 점검
 * --oracle-readonly는 임시 SELECT 데이터로 문자형·숫자형 관리자 값과 처리 기록 확인
 */
package com.app.community;

import java.lang.reflect.Proxy;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Types;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Properties;
import java.util.StringJoiner;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpSession;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.datasource.unpooled.UnpooledDataSource;
import org.apache.ibatis.mapping.BoundSql;
import org.apache.ibatis.session.Configuration;
import org.apache.ibatis.session.SqlSession;
import org.springframework.transaction.annotation.Transactional;
import com.app.community.controller.CommunityController;
import com.app.community.dao.CommunityDao;
import com.app.community.service.CommunityService;

public class CommunityDeletionCheck {
    private static int checks;
    private static final String STATEMENT="com.app.community.CommunityMapper.deletePost";

    private static void check(boolean passed,String description) {
        if(!passed)throw new AssertionError(description);
        checks++;
    }

    public static void main(String[] args) throws Exception {
        Path backend=Path.of(args[0]);
        Path mapper=args.length>1&&!args[1].startsWith("--")?Path.of(args[1])
            :backend.resolve("src/main/webapp/WEB-INF/mybatis/mapper/community/community_mapper.xml");
        Configuration config=new Configuration();
        try(var in=Files.newInputStream(mapper)) {
            new XMLMapperBuilder(in,config,mapper.toString(),config.getSqlFragments()).parse();
        }
        BoundSql bound=config.getMappedStatement(STATEMENT).getBoundSql(Map.of("postId",10L,"userId",22L,"isAdmin",1));
        String sql=bound.getSql().replaceAll("\\s+"," ").trim();
        check(sql.startsWith("UPDATE community_posts SET status='DELETED'"),"delete is a status change that preserves related rows");
        check(bound.getParameterMappings().stream().noneMatch(p->p.getProperty().equals("isAdmin")),"client admin flag is never trusted");
        check(sql.contains("UPPER(TRIM(acting_user.is_admin)) IN ('Y','YES','TRUE','1','ADMIN')"),"administrator flag uses the same text normalization as authentication");
        check(!sql.contains("acting_user.is_admin=1"),"character administrator flags are never compared to a number");
        check(sql.contains("WHERE post_id=? AND status<>'DELETED'")&&sql.contains("acting_user.user_id=?"),"delete is scoped to one existing post and the current database user");

        // DAO는 서버에서 확인한 사용자 번호만 매퍼에 전달
        List<Object> sent=new ArrayList<>();
        SqlSession session=(SqlSession)Proxy.newProxyInstance(SqlSession.class.getClassLoader(),new Class<?>[]{SqlSession.class},(proxy,method,values)->{
            if(!method.getName().equals("update"))throw new AssertionError("unexpected DAO operation: "+method.getName());
            check(values[0].equals(STATEMENT),"DAO calls the scoped deletion statement");
            sent.add(values[1]);
            return 1;
        });
        check(new CommunityDao(session).deletePost(10,22)==1,"DAO returns the affected row count");
        check(sent.size()==1&&sent.get(0).equals(Map.of("postId",10L,"userId",22L)),"DAO sends no caller-supplied administrator flag");

        final long[] attemptedUser={0};
        final int[] attempts={0};
        CommunityDao dao=new CommunityDao(null) {
            @Override public int deletePost(long postId,long userId) {
                attempts[0]++;
                attemptedUser[0]=userId;
                return postId==10&&(userId==11||userId==22)?1:0;
            }
        };
        CommunityService service=new CommunityService(dao,null);
        service.delete(10,22);
        check(attemptedUser[0]==22,"service forwards the authenticated user identifier");
        check(CommunityService.class.getMethod("delete",long.class,long.class).isAnnotationPresent(Transactional.class),"deletion remains transactional");
        try {
            service.delete(10,33);
            throw new AssertionError("unauthorized deletion did not fail");
        } catch(SecurityException expected) { checks++; }

        // 인증되지 않은 세션과 잘못된 사용자 번호는 DB 호출 전에 거부
        var controller=new CommunityController(service);
        int before=attempts[0];
        for(var request:List.of(request(22L,false),request("22",true),request(-1L,true),request(null,true))) {
            try { controller.delete(10,request);throw new AssertionError("unverified session accepted"); }
            catch(SecurityException expected) { check(controller.forbidden(expected).getStatusCodeValue()==403,"invalid session receives HTTP 403"); }
        }
        check(attempts[0]==before,"invalid sessions never reach the DAO");
        check(controller.delete(10,request(22L,true)).getStatusCodeValue()==204&&attemptedUser[0]==22,"authenticated administrator deletion receives HTTP 204");
        check(controller.delete(10,request(11L,true)).getStatusCodeValue()==204&&attemptedUser[0]==11,"authenticated author deletion receives HTTP 204");
        try { controller.delete(10,request(33L,true));throw new AssertionError("ordinary user deleted another user's post"); }
        catch(SecurityException expected) { check(controller.forbidden(expected).getStatusCodeValue()==403,"ordinary user deleting another user's post receives HTTP 403"); }

        boolean oracle=Arrays.asList(args).contains("--oracle-readonly");
        if(oracle) {
            try { oracleChecks(backend,config); }
            catch(SQLException error) { throw new AssertionError("Read-only Oracle fixture failed: code="+error.getErrorCode()+", SQLState="+error.getSQLState()); }
        }
        System.out.println("PASS: "+checks+" community deletion checks ("+(oracle?"including read-only Oracle fixtures":"offline")+")");
    }

    private static HttpServletRequest request(Object userId,boolean authenticated) {
        HttpSession session=(HttpSession)Proxy.newProxyInstance(HttpSession.class.getClassLoader(),new Class<?>[]{HttpSession.class},(proxy,method,args)->{
            if(method.getName().equals("getAttribute"))return args[0].equals("userId")?userId:args[0].equals("authenticated")?authenticated:null;
            return null;
        });
        return (HttpServletRequest)Proxy.newProxyInstance(HttpServletRequest.class.getClassLoader(),new Class<?>[]{HttpServletRequest.class},(proxy,method,args)->method.getName().equals("getSession")?session:null);
    }

    private static void oracleChecks(Path backend,Configuration config) throws Exception {
        Properties properties=new Properties();
        try(var reader=Files.newBufferedReader(backend.resolve("src/main/resources/config/db.properties"))) {
            properties.load(reader);
        }
        var dataSource=new UnpooledDataSource(properties.getProperty("jdbc.driver"),properties.getProperty("jdbc.url"),properties.getProperty("jdbc.username"),properties.getProperty("jdbc.password"));
        try(Connection connection=dataSource.getConnection()) {
            // 실행문은 모두 SELECT이며 CTE의 가상 게시글·사용자만 참조
            for(String flag:List.of("Y"," y ","YES","TRUE","1","ADMIN")) {
                Projection row=projection(connection,config,10,22,flag,false);
                check(row!=null&&row.status().equals("DELETED")&&Long.valueOf(22).equals(row.moderatedBy())&&row.moderatedAt()!=null,"text administrator flag "+flag+" authorizes deletion and records the moderator");
            }
            for(String flag:Arrays.asList("N","FALSE","0","",null)) {
                check(projection(connection,config,10,22,flag,false)==null,"non-admin text or null flag cannot delete another user's post");
            }
            Projection numeric=projection(connection,config,10,22,1,true);
            check(numeric!=null&&Long.valueOf(22).equals(numeric.moderatedBy()),"numeric administrator flag 1 remains supported");
            for(Integer flag:Arrays.asList(0,2,null)) {
                check(projection(connection,config,10,22,flag,true)==null,"non-admin numeric or null flag cannot delete another user's post");
            }
            Projection author=projection(connection,config,10,11,"N",false);
            check(author!=null&&author.moderatedBy()==null&&author.moderatedAt()==null,"author deletion does not create a moderator record");
            check(projection(connection,config,10,33,"Y",false)==null,"another ordinary user is denied despite a different administrator existing");
            check(projection(connection,config,10,44,"Y",false)==null,"missing administrator is denied");
            check(projection(connection,config,12,11,"Y",false)==null,"author cannot delete an already deleted post");
            check(projection(connection,config,12,22,"Y",false)==null,"administrator cannot delete an already deleted post");
            check(projection(connection,config,13,22,"Y",false)!=null,"administrator can delete a hidden post");
            Projection reviewed=projection(connection,config,14,11,"N",false);
            check(reviewed!=null&&Long.valueOf(22).equals(reviewed.moderatedBy())&&java.sql.Date.valueOf("2026-01-01").equals(reviewed.moderatedAt()),"author deletion preserves an earlier moderation record");
        }
    }

    private record Projection(String status,Long moderatedBy,java.sql.Date moderatedAt) {}

    private static Projection projection(Connection connection,Configuration config,long postId,long userId,Object flag,boolean numeric) throws Exception {
        Map<String,Object> params=Map.of("postId",postId,"userId",userId,"isAdmin",1);
        BoundSql bound=config.getMappedStatement(STATEMENT).getBoundSql(params);
        String sql=bound.getSql().replaceAll("\\s+"," ").trim();
        String upper=sql.toUpperCase(Locale.ROOT);
        int set=upper.indexOf(" SET ");
        int where=upper.indexOf(" WHERE POST_ID");
        if(set<0||where<=set)throw new AssertionError("mapped deletion SQL has no scoped assignments");
        StringJoiner columns=new StringJoiner(",");
        for(String assignment:sql.substring(set+5,where).split(",")) {
            int equals=assignment.indexOf('=');
            columns.add(assignment.substring(equals+1)+" AS "+assignment.substring(0,equals).trim());
        }
        String fixture="""
            WITH community_posts AS (
                SELECT 10 post_id,11 user_id,'VISIBLE' status,CAST(NULL AS NUMBER) moderated_by,CAST(NULL AS DATE) moderated_at FROM dual
                UNION ALL SELECT 12,11,'DELETED',NULL,NULL FROM dual
                UNION ALL SELECT 13,11,'HIDDEN',NULL,NULL FROM dual
                UNION ALL SELECT 14,11,'VISIBLE',22,DATE '2026-01-01' FROM dual
            ), users AS (
            """;
        fixture+=numeric
            ?"SELECT 11 user_id,0 is_admin FROM dual UNION ALL SELECT 22,CAST(? AS NUMBER) FROM dual UNION ALL SELECT 33,0 FROM dual) "
            :"SELECT 11 user_id,CAST('N' AS VARCHAR2(20)) is_admin FROM dual UNION ALL SELECT 22,CAST(? AS VARCHAR2(20)) FROM dual UNION ALL SELECT 33,'N' FROM dual) ";
        // UPDATE의 대입식과 WHERE를 SELECT로 옮겨 바인딩·권한·기록을 함께 검증
        try(var statement=connection.prepareStatement(fixture+"SELECT "+columns+" FROM community_posts"+sql.substring(where))) {
            if(flag==null)statement.setNull(1,numeric?Types.NUMERIC:Types.VARCHAR);
            else statement.setObject(1,flag);
            int parameter=2;
            for(var mapping:bound.getParameterMappings()) {
                statement.setLong(parameter++,((Number)params.get(mapping.getProperty())).longValue());
            }
            try(var result=statement.executeQuery()) {
                if(!result.next())return null;
                Number moderator=(Number)result.getObject("moderated_by");
                Projection row=new Projection(result.getString("status"),moderator==null?null:moderator.longValue(),result.getDate("moderated_at"));
                if(result.next())throw new AssertionError("one post identifier matched multiple fixture rows");
                return row;
            }
        }
    }
}
