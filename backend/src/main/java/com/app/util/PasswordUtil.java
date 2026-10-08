package com.app.util;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.io.UnsupportedEncodingException;

/**
 * users.password_hash 컬럼 설명(SHA256암호화)에 맞춘 해시 유틸리티.
 */
public class PasswordUtil {

    private PasswordUtil() {
    }

    public static String sha256(String rawPassword) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hashBytes = digest.digest(rawPassword.getBytes("UTF-8"));
            StringBuilder sb = new StringBuilder();
            for (byte b : hashBytes) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException | UnsupportedEncodingException e) {
            throw new RuntimeException("비밀번호 암호화 중 오류가 발생했습니다.", e);
        }
    }
}
