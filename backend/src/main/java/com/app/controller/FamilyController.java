package com.app.controller;

import org.apache.ibatis.session.SqlSession;
import org.apache.ibatis.session.SqlSessionFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.*;

@RestController
@RequestMapping("/api/family")
@CrossOrigin(
	    origins = "http://localhost:5173", 
	    allowCredentials = "true", 
	    methods = { RequestMethod.GET, RequestMethod.POST, RequestMethod.PUT, RequestMethod.DELETE, RequestMethod.OPTIONS }
	)
public class FamilyController {

	@Autowired
	@Qualifier("data_source")
	private DataSource dataSource;
	
	@Autowired
	private SqlSessionFactory sqlSessionFactory;

	/**
	 * 가족 구성원 삭제 (내보내기 / 직접 등록 프로필 삭제)
	 */
	@PostMapping(value = "/members/{targetUserId}/remove", produces = MediaType.APPLICATION_JSON_VALUE)
	public ResponseEntity<Map<String, Object>> removeFamilyMember(
			@PathVariable("targetUserId") Long targetUserId,
			@RequestBody(required = false) Map<String, Object> req,
			@RequestParam(value = "userId", required = false) Long paramUserId,
			javax.servlet.http.HttpServletRequest request) {

		Map<String, Object> response = new HashMap<>();

		// 1. 요청자 세션 또는 파라미터 검증
		Long currentUserId = paramUserId;
		if (currentUserId == null && req != null && req.get("userId") != null) {
			try {
				currentUserId = Long.valueOf(req.get("userId").toString().trim());
			} catch (NumberFormatException ignored) {}
		}
		if (currentUserId == null && request != null) {
			var session = request.getSession(false);
			if (session != null) {
				Object sessionVal = session.getAttribute("userId");
				if (sessionVal instanceof Long) {
					currentUserId = (Long) sessionVal;
				} else if (sessionVal instanceof Number) {
					currentUserId = ((Number) sessionVal).longValue();
				}
			}
		}

		if (currentUserId == null || targetUserId == null) {
			response.put("success", false);
			response.put("message", "로그인이 필요합니다.");
			return ResponseEntity.status(org.springframework.http.HttpStatus.UNAUTHORIZED).body(response);
		}

		if (currentUserId.equals(targetUserId)) {
			response.put("success", false);
			response.put("message", "본인은 삭제할 수 없습니다.");
			return ResponseEntity.badRequest().body(response);
		}

		// 외래키(자식 레코드) 삭제 순서: FAMILY_MEMBERS -> 복약일정 -> 초대내역 -> USERS
		String deleteFamilyMemberSql = "DELETE FROM FAMILY_MEMBERS WHERE USER_ID = ?";
		String checkVirtualSql = "SELECT IS_VIRTUAL FROM USERS WHERE USER_ID = ?";
		String deleteSchedulesSql = "DELETE FROM MEDICATION_SCHEDULES WHERE USER_ID = ?";
		String deleteUserSql = "DELETE FROM USERS WHERE USER_ID = ?";
		String unlinkUserSql = "UPDATE USERS SET FAMILY_ID = NULL, ROLE = 'PROT' WHERE USER_ID = ?";
		String cleanInviteSql = "DELETE FROM FAMILY_INVITATIONS WHERE RECEIVER_ID = ? OR SENDER_ID = ?";

		try (SqlSession sessionSql = sqlSessionFactory.openSession();
		     Connection conn = sessionSql.getConnection()) {
			conn.setAutoCommit(false);

			// (1) FAMILY_MEMBERS 테이블의 자식 레코드 먼저 제거 (FK_FM_USER 위배 방지)
			try (PreparedStatement pstmtFm = conn.prepareStatement(deleteFamilyMemberSql)) {
				pstmtFm.setLong(1, targetUserId);
				pstmtFm.executeUpdate();
			} catch (Exception ex) {
				System.err.println("FAMILY_MEMBERS 삭제 건너뜀 또는 에러: " + ex.getMessage());
			}

			// (2) 가상 계정(직접 등록) 여부 확인
			String isVirtual = "N";
			try (PreparedStatement pstmt = conn.prepareStatement(checkVirtualSql)) {
				pstmt.setLong(1, targetUserId);
				try (ResultSet rs = pstmt.executeQuery()) {
					if (rs.next()) {
						isVirtual = rs.getString("IS_VIRTUAL");
					}
				}
			}

			// (3) 초대 내역 정리
			try (PreparedStatement pstmtInvite = conn.prepareStatement(cleanInviteSql)) {
				pstmtInvite.setLong(1, targetUserId);
				pstmtInvite.setLong(2, targetUserId);
				pstmtInvite.executeUpdate();
			} catch (Exception ex) {
				// 초대 테이블 삭제 오류 방어
			}

			// (4) 가상 계정 vs 일반 회원 분기
			if ("Y".equalsIgnoreCase(isVirtual)) {
				// 일정 삭제
				try (PreparedStatement pstmtSched = conn.prepareStatement(deleteSchedulesSql)) {
					pstmtSched.setLong(1, targetUserId);
					pstmtSched.executeUpdate();
				} catch (Exception ex) {
					// 스케줄 테이블명 다를 경우 대비
				}
				// 유저 계정 삭제
				try (PreparedStatement pstmtUser = conn.prepareStatement(deleteUserSql)) {
					pstmtUser.setLong(1, targetUserId);
					pstmtUser.executeUpdate();
				}
			} else {
				// 일반 연동 회원: 그룹 해제
				try (PreparedStatement pstmtUser = conn.prepareStatement(unlinkUserSql)) {
					pstmtUser.setLong(1, targetUserId);
					pstmtUser.executeUpdate();
				}
			}

			conn.commit();
			response.put("success", true);
			response.put("message", "삭제되었습니다.");
			return ResponseEntity.ok(response);

		} catch (Exception e) {
			e.printStackTrace();
			response.put("success", false);
			response.put("message", e.getMessage());
			return ResponseEntity.internalServerError().body(response);
		}
	}
	/**
	 * 0. 가족 그룹 생성 API
	 * POST /api/family/create
	 */
	@PostMapping(value = "/create", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
	public ResponseEntity<?> createFamily(@RequestBody(required = false) Map<String, Object> req, javax.servlet.http.HttpServletRequest httpRequest) {
		Long userId = null;
		if (req != null && req.get("userId") != null) {
			try {
				userId = Long.valueOf(req.get("userId").toString().trim());
			} catch (NumberFormatException ignored) {}
		}
		if (userId == null && httpRequest != null) {
			var session = httpRequest.getSession(false);
			if (session != null && session.getAttribute("userId") instanceof Number) {
				userId = ((Number) session.getAttribute("userId")).longValue();
			}
		}

		if (userId == null || userId <= 0L) {
			return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "로그인이 필요합니다."));
		}

