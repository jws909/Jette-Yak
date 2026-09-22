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
        if ("regular".equalsIgnoreCase(dto.getType())) {
            // 상시약: medications에 반드시 존재하는 의약품이어야 함
            if (dto.getMedicationId() == null || dto.getMedicationId().trim().isEmpty()) {
                throw new IllegalArgumentException("상시약은 의약품 목록에서 약을 선택해야 등록할 수 있습니다.");
            }
            if (!scheduleDAO.checkMedicationExists(dto.getMedicationId())) {
                throw new IllegalArgumentException("선택하신 약품이 의약품 목록에 존재하지 않아 상시약으로 등록할 수 없습니다.");
            }

            // cabinet_medications 테이블에 등록 및 cabinet_id 확보
            Long cabinetId = scheduleDAO.findOrCreateCabinetId(dto.getUserId(), dto.getMedicationId());
            dto.setCabinetId(cabinetId);
            dto.setRoutineId(null);
            dto.setPrescriptionId(null);

        } else if ("supplement".equalsIgnoreCase(dto.getType())) {
            // 영양제: routine_medications에 등록하고 routine_id 참조
            String supName = dto.getName();
            if (supName == null || supName.trim().isEmpty()) {
                throw new IllegalArgumentException("영양제 이름을 입력해 주세요.");
            }

            Long routineId = scheduleDAO.findOrCreateRoutineId(dto.getUserId(), supName.trim(), dto.getScheduledTime());
            dto.setRoutineId(routineId);
            dto.setCabinetId(null);
            dto.setPrescriptionId(null);
            dto.setMedicationId(null); // 영양제는 medication_id를 null로 설정
        }

        return scheduleDAO.insertSchedule(dto) > 0;
    }

    @Override
    @Transactional
    public boolean removeSchedule(Long scheduleId) {
        return scheduleDAO.deleteSchedule(scheduleId) > 0;
    }
}