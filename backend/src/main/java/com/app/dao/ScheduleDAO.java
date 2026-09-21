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

    public int deleteSchedule(Long scheduleId) {
        return sqlSession.delete("schedule.deleteSchedule", scheduleId);
    }
}