package com.app.push;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.security.Security;
import java.time.Duration;
import java.util.Base64;
import nl.martijndwars.webpush.Encoding;
import nl.martijndwars.webpush.Notification;
import nl.martijndwars.webpush.PushService;
import nl.martijndwars.webpush.Urgency;
import org.apache.http.client.methods.HttpPost;
import org.apache.http.util.EntityUtils;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.stereotype.Component;

/** VAPID 서명·암호화 후 HTTPS로 전송. 리다이렉트와 무기한 대기를 금지 */
@Component
public class WebPushSender implements PushSender, DisposableBean {
    private final PushService signer;
    private final String publicKey;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8))
        .followRedirects(HttpClient.Redirect.NEVER).build();

    public WebPushSender(@Value("${push.vapid.public-key:}") String publicKey,
            @Value("${push.vapid.private-key:}") String privateKey,
            @Value("${push.vapid.subject:}") String subject) {
        publicKey = environment("WEB_PUSH_PUBLIC_KEY", publicKey);
        privateKey = environment("WEB_PUSH_PRIVATE_KEY", privateKey);
        subject = environment("WEB_PUSH_SUBJECT", subject);
        PushService configured = null;
        String safePublic = "";
        try {
            safePublic = PushSafety.key(publicKey, 65);
            if (Base64.getUrlDecoder().decode(privateKey).length != 32) throw new IllegalArgumentException();
            URI contact = URI.create(subject);
            if (!("mailto".equals(contact.getScheme()) && subject.contains("@"))
                    && !("https".equals(contact.getScheme()) && contact.getHost() != null)) throw new IllegalArgumentException();
            if (Security.getProvider("BC") == null) Security.addProvider(new BouncyCastleProvider());
            configured = new PushService(safePublic, privateKey, subject);
            if (!nl.martijndwars.webpush.Utils.verifyKeyPair(configured.getPrivateKey(), configured.getPublicKey()))
                throw new IllegalArgumentException();
        } catch (Exception unavailable) {
            configured = null;
            safePublic = "";
        }
        signer = configured;
        this.publicKey = safePublic;
    }

    private static String environment(String name, String fallback) {
        String configured = System.getenv(name);
        return configured == null || configured.isBlank() ? fallback : configured.trim();
    }

    @Override public boolean ready() { return signer != null; }
    @Override public String publicKey() { return publicKey; }
    @Override public void destroy() { http.close(); }

    @Override public int send(PushSubscription subscription, String payload, int ttlSeconds) throws Exception {
        if (!ready()) throw new IllegalStateException("푸시 서버 설정이 필요해요.");
        PushSafety.endpoint(subscription.getEndpoint());
        Notification notice = Notification.builder().endpoint(subscription.getEndpoint())
            .userPublicKey(subscription.getPublicKey()).userAuth(subscription.getAuthSecret())
            .payload(payload).ttl(ttlSeconds).urgency(Urgency.HIGH).build();
        // 라이브러리는 암호화에만 사용하고 HTTP 연결 정책은 직접 제한
        HttpPost prepared = signer.preparePost(notice, Encoding.AES128GCM);
        HttpRequest.Builder request = HttpRequest.newBuilder(prepared.getURI()).timeout(Duration.ofSeconds(12))
            .POST(HttpRequest.BodyPublishers.ofByteArray(EntityUtils.toByteArray(prepared.getEntity())));
        for (org.apache.http.Header header : prepared.getAllHeaders()) request.header(header.getName(), header.getValue());
        return http.send(request.build(), HttpResponse.BodyHandlers.discarding()).statusCode();
    }
}
