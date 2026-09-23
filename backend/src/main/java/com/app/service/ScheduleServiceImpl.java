package com.app.service;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.app.dao.ScheduleDAO;
import com.app.domain.User;
import com.app.dto.ScheduleAddDTO;
import com.app.dto.ScheduleDTO;
import com.app.mapper.UserMapper;
import com.app.prescription.dao.PrescriptionDAO;
import com.app.prescription.dto.PrescriptionDTO;
import com.app.prescription.dto.PrescriptionItemDTO;

@Service
public class ScheduleServiceImpl implements ScheduleService {

    @Autowired
    private ScheduleDAO scheduleDAO;

    @Autowired
    private UserMapper userMapper;

    @Autowired
    private PrescriptionDAO prescriptionDAO;

    private static class SlotInfo {
        String slot;
        String slotLabel;
        String time;

        SlotInfo(String slot, String slotLabel, String time) {
            this.slot = slot;
            this.slotLabel = slotLabel;
            this.time = time;
        }
    }

    private String addMinutes(String timeStr, int minutesToAdd) {
        if (timeStr == null || !timeStr.contains(":")) {
            timeStr = "08:00";
        }
        try {
            String[] parts = timeStr.trim().split(":");
            int h = Integer.parseInt(parts[0]);
            int m = Integer.parseInt(parts[1]);
            int totalM = h * 60 + m + minutesToAdd;
            totalM = ((totalM % 1440) + 1440) % 1440;
            int newH = totalM / 60;
            int newM = totalM % 60;
            return String.format("%02d:%02d", newH, newM);
        } catch (Exception e) {
            return timeStr;
        }
    }

    private int parseTimingOffset(String usageTiming) {
        if (usageTiming == null) return 30;
        String t = usageTiming.toLowerCase();
        if (t.contains("식전 30분") || t.contains("식전30분")) return -30;
        if (t.contains("식전 1시간") || t.contains("식전1시간")) return -60;
        if (t.contains("식전")) return -30;
        if (t.contains("직후") || t.contains("식사직후")) return 0;
        if (t.contains("취침") || t.contains("자기전")) return 0;
        return 30; // 기본 식후 30분
    }

    private List<SlotInfo> getIntakeSlots(Integer dailyFrequency, String usageTiming, 
                                          String bTime, String lTime, String dTime, String bedTime) {
        int freq = dailyFrequency != null ? dailyFrequency : 0;
        String timing = usageTiming != null ? usageTiming.toLowerCase() : "";
        int offset = parseTimingOffset(usageTiming);

        // 용법(timing) 문구에 명시된 1회/2회/3회 복용 정보가 있다면 DB 수치보다 최우선 적용 (DB 이상값 방어)
        if (timing.contains("1일 1회") || timing.contains("1일1회") || timing.contains("하루 1회") || timing.contains("하루1회") 
                || (timing.contains("1회") && !timing.contains("2회") && !timing.contains("3회") && !timing.contains("4회"))) {
            freq = 1;
        } else if (timing.contains("2회") && !timing.contains("3회")) {
            freq = 2;
        } else if (timing.contains("3회") || (timing.contains("아침") && timing.contains("점심") && timing.contains("저녁")) || timing.contains("매 식후") || timing.contains("매식후")) {
            freq = 3;
        }

        SlotInfo bSlot = new SlotInfo("breakfast", "아침", addMinutes(bTime, offset));
        SlotInfo lSlot = new SlotInfo("lunch", "점심", addMinutes(lTime, offset));
        SlotInfo dSlot = new SlotInfo("dinner", "저녁", addMinutes(dTime, offset));
        SlotInfo bedSlot = new SlotInfo("bedtime", "취침전", bedTime != null ? bedTime : "22:00");

        List<SlotInfo> slots = new ArrayList<>();

        if (freq == 1) {
            if (timing.contains("취침") || timing.contains("자기전") || timing.contains("취침전")) {
                slots.add(bedSlot);
            } else if (timing.contains("저녁")) {
                slots.add(dSlot);
            } else if (timing.contains("점심")) {
                slots.add(lSlot);
            } else {
                slots.add(bSlot);
            }
            return slots;
        }

        if (freq == 2) {
            if (timing.contains("점심") && timing.contains("저녁")) {
                slots.add(lSlot);
                slots.add(dSlot);
            } else if (timing.contains("아침") && timing.contains("점심")) {
                slots.add(bSlot);
                slots.add(lSlot);
            } else if (timing.contains("취침") || timing.contains("자기전")) {
                slots.add(bSlot);
                slots.add(bedSlot);
            } else {
                slots.add(bSlot);
                slots.add(dSlot);
            }
            return slots;
        }

        if (freq == 3) {
            slots.add(bSlot);
            slots.add(lSlot);
            slots.add(dSlot);
            return slots;
        }

        if (freq >= 4) {
            slots.add(bSlot);
            slots.add(lSlot);
            slots.add(dSlot);
            slots.add(bedSlot);
            return slots;
        }

        // freq가 명시되지 않은 경우 텍스트 유추
        if (timing.contains("3회") || (timing.contains("아침") && timing.contains("점심") && timing.contains("저녁")) || timing.contains("매 식후") || timing.contains("매식후")) {
            slots.add(bSlot);
            slots.add(lSlot);
            slots.add(dSlot);
            return slots;
        }
        if (timing.contains("2회") || (timing.contains("아침") && timing.contains("저녁"))) {
            slots.add(bSlot);
            slots.add(dSlot);
            return slots;
        }
        if (timing.contains("취침") || timing.contains("자기전")) {
            slots.add(bedSlot);
            return slots;
        }

        // 기본값: 3회 복용 (아침, 점심, 저녁)
        slots.add(bSlot);
        slots.add(lSlot);
        slots.add(dSlot);
        return slots;
    }

