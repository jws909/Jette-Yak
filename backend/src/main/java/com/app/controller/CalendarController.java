package com.app.controller;

import java.util.Collections;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.app.dto.ScheduleAddDTO;
import com.app.dto.ScheduleDTO;
import com.app.service.ScheduleService;

@CrossOrigin(
    origins = "http://localhost:5173", 
    methods = { RequestMethod.GET, RequestMethod.POST, RequestMethod.PUT, RequestMethod.DELETE, RequestMethod.OPTIONS }
)
@RestController
@RequestMapping("/api/calendar")
public class CalendarController {

    @Autowired
    private ScheduleService scheduleService;

    @GetMapping
    public ResponseEntity<List<ScheduleDTO>> getDailySchedules(
            @RequestParam(value = "userId", required = false) Long userId,
            @RequestParam("date") String date,
            javax.servlet.http.HttpServletRequest request) {
        if (userId == null || userId <= 0L) {
            var session = request.getSession(false);
            Object sessionVal = session != null ? session.getAttribute("userId") : null;
            if (sessionVal instanceof Long) {
                userId = (Long) sessionVal;
            } else if (sessionVal instanceof Number) {
                userId = ((Number) sessionVal).longValue();
            }
        }
        if (userId == null || userId <= 0L) {
            return ResponseEntity.ok(Collections.emptyList());
        }
        List<ScheduleDTO> list = scheduleService.getDailySchedules(userId, date);
        return ResponseEntity.ok(list);
    }

    @GetMapping("/search-medications")
    public ResponseEntity<List<Map<String, Object>>> searchMedications(
            @RequestParam("keyword") String keyword) {
        List<Map<String, Object>> list = scheduleService.searchMedications(keyword);
        return ResponseEntity.ok(list);
    }

    @PostMapping("/{scheduleId}/toggle")
    public ResponseEntity<Void> toggleTaken(
            @PathVariable("scheduleId") Long scheduleId,
            @RequestBody Map<String, Object> body) {
        Object takenVal = body.get("taken");
        boolean taken = Boolean.TRUE.equals(takenVal);
        String date = body.get("date") != null ? String.valueOf(body.get("date")) : null;
        boolean success = scheduleService.toggleTaken(scheduleId, taken, date);
        return success ? ResponseEntity.ok().build() : ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
    }

    @PostMapping("/{scheduleId}/alarm")
    public ResponseEntity<Void> updateAlarm(
            @PathVariable("scheduleId") Long scheduleId,
            @RequestParam("newTime") String newTime,
            @RequestParam("alarmEnabled") boolean alarmEnabled,
            @RequestParam(value = "date", required = false) String date) {
        boolean success = scheduleService.updateAlarmTime(scheduleId, newTime, alarmEnabled, date);
        return success ? ResponseEntity.ok().build() : ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
    }

    @PostMapping
    public ResponseEntity<Void> addSchedule(@RequestBody ScheduleAddDTO dto) {
        boolean success = scheduleService.addSchedule(dto);
        return success ? ResponseEntity.status(HttpStatus.CREATED).build() : ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
    }

    @PostMapping("/{scheduleId}/delete")
    public ResponseEntity<Void> deleteSchedulePost(
            @PathVariable("scheduleId") Long scheduleId,
            @RequestParam(value = "deleteAll", required = false, defaultValue = "false") boolean deleteAll,
            @RequestParam(value = "userId", required = false) Long userId,
            @RequestParam(value = "date", required = false) String date,
            javax.servlet.http.HttpServletRequest request) {

        if (userId == null || userId <= 0L) {
            var session = request.getSession(false);
            Object sessionVal = session != null ? session.getAttribute("userId") : null;
            if (sessionVal instanceof Long) {
                userId = (Long) sessionVal;
            } else if (sessionVal instanceof Number) {
                userId = ((Number) sessionVal).longValue();
            }
        }

        boolean isDeleted = scheduleService.removeSchedule(scheduleId, deleteAll, userId, date);
        return isDeleted ? ResponseEntity.ok().build() : ResponseEntity.notFound().build();
    }
    
    @GetMapping("/summary")
    public ResponseEntity<List<Map<String, Object>>> getMonthlySummary(
            @RequestParam(value = "userId", required = false) Long userId,
            @RequestParam("yearMonth") String yearMonth,
            javax.servlet.http.HttpServletRequest request) {
        if (userId == null || userId <= 0L) {
            var session = request.getSession(false);
            Object sessionVal = session != null ? session.getAttribute("userId") : null;
            if (sessionVal instanceof Long) {
                userId = (Long) sessionVal;
            } else if (sessionVal instanceof Number) {
                userId = ((Number) sessionVal).longValue();
            }
        }
        if (userId == null || userId <= 0L) {
            return ResponseEntity.ok(Collections.emptyList());
        }
        List<Map<String, Object>> summary = scheduleService.getMonthlySummary(userId, yearMonth);
        return ResponseEntity.ok(summary);
    }
}
