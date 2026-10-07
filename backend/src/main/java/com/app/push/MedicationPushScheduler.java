package com.app.push;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.logging.Logger;
import com.app.dto.ScheduleDTO;
import com.app.service.ScheduleService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** 캘린더와 같은 일정 조회 규칙으로 30분 전·복약 시각을 확인하는 서버 작업 */
@Component
public class MedicationPushScheduler {
    static final ZoneId KOREA = ZoneId.of("Asia/Seoul");
    private static final Logger LOG = Logger.getLogger(MedicationPushScheduler.class.getName());
    private final ScheduleService schedules;
    private final PushDao dao;
    private final PushSender sender;
    private final PushSubscriptionService subscriptions;
    private final Clock clock;
    private final ObjectMapper json = new ObjectMapper();
    private long nextWarningAt;
    private long nextCleanupAt;
    private int cursor;

    @Autowired public MedicationPushScheduler(ScheduleService schedules, PushDao dao, PushSender sender, PushSubscriptionService subscriptions) {
        this(schedules, dao, sender, subscriptions, Clock.systemUTC());
    }
    public MedicationPushScheduler(ScheduleService schedules, PushDao dao, PushSender sender,
            PushSubscriptionService subscriptions, Clock clock) {
        this.schedules = schedules; this.dao = dao; this.sender = sender; this.subscriptions = subscriptions; this.clock = clock;
    }

    @Scheduled(initialDelay = 15000, fixedDelay = 30000) public void tick() {
        if (!subscriptions.available()) return;
        Instant now = clock.instant();
        long started = System.nanoTime();
        int sends = 0;
        try {
            if (clock.millis() >= nextCleanupAt) {
                dao.cleanup(now.minus(Duration.ofDays(7))); nextCleanupAt = clock.millis() + 3_600_000;
            }
            List<PushSubscription> devices = dao.activeSubscriptions();
            if (devices == null || devices.isEmpty()) return;
            Map<String,List<Reminder>> userSchedules = new HashMap<>();
            int start = Math.floorMod(cursor, devices.size());
            for (int index = 0; index < devices.size(); index++) {
                int position = (start + index) % devices.size();
                if (sends >= 50 || System.nanoTime() - started > Duration.ofSeconds(20).toNanos()) { cursor = position; break; }
                cursor = position + 1;
                PushSubscription device = devices.get(position);
                try {
                    String userKey = String.valueOf(device.getUserId());
                    List<Reminder> reminders = userSchedules.computeIfAbsent(userKey, ignored -> dueForUser(device.getUserId(), now));
                    for (Reminder reminder : reminders) {
                        if (System.nanoTime() - started > Duration.ofSeconds(20).toNanos() || sends >= 50) break;
                        if (!withinWindow(reminder.notifyAt(), clock.instant())) continue;
                        String token = dao.claim(device.getSubscriptionId(), reminder.date(), reminder.time(), reminder.kind(), clock.instant());
                        if (token == null) continue;
                        sends++;
                        deliver(device, reminder, token);
                    }
                } catch (RuntimeException failedUser) { warnOnce(); }
            }
        } catch (RuntimeException unavailable) { warnOnce(); }
    }

    private void deliver(PushSubscription device, Reminder reminder, String token) {
        try {
            // 조회 뒤 설정을 끄거나 로그아웃한 경우에도 남은 발송을 중단
            PushSubscription current = dao.find(device.getEndpointHash());
            if (!dao.userEnabled(device.getUserId()) || current == null
                    || !device.getSubscriptionId().equals(current.getSubscriptionId())
                    || !device.getUserId().equals(current.getUserId())) {
                dao.finish(device.getSubscriptionId(), reminder.date(), reminder.time(), reminder.kind(), token, false, false, clock.instant());
                return;
            }
            int status = sender.send(device, payload(reminder), 120);
            if (status == 404 || status == 410) { dao.removeExpired(device.getSubscriptionId()); return; }
            boolean sent = status >= 200 && status < 300;
            boolean retry = status == 408 || status == 429 || status >= 500;
            dao.finish(device.getSubscriptionId(), reminder.date(), reminder.time(), reminder.kind(), token, sent, retry, clock.instant());
        } catch (Exception failed) {
            if (failed instanceof InterruptedException) Thread.currentThread().interrupt();
            dao.finish(device.getSubscriptionId(), reminder.date(), reminder.time(), reminder.kind(), token, false, true, clock.instant());
            warnOnce();
        }
    }

    List<Reminder> dueForUser(Long userId, Instant now) {
        LocalDate first = now.minusSeconds(120).atZone(KOREA).toLocalDate();
        LocalDate last = now.plusSeconds(1800).atZone(KOREA).toLocalDate();
        Map<String,Reminder> distinct = new LinkedHashMap<>();
        for (LocalDate date = first; !date.isAfter(last); date = date.plusDays(1)) {
            List<ScheduleDTO> daily = schedules.getDailySchedules(userId, date.toString());
            if (daily == null) continue;
            for (ScheduleDTO schedule : daily) {
                if (schedule == null || Boolean.FALSE.equals(schedule.getAlarmEnabled()) || Boolean.TRUE.equals(schedule.getIsCancelled())
                        || (schedule.getTakenAt() != null && !schedule.getTakenAt().isBlank())
                        || (schedule.getUserId() != null && !userId.equals(schedule.getUserId()))) continue;
                try {
                    if (schedule.getTime() == null || !schedule.getTime().matches("\\d{2}:\\d{2}")) continue;
                    LocalTime time = LocalTime.parse(schedule.getTime());
                    Instant doseAt = LocalDateTime.of(date, time).atZone(KOREA).toInstant();
                    for (String kind : List.of("PRE", "DUE")) {
                        Instant notifyAt = kind.equals("PRE") ? doseAt.minusSeconds(1800) : doseAt;
                        if (withinWindow(notifyAt, now)) {
                            Reminder reminder = new Reminder(date.toString(), time.toString(), kind, notifyAt);
                            distinct.put(reminder.date() + ":" + reminder.time() + ":" + kind, reminder);
                        }
                    }
                } catch (java.time.DateTimeException invalidTime) { /* 잘못된 저장 시각은 발송 대상에서 제외 */ }
            }
        }
        return new ArrayList<>(distinct.values());
    }

    static boolean withinWindow(Instant scheduled, Instant now) {
        Duration late = Duration.between(scheduled, now);
        return !late.isNegative() && late.compareTo(Duration.ofMinutes(2)) <= 0;
    }
    String payload(Reminder reminder) throws com.fasterxml.jackson.core.JsonProcessingException {
        boolean early = reminder.kind().equals("PRE");
        return json.writeValueAsString(Map.of("type", "medication-reminder", "title", "제때약 복약 알림",
            "body", early ? "30분 뒤 복약 시간이에요. 제때약에서 일정을 확인해 주세요." : "복약 시간이에요. 제때약에서 일정을 확인해 주세요.",
            "tag", "jette-yak-" + reminder.kind().toLowerCase() + "-" + reminder.date() + "-" + reminder.time(),
            "url", "/", "date", reminder.date(), "time", reminder.time(), "isPreAlarm", early));
    }
    private void warnOnce() {
        if (clock.millis() >= nextWarningAt) {
            nextWarningAt = clock.millis() + 300_000;
            LOG.warning("복약 푸시 전송 일부를 처리하지 못함. 서버 설정과 알림 저장소 연결 확인 필요");
        }
    }
    record Reminder(String date, String time, String kind, Instant notifyAt) { }
}
