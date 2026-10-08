package com.app.controller;

import com.app.dto.SignupRequest;
import com.app.domain.User;
import com.app.mapper.UserMapper;
import com.app.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.List;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Collections;
import javax.sql.DataSource;

/**
 * 회원가입 / 중복확인 컨트롤러 (DB 연동 + 형식 검증 버전).
 */
@RestController
@RequestMapping("/api/users")
public class UserController {
    @Autowired
    private com.app.util.UserAccess userAccess;


    @Autowired
    private UserService userService;

    @Autowired
    private UserMapper userMapper;

    @Autowired
    @Qualifier("data_source")
    private DataSource dataSource;

    @Autowired(required = false)
    private com.app.dao.ScheduleDAO scheduleDAO;

    @Autowired(required = false)
    private com.app.guide.dao.MedicationGuideDao medicationGuideDao;

    @Autowired(required = false)
    private com.app.chatbot.client.GeminiService geminiService;

    @Autowired(required = false)
    private com.app.chatbot.client.SupplementRuleBook supplementRuleBook;

    @Autowired
    private com.app.service.EverydayMedicationService everydayMedicationService;

    @GetMapping(value = "/check-username", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, Object>> checkUsername(@RequestParam("value") String value) {
        try {
            boolean available = userService.isLoginIdAvailable(value);
            return ResponseEntity.ok(Map.of("available", available));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("available", false, "message", e.getMessage()));
        }
    }

    @GetMapping(value = "/check-email", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, Object>> checkEmail(@RequestParam("value") String value) {
        try {
            boolean available = userService.isEmailAvailable(value);
            return ResponseEntity.ok(Map.of("available", available));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("available", false, "message", e.getMessage()));
        }
    }

    @GetMapping(value = "/check-nickname", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, Object>> checkNickname(@RequestParam("value") String value) {
        try {
            boolean available = userService.isNicknameAvailable(value);
            return ResponseEntity.ok(Map.of("available", available));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("available", false, "message", e.getMessage()));
        }
    }

    @PostMapping(value = "/signup", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, String>> signup(@RequestBody SignupRequest request) {
        try {
            userService.signup(request);
            return ResponseEntity.ok(Map.of("message", "회원가입이 완료되었습니다."));
        } catch (IllegalArgumentException e) {
            // 형식 오류 (아이디/이메일/닉네임 규칙 위반)
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        } catch (IllegalStateException e) {
            // 아이디/이메일/닉네임 중복, 이메일 미인증
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("message", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("message", "회원가입 처리 중 오류가 발생했습니다."));
        }
    }

    @GetMapping(value = "/profile", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> getProfile(@RequestParam("username") String username, javax.servlet.http.HttpServletRequest httpRequest) {
        long currentUserId = userAccess.selfUser(httpRequest, null, username);
        User user = userMapper.findById(currentUserId);
        if (user == null) return ResponseEntity.notFound().build();
        boolean authenticatedAsUser = true;
        Map<String, Object> response = new HashMap<>();
        response.put("userId", user.getUserId());
        response.put("username", user.getLoginId());
        response.put("nickname", user.getNickname());
        response.put("email", user.getEmail() != null ? user.getEmail() : "");
        response.put("sex", user.getSex() != null ? user.getSex() : "");
        // 본인 인증이 확인된 프로필만 생년월일 전달; 다른 계정의 읽기 설정 조회에 노출하지 않음
        response.put("birthdate", authenticatedAsUser && user.getBirthdate() != null ? user.getBirthdate().toString() : null);
        response.put("isPregnant", user.getIsPregnant() == null ? 0 : user.getIsPregnant());
        response.put("familyId", user.getFamilyId());
        response.put("profileImageUrl", profileImagePath(user));
        response.put("pushEnabled", user.getPushEnabled() == null ? 1 : user.getPushEnabled());
        response.put("role", user.getRole() == null ? "USER" : user.getRole());
        response.put("isAdmin", authenticatedAsUser && Integer.valueOf(1).equals(user.getIsAdmin()));
        response.put("breakfastTime", user.getBreakfastTime() != null ? user.getBreakfastTime() : "07:30");
        response.put("lunchTime", user.getLunchTime() != null ? user.getLunchTime() : "12:00");
        response.put("dinnerTime", user.getDinnerTime() != null ? user.getDinnerTime() : "18:30");
        response.put("bedtime", user.getBedtime() != null ? user.getBedtime() : "22:00");
        return ResponseEntity.ok(response);
    }

    /**
     * 마이페이지 비밀번호 변경 API
     * POST /api/users/change-password
     */
    @PostMapping(value = "/change-password", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> changePassword(
            @RequestBody Map<String, String> body,
            javax.servlet.http.HttpServletRequest httpRequest) {
        String currentPassword = body.get("currentPassword");
        String newPassword = body.get("newPassword");
        String confirmPassword = body.get("confirmPassword");
        String username = body.get("username");
        String userIdStr = body.get("userId");

        Long userId = null;
        if (userIdStr != null && !userIdStr.isBlank()) {
            try {
                userId = Long.valueOf(userIdStr.trim());
            } catch (Exception ignored) {}
        }

        Long resolvedUserId = resolveSelfUserId(userId, username, httpRequest);
        User user = null;
        if (resolvedUserId != null && resolvedUserId > 0L) {
            user = userMapper.findById(resolvedUserId);
        } else if (username != null && !username.isBlank()) {
            user = userMapper.findByLoginId(username.trim());
        }

        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("success", false, "message", "로그인이 필요하거나 사용자를 찾을 수 없습니다."));
        }

        if ("demo".equalsIgnoreCase(user.getLoginId()) || "test12".equalsIgnoreCase(user.getLoginId())) {
            return ResponseEntity.badRequest()
                    .body(Map.of("success", false, "message", "체험용 계정은 비밀번호를 변경할 수 없습니다."));
        }

        if (currentPassword == null || currentPassword.isBlank() ||
            newPassword == null || newPassword.isBlank()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("success", false, "message", "현재 비밀번호와 새 비밀번호를 모두 입력해 주세요."));
        }

        if (confirmPassword != null && !confirmPassword.isBlank() && !newPassword.equals(confirmPassword)) {
            return ResponseEntity.badRequest()
                    .body(Map.of("success", false, "message", "새 비밀번호가 일치하지 않습니다."));
        }

        if (newPassword.length() < 8) {
            return ResponseEntity.badRequest()
                    .body(Map.of("success", false, "message", "새 비밀번호는 8자 이상이어야 합니다."));
        }

        String currentHash = com.app.util.PasswordUtil.sha256(currentPassword);
        if (!currentHash.equals(user.getPasswordHash())) {
            return ResponseEntity.badRequest()
                    .body(Map.of("success", false, "message", "현재 비밀번호가 일치하지 않습니다."));
        }

        if (currentPassword.equals(newPassword)) {
            return ResponseEntity.badRequest()
                    .body(Map.of("success", false, "message", "새 비밀번호는 현재 비밀번호와 다르게 설정해 주세요."));
        }

        String newHash = com.app.util.PasswordUtil.sha256(newPassword);
        userMapper.updatePasswordHash(user.getLoginId(), newHash);

        return ResponseEntity.ok(Map.of("success", true, "message", "비밀번호가 성공적으로 변경되었습니다."));
    }

