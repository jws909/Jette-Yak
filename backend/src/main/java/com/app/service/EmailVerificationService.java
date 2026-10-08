package com.app.service;

import com.app.util.MailSender;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 이메일 인증번호 발급/검증.
 * 서버 메모리에 저장하는 방식이라 서버 재시작 시 초기화됩니다.
 * (여러 대의 서버로 확장할 계획이 있다면 DB나 Redis로 옮겨야 합니다)
 */
@Service
public class EmailVerificationService {

    private static final long EXPIRY_MILLIS = 5 * 60 * 1000L; // 5분

    private final SecureRandom random = new SecureRandom();

    // email -> {code, 만료시각}
    private final Map<String, CodeEntry> pendingCodes = new ConcurrentHashMap<>();
    // 인증에 성공한 이메일 목록 (회원가입 완료 전까지 유지)
    private final Set<String> verifiedEmails = ConcurrentHashMap.newKeySet();

    @Autowired
    private MailSender mailSender;

    public void sendCode(String email) {
        String code = generateCode();
        long expiryAt = System.currentTimeMillis() + EXPIRY_MILLIS;
        pendingCodes.put(email, new CodeEntry(code, expiryAt));
        verifiedEmails.remove(email); // 재발송 시 기존 인증 상태 초기화
        mailSender.sendVerificationCode(email, code);
    }

    public boolean verifyCode(String email, String code) {
        CodeEntry entry = pendingCodes.get(email);
        if (entry == null) {
            return false; // 발급된 적 없음
        }
        if (System.currentTimeMillis() > entry.expiryAt) {
            pendingCodes.remove(email);
            return false; // 만료됨
        }
        if (!entry.code.equals(code)) {
            return false; // 코드 불일치
        }
        verifiedEmails.add(email);
        pendingCodes.remove(email);
        return true;
    }

    public boolean isVerified(String email) {
        return verifiedEmails.contains(email);
    }

    public void clearVerification(String email) {
        verifiedEmails.remove(email);
    }

    private String generateCode() {
        int number = random.nextInt(1_000_000); // 0 ~ 999999
        return String.format("%06d", number);
    }

    private static class CodeEntry {
        final String code;
        final long expiryAt;

        CodeEntry(String code, long expiryAt) {
            this.code = code;
            this.expiryAt = expiryAt;
        }
    }
}