		String familyName = req.get("familyName") != null ? req.get("familyName").toString().trim() : "";

		Connection conn = null;
		try {
			conn = dataSource.getConnection();
			conn.setAutoCommit(false);

			// 1) 이미 FAMILY_ID가 존재하는지 확인
			Long existingFamilyId = null;
			String checkSql = "SELECT FAMILY_ID, NICKNAME, LOGIN_ID FROM USERS WHERE USER_ID = ?";
			String userDisplayName = "";
			try (PreparedStatement pstmt = conn.prepareStatement(checkSql)) {
				pstmt.setLong(1, userId);
				try (ResultSet rs = pstmt.executeQuery()) {
					if (rs.next()) {
						existingFamilyId = rs.getLong("FAMILY_ID");
						if (rs.wasNull()) existingFamilyId = null;
						userDisplayName = rs.getString("NICKNAME");
						if (userDisplayName == null || userDisplayName.isBlank()) {
							userDisplayName = rs.getString("LOGIN_ID");
						}
					} else {
						return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("success", false, "message", "사용자를 찾을 수 없습니다."));
					}
				}
			}

			if (existingFamilyId != null && existingFamilyId > 0L) {
				return ResponseEntity.ok(Map.of(
						"success", true,
						"familyId", existingFamilyId,
						"message", "이미 가족 그룹에 소속되어 있습니다."
				));
			}