    /**
     * 알림 설정 조회 API
     * GET /api/users/push-settings
     */
    @GetMapping(value = "/push-settings", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> getPushSettings(
            @RequestParam(value = "userId", required = false) Long userId,
            @RequestParam(value = "username", required = false) String username,
            javax.servlet.http.HttpServletRequest httpRequest) {
        Long resolvedUserId = resolveSelfUserId(userId, username, httpRequest);
        User user = null;
        if (resolvedUserId != null && resolvedUserId > 0L) {
            user = userMapper.findById(resolvedUserId);
        } else if (username != null && !username.isBlank()) {
            String target = "demo".equalsIgnoreCase(username.trim()) ? "test12" : username.trim();
            user = userMapper.findByLoginId(target);
        }
        int pushEnabled = (user != null && user.getPushEnabled() != null) ? user.getPushEnabled() : 1;
        return ResponseEntity.ok(Map.of("success", true, "pushEnabled", pushEnabled));
    }

    /**
     * 알림 설정 저장 API
     * POST /api/users/push-settings
     */
    @PostMapping(value = "/push-settings", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> updatePushSettings(
            @RequestBody Map<String, Object> body,
            javax.servlet.http.HttpServletRequest httpRequest) {
        Long userId = null;
        if (body.get("userId") != null) {
            try {
                String s = body.get("userId").toString().trim();
                if (!s.isEmpty()) {
                    userId = Long.valueOf(s);
                }
            } catch (NumberFormatException ignored) {}
        }
        String username = body.get("username") == null ? null : body.get("username").toString().trim();
        Object enabledValue = body.get("pushEnabled");
        if (enabledValue == null) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", "알림 설정 정보를 확인해 주세요."));
        }

        Long resolvedUserId = resolveSelfUserId(userId, username, httpRequest);
        String resolvedLoginId = null;
        if (username != null && !username.isBlank()) {
            resolvedLoginId = "demo".equalsIgnoreCase(username) ? "test12" : username;
        }

        if ((resolvedUserId == null || resolvedUserId <= 0L) && (resolvedLoginId == null || resolvedLoginId.isBlank())) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "로그인이 필요합니다."));
        }

        boolean enabled = enabledValue instanceof Boolean
                ? (Boolean) enabledValue
                : "true".equalsIgnoreCase(enabledValue.toString()) || "1".equals(enabledValue.toString());
        int pushVal = enabled ? 1 : 0;

        try {
            int updated = userMapper.updatePushEnabled(resolvedUserId, resolvedLoginId, pushVal);
            if (updated == 0) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("success", false, "message", "사용자를 찾을 수 없습니다."));
            }

            if (httpRequest != null) {
                var session = httpRequest.getSession(false);
                if (session != null) {
                    session.setAttribute("pushEnabled", pushVal);
                }
            }

            return ResponseEntity.ok(Map.of(
                    "success", true,
                    "pushEnabled", pushVal,
                    "message", "알림 설정이 저장되었습니다."
            ));
        } catch (Exception e) {
            org.apache.logging.log4j.LogManager.getLogger(getClass()).error("알림 설정 저장 실패: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("success", false, "message", "알림 설정 저장 중 DB 오류가 발생했습니다."));
        }
    }

    /**
     * 사용자별 기준 식사/취침 시간 조회 API
     * GET /api/users/meal-times?userId=1 또는 ?username=demo
     */
    @GetMapping(value = "/meal-times", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> getMealTimes(
            @RequestParam(value = "userId", required = false) Long userId,
            @RequestParam(value = "username", required = false) String username,
            @RequestParam(value = "date", required = false) String date,
            javax.servlet.http.HttpServletRequest httpRequest) {
        Long resolvedUserId = resolveUserId(userId, username, httpRequest);
        User user = null;
        if (resolvedUserId != null && resolvedUserId > 0L) {
            user = userMapper.findById(resolvedUserId);
        } else if (username != null && !username.isBlank()) {
            user = userMapper.findByLoginId(username);
        }

        Long uid = user != null ? user.getUserId() : (resolvedUserId != null ? resolvedUserId : null);

        com.app.domain.UserMealTime weekdayMeal = null;
        com.app.domain.UserMealTime weekendMeal = null;

        if (uid != null && uid > 0L) {
            List<com.app.domain.UserMealTime> list = userMapper.findMealTimesByUserId(uid);
            if (list != null) {
                for (var m : list) {
                    if ("WEEKDAY".equalsIgnoreCase(m.getDayType())) weekdayMeal = m;
                    else if ("WEEKEND".equalsIgnoreCase(m.getDayType())) weekendMeal = m;
                }
            }
        }

        String wkB = weekdayMeal != null ? weekdayMeal.getBreakfastTime() : (user != null && user.getBreakfastTime() != null ? user.getBreakfastTime() : "07:30");
        String wkL = weekdayMeal != null ? weekdayMeal.getLunchTime() : (user != null && user.getLunchTime() != null ? user.getLunchTime() : "12:00");
        String wkD = weekdayMeal != null ? weekdayMeal.getDinnerTime() : (user != null && user.getDinnerTime() != null ? user.getDinnerTime() : "18:30");
        String wkBed = weekdayMeal != null ? weekdayMeal.getBedtime() : (user != null && user.getBedtime() != null ? user.getBedtime() : "22:00");

        String weB = weekendMeal != null ? weekendMeal.getBreakfastTime() : "09:00";
        String weL = weekendMeal != null ? weekendMeal.getLunchTime() : "13:00";
        String weD = weekendMeal != null ? weekendMeal.getDinnerTime() : "19:00";
        String weBed = weekendMeal != null ? weekendMeal.getBedtime() : "23:00";

        // 날짜(date)가 주어지면 해당 날짜(평일 vs 주말)에 맞추어 최상위 시간 결정
        boolean isWeekend = false;
        if (date != null && !date.trim().isEmpty()) {
            try {
                java.time.LocalDate d = java.time.LocalDate.parse(date.trim());
                isWeekend = (d.getDayOfWeek() == java.time.DayOfWeek.SATURDAY || d.getDayOfWeek() == java.time.DayOfWeek.SUNDAY);
            } catch (Exception ignored) {}
        } else {
            java.time.DayOfWeek todayDow = java.time.LocalDate.now().getDayOfWeek();
            isWeekend = (todayDow == java.time.DayOfWeek.SATURDAY || todayDow == java.time.DayOfWeek.SUNDAY);
        }

        String curB = isWeekend ? weB : wkB;
        String curL = isWeekend ? weL : wkL;
        String curD = isWeekend ? weD : wkD;
        String curBed = isWeekend ? weBed : wkBed;

        Map<String, Object> weekdayMap = new HashMap<>();
        weekdayMap.put("breakfastTime", wkB);
        weekdayMap.put("lunchTime", wkL);
        weekdayMap.put("dinnerTime", wkD);
        weekdayMap.put("bedtime", wkBed);

        Map<String, Object> weekendMap = new HashMap<>();
        weekendMap.put("breakfastTime", weB);
        weekendMap.put("lunchTime", weL);
        weekendMap.put("dinnerTime", weD);
        weekendMap.put("bedtime", weBed);

        Map<String, Object> res = new HashMap<>();
        res.put("success", true);
        res.put("userId", uid);
        res.put("username", user != null ? user.getLoginId() : username);
        res.put("isWeekend", isWeekend);
        res.put("breakfastTime", curB);
        res.put("lunchTime", curL);
        res.put("dinnerTime", curD);
        res.put("bedtime", curBed);
        res.put("weekday", weekdayMap);
        res.put("weekend", weekendMap);
        return ResponseEntity.ok(res);
    }

    /**
     * 사용자별 기준 식사/취침 시간 저장 API (평일/주말 개별 또는 일괄 저장)
     * POST /api/users/meal-times
     */
    @PostMapping(value = "/meal-times", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> updateMealTimes(
            @RequestBody Map<String, Object> body,
            javax.servlet.http.HttpServletRequest httpRequest) {
        Long userId = null;
        if (body.get("userId") != null) {
            try {
                String s = body.get("userId").toString().trim();
                if (!s.isEmpty() && !"null".equalsIgnoreCase(s) && !"undefined".equalsIgnoreCase(s)) {
                    userId = Long.valueOf(s);
                }
            } catch (NumberFormatException ignored) {}
        }
        String username = body.get("username") != null ? body.get("username").toString().trim() : null;
        Long resolvedUserId = resolveUserId(userId, username, httpRequest);

        if ((resolvedUserId == null || resolvedUserId <= 0L) && (username == null || username.isBlank())) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "로그인이 필요합니다."));
        }
        if (resolvedUserId == null || resolvedUserId <= 0L) {
            User u = userMapper.findByLoginId(username);
            if (u != null) resolvedUserId = u.getUserId();
        }

        String timeRegex = "^([01]?[0-9]|2[0-3]):[0-5][0-9]$";

        // Case 1: body에 weekday 및 weekend 객체가 함께 전송된 경우 (신규 모달)
        if (body.get("weekday") instanceof Map<?, ?> wkMap && body.get("weekend") instanceof Map<?, ?> weMap) {
            String wkB = parseTimeStr(wkMap.get("breakfastTime") != null ? wkMap.get("breakfastTime") : wkMap.get("breakfast"), "07:30");
            String wkL = parseTimeStr(wkMap.get("lunchTime") != null ? wkMap.get("lunchTime") : wkMap.get("lunch"), "12:00");
            String wkD = parseTimeStr(wkMap.get("dinnerTime") != null ? wkMap.get("dinnerTime") : wkMap.get("dinner"), "18:30");
            String wkBed = parseTimeStr(wkMap.get("bedtime"), "22:00");

            String weB = parseTimeStr(weMap.get("breakfastTime") != null ? weMap.get("breakfastTime") : weMap.get("breakfast"), "09:00");
            String weL = parseTimeStr(weMap.get("lunchTime") != null ? weMap.get("lunchTime") : weMap.get("lunch"), "13:00");
            String weD = parseTimeStr(weMap.get("dinnerTime") != null ? weMap.get("dinnerTime") : weMap.get("dinner"), "19:00");
            String weBed = parseTimeStr(weMap.get("bedtime"), "23:00");

            userMapper.upsertMealTime(resolvedUserId, "WEEKDAY", wkB, wkL, wkD, wkBed);
            userMapper.upsertMealTime(resolvedUserId, "WEEKEND", weB, weL, weD, weBed);

            Map<String, Object> res = new HashMap<>();
            res.put("success", true);
            res.put("message", "평일 및 주말 식사 기준 시간이 성공적으로 저장되었습니다.");
            res.put("userId", resolvedUserId);
            res.put("weekday", Map.of("breakfastTime", wkB, "lunchTime", wkL, "dinnerTime", wkD, "bedtime", wkBed));
            res.put("weekend", Map.of("breakfastTime", weB, "lunchTime", weL, "dinnerTime", weD, "bedtime", weBed));
            return ResponseEntity.ok(res);
        }

        // Case 2: 단일 dayType 업데이트 (WEEKDAY 또는 WEEKEND)
        String dayType = body.get("dayType") != null ? body.get("dayType").toString().trim().toUpperCase() : "WEEKDAY";
        if (!"WEEKEND".equals(dayType)) dayType = "WEEKDAY";

        String bTime = body.get("breakfastTime") != null ? body.get("breakfastTime").toString().trim() : (body.get("breakfast") != null ? body.get("breakfast").toString().trim() : "07:30");
        String lTime = body.get("lunchTime") != null ? body.get("lunchTime").toString().trim() : (body.get("lunch") != null ? body.get("lunch").toString().trim() : "12:00");
        String dTime = body.get("dinnerTime") != null ? body.get("dinnerTime").toString().trim() : (body.get("dinner") != null ? body.get("dinner").toString().trim() : "18:30");
        String bedTime = body.get("bedtime") != null ? body.get("bedtime").toString().trim() : "22:00";

        if (!bTime.matches(timeRegex) || !lTime.matches(timeRegex) || !dTime.matches(timeRegex) || !bedTime.matches(timeRegex)) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", "시간 형식이 올바르지 않습니다. (예: 07:30)"));
        }

        userMapper.upsertMealTime(resolvedUserId, dayType, bTime, lTime, dTime, bedTime);

        Map<String, Object> res = new HashMap<>();
        res.put("success", true);
        res.put("message", "식사 기준 시간이 성공적으로 저장되었습니다.");
        res.put("userId", resolvedUserId);
        res.put("dayType", dayType);
        res.put("breakfastTime", bTime);
        res.put("lunchTime", lTime);
        res.put("dinnerTime", dTime);
        res.put("bedtime", bedTime);
        return ResponseEntity.ok(res);
    }

    private String parseTimeStr(Object val, String fallback) {
        if (val == null) return fallback;
        String s = val.toString().trim();
        if (s.matches("^([01]?[0-9]|2[0-3]):[0-5][0-9]$")) {
            return s;
        }
        return fallback;
    }

    @PostMapping(value = "/profile", consumes = MediaType.MULTIPART_FORM_DATA_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> updateProfile(
            @RequestParam("username") String username,
            @RequestParam(value = "nickname", required = false) String nickname,
            @RequestParam(value = "file", required = false) MultipartFile file,
            javax.servlet.http.HttpServletRequest httpRequest) {
        userAccess.selfUser(httpRequest, null, username);
        User user = userMapper.findByLoginId(username);
        if (user == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("message", "사용자를 찾을 수 없습니다."));
        }

        try {
            if (nickname != null) {
                String trimmedNickname = nickname.trim();
                if (trimmedNickname.length() < 2 || trimmedNickname.length() > 6) {
                    return ResponseEntity.badRequest().body(Map.of("message", "닉네임은 2~6자로 입력해 주세요."));
                }
                if (userMapper.countByNicknameExceptLoginId(trimmedNickname, username) > 0) {
                    return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message", "이미 사용 중인 닉네임입니다."));
                }
                userMapper.updateNickname(username, trimmedNickname);
                user.setNickname(trimmedNickname);
            }

            if (file != null && !file.isEmpty()) {
                String savedFileName = saveProfileImage(username, file);
                userMapper.updateProfileImageUrl(username, savedFileName);
                user.setProfileImageUrl(savedFileName);
            }

            return ResponseEntity.ok(Map.of(
                    "nickname", user.getNickname(),
                    "profileImageUrl", profileImagePath(user)
            ));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        } catch (IOException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("message", "프로필 사진 저장에 실패했습니다."));
        }
    }

    @GetMapping("/profile-image/{username}")
    public ResponseEntity<?> getProfileImage(@PathVariable("username") String username) throws IOException {
        return profileImageResponse(userMapper.findByLoginId(username));
    }

    @GetMapping("/profile-image/user/{userId}")
    public ResponseEntity<?> getProfileImageByUserId(@PathVariable("userId") Long userId) throws IOException {
        return profileImageResponse(userMapper.findById(userId));
    }

    private ResponseEntity<?> profileImageResponse(User user) throws IOException {
        if (user == null || user.getProfileImageUrl() == null || user.getProfileImageUrl().isBlank()) {
            return defaultProfileImageResponse();
        }

        Path imagePath = profileUploadDirectory().resolve(Path.of(user.getProfileImageUrl()).getFileName());
        if (!Files.isRegularFile(imagePath)) {
            return defaultProfileImageResponse();
        }
        String contentType = Files.probeContentType(imagePath);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(contentType == null ? MediaType.APPLICATION_OCTET_STREAM_VALUE : contentType))
                .body(Files.readAllBytes(imagePath));
    }

    /**
     * DB에 파일명이 남았지만 실제 파일이 삭제된 경우에도 이미지 요청을 404로 끝내지 않는다.
     * 커뮤니티와 마이페이지가 같은 기본 프로필 이미지를 받으므로 브라우저 콘솔에도 실패 요청이 남지 않는다.
     */
    private ResponseEntity<byte[]> defaultProfileImageResponse() throws IOException {
        try (var input = UserController.class.getResourceAsStream("/images/default-profile.png")) {
            if (input == null) {
                throw new IOException("기본 프로필 이미지 리소스를 찾을 수 없습니다.");
            }
            return ResponseEntity.ok()
                    .contentType(MediaType.IMAGE_PNG)
                    .body(input.readAllBytes());
        }
    }

    private String saveProfileImage(String username, MultipartFile file) throws IOException {
        String contentType = file.getContentType();
        if (contentType == null || !contentType.startsWith("image/")) {
            throw new IllegalArgumentException("이미지 파일만 등록할 수 있습니다.");
        }
        String extension = switch (contentType) {
            case "image/jpeg" -> ".jpg";
            case "image/png" -> ".png";
            case "image/gif" -> ".gif";
            case "image/webp" -> ".webp";
            default -> throw new IllegalArgumentException("JPG, PNG, GIF, WEBP 파일만 등록할 수 있습니다.");
        };
        Path directory = profileUploadDirectory();
        Files.createDirectories(directory);
        String fileName = username + "-" + UUID.randomUUID() + extension;
        Files.copy(file.getInputStream(), directory.resolve(fileName), StandardCopyOption.REPLACE_EXISTING);
        return fileName;
    }

    private Path profileUploadDirectory() {
        return Path.of(System.getProperty("user.home"), ".jette_yak", "uploads", "profiles");
    }

    private String profileImagePath(User user) {
        if (user == null || user.getProfileImageUrl() == null || user.getProfileImageUrl().isBlank()) {
            return "";
        }
        Path imagePath = profileUploadDirectory().resolve(Path.of(user.getProfileImageUrl()).getFileName());
        if (!Files.isRegularFile(imagePath)) {
            return "";
        }
        return "/api/users/profile-image/" + user.getLoginId();
    }

    private Long resolveUserId(Long userId, String username, javax.servlet.http.HttpServletRequest httpRequest) {
        return userAccess.familyUser(httpRequest, userId, username);
    }

    private Long resolveSelfUserId(Long userId, String username, javax.servlet.http.HttpServletRequest httpRequest) {
        return userAccess.selfUser(httpRequest, userId, username);
    }

    /**
     * 마이페이지 평소 복용 관리 (상비약 & 영양제) 목록 조회 API
     * GET /api/users/everyday-meds?userId=1
     */
    @GetMapping(value = "/everyday-meds", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> getEverydayMeds(
            @RequestParam(value = "userId", required = false) Long userId,
            @RequestParam(value = "username", required = false) String username,
            javax.servlet.http.HttpServletRequest httpRequest) {
        Long resolvedUserId = resolveUserId(userId, username, httpRequest);
        if (resolvedUserId == null || resolvedUserId <= 0L) {
            return ResponseEntity.ok(Collections.emptyList());
        }

        if (medicationGuideDao == null) {
            return ResponseEntity.ok(Collections.emptyList());
        }

        List<com.app.guide.dto.RegisteredMedicationDto> list = medicationGuideDao.collection(resolvedUserId);
        List<Map<String, Object>> result = new ArrayList<>();
        if (list != null) {
            for (var it : list) {
                if ("CABINET".equals(it.getSource()) || "ROUTINE".equals(it.getSource())) {
                    Map<String, Object> map = new LinkedHashMap<>();
                    String regId = it.getRegistrationId();
                    String rawId = regId != null && regId.contains(":") ? regId.substring(regId.indexOf(":") + 1) : regId;
                    map.put("id", regId);
                    map.put("rawId", rawId);
                    map.put("source", it.getSource());
                    map.put("type", "CABINET".equals(it.getSource()) ? "상비약" : "영양제");
                    map.put("name", it.getItemName());
                    map.put("medicationId", it.getMedicationId());
                    map.put("entpName", it.getEntpName());
                    map.put("takeTime", it.getTakeTime());
                    map.put("notes", it.getNotes());
                    map.put("dotColor", "CABINET".equals(it.getSource()) ? "#5c9e76" : "#e09f3e");
                    map.put("useStatus", it.getUseStatus());
                    if ("ROUTINE".equals(it.getSource()) && supplementRuleBook != null) {
                        var rule = supplementRuleBook.findRule(it.getItemName());
                        map.put("frequency", rule != null ? rule.getFrequency() : 1);
                    } else {
                        map.put("frequency", 1);
                    }
                    result.add(map);
                }
            }
        }
        return ResponseEntity.ok(result);
    }

    /**
     * 마이페이지 평소 복용 관리 (상비약 & 영양제) 추가 API
     * POST /api/users/everyday-meds
     */
    @PostMapping(value = "/everyday-meds", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> addEverydayMed(
            @RequestBody Map<String, Object> body,
            javax.servlet.http.HttpServletRequest httpRequest) {
        // 잘못된 대상자 번호를 본인으로 바꿔 저장하지 않고 요청 오류로 거부.
        Long userId = com.app.util.UserAccess.requestedId(body.get("userId"));
        String username = body.get("username") != null ? body.get("username").toString().trim() : null;
        Long resolvedUserId = resolveUserId(userId, username, httpRequest);
        if (resolvedUserId == null || resolvedUserId <= 0L) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "로그인이 필요합니다."));
        }
        userId = resolvedUserId;

        String type = body.get("type") != null ? body.get("type").toString().trim() : "";
        String name = body.get("name") != null ? body.get("name").toString().trim() : "";
        String medicationId = body.get("medicationId") != null ? body.get("medicationId").toString().trim() : null;

        if ("CABINET".equalsIgnoreCase(type)) {
            if (medicationId == null || medicationId.isBlank()) {
                return ResponseEntity.badRequest().body(Map.of("success", false, "message", "의약품을 선택해주세요."));
            }
            if (scheduleDAO != null) {
                // 검색 후 제품 정보가 바뀌거나 삭제된 경우 FK 오류 대신 선택 오류로 안내.
                if (!scheduleDAO.checkMedicationExists(medicationId)) {
                    return ResponseEntity.badRequest().body(Map.of("success", false, "message", "선택한 제품 정보를 찾을 수 없습니다. 다시 검색해주세요."));
                }
                Long cabinetId = scheduleDAO.findOrCreateCabinetId(userId, medicationId);
                if (medicationGuideDao != null) {
                    try {
                        medicationGuideDao.updateStatus(userId, "C:" + cabinetId, "STORED");
                        medicationGuideDao.saveOverallGuide(userId, null);
                    } catch (Exception ignored) {}
                }
            }
            return ResponseEntity.ok(Map.of("success", true, "message", "상비약이 등록되었습니다."));
        } else if ("ROUTINE".equalsIgnoreCase(type) || "SUPPLEMENT".equalsIgnoreCase(type)) {
            if (name == null || name.isBlank()) {
                return ResponseEntity.badRequest().body(Map.of("success", false, "message", "영양제 이름을 입력해주세요."));
            }
            if (scheduleDAO != null) {
                if (medicationId != null && !medicationId.isBlank() && !scheduleDAO.checkMedicationExists(medicationId)) {
                    return ResponseEntity.badRequest().body(Map.of("success", false, "message", "선택한 제품 정보를 찾을 수 없습니다."));
                }
                String takeTime = body.get("takeTime") != null && !body.get("takeTime").toString().trim().isEmpty()
                        ? body.get("takeTime").toString().trim() : null;
                String notes = body.get("notes") != null && !body.get("notes").toString().trim().isEmpty()
                        ? body.get("notes").toString().trim() : null;
                Integer frequency = 1;
                if (body.get("frequency") instanceof Number num) {
                    frequency = num.intValue();
                } else if (body.get("frequency") != null) {
                    try { frequency = Integer.parseInt(body.get("frequency").toString()); } catch (Exception ignored) {}
                }

                User currentUser = (resolvedUserId != null && resolvedUserId > 0L) ? userMapper.findById(resolvedUserId) : null;

                // [초고속 로컬 규칙 즉시 매칭 & 비동기 AI 자가 학습]
                boolean matchedLocally = false;
                if (supplementRuleBook != null) {
                    var localRule = supplementRuleBook.findRule(name);
                    if (localRule != null) {
                        if (takeTime == null || takeTime.isBlank()) {
                            takeTime = calculateSupplementTakeTime(localRule.getTakeTime(), currentUser);
                        }
                        if (notes == null || notes.isBlank() || "보관 등록".equals(notes) || "건강기능식품".equals(notes)) {
                            notes = localRule.getAdvice();
                        }
                        if (body.get("frequency") == null) {
                            frequency = localRule.getFrequency();
                        }
                        matchedLocally = true;
                    }
                }

                if (takeTime == null || takeTime.isBlank()) {
                    String b = (currentUser != null && currentUser.getBreakfastTime() != null) ? currentUser.getBreakfastTime() : "07:30";
                    takeTime = addMinutesToTime(b, 15);
                }

                if (takeTime != null && !takeTime.isBlank()) {
                    var matcher = java.util.regex.Pattern.compile("([01]?[0-9]|2[0-3]):([0-5][0-9])").matcher(takeTime.trim());
                    if (matcher.find()) {
                        int hh = Integer.parseInt(matcher.group(1));
                        int mm = Integer.parseInt(matcher.group(2));
                        takeTime = String.format("%02d:%02d", hh, mm);
                    } else {
                        takeTime = null;
                    }
                }

                if (notes == null || notes.isBlank()) {
                    notes = "식후 권장 (건강기능식품)";
                }

                // 1. 즉시 보관함에 등록 (사용자는 대기 없이 0.01초 만에 등록 완료!)
                Long routineId = scheduleDAO.findOrCreateRoutineId(userId, name, takeTime, notes, medicationId);
                if (medicationGuideDao != null) {
                    try {
                        medicationGuideDao.updateStatus(userId, "R:" + routineId, "PAUSED");
                        medicationGuideDao.saveOverallGuide(userId, null);
                    } catch (Exception ignored) {}
                }

                // 2. 로컬 사전에 없었던 신규 영양제인 경우, 백그라운드에서 AI가 학습하여 로컬 규칙과 DB를 보완
                if (!matchedLocally && supplementRuleBook != null && geminiService != null && geminiService.isAvailable()) {
                    supplementRuleBook.learnAsync(name, geminiService, userId, routineId, scheduleDAO);
                }

                Map<String, Object> resMap = new LinkedHashMap<>();
                resMap.put("success", true);
                String msg = "영양제가 등록되었습니다.";
                if (takeTime != null && !takeTime.isBlank()) {
                    msg += " (추천 복용 시간: " + takeTime + ")";
                }
                resMap.put("message", msg);
                resMap.put("takeTime", takeTime);
                resMap.put("notes", notes);
                resMap.put("frequency", frequency);
                return ResponseEntity.ok(resMap);
            }
            return ResponseEntity.ok(Map.of("success", true, "message", "영양제가 등록되었습니다."));
        }

        return ResponseEntity.badRequest().body(Map.of("success", false, "message", "유효하지 않은 등록 유형입니다."));
    }

    /**
     * 마이페이지 평소 복용 관리 (상비약 & 영양제) 삭제 API
     * DELETE /api/users/everyday-meds/{source}/{id}
     */
    @DeleteMapping(value = "/everyday-meds/{source}/{id}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> deleteEverydayMed(
            @PathVariable("source") String source,
            @PathVariable("id") Long id,
            @RequestParam(value = "userId", required = false) Long userId,
            @RequestParam(value = "username", required = false) String username,
            javax.servlet.http.HttpServletRequest httpRequest) {
        Long resolvedUserId = resolveUserId(userId, username, httpRequest);
        if (resolvedUserId == null || resolvedUserId <= 0L) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "로그인이 필요합니다."));
        }
        userId = resolvedUserId;

        try {
            everydayMedicationService.delete(userId,source,id);
            return ResponseEntity.ok(Map.of("success",true,"message","삭제되었습니다."));
        } catch(IllegalArgumentException exception) {
            return ResponseEntity.badRequest().body(Map.of("success",false,"message",exception.getMessage()));
        }
    }

    /**
     * 회원 탈퇴 API
     * POST /api/users/withdraw
     */
    @PostMapping(value = "/withdraw", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> withdraw(
            @RequestBody(required = false) Map<String, Object> body,
            @RequestParam(value = "userId", required = false) Long userIdParam,
            @RequestParam(value = "username", required = false) String usernameParam,
            javax.servlet.http.HttpServletRequest httpRequest) {

        Long userId = null;
        String username = null;
        if (body != null) {
            if (body.get("userId") != null) {
                try {
                    userId = Long.valueOf(body.get("userId").toString());
                } catch (NumberFormatException ignored) {}
            }
            if (body.get("username") != null) {
                username = body.get("username").toString();
            }
        }
        if (userId == null) userId = userIdParam;
        if (username == null) username = usernameParam;

        Long resolvedUserId = resolveSelfUserId(userId, username, httpRequest);
        if (resolvedUserId == null || resolvedUserId <= 0L) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "로그인이 필요합니다."));
        }

        User user = userMapper.findById(resolvedUserId);
        if (resolvedUserId.equals(1L) || (user != null && ("test12".equalsIgnoreCase(user.getLoginId()) || "demo".equalsIgnoreCase(user.getLoginId())))) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", "체험용 계정은 탈퇴할 수 없습니다."));
        }

        try {
            userService.withdraw(resolvedUserId);

            // 세션 무효화
            if (httpRequest != null) {
                var session = httpRequest.getSession(false);
                if (session != null) {
                    session.invalidate();
                }
            }

            return ResponseEntity.ok(Map.of("success", true, "message", "회원 탈퇴가 완료되었습니다."));
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", e.getMessage()));
        } catch (Exception e) {
            org.apache.logging.log4j.LogManager.getLogger(getClass()).error("회원 탈퇴 처리 실패: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("success", false, "message", "회원 탈퇴 처리 중 오류가 발생했습니다."));
        }
    }

    private String calculateSupplementTakeTime(String ruleTakeTime, User user) {
        String b = (user != null && user.getBreakfastTime() != null) ? user.getBreakfastTime() : "07:30";
        String l = (user != null && user.getLunchTime() != null) ? user.getLunchTime() : "12:00";
        String d = (user != null && user.getDinnerTime() != null) ? user.getDinnerTime() : "18:30";
        String bed = (user != null && user.getBedtime() != null) ? user.getBedtime() : "22:00";

        if ("07:00".equals(ruleTakeTime)) {
            return addMinutesToTime(b, -30);
        } else if ("09:00".equals(ruleTakeTime)) {
            return addMinutesToTime(b, 15);
        } else if ("13:00".equals(ruleTakeTime)) {
            return addMinutesToTime(l, 15);
        } else if ("19:00".equals(ruleTakeTime)) {
            return addMinutesToTime(d, 15);
        } else if ("22:00".equals(ruleTakeTime)) {
            return bed;
        } else if ("15:30".equals(ruleTakeTime)) {
            return "15:30";
        }
        return ruleTakeTime != null ? ruleTakeTime : addMinutesToTime(b, 15);
    }

    private String addMinutesToTime(String timeStr, int minutesToAdd) {
        if (timeStr == null || !timeStr.contains(":")) {
            return "08:00";
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
}
