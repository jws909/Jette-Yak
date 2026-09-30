package com.app.controller;

import com.app.dto.SignupRequest;
import com.app.domain.User;
import com.app.mapper.UserMapper;
import com.app.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
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

/**
 * 회원가입 / 중복확인 컨트롤러 (DB 연동 + 형식 검증 버전).
 */
@RestController
@RequestMapping("/api/users")
public class UserController {

    @Autowired
    private UserService userService;

    @Autowired
    private UserMapper userMapper;

    @Autowired(required = false)
    private com.app.dao.ScheduleDAO scheduleDAO;

    @Autowired(required = false)
    private com.app.guide.dao.MedicationGuideDao medicationGuideDao;

    @Autowired(required = false)
    private com.app.chatbot.client.GeminiService geminiService;

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
        User user = userMapper.findByLoginId(username);
        if (user == null) {
            return ResponseEntity.notFound().build();
        }
        if (httpRequest != null) {
            javax.servlet.http.HttpSession session = httpRequest.getSession(true);
            session.setAttribute("userId", user.getUserId());
            session.setAttribute("username", user.getLoginId());
            session.setAttribute("role", user.getRole() == null ? "USER" : user.getRole());
        }
        Map<String, Object> response = new HashMap<>();
        response.put("userId", user.getUserId());
        response.put("username", user.getLoginId());
        response.put("nickname", user.getNickname());
        response.put("profileImageUrl", profileImagePath(user));
        response.put("role", user.getRole() == null ? "USER" : user.getRole());
        response.put("breakfastTime", user.getBreakfastTime() != null ? user.getBreakfastTime() : "07:30");
        response.put("lunchTime", user.getLunchTime() != null ? user.getLunchTime() : "12:00");
        response.put("dinnerTime", user.getDinnerTime() != null ? user.getDinnerTime() : "18:30");
        response.put("bedtime", user.getBedtime() != null ? user.getBedtime() : "22:00");
        return ResponseEntity.ok(response);
    }

    /**
     * 사용자별 기준 식사/취침 시간 조회 API
     * GET /api/users/meal-times?userId=1 또는 ?username=demo
     */
    @GetMapping(value = "/meal-times", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> getMealTimes(
            @RequestParam(value = "userId", required = false) Long userId,
            @RequestParam(value = "username", required = false) String username) {
        User user = null;
        if (userId != null && userId > 0L) {
            user = userMapper.findById(userId);
        } else if (username != null && !username.isBlank()) {
            user = userMapper.findByLoginId(username);
        }

        String bTime = (user != null && user.getBreakfastTime() != null) ? user.getBreakfastTime() : "07:30";
        String lTime = (user != null && user.getLunchTime() != null) ? user.getLunchTime() : "12:00";
        String dTime = (user != null && user.getDinnerTime() != null) ? user.getDinnerTime() : "18:30";
        String bedTime = (user != null && user.getBedtime() != null) ? user.getBedtime() : "22:00";

        Map<String, Object> res = new HashMap<>();
        res.put("success", true);
        res.put("userId", user != null ? user.getUserId() : null);
        res.put("username", user != null ? user.getLoginId() : null);
        res.put("breakfastTime", bTime);
        res.put("lunchTime", lTime);
        res.put("dinnerTime", dTime);
        res.put("bedtime", bedTime);
        return ResponseEntity.ok(res);
    }

    /**
     * 사용자별 기준 식사/취침 시간 저장 API
     * POST /api/users/meal-times
     */
    @PostMapping(value = "/meal-times", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> updateMealTimes(@RequestBody Map<String, Object> body) {
        Long userId = body.get("userId") != null ? Long.valueOf(body.get("userId").toString()) : null;
        String username = body.get("username") != null ? body.get("username").toString() : null;
        String bTime = body.get("breakfastTime") != null ? body.get("breakfastTime").toString().trim() : "07:30";
        String lTime = body.get("lunchTime") != null ? body.get("lunchTime").toString().trim() : "12:00";
        String dTime = body.get("dinnerTime") != null ? body.get("dinnerTime").toString().trim() : "18:30";
        String bedTime = body.get("bedtime") != null ? body.get("bedtime").toString().trim() : "22:00";

        if ((userId == null || userId <= 0L) && (username == null || username.isBlank())) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "로그인이 필요합니다."));
        }

        String timeRegex = "^([01]?[0-9]|2[0-3]):[0-5][0-9]$";
        if (!bTime.matches(timeRegex) || !lTime.matches(timeRegex) || !dTime.matches(timeRegex) || !bedTime.matches(timeRegex)) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", "시간 형식이 올바르지 않습니다. (예: 07:30)"));
        }

        userMapper.updateMealTimes(userId, username, bTime, lTime, dTime, bedTime);

        Map<String, Object> res = new HashMap<>();
        res.put("success", true);
        res.put("message", "식사 기준 시간이 성공적으로 저장되었습니다.");
        res.put("breakfastTime", bTime);
        res.put("lunchTime", lTime);
        res.put("dinnerTime", dTime);
        res.put("bedtime", bedTime);
        return ResponseEntity.ok(res);
    }

    @PostMapping(value = "/profile", consumes = MediaType.MULTIPART_FORM_DATA_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> updateProfile(
            @RequestParam("username") String username,
            @RequestParam(value = "nickname", required = false) String nickname,
            @RequestParam(value = "file", required = false) MultipartFile file) {
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
            return ResponseEntity.notFound().build();
        }

        Path imagePath = profileUploadDirectory().resolve(Path.of(user.getProfileImageUrl()).getFileName());
        if (!Files.isRegularFile(imagePath)) {
            return ResponseEntity.notFound().build();
        }
        String contentType = Files.probeContentType(imagePath);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(contentType == null ? MediaType.APPLICATION_OCTET_STREAM_VALUE : contentType))
                .body(Files.readAllBytes(imagePath));
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
        if (userId != null && userId > 0L) {
            return userId;
        }
        if (httpRequest != null) {
            var session = httpRequest.getSession(false);
            Object sessionVal = session != null ? session.getAttribute("userId") : null;
            if (sessionVal instanceof Long) {
                return (Long) sessionVal;
            } else if (sessionVal instanceof Number) {
                return ((Number) sessionVal).longValue();
            }
        }
        if (username != null && !username.isBlank()) {
            String target = "demo".equalsIgnoreCase(username.trim()) ? "test12" : username.trim();
            try {
                User u = userMapper.findByLoginId(target);
                if (u != null && u.getUserId() != null) {
                    return u.getUserId();
                }
            } catch (Exception ignored) {}
        }
        return null;
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
        Long userId = null;
        if (body.get("userId") != null && !body.get("userId").toString().trim().isEmpty()) {
            try {
                userId = Long.valueOf(body.get("userId").toString().trim());
            } catch (Exception ignored) {}
        }
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

                // [AI 영양제 권장 복용시간 자동 탐색] 사용자가 직접 지정하지 않은 경우 AI 분석
                if ((takeTime == null || takeTime.isBlank()) && geminiService != null && geminiService.isAvailable()) {
                    try {
                        Map<String, Object> aiRec = geminiService.recommendSupplementIntake(name);
                        if (aiRec != null && Boolean.TRUE.equals(aiRec.get("isSupplement"))) {
                            Object recTime = aiRec.get("takeTime");
                            if (recTime != null && !recTime.toString().isBlank() && !"null".equalsIgnoreCase(recTime.toString())) {
                                takeTime = recTime.toString().trim();
                            }
                            Object recAdvice = aiRec.get("advice");
                            if (recAdvice != null && !recAdvice.toString().isBlank() && !"null".equalsIgnoreCase(recAdvice.toString())) {
                                notes = recAdvice.toString().trim();
                            }
                        }
                    } catch (Exception ex) {
                        org.apache.logging.log4j.LogManager.getLogger(getClass()).warn("영양제 복용 시간 AI 추천 실패: {}", ex.getMessage());
                    }
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
                    notes = "보관 등록";
                }

                Long routineId = scheduleDAO.findOrCreateRoutineId(userId, name, takeTime, notes, medicationId);
                if (medicationGuideDao != null) {
                    try {
                        medicationGuideDao.updateStatus(userId, "R:" + routineId, "PAUSED");
                        medicationGuideDao.saveOverallGuide(userId, null);
                    } catch (Exception ignored) {}
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

        Long resolvedUserId = resolveUserId(userId, username, httpRequest);
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
}
