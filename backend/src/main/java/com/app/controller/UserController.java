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
    public ResponseEntity<?> getProfileImage(@PathVariable String username) throws IOException {
        User user = userMapper.findByLoginId(username);
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
        return user.getProfileImageUrl() == null || user.getProfileImageUrl().isBlank()
                ? ""
                : "/api/users/profile-image/" + user.getLoginId();
    }
}
