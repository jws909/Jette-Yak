package com.app.service;

import java.lang.reflect.Field;
import java.lang.reflect.Proxy;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.session.Configuration;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import com.app.dao.ScheduleDAO;
import com.app.dto.ScheduleDTO;
import com.app.mapper.UserMapper;
import com.app.prescription.dao.PrescriptionDAO;
import com.app.prescription.dto.PrescriptionDTO;
import com.app.prescription.dto.PrescriptionItemDTO;

/** 모의 DAO와 메모리 트랜잭션만 사용하며 DB에 연결하지 않음 */
public class ScheduleDeletionCheck {
    private static final String DATE="2026-10-07";
    private static int checks;

    private static void check(boolean passed,String description) {
        if(!passed)throw new AssertionError(description);
        checks++;
    }

    private static void field(Object target,String name,Object value) throws Exception {
        Field field=ScheduleServiceImpl.class.getDeclaredField(name);
        field.setAccessible(true);
        field.set(target,value);
    }

    @SuppressWarnings("unchecked")
    private static <T> T proxy(Class<T> type,java.lang.reflect.InvocationHandler handler) {
        return (T)Proxy.newProxyInstance(type.getClassLoader(),new Class<?>[]{type},handler);
    }

    private static PrescriptionItemDTO item(long itemId,String medication,int frequency) {
        PrescriptionItemDTO item=new PrescriptionItemDTO();
        item.setItemId(itemId);item.setPrescriptionId(5L);item.setMedicationId(medication);
        item.setItemName(medication);item.setDailyFrequency(frequency);item.setTotalDays(3);
        return item;
    }

    private static PrescriptionDTO prescription(long id,long owner,List<PrescriptionItemDTO> items) {
        PrescriptionDTO prescription=new PrescriptionDTO();
        prescription.setPrescriptionId(id);prescription.setUserId(owner);prescription.setTotalDays(3);
        prescription.setDispensedDate(Date.from(LocalDate.parse(DATE).atStartOfDay(ZoneId.systemDefault()).toInstant()));
        prescription.setItems(items);
        return prescription;
    }

    private static ScheduleDTO schedule(long id,long owner,Long prescription,String medication,String time) {
        ScheduleDTO schedule=new ScheduleDTO();
        schedule.setScheduleId(id);schedule.setUserId(owner);schedule.setPrescriptionId(prescription);
        schedule.setMedicationId(medication);schedule.setTime(time);schedule.setScheduledDate(DATE);
        schedule.setIsCancelled(false);schedule.setAlarmEnabled(true);
        return schedule;
    }

    private static class Fixture extends ScheduleDAO {
        final Map<Long,PrescriptionDTO> prescriptions=new LinkedHashMap<>();
        final Map<Long,ScheduleDTO> schedules=new LinkedHashMap<>();
        final Map<Long,List<Long>> inactive=new HashMap<>();
        final List<String> writes=new ArrayList<>();
        long nextId=80;
        Long failTaken;
        boolean pauseThrows;

