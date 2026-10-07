package com.app.push;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Locale;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** 사용자가 전달한 URL을 서버가 대신 호출하므로 공개 푸시 서비스만 허용 */
public final class PushSafety {
    private PushSafety() { }

    public static String endpoint(String value) {
        try {
            if (value == null || value.length() > 2048 || value.length() < 20) throw new IllegalArgumentException();
            URI uri = URI.create(value);
            String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
            boolean known = host.equals("fcm.googleapis.com")
                || host.equals("updates.push.services.mozilla.com")
                || host.equals("push.services.mozilla.com")
                || host.endsWith(".push.apple.com")
                || host.equals("web.push.apple.com")
                || host.endsWith(".notify.windows.com");
            if (!known || !"https".equals(uri.getScheme()) || uri.getRawUserInfo() != null
                    || uri.getFragment() != null || (uri.getPort() != -1 && uri.getPort() != 443)
                    || uri.getRawPath() == null || uri.getRawPath().length() < 2) throw new IllegalArgumentException();
            return value;
        } catch (IllegalArgumentException bad) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "지원하는 브라우저의 알림 주소가 필요해요.");
        }
    }

    public static String key(String value, int length) {
        try {
            if (value == null || !value.matches("[A-Za-z0-9_-]+={0,2}")) throw new IllegalArgumentException();
            byte[] decoded = Base64.getUrlDecoder().decode(value);
            if (decoded.length != length || (length == 65 && decoded[0] != 4)) throw new IllegalArgumentException();
            return Base64.getUrlEncoder().withoutPadding().encodeToString(decoded);
        } catch (IllegalArgumentException bad) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "알림 연결 정보를 다시 확인해 주세요.");
        }
    }

    public static String hash(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }
}
