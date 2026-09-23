package com.app.dao;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Repository;

import com.app.dto.ScheduleAddDTO;
import com.app.dto.ScheduleDTO;

@Repository
public class ScheduleDAO {

    @Autowired
    private SqlSessionTemplate sqlSession;

    public List<ScheduleDTO> selectDailySchedules(Long userId, String date) {
        Map<String, Object> params = new HashMap<>();
        params.put("userId", userId);
        params.put("date", date);
        return sqlSession.selectList("schedule.selectDailySchedules", params);
    }

    public List<Map<String, Object>> searchMedications(String keyword) {
        return sqlSession.selectList("schedule.searchMedications", keyword);
    }

    public boolean checkMedicationExists(String medicationId) {
        if (medicationId == null || medicationId.trim().isEmpty()) {
            return false;
        }
        Integer count = sqlSession.selectOne("schedule.checkMedicationExists", medicationId.trim());
        return count != null && count > 0;
    }

    public Long findOrCreateCabinetId(Long userId, String medicationId) {
        Map<String, Object> params = new HashMap<>();
        params.put("userId", userId);
        params.put("medicationId", medicationId);
        Long cabinetId = sqlSession.selectOne("schedule.selectCabinetId", params);
        if (cabinetId == null) {
            sqlSession.insert("schedule.insertCabinetMedication", params);
            cabinetId = sqlSession.selectOne("schedule.selectCabinetId", params);
        }
        return cabinetId;
    }

    public Long findOrCreateRoutineId(Long userId, String supplementName, String takeTime) {
        Map<String, Object> params = new HashMap<>();
        params.put("userId", userId);
        params.put("supplementName", supplementName);
        params.put("takeTime", takeTime != null ? takeTime : "09:00");
        Long routineId = sqlSession.selectOne("schedule.selectRoutineId", params);
        if (routineId == null) {
            sqlSession.insert("schedule.insertRoutineMedication", params);
            routineId = sqlSession.selectOne("schedule.selectRoutineId", params);
        }
        return routineId;
    }

    public List<Map<String, Object>> selectMonthlyScheduleSummary(Long userId, String yearMonth) {
        Map<String, Object> params = new HashMap<>();
        params.put("userId", userId);
        params.put("yearMonth", yearMonth);
        return sqlSession.selectList("schedule.selectMonthlyScheduleSummary", params);
    }

    public int updateTakenStatus(Long scheduleId, boolean isTaken) {
        Map<String, Object> params = new HashMap<>();
        params.put("scheduleId", scheduleId);
        params.put("isTaken", isTaken ? 1 : 0);
        return sqlSession.update("schedule.updateTakenStatus", params);
    }

    public int updateAlarmTime(Long scheduleId, String newTime, boolean alarmEnabled) {
        Map<String, Object> params = new HashMap<>();
        params.put("scheduleId", scheduleId);
        params.put("newTime", newTime);
        params.put("alarmEnabled", alarmEnabled ? 1 : 0);
        return sqlSession.update("schedule.updateAlarmTime", params);
    }

    public int insertSchedule(ScheduleAddDTO dto) {
        return sqlSession.insert("schedule.insertSchedule", dto);
    }

    public int insertPrescriptionSchedule(Map<String, Object> params) {
        return sqlSession.insert("schedule.insertPrescriptionSchedule", params);
    }

    public int deleteSchedule(Long scheduleId) {
        return sqlSession.delete("schedule.deleteSchedule", scheduleId);
    }

    public ScheduleDTO selectScheduleById(Long scheduleId) {
        return sqlSession.selectOne("schedule.selectScheduleById", scheduleId);
    }

    public int deleteSchedulesByPrescriptionId(Long prescriptionId) {
        return sqlSession.delete("schedule.deleteSchedulesByPrescriptionId", prescriptionId);
    }

    public int deleteSchedulesByCabinetId(Long userId, Long cabinetId) {
        Map<String, Object> params = new HashMap<>();
        params.put("userId", userId);
        params.put("cabinetId", cabinetId);
        return sqlSession.delete("schedule.deleteSchedulesByCabinetId", params);
    }

    public int deleteCabinetMedication(Long userId, Long cabinetId) {
        Map<String, Object> params = new HashMap<>();
        params.put("userId", userId);
        params.put("cabinetId", cabinetId);
        return sqlSession.delete("schedule.deleteCabinetMedication", params);
    }

    public int deleteSchedulesByRoutineId(Long userId, Long routineId) {
        Map<String, Object> params = new HashMap<>();
        params.put("userId", userId);
        params.put("routineId", routineId);
        return sqlSession.delete("schedule.deleteSchedulesByRoutineId", params);
    }

    public int deleteRoutineMedication(Long userId, Long routineId) {
        Map<String, Object> params = new HashMap<>();
        params.put("userId", userId);
        params.put("routineId", routineId);
        return sqlSession.delete("schedule.deleteRoutineMedication", params);
    }

    public int insertCancelledPrescriptionSchedule(Map<String, Object> params) {
        return sqlSession.insert("schedule.insertCancelledPrescriptionSchedule", params);
    }
}