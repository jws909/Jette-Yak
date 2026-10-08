package com.app.util;

import org.springframework.beans.factory.InitializingBean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.mail.Message;
import javax.mail.MessagingException;
import javax.mail.PasswordAuthentication;
import javax.mail.Session;
import javax.mail.Transport;
import javax.mail.internet.InternetAddress;
import javax.mail.internet.MimeBodyPart;
import javax.mail.internet.MimeMessage;
import javax.mail.internet.MimeMultipart;
import java.io.InputStream;
import java.util.Properties;

/**
 * SMTP로 인증번호 메일을 보내는 유틸리티.
 * mail.properties (classpath:config/) 값을 사용합니다.
 * pom.xml에 com.sun.mail:javax.mail 의존성이 필요합니다.
 */
@Component
public class MailSender implements InitializingBean {

    @Value("${mail.smtp.host:smtp.gmail.com}")
    private String host;

    @Value("${mail.smtp.port:587}")
    private String port;

    @Value("${mail.smtp.username:}")
    private String username;

    @Value("${mail.smtp.password:}")
    private String password;

    @Value("${mail.from:}")
    private String from;

    @Override
    public void afterPropertiesSet() {
        init();
    }

    public void init() {
        try (InputStream in = getClass().getClassLoader().getResourceAsStream("config/mail.properties")) {
            if (in != null) {
                Properties fileProps = new Properties();
                fileProps.load(in);
                if (fileProps.getProperty("mail.smtp.host") != null) {
                    host = fileProps.getProperty("mail.smtp.host").trim();
                }
                if (fileProps.getProperty("mail.smtp.port") != null) {
                    port = fileProps.getProperty("mail.smtp.port").trim();
                }
                if (fileProps.getProperty("mail.smtp.username") != null) {
                    username = fileProps.getProperty("mail.smtp.username").trim();
                }
                if (fileProps.getProperty("mail.smtp.password") != null) {
                    password = fileProps.getProperty("mail.smtp.password").trim();
                }
                if (fileProps.getProperty("mail.from") != null) {
                    from = fileProps.getProperty("mail.from").trim();
                }
            }
        } catch (Exception e) {
            System.err.println("[MailSender] mail.properties 로드 중 오류: " + e.getMessage());
        }
    }

    public void sendVerificationCode(String toEmail, String code) {
        final String effectiveHost = (host != null && !host.startsWith("${")) ? host.trim() : "smtp.gmail.com";
        final String effectivePort = (port != null && !port.startsWith("${")) ? port.trim() : "587";
        final String effectiveUsername = (username != null && !username.startsWith("${")) ? username.trim() : "";
        final String effectivePassword = (password != null && !password.startsWith("${")) ? password.trim() : "";
        final String effectiveFrom = (from != null && !from.isBlank() && !from.startsWith("${")) ? from.trim() : effectiveUsername;

        Properties props = new Properties();
        props.put("mail.smtp.auth", "true");
        props.put("mail.smtp.starttls.enable", "true");
        props.put("mail.smtp.starttls.required", "true");
        props.put("mail.smtp.ssl.protocols", "TLSv1.2 TLSv1.3");
        props.put("mail.smtp.ssl.trust", effectiveHost);
        props.put("mail.smtp.host", effectiveHost);
        props.put("mail.smtp.port", effectivePort);
        props.put("mail.smtp.connectiontimeout", "10000"); // 10초
        props.put("mail.smtp.timeout", "10000");           // 10초
        props.put("mail.smtp.writetimeout", "10000");      // 10초

        Session session = Session.getInstance(props, new javax.mail.Authenticator() {
            @Override
            protected PasswordAuthentication getPasswordAuthentication() {
                return new PasswordAuthentication(effectiveUsername, effectivePassword);
            }
        });

        try {
            MimeMessage message = new MimeMessage(session);
            message.setFrom(new InternetAddress(effectiveFrom));
            message.setRecipients(Message.RecipientType.TO, InternetAddress.parse(toEmail));
            message.setSubject("[제때약] 이메일 인증번호", "UTF-8");
            setVerificationContent(message, code);
            Transport.send(message);
        } catch (MessagingException e) {
            System.err.println("[MailSender] 메일 발송 실패: " + e.getMessage());
            e.printStackTrace();
            throw new RuntimeException("인증 메일 발송에 실패했습니다: " + e.getMessage(), e);
        }
    }

