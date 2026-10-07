package com.app.controller;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.apache.ibatis.session.SqlSession;
import org.apache.ibatis.session.SqlSessionFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.app.dto.ScheduleAddDTO;
import com.app.dto.ScheduleDTO;
import com.app.service.ScheduleService;

@RestController
@RequestMapping("/api/calendar")
public class CalendarController {
    @Autowired
    private com.app.util.UserAccess userAccess;
    @Autowired
    private com.app.dao.ScheduleDAO scheduleDAO;
    @Autowired
    private com.app.prescription.dao.PrescriptionDAO prescriptionDAO;

    private String calendarDate(String date) {
        if (date == null || date.isBlank() || "undefined".equalsIgnoreCase(date) || "null".equalsIgnoreCase(date))
            return java.time.LocalDate.now().toString();
        try { return java.time.LocalDate.parse(date.trim()).toString(); }
        catch (java.time.format.DateTimeParseException invalid) {
            throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST, "날짜를 확인해 주세요.");
        }
    }

    private String calendarMonth(String month) {
        try { return java.time.YearMonth.parse(month == null ? "" : month.trim()).toString(); }
        catch (java.time.format.DateTimeParseException invalid) {
            throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST, "조회할 월을 확인해 주세요.");
        }
    }

    private Long scheduleOwner(Long scheduleId, javax.servlet.http.HttpServletRequest request) {
        userAccess.currentUser(request);
        if (scheduleId == null || scheduleId <= 0) throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST);
        ScheduleDTO schedule = scheduleDAO.selectScheduleById(scheduleId);
        Long owner = schedule == null ? null : schedule.getUserId();
        if (owner == null && scheduleId >= 100000L) {
            var prescription = prescriptionDAO.getPrescriptionById(scheduleId / 100000L);
            owner = prescription == null ? null : prescription.getUserId();
        }
        if (owner == null) throw new org.springframework.web.server.ResponseStatusException(HttpStatus.NOT_FOUND);
        return userAccess.familyUser(request, owner);
    }


	@Autowired
	private ScheduleService scheduleService;

	@Autowired
	private SqlSessionFactory sqlSessionFactory;

	/**
	 * 기존 MyBatis 오라클 세션을 활용한 가족 구성원 USER_ID 목록 조회
	 */
	private List<Long> getFamilyUserIds(Long userId) {
		List<Long> ids = new ArrayList<>();
		ids.add(userId);

		String selectFamilySql = "SELECT FAMILY_ID FROM USERS WHERE USER_ID = ?";
		String listSql = "SELECT USER_ID FROM USERS WHERE FAMILY_ID = ?";

		try (SqlSession session = sqlSessionFactory.openSession();
		     Connection conn = session.getConnection()) {
			Long familyId = null;
			try (PreparedStatement pstmt = conn.prepareStatement(selectFamilySql)) {
				pstmt.setLong(1, userId);
				try (ResultSet rs = pstmt.executeQuery()) {
					if (rs.next()) {
						familyId = rs.getLong("FAMILY_ID");
						if (rs.wasNull()) familyId = null;
					}
				}
			}

			if (familyId != null && familyId > 0L) {
				try (PreparedStatement pstmt = conn.prepareStatement(listSql)) {
					pstmt.setLong(1, familyId);
					try (ResultSet rs = pstmt.executeQuery()) {
						while (rs.next()) {
							long fUid = rs.getLong("USER_ID");
							if (!ids.contains(fUid)) {
								ids.add(fUid);
							}
						}
					}
				}
			}
		} catch (Exception e) {
			e.printStackTrace();
		}
		return ids;
	}

	@GetMapping
	public ResponseEntity<List<ScheduleDTO>> getDailySchedules(
			@RequestParam(value = "userId", required = false) Long userId, 
			@RequestParam(value = "date", required = false) String date,
			@RequestParam(value = "isFamily", required = false, defaultValue = "false") boolean isFamily,
			javax.servlet.http.HttpServletRequest request) {

		// ★ [날짜 방어 로직] date가 비어있거나 "undefined", "null"이면 오늘 날짜(YYYY-MM-DD)로 강제 치환
		if (date == null || date.trim().isEmpty() || "undefined".equalsIgnoreCase(date) || "null".equalsIgnoreCase(date)) {
			date = java.time.LocalDate.now().toString();
		}

		userId = userAccess.familyUser(request, userId);
		if (userId == null || userId <= 0L) {
			return ResponseEntity.ok(Collections.emptyList());
		}

        date = calendarDate(date);

		// 개별 탭 조회
		if (!isFamily) {
			List<ScheduleDTO> list = scheduleService.getDailySchedules(userId, date);
			return ResponseEntity.ok(list != null ? list : Collections.emptyList());
		}

		// 전체(가족) 탭 조회: 가족 구성원 전체 일정 취합
		List<Long> familyUserIds = getFamilyUserIds(userId);
		List<ScheduleDTO> combinedList = new ArrayList<>();
		Set<Long> seenScheduleIds = new HashSet<>();

		for (Long fUid : familyUserIds) {
			List<ScheduleDTO> memberSchedules = scheduleService.getDailySchedules(fUid, date);
			if (memberSchedules != null) {
				for (ScheduleDTO item : memberSchedules) {
					if (item.getScheduleId() == null || seenScheduleIds.add(item.getScheduleId())) {
						item.setUserId(fUid); // 소유자 ID 바인딩
						combinedList.add(item);
					}
				}
			}
		}

		combinedList.sort(Comparator.comparing(ScheduleDTO::getTime, Comparator.nullsLast(String::compareTo)));
		return ResponseEntity.ok(combinedList);
	}

	@GetMapping("/search-medications")
	public ResponseEntity<List<Map<String, Object>>> searchMedications(@RequestParam("keyword") String keyword) {
		List<Map<String, Object>> list = scheduleService.searchMedications(keyword);
		return ResponseEntity.ok(list);
	}

	@PostMapping("/{scheduleId}/toggle")
	public ResponseEntity<Void> toggleTaken(@PathVariable("scheduleId") Long scheduleId,
			@RequestBody Map<String, Object> body, javax.servlet.http.HttpServletRequest request) {
        scheduleOwner(scheduleId, request);
		Object takenVal = body.get("taken");
		boolean taken = Boolean.TRUE.equals(takenVal);
		String date = body.get("date") != null ? String.valueOf(body.get("date")) : null;
		date = calendarDate(date);
		boolean success = scheduleService.toggleTaken(scheduleId, taken, date);
		return success ? ResponseEntity.ok().build() : ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
	}

	@PostMapping("/toggle-batch")
	public ResponseEntity<Void> toggleTakenBatch(@RequestBody Map<String, Object> body, javax.servlet.http.HttpServletRequest request) {
        userAccess.currentUser(request);
        Object idsVal = body.get("scheduleIds");
        if (!(idsVal instanceof List<?> values) || values.isEmpty() || values.size() > 500)
            return ResponseEntity.badRequest().build();
        List<Long> ids = new ArrayList<>();
        for (Object value : values) {
            Long id = com.app.util.UserAccess.requestedId(value);
            scheduleOwner(id, request); // 쓰기 전에 일괄 요청 전체의 소유권 확인
            ids.add(id);
        }
        boolean taken = Boolean.TRUE.equals(body.get("taken"));
        String date = calendarDate(body.get("date") == null ? null : body.get("date").toString());
        boolean success = scheduleService.toggleTakenBatch(ids, taken, date);
        return success ? ResponseEntity.ok().build() : ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
    }

	@PostMapping("/{scheduleId}/alarm")
	public ResponseEntity<Void> updateAlarm(@PathVariable("scheduleId") Long scheduleId,
			@RequestParam("newTime") String newTime, @RequestParam("alarmEnabled") boolean alarmEnabled,
			@RequestParam(value = "date", required = false) String date, javax.servlet.http.HttpServletRequest request) {
        scheduleOwner(scheduleId, request);
        date = calendarDate(date);
		boolean success = scheduleService.updateAlarmTime(scheduleId, newTime, alarmEnabled, date);
		return success ? ResponseEntity.ok().build() : ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
	}

	@PostMapping
	public ResponseEntity<?> addSchedule(@RequestBody ScheduleAddDTO dto, javax.servlet.http.HttpServletRequest request) {
		dto.setUserId(userAccess.familyUser(request, dto.getUserId()));
        dto.setScheduledDate(calendarDate(dto.getScheduledDate()));
        String type = dto.getType();
        if (!"regular".equalsIgnoreCase(type) && !"supplement".equalsIgnoreCase(type) && !"prescription".equalsIgnoreCase(type))
            return ResponseEntity.badRequest().body(Map.of("message", "일정 종류를 확인해 주세요."));
        if ("prescription".equalsIgnoreCase(type)) {
            if (dto.getPrescriptionId() == null) return ResponseEntity.badRequest().body(Map.of("message", "처방전 정보를 확인해 주세요."));
            var prescription = prescriptionDAO.getPrescriptionById(dto.getPrescriptionId());
            if (prescription == null) return ResponseEntity.notFound().build();
            userAccess.familyUser(request, prescription.getUserId());
            if (!dto.getUserId().equals(prescription.getUserId()))
                return ResponseEntity.badRequest().body(Map.of("message", "처방전 소유자와 일정 사용자가 일치하지 않습니다."));
            dto.setCabinetId(null);
            dto.setRoutineId(null);
        }
		if (dto.getUserId() == null || dto.getUserId() <= 0L) {
			return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("message", "로그인이 필요합니다."));
		}

		try {
			boolean success = scheduleService.addSchedule(dto);
			return success ? ResponseEntity.status(HttpStatus.CREATED).build()
					: ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of("message", "일정 등록 처리에 실패했습니다."));
		} catch (IllegalArgumentException e) {
			return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
		} catch (Exception e) {
			org.apache.logging.log4j.LogManager.getLogger(getClass()).error("일정 등록 처리 오류: {}", e.getMessage(), e);
			return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of("message", "서버 오류: " + e.getMessage()));
		}
	}

	@PostMapping("/{scheduleId}/delete")
	public ResponseEntity<Void> deleteSchedulePost(@PathVariable("scheduleId") Long scheduleId,
			@RequestParam(value = "deleteAll", required = false, defaultValue = "false") boolean deleteAll,
			@RequestParam(value = "userId", required = false) Long userId,
			@RequestParam(value = "date", required = false) String date,
			javax.servlet.http.HttpServletRequest request) {

		userId = userAccess.familyUser(request, userId);

        userId = scheduleOwner(scheduleId, request);
        date = calendarDate(date);
		boolean isDeleted = scheduleService.removeSchedule(scheduleId, deleteAll, userId, date);
		return isDeleted ? ResponseEntity.ok().build() : ResponseEntity.notFound().build();
	}

	@GetMapping("/summary")
	public ResponseEntity<List<Map<String, Object>>> getMonthlySummary(
			@RequestParam(value = "userId", required = false) Long userId, 
			@RequestParam("yearMonth") String yearMonth,
			@RequestParam(value = "isFamily", required = false, defaultValue = "false") boolean isFamily,
			javax.servlet.http.HttpServletRequest request) {
		userId = userAccess.familyUser(request, userId);
		if (userId == null || userId <= 0L) {
			return ResponseEntity.ok(Collections.emptyList());
		}

		yearMonth = calendarMonth(yearMonth);
		if (!isFamily) {
			List<Map<String, Object>> summary = scheduleService.getMonthlySummary(userId, yearMonth);
			return ResponseEntity.ok(summary != null ? summary : Collections.emptyList());
		}

		List<Long> familyUserIds = getFamilyUserIds(userId);
		Map<String, Map<String, Object>> dateMap = new HashMap<>();

		for (Long fUid : familyUserIds) {
			List<Map<String, Object>> memberSummary = scheduleService.getMonthlySummary(fUid, yearMonth);
			if (memberSummary != null) {
				for (Map<String, Object> item : memberSummary) {
					String dateKey = String.valueOf(item.get("scheduleDate"));
					if (!dateMap.containsKey(dateKey)) {
						Map<String, Object> newEntry = new HashMap<>();
						newEntry.put("scheduleDate", dateKey);
						newEntry.put("hasPrescription", 0);
						newEntry.put("hasRegular", 0);
						newEntry.put("hasSupplement", 0);
						dateMap.put(dateKey, newEntry);
					}

					Map<String, Object> target = dateMap.get(dateKey);
					if (toInt(item.get("hasPrescription")) == 1) target.put("hasPrescription", 1);
					if (toInt(item.get("hasRegular")) == 1) target.put("hasRegular", 1);
					if (toInt(item.get("hasSupplement")) == 1) target.put("hasSupplement", 1);
				}
			}
		}

		return ResponseEntity.ok(new ArrayList<>(dateMap.values()));
	}

	private int toInt(Object obj) {
		if (obj == null) return 0;
		try {
			return Integer.parseInt(String.valueOf(obj));
		} catch (Exception e) {
			return 0;
		}
	}
}