    private void assignSlotByTime(ScheduleDTO item) {
        if (item.getSlot() != null && !item.getSlot().isEmpty()) return;
        String t = item.getTime();
        if (t == null || !t.contains(":")) {
            item.setSlot("breakfast");
            item.setSlotLabel("아침");
            return;
        }
        try {
            int h = Integer.parseInt(t.split(":")[0]);
            if (h < 11) {
                item.setSlot("breakfast");
                item.setSlotLabel("아침");
            } else if (h < 16) {
                item.setSlot("lunch");
                item.setSlotLabel("점심");
            } else if (h < 21) {
                item.setSlot("dinner");
                item.setSlotLabel("저녁");
            } else {
                item.setSlot("bedtime");
                item.setSlotLabel("취침전");
            }
        } catch (Exception e) {
            item.setSlot("breakfast");
            item.setSlotLabel("아침");
        }
    }

    @Override
    public List<ScheduleDTO> getDailySchedules(Long userId, String date) {
        if (userId == null || userId <= 0L || date == null || date.isBlank()) {
            return Collections.emptyList();
        }

        // 1. DB에 실체화된 스케줄 조회 (상시약, 영양제, 실체화된 처방약)
        List<ScheduleDTO> physicalList = scheduleDAO.selectDailySchedules(userId, date);
        if (physicalList == null) physicalList = new ArrayList<>();

        // 2. 사용자별 기준 식사 시간 조회
        User user = userMapper.findById(userId);
        String bTime = (user != null && user.getBreakfastTime() != null) ? user.getBreakfastTime() : "07:30";
        String lTime = (user != null && user.getLunchTime() != null) ? user.getLunchTime() : "12:00";
        String dTime = (user != null && user.getDinnerTime() != null) ? user.getDinnerTime() : "18:30";
        String bedTime = (user != null && user.getBedtime() != null) ? user.getBedtime() : "22:00";

        // 3. 해당 날짜에 유효한 사용자의 처방전 목록 조회
        LocalDate targetLocalDate;
        try {
            targetLocalDate = LocalDate.parse(date.trim());
        } catch (Exception e) {
            targetLocalDate = LocalDate.now();
        }

        List<ScheduleDTO> combinedList = new ArrayList<>();
        for (ScheduleDTO ps : physicalList) {
            if (Boolean.TRUE.equals(ps.getIsCancelled())) {
                continue;
            }
            assignSlotByTime(ps);
            combinedList.add(ps);
        }

        List<PrescriptionDTO> rxList = prescriptionDAO.getPrescriptionListByUserId(userId);
        if (rxList != null) {
            for (PrescriptionDTO p : rxList) {
                if (p.getDispensedDate() == null) continue;
                int totalDays = p.getTotalDays() != null && p.getTotalDays() > 0 ? p.getTotalDays() : 1;
                LocalDate startDate = p.getDispensedDate().toInstant().atZone(ZoneId.systemDefault()).toLocalDate();
                LocalDate endDate = startDate.plusDays(totalDays);

                if (!targetLocalDate.isBefore(startDate) && targetLocalDate.isBefore(endDate)) {
                    List<PrescriptionItemDTO> items = p.getItems();
                    if (items == null || items.isEmpty()) {
                        items = prescriptionDAO.getPrescriptionItemsByPrescriptionId(p.getPrescriptionId());
                    }
                    if (items == null) continue;

                    for (PrescriptionItemDTO pi : items) {
                        List<SlotInfo> slots = getIntakeSlots(pi.getDailyFrequency(), pi.getUsageTiming(), bTime, lTime, dTime, bedTime);
                        for (int slotIdx = 0; slotIdx < slots.size(); slotIdx++) {
                            SlotInfo s = slots.get(slotIdx);

                            // 이미 실체화된 스케줄에 동일 처방전 + 약품 + 시간대(또는 슬롯)가 있는지 확인
                            boolean alreadyExists = physicalList.stream().anyMatch(ps -> 
                                ps.getPrescriptionId() != null 
                                && ps.getPrescriptionId().equals(p.getPrescriptionId())
                                && ps.getMedicationId() != null 
                                && ps.getMedicationId().equals(pi.getMedicationId())
                                && (s.time.equals(ps.getTime()) || (ps.getSlot() != null && ps.getSlot().equals(s.slot)))
                            );

                            if (!alreadyExists) {
                                ScheduleDTO dto = new ScheduleDTO();
                                long virtualId = (p.getPrescriptionId() != null ? p.getPrescriptionId() : 1L) * 100000L
                                        + (pi.getItemId() != null ? pi.getItemId() : 1L) * 10L
                                        + slotIdx;
                                dto.setScheduleId(virtualId);
                                dto.setMedicationId(pi.getMedicationId());
                                dto.setPrescriptionId(p.getPrescriptionId());
                                dto.setName(pi.getItemName() != null ? pi.getItemName() : "처방 의약품");
                                dto.setType("prescription");
                                dto.setTime(s.time);
                                dto.setTakenAt(null);
                                dto.setAlarmEnabled(true);
                                dto.setSlot(s.slot);
                                dto.setSlotLabel(s.slotLabel);
                                combinedList.add(dto);
                            }
                        }
                    }
                }
            }
        }

        // 4. 슬롯 및 시간 순 정렬
        Map<String, Integer> slotOrder = Map.of(
            "breakfast", 1,
            "lunch", 2,
            "dinner", 3,
            "bedtime", 4
        );
        combinedList.sort((a, b) -> {
            int sa = slotOrder.getOrDefault(a.getSlot(), 99);
            int sb = slotOrder.getOrDefault(b.getSlot(), 99);
            if (sa != sb) return Integer.compare(sa, sb);
            String ta = a.getTime() != null ? a.getTime() : "";
            String tb = b.getTime() != null ? b.getTime() : "";
            int timeCmp = ta.compareTo(tb);
            if (timeCmp != 0) return timeCmp;
            return Long.compare(a.getScheduleId() != null ? a.getScheduleId() : 0L, b.getScheduleId() != null ? b.getScheduleId() : 0L);
        });

        return combinedList;
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
        return toggleTaken(scheduleId, isTaken, null);
    }

