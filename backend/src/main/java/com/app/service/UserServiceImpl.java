package com.app.service;

import com.app.domain.User;
import com.app.dto.SignupRequest;
import com.app.mapper.UserMapper;
import com.app.util.PasswordUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

import javax.sql.DataSource;
import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.time.DateTimeException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

@Service
public class UserServiceImpl implements UserService {

    private static final Pattern USERNAME_PATTERN = Pattern.compile("^[A-Za-z0-9]{6,20}$");
    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");
    private static final int NICKNAME_MIN_LENGTH = 2;
    private static final int NICKNAME_MAX_LENGTH = 6;

    @Autowired
    private UserMapper userMapper;

    @Autowired
    private EmailVerificationService emailVerificationService;

    @Autowired
    @Qualifier("data_source")
    private DataSource dataSource;

    @Override
    public boolean isLoginIdAvailable(String loginId) {
        validateUsernameFormat(loginId);
        return userMapper.countByLoginId(loginId) == 0;
    }

    @Override
    public boolean isEmailAvailable(String email) {
        validateEmailFormat(email);
        return userMapper.countByEmail(email) == 0;
    }

    @Override
    public boolean isNicknameAvailable(String nickname) {
        validateNicknameFormat(nickname);
        return userMapper.countByNickname(nickname) == 0;
    }

    @Override
    public void signup(SignupRequest request) {
        validateUsernameFormat(request.getLoginId());
        validateEmailFormat(request.getEmail());
        validateNicknameFormat(request.getNickname());

        if (!isLoginIdAvailable(request.getLoginId())) {
            throw new IllegalStateException("이미 사용 중인 아이디입니다.");
        }
        if (!isEmailAvailable(request.getEmail())) {
            throw new IllegalStateException("이미 가입중인 이메일입니다.");
        }
        if (!isNicknameAvailable(request.getNickname())) {
            throw new IllegalStateException("이미 사용중인 닉네임입니다.");
        }
        if (!emailVerificationService.isVerified(request.getEmail())) {
            throw new IllegalStateException("이메일 인증이 필요합니다.");
        }

        User user = new User();
        user.setLoginId(request.getLoginId());
        user.setPasswordHash(PasswordUtil.sha256(request.getPassword()));
        user.setEmail(request.getEmail());
        user.setNickname(request.getNickname());
        user.setSex(request.getSex());
        user.setBirthdate(validateBirthdate(request.getBirthdate()));
        user.setIsPregnant(request.getIsPregnant() != null ? request.getIsPregnant() : 0);
        user.setTel(request.getTel());

        userMapper.insertUser(user);

        // 신규 회원 가입 시 기본 식사 시간(평일 및 주말) 자동 등록
        User createdUser = userMapper.findByLoginId(request.getLoginId());
        if (createdUser != null && createdUser.getUserId() != null) {
            userMapper.upsertMealTime(createdUser.getUserId(), "WEEKDAY", "07:30", "12:00", "18:30", "22:00");
            userMapper.upsertMealTime(createdUser.getUserId(), "WEEKEND", "09:00", "13:00", "19:00", "23:00");
        }

        emailVerificationService.clearVerification(request.getEmail());
    }

    private void validateUsernameFormat(String loginId) {
        if (loginId == null || !USERNAME_PATTERN.matcher(loginId).matches()) {
            throw new IllegalArgumentException("아이디는 영문, 숫자 조합 6자 이상이어야 합니다.");
        }
    }

    private void validateEmailFormat(String email) {
        if (email == null || !EMAIL_PATTERN.matcher(email).matches()) {
            throw new IllegalArgumentException("올바른 이메일 형식이 아닙니다.");
        }
    }

    private void validateNicknameFormat(String nickname) {
        if (nickname == null || nickname.length() < NICKNAME_MIN_LENGTH || nickname.length() > NICKNAME_MAX_LENGTH) {
            throw new IllegalArgumentException("닉네임은 " + NICKNAME_MIN_LENGTH + "~" + NICKNAME_MAX_LENGTH + "자로 입력해 주세요.");
        }
    }

    private LocalDate validateBirthdate(String birthdate) {
        if (birthdate == null || birthdate.isBlank()) {
            throw new IllegalArgumentException("생년월일을 입력해 주세요.");
        }

        try {
            LocalDate parsedBirthdate = LocalDate.parse(birthdate);
            if (parsedBirthdate.isAfter(LocalDate.now())) {
                throw new IllegalArgumentException("생년월일은 오늘 이후 날짜로 입력할 수 없습니다.");
            }
            return parsedBirthdate;
        } catch (DateTimeException e) {
            throw new IllegalArgumentException("생년월일 형식이 올바르지 않습니다.");
        }
    }

