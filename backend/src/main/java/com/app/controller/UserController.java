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
    public ResponseEntity<?> getProfile(@RequestParam("username") String username) {
        User user = userMapper.findByLoginId(username);
        if (user == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(Map.of(
                "nickname", user.getNickname(),
                "profileImageUrl", profileImagePath(user)
        ));
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
