package com.app.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.app.dao.ScheduleDAO;
import com.app.dto.ScheduleAddDTO;
import com.app.dto.ScheduleDTO;

@Service
public class ScheduleServiceImpl implements ScheduleService {

    @Autowired
    private ScheduleDAO scheduleDAO;

    @Override
    public List<ScheduleDTO> getDailySchedules(Long userId, String date) {
        return scheduleDAO.selectDailySchedules(userId, date);
    }

    @Override
    public List<Map<String, Object>> getMonthlySummary(Long userId, String yearMonth) {
        return scheduleDAO.selectMonthlyScheduleSummary(userId, yearMonth);
    }

    @Override
    public List<Map<String, Object>> searchMedications(String keyword) {
        if (keyword == null || keyword.trim().isEmpty()) {
            return new ArrayList<>();
        }
        return scheduleDAO.searchMedications(keyword.trim());
    }

    @Override
    @Transactional
    public boolean toggleTaken(Long scheduleId, boolean isTaken) {
        return scheduleDAO.updateTakenStatus(scheduleId, isTaken) > 0;
    }

    @Override
    @Transactional
    public boolean updateAlarmTime(Long scheduleId, String newTime, boolean alarmEnabled) {
        return scheduleDAO.updateAlarmTime(scheduleId, newTime, alarmEnabled) > 0;
    }

    @Override
    @Transactional
    public boolean addSchedule(ScheduleAddDTO dto) {
        return scheduleDAO.insertSchedule(dto) > 0;
    }

    @Override
    @Transactional
    public boolean removeSchedule(Long scheduleId) {
        return scheduleDAO.deleteSchedule(scheduleId) > 0;
    }
}