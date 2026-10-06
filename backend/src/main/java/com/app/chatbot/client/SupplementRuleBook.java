package com.app.chatbot.client;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;
import javax.annotation.PostConstruct;
import javax.annotation.PreDestroy;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.springframework.stereotype.Component;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * 대규모 로컬 영양제 규칙 사전 & 자가 학습 캐시 엔진 (Fast RuleBook & Self-Learning Engine)
 * 
 * 1. 초고속 로컬 매칭 (0.1ms):
 *    - 50종 이상의 대표 건기식 성분 및 유명 브랜드 키워드를 정규식으로 즉시 매칭
 * 2. 동적 자가 학습 (Self-Learning):
 *    - 로컬 사전에 없는 생소한 영양제는 백그라운드(비동기)에서 AI에게 질의 후 로컬 캐시 및 파일에 자동 영구 누적
 * 3. 최신 트렌드 일일 자동 업데이트:
 *    - 24시간마다 AI를 통해 새로운 인기 영양제 트렌드를 학습하여 로컬 규칙을 최신 상태로 유지
 */
@Component
public class SupplementRuleBook {

    private static final Logger log = LogManager.getLogger(SupplementRuleBook.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    public static class Rule {
        private String takeTime;
        private String advice;

        public Rule() {}

        public Rule(String takeTime, String advice) {
            this.takeTime = takeTime;
            this.advice = advice;
        }

        public String getTakeTime() { return takeTime; }
        public void setTakeTime(String takeTime) { this.takeTime = takeTime; }
        public String getAdvice() { return advice; }
        public void setAdvice(String advice) { this.advice = advice; }
    }

    private static record RulePattern(Pattern pattern, Rule rule) {}

    // 정적 로컬 규칙 목록
    private final List<RulePattern> staticRules = new ArrayList<>();

    // AI로부터 동적으로 학습된 규칙 캐시 (메모리 + 파일 영속화)
    private final Map<String, Rule> dynamicRules = new ConcurrentHashMap<>();

    // 백그라운드 학습 및 일일 스케줄러 스레드 풀
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(2, r -> {
        Thread t = new Thread(r, "SupplementRuleLearner");
        t.setDaemon(true);
        return t;
    });

    @PostConstruct
    public void init() {
        initStaticRules();
        loadDynamicRulesFromFile();
        log.info("SupplementRuleBook 초기화 완료: 정적 규칙 {}개, 학습된 동적 규칙 {}개 적재됨", staticRules.size(), dynamicRules.size());
    }

    @PreDestroy
    public void destroy() {
        scheduler.shutdownNow();
    }

    /**
     * 50여 종 이상의 대규모 공인 영양학 가이드라인 정적 규칙 등록
     */
    private void initStaticRules() {
        // [1] 아침 공복 (07:30~08:00) - 위산 분비 전 장내 도달 및 아미노산 흡수 극대화
        addRule("(?i).*(유산균|프로바이오|프리바이오|신바이오|포스트바이오|락토핏|비피더스|낙산균|드롭스).*",
                "07:30", "아침 공복 권장 (장내 유익균 정착 도움)");
        addRule("(?i).*(철분|헴철|훼로|헤모|아이언).*",
                "07:30", "아침 공복 권장 (흡수율 향상, 비타민C와 권장)");
        addRule("(?i).*(아르기닌|아르기맥스).*",
                "08:00", "아침 공복 권장 (다른 아미노산 흡수 경쟁 방지)");
        addRule("(?i).*(글루타치온|백옥).*",
                "08:00", "아침 공복 또는 식전 권장 (생체이용률 극대화)");
        addRule("(?i).*(차전자피|식이섬유|실리엄).*",
                "07:30", "아침 식전 권장 (충분한 물과 함께 섭취)");

        // [2] 아침 식후 (08:30~09:00) - 에너지 대사 활성화 및 활력 충전 (야간 불면 예방)
        addRule("(?i).*(비타민\\s*b|비타민b|비맥스|임팩타민|아로나민|엑세라민|활성비타민|티아민|리보플라빈|나이아신|판토텐산|피리독신|코발라민).*",
                "09:00", "아침 식후 권장 (에너지 대사 및 활력 증진)");
        addRule("(?i).*(비타민\\s*c|비타민c|고려은단|아스코르브산|아세로라).*",
                "09:00", "아침 식후 권장 (위장 자극 예방 및 항산화)");
        addRule("(?i).*(홍삼|인삼|흑삼|산삼|진세노사이드|정관장).*",
                "08:30", "아침 복용 권장 (면역력 증진 및 피로 회복)");
        addRule("(?i).*(엽산|폴산|메틸엽산).*",
                "09:00", "아침 식후 권장 (세포 및 적혈구 형성 촉진)");
        addRule("(?i).*(비오틴|맥주효모|모발영양).*",
                "09:00", "아침 식후 권장 (단백질 대사 및 모발/손톱 영양)");
        addRule("(?i).*(프로폴리스|봉교).*",
                "09:00", "아침 식후 권장 (구강 및 신체 항균 케어)");
        addRule("(?i).*(은행잎|징코|기억력|혈행개선).*",
                "09:00", "아침 식후 권장 (혈액 순환 및 두뇌 활력)");
        addRule("(?i).*(NMN|엔엠엔|NAD|니코틴아미드).*",
                "09:00", "아침 식후 권장 (세포 에너지 생성 및 생체리듬 동기화)");

        // [3] 점심 식후 (12:30~13:00) - 지용성 영양소 및 식사 후 흡수율 극대화
        addRule("(?i).*(오메가\\s*3|오메가3|rTG|rtg|알티지|EPA|DHA|크릴오일|피쉬오일).*",
                "13:00", "점심 식후 권장 (지방 성분과 결합해 흡수율 향상)");
        addRule("(?i).*(루테인|지아잔틴|아스타잔틴|아이케어|눈건강|눈영양).*",
                "13:00", "점심 식후 권장 (지용성 카로티노이드 흡수 극대화)");
        addRule("(?i).*(비타민\\s*d|비타민d|콜레칼시페롤).*",
                "13:00", "점심 식후 권장 (지방 성분과 함께 흡수 효율 증대)");
        addRule("(?i).*(종합비타민|멀티비타민|센트룸|얼라이브|세노비스|투퍼데이).*",
                "12:30", "식후 권장 (위장 부담 경감 및 균형 흡수)");
        addRule("(?i).*(밀크씨슬|실리마린|엉겅퀴|간건강|우루사).*",
                "13:00", "식후 권장 (간세포 보호 및 피로 개선)");
        addRule("(?i).*(코엔자임|코큐텐|coq10|CoQ10|유비퀴논).*",
                "13:00", "점심 식후 권장 (지용성 항산화 성분 흡수 촉진)");
        addRule("(?i).*(쏘팔메토|옥타코사놀|로르산|전립선).*",
                "13:00", "점심 식후 권장 (지용성 기능 성분 흡수 증대)");
        addRule("(?i).*(msm|MSM|식이유황|콘드로이친|글루코사민|보스웰리아|관절).*",
                "13:00", "식후 권장 (관절 연골 보호 및 속쓰림 예방)");
        addRule("(?i).*(아연|징크|zinc|글루콘산아연).*",
                "13:00", "식후 권장 (공복 복용 시 메스꺼움 예방)");
        addRule("(?i).*(비타민\\s*[aek]|비타민[aek]|토코페롤).*",
                "13:00", "식후 권장 (지용성 비타민 흡수 효율 향상)");
        addRule("(?i).*(감마리놀렌산|달맞이꽃|보라지유).*",
                "13:00", "식후 권장 (필수 지방산 흡수 촉진)");
        addRule("(?i).*(스피루리나|클로렐라).*",
                "13:00", "식후 권장 (엽록소 및 영양소 흡수)");
        addRule("(?i).*(모로실|시네트롤|가르시니아|카테킨|다이어트|공액리놀레산).*",
                "12:30", "식사 전후 권장 (탄수화물 및 체지방 대사 지원)");
        addRule("(?i).*(베르베린|바나바|혈당).*",
                "12:30", "식사 직전 또는 식후 권장 (식후 혈당 상승 억제)");

        // [4] 저녁 / 취침 전 (21:00~22:00) - 근육/신경 이완, 숙면 및 야간 회복
        addRule("(?i).*(마그네슘|쌀마그네슘|글리시네이트|말레이트|마그).*",
                "21:30", "취침 전 권장 (근육 이완, 신경 안정 및 숙면)");
        addRule("(?i).*(칼슘|어골칼슘|해조칼슘|구연산칼슘|칼마디).*",
                "21:00", "저녁 식후 또는 취침 전 (신경 안정 및 뼈 대사)");
        addRule("(?i).*(테아닌|락티움|감태|멜라토닌|수면).*",
                "22:00", "취침 30분~1시간 전 권장 (스트레스 완화 및 숙면)");
        addRule("(?i).*(콜라겐|엘라스틴|히알루론산|이너뷰티).*",
                "22:00", "취침 전 권장 (야간 피부 재생 주기와 시너지)");
        addRule("(?i).*(타트체리|체리).*",
                "21:30", "취침 전 권장 (천연 멜라토닌 함유, 숙면 케어)");
    }

    private void addRule(String regex, String takeTime, String advice) {
        staticRules.add(new RulePattern(Pattern.compile(regex), new Rule(takeTime, advice)));
    }

    /**
     * 영양제 명칭으로 로컬 규칙 즉시 탐색 (소요 시간 0.1ms 미만)
     */
    public Rule findRule(String supplementName) {
        if (supplementName == null || supplementName.isBlank()) return null;
        String cleanName = supplementName.trim();
        String normalizedKey = cleanKey(cleanName);

        // 1. AI 학습된 동적 캐시 우선 확인
        Rule dynamicMatch = dynamicRules.get(normalizedKey);
        if (dynamicMatch != null) {
            return dynamicMatch;
        }

        // 2. 50+종 정적 규칙 패턴 매칭 확인
        for (RulePattern rp : staticRules) {
            if (rp.pattern.matcher(cleanName).find()) {
                return rp.rule;
            }
        }

        return null;
    }

    /**
     * 동적 캐시에 신규 학습 규칙 추가 및 파일 영속화
     */
    public synchronized void saveDynamicRule(String supplementName, String takeTime, String advice) {
        if (supplementName == null || supplementName.isBlank()) return;
        String normalizedKey = cleanKey(supplementName);
        Rule rule = new Rule(takeTime, advice);
        dynamicRules.put(normalizedKey, rule);
        saveDynamicRulesToFile();
        log.info("[SupplementRuleBook] 신규 영양제 규칙 학습 및 저장 완료: {} -> {} / {}", supplementName, takeTime, advice);
    }

    private String cleanKey(String str) {
        return str.replaceAll("\\s+", "").toLowerCase();
    }

    private Path getStoragePath() {
        return Path.of(System.getProperty("user.home"), ".jette_yak", "supplement_rules.json");
    }

    private void loadDynamicRulesFromFile() {
        try {
            Path path = getStoragePath();
            if (Files.isRegularFile(path)) {
                byte[] bytes = Files.readAllBytes(path);
                if (bytes.length > 0) {
                    Map<String, Rule> map = MAPPER.readValue(bytes, new TypeReference<Map<String, Rule>>() {});
                    if (map != null) {
                        dynamicRules.putAll(map);
                    }
                }
            }
        } catch (Exception ex) {
            log.warn("동적 영양제 규칙 파일 로드 실패: {}", ex.getMessage());
        }
    }

    private void saveDynamicRulesToFile() {
        try {
            Path path = getStoragePath();
            Files.createDirectories(path.getParent());
            MAPPER.writerWithDefaultPrettyPrinter().writeValue(path.toFile(), dynamicRules);
        } catch (Exception ex) {
            log.warn("동적 영양제 규칙 파일 저장 실패: {}", ex.getMessage());
        }
    }

    /**
     * 로컬 사전에 없는 생소한 영양제 비동기 백그라운드 AI 학습
     */
    public void learnAsync(String supplementName, GeminiService geminiService, Long userId, Long routineId, com.app.dao.ScheduleDAO scheduleDAO) {
        if (supplementName == null || supplementName.isBlank() || geminiService == null || !geminiService.isAvailable()) {
            return;
        }

        scheduler.execute(() -> {
            try {
                log.info("[SupplementRuleBook] 미등록 영양제 백그라운드 AI 학습 시작: {}", supplementName);
                Map<String, Object> aiRec = geminiService.queryGeminiDirectlyForSupplement(supplementName);
                if (aiRec != null && Boolean.TRUE.equals(aiRec.get("isSupplement"))) {
                    String time = aiRec.get("takeTime") != null ? aiRec.get("takeTime").toString().trim() : null;
                    String advice = aiRec.get("advice") != null ? aiRec.get("advice").toString().trim() : null;

                    if (advice == null || advice.isBlank()) {
                        advice = "식후 권장 (건강기능식품)";
                    }

                    saveDynamicRule(supplementName, time, advice);

                    // DB routine_medications 레코드 보완
                    if (userId != null && routineId != null && scheduleDAO != null) {
                        try {
                            if (advice != null && !advice.isBlank()) {
                                scheduleDAO.updateRoutineNotes(routineId, advice);
                            }
                        } catch (Exception ignored) {}
                    }
                }
            } catch (Exception ex) {
                log.warn("[SupplementRuleBook] 백그라운드 AI 학습 오류 ({}): {}", supplementName, ex.getMessage());
            }
        });
    }

    /**
     * 24시간마다 최신 트렌드 신규 건강기능식품 성분을 AI에게 질의하여 로컬 규칙 업데이트
     */
    public void scheduleDailyTrendUpdate(GeminiService geminiService) {
        scheduler.scheduleAtFixedRate(() -> {
            try {
                if (geminiService == null || !geminiService.isAvailable()) return;
                log.info("[SupplementRuleBook] 최신 인기 건강기능식품 일일 자동 동기화 시작...");
                List<Map<String, String>> trendyList = geminiService.fetchTrendingSupplements();
                if (trendyList != null) {
                    for (Map<String, String> item : trendyList) {
                        String name = item.get("name");
                        String time = item.get("takeTime");
                        String advice = item.get("advice");
                        if (name != null && !name.isBlank()) {
                            saveDynamicRule(name, time, advice);
                        }
                    }
                }
                log.info("[SupplementRuleBook] 최신 인기 건강기능식품 일일 자동 동기화 완료 (현재 총 {}개 동적 규칙 보유)", dynamicRules.size());
            } catch (Exception ex) {
                log.warn("[SupplementRuleBook] 일일 트렌드 동기화 실패: {}", ex.getMessage());
            }
        }, 1, 24, TimeUnit.HOURS);
    }
}
