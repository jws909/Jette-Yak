package com.app.service;

import com.app.domain.User;
import com.app.dto.SignupRequest;
import com.app.mapper.UserMapper;
import com.app.util.PasswordUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import javax.sql.DataSource;
import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
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
        user.setBirthdate(LocalDate.parse(request.getBirthdate())); // "yyyy-MM-dd"
        user.setIsPregnant(request.getIsPregnant() != null ? request.getIsPregnant() : 0);
        user.setTel(request.getTel());

        userMapper.insertUser(user);

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

        List<String> filesToDelete = new ArrayList<>();
        Connection conn = null;
        try {
            conn = dataSource.getConnection();
            conn.setAutoCommit(false);

            // 0. 삭제 전 물리 파일 경로 수집 (처방전 이미지 & 커뮤니티 첨부파일)
            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT prescription_image_url FROM prescriptions WHERE user_id = ?")) {
                ps.setLong(1, userId);
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
                ps.setLong(1, userId);
                ps.setLong(2, userId);
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) {
                        String storedName = rs.getString(1);
                        if (storedName != null && !storedName.isBlank()) {
                            filesToDelete.add(System.getProperty("user.home") + File.separator + ".jette_yak" + File.separator + "uploads" + File.separator + "community" + File.separator + storedName);
                        }
                    }
                }
            }

            // 1. 처방전 세부 약품 항목 삭제 (2단계 자식)
            try (PreparedStatement ps = conn.prepareStatement(
                    "DELETE FROM prescription_items WHERE prescription_id IN (SELECT prescription_id FROM prescriptions WHERE user_id = ?)")) {
                ps.setLong(1, userId);
                ps.executeUpdate();
            }

            // 2. 복약 일정 삭제
            try (PreparedStatement ps = conn.prepareStatement(
                    "DELETE FROM schedules WHERE user_id = ?")) {
                ps.setLong(1, userId);
                ps.executeUpdate();
            }

            // 3. 처방전 마스터 삭제
            try (PreparedStatement ps = conn.prepareStatement(
                    "DELETE FROM prescriptions WHERE user_id = ?")) {
                ps.setLong(1, userId);
                ps.executeUpdate();
            }

            // 4. 보관함 상시약 삭제
            try (PreparedStatement ps = conn.prepareStatement(
                    "DELETE FROM cabinet_medications WHERE user_id = ?")) {
                ps.setLong(1, userId);
                ps.executeUpdate();
            }

            // 5. 영양제/루틴 약 삭제
            try (PreparedStatement ps = conn.prepareStatement(
                    "DELETE FROM routine_medications WHERE user_id = ?")) {
                ps.setLong(1, userId);
                ps.executeUpdate();
            }

            // 6. 복약 상태 관리 삭제
            try (PreparedStatement ps = conn.prepareStatement(
                    "DELETE FROM medication_use_states WHERE user_id = ?")) {
                ps.setLong(1, userId);
                ps.executeUpdate();
            }

            // 7. AI 종합 복약 가이드 캐시 삭제
            try (PreparedStatement ps = conn.prepareStatement(
                    "DELETE FROM medication_overall_guide WHERE user_id = ?")) {
                ps.setLong(1, userId);
                ps.executeUpdate();
            }

            // 8. 커뮤니티 데이터 삭제
            // 8-1. 첨부파일 삭제
            try (PreparedStatement ps = conn.prepareStatement(
                    "DELETE FROM community_attachments WHERE uploader_id = ? OR post_id IN (SELECT post_id FROM community_posts WHERE user_id = ?)")) {
                ps.setLong(1, userId);
                ps.setLong(2, userId);
                ps.executeUpdate();
            }

            // 8-2. 댓글 삭제
            try (PreparedStatement ps = conn.prepareStatement(
                    "DELETE FROM community_comments WHERE user_id = ? OR post_id IN (SELECT post_id FROM community_posts WHERE user_id = ?)")) {
                ps.setLong(1, userId);
                ps.setLong(2, userId);
                ps.executeUpdate();
            }

            // 8-3. 도움돼요(추천) 삭제
            try (PreparedStatement ps = conn.prepareStatement(
                    "DELETE FROM community_post_helpful WHERE user_id = ? OR post_id IN (SELECT post_id FROM community_posts WHERE user_id = ?)")) {
                ps.setLong(1, userId);
                ps.setLong(2, userId);
                ps.executeUpdate();
            }

            // 8-4. 신고 내역 삭제 및 관리자 참조 해제
            try (PreparedStatement ps = conn.prepareStatement(
                    "DELETE FROM community_reports WHERE reporter_id = ? OR (target_type = 'POST' AND target_id IN (SELECT post_id FROM community_posts WHERE user_id = ?))")) {
                ps.setLong(1, userId);
                ps.setLong(2, userId);
                ps.executeUpdate();
            }
            try (PreparedStatement ps = conn.prepareStatement(
                    "UPDATE community_reports SET resolved_by = NULL WHERE resolved_by = ?")) {
                ps.setLong(1, userId);
                ps.executeUpdate();
            }

            // 8-5. 게시글 삭제 및 관리자 참조 해제
            try (PreparedStatement ps = conn.prepareStatement(
                    "UPDATE community_posts SET moderated_by = NULL WHERE moderated_by = ?")) {
                ps.setLong(1, userId);
                ps.executeUpdate();
            }
            try (PreparedStatement ps = conn.prepareStatement(
                    "DELETE FROM community_posts WHERE user_id = ?")) {
                ps.setLong(1, userId);
                ps.executeUpdate();
            }

            // 9. 가족 연동 데이터 정리
            // 9-1. 초대장 삭제 (내가 발송했거나 수신한 초대장)
            try (PreparedStatement ps = conn.prepareStatement(
                    "DELETE FROM family_invitations WHERE sender_id = ? OR receiver_id = ?")) {
                ps.setLong(1, userId);
                ps.setLong(2, userId);
                ps.executeUpdate();
            }

            // 9-2. 가족 구성원 매핑 해제
            try (PreparedStatement ps = conn.prepareStatement(
                    "DELETE FROM family_members WHERE user_id = ?")) {
                ps.setLong(1, userId);
                ps.executeUpdate();
            }

            // 9-3. 가족 그룹 확인 및 정리
            Long familyId = null;
            try (PreparedStatement ps = conn.prepareStatement("SELECT family_id FROM users WHERE user_id = ?")) {
                ps.setLong(1, userId);
                try (ResultSet rs = ps.executeQuery()) {
                    if (rs.next()) {
                        long fid = rs.getLong("family_id");
                        if (!rs.wasNull() && fid > 0) {
                            familyId = fid;
                        }
                    }
                }
            }

            if (familyId != null) {
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
                        try (PreparedStatement ps = conn.prepareStatement(
                                "DELETE FROM prescription_items WHERE prescription_id IN (SELECT prescription_id FROM prescriptions WHERE user_id = ?)")) {
                            ps.setLong(1, vId);
                            ps.executeUpdate();
                        }
                        try (PreparedStatement ps = conn.prepareStatement("DELETE FROM schedules WHERE user_id = ?")) {
                            ps.setLong(1, vId);
                            ps.executeUpdate();
                        }
                        try (PreparedStatement ps = conn.prepareStatement("DELETE FROM prescriptions WHERE user_id = ?")) {
                            ps.setLong(1, vId);
                            ps.executeUpdate();
                        }
                        try (PreparedStatement ps = conn.prepareStatement("DELETE FROM cabinet_medications WHERE user_id = ?")) {
                            ps.setLong(1, vId);
                            ps.executeUpdate();
                        }
                        try (PreparedStatement ps = conn.prepareStatement("DELETE FROM routine_medications WHERE user_id = ?")) {
                            ps.setLong(1, vId);
                            ps.executeUpdate();
                        }
                        try (PreparedStatement ps = conn.prepareStatement("DELETE FROM medication_use_states WHERE user_id = ?")) {
                            ps.setLong(1, vId);
                            ps.executeUpdate();
                        }
                        try (PreparedStatement ps = conn.prepareStatement("DELETE FROM medication_overall_guide WHERE user_id = ?")) {
                            ps.setLong(1, vId);
                            ps.executeUpdate();
                        }
                    }

                    try (PreparedStatement ps = conn.prepareStatement("DELETE FROM family_members WHERE family_id = ?")) {
                        ps.setLong(1, familyId);
                        ps.executeUpdate();
                    }
                    try (PreparedStatement ps = conn.prepareStatement("DELETE FROM users WHERE family_id = ? AND is_virtual = 'Y'")) {
                        ps.setLong(1, familyId);
                        ps.executeUpdate();
                    }
                    try (PreparedStatement ps = conn.prepareStatement("DELETE FROM families WHERE family_id = ?")) {
                        ps.setLong(1, familyId);
                        ps.executeUpdate();
                    }
                }
            }

            // 10. 유저 본인 레코드 삭제
            try (PreparedStatement ps = conn.prepareStatement("DELETE FROM users WHERE user_id = ?")) {
                ps.setLong(1, userId);
                ps.executeUpdate();
            }

            conn.commit();

            // 11. 로컬 프로필 이미지 및 수집된 물리 파일 삭제
            if (user.getProfileImageUrl() != null && !user.getProfileImageUrl().isBlank()) {
                filesToDelete.add(System.getProperty("user.home") + File.separator + ".jette_yak" + File.separator + "uploads" + File.separator + "profiles" + File.separator + Path.of(user.getProfileImageUrl()).getFileName().toString());
            }
            for (String fPath : filesToDelete) {
                try {
                    Files.deleteIfExists(Path.of(fPath));
                } catch (Exception ignored) {}
            }

        } catch (Exception e) {
            if (conn != null) {
                try { conn.rollback(); } catch (Exception ignored) {}
            }
            throw new RuntimeException("회원 탈퇴 처리 중 오류가 발생했습니다: " + e.getMessage(), e);
        } finally {
            if (conn != null) {
                try { conn.close(); } catch (Exception ignored) {}
            }
        }
    }
}