    @Override
    @Transactional
    public boolean toggleTaken(Long scheduleId, boolean isTaken, String date) {
        if (scheduleId == null) return false;

        // 가상 처방전 스케줄 ID인 경우 실체화 INSERT 수행
        if (scheduleId >= 100000L) {
            long pId = scheduleId / 100000L;
            long rem = scheduleId % 100000L;
            long itemId = rem / 10L;
            long slotIdx = rem % 10L;

            PrescriptionDTO p = prescriptionDAO.getPrescriptionById(pId);
            if (p != null) {
                List<PrescriptionItemDTO> items = prescriptionDAO.getPrescriptionItemsByPrescriptionId(pId);
                PrescriptionItemDTO matched = items != null ? items.stream()
                        .filter(it -> it.getItemId() != null && it.getItemId().equals(itemId))
                        .findFirst().orElse(null) : null;
                if (matched != null) {
                    User user = userMapper.findById(p.getUserId());
                    String bTime = (user != null && user.getBreakfastTime() != null) ? user.getBreakfastTime() : "07:30";
                    String lTime = (user != null && user.getLunchTime() != null) ? user.getLunchTime() : "12:00";
                    String dTime = (user != null && user.getDinnerTime() != null) ? user.getDinnerTime() : "18:30";
                    String bedTime = (user != null && user.getBedtime() != null) ? user.getBedtime() : "22:00";

                    List<SlotInfo> slots = getIntakeSlots(matched.getDailyFrequency(), matched.getUsageTiming(), bTime, lTime, dTime, bedTime);
                    String time = (slotIdx >= 0 && slotIdx < slots.size()) ? slots.get((int) slotIdx).time : "08:30";
                    String schedDate = (date != null && !date.trim().isEmpty()) ? date.trim() : LocalDate.now().toString();

                    Map<String, Object> params = new HashMap<>();
                    params.put("userId", p.getUserId());
                    params.put("prescriptionId", pId);
                    params.put("medicationId", matched.getMedicationId());
                    params.put("scheduledDate", schedDate);
                    params.put("newTime", time);
                    params.put("alarmEnabled", 1);
                    params.put("isTaken", isTaken ? 1 : 0);
                    return scheduleDAO.insertPrescriptionSchedule(params) > 0;
                }
            }
        }

        return scheduleDAO.updateTakenStatus(scheduleId, isTaken) > 0;
    }

