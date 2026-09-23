package com.app.service;

import com.app.dto.ScheduleAddDTO;
import com.app.dto.ScheduleDTO;
import java.util.List;
import java.util.Map;

public interface ScheduleService {
    List<ScheduleDTO> getDailySchedules(Long userId, String date);
    boolean toggleTaken(Long scheduleId, boolean isTaken);
    boolean toggleTaken(Long scheduleId, boolean isTaken, String date);
    boolean updateAlarmTime(Long scheduleId, String newTime, boolean alarmEnabled);
    boolean updateAlarmTime(Long scheduleId, String newTime, boolean alarmEnabled, String date);
    boolean addSchedule(ScheduleAddDTO dto);
    boolean removeSchedule(Long scheduleId);
    boolean removeSchedule(Long scheduleId, boolean deleteAll, Long userId, String date);
    
    List<Map<String, Object>> searchMedications(String keyword);
    List<Map<String, Object>> getMonthlySummary(Long userId, String yearMonth);
    
    
    // 처방전 정보(로그인 유저 계정에 저장된 내역)를 캘린더 일정으로 일괄 동기화하는 메서드 추가
    //boolean syncPrescriptionToCalendar(Long userId, Long prescriptionId);
}