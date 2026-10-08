package com.app.security;

import java.lang.reflect.*;
import java.util.*;
import javax.servlet.http.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.server.ResponseStatusException;
import com.app.controller.*;
import com.app.dao.ScheduleDAO;
import com.app.domain.User;
import com.app.dto.*;
import com.app.mapper.UserMapper;
import com.app.prescription.controller.PrescriptionController;
import com.app.prescription.dao.PrescriptionDAO;
import com.app.prescription.dto.PrescriptionDTO;
import com.app.prescription.service.PrescriptionService;
import com.app.service.ScheduleService;
import com.app.service.ScheduleServiceImpl;
import com.app.util.UserAccess;

/** Offline ownership regression checks. Every repository/service is a local fixture. */
public class UserAccessCheck {
    static int checks, writes, sessionCreations, batchCalls;
    static final Map<Long,User> users = new HashMap<>();
    static final Map<Long,PrescriptionDTO> prescriptions = new HashMap<>();
    static long lastOwner;
    static boolean writeResult = true;
    static boolean batchThrows;

    static void check(boolean value, String label) {
        if (!value) throw new AssertionError(label);
        checks++;
    }
    static void status(int status, Runnable work, String label) {
        try { work.run(); throw new AssertionError(label + ": access unexpectedly allowed"); }
        catch (ResponseStatusException expected) {
            check(expected.getStatus().value() == status, label);
        }
    }
    static void field(Object target, String name, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(name);
        field.setAccessible(true);
        field.set(target, value);
    }
    @SuppressWarnings("unchecked")
    static <T> T proxy(Class<T> type, InvocationHandler handler) {
        return (T)Proxy.newProxyInstance(type.getClassLoader(),new Class<?>[]{type},handler);
    }
    static HttpServletRequest request(Object id, boolean authenticated) {
        Map<String,Object> attributes = new HashMap<>();
        if (id != null) attributes.put("userId", id);
        attributes.put("authenticated", authenticated);
        HttpSession session = proxy(HttpSession.class,(p,m,a)-> {
            if (m.getName().equals("getAttribute")) return attributes.get(a[0]);
            if (m.getName().equals("setAttribute")) { attributes.put((String)a[0],a[1]); return null; }
            if (m.getName().equals("removeAttribute")) { attributes.remove(a[0]); return null; }
            throw new AssertionError("Unexpected session operation: " + m.getName());
        });
        return proxy(HttpServletRequest.class,(p,m,a)-> {
            if (m.getName().equals("getSession")) {
                if (a == null || a.length == 0 || Boolean.TRUE.equals(a[0])) sessionCreations++;
                return session;
            }
            throw new AssertionError("Unexpected request operation: " + m.getName());
        });
    }
    static User user(long id, Long family) {
        User user = new User();
        user.setUserId(id); user.setLoginId("fixture"+id); user.setFamilyId(family);
        user.setNickname("fixture");user.setRole("PROT");users.put(id,user);return user;
    }
    static PrescriptionDTO prescription(long id, long owner) {
        PrescriptionDTO value = new PrescriptionDTO();
        value.setPrescriptionId(id); value.setUserId(owner); prescriptions.put(id,value); return value;
    }
    static ScheduleDTO schedule(long id, long owner) {
        ScheduleDTO value = new ScheduleDTO(); value.setScheduleId(id); value.setUserId(owner); return value;
    }