			if (familyName.isEmpty()) {
				familyName = (userDisplayName != null && !userDisplayName.isBlank() ? userDisplayName : "우리") + " 가족";
			}

			// 2) FAMILIES 테이블에 신규 생성 및 FAMILY_ID 채번
			Long newFamilyId = null;
			try {
				String insertFamSql = "INSERT INTO FAMILIES (FAMILY_NAME) VALUES (?)";
				try (PreparedStatement pstmt = conn.prepareStatement(insertFamSql, new String[] { "FAMILY_ID" })) {
					pstmt.setString(1, familyName);
					pstmt.executeUpdate();
					try (ResultSet rs = pstmt.getGeneratedKeys()) {
						if (rs.next()) {
							newFamilyId = rs.getLong(1);
						}
					}
				}
			} catch (Exception ex) {
				// 만약 SEQUENCE(FAMILY_SEQ) 방식인 경우 폴백
				try {
					String seqSql = "SELECT FAMILY_SEQ.NEXTVAL FROM DUAL";
					try (PreparedStatement ps = conn.prepareStatement(seqSql);
						 ResultSet rs = ps.executeQuery()) {
						if (rs.next()) newFamilyId = rs.getLong(1);
					}
					if (newFamilyId != null) {
						try (PreparedStatement ps = conn.prepareStatement("INSERT INTO FAMILIES (FAMILY_ID, FAMILY_NAME) VALUES (?, ?)")) {
							ps.setLong(1, newFamilyId);
							ps.setString(2, familyName);
							ps.executeUpdate();
						}
					}
				} catch (Exception ex2) {
					throw new RuntimeException("가족 생성 실패: " + ex.getMessage());
				}
			}

			if (newFamilyId == null || newFamilyId <= 0L) {
				throw new RuntimeException("가족 ID 생성에 실패했습니다.");
			}

			// 3) USERS 테이블에 FAMILY_ID 부여 및 ROLE을 'GUAR'로 업데이트
			String updateUserSql = "UPDATE USERS SET FAMILY_ID = ?, ROLE = 'GUAR', UPDATED_AT = SYSDATE WHERE USER_ID = ?";
			try (PreparedStatement pstmt = conn.prepareStatement(updateUserSql)) {
				pstmt.setLong(1, newFamilyId);
				pstmt.setLong(2, userId);
				pstmt.executeUpdate();
			}

			// 4) FAMILY_MEMBERS 테이블에 관계 등록
			try {
				String insertMemSql = "INSERT INTO FAMILY_MEMBERS (FAMILY_ID, USER_ID) VALUES (?, ?)";
				try (PreparedStatement pstmt = conn.prepareStatement(insertMemSql)) {
					pstmt.setLong(1, newFamilyId);
					pstmt.setLong(2, userId);
					pstmt.executeUpdate();
				}
			} catch (Exception ignored) {}

			// 5) FAMILY_GROUPS 테이블이 존재할 경우 동기화
			try {
				String insertGroupSql = "INSERT INTO FAMILY_GROUPS (FAMILY_ID, CREATED_AT) VALUES (?, SYSDATE)";
				try (PreparedStatement pstmt = conn.prepareStatement(insertGroupSql)) {
					pstmt.setLong(1, newFamilyId);
					pstmt.executeUpdate();
				}
			} catch (Exception ignored) {}

			conn.commit();

