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
import javax.mail.internet.MimeMessage;
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
            message.setText(
                    "요청하신 인증번호는 [" + code + "] 입니다.\n"
                            + "인증번호는 발급 시점으로부터 5분간 유효합니다.",
                    "UTF-8"
            );
            Transport.send(message);
        } catch (MessagingException e) {
            System.err.println("[MailSender] 메일 발송 실패: " + e.getMessage());
            e.printStackTrace();
            throw new RuntimeException("인증 메일 발송에 실패했습니다: " + e.getMessage(), e);
        }
    }
}
