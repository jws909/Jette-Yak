package com.app.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.*;

@RestController
@RequestMapping("/api/family")
@CrossOrigin(origins = "http://localhost:5173")
public class FamilyController {

	@Autowired
	private DataSource dataSource;

	/**
	 * 1. 가족 구성원 목록 조회
	 * GET /api/family/members?userId=1
	 */
	@GetMapping("/members")
	public ResponseEntity<?> getFamilyMembers(@RequestParam("userId") Long userId) {
		List<Map<String, Object>> members = new ArrayList<>();

		String selectFamilySql = "SELECT FAMILY_ID FROM USERS WHERE USER_ID = ?";
		String listSql = "SELECT USER_ID, NICKNAME AS NAME, ROLE, IS_VIRTUAL FROM USERS WHERE FAMILY_ID = ? ORDER BY USER_ID ASC";

		try (Connection conn = dataSource.getConnection()) {
			Long familyId = null;
			try (PreparedStatement pstmt = conn.prepareStatement(selectFamilySql)) {
				pstmt.setLong(1, userId);
				try (ResultSet rs = pstmt.executeQuery()) {
					if (rs.next()) {
						familyId = rs.getLong("FAMILY_ID");
						if (rs.wasNull() || familyId == 0) {
							return ResponseEntity.ok(Collections.emptyList());
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
	 * 2. 가족 구성원 직접 등록 (영유아/자녀 등 가상 계정)
	 * POST /api/family/members
	 */
	@PostMapping("/members")
	public ResponseEntity<?> addFamilyMember(@RequestBody Map<String, Object> req) {
		Connection conn = null;
		try {
			conn = dataSource.getConnection();
			conn.setAutoCommit(false); // 트랜잭션 시작

			Long guardianId = Long.valueOf(req.get("guardianId").toString());
			String name = (String) req.get("name");
			String role = req.get("role") != null ? (String) req.get("role") : "BABY";
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
				pstmt.setString(3, role);
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
	@PostMapping("/invite")
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
				// 가족 그룹 시퀀스 생성
				String createFamSql = "INSERT INTO FAMILY_GROUPS (FAMILY_ID, CREATED_AT) VALUES (FAMILY_SEQ.NEXTVAL, SYSDATE)";
				try (PreparedStatement pstmt = conn.prepareStatement(createFamSql)) {
					pstmt.executeUpdate();
				}
				String getSeqSql = "SELECT FAMILY_SEQ.CURRVAL FROM DUAL";
				try (PreparedStatement pstmt = conn.prepareStatement(getSeqSql);
					 ResultSet rs = pstmt.executeQuery()) {
					if (rs.next()) {
						familyId = rs.getLong(1);
					}
				}
				// 본인 계정에 가족 ID 반영
				String updateMyFamSql = "UPDATE USERS SET FAMILY_ID = ? WHERE USER_ID = ?";
				try (PreparedStatement pstmt = conn.prepareStatement(updateMyFamSql)) {
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
	@PostMapping("/invitations/respond")
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
				String updateUSql =
					    "UPDATE USERS SET FAMILY_ID = ?, ROLE = ? WHERE USER_ID = ?";

					try (PreparedStatement pstmt = conn.prepareStatement(updateUSql)) {
					    pstmt.setLong(1, familyId);
					    pstmt.setString(2, inviteRole);
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