        Fixture() {
            prescriptions.put(5L,prescription(5,11,List.of(item(17,"M17",2),item(18,"M18",1))));
            prescriptions.put(6L,prescription(6,33,List.of(item(19,"M19",1))));
        }
        @Override public List<ScheduleDTO> selectDailySchedules(Long userId,String date) {
            return schedules.values().stream().filter(s->userId.equals(s.getUserId())&&date.equals(s.getScheduledDate())).toList();
        }
        @Override public List<Long> selectInactivePrescriptionItemIds(Long userId) { return inactive.getOrDefault(userId,List.of()); }
        @Override public ScheduleDTO selectScheduleById(Long id) { return schedules.get(id); }
        @Override public int pausePrescriptionItems(Long userId,Long prescriptionId) {
            writes.add("pause");
            if(pauseThrows)throw new IllegalStateException("fixture state failure");
            PrescriptionDTO p=prescriptions.get(prescriptionId);
            if(p==null||!userId.equals(p.getUserId()))return 0;
            inactive.put(userId,p.getItems().stream().map(PrescriptionItemDTO::getItemId).toList());
            return p.getItems().size();
        }
        @Override public int deleteSchedulesByPrescriptionId(Long prescriptionId) {
            writes.add("delete-prescription-schedules");
            int before=schedules.size();
            schedules.values().removeIf(s->prescriptionId.equals(s.getPrescriptionId()));
            return before-schedules.size();
        }
        @Override public int cancelPrescriptionSchedule(Long id) {
            writes.add("cancel");
            ScheduleDTO schedule=schedules.get(id);
            if(schedule==null)return 0;
            schedule.setIsCancelled(true);schedule.setAlarmEnabled(false);schedule.setTakenAt(null);
            return 1;
        }
        @Override public int deleteSchedule(Long id) { writes.add("hard-delete");return schedules.remove(id)!=null?1:0; }
        @Override public int insertCancelledPrescriptionSchedule(Map<String,Object> params) {
            writes.add("insert-cancel");
            ScheduleDTO schedule=schedule(nextId++,(Long)params.get("userId"),(Long)params.get("prescriptionId"),(String)params.get("medicationId"),(String)params.get("scheduledTime"));
            schedule.setScheduledDate((String)params.get("scheduledDate"));schedule.setIsCancelled(true);
            schedules.put(schedule.getScheduleId(),schedule);
            return 1;
        }
        @Override public int updateTakenStatus(Long id,boolean taken) {
            writes.add("taken:"+id);
            if(id.equals(failTaken))return 0;
            ScheduleDTO schedule=schedules.get(id);
            if(schedule==null)return 0;
            schedule.setTakenAt(taken?"2026-10-07T08:00:00":null);
            return 1;
        }
        @Override public int updateAlarmTime(Long id,String time,boolean enabled) {
            writes.add("alarm:"+id);
            ScheduleDTO schedule=schedules.get(id);
            if(schedule==null)return 0;
            schedule.setTime(time);schedule.setAlarmEnabled(enabled);
            return 1;
        }
        @Override public int insertPrescriptionSchedule(Map<String,Object> params) {
            writes.add("insert-prescription");
            ScheduleDTO schedule=schedule(nextId++,(Long)params.get("userId"),(Long)params.get("prescriptionId"),(String)params.get("medicationId"),(String)params.get("newTime"));
            schedule.setScheduledDate((String)params.get("scheduledDate"));
            schedule.setTakenAt(Integer.valueOf(1).equals(params.get("isTaken"))?"2026-10-07T08:00:00":null);
            schedules.put(schedule.getScheduleId(),schedule);
            return 1;
        }
    }

    private static ScheduleServiceImpl service(Fixture fixture) throws Exception {
        ScheduleServiceImpl service=new ScheduleServiceImpl();
        field(service,"scheduleDAO",fixture);
        field(service,"userMapper",proxy(UserMapper.class,(p,m,a)->{
            if(Set.of("findById","findMealTimeByUserIdAndDayType").contains(m.getName()))return null;
            throw new AssertionError("unexpected user operation: "+m.getName());
        }));
        field(service,"prescriptionDAO",proxy(PrescriptionDAO.class,(p,m,a)->switch(m.getName()) {
            case "getPrescriptionById" -> fixture.prescriptions.get((Long)a[0]);
            case "getPrescriptionListByUserId" -> fixture.prescriptions.values().stream().filter(rx->a[0].equals(rx.getUserId())).toList();
            case "getPrescriptionItemsByPrescriptionId" -> fixture.prescriptions.get((Long)a[0]).getItems();
            default -> throw new AssertionError("original prescription data must remain unchanged: "+m.getName());
        }));
        return service;
    }

    // Spring 트랜잭션 프록시의 commit/rollback을 메모리 값으로 관찰
    private static class MemoryTransactions extends AbstractPlatformTransactionManager {
        final Fixture fixture;
        Map<Long,String> before;
        Set<Long> existing;
        int commits,rollbacks;
        MemoryTransactions(Fixture fixture) { this.fixture=fixture; }
        @Override protected Object doGetTransaction() { return new Object(); }
        @Override protected void doBegin(Object transaction,TransactionDefinition definition) {
            before=new HashMap<>();existing=Set.copyOf(fixture.schedules.keySet());
            fixture.schedules.forEach((id,s)->before.put(id,s.getTakenAt()));
        }
        @Override protected void doCommit(DefaultTransactionStatus status) { commits++; }
        @Override protected void doRollback(DefaultTransactionStatus status) {
            rollbacks++;
            fixture.schedules.keySet().removeIf(id->!existing.contains(id));
            before.forEach((id,value)->fixture.schedules.get(id).setTakenAt(value));
        }
    }

    private static ScheduleService transactional(ScheduleServiceImpl service,MemoryTransactions transactions) {
        ProxyFactory factory=new ProxyFactory(service);
        factory.setInterfaces(ScheduleService.class);
        factory.addAdvice(new TransactionInterceptor(transactions,new AnnotationTransactionAttributeSource()));
        return (ScheduleService)factory.getProxy();
    }