    @Override
    public void withdraw(Long userId) {
        if (userId == null || userId <= 0L) {
            throw new IllegalArgumentException("유효하지 않은 회원 식별자입니다.");
        }
        if (userId.equals(1L)) {
            throw new IllegalStateException("체험용 계정은 탈퇴할 수 없습니다.");
        }

        User user = userMapper.findById(userId);
        if (user == null) {
            throw new IllegalArgumentException("존재하지 않는 회원입니다.");
        }
        if ("test12".equalsIgnoreCase(user.getLoginId()) || "demo".equalsIgnoreCase(user.getLoginId())) {
            throw new IllegalStateException("체험용 계정은 탈퇴할 수 없습니다.");
        }

        deleteUserAccount(userId);
    }

    @Override
    public void deleteUserAccount(Long userId) {
        if (userId == null || userId <= 0L) {
            throw new IllegalArgumentException("유효하지 않은 회원 식별자입니다.");
        }

        User user = userMapper.findById(userId);
        if (user == null) {
            return;
        }

        List<String> filesToDelete = new ArrayList<>();
        Connection conn = null;
        try {
            conn = dataSource.getConnection();
            conn.setAutoCommit(false);

            boolean isVirtual = "Y".equalsIgnoreCase(user.getIsVirtual());
            Long familyId = user.getFamilyId();

            // 실제 회원이고 가족에 속해 있는 경우: 가족에 다른 실제 회원이 없다면 가상 유저들과 가족 그룹 정리
            if (!isVirtual && familyId != null && familyId > 0L) {
                int otherRealMembers = 0;
                try (PreparedStatement ps = conn.prepareStatement(
                        "SELECT COUNT(*) FROM users WHERE family_id = ? AND NVL(is_virtual, 'N') = 'N' AND user_id != ?")) {
                    ps.setLong(1, familyId);
                    ps.setLong(2, userId);
                    try (ResultSet rs = ps.executeQuery()) {
                        if (rs.next()) {
                            otherRealMembers = rs.getInt(1);
                        }
                    }
                }

                if (otherRealMembers == 0) {
                    List<Long> virtualUserIds = new ArrayList<>();
                    try (PreparedStatement ps = conn.prepareStatement(
                            "SELECT user_id FROM users WHERE family_id = ? AND is_virtual = 'Y'")) {
                        ps.setLong(1, familyId);
                        try (ResultSet rs = ps.executeQuery()) {
                            while (rs.next()) {
                                virtualUserIds.add(rs.getLong("user_id"));
                            }
                        }
                    }

                    for (Long vId : virtualUserIds) {
                        deleteSingleUserData(conn, vId, filesToDelete);
                    }

                    // 가족 내 모든 사용자의 family_id 연결 해제 (FK_USERS_FAMILY 위배 방지)
                    try (PreparedStatement ps = conn.prepareStatement("UPDATE users SET family_id = NULL WHERE family_id = ?")) {
                        ps.setLong(1, familyId);
                        ps.executeUpdate();
                    }

                    try (PreparedStatement ps = conn.prepareStatement("DELETE FROM family_members WHERE family_id = ?")) {
                        ps.setLong(1, familyId);
                        ps.executeUpdate();
                    }
                    try (PreparedStatement ps = conn.prepareStatement("DELETE FROM families WHERE family_id = ?")) {
                        ps.setLong(1, familyId);
                        ps.executeUpdate();
                    }
                }
            }

            // 본인 데이터 삭제
            deleteSingleUserData(conn, userId, filesToDelete);

            conn.commit();

            // 트랜잭션 커밋 완료 후 물리 파일 일괄 삭제
            for (String fPath : filesToDelete) {
                if (fPath != null && !fPath.isBlank()) {
                    try {
                        Files.deleteIfExists(Path.of(fPath));
                    } catch (Exception ignored) {}
                }
            }

        } catch (Exception e) {
            if (conn != null) {
                try { conn.rollback(); } catch (Exception ignored) {}
            }
            throw new RuntimeException("회원 계정 데이터 삭제 중 오류가 발생했습니다: " + e.getMessage(), e);
        } finally {
            if (conn != null) {
                try { conn.close(); } catch (Exception ignored) {}
            }
        }
    }

