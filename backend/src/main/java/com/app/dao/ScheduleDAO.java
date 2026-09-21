package com.app.dao;

import com.app.dto.ScheduleAddDTO;
import com.app.dto.ScheduleDTO;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Repository;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Repository
public class ScheduleDAO {

    @Autowired
    private SqlSessionTemplate sqlSession;

    private static final String NS = "schedule.";

    // 1. 일별 복약 일정 조회
    public List<ScheduleDTO> selectDailySchedules(Long userId, String date) {
        Map<String, Object> map = new HashMap<>();
        map.put("userId", userId);
        map.put("date", date);
        return sqlSession.selectList(NS + "selectDailySchedules", map);
    }

    // 2. 복용 여부 토글
    public int updateTakenStatus(Long scheduleId, boolean isTaken) {
        Map<String, Object> map = new HashMap<>();
        map.put("scheduleId", scheduleId);
        map.put("isTaken", isTaken);
        return sqlSession.update(NS + "updateTakenStatus", map);
    }

    // 3. 알람 시간 및 상태 수정
    public int updateAlarmTime(Long scheduleId, String newTime, boolean alarmEnabled) {
        Map<String, Object> map = new HashMap<>();
        map.put("scheduleId", scheduleId);
        map.put("newTime", newTime);
        map.put("alarmEnabled", alarmEnabled);
        return sqlSession.update(NS + "updateAlarmTime", map);
    }

    // 4. 복약 일정 추가
    public int insertSchedule(ScheduleAddDTO dto) {
        return sqlSession.insert(NS + "insertSchedule", dto);
    }
}