    @Override
    @Transactional
    public boolean updateAlarmTime(Long scheduleId, String newTime, boolean alarmEnabled) {
        return updateAlarmTime(scheduleId, newTime, alarmEnabled, null);
    }

    @Override
    @Transactional
    public boolean updateAlarmTime(Long scheduleId, String newTime, boolean alarmEnabled, String date) {
        if (scheduleId == null) return false;

        if (scheduleId >= 100000L) {
            long pId = scheduleId / 100000L;
            long rem = scheduleId % 100000L;
            long itemId = rem / 10L;

            PrescriptionDTO p = prescriptionDAO.getPrescriptionById(pId);
            if (p != null) {
                List<PrescriptionItemDTO> items = prescriptionDAO.getPrescriptionItemsByPrescriptionId(pId);
                PrescriptionItemDTO matched = items != null ? items.stream()
                        .filter(it -> it.getItemId() != null && it.getItemId().equals(itemId))
                        .findFirst().orElse(null) : null;
                if (matched != null) {
                    String schedDate = (date != null && !date.trim().isEmpty()) ? date.trim() : LocalDate.now().toString();
                    Map<String, Object> params = new HashMap<>();
                    params.put("userId", p.getUserId());
                    params.put("prescriptionId", pId);
                    params.put("medicationId", matched.getMedicationId());
                    params.put("scheduledDate", schedDate);
                    params.put("newTime", newTime != null ? newTime : "08:30");
                    params.put("alarmEnabled", alarmEnabled ? 1 : 0);
                    params.put("isTaken", 0);
                    return scheduleDAO.insertPrescriptionSchedule(params) > 0;
                }
            }
        }

        return scheduleDAO.updateAlarmTime(scheduleId, newTime, alarmEnabled) > 0;
    }

    @Override
    @Transactional
    public boolean addSchedule(ScheduleAddDTO dto) {
        if ("regular".equalsIgnoreCase(dto.getType())) {
            if (dto.getMedicationId() == null || dto.getMedicationId().trim().isEmpty()) {
                throw new IllegalArgumentException("상시약은 의약품 목록에서 약을 선택해야 등록할 수 있습니다.");
            }
            if (!scheduleDAO.checkMedicationExists(dto.getMedicationId())) {
                throw new IllegalArgumentException("선택하신 약품이 의약품 목록에 존재하지 않아 상시약으로 등록할 수 없습니다.");
            }

            Long cabinetId = scheduleDAO.findOrCreateCabinetId(dto.getUserId(), dto.getMedicationId());
            dto.setCabinetId(cabinetId);
            dto.setRoutineId(null);
            dto.setPrescriptionId(null);

        } else if ("supplement".equalsIgnoreCase(dto.getType())) {
            String supName = dto.getName();
            if (supName == null || supName.trim().isEmpty()) {
                throw new IllegalArgumentException("영양제 이름을 입력해 주세요.");
            }

            Long routineId = scheduleDAO.findOrCreateRoutineId(dto.getUserId(), supName.trim(), dto.getScheduledTime());
            dto.setRoutineId(routineId);
            dto.setCabinetId(null);
            dto.setPrescriptionId(null);
            dto.setMedicationId(null);
        }

        return scheduleDAO.insertSchedule(dto) > 0;
    }

