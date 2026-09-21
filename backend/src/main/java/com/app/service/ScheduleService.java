package com.app.service;

import com.app.dto.ScheduleAddDTO;
import com.app.dto.ScheduleDTO;
import java.util.List;

public interface ScheduleService {
    List<ScheduleDTO> getDailySchedules(Long userId, String date);
    boolean toggleTaken(Long scheduleId, boolean isTaken);
    boolean updateAlarmTime(Long scheduleId, String newTime, boolean alarmEnabled);
    boolean addSchedule(ScheduleAddDTO dto);
}