    public static void main(String[] args) throws Exception {
        Path mapper=Path.of(args[0]);
        Configuration config=new Configuration();
        try(var in=Files.newInputStream(mapper)) { new XMLMapperBuilder(in,config,mapper.toString(),config.getSqlFragments()).parse(); }
        String pause=config.getMappedStatement("schedule.pausePrescriptionItems").getBoundSql(Map.of("userId",11L,"prescriptionId",5L)).getSql().replaceAll("\\s+"," ");
        check(pause.contains("MERGE INTO medication_use_states")&&pause.contains("p.user_id = ? AND p.prescription_id = ?"),"pause persists only owned prescription item states");
        check(pause.contains("'P:' || TO_CHAR(i.item_id)")&&pause.contains("state.use_status = 'PAUSED'"),"existing P:item registration convention is reused");
        String cancel=config.getMappedStatement("schedule.cancelPrescriptionSchedule").getBoundSql(1L).getSql();
        check(cancel.contains("alarm_enabled = -1")&&cancel.contains("prescription_id IS NOT NULL"),"single prescription deletion leaves a cancellation marker");
        String summary=config.getMappedStatement("schedule.selectMonthlyScheduleSummary").getBoundSql(Map.of("userId",11L,"yearMonth","2026-10")).getSql();
        check(summary.contains("state.use_status != 'ACTIVE'")&&summary.contains("NVL(s.alarm_enabled, 1) != -1"),"monthly summary excludes paused prescriptions and cancellation rows");
        String inactive=config.getMappedStatement("schedule.selectInactivePrescriptionItemIds").getBoundSql(11L).getSql();
        check(inactive.contains("p.user_id = ?")&&inactive.contains("state.user_id = p.user_id"),"daily state lookup remains scoped to the current user");

        Fixture virtual=new Fixture();ScheduleServiceImpl virtualService=service(virtual);
        check(virtualService.getDailySchedules(11L,DATE).size()==3,"prescription generates its three expected virtual slots");
        check(!virtualService.removeSchedule(500170L,true,33L,DATE)&&virtual.writes.isEmpty(),"foreign prescription deletion is rejected before any write");
        check(virtualService.removeSchedule(500170L,true,11L,DATE),"virtual prescription deleteAll succeeds with no physical rows");
        check(virtual.writes.equals(List.of("pause","delete-prescription-schedules")),"state is persisted before related schedules are removed");
        check(virtualService.getDailySchedules(11L,DATE).isEmpty(),"deleted virtual prescription does not reappear on reload");
        check(virtualService.getDailySchedules(11L,"2026-10-08").isEmpty(),"deleted prescription stays removed on following dates");
        check(virtual.prescriptions.get(5L).getItems().size()==2&&virtual.prescriptions.get(5L).getTotalDays()==3,"original prescription items and period are preserved");
        check(virtualService.getDailySchedules(33L,DATE).size()==1,"another user's prescription remains visible");
        virtual.inactive.clear();
        check(virtualService.getDailySchedules(11L,DATE).size()==3,"existing ACTIVE state restoration allows prescription schedules again");

        Fixture physical=new Fixture();physical.schedules.put(1L,schedule(1,11,5L,"M17","08:00"));
        ScheduleServiceImpl physicalService=service(physical);
        check(physicalService.removeSchedule(1L,false,11L,DATE),"physical prescription single deletion succeeds");
        check(physical.writes.equals(List.of("cancel"))&&physical.schedules.containsKey(1L),"single deletion retains the row as a cancellation marker");
        check(physicalService.getDailySchedules(11L,DATE).size()==2,"canceled physical slot is absent and never replaced by a virtual slot");
        check(physicalService.getDailySchedules(11L,"2026-10-08").size()==3,"single deletion preserves later dates and other slots");
        check(physical.inactive.isEmpty(),"single deletion never pauses the entire prescription");
        check(physicalService.removeSchedule(1L,true,11L,DATE)&&physicalService.getDailySchedules(11L,DATE).isEmpty(),"physical prescription deleteAll also blocks virtual regeneration");

        Fixture singleVirtual=new Fixture();ScheduleServiceImpl singleService=service(singleVirtual);
        check(singleService.removeSchedule(500170L,false,11L,DATE),"virtual single deletion retains existing cancellation insertion");
        check(singleService.getDailySchedules(11L,DATE).size()==2&&singleService.getDailySchedules(11L,"2026-10-08").size()==3,"virtual cancellation affects only one selected date and slot");
        singleVirtual.schedules.put(2L,schedule(2,11,null,"manual","10:00"));
        check(singleService.removeSchedule(2L,false,11L,DATE)&&!singleVirtual.schedules.containsKey(2L),"unlinked manual schedule keeps ordinary single deletion");

        Fixture failure=new Fixture();failure.pauseThrows=true;failure.schedules.put(1L,schedule(1,11,5L,"M17","08:00"));
        try { service(failure).removeSchedule(500170L,true,11L,DATE);throw new AssertionError("pause persistence failure was swallowed"); }
        catch(IllegalStateException expected) { check(failure.writes.equals(List.of("pause"))&&failure.schedules.size()==1,"state failure prevents schedule removal and propagates for rollback"); }

        Fixture highId=new Fixture();highId.schedules.put(500170L,schedule(500170,33,6L,"M19","08:00"));
        ScheduleServiceImpl highService=service(highId);
        check(highService.toggleTaken(500170L,true,DATE)&&highId.schedules.get(500170L).getTakenAt()!=null,"physical identifier in virtual range toggles its actual row");
        check(highId.schedules.size()==1&&highId.writes.equals(List.of("taken:500170")),"physical toggle never materializes another prescription's virtual schedule");
        check(highService.updateAlarmTime(500170L,"09:00",false,DATE)&&highId.schedules.get(500170L).getTime().equals("09:00"),"physical identifier in virtual range updates its actual alarm");
        check(highId.schedules.size()==1&&highId.writes.get(1).equals("alarm:500170"),"physical alarm update never inserts a virtual schedule");
        check(highService.removeSchedule(500170L,false,33L,DATE)&&Boolean.TRUE.equals(highId.schedules.get(500170L).getIsCancelled()),"physical identifier in virtual range cancels its actual prescription row");
        check(highService.removeSchedule(500170L,true,33L,DATE)&&highId.schedules.isEmpty(),"physical identifier deleteAll follows the stored prescription instead of decoding the number");
        check(highService.getDailySchedules(11L,DATE).size()==3&&highService.getDailySchedules(33L,DATE).isEmpty(),"colliding encoded prescription remains untouched while actual owner's prescription stops");

        check(ScheduleServiceImpl.class.getMethod("toggleTakenBatch",List.class,boolean.class,String.class).isAnnotationPresent(Transactional.class),"batch exposes one transactional service boundary");
        Fixture batch=new Fixture();batch.schedules.put(1L,schedule(1,11,null,"manual1","08:00"));batch.schedules.put(2L,schedule(2,11,null,"manual2","19:00"));
        batch.failTaken=2L;MemoryTransactions transactions=new MemoryTransactions(batch);
        ScheduleService batchService=transactional(service(batch),transactions);
        try { batchService.toggleTakenBatch(List.of(1L,2L),true,DATE);throw new AssertionError("partially failed batch succeeded"); }
        catch(IllegalStateException expected) { checks++; }
        check(transactions.rollbacks==1&&transactions.commits==0&&batch.schedules.get(1L).getTakenAt()==null,"Spring transaction rolls back earlier successful checks when a later row fails");
        batch.failTaken=null;batch.writes.clear();
        check(batchService.toggleTakenBatch(List.of(1L,1L,2L),true,DATE),"valid batch succeeds");
        check(transactions.commits==1&&batch.writes.equals(List.of("taken:1","taken:2")),"batch commits once and applies duplicate identifiers only once");
        check(batch.schedules.values().stream().allMatch(s->s.getTakenAt()!=null),"successful batch changes every selected schedule");
        int writes=batch.writes.size();
        try { batchService.toggleTakenBatch(List.of(1L,-1L),true,DATE);throw new AssertionError("invalid batch succeeded"); }
        catch(IllegalArgumentException expected) { check(batch.writes.size()==writes,"invalid batch rejects all input before any change"); }

        Fixture materialized=new Fixture();materialized.schedules.put(1L,schedule(1,11,null,"manual","08:00"));materialized.failTaken=1L;
        MemoryTransactions virtualTransactions=new MemoryTransactions(materialized);
        try { transactional(service(materialized),virtualTransactions).toggleTakenBatch(List.of(500170L,1L),true,DATE);throw new AssertionError("failed virtual batch succeeded"); }
        catch(IllegalStateException expected) { check(virtualTransactions.rollbacks==1&&materialized.schedules.size()==1,"failed batch also rolls back an earlier virtual schedule materialization"); }
        System.out.println("PASS: "+checks+" schedule deletion and transactional batch checks (mock DAO, offline mapper, no DB access)");
    }
}
