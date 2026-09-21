package com.app.controller;

import com.app.dto.ScheduleAddDTO;
import com.app.dto.ScheduleDTO;
import com.app.dto.ScheduleToggleDTO;
import com.app.service.ScheduleService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/calendar")
@CrossOrigin(origins = "*")
public class CalendarController {

    @Autowired
    private ScheduleService scheduleService;

    // 1. 선택 일자 복약 목록 조회
    @GetMapping
    public ResponseEntity<List<ScheduleDTO>> getDailySchedules(
            @RequestParam(value = "userId", defaultValue = "1") Long userId,
            @RequestParam("date") String date) {
        List<ScheduleDTO> list = scheduleService.getDailySchedules(userId, date);
        return new ResponseEntity<>(list, HttpStatus.OK);
    }

    // 2. 복용 여부 체크 토글
    @PostMapping("/{scheduleId}/toggle")
    public ResponseEntity<String> toggleTaken(
            @PathVariable("scheduleId") Long scheduleId,
            @RequestBody ScheduleToggleDTO dto) {
        boolean success = scheduleService.toggleTaken(scheduleId, dto.isTaken());
        return success ? ResponseEntity.ok("SUCCESS") : ResponseEntity.status(HttpStatus.BAD_REQUEST).body("FAIL");
    }

    // 3. 알람 시간 및 상태 수정
    @PostMapping("/{scheduleId}/alarm")
    public ResponseEntity<String> updateAlarm(
            @PathVariable("scheduleId") Long scheduleId,
            @RequestParam("newTime") String newTime,
            @RequestParam("alarmEnabled") boolean alarmEnabled) {
        boolean success = scheduleService.updateAlarmTime(scheduleId, newTime, alarmEnabled);
        return success ? ResponseEntity.ok("SUCCESS") : ResponseEntity.status(HttpStatus.BAD_REQUEST).body("FAIL");
    }

    // 4. 복약 추가
    @PostMapping
    public ResponseEntity<String> addSchedule(@RequestBody ScheduleAddDTO dto) {
        boolean success = scheduleService.addSchedule(dto);
        return success ? ResponseEntity.ok("SUCCESS") : ResponseEntity.status(HttpStatus.BAD_REQUEST).body("FAIL");
    }
    
 // 6. 약품 검색 API (복약 추가 모달 자동완성)
    @GetMapping("/search-medications")
    public ResponseEntity<List<Map<String, Object>>> searchMedications(
            @RequestParam("keyword") String keyword) {
        List<Map<String, Object>> list = scheduleService.searchMedications(keyword);
        return ResponseEntity.ok(list);
    }
    
    @GetMapping("/summary")
    public ResponseEntity<List<Map<String, Object>>> getMonthlySummary(
            @RequestParam(value = "userId", defaultValue = "1") Long userId,
            @RequestParam("yearMonth") String yearMonth) {
        List<Map<String, Object>> summary = scheduleService.getMonthlySummary(userId, yearMonth);
        return ResponseEntity.ok(summary);
    }
}