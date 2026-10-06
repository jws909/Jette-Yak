/**
 * 역할: 게시글 삭제의 작성자·관리자 권한과 거부 응답 점검
 * DB 점검은 임시 SELECT 데이터만 사용해 실제 게시글과 사용자 정보 보존
 */
package com.app.community;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.util.Map;
import java.util.List;
import java.util.Properties;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.datasource.unpooled.UnpooledDataSource;
import org.apache.ibatis.mapping.BoundSql;
import org.apache.ibatis.session.Configuration;
import com.app.community.dao.CommunityDao;
import com.app.community.service.CommunityService;
import com.app.community.controller.CommunityController;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpSession;
import java.lang.reflect.Proxy;

public class CommunityDeletionCheck {
    private static int checks;
    private static final String STATEMENT = "com.app.community.CommunityMapper.deletePost";

    private static void check(boolean passed,String description) {
        if(!passed)throw new AssertionError(description);
        checks++;
    }

    public static void main(String[] args) throws Exception {
        Path backend=Path.of(args[0]);
        Configuration config=new Configuration();
        Path mapper=backend.resolve("src/main/webapp/WEB-INF/mybatis/mapper/community/community_mapper.xml");
        try(var in=Files.newInputStream(mapper)) {
            new XMLMapperBuilder(in,config,mapper.toString(),config.getSqlFragments()).parse();
        }
        BoundSql sql=config.getMappedStatement(STATEMENT).getBoundSql(Map.of("postId",10L,"userId",22L,"isAdmin",1));
        check(sql.getSql().contains("status='DELETED'"),"delete preserves related rows through a status change");
        check(sql.getParameterMappings().stream().noneMatch(p->p.getProperty().equals("isAdmin")),"client admin flag is never trusted");

        final long[] attemptedUser={0};
        CommunityDao dao=new CommunityDao(null) {
            @Override public int deletePost(long postId,long userId) {
                attemptedUser[0]=userId;
                return postId==10&&userId==22?1:0;
            }
        };
        CommunityService service=new CommunityService(dao,null);
        service.delete(10,22);
        check(attemptedUser[0]==22,"service forwards the authenticated user identifier");
        try {
            service.delete(10,33);
            throw new AssertionError("unauthorized deletion did not fail");
        } catch(SecurityException expected) { checks++; }

        // 사용자 번호만 있는 프로필 조회 세션으로 관리자 권한을 얻지 못하도록 HTTP 경계 확인
        var controller=new CommunityController(service);
        for(var request:List.of(request(22L,false),request("22",true),request(-1L,true))) {
            try { controller.delete(10,request);throw new AssertionError("unverified session accepted"); }
            catch(SecurityException expected) { checks++; }
        }
        controller.delete(10,request(22L,true));
        check(attemptedUser[0]==22,"only authenticated numeric identity reaches delete service");

        // 실제 Oracle 문법과 권한 조건을 읽기 전용 CTE로 검증
        Properties properties=new Properties();
        try(var reader=Files.newBufferedReader(backend.resolve("src/main/resources/config/db.properties"))) {
            properties.load(reader);
        }
        var dataSource=new UnpooledDataSource(properties.getProperty("jdbc.driver"),properties.getProperty("jdbc.url"),properties.getProperty("jdbc.username"),properties.getProperty("jdbc.password"));
        try(Connection connection=dataSource.getConnection()) {
            check(matches(connection,config,10,11)==1,"author can delete their visible post");
            check(matches(connection,config,10,22)==1,"current DB administrator can delete another user's post");
            check(matches(connection,config,10,33)==0,"ordinary user cannot delete another user's post despite fake isAdmin flag");
            check(matches(connection,config,10,44)==0,"missing or removed administrator cannot delete another user's post");
            check(matches(connection,config,12,11)==0,"already deleted post cannot be deleted again");
            check(matches(connection,config,12,22)==0,"administrator cannot repeat a deleted post action");
            check(matches(connection,config,13,22)==1,"administrator can delete a hidden post");
        }
        System.out.println("PASS: "+checks+" community deletion ownership and read-only Oracle checks");
    }

    private static HttpServletRequest request(Object userId,boolean authenticated) {
        HttpSession session=(HttpSession)Proxy.newProxyInstance(HttpSession.class.getClassLoader(),new Class<?>[]{HttpSession.class},(proxy,method,args)->{
            if(method.getName().equals("getAttribute"))return args[0].equals("userId")?userId:args[0].equals("authenticated")?authenticated:null;
            return null;
        });
        return (HttpServletRequest)Proxy.newProxyInstance(HttpServletRequest.class.getClassLoader(),new Class<?>[]{HttpServletRequest.class},(proxy,method,args)->method.getName().equals("getSession")?session:null);
    }

    private static int matches(Connection connection,Configuration config,long postId,long userId) throws Exception {
        Map<String,Object> params=Map.of("postId",postId,"userId",userId,"isAdmin",1);
        BoundSql bound=config.getMappedStatement(STATEMENT).getBoundSql(params);
        String sql=bound.getSql();
        int where=sql.toUpperCase(java.util.Locale.ROOT).indexOf("WHERE POST_ID");
        check(where>0,"mapped deletion SQL contains a scoped post filter");
        int skipped=(int)sql.substring(0,where).chars().filter(character->character=='?').count();
        String fixture="""
            WITH community_posts AS (
                SELECT 10 post_id,11 user_id,'VISIBLE' status FROM dual
                UNION ALL SELECT 12,11,'DELETED' FROM dual
                UNION ALL SELECT 13,11,'HIDDEN' FROM dual
            ), users AS (
                SELECT 11 user_id,0 is_admin FROM dual
                UNION ALL SELECT 22,1 FROM dual
                UNION ALL SELECT 33,0 FROM dual
            )
            SELECT COUNT(*) FROM community_posts
            """;
        try(var statement=connection.prepareStatement(fixture+sql.substring(where))) {
            int parameter=1;
            for(var mapping:bound.getParameterMappings().subList(skipped,bound.getParameterMappings().size())) {
                statement.setLong(parameter++,((Number)params.get(mapping.getProperty())).longValue());
            }
            try(var result=statement.executeQuery()) { result.next();return result.getInt(1); }
        }
    }
}
