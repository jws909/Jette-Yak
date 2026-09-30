package com.app.service;

import java.util.ArrayList;
import java.util.List;
import com.app.dao.ScheduleDAO;
import com.app.guide.dao.MedicationGuideDao;

/** 상비약·영양제 삭제 시 외래키에 맞는 실행 순서를 DB 없이 확인한다. */
public class EverydayMedicationServiceCheck {
    private static void check(boolean value,String message){if(!value)throw new AssertionError(message);}
    public static void main(String[] args){
        List<String> calls=new ArrayList<>();
        ScheduleDAO schedules=new ScheduleDAO(){
            @Override public int deleteSchedulesByCabinetId(Long userId,Long id){calls.add("cabinet-schedules");return 2;}
            @Override public int deleteCabinetMedication(Long userId,Long id){calls.add("cabinet");return 1;}
            @Override public int deleteSchedulesByRoutineId(Long userId,Long id){calls.add("routine-schedules");return 1;}
            @Override public int deleteRoutineMedication(Long userId,Long id){calls.add("routine");return 1;}
        };
        MedicationGuideDao guide=new MedicationGuideDao(null){
            @Override public int deleteUseState(long userId,String id){calls.add("state:"+id);return 1;}
            @Override public int saveOverallGuide(long userId,String value){calls.add("cache");return 1;}
        };
        var service=new EverydayMedicationService(schedules,guide);
        service.delete(7,"cabinet",3);
        check(calls.equals(List.of("cabinet-schedules","state:C:3","cabinet","cache")),"cabinet child-first order");
        calls.clear();
        service.delete(7,"routine",4);
        check(calls.equals(List.of("routine-schedules","state:R:4","routine","cache")),"routine child-first order");
        try{service.delete(7,"unknown",1);throw new AssertionError("unknown source accepted");}
        catch(IllegalArgumentException expected){}
        System.out.println("PASS: everyday medication delete order");
    }
}
