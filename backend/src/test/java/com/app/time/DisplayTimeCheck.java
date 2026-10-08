package com.app.time;

import java.lang.reflect.Proxy;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Properties;
import java.util.regex.Pattern;
import javax.servlet.http.HttpServletRequest;
import javax.sql.DataSource;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.datasource.unpooled.UnpooledDataSource;
import org.apache.ibatis.session.Configuration;
import com.app.controller.FamilyController;
import com.app.prescription.dto.PrescriptionDTO;
import com.app.util.UserAccess;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * 표시 시각의 24시간제·한국 시각 계약을 점검한다.
 * --oracle-readonly는 실제 응답 SQL의 날짜 표현식을 가상 DATE 값에만 적용한다.
 * 개인 자료 조회, INSERT, UPDATE, ALTER SESSION은 실행하지 않는다.
 */
public class DisplayTimeCheck {
    private static int checks;
    private static final Pattern TO_CHAR=Pattern.compile("TO_CHAR\\s*\\(",Pattern.CASE_INSENSITIVE);
    private static final Pattern DATE_COLUMN=Pattern.compile("(?:\\b[a-z][a-z0-9_]*\\.)?\\b(?:created_at|updated_at|moderated_at)\\b",Pattern.CASE_INSENSITIVE);
    private static final List<Fixture> FIXTURES=Arrays.asList(
        new Fixture("2026-10-06 15:00:00","2026-10-07 00:00:00"),
        new Fixture("2026-10-07 03:00:00","2026-10-07 12:00:00"),
        new Fixture("2026-10-07 04:00:00","2026-10-07 13:00:00"),
        new Fixture("2026-10-07 14:59:58","2026-10-07 23:59:58"),
        new Fixture("2026-10-07 15:00:00","2026-10-08 00:00:00"),
        new Fixture(null,null)
    );
    private record Fixture(String utc,String seoul) {}
    private record DisplayExpression(String source,String sql) {}

    private static void check(boolean passed,String description) {
        if(!passed)throw new AssertionError(description);
        checks++;
    }

    public static void main(String[] args) throws Exception {
        Path backend=Path.of(args[0]);
        Configuration config=new Configuration();
        for(String mapper:List.of("community/community_mapper.xml","community/notification_mapper.xml","chatbot/chat_history_mapper.xml")) {
            Path path=backend.resolve("src/main/webapp/WEB-INF/mybatis/mapper").resolve(mapper);
            try(var input=Files.newInputStream(path)) {
                new XMLMapperBuilder(input,config,path.toString(),config.getSqlFragments()).parse();
            }
        }
        var expressions=new ArrayList<DisplayExpression>();
        Map<String,Object> params=Map.of("sort","LATEST","offset",0,"limit",5,"viewerId",-1L,"postId",-1L,"isAdmin",0,"userId",-1L,"conversationId",-1L);
        Map<String,Integer> statements=Map.ofEntries(
            Map.entry("com.app.community.CommunityMapper.posts",1),
            Map.entry("com.app.community.CommunityMapper.myPosts",1),
            Map.entry("com.app.community.CommunityMapper.post",2),
            Map.entry("com.app.community.CommunityMapper.comments",1),
            Map.entry("com.app.community.CommunityMapper.reports",1),
            Map.entry("com.app.community.CommunityMapper.pendingInfoReports",2),
            Map.entry("com.app.community.CommunityMapper.moderatedContent",2),
            Map.entry("com.app.community.NotificationMapper.findByUser",1),
            Map.entry("com.app.chatbot.dao.ChatHistoryDao.findConversations",2),
            Map.entry("com.app.chatbot.dao.ChatHistoryDao.findConversation",2),
            Map.entry("com.app.chatbot.dao.ChatHistoryDao.findMessages",1)
        );
        for(var entry:statements.entrySet()) {
            List<DisplayExpression> found=expressions(entry.getKey(),config.getMappedStatement(entry.getKey()).getBoundSql(params).getSql());
            check(found.size()==entry.getValue(),entry.getKey()+" covers every displayed timestamp");
            expressions.addAll(found);
        }
        expressions.addAll(expressions("family invitations",invitationSql()));
        check(expressions.size()==17,"all community, notification, chat and invitation timestamps covered");
        for(var expression:expressions) {
            check(expression.sql().contains("HH24:MI")&&!expression.sql().contains("HH12"),expression.source()+" returns 24-hour time");
            check(expression.sql().contains("'UTC'")&&expression.sql().contains("AT TIME ZONE 'Asia/Seoul'")
                &&!expression.sql().contains("9/24"),expression.source()+" converts UTC storage to Seoul exactly once");
        }
        jacksonChecks();
        boolean oracle=Arrays.asList(args).contains("--oracle-readonly");
        if(oracle) {
            try { oracleChecks(backend,expressions); }
            catch(SQLException error) {
                throw new AssertionError("Read-only display time fixture failed: code="+error.getErrorCode()+", SQLState="+error.getSQLState());
            }
        }
        System.out.println("PASS: "+checks+" display time checks ("+(oracle?"including read-only Oracle boundaries":"offline")+")");
    }

