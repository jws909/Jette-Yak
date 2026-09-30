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

@CrossOrigin(origins = "http://localhost:5173", methods = { RequestMethod.GET, RequestMethod.POST, RequestMethod.PUT,
		RequestMethod.DELETE, RequestMethod.OPTIONS })
@RestController
@RequestMapping("/api/calendar")
public class CalendarController {

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
			@RequestParam("date") String date,
			@RequestParam(value = "isFamily", required = false, defaultValue = "false") boolean isFamily,
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
			@RequestBody Map<String, Object> body) {
		Object takenVal = body.get("taken");
		boolean taken = Boolean.TRUE.equals(takenVal);
		String date = body.get("date") != null ? String.valueOf(body.get("date")) : null;
		boolean success = scheduleService.toggleTaken(scheduleId, taken, date);
		return success ? ResponseEntity.ok().build() : ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
	}

	@PostMapping("/{scheduleId}/alarm")
	public ResponseEntity<Void> updateAlarm(@PathVariable("scheduleId") Long scheduleId,
			@RequestParam("newTime") String newTime, @RequestParam("alarmEnabled") boolean alarmEnabled,
			@RequestParam(value = "date", required = false) String date) {
		boolean success = scheduleService.updateAlarmTime(scheduleId, newTime, alarmEnabled, date);
		return success ? ResponseEntity.ok().build() : ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
	}

	@PostMapping
	public ResponseEntity<Void> addSchedule(@RequestBody ScheduleAddDTO dto) {
		boolean success = scheduleService.addSchedule(dto);
		return success ? ResponseEntity.status(HttpStatus.CREATED).build()
				: ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
	}

	@PostMapping("/{scheduleId}/delete")
	public ResponseEntity<Void> deleteSchedulePost(@PathVariable("scheduleId") Long scheduleId,
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
			@RequestParam(value = "isFamily", required = false, defaultValue = "false") boolean isFamily,
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