			return ResponseEntity.ok(Map.of(
					"success", true,
					"familyId", newFamilyId,
					"familyName", familyName,
					"message", "가족이 성공적으로 생성되었습니다."
			));

		} catch (Exception e) {
			if (conn != null) {
				try { conn.rollback(); } catch (Exception ignored) {}
			}
			e.printStackTrace();
			return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
					.body(Map.of("success", false, "message", "가족 생성 중 오류가 발생했습니다: " + e.getMessage()));
		} finally {
			if (conn != null) {
				try { conn.close(); } catch (Exception ignored) {}
			}
		}
	}

	/**
	 * 1. 가족 구성원 목록 조회
	 * GET /api/family/members?userId=1
	 */
	@GetMapping("/members")
	public ResponseEntity<?> getFamilyMembers(@RequestParam("userId") Long userId) {
		List<Map<String, Object>> members = new ArrayList<>();

		String selectFamilySql = "SELECT u.FAMILY_ID, f.FAMILY_NAME FROM USERS u LEFT JOIN FAMILIES f ON u.FAMILY_ID = f.FAMILY_ID WHERE u.USER_ID = ?";
		String listSql = "SELECT USER_ID, NVL(NICKNAME, LOGIN_ID) AS NAME, NVL(ROLE, 'PROT') AS ROLE, NVL(IS_VIRTUAL, 'N') AS IS_VIRTUAL "
				+ "FROM USERS WHERE FAMILY_ID = ? ORDER BY CASE WHEN ROLE = 'GUAR' THEN 0 ELSE 1 END, USER_ID ASC";

		try (Connection conn = dataSource.getConnection()) {
			Long familyId = null;
			String familyName = "";
			try (PreparedStatement pstmt = conn.prepareStatement(selectFamilySql)) {
				pstmt.setLong(1, userId);
				try (ResultSet rs = pstmt.executeQuery()) {
					if (rs.next()) {
						familyId = rs.getLong("FAMILY_ID");
						if (rs.wasNull() || familyId == 0) {
							return ResponseEntity.ok(Collections.emptyList());
						}
						familyName = rs.getString("FAMILY_NAME");
						if (familyName == null || familyName.isBlank()) {
							familyName = "우리 가족";
						}
					} else {
						return ResponseEntity.ok(Collections.emptyList());
					}
				}
			}

			try (PreparedStatement pstmt = conn.prepareStatement(listSql)) {
				pstmt.setLong(1, familyId);
				try (ResultSet rs = pstmt.executeQuery()) {
					while (rs.next()) {
						Map<String, Object> map = new HashMap<>();
						map.put("userId", rs.getLong("USER_ID"));
						map.put("name", rs.getString("NAME"));
						map.put("role", rs.getString("ROLE"));
						map.put("isVirtual", rs.getString("IS_VIRTUAL"));
						map.put("familyId", familyId);
						map.put("familyName", familyName);
						members.add(map);
					}
				}
			}
			return ResponseEntity.ok(members);
		} catch (Exception e) {
			e.printStackTrace();
			return ResponseEntity.internalServerError().body(Collections.singletonMap("message", e.getMessage()));
		}
	}

	/**
	 * 1-1. 가족 이름 변경 API
	 * POST /api/family/rename
	 */
	@PostMapping(value = "/rename", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
	public ResponseEntity<?> renameFamily(@RequestBody(required = false) Map<String, Object> req) {
		if (req == null) {
			return ResponseEntity.badRequest().body(Map.of("success", false, "message", "요청 데이터가 없습니다."));
		}
		Long userId = req.get("userId") != null ? Long.valueOf(req.get("userId").toString().trim()) : null;
		String familyName = req.get("familyName") != null ? req.get("familyName").toString().trim() : "";
		if (userId == null || familyName.isEmpty()) {
			return ResponseEntity.badRequest().body(Map.of("success", false, "message", "가족 이름을 입력해주세요."));
		}
		String updateSql = "UPDATE FAMILIES SET FAMILY_NAME = ? WHERE FAMILY_ID = (SELECT FAMILY_ID FROM USERS WHERE USER_ID = ?)";
		try (Connection conn = dataSource.getConnection();
		     PreparedStatement pstmt = conn.prepareStatement(updateSql)) {
			pstmt.setString(1, familyName);
			pstmt.setLong(2, userId);
			int updated = pstmt.executeUpdate();
			if (updated > 0) {
				return ResponseEntity.ok(Map.of("success", true, "familyName", familyName, "message", "가족 이름이 변경되었습니다."));
			} else {
				return ResponseEntity.badRequest().body(Map.of("success", false, "message", "소속된 가족 정보를 찾을 수 없습니다."));
			}
		} catch (Exception e) {
			e.printStackTrace();
			return ResponseEntity.internalServerError().body(Map.of("success", false, "message", e.getMessage()));
		}
	}

	/**
	 * 2. 가족 구성원 직접 등록 (영유아/자녀 등 가상 계정)
	 * POST /api/family/members
	 */
	@PostMapping(value = "/members", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
	public ResponseEntity<?> addFamilyMember(@RequestBody Map<String, Object> req) {
		Connection conn = null;
		try {
			conn = dataSource.getConnection();
			conn.setAutoCommit(false); // 트랜잭션 시작

			Long guardianId = Long.valueOf(req.get("guardianId").toString());
			String name = (String) req.get("name");
			String role = req.get("role") != null ? req.get("role").toString() : "PROT";
			String safeRole = ("GUAR".equalsIgnoreCase(role) || "보호자".equals(role)) ? "GUAR" : "PROT";
			String sex = req.get("sex") != null ? (String) req.get("sex") : "M";
			String birthdate = (String) req.get("birthdate");
			if (birthdate == null || birthdate.trim().isEmpty()) {
				birthdate = "2026-01-01";
			}

			// (1) 보호자의 FAMILY_ID 조회
			Long familyId = null;
			String checkFamilySql = "SELECT FAMILY_ID FROM USERS WHERE USER_ID = ?";
			try (PreparedStatement pstmt = conn.prepareStatement(checkFamilySql)) {
				pstmt.setLong(1, guardianId);
				try (ResultSet rs = pstmt.executeQuery()) {
					if (rs.next()) {
						familyId = rs.getLong("FAMILY_ID");
						if (rs.wasNull()) familyId = 0L;
					}
				}
			}

			// 보호자에게 FAMILY_ID가 없다면 FAMILIES에 신규 생성
			if (familyId == null || familyId == 0L) {
				String insertFamSql = "INSERT INTO FAMILIES (FAMILY_NAME) VALUES (?)";
				try (PreparedStatement pstmt = conn.prepareStatement(insertFamSql, new String[] { "FAMILY_ID" })) {
					pstmt.setString(1, name + " 가족");
					pstmt.executeUpdate();

					try (ResultSet rs = pstmt.getGeneratedKeys()) {
						if (rs.next()) {
							familyId = rs.getLong(1);
						}
					}
				}

				String updateGuardSql = "UPDATE USERS SET FAMILY_ID = ? WHERE USER_ID = ?";
				try (PreparedStatement pstmt = conn.prepareStatement(updateGuardSql)) {
					pstmt.setLong(1, familyId);
					pstmt.setLong(2, guardianId);
					pstmt.executeUpdate();
				}
			}

			// (2) USERS 테이블에 가상 유저 INSERT
			Long newUserId = null;
			String insertUserSql = "INSERT INTO USERS ("
					+ " EMAIL, NICKNAME, PUSH_ENABLED, CREATED_AT, UPDATED_AT, "
					+ " ROLE, FAMILY_ID, SEX, IS_PREGNANT, BIRTHDATE, "
					+ " BREAKFAST_TIME, LUNCH_TIME, DINNER_TIME, BEDTIME, IS_VIRTUAL "
					+ ") VALUES ("
					+ " ?, ?, 1, SYSDATE, SYSDATE, "
					+ " ?, ?, ?, 0, TO_DATE(?, 'YYYY-MM-DD'), "
					+ " '08:00', '12:00', '18:00', '22:00', 'Y' "
					+ ")";

			try (PreparedStatement pstmt = conn.prepareStatement(insertUserSql, new String[] { "USER_ID" })) {
				pstmt.setString(1, "virtual_" + System.currentTimeMillis() + "@jette.local");
				pstmt.setString(2, name);
				pstmt.setString(3, safeRole);
				pstmt.setLong(4, familyId);
				pstmt.setString(5, sex);
				pstmt.setString(6, birthdate);
				pstmt.executeUpdate();

				try (ResultSet rs = pstmt.getGeneratedKeys()) {
					if (rs.next()) {
						newUserId = rs.getLong(1);
					}
				}
			}

			// (3) FAMILY_MEMBERS 테이블에 매핑 INSERT
			String insertMemSql = "INSERT INTO FAMILY_MEMBERS (FAMILY_ID, USER_ID) VALUES (?, ?)";
			try (PreparedStatement pstmt = conn.prepareStatement(insertMemSql)) {
				pstmt.setLong(1, familyId);
				pstmt.setLong(2, newUserId);
				pstmt.executeUpdate();
			}

			conn.commit();
			return ResponseEntity.ok(Collections.singletonMap("success", true));

		} catch (Exception e) {
			if (conn != null) {
				try { conn.rollback(); } catch (Exception ignored) {}
			}
			e.printStackTrace();
			return ResponseEntity.internalServerError().body(Collections.singletonMap("message", e.getMessage()));
		} finally {
			if (conn != null) {
				try { conn.close(); } catch (Exception ignored) {}
			}
		}
	}

	/**
	 * 3. 가족 연동 초대 보내기 (오직 LOGIN_ID로만 검색)
	 * POST /api/family/invite
	 * Body: { "senderId": 1, "targetLoginId": "user123" }
	 */
	@PostMapping(value = "/invite", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
	public ResponseEntity<?> sendInvitation(@RequestBody Map<String, Object> req) {
		Connection conn = null;
		try {
			conn = dataSource.getConnection();
			conn.setAutoCommit(false);

			Long senderId = Long.valueOf(req.get("senderId").toString());
			String targetLoginId = (String) req.get("targetLoginId");
			String role = req.get("role") != null ? (String) req.get("role") : "BABY";

			// 1) 대상 회원 존재 여부 및 USER_ID 확인
			Long targetUserId = null;
			String findUserSql = "SELECT USER_ID FROM USERS WHERE LOGIN_ID = ?";
			try (PreparedStatement pstmt = conn.prepareStatement(findUserSql)) {
				pstmt.setString(1, targetLoginId);
				try (ResultSet rs = pstmt.executeQuery()) {
					if (rs.next()) {
						targetUserId = rs.getLong("USER_ID");
					} else {
						return ResponseEntity.badRequest().body(Collections.singletonMap("message", "해당 아이디를 가진 회원을 찾을 수 없습니다."));
					}
				}
			}

			// 자기 자신 초대 방지
			if (senderId.equals(targetUserId)) {
				return ResponseEntity.badRequest().body(Collections.singletonMap("message", "본인은 초대할 수 없습니다."));
			}

			// 2) 보낸 사람의 FAMILY_ID 확인 (없으면 새로 생성)
			Long familyId = null;
			String checkFamSql = "SELECT FAMILY_ID FROM USERS WHERE USER_ID = ?";
			try (PreparedStatement pstmt = conn.prepareStatement(checkFamSql)) {
				pstmt.setLong(1, senderId);
				try (ResultSet rs = pstmt.executeQuery()) {
					if (rs.next()) {
						familyId = rs.getLong("FAMILY_ID");
						if (rs.wasNull()) familyId = null;
					}
				}
			}

			if (familyId == null || familyId == 0L) {
				String insertFamSql = "INSERT INTO FAMILIES (FAMILY_NAME) VALUES (?)";
				try (PreparedStatement pstmt = conn.prepareStatement(insertFamSql, new String[] { "FAMILY_ID" })) {
					pstmt.setString(1, "우리 가족");
					pstmt.executeUpdate();
					try (ResultSet rs = pstmt.getGeneratedKeys()) {
						if (rs.next()) {
							familyId = rs.getLong(1);
						}
					}
				}
				// 본인 계정에 가족 ID 반영
				String updateMyFamSql = "UPDATE USERS SET FAMILY_ID = ?, ROLE = 'GUAR' WHERE USER_ID = ?";
				try (PreparedStatement pstmt = conn.prepareStatement(updateMyFamSql)) {
					pstmt.setLong(1, familyId);
					pstmt.setLong(2, senderId);
					pstmt.executeUpdate();
				}
				// 본인을 FAMILY_MEMBERS에 매핑
				String insertMyFmSql = "INSERT INTO FAMILY_MEMBERS (FAMILY_ID, USER_ID) VALUES (?, ?)";
				try (PreparedStatement pstmt = conn.prepareStatement(insertMyFmSql)) {
					pstmt.setLong(1, familyId);
					pstmt.setLong(2, senderId);
					pstmt.executeUpdate();
				}
			}

			// 3) 이미 대기 중인 초대장이 있는지 체크
			String checkDupSql = "SELECT COUNT(*) FROM FAMILY_INVITATIONS WHERE FAMILY_ID = ? AND RECEIVER_ID = ? AND STATUS = 'PENDING'";
			try (PreparedStatement pstmt = conn.prepareStatement(checkDupSql)) {
				pstmt.setLong(1, familyId);
				pstmt.setLong(2, targetUserId);
				try (ResultSet rs = pstmt.executeQuery()) {
					if (rs.next() && rs.getInt(1) > 0) {
						return ResponseEntity.badRequest().body(Collections.singletonMap("message", "이미 대기 중인 초대가 존재합니다."));
					}
				}
			}

			// 4) 초대장 등록 (물음표 4개와 파라미터 1, 2, 3, 4 완벽 매핑)
			String insertInvSql = "INSERT INTO FAMILY_INVITATIONS (FAMILY_ID, SENDER_ID, RECEIVER_ID, ROLE, STATUS, CREATED_AT) VALUES (?, ?, ?, ?, 'PENDING', SYSDATE)";
			try (PreparedStatement pstmt = conn.prepareStatement(insertInvSql)) {
				pstmt.setLong(1, familyId);
				pstmt.setLong(2, senderId);
				pstmt.setLong(3, targetUserId);
				pstmt.setString(4, role);
				pstmt.executeUpdate();
			}

			conn.commit();
			return ResponseEntity.ok(Collections.singletonMap("success", true));

		} catch (Exception e) {
			if (conn != null) {
				try { conn.rollback(); } catch (Exception ignored) {}
			}
			e.printStackTrace();
			return ResponseEntity.internalServerError().body(Collections.singletonMap("message", e.getMessage()));
		} finally {
			if (conn != null) {
				try { conn.close(); } catch (Exception ignored) {}
			}
		}
	}

	/**
	 * 4. 나에게 온 초대 목록 조회 (앱/웹 알림창에서 확인)
	 * GET /api/family/invitations?userId=2
	 */
	@GetMapping("/invitations")
	public ResponseEntity<?> getMyInvitations(@RequestParam("userId") Long userId) {
		List<Map<String, Object>> list = new ArrayList<>();
		String sql = "SELECT i.INVITE_ID, i.FAMILY_ID, f.FAMILY_NAME, u.NICKNAME AS SENDER_NAME, TO_CHAR(i.CREATED_AT, 'YYYY-MM-DD HH24:MI') AS CREATED_AT "
				+ "FROM FAMILY_INVITATIONS i "
				+ "JOIN FAMILIES f ON i.FAMILY_ID = f.FAMILY_ID "
				+ "JOIN USERS u ON i.SENDER_ID = u.USER_ID "
				+ "WHERE i.RECEIVER_ID = ? AND i.STATUS = 'PENDING' "
				+ "ORDER BY i.INVITE_ID DESC";

		try (Connection conn = dataSource.getConnection();
			 PreparedStatement pstmt = conn.prepareStatement(sql)) {
			pstmt.setLong(1, userId);
			try (ResultSet rs = pstmt.executeQuery()) {
				while (rs.next()) {
					Map<String, Object> map = new HashMap<>();
					map.put("inviteId", rs.getLong("INVITE_ID"));
					map.put("familyId", rs.getLong("FAMILY_ID"));
					map.put("familyName", rs.getString("FAMILY_NAME"));
					map.put("senderName", rs.getString("SENDER_NAME"));
					map.put("createdAt", rs.getString("CREATED_AT"));
					list.add(map);
				}
			}
			return ResponseEntity.ok(list);
		} catch (Exception e) {
			e.printStackTrace();
			return ResponseEntity.internalServerError().body(Collections.singletonMap("message", e.getMessage()));
		}
	}

	/**
	 * 5. 초대 승인 또는 거절
	 * POST /api/family/invitations/respond
	 * Body: { "inviteId": 1, "userId": 2, "action": "ACCEPT" 또는 "REJECT" }
	 */
	@PostMapping(value = "/invitations/respond", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
	public ResponseEntity<?> respondInvitation(@RequestBody Map<String, Object> req) {
		Long inviteId = Long.valueOf(req.get("inviteId").toString());
		Long userId = Long.valueOf(req.get("userId").toString());
		String action = (String) req.get("action"); // "ACCEPT" 또는 "REJECT"

		Connection conn = null;
		try {
			conn = dataSource.getConnection();
			conn.setAutoCommit(false);

			// 1) 대상 초대 확인
			Long familyId = null;
			String inviteRole = null;
			String checkSql =
				    "SELECT FAMILY_ID, ROLE FROM FAMILY_INVITATIONS " +
				    "WHERE INVITE_ID = ? AND RECEIVER_ID = ? AND STATUS = 'PENDING'";
			try (PreparedStatement pstmt = conn.prepareStatement(checkSql)) {
				pstmt.setLong(1, inviteId);
				pstmt.setLong(2, userId);
				try (ResultSet rs = pstmt.executeQuery()) {
					if (rs.next()) {
						familyId = rs.getLong("FAMILY_ID");
						inviteRole = rs.getString("ROLE");
					} else {
						return ResponseEntity.badRequest().body(Collections.singletonMap("message", "유효하지 않거나 이미 처리된 초대입니다."));
					}
				}
			}

			if ("ACCEPT".equalsIgnoreCase(action)) {
				// [승인 시]
				// 2) USERS 테이블의 FAMILY_ID 갱신
				// 화면에서 넘어오는 상세 관계 -> DB 제약조건('GUAR', 'PROT')으로 변환
				String safeRole = "PROT"; // 자녀, 부모님, 배우자 등은 모두 피보호자(PROT)

				if (inviteRole != null) {
				    String r = inviteRole.trim();
				    if ("GUAR".equalsIgnoreCase(r) || "보호자".equals(r)) {
				        safeRole = "GUAR";
				    } else {
				        // "자녀", "부모님", "배우자", "피보호자", "PROT", "CHILD" 등은 모두 PROT로 통일
				        safeRole = "PROT";
				    }
				}

				String updateUSql = "UPDATE USERS SET FAMILY_ID = ?, ROLE = ? WHERE USER_ID = ?";
				try (PreparedStatement pstmt = conn.prepareStatement(updateUSql)) {
				    pstmt.setLong(1, familyId);
				    pstmt.setString(2, safeRole);
				    pstmt.setLong(3, userId);
				    pstmt.executeUpdate();
				}

				// 3) FAMILY_MEMBERS 테이블에 관계 등록 (FAMILY_ID, USER_ID)
				String insertMemSql = "INSERT INTO FAMILY_MEMBERS (FAMILY_ID, USER_ID) VALUES (?, ?)";
				try (PreparedStatement pstmt = conn.prepareStatement(insertMemSql)) {
					pstmt.setLong(1, familyId);
					pstmt.setLong(2, userId);
					pstmt.executeUpdate();
				}

				// 4) 초대 상태를 ACCEPTED로 변경
				String updateInvSql = "UPDATE FAMILY_INVITATIONS SET STATUS = 'ACCEPTED' WHERE INVITE_ID = ?";
				try (PreparedStatement pstmt = conn.prepareStatement(updateInvSql)) {
					pstmt.setLong(1, inviteId);
					pstmt.executeUpdate();
				}
			} else {
				// [거절 시]
				String updateInvSql = "UPDATE FAMILY_INVITATIONS SET STATUS = 'REJECTED' WHERE INVITE_ID = ?";
				try (PreparedStatement pstmt = conn.prepareStatement(updateInvSql)) {
					pstmt.setLong(1, inviteId);
					pstmt.executeUpdate();
				}
			}

			conn.commit();
			return ResponseEntity.ok(Collections.singletonMap("success", true));

		} catch (Exception e) {
			if (conn != null) {
				try { conn.rollback(); } catch (Exception ignored) {}
			}
			e.printStackTrace();
			return ResponseEntity.internalServerError().body(Collections.singletonMap("message", e.getMessage()));
		} finally {
			if (conn != null) {
				try { conn.close(); } catch (Exception ignored) {}
			}
		}
	}
}