    private static List<DisplayExpression> expressions(String source,String sql) {
        var found=new ArrayList<DisplayExpression>();
        var matcher=TO_CHAR.matcher(sql);
        while(matcher.find()) {
            int depth=1,end=matcher.end();
            boolean quoted=false;
            for(;end<sql.length()&&depth>0;end++) {
                char current=sql.charAt(end);
                if(current=='\'') {
                    if(quoted&&end+1<sql.length()&&sql.charAt(end+1)=='\'') { end++;continue; }
                    quoted=!quoted;
                } else if(!quoted) {
                    if(current=='(')depth++;
                    else if(current==')')depth--;
                }
            }
            check(depth==0,"complete TO_CHAR expression in "+source);
            String expression=sql.substring(matcher.start(),end);
            if(expression.toUpperCase(java.util.Locale.ROOT).contains("HH"))found.add(new DisplayExpression(source,expression));
        }
        return found;
    }

    /** 컨트롤러가 JDBC에 전달하는 실제 초대 SQL을 빈 결과로 수집한다. */
    private static String invitationSql() throws Exception {
        final String[] captured={null};
        ResultSet rows=proxy(ResultSet.class,(p,m,a)->switch(m.getName()) {
            case "next" -> false;
            case "close" -> null;
            default -> throw new AssertionError("unexpected invitation result operation");
        });
        PreparedStatement statement=proxy(PreparedStatement.class,(p,m,a)->switch(m.getName()) {
            case "executeQuery" -> rows;
            case "setLong" -> { check(a[0].equals(1)&&a[1].equals(11L),"invitation query retains its recipient binding");yield null; }
            case "close" -> null;
            default -> throw new AssertionError("unexpected invitation statement operation");
        });
        Connection connection=proxy(Connection.class,(p,m,a)->switch(m.getName()) {
            case "prepareStatement" -> { captured[0]=(String)a[0];yield statement; }
            case "close" -> null;
            default -> throw new AssertionError("unexpected invitation connection operation");
        });
        DataSource dataSource=proxy(DataSource.class,(p,m,a)->{
            if(m.getName().equals("getConnection"))return connection;
            throw new AssertionError("unexpected invitation datasource operation");
        });
        var controller=new FamilyController();
        for(var entry:Map.of("dataSource",dataSource,"userAccess",new UserAccess(null) {
            @Override public long selfUser(HttpServletRequest request,Long requested,String username) { return 11L; }
        }).entrySet()) {
            var field=FamilyController.class.getDeclaredField(entry.getKey());field.setAccessible(true);field.set(controller,entry.getValue());
        }
        check(controller.getMyInvitations(null,null).getStatusCodeValue()==200,"invitation timestamp query succeeds");
        check(captured[0]!=null&&captured[0].contains("i.RECEIVER_ID = ?"),"invitation query remains scoped to the recipient");
        return captured[0];
    }

    @SuppressWarnings("unchecked")
    private static <T> T proxy(Class<T> type,java.lang.reflect.InvocationHandler handler) {
        return (T)Proxy.newProxyInstance(type.getClassLoader(),new Class<?>[]{type},handler);
    }

    /** 이미 한국 시각으로 저장·매핑하는 처방전 응답에는 추가 보정하지 않는다. */
    private static void jacksonChecks() throws Exception {
        var mapper=new ObjectMapper();
        for(var fixture:FIXTURES) {
            if(fixture.seoul()==null)continue;
            var local=LocalDateTime.parse(fixture.seoul().replace(' ','T'));
            var prescription=new PrescriptionDTO();
            prescription.setCreatedAt(Date.from(local.atZone(ZoneId.of("Asia/Seoul")).toInstant()));
            String actual=mapper.readTree(mapper.writeValueAsString(prescription)).path("createdAt").asText();
            check(actual.equals(fixture.seoul()),"prescription Jackson timestamp preserves "+fixture.seoul());
        }
    }

    private static void oracleChecks(Path backend,List<DisplayExpression> expressions) throws Exception {
        var properties=new Properties();
        try(var reader=Files.newBufferedReader(backend.resolve("src/main/resources/config/db.properties"))) { properties.load(reader); }
        var dataSource=new UnpooledDataSource(properties.getProperty("jdbc.driver"),properties.getProperty("jdbc.url"),properties.getProperty("jdbc.username"),properties.getProperty("jdbc.password"));
        var fixtureSql=new StringBuilder();
        for(int i=0;i<FIXTURES.size();i++) {
            if(i>0)fixtureSql.append(" UNION ALL ");
            fixtureSql.append("SELECT ").append(i).append(" fixture_id,TO_DATE(?,'YYYY-MM-DD HH24:MI:SS') stored_at FROM dual");
        }
        try(Connection connection=dataSource.getConnection()) {
            for(var expression:expressions) {
                String formatted=DATE_COLUMN.matcher(expression.sql()).replaceAll("fixture.stored_at");
                check(!formatted.equals(expression.sql()),expression.source()+" tests the actual stored date expression");
                String sql="SELECT "+formatted+" actual FROM ("+fixtureSql+") fixture ORDER BY fixture_id";
                try(var statement=connection.prepareStatement(sql)) {
                    statement.setQueryTimeout(10);
                    for(int i=0;i<FIXTURES.size();i++) {
                        String utc=FIXTURES.get(i).utc();
                        if(utc==null)statement.setNull(i+1,Types.VARCHAR);
                        else statement.setString(i+1,utc);
                    }
                    try(var rows=statement.executeQuery()) {
                        for(var fixture:FIXTURES) {
                            check(rows.next(),expression.source()+" returns its virtual boundary row");
                            String expected=fixture.seoul();
                            if(expected!=null&&!expression.sql().contains("MI:SS"))expected=expected.substring(0,16);
                            check(Objects.equals(rows.getString(1),expected),expression.source()+" preserves Seoul "+expected);
                        }
                        check(!rows.next(),expression.source()+" returns only virtual boundary rows");
                    }
                }
            }
        }
    }
}