    @Override
    @Transactional
    public boolean removeSchedule(Long scheduleId) {
        return removeSchedule(scheduleId, false, null, null);
    }

    @Override
    @Transactional
    public boolean removeSchedule(Long scheduleId, boolean deleteAll, Long userId, String date) {
        if (scheduleId == null) return false;

        // 1. 가상 처방전 스케줄 ID (>= 100000L) 처리
        if (scheduleId >= 100000L) {
            long pId = scheduleId / 100000L;
            long rem = scheduleId % 100000L;
            long itemId = rem / 10L;
            long slotIdx = rem % 10L;

            if (deleteAll) {
                // 이 처방전 전체 삭제 (처방전 마스터 + 세부항목 + 연계 스케줄)
                scheduleDAO.deleteSchedulesByPrescriptionId(pId);
                prescriptionDAO.deletePrescriptionItemsByPrescriptionId(pId);
                prescriptionDAO.deletePrescription(pId);
                return true;
            } else {
                // 해당 일자의 단건 일정만 삭제: placeholder (alarm_enabled = -1) 실체화
                PrescriptionDTO p = prescriptionDAO.getPrescriptionById(pId);
                if (p != null) {
                    List<PrescriptionItemDTO> items = prescriptionDAO.getPrescriptionItemsByPrescriptionId(pId);
                    PrescriptionItemDTO matched = (items != null) ? items.stream()
                            .filter(it -> it.getItemId() != null && it.getItemId().equals(itemId))
                            .findFirst().orElse(null) : null;
                    if (matched != null) {
                        User user = userMapper.findById(p.getUserId());
                        String bTime = (user != null && user.getBreakfastTime() != null) ? user.getBreakfastTime() : "07:30";
                        String lTime = (user != null && user.getLunchTime() != null) ? user.getLunchTime() : "12:00";
                        String dTime = (user != null && user.getDinnerTime() != null) ? user.getDinnerTime() : "18:30";
                        String bedTime = (user != null && user.getBedtime() != null) ? user.getBedtime() : "22:00";

                        List<SlotInfo> slots = getIntakeSlots(matched.getDailyFrequency(), matched.getUsageTiming(), bTime, lTime, dTime, bedTime);
                        String time = (slotIdx >= 0 && slotIdx < slots.size()) ? slots.get((int) slotIdx).time : "08:30";
                        String schedDate = (date != null && !date.trim().isEmpty()) ? date.trim() : LocalDate.now().toString();

                        Map<String, Object> params = new HashMap<>();
                        params.put("userId", p.getUserId());
                        params.put("prescriptionId", pId);
                        params.put("medicationId", matched.getMedicationId());
                        params.put("scheduledDate", schedDate);
                        params.put("scheduledTime", time);
                        return scheduleDAO.insertCancelledPrescriptionSchedule(params) > 0;
                    }
                }
                return false;
            }
        }

        // 2. 실체화된 스케줄 단건 정보 조회
        ScheduleDTO target = scheduleDAO.selectScheduleById(scheduleId);
        if (target == null) {
            return scheduleDAO.deleteSchedule(scheduleId) > 0;
        }

        Long actualUserId = (userId != null && userId > 0L) ? userId : target.getUserId();

        if (deleteAll) {
            // 이 약에 대한 전체 스케줄 및 원천 데이터 삭제
            if (target.getPrescriptionId() != null) {
                Long pId = target.getPrescriptionId();
                scheduleDAO.deleteSchedulesByPrescriptionId(pId);
                prescriptionDAO.deletePrescriptionItemsByPrescriptionId(pId);
                prescriptionDAO.deletePrescription(pId);
                return true;
            } else if (target.getCabinetId() != null) {
                Long cId = target.getCabinetId();
                scheduleDAO.deleteSchedulesByCabinetId(actualUserId, cId);
                scheduleDAO.deleteCabinetMedication(actualUserId, cId);
                return true;
            } else if (target.getRoutineId() != null) {
                Long rId = target.getRoutineId();
                scheduleDAO.deleteSchedulesByRoutineId(actualUserId, rId);
                scheduleDAO.deleteRoutineMedication(actualUserId, rId);
                return true;
            } else {
                return scheduleDAO.deleteSchedule(scheduleId) > 0;
            }
        } else {
            // 단건 일정만 삭제
            return scheduleDAO.deleteSchedule(scheduleId) > 0;
        }
    }
}