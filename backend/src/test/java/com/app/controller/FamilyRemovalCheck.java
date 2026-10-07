package com.app.controller;

import java.lang.reflect.Field;
import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpSession;
import org.apache.ibatis.session.SqlSession;
import org.apache.ibatis.session.SqlSessionFactory;
import org.springframework.http.ResponseEntity;
import com.app.domain.User;
import com.app.mapper.UserMapper;
import com.app.util.UserAccess;

/** 실제 JDBC 대신 메모리 연결로 가족 삭제의 실패·롤백 경계를 점검 */
public class FamilyRemovalCheck {
    private static int checks;
    private static final List<String> DELETES=List.of("FAMILY_MEMBERS","FAMILY_INVITATIONS",
            "USER_MEAL_TIMES",
            "PRESCRIPTION_ITEMS","SCHEDULES","PRESCRIPTIONS","CABINET_MEDICATIONS",
            "ROUTINE_MEDICATIONS","MEDICATION_USE_STATES","MEDICATION_OVERALL_GUIDE","USERS");

    private static void check(boolean passed,String description) {
        if(!passed)throw new AssertionError(description);
        checks++;
    }
    @SuppressWarnings("unchecked")
    private static <T> T proxy(Class<T> type,java.lang.reflect.InvocationHandler handler) {
        return (T)Proxy.newProxyInstance(type.getClassLoader(),new Class<?>[]{type},handler);
    }
    private static User user(long id,String role) {
        User user=new User();user.setUserId(id);user.setFamilyId(5L);user.setRole(role);return user;
    }
    private static void field(Object target,String name,Object value) throws Exception {
        Field field=FamilyController.class.getDeclaredField(name);field.setAccessible(true);field.set(target,value);
    }
    private static HttpServletRequest request() {
        HttpSession session=proxy(HttpSession.class,(p,m,a)->{
            if(m.getName().equals("getAttribute"))return a[0].equals("userId")?11L:a[0].equals("authenticated")?true:null;
            throw new AssertionError("unexpected session operation");
        });
        return proxy(HttpServletRequest.class,(p,m,a)->{
            if(m.getName().equals("getSession"))return session;
            throw new AssertionError("unexpected request operation");
        });
    }

    private static class Fixture {
        final Map<String,Boolean> initial=new LinkedHashMap<>();
        Map<String,Boolean> committed,pending;
        final List<String> updates=new ArrayList<>(),events=new ArrayList<>();
        String isVirtual="Y",failOperation;
        boolean queryFails,missingUser,zeroFinal,commitFails,rollbackFails;
        int commits,rollbacks,connections,sessions,statements,closedStatements;

        Fixture() {
            DELETES.forEach(table->initial.put(table,true));initial.put("FAMILY_LINK",true);
            committed=new LinkedHashMap<>(initial);pending=new LinkedHashMap<>(initial);
        }
        Connection connection() {
            return proxy(Connection.class,(p,m,a)->switch(m.getName()) {
                case "setAutoCommit" -> { if(!Boolean.FALSE.equals(a[0]))throw new AssertionError("manual transaction required");events.add("begin");yield null; }
                case "prepareStatement" -> { statements++;yield statement((String)a[0]); }
                case "commit" -> {
                    events.add("commit");
                    if(commitFails)throw new SQLException("fixture commit failure");
                    commits++;committed=new LinkedHashMap<>(pending);yield null;
                }
                case "rollback" -> {
                    events.add("rollback");rollbacks++;
                    if(rollbackFails)throw new SQLException("fixture rollback failure");
                    pending=new LinkedHashMap<>(committed);yield null;
                }
                case "close" -> { events.add("connection-close");yield null; }
                default -> throw new AssertionError("unexpected connection operation: "+m.getName());
            });
        }
        PreparedStatement statement(String sql) {
            Map<Integer,Long> bindings=new LinkedHashMap<>();
            return proxy(PreparedStatement.class,(p,m,a)->switch(m.getName()) {
                case "setLong" -> { bindings.put((Integer)a[0],(Long)a[1]);yield null; }
                case "executeQuery" -> {
                    if(!sql.equals("SELECT IS_VIRTUAL FROM USERS WHERE USER_ID = ?"))throw new AssertionError("unexpected query");
                    if(!bindings.equals(Map.of(1,22L)))throw new AssertionError("query must target the validated family member");
                    events.add("query");
                    if(queryFails)throw new SQLException("fixture query failure");
                    final boolean[] first={true};
                    yield proxy(ResultSet.class,(rp,rm,ra)->switch(rm.getName()) {
                        case "next" -> { boolean row=first[0]&&!missingUser;first[0]=false;yield row; }
                        case "getString" -> isVirtual;
                        case "close" -> null;
                        default -> throw new AssertionError("unexpected result operation: "+rm.getName());
                    });
                }
                case "executeUpdate" -> {
                    String operation=sql.startsWith("UPDATE USERS ")?"UNLINK":sql.split(" ")[2];
                    if(!DELETES.contains(operation)&&!operation.equals("UNLINK"))throw new AssertionError("deletion scope expanded: "+operation);
                    Map<Integer,Long> expected=operation.equals("FAMILY_INVITATIONS")?Map.of(1,22L,2,22L):Map.of(1,22L);
                    if(!bindings.equals(expected))throw new AssertionError("mutation must use the validated member ID");
                    updates.add(operation);events.add("update:"+operation);
                    if(operation.equals(failOperation))throw new SQLException("fixture SQL failure", "23000",2292);
                    if(zeroFinal&&(operation.equals("USERS")||operation.equals("UNLINK")))yield 0;
                    if(operation.equals("UNLINK"))pending.put("FAMILY_LINK",false);
                    else { pending.put(operation,false);if(operation.equals("USERS"))pending.put("FAMILY_LINK",false); }
                    yield 1;
                }
                case "close" -> { closedStatements++;yield null; }
                default -> throw new AssertionError("unexpected statement operation: "+m.getName());
            });
        }
        FamilyController controller() throws Exception {
            Map<Long,User> users=Map.of(11L,user(11,"GUAR"),22L,user(22,"PROT"));
            UserMapper mapper=proxy(UserMapper.class,(p,m,a)->{
                if(m.getName().equals("findById"))return users.get((Long)a[0]);
                throw new AssertionError("unexpected identity lookup");
            });
            Connection connection=connection();
            SqlSession session=proxy(SqlSession.class,(p,m,a)->switch(m.getName()) {
                case "getConnection" -> { connections++;yield connection; }
                case "close" -> { events.add("session-close");connection.close();yield null; }
                default -> throw new AssertionError("unexpected SQL session operation");
            });
            SqlSessionFactory factory=proxy(SqlSessionFactory.class,(p,m,a)->{
                if(m.getName().equals("openSession")) { sessions++;return session; }
                throw new AssertionError("unexpected SQL factory operation");
            });
            FamilyController controller=new FamilyController();field(controller,"userAccess",new UserAccess(mapper));
            field(controller,"sqlSessionFactory",factory);return controller;
        }
        ResponseEntity<Map<String,Object>> remove() throws Exception { return controller().removeFamilyMember(22L,Map.of(),null,request()); }
        void rolledBack(ResponseEntity<Map<String,Object>> response,String label) {
            check(response.getStatusCodeValue()==500&&Boolean.FALSE.equals(response.getBody().get("success")),label+": failure is not reported as success");
            check(rollbacks==1&&commits==0,label+": one rollback and no commit");
            check(committed.equals(initial)&&pending.equals(initial),label+": earlier modifications are restored");
            check(events.indexOf("rollback")<events.indexOf("session-close"),label+": rollback precedes connection release");
            check(connections==1&&sessions==1&&closedStatements==statements,label+": one connection and all resources closed");
        }
    }

    public static void main(String[] args) throws Exception {
        Fixture virtual=new Fixture();var response=virtual.remove();
        check(response.getStatusCodeValue()==200&&Boolean.TRUE.equals(response.getBody().get("success")),"complete virtual profile deletion succeeds");
        check(virtual.commits==1&&virtual.rollbacks==0,"complete deletion commits once");
        check(virtual.updates.equals(DELETES),"virtual deletion keeps the existing data scope and order");
        check(virtual.committed.values().stream().noneMatch(Boolean.TRUE::equals),"all intended virtual profile removals become visible together");
        check(virtual.events.indexOf("commit")>virtual.events.indexOf("update:USERS"),"commit occurs only after the final user deletion");
        check(virtual.connections==1&&virtual.closedStatements==virtual.statements,"successful deletion uses one connection and closes statements");

        Fixture linked=new Fixture();linked.isVirtual="N";response=linked.remove();
        check(response.getStatusCodeValue()==200&&linked.commits==1,"ordinary linked member removal succeeds");
        check(linked.updates.equals(List.of("FAMILY_MEMBERS","FAMILY_INVITATIONS","UNLINK")),"ordinary member removal only clears existing links and invitations");
        check(linked.committed.get("USERS")&&linked.committed.get("PRESCRIPTIONS")&&linked.committed.get("SCHEDULES")&&!linked.committed.get("FAMILY_LINK"),"ordinary member account and medical information remain intact");

        for(String operation:DELETES) {
            Fixture failed=new Fixture();failed.failOperation=operation;response=failed.remove();
            failed.rolledBack(response,"failure at "+operation);
            check(failed.updates.get(failed.updates.size()-1).equals(operation),"no later SQL follows failed "+operation);
            check(!response.getBody().get("message").toString().contains("fixture"),"raw SQL failures are not returned to the browser");
        }
        Fixture query=new Fixture();query.queryFails=true;query.rolledBack(query.remove(),"virtual account lookup failure");
        Fixture missing=new Fixture();missing.missingUser=true;missing.rolledBack(missing.remove(),"concurrently removed member");
        Fixture zero=new Fixture();zero.zeroFinal=true;zero.rolledBack(zero.remove(),"zero-row user deletion");
        Fixture commit=new Fixture();commit.commitFails=true;commit.rolledBack(commit.remove(),"commit failure");
        Fixture unlink=new Fixture();unlink.isVirtual="N";unlink.failOperation="UNLINK";unlink.rolledBack(unlink.remove(),"ordinary member unlink failure");
        Fixture rollback=new Fixture();rollback.failOperation="SCHEDULES";rollback.rollbackFails=true;response=rollback.remove();
        check(response.getStatusCodeValue()==500&&Boolean.FALSE.equals(response.getBody().get("success"))&&rollback.rollbacks==1&&rollback.commits==0,"rollback failure still returns failure and never commits");
        System.out.println("PASS: "+checks+" family removal transaction checks (mock JDBC, no DB access)");
    }
}
