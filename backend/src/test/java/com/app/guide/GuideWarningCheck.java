/** 기본 주의기록은 AI 호출 없이 전달하고, 상세 AI 설명은 필요할 때만 생성하는지 점검 */
package com.app.guide;

import java.util.List;
import java.util.Map;
import com.app.chatbot.client.GeminiService;
import com.app.guide.controller.MedicationGuideController;
import com.app.guide.dao.MedicationGuideDao;
import com.app.guide.dto.DurInfoDto;
import com.app.guide.dto.MedicationGuideDto;
import com.app.guide.service.DurGuideService;

public class GuideWarningCheck {
    private static int checks;
    private static void check(boolean passed, String description) {
        if (!passed) throw new AssertionError(description);
        checks++;
    }

    public static void main(String[] args) {
        var medication = new MedicationGuideDto();
        medication.setMedicationId("A");
        medication.setItemName("테스트약");
        medication.setUsageDosage("원문: 1일 2회, 1회 1정");
        var record = new DurInfoDto();
        record.setTabooType(3);
        record.setAgeBase("12세 미만");
        record.setTabooEffect("변경 없이 전달해야 하는 주의 원문");
        int[] generated = { 0 }, updated = { 0 };
        var dao = new MedicationGuideDao(null) {
            @Override public MedicationGuideDto find(String id) { return "A".equals(id) ? medication : null; }
            @Override public int updateAiSummary(String id, String summary) { updated[0]++; return 1; }
        };
        var dur = new DurGuideService(dao) {
            @Override public DurResult find(String id, String material) {
                return new DurResult("MATCHED", List.of(record), List.of(), List.of(), List.of());
            }
        };
        var gemini = new GeminiService() {
            @Override public String getOrGenerateMedicationSummary(String name, String type, String material, String efficacy, String usage) {
                generated[0]++;
                return "{\"summary\":\"테스트 설명\"}";
            }
        };
        var controller = new MedicationGuideController(dao, dur, gemini);
        var fast = controller.get("A", false);
        check(fast.getStatusCodeValue() == 200 && generated[0] == 0 && updated[0] == 0, "warning lookup avoids AI and AI cache writes");
        var body = (Map<?, ?>) fast.getBody();
        check(((DurGuideService.DurResult) body.get("dur")).items().get(0).getAgeBase().equals("12세 미만"), "age condition remains in warning response");
        check(((MedicationGuideDto) body.get("medication")).getUsageDosage().equals("원문: 1일 2회, 1회 1정"), "original dosage remains unchanged");
        controller.get("A", true);
        check(generated[0] == 1 && updated[0] == 1, "detail lookup generates and stores missing AI summary");
        controller.get("A", true);
        check(generated[0] == 1, "existing AI summary is reused");
        check(controller.get("missing", false).getStatusCodeValue() == 404, "missing product is still a missing product");
        System.out.println("PASS: " + checks + " guide warning and AI separation checks");
    }
}