    private void deleteSingleUserData(Connection conn, Long targetId, List<String> filesToDelete) throws Exception {
        // 0. 삭제 전 물리 파일 경로 수집 (처방전 이미지, 커뮤니티 첨부파일, 프로필 이미지)
        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT prescription_image_url FROM prescriptions WHERE user_id = ?")) {
            ps.setLong(1, targetId);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    String url = rs.getString(1);
                    if (url != null && url.startsWith("/uploads/prescriptions/") && !url.contains("default")) {
                        String fileName = url.substring(url.lastIndexOf("/") + 1);
                        filesToDelete.add(System.getProperty("user.home") + File.separator + ".jette_yak" + File.separator + "uploads" + File.separator + "prescriptions" + File.separator + fileName);
                    }
                }
            }
        }

        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT stored_name FROM community_attachments WHERE uploader_id = ? OR post_id IN (SELECT post_id FROM community_posts WHERE user_id = ?)")) {
            ps.setLong(1, targetId);
            ps.setLong(2, targetId);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    String storedName = rs.getString(1);
                    if (storedName != null && !storedName.isBlank()) {
                        filesToDelete.add(System.getProperty("user.home") + File.separator + ".jette_yak" + File.separator + "uploads" + File.separator + "community" + File.separator + storedName);
                    }
                }
            }
        }

        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT profile_image_url FROM users WHERE user_id = ?")) {
            ps.setLong(1, targetId);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    String pUrl = rs.getString(1);
                    if (pUrl != null && !pUrl.isBlank()) {
                        filesToDelete.add(System.getProperty("user.home") + File.separator + ".jette_yak" + File.separator + "uploads" + File.separator + "profiles" + File.separator + Path.of(pUrl).getFileName().toString());
                    }
                }
            }
        }

        // 1. 맞춤 식사 시간 삭제 (USER_MEAL_TIMES - FK_MEAL_TIMES_USER)
        try (PreparedStatement ps = conn.prepareStatement("DELETE FROM user_meal_times WHERE user_id = ?")) {
            ps.setLong(1, targetId);
            ps.executeUpdate();
        }

        // 2. 처방전 세부 약품 항목 삭제 (2단계 자식)
        try (PreparedStatement ps = conn.prepareStatement(
                "DELETE FROM prescription_items WHERE prescription_id IN (SELECT prescription_id FROM prescriptions WHERE user_id = ?)")) {
            ps.setLong(1, targetId);
            ps.executeUpdate();
        }

        // 3. 복약 일정 삭제
        try (PreparedStatement ps = conn.prepareStatement("DELETE FROM schedules WHERE user_id = ?")) {
            ps.setLong(1, targetId);
            ps.executeUpdate();
        }

        // 4. 처방전 마스터 삭제
        try (PreparedStatement ps = conn.prepareStatement("DELETE FROM prescriptions WHERE user_id = ?")) {
            ps.setLong(1, targetId);
            ps.executeUpdate();
        }

        // 5. 보관함 상시약 삭제 (FK_CABINET_USER NO ACTION)
        try (PreparedStatement ps = conn.prepareStatement("DELETE FROM cabinet_medications WHERE user_id = ?")) {
            ps.setLong(1, targetId);
            ps.executeUpdate();
        }

        // 6. 영양제/루틴 약 삭제
        try (PreparedStatement ps = conn.prepareStatement("DELETE FROM routine_medications WHERE user_id = ?")) {
            ps.setLong(1, targetId);
            ps.executeUpdate();
        }

        // 7. 복약 상태 관리 삭제
        try (PreparedStatement ps = conn.prepareStatement("DELETE FROM medication_use_states WHERE user_id = ?")) {
            ps.setLong(1, targetId);
            ps.executeUpdate();
        }

        // 8. AI 종합 복약 가이드 캐시 삭제
        try (PreparedStatement ps = conn.prepareStatement("DELETE FROM medication_overall_guide WHERE user_id = ?")) {
            ps.setLong(1, targetId);
            ps.executeUpdate();
        }

        // 9. 챗봇 대화 메시지 및 대화방 삭제
        try (PreparedStatement ps = conn.prepareStatement(
                "DELETE FROM chat_messages WHERE conversation_id IN (SELECT conversation_id FROM chat_conversations WHERE user_id = ?)")) {
            ps.setLong(1, targetId);
            ps.executeUpdate();
        }
        try (PreparedStatement ps = conn.prepareStatement("DELETE FROM chat_conversations WHERE user_id = ?")) {
            ps.setLong(1, targetId);
            ps.executeUpdate();
        }

        // 10. 커뮤니티 데이터 삭제
        // 10-1. 사용자 알림 삭제
        try (PreparedStatement ps = conn.prepareStatement(
                "DELETE FROM user_notifications WHERE user_id = ? OR actor_id = ? OR post_id IN (SELECT post_id FROM community_posts WHERE user_id = ?)")) {
            ps.setLong(1, targetId);
            ps.setLong(2, targetId);
            ps.setLong(3, targetId);
            ps.executeUpdate();
        }

        // 10-2. 댓글 좋아요 삭제
        try (PreparedStatement ps = conn.prepareStatement(
                "DELETE FROM community_comment_helpful WHERE user_id = ? OR comment_id IN (" +
                "  SELECT comment_id FROM community_comments WHERE user_id = ? OR post_id IN (SELECT post_id FROM community_posts WHERE user_id = ?))")) {
            ps.setLong(1, targetId);
            ps.setLong(2, targetId);
            ps.setLong(3, targetId);
            ps.executeUpdate();
        }

        // 10-3. 첨부파일 삭제
        try (PreparedStatement ps = conn.prepareStatement(
                "DELETE FROM community_attachments WHERE uploader_id = ? OR post_id IN (SELECT post_id FROM community_posts WHERE user_id = ?)")) {
            ps.setLong(1, targetId);
            ps.setLong(2, targetId);
            ps.executeUpdate();
        }

        // 10-4. 게시글 도움돼요(추천) 삭제
        try (PreparedStatement ps = conn.prepareStatement(
                "DELETE FROM community_post_helpful WHERE user_id = ? OR post_id IN (SELECT post_id FROM community_posts WHERE user_id = ?)")) {
            ps.setLong(1, targetId);
            ps.setLong(2, targetId);
            ps.executeUpdate();
        }

        // 10-5. 신고 내역 삭제 및 관리자 처리 해제
        try (PreparedStatement ps = conn.prepareStatement(
                "DELETE FROM community_reports WHERE reporter_id = ? OR (target_type = 'POST' AND target_id IN (SELECT post_id FROM community_posts WHERE user_id = ?)) " +
                "OR (target_type = 'COMMENT' AND target_id IN (SELECT comment_id FROM community_comments WHERE user_id = ? OR post_id IN (SELECT post_id FROM community_posts WHERE user_id = ?)))")) {
            ps.setLong(1, targetId);
            ps.setLong(2, targetId);
            ps.setLong(3, targetId);
            ps.setLong(4, targetId);
            ps.executeUpdate();
        }
        try (PreparedStatement ps = conn.prepareStatement(
                "UPDATE community_reports SET resolved_by = NULL WHERE resolved_by = ?")) {
            ps.setLong(1, targetId);
            ps.executeUpdate();
        }

        // 10-6. 대댓글 부모 참조 해제 후 댓글 삭제
        try (PreparedStatement ps = conn.prepareStatement(
                "UPDATE community_comments SET parent_comment_id = NULL WHERE post_id IN (SELECT post_id FROM community_posts WHERE user_id = ?) OR user_id = ?")) {
            ps.setLong(1, targetId);
            ps.setLong(2, targetId);
            ps.executeUpdate();
        }
        try (PreparedStatement ps = conn.prepareStatement(
                "DELETE FROM community_comments WHERE user_id = ? OR post_id IN (SELECT post_id FROM community_posts WHERE user_id = ?)")) {
            ps.setLong(1, targetId);
            ps.setLong(2, targetId);
            ps.executeUpdate();
        }

        // 10-7. 게시글 삭제 및 관리자 참조 해제
        try (PreparedStatement ps = conn.prepareStatement(
                "UPDATE community_posts SET moderated_by = NULL WHERE moderated_by = ?")) {
            ps.setLong(1, targetId);
            ps.executeUpdate();
        }
        try (PreparedStatement ps = conn.prepareStatement(
                "DELETE FROM community_posts WHERE user_id = ?")) {
            ps.setLong(1, targetId);
            ps.executeUpdate();
        }

        // 11. 가족 연동 데이터 정리
        // 11-1. 초대장 삭제 (내가 발송했거나 수신한 초대장)
        try (PreparedStatement ps = conn.prepareStatement(
                "DELETE FROM family_invitations WHERE sender_id = ? OR receiver_id = ?")) {
            ps.setLong(1, targetId);
            ps.setLong(2, targetId);
            ps.executeUpdate();
        }

        // 11-2. 가족 구성원 매핑 해제 (FK_FM_USER NO ACTION)
        try (PreparedStatement ps = conn.prepareStatement(
                "DELETE FROM family_members WHERE user_id = ?")) {
            ps.setLong(1, targetId);
            ps.executeUpdate();
        }

        // 12. 유저 본인 레코드 삭제
        try (PreparedStatement ps = conn.prepareStatement("DELETE FROM users WHERE user_id = ?")) {
            ps.setLong(1, targetId);
            ps.executeUpdate();
        }
    }
}