    /**
     * 메일 앱별 CSS 지원 범위가 달라 테이블 레이아웃과 인라인 스타일만 사용한다.
     * HTML을 볼 수 없는 환경을 위해 일반 텍스트 본문도 함께 전송한다.
     */
    private void setVerificationContent(MimeMessage message, String code) throws MessagingException {
        String safeCode = escapeHtml(code);
        String plainText = "제때약 이메일 인증\n\n"
                + "인증번호: " + code + "\n"
                + "인증번호는 발급 시점으로부터 5분간 유효합니다.\n\n"
                + "본인이 요청하지 않았다면 이 메일을 무시해 주세요.";

        String html = "<!doctype html>"
                + "<html lang=\"ko\"><body style=\"margin:0;padding:0;background:#f7f4ef;\">"
                + "<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" style=\"background:#f7f4ef;padding:32px 12px;font-family:Arial,'Noto Sans KR',sans-serif;color:#2b2523;\">"
                + "<tr><td align=\"center\">"
                + "<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" style=\"max-width:560px;background:#ffffff;border:1px solid #e6ddd3;border-radius:16px;overflow:hidden;\">"
                + "<tr><td style=\"background:#682335;padding:26px 36px;text-align:center;\">"
                + "<div style=\"display:inline-block;width:44px;height:44px;line-height:44px;border-radius:14px;background:#ffffff;color:#682335;font-size:24px;font-weight:bold;\">✚</div>"
                + "<div style=\"margin-top:10px;color:#ffffff;font-size:23px;font-weight:800;letter-spacing:-1px;\">제때약</div>"
                + "<div style=\"margin-top:4px;color:#f4dce1;font-size:12px;letter-spacing:1px;\">YOUR MEDICINE, RIGHT ON TIME</div>"
                + "</td></tr>"
                + "<tr><td style=\"padding:38px 36px 32px;\">"
                + "<div style=\"font-size:14px;color:#8a8077;margin-bottom:10px;\">이메일 인증</div>"
                + "<h1 style=\"margin:0 0 14px;font-size:25px;line-height:1.35;color:#2b2523;letter-spacing:-1px;\">안전하게 제때약을 시작해 볼까요?</h1>"
                + "<p style=\"margin:0;color:#665f57;font-size:15px;line-height:1.7;\">아래 인증번호를 화면에 입력해 이메일 인증을 완료해 주세요.</p>"
                + "<div style=\"margin:28px 0 18px;padding:20px 16px;background:#fbf5f6;border:1px solid #ecd8dc;border-radius:12px;text-align:center;\">"
                + "<div style=\"margin-bottom:8px;color:#8c5a67;font-size:12px;font-weight:bold;letter-spacing:.5px;\">VERIFICATION CODE</div>"
                + "<div style=\"color:#682335;font-size:32px;line-height:1;font-weight:800;letter-spacing:8px;\">" + safeCode + "</div>"
                + "</div>"
                + "<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" style=\"background:#f8f6f2;border-radius:10px;\"><tr>"
                + "<td style=\"padding:14px 16px;color:#5f554d;font-size:13px;line-height:1.55;\"><strong style=\"color:#682335;\">⏱ 5분간 유효</strong><br>인증번호는 발급 시점부터 5분 후 만료됩니다.</td>"
                + "</tr></table>"
                + "<p style=\"margin:24px 0 0;color:#8a8077;font-size:12px;line-height:1.65;\">본인이 요청하지 않았다면 이 메일을 무시해 주세요. 인증번호는 누구에게도 공유하지 마세요.</p>"
                + "</td></tr>"
                + "<tr><td style=\"padding:18px 30px;background:#f3eee7;text-align:center;color:#93877d;font-size:11px;line-height:1.6;\">"
                + "매일의 건강한 약속, 제때약<br>본 메일은 이메일 인증을 위해 자동 발송되었습니다."
                + "</td></tr></table></td></tr></table></body></html>";

        MimeBodyPart textPart = new MimeBodyPart();
        textPart.setText(plainText, "UTF-8");
        MimeBodyPart htmlPart = new MimeBodyPart();
        htmlPart.setContent(html, "text/html; charset=UTF-8");

        MimeMultipart content = new MimeMultipart("alternative");
        content.addBodyPart(textPart);
        content.addBodyPart(htmlPart);
        message.setContent(content);
    }

    private String escapeHtml(String value) {
        if (value == null) {
            return "";
        }
        return value.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }
}