    public static void main(String[] args) throws Exception {
        user(1,10L); user(2,10L); user(3,20L); user(4,null); user(5,0L); user(6,0L);
        users.get(1L).setRole("GUAR");
        UserMapper mapper = proxy(UserMapper.class,(p,m,a)->switch(m.getName()) {
            case "findById" -> users.get((Long)a[0]);
            case "findByLoginId" -> users.values().stream().filter(u->u.getLoginId().equals(a[0])).findFirst().orElse(null);
            default -> throw new AssertionError("Unexpected database operation: " + m.getName());
        });
        UserAccess access = new UserAccess(mapper);
        HttpServletRequest actor = request(1L,true);
        HttpServletRequest anonymous = request(null,false);
        status(401,()->access.currentUser(anonymous),"anonymous identity rejected");
        status(401,()->access.currentUser(request(1L,false)),"profile-injected unauthenticated identity rejected");
        status(401,()->access.currentUser(request("1",true)),"string session identity rejected");
        status(401,()->access.currentUser(request(0L,true)),"nonpositive session identity rejected");
        check(access.currentUser(request(1,true))==1,"numeric session types supported");
        check(access.selfUser(actor,null,null)==1,"self identity defaults to session");
        check(access.familyUser(actor,2L)==2,"same-family delegation supported");
        status(403,()->access.familyUser(actor,3L),"different family denied");
        status(403,()->access.familyUser(actor,4L),"unlinked target denied");
        status(403,()->access.familyUser(actor,999L),"unknown target denied");
        status(403,()->access.familyUser(actor,9007199254740991L),"extreme foreign target denied");
        status(403,()->access.familyUser(request(5L,true),6L),"zero family ID cannot grant access");
        status(403,()->access.selfUser(actor,2L,null),"family cannot modify another account");
        status(403,()->access.selfUser(actor,null,"fixture3"),"forged username denied");
        status(403,()->access.familyUser(actor,2L,"fixture3"),"contradictory ID and username denied");
        status(400,()->UserAccess.requestedId("invalid"),"malformed identity returns 400");
        status(400,()->access.familyUser(actor,-1L),"nonpositive target returns 400");

        check(access.familyManager(actor,null,false)==1,"database guardian can manage an existing family");
        HttpServletRequest protectedMember=request(2L,true);
        status(403,()->access.familyManager(protectedMember,null,false),"same-family protected member cannot manage the family");
        status(403,()->access.familyManager(protectedMember,null,true),"existing-family protected member cannot use the new-family exception");
        protectedMember.getSession(false).setAttribute("role","GUAR");
        status(403,()->access.familyManager(protectedMember,null,false),"forged guardian session role never overrides the database");
        users.get(1L).setRole("PROT");
        status(403,()->access.familyManager(actor,null,false),"revoked guardian role takes effect without a new login");
        users.get(1L).setRole("GUAR");
        check(access.familyManager(request(4L,true),null,true)==4,"unaffiliated account can create its first family");
        check(access.familyManager(request(5L,true),null,true)==5,"legacy zero family ID allows first family creation");
        status(403,()->access.familyManager(request(4L,true),null,false),"unaffiliated account cannot rename or remove existing members");
        status(403,()->access.familyManager(request(999L,true),null,true),"removed database account cannot create or manage a family");
        check(access.familyUser(protectedMember,1L)==1,"protected member retains shared family access");

        UserController account = new UserController(); field(account,"userAccess",access); field(account,"userMapper",mapper);
        status(401,()->account.getProfile("fixture1",anonymous),"anonymous profile cannot establish session");
        status(403,()->account.getProfile("fixture2",actor),"profile lookup limited to account owner");
        check(account.getProfile("fixture1",actor).getStatusCodeValue()==200,"authenticated own profile retained");
        check(sessionCreations==0,"profile never creates or overwrites identity session");
        status(403,()->account.updateProfile("fixture2","fixture",null,actor),"profile mutation cannot target another user");
        status(401,()->account.getEverydayMeds(3L,null,anonymous),"anonymous medication list denied before database");
        status(403,()->account.deleteEverydayMed("routine",1L,3L,null,actor),"foreign medication deletion denied before service");
        status(403,()->account.changePassword(Map.of("userId","2"),actor),"family password mutation denied");
        status(403,()->account.getPushSettings(2L,null,actor),"family account settings denied");
        status(403,()->account.withdraw(Map.of("userId",2L),null,null,actor),"family account withdrawal denied");

        FamilyController family = new FamilyController(); field(family,"userAccess",access);
        status(401,()->family.getFamilyMembers(1L,anonymous),"anonymous family roster denied");
        status(403,()->family.removeFamilyMember(3L,Map.of(),null,actor),"foreign-family removal denied before connection");
        status(403,()->family.removeFamilyMember(2L,Map.of("userId",2L),null,actor),"forged family removal actor denied");
        check(family.removeFamilyMember(1L,Map.of(),null,actor).getStatusCodeValue()==400,"self-removal remains invalid");
        status(403,()->family.createFamily(Map.of("userId",3L),actor),"family creation actor cannot be forged");
        status(403,()->family.renameFamily(Map.of("userId",3L,"familyName","fixture"),actor),"family rename actor cannot be forged");
        status(403,()->family.addFamilyMember(Map.of("guardianId",3L),actor),"guardian cannot be forged");
        status(403,()->family.sendInvitation(Map.of("senderId",3L),actor),"invitation sender cannot be forged");
        status(403,()->family.removeFamilyMember(1L,Map.of(),null,protectedMember),"protected member cannot remove another same-family account");
        status(403,()->family.createFamily(Map.of(),protectedMember),"protected member cannot claim guardian role through existing-family create");
        status(403,()->family.renameFamily(Map.of("familyName","fixture"),protectedMember),"protected member cannot rename the family");
        status(403,()->family.addFamilyMember(Map.of("name","fixture","role","GUAR"),protectedMember),"protected member cannot register a guardian or another member");
        status(403,()->family.sendInvitation(Map.of("targetLoginId","fixture3","role","GUAR"),protectedMember),"protected member cannot invite or grant another guardian role");
        status(403,()->family.getMyInvitations(2L,actor),"invitation inbox limited to recipient");
        status(403,()->family.respondInvitation(Map.of("userId",2L,"inviteId",1L,"action","ACCEPT"),actor),"invitation recipient cannot be forged");
        check(family.respondInvitation(Map.of("inviteId",1L,"action","INVALID"),actor).getStatusCodeValue()==400,"invalid invite action cannot reject invitation");

        prescription(1,1); prescription(2,2); prescription(3,3);
        PrescriptionService prescriptionService = proxy(PrescriptionService.class,(p,m,a)->switch(m.getName()) {
            case "getPrescriptionDetail" -> prescriptions.get((Long)a[0]);
            case "getPrescriptionList" -> { lastOwner=(Long)a[0]; yield List.of(); }
            case "updatePrescription" -> { writes++; yield a[0]; }
            default -> throw new AssertionError("Unexpected prescription operation: " + m.getName());
        });
        PrescriptionController rx = new PrescriptionController(prescriptionService); field(rx,"userAccess",access);
        status(401,()->rx.getPrescriptionDetail(1L,anonymous),"anonymous prescription detail denied");
        status(403,()->rx.getPrescriptionDetail(3L,actor),"foreign prescription detail denied");
        check(rx.getPrescriptionDetail(2L,actor).getStatusCodeValue()==200,"same-family prescription detail supported");
        check(rx.getPrescriptionDetail(1L,protectedMember).getStatusCodeValue()==200,"protected member retains shared family prescription viewing");
        status(403,()->rx.getPrescriptionList(3L,actor),"foreign prescription list denied");
        check(rx.getPrescriptionList(2L,actor).getStatusCodeValue()==200&&lastOwner==2,"same-family prescription list supported");
        PrescriptionDTO edit = new PrescriptionDTO(); edit.setUserId(3L);
        status(403,()->rx.updatePrescription(3L,edit,actor),"foreign prescription update denied");
        int before = writes;
        check(rx.updatePrescription(2L,edit,actor).getStatusCodeValue()==200&&edit.getUserId()==2&&writes==before+1,"update preserves stored prescription owner");
        status(401,()->rx.deletePrescription(1L,1L,anonymous),"anonymous prescription delete denied");
        status(403,()->rx.uploadPrescription(null,3L,actor),"foreign prescription upload denied before OCR");

        Map<Long,ScheduleDTO> schedules = Map.of(1L,schedule(1,1),2L,schedule(2,2),3L,schedule(3,3));
        ScheduleDAO scheduleDao = new ScheduleDAO() {
            @Override public ScheduleDTO selectScheduleById(Long id) { return schedules.get(id); }
        };
        PrescriptionDAO rxDao = proxy(PrescriptionDAO.class,(p,m,a)-> {
            if (m.getName().equals("getPrescriptionById")) return prescriptions.get((Long)a[0]);
            throw new AssertionError("Unexpected prescription DAO operation: "+m.getName());
        });
        ScheduleService scheduleService = proxy(ScheduleService.class,(p,m,a)->switch(m.getName()) {
            case "getDailySchedules" -> { lastOwner=(Long)a[0]; yield List.of(); }
            case "toggleTaken", "updateAlarmTime", "removeSchedule", "addSchedule" -> { writes++; yield writeResult; }
            case "toggleTakenBatch" -> {
                batchCalls++;
                if(batchThrows)throw new IllegalStateException("fixture batch failure");
                writes+=((List<?>)a[0]).size();yield writeResult;
            }
            default -> throw new AssertionError("Unexpected schedule operation: "+m.getName());
        });
        CalendarController calendar = new CalendarController();
        field(calendar,"userAccess",access); field(calendar,"scheduleDAO",scheduleDao);
        field(calendar,"prescriptionDAO",rxDao); field(calendar,"scheduleService",scheduleService);
        status(401,()->calendar.getDailySchedules(1L,"2026-10-07",false,anonymous),"anonymous calendar identity cannot be forged");
        status(403,()->calendar.getDailySchedules(3L,"2026-10-07",false,actor),"foreign calendar denied");
        check(calendar.getDailySchedules(2L,"2026-10-07",false,actor).getStatusCodeValue()==200&&lastOwner==2,"family calendar preserved");
        status(403,()->calendar.toggleTaken(3L,Map.of("taken",true),actor),"foreign schedule toggle denied");
        check(calendar.toggleTaken(2L,Map.of("taken",true),actor).getStatusCodeValue()==200,"family schedule toggle supported");
        check(calendar.getDailySchedules(1L,"2026-10-07",false,protectedMember).getStatusCodeValue()==200,"protected member retains family calendar viewing");
        check(calendar.toggleTaken(1L,Map.of("taken",true),protectedMember).getStatusCodeValue()==200,"protected member retains shared family intake checks");
        status(403,()->calendar.updateAlarm(3L,"08:00",true,"2026-10-07",actor),"foreign schedule alarm denied");
        status(403,()->calendar.deleteSchedulePost(3L,true,1L,"2026-10-07",actor),"foreign schedule delete denied despite forged owner");
        status(403,()->calendar.toggleTaken(300011L,Map.of("taken",true),actor),"virtual prescription schedule owner checked");
        check(calendar.toggleTaken(200011L,Map.of("taken",true),actor).getStatusCodeValue()==200,"family virtual schedule supported");
        status(404,()->calendar.toggleTaken(99L,Map.of("taken",true),actor),"missing schedule returns 404");
        before = writes;
        status(403,()->calendar.toggleTakenBatch(Map.of("scheduleIds",List.of(1L,3L),"taken",true),actor),"batch rejects foreign owner");
        check(writes==before,"batch validates all owners before any mutation");
        int callsBefore=batchCalls;
        check(calendar.toggleTakenBatch(Map.of("scheduleIds",List.of(1L,2L),"taken",true),actor).getStatusCodeValue()==200&&writes==before+2,"authorized batch preserves writes");
        check(batchCalls==callsBefore+1,"authorized batch uses one service transaction boundary");
        writeResult=false;
        check(calendar.toggleTakenBatch(Map.of("scheduleIds",List.of(1L),"taken",true),actor).getStatusCodeValue()==500,"batch no longer hides service failure as success");
        batchThrows=true;
        try {calendar.toggleTakenBatch(Map.of("scheduleIds",List.of(1L),"taken",true),actor);throw new AssertionError("Batch exception hidden as HTTP success");}
        catch(IllegalStateException expected){checks++;}
        batchThrows=false;
        check(calendar.toggleTakenBatch(Map.of("scheduleIds",List.of()),actor).getStatusCodeValue()==400,"empty batch rejected");
        ScheduleAddDTO add = new ScheduleAddDTO(); add.setUserId(3L);
        status(403,()->calendar.addSchedule(add,actor),"foreign schedule registration denied");
        before = writes;
        status(400,()->calendar.getDailySchedules(1L,"2026-99-99",false,actor),"invalid daily date rejected");
        status(400,()->calendar.getMonthlySummary(1L,"2026-99",false,actor),"invalid summary month rejected");
        status(400,()->calendar.toggleTaken(1L,Map.of("taken",true,"date","2026-99-99"),actor),"invalid toggle date cannot change today");
        status(400,()->calendar.toggleTakenBatch(Map.of("scheduleIds",List.of(1L),"taken",true,"date","2026-02-30"),actor),"invalid batch date cannot change today");
        status(400,()->calendar.updateAlarm(1L,"08:00",true,"invalid-date",actor),"invalid alarm date rejected");
        status(400,()->calendar.deleteSchedulePost(1L,false,1L,"2026-99-99",actor),"invalid delete date rejected");
        add.setUserId(1L);add.setType("regular");add.setScheduledDate("2026-99-99");
        status(400,()->calendar.addSchedule(add,actor),"invalid registration date cannot become today");
        check(writes==before,"invalid dates produce no service mutations");
        check(calendar.getDailySchedules(1L,null,false,actor).getStatusCodeValue()==200,"missing date retains today default");
        add.setScheduledDate(null);
        add.setUserId(1L);add.setType("prescription");add.setPrescriptionId(3L);
        status(403,()->calendar.addSchedule(add,actor),"foreign prescription reference cannot bypass schedule owner validation");
        add.setPrescriptionId(2L);
        check(calendar.addSchedule(add,actor).getStatusCodeValue()==400,"prescription and schedule owners must agree");

        ScheduleServiceImpl registrationService = new ScheduleServiceImpl();
        field(registrationService,"scheduleDAO",new ScheduleDAO() {
            @Override public String findMedicationIdByCabinetId(Long owner, Long id) { return id==1L&&owner==1L?"fixture-med":null; }
            @Override public boolean checkMedicationExists(String id) { throw new AssertionError("Cabinet owner must be checked before catalog or writes"); }
        });
        add.setUserId(1L);add.setType("regular");add.setMedicationId("fixture-med");add.setCabinetId(3L);
        try { registrationService.addSchedule(add);throw new AssertionError("Foreign cabinet reference accepted"); }
        catch(IllegalArgumentException expected) { checks++; }
        add.setCabinetId(1L);add.setMedicationId("different-med");
        try { registrationService.addSchedule(add);throw new AssertionError("Contradictory cabinet medication accepted"); }
        catch(IllegalArgumentException expected) { checks++; }

        AuthController auth = new AuthController();
        field(auth,"userMapper",proxy(UserMapper.class,(p,m,a)-> {
            if(m.getName().equals("findByLoginId"))return null;
            throw new AssertionError("Missing demo must never fall back to another user");
        }));
        check(auth.demoLogin(anonymous).getStatusCodeValue()==404,"missing demo cannot log in as user 1");
        User adminDemo = new User();adminDemo.setUserId(99L);adminDemo.setLoginId("test12");adminDemo.setIsAdmin(1);
        field(auth,"userMapper",proxy(UserMapper.class,(p,m,a)-> {
            if(m.getName().equals("findByLoginId"))return adminDemo;
            throw new AssertionError("Unexpected demo database operation");
        }));
        check(auth.demoLogin(anonymous).getStatusCodeValue()==403,"administrator account cannot be used as public demo");

        User resetUser = users.get(1L);resetUser.setEmail("fixture@example.invalid");
        field(auth,"userMapper",proxy(UserMapper.class,(p,m,a)->switch(m.getName()) {
            case "findByLoginId" -> "fixture1".equals(a[0])?resetUser:null;
            case "updatePasswordHash" -> { writes++; yield 1; }
            default -> throw new AssertionError("Unexpected password reset database operation: "+m.getName());
        }));
        field(auth,"emailVerificationService",new com.app.service.EmailVerificationService() {
            @Override public boolean verifyCode(String email, String code) { return "fixture-code".equals(code); }
            @Override public void clearVerification(String email) { }
        });
        PasswordResetRequest reset = new PasswordResetRequest();reset.setUsername("fixture1");reset.setEmail(resetUser.getEmail());
        reset.setCode("fixture-code");reset.setNewPassword("fixture-password");
        HttpServletRequest browserA = request(null,false), browserB = request(null,false);
        check(auth.resetPassword(reset,browserA).getStatusCodeValue()==403,"password reset requires verification in current session");
        check(auth.verifyPasswordResetCode(reset,browserA).getStatusCodeValue()==200,"valid code binds verification to originating browser");
        before = writes;
        check(auth.resetPassword(reset,browserB).getStatusCodeValue()==403&&writes==before,"another browser cannot reuse account-level verification");
        check(auth.resetPassword(reset,browserA).getStatusCodeValue()==200&&writes==before+1,"verified browser can reset its account");
        check(auth.resetPassword(reset,browserA).getStatusCodeValue()==403&&writes==before+1,"password reset verification is consumed once");
        var memberParameter = FamilyController.class.getMethod("getFamilyMembers",Long.class,HttpServletRequest.class).getParameters()[0];
        check(!memberParameter.getAnnotation(org.springframework.web.bind.annotation.RequestParam.class).required(),"family members defaults to session when userId omitted");
        System.out.println("PASS: "+checks+" offline session, family delegation and ownership checks");
    }
}
