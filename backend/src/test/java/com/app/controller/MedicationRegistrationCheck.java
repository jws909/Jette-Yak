package com.app.controller;

import java.lang.reflect.Field;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpSession;
import org.springframework.http.ResponseEntity;
import org.springframework.web.server.ResponseStatusException;
import com.app.dao.ScheduleDAO;
import com.app.domain.User;
import com.app.guide.dao.MedicationGuideDao;
import com.app.mapper.UserMapper;
import com.app.util.UserAccess;

/** 실제 권한·등록 컨트롤러에 모의 DAO만 연결. DB 저장·외부 AI 호출 없이 회귀 검사. */
public class MedicationRegistrationCheck {
    private static int checks;
    private static int writes;
    private static final List<String> calls = new ArrayList<>();

    private static void check(boolean value, String message) {
        if (!value) throw new AssertionError(message);
        checks++;
    }

    private static void field(Object target, String name, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(name);
        field.setAccessible(true);
        field.set(target, value);
    }

    private static User user(long id, long family) {
        User user = new User();
        user.setUserId(id);
        user.setFamilyId(family);
        user.setLoginId("fixture" + id);
        user.setNickname("표시 이름 " + id);
        return user;
    }

    private static HttpServletRequest request(Long id) {
        Map<String, Object> attributes = new HashMap<>();
        if (id != null) attributes.put("userId", id);
        attributes.put("authenticated", id != null);
        HttpSession session = (HttpSession) Proxy.newProxyInstance(HttpSession.class.getClassLoader(),
                new Class<?>[] {HttpSession.class}, (proxy, method, args) -> {
                    if ("getAttribute".equals(method.getName())) return attributes.get(args[0]);
                    throw new AssertionError("Unexpected session method: " + method.getName());
                });
        return (HttpServletRequest) Proxy.newProxyInstance(HttpServletRequest.class.getClassLoader(),
                new Class<?>[] {HttpServletRequest.class}, (proxy, method, args) -> {
                    if ("getSession".equals(method.getName())) return session;
                    throw new AssertionError("Unexpected request method: " + method.getName());
                });
    }

    private static void denied(int expected, Runnable action, String message) {
        int before = writes;
        try {
            action.run();
            throw new AssertionError(message + ": request accepted");
        } catch (ResponseStatusException error) {
            check(error.getStatus().value() == expected, message);
        }
        check(writes == before, message + ": no save");
    }

    @SuppressWarnings("unchecked")
    private static void response(ResponseEntity<?> result, int status, boolean success, String message) {
        check(result.getStatusCodeValue() == status, message + ": HTTP status");
        check(Boolean.valueOf(success).equals(((Map<String, Object>) result.getBody()).get("success")),
                message + ": application result");
    }

    public static void main(String[] args) throws Exception {
        Map<Long, User> users = Map.of(1L, user(1, 10), 2L, user(2, 10), 3L, user(3, 20));
        UserMapper mapper = (UserMapper) Proxy.newProxyInstance(UserMapper.class.getClassLoader(),
                new Class<?>[] {UserMapper.class}, (proxy, method, values) -> switch (method.getName()) {
                    case "findById" -> users.get((Long) values[0]);
                    case "findByLoginId" -> users.values().stream()
                            .filter(value -> value.getLoginId().equals(values[0])).findFirst().orElse(null);
                    default -> throw new AssertionError("Unexpected user lookup: " + method.getName());
                });
        ScheduleDAO schedules = new ScheduleDAO() {
            @Override public boolean checkMedicationExists(String medicationId) {
                calls.add("product:" + medicationId);
                return "123".equals(medicationId);
            }
            @Override public Long findOrCreateCabinetId(Long userId, String medicationId) {
                check("123".equals(medicationId), "only an existing product reaches cabinet save");
                calls.add("cabinet:" + userId);
                writes++;
                return 17L;
            }
            @Override public Long findOrCreateRoutineId(Long userId, String name, String time, String notes, String medicationId) {
                check("비타민C".equals(name), "routine name retained");
                calls.add("routine:" + userId);
                writes++;
                return 18L;
            }
        };
        MedicationGuideDao guides = new MedicationGuideDao(null) {
            @Override public int updateStatus(long userId, String id, String status) {
                calls.add("state:" + userId + ":" + id + ":" + status);
                return 1;
            }
            @Override public int saveOverallGuide(long userId, String value) {
                calls.add("cache:" + userId);
                return 1;
            }
        };
        UserController controller = new UserController();
        field(controller, "userAccess", new UserAccess(mapper));
        field(controller, "userMapper", mapper);
        field(controller, "scheduleDAO", schedules);
        field(controller, "medicationGuideDao", guides);
        HttpServletRequest actor = request(1L);

        denied(401, () -> controller.addEverydayMed(Map.of("type", "CABINET", "medicationId", "123"), request(null)), "anonymous registration denied");
        denied(403, () -> controller.addEverydayMed(Map.of("userId", 3, "type", "CABINET", "medicationId", "123"), actor), "foreign family denied");
        denied(403, () -> controller.addEverydayMed(Map.of("userId", 1, "username", "표시 이름 1", "type", "CABINET", "medicationId", "123"), actor), "display name cannot authenticate as login ID");
        denied(400, () -> controller.addEverydayMed(Map.of("userId", "broken", "type", "CABINET", "medicationId", "123"), actor), "malformed target is not silently replaced with self");
        denied(400, () -> controller.addEverydayMed(Map.of("userId", -1, "type", "CABINET", "medicationId", "123"), actor), "nonpositive target denied");

        calls.clear();
        int before = writes;
        response(controller.addEverydayMed(Map.of("userId", 1, "type", "CABINET"), actor), 400, false, "missing product denied");
        check(calls.isEmpty() && writes == before, "missing product is rejected before DAO access");
        response(controller.addEverydayMed(Map.of("userId", 1, "type", "CABINET", "medicationId", "missing"), actor), 400, false, "stale cabinet product denied");
        check(writes == before, "stale cabinet product never reaches INSERT");
        response(controller.addEverydayMed(Map.of("userId", 1, "type", "ROUTINE", "name", "비타민C", "medicationId", "missing"), actor), 400, false, "stale routine product denied");
        check(writes == before, "stale routine product never reaches INSERT");

        calls.clear();
        response(controller.addEverydayMed(Map.of("userId", 1, "type", "CABINET", "medicationId", " 123 "), actor), 200, true, "self cabinet registration");
        check(calls.equals(List.of("product:123", "cabinet:1", "state:1:C:17:STORED", "cache:1")), "self save validates product and retains stored status");
        calls.clear();
        response(controller.addEverydayMed(Map.of("userId", 2, "type", "CABINET", "medicationId", "123"), actor), 200, true, "family cabinet registration");
        check(calls.contains("cabinet:2") && calls.contains("state:2:C:17:STORED"), "family request saves to selected member");
        calls.clear();
        response(controller.addEverydayMed(Map.of("type", "CABINET", "medicationId", "123"), actor), 200, true, "session defaults to self");
        check(calls.contains("cabinet:1"), "missing target uses authenticated session");
        calls.clear();
        response(controller.addEverydayMed(Map.of("userId", 2, "type", "ROUTINE", "name", "비타민C"), actor), 200, true, "family routine registration");
        check(calls.contains("routine:2") && calls.contains("state:2:R:18:PAUSED"), "family routine saved without fabricated product link");
        before = writes;
        response(controller.addEverydayMed(Map.of("userId", 1, "type", "QA_INVALID"), actor), 400, false, "invalid registration type denied");
        check(writes == before, "invalid type makes no write");
        System.out.println("PASS: medication registration " + checks + " checks");
    }
}
