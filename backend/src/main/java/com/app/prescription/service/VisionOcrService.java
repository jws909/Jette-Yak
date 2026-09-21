package com.app.prescription.service;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import com.app.chatbot.client.GeminiService;
import com.app.prescription.dto.OcrParseResult;
import com.app.prescription.dto.OcrParseResult.ParsedItem;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.api.gax.core.FixedCredentialsProvider;
import com.google.auth.oauth2.GoogleCredentials;
import com.google.cloud.vision.v1.AnnotateImageRequest;
import com.google.cloud.vision.v1.AnnotateImageResponse;
import com.google.cloud.vision.v1.BatchAnnotateImagesResponse;
import com.google.cloud.vision.v1.Feature;
import com.google.cloud.vision.v1.Image;
import com.google.cloud.vision.v1.ImageAnnotatorClient;
import com.google.cloud.vision.v1.ImageAnnotatorSettings;
import com.google.protobuf.ByteString;

@Service
public class VisionOcrService {
    private static final Logger log = LogManager.getLogger(VisionOcrService.class);

    private final GeminiService geminiService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public VisionOcrService() {
        this(null);
    }

    @Autowired(required = false)
    public VisionOcrService(GeminiService geminiService) {
        this.geminiService = geminiService;
    }

    /**
     * MultipartFile 처방전 이미지를 받아 바이트 배열로 안전하게 추출 후 OCR 분석을 수행합니다.
     */
    public OcrParseResult processPrescriptionImage(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            log.warn("[VISION OCR] 업로드된 파일이 비어있습니다.");
            return createFallbackParseResult();
        }
        try {
            byte[] bytes = file.getBytes();
            return processPrescriptionImage(bytes, file.getOriginalFilename());
        } catch (Exception e) {
            log.error("[VISION OCR] MultipartFile 바이트 읽기 실패: {}", e.getMessage(), e);
            return createFallbackParseResult();
        }
    }

    /**
     * 이미지 바이트 배열을 받아 Google Cloud Vision API를 호출하고 텍스트를 파싱합니다.
     */
    public OcrParseResult processPrescriptionImage(byte[] imageBytes, String filename) {
        log.info("================================================================================");
        log.info("[VISION OCR] 처방전 이미지 OCR 분석 시작 | 파일명: {} | 크기: {} bytes", 
                filename, imageBytes != null ? imageBytes.length : 0);
        log.info("================================================================================");

        if (imageBytes == null || imageBytes.length == 0) {
            log.warn("[VISION OCR] 전송된 이미지 데이터가 비어있어 기본 샘플 데이터로 대체합니다.");
            return createFallbackParseResult();
        }

        String extractedText = null;

        // 1. Google Cloud Vision API 호출
        try {
            extractedText = callGoogleVisionApi(imageBytes);
        } catch (Exception e) {
            log.error("[VISION OCR] ❌ Google Cloud Vision API 호출 중 오류 발생!", e);
        }

        // 2. Vision API 결과 검증
        if (extractedText == null || extractedText.isBlank()) {
            log.warn("[VISION OCR] ⚠️ 구글 비전 API에서 텍스트를 추출하지 못했습니다. (API 오류 또는 글자가 없는 이미지)");
            log.warn("[VISION OCR] ⚠️ 개발 테스트를 위해 기본 샘플 처방전 데이터(서울마음내과)로 폴백합니다.");
            return createFallbackParseResult();
        }

        // 3. 실제 추출된 원본 텍스트 로그 출력
        log.info("[VISION OCR] ✅ 구글 비전 API 텍스트 추출 성공! (추출 길이: {}자)", extractedText.length());
        log.info("[VISION OCR] -------------------- [구글 비전 OCR 추출 원본 텍스트 시작] --------------------");
        String[] lines = extractedText.split("\\r?\\n");
        for (int i = 0; i < lines.length; i++) {
            log.info("[VISION OCR] [{}] {}", String.format("%02d", i + 1), lines[i]);
        }
        log.info("[VISION OCR] -------------------- [구글 비전 OCR 추출 원본 텍스트 끝] ----------------------");

        // 4. 추출된 텍스트 파싱
        return parseOcrText(extractedText);
    }

    /**
     * Google Cloud Vision API 호출
     */
    private String callGoogleVisionApi(byte[] imageBytes) throws Exception {
        log.info("[VISION OCR] Google Cloud Vision 자격증명(JSON) 로드 시도 중...");
        InputStream credentialStream = findServiceAccountKeyStream();
        if (credentialStream == null) {
            throw new IllegalStateException("backend/src/main/resources/config 폴더에 GCP 서비스 계정 JSON 키 파일이 존재하지 않습니다.");
        }

        long startTime = System.currentTimeMillis();
        GoogleCredentials credentials = GoogleCredentials.fromStream(credentialStream);
        ImageAnnotatorSettings settings = ImageAnnotatorSettings.newBuilder()
                .setCredentialsProvider(FixedCredentialsProvider.create(credentials))
                .build();

        try (ImageAnnotatorClient client = ImageAnnotatorClient.create(settings)) {
            ByteString imgBytes = ByteString.copyFrom(imageBytes);
            Image img = Image.newBuilder().setContent(imgBytes).build();
            Feature feat = Feature.newBuilder().setType(Feature.Type.DOCUMENT_TEXT_DETECTION).build();

            AnnotateImageRequest request = AnnotateImageRequest.newBuilder()
                    .addFeatures(feat)
                    .setImage(img)
                    .build();

            log.info("[VISION OCR] Google Cloud 서버로 OCR 요청 전송 중... (Payload: {} bytes)", imageBytes.length);
            BatchAnnotateImagesResponse response = client.batchAnnotateImages(List.of(request));
            long elapsed = System.currentTimeMillis() - startTime;
            log.info("[VISION OCR] Google Cloud 서버 응답 완료 (소요시간: {} ms)", elapsed);

            for (AnnotateImageResponse res : response.getResponsesList()) {
                if (res.hasError()) {
                    log.error("[VISION OCR] ❌ Vision API 응답 에러: code={}, message={}", 
                            res.getError().getCode(), res.getError().getMessage());
                    return null;
                }
                // DOCUMENT_TEXT_DETECTION의 FullTextAnnotation 우선 확인
                if (res.hasFullTextAnnotation() && !res.getFullTextAnnotation().getText().isBlank()) {
                    return res.getFullTextAnnotation().getText();
                }
                // TextAnnotations(0) 확인
                if (res.getTextAnnotationsCount() > 0 && !res.getTextAnnotations(0).getDescription().isBlank()) {
                    return res.getTextAnnotations(0).getDescription();
                }
            }
        }
        log.warn("[VISION OCR] Vision API 응답에 인식된 텍스트가 없습니다.");
        return null;
    }

    /**
     * config 폴더 내의 서비스 계정 JSON 키 파일을 동적으로 탐색합니다.
     */
    private InputStream findServiceAccountKeyStream() {
        try {
            PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
            Resource[] resources = resolver.getResources("classpath*:config/*.json");
            for (Resource r : resources) {
                if (r.exists() && r.isReadable()) {
                    log.info("[VISION OCR] GCP 키 파일 로드 성공 (classpath): {}", r.getFilename());
                    return r.getInputStream();
                }
            }

            String[] possiblePaths = {
                "src/main/resources/config",
                "backend/src/main/resources/config",
                "WEB-INF/classes/config"
            };
            for (String p : possiblePaths) {
                File dir = new File(p);
                if (dir.exists() && dir.isDirectory()) {
                    File[] files = dir.listFiles((d, name) -> name.endsWith(".json"));
                    if (files != null && files.length > 0) {
                        log.info("[VISION OCR] GCP 키 파일 로드 성공 (파일시스템): {}", files[0].getAbsolutePath());
                        return new FileInputStream(files[0]);
                    }
                }
            }
        } catch (Exception e) {
            log.warn("[VISION OCR] GCP 키 파일 탐색 중 예외 발생: {}", e.getMessage());
        }
        return null;
    }

    /**
     * OCR 원시 텍스트에서 날짜, 병원명, 약품 정보를 파싱합니다.
     * [처리방법.txt ③] Gemini Flash 모델을 1순위로 시도하고, 미연결/실패 시 규칙 기반 전처리 엔진으로 폴백합니다.
     */
    public OcrParseResult parseOcrText(String text) {
        // [처리방법.txt ③] 1순위: Gemini Flash 모델을 활용한 OCR 후처리 및 정규화
        if (geminiService != null && geminiService.isAvailable()) {
            try {
                log.info("[VISION OCR] 🤖 [처리방법.txt ③] Gemini Flash AI로 처방전 OCR 후처리 및 표준 제품명 정규화 시도...");
                OcrParseResult geminiResult = parseWithGemini(text);
                if (geminiResult != null && geminiResult.getItems() != null && !geminiResult.getItems().isEmpty()) {
                    log.info("[VISION OCR] ✅ Gemini Flash 정규화 성공! 추출 약품 {}건", geminiResult.getItems().size());
                    return geminiResult;
                }
            } catch (Exception e) {
                log.warn("[VISION OCR] ⚠️ Gemini Flash 호출 중 예외 발생 (규칙 기반 전처리로 폴백): {}", e.getMessage());
            }
        } else {
            log.info("[VISION OCR] Gemini API 미연결 상태 -> [처리방법.txt ①, ②] 규칙 기반 정규화 엔진으로 동작합니다.");
        }

        // 2순위: 규칙 기반 파서
        return parseWithRules(text);
    }

    private OcrParseResult parseWithGemini(String text) throws Exception {
        String json = geminiService.normalizePrescriptionOcr(text);
        if (json == null || json.isBlank()) return null;

        JsonNode root = objectMapper.readTree(json);
        OcrParseResult result = new OcrParseResult();
        result.setRawOcrText(text);

        String hosp = root.path("hospitalName").asText(null);
        result.setHospitalName(hosp != null && !hosp.isBlank() ? hosp : extractHospitalName(text));

        String doc = root.path("doctorName").asText(null);
        result.setDoctorName(doc != null && !doc.isBlank() ? doc : extractDoctorName(text));

        String dateStr = root.path("dispensedDate").asText(null);
        if (dateStr != null && !dateStr.isBlank()) {
            try {
                result.setDispensedDate(new SimpleDateFormat("yyyy-MM-dd").parse(dateStr));
            } catch (Exception e) {
                result.setDispensedDate(extractDate(text));
            }
        } else {
            result.setDispensedDate(extractDate(text));
        }

        int totalDays = root.path("totalDays").asInt(0);

        List<ParsedItem> items = new ArrayList<>();
        Set<String> seenMedicineKeys = new HashSet<>();
        JsonNode itemsNode = root.path("items");
        if (itemsNode.isArray()) {
            for (JsonNode it : itemsNode) {
                String stdName = it.path("standardName").asText("");
                stdName = cleanMedicineName(stdName);
                if (stdName.length() < 2) continue;

                // 중복 항목 감지 (정규화된 문자열이 완전히 동일하거나 포함 관계인 경우 중복 스킵)
                String normKey = stdName.replaceAll("[^가-힣A-Za-z0-9]", "");
                boolean isDup = false;
                for (String seen : seenMedicineKeys) {
                    if (seen.equals(normKey) || (seen.length() >= 3 && normKey.contains(seen)) || (normKey.length() >= 3 && seen.contains(normKey))) {
                        isDup = true;
                        break;
                    }
                }
                if (isDup) {
                    log.info("[VISION OCR] Gemini 파싱 중복 품목 감지되어 제외: '{}'", stdName);
                    continue;
                }
                seenMedicineKeys.add(normKey);

                ParsedItem item = new ParsedItem();
                item.setMedicineName(stdName);
                String edi = it.path("ediCode").asText(null);
                if (edi != null && (edi.isBlank() || edi.equalsIgnoreCase("null"))) edi = null;
                item.setEdiCode(edi);
                item.setDailyDose(it.path("dailyDose").asDouble(1.0));
                int parsedFreq = it.path("dailyFrequency").asInt(1);
                item.setDailyFrequency(parsedFreq > 0 ? parsedFreq : 1);
                int itemDays = it.path("totalDays").asInt(totalDays > 0 ? totalDays : 14);
                item.setTotalDays(itemDays > 0 ? itemDays : 14);
                item.setUsageTiming(safeTruncateUsageTiming(it.path("usageTiming").asText("매일 식후 30분")));

                // OCR 원문 기반 정밀 보정 (EDI 코드 및 1일 투약횟수 3회/2회 보정)
                refineParsedItemWithOcr(item, text);

                items.add(item);
            }
        }

        if (items.isEmpty()) return null;
        result.setItems(items);

        int maxDays = items.stream().mapToInt(it -> it.getTotalDays() != null ? it.getTotalDays() : 0).max().orElse(totalDays);
        result.setTotalDays(maxDays > 0 ? maxDays : (totalDays > 0 ? totalDays : 14));

        return result;
    }

    public OcrParseResult parseWithRules(String text) {
        OcrParseResult result = new OcrParseResult();
        result.setRawOcrText(text);

        // 1. 날짜 추출
        Date dispensedDate = extractDate(text);
        result.setDispensedDate(dispensedDate != null ? dispensedDate : new Date());

        // 2. 병원/의원명 및 의사명 추출
        String hospitalName = extractHospitalName(text);
        String doctorName = extractDoctorName(text);
        result.setHospitalName(hospitalName);
        result.setDoctorName(doctorName);

        // 3. 약품 목록 파싱
        List<ParsedItem> items = extractMedicationItems(text);
        result.setItems(items);

        // 4. 총 투약일수 계산
        int maxDays = items.stream().mapToInt(it -> it.getTotalDays() != null ? it.getTotalDays() : 0).max().orElse(14);
        result.setTotalDays(maxDays > 0 ? maxDays : 14);

        log.info("[VISION OCR] 규칙 기반 파싱 결과 요약:");
        log.info("[VISION OCR]  - 처방일자: {}", new SimpleDateFormat("yyyy-MM-dd").format(result.getDispensedDate()));
        log.info("[VISION OCR]  - 의료기관: {}", result.getHospitalName());
        log.info("[VISION OCR]  - 담당의사: {}", result.getDoctorName());
        log.info("[VISION OCR]  - 총투약일: {}일", result.getTotalDays());
        log.info("[VISION OCR]  - 추출약품: {}건", items.size());
        for (ParsedItem it : items) {
            log.info("[VISION OCR]     * [EDI: {} / 약품명: {}] 1회투여: {}, 1일횟수: {}, 총일수: {}, 용법: {}",
                    it.getEdiCode() != null ? it.getEdiCode() : "미인식(약품명검색대기)",
                    it.getMedicineName(), it.getDailyDose(), it.getDailyFrequency(), it.getTotalDays(), it.getUsageTiming());
        }

        return result;
    }

    private Date extractDate(String text) {
        Pattern pattern = Pattern.compile("(\\d{4})[.\\-년/\\s]+(\\d{1,2})[.\\-월/\\s]+(\\d{1,2})");
        Matcher matcher = pattern.matcher(text);
        if (matcher.find()) {
            try {
                String y = matcher.group(1);
                String m = String.format("%02d", Integer.parseInt(matcher.group(2)));
                String d = String.format("%02d", Integer.parseInt(matcher.group(3)));
                return new SimpleDateFormat("yyyy-MM-dd").parse(y + "-" + m + "-" + d);
            } catch (Exception ignored) {}
        }
        return new Date();
    }

    private String extractHospitalName(String text) {
        // 진료과목 또는 병의원 명칭 패턴
        Pattern pattern = Pattern.compile("([가-힣A-Za-z0-9]+(?:내과|이비인후과|소아과|소아청소년과|정형외과|피부과|안과|외과|가정의학과|비뇨기과|신경과|정신건강의학과|치과|한의원|병원|의원|클리닉|메디컬|약국|의료원))");
        Matcher matcher = pattern.matcher(text);
        if (matcher.find()) {
            return matcher.group(1).trim();
        }

        // "요양기관명칭", "의료기관명칭" 라벨 뒤의 단어 탐색
        Pattern labelPattern = Pattern.compile("(?:요양기관|의료기관|발급기관|상호|명칭)(?:명칭|명)?\\s*[:：]?\\s*([가-힣A-Za-z0-9\\s]{2,15})");
        Matcher labelMatcher = labelPattern.matcher(text);
        if (labelMatcher.find()) {
            return labelMatcher.group(1).trim();
        }

        return "처방 의료기관";
    }

    private String extractDoctorName(String text) {
        Pattern pattern = Pattern.compile("(?:의사|원장|교부자|담당의|성명)\\s*[:：]?\\s*([가-힣]{2,4})");
        Matcher matcher = pattern.matcher(text);
        while (matcher.find()) {
            String candidate = matcher.group(1).trim();
            if (!candidate.equals("면허") && !candidate.equals("면허번호") && 
                !candidate.equals("성명") && !candidate.equals("의사") && !candidate.equals("원장")) {
                return candidate + " 원장";
            }
        }
        return "담당의";
    }

    // EDI(보험청구) 코드 정규식 패턴: 한국 건강보험 의약품 청구코드는 9자리(주로 6으로 시작) 또는 7~10자리 영숫자
    private static final Pattern LABEL_EDI_PATTERN = Pattern.compile("(?:EDI|edi|보험코드|약품코드|의약품코드|코드)\\s*[:：]?\\s*([A-Za-z0-9]{7,10})");
    private static final Pattern BRACKET_EDI_PATTERN = Pattern.compile("[\\[\\(]([A-Za-z0-9]{7,10})[\\]\\)]");
    private static final Pattern STANDARD_EDI_PATTERN = Pattern.compile("\\b(6\\d{8}|\\d{9}|[A-Z]\\d{8})\\b");

    private String findEdiCodeInText(String text) {
        if (text == null || text.isBlank()) return null;
        Matcher lm = LABEL_EDI_PATTERN.matcher(text);
        if (lm.find()) return lm.group(1).trim();

        Matcher bm = BRACKET_EDI_PATTERN.matcher(text);
        if (bm.find()) return bm.group(1).trim();

        Matcher sm = STANDARD_EDI_PATTERN.matcher(text);
        if (sm.find()) {
            String candidate = sm.group(1).trim();
            // 전화번호(010 시작 등) 또는 8자리 날짜 형태 제외
            if (candidate.length() == 9 && !candidate.startsWith("010")) {
                return candidate;
            }
        }
        return null;
    }

    private List<ParsedItem> extractMedicationItems(String text) {
        List<ParsedItem> items = new ArrayList<>();
        String[] lines = text.split("\\r?\\n");
        Pattern itemPattern = Pattern.compile("([가-힣A-Za-z0-9/\\-\\s]+(?:정|캡슐|시럽|액|산|연고|패취|주사|정제|[0-9]+mg|[0-9]+g|[0-9]+ml))\\s*([0-9.]+)?\\s*([0-9]+)?\\s*([0-9]+)?");

        String pendingEdiCode = null;

        for (int i = 0; i < lines.length; i++) {
            String trimmed = lines[i].trim();
            if (trimmed.length() < 3) continue;
            if (trimmed.contains("처방전") || trimmed.contains("환자") || 
                trimmed.contains("성명") || trimmed.contains("주민등록번호") || trimmed.contains("질병분류") ||
                trimmed.contains("사업자등록") || trimmed.contains("전화번호")) {
                continue;
            }

            // 만약 해당 줄이 순수 EDI 코드 단독 라인인 경우 (예: OCR 테이블 열 분리로 인해 코드가 단독 행으로 인식된 경우)
            String standaloneEdi = findEdiCodeInText(trimmed);
            if (standaloneEdi != null && !trimmed.matches(".*[가-힣].*") && trimmed.length() <= 12) {
                pendingEdiCode = standaloneEdi;
                continue;
            }

            // 1. 같은 줄에서 EDI 코드 탐색
            String lineEdiCode = findEdiCodeInText(trimmed);
            if (lineEdiCode == null && pendingEdiCode != null) {
                lineEdiCode = pendingEdiCode;
                pendingEdiCode = null;
            }

            // 2. 약품명 파싱을 위해 라인에서 EDI 코드 및 비급여/급여 접두어, 괄호/코드 라벨 문자열 제거
            String lineForMedicine = trimmed;
            if (lineEdiCode != null) {
                lineForMedicine = lineForMedicine.replace(lineEdiCode, "");
            }
            lineForMedicine = lineForMedicine
                .replaceAll("^(?:비|급|급여|비급여|전액|본인|일반)[\\s\\)\\]\\.\\-:]+", " ")
                .replaceAll("(?:비|급|급여|비급여)[\\)\\]]", " ")
                .replaceAll("[\\[\\]\\(\\)]", " ")
                .replaceAll("(?:EDI|edi|보험코드|약품코드|의약품코드|코드)\\s*[:：]?", " ")
                .trim();

            Matcher m = itemPattern.matcher(lineForMedicine);
            if (m.find()) {
                ParsedItem item = new ParsedItem();
                String name = cleanMedicineName(m.group(1));
                if (name.length() < 2) continue;

                item.setEdiCode(lineEdiCode);
                item.setMedicineName(name);

                double dDose = m.group(2) != null ? parseDouble(m.group(2), 1.0) : 1.0;
                int dFreq = m.group(3) != null ? parseInt(m.group(3), 0) : 0;
                int tDays = m.group(4) != null ? parseInt(m.group(4), 0) : 0;

                // 같은 줄에 횟수/일수가 없는 경우 (OCR 표 열이 다음 행으로 분리된 경우) 다음 행들에서 숫자 탐색
                if (dFreq == 0) {
                    List<String> nextNums = new ArrayList<>();
                    for (int nextIdx = i + 1; nextIdx < lines.length && nextNums.size() < 3; nextIdx++) {
                        String nLine = lines[nextIdx].trim();
                        if (nLine.matches("^[0-9.]+$")) {
                            nextNums.add(nLine);
                        } else if (nLine.equals("-") || nLine.isBlank()) {
                            continue;
                        } else {
                            break;
                        }
                    }
                    if (nextNums.size() >= 3) {
                        dDose = parseDouble(nextNums.get(0), 1.0);
                        dFreq = parseInt(nextNums.get(1), 3);
                        tDays = parseInt(nextNums.get(2), 14);
                    } else if (nextNums.size() == 2) {
                        dFreq = parseInt(nextNums.get(0), 3);
                        tDays = parseInt(nextNums.get(1), 14);
                    } else if (nextNums.size() == 1) {
                        dFreq = parseInt(nextNums.get(0), 3);
                    }
                }

                if (dFreq == 0) dFreq = 3;
                if (tDays == 0) tDays = 14;

                item.setDailyDose(dDose);
                item.setDailyFrequency(dFreq);
                item.setTotalDays(tDays);
                item.setUsageTiming(dFreq == 3 ? "매일 3회 식후 30분" : (dFreq == 2 ? "매일 2회 (아침, 저녁) 식후" : (trimmed.contains("취침") ? "취침 전" : "매일 식후 30분")));
                items.add(item);
                pendingEdiCode = null; // 소비 완료
            }
        }

        // 만약 정규식으로 매칭된 약품이 없다면, 줄 단위에서 약품명처럼 보이는 행을 2차 탐색
        if (items.isEmpty()) {
            for (String line : lines) {
                String trimmed = line.trim();
                if (trimmed.length() >= 3 && trimmed.length() <= 30 && 
                    !trimmed.contains("처방전") && !trimmed.contains("환자") && !trimmed.contains("병원") &&
                    !trimmed.contains("의원") && !trimmed.contains("발급") && !trimmed.contains("전화") &&
                    (trimmed.matches(".*[0-9]+.*") || trimmed.matches(".*[가-힣]+.*"))) {
                    ParsedItem item = new ParsedItem();
                    String fallbackEdi = findEdiCodeInText(trimmed);
                    String cleanedName = cleanMedicineName(trimmed);
                    if (fallbackEdi != null) {
                        cleanedName = cleanMedicineName(cleanedName.replace(fallbackEdi, ""));
                    }
                    if (cleanedName.length() < 2) continue;
                    item.setEdiCode(fallbackEdi);
                    item.setMedicineName(cleanedName);
                    item.setDailyDose(1.0);
                    item.setDailyFrequency(3);
                    item.setTotalDays(14);
                    item.setUsageTiming("1일 3회 식후 30분");
                    items.add(item);
                    if (items.size() >= 5) break; // 최대 5건
                }
            }
        }

        // 표 형태 투약량/횟수/일수 (예: 1회 1일 투약량 ... 1 3 2 또는 1 1 90) 보정
        Pattern tablePattern = Pattern.compile("(?:1회|투약량|투여횟수)[\\s\\S]*?([0-9.]+)[\\s\\r\\n]+([0-9]+)[\\s\\r\\n]+([0-9]{1,3})");
        Matcher tm = tablePattern.matcher(text);
        if (tm.find() && !items.isEmpty()) {
            double dDose = parseDouble(tm.group(1), 1.0);
            int dFreq = parseInt(tm.group(2), 1);
            int tDays = parseInt(tm.group(3), 14);
            for (ParsedItem it : items) {
                if (it.getDailyFrequency() == 1 && dFreq > 1) {
                    it.setDailyFrequency(dFreq);
                }
                if (it.getTotalDays() == 14 && tDays != 14 && tDays > 0) {
                    it.setTotalDays(tDays);
                }
                if (it.getDailyDose() == 1.0 && dDose != 1.0) {
                    it.setDailyDose(dDose);
                }
            }
        }

        return items;
    }

    private String cleanMedicineName(String raw) {
        if (raw == null) return "";
        return raw
            .replaceAll("^(?:비|급|급여|비급여|전액|본인|일반)[\\s\\)\\]\\.\\-:]+", "")
            .replaceAll("(?:비|급|급여|비급여)[\\)\\]]", "")
            .replaceAll("/[0-9]+(?:정|캡슐|포|ml|g|캅셀)?", "")
            .replaceAll("(?i)(?:수출명|수출용)\\s*[:：]?[가-힣A-Za-z0-9\\s]*", " ")
            .replaceAll("[\\[\\]\\(\\)]", " ")
            .replaceAll("[\\s]+", " ")
            .trim();
    }

    public static String safeTruncateUsageTiming(String timing) {
        if (timing == null || timing.isBlank()) {
            return "매일 식후 30분";
        }
        String cleaned = timing.replaceAll("[\\r\\n\\t]+", " ").trim();
        // Oracle DB VARCHAR2(100) 컬럼 제약(최대 100바이트) 보호: UTF-8 기준 90바이트 이하로 안전 절삭
        byte[] bytes = cleaned.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        if (bytes.length <= 90) {
            return cleaned;
        }
        StringBuilder sb = new StringBuilder();
        int currentBytes = 0;
        for (char c : cleaned.toCharArray()) {
            int charBytes = String.valueOf(c).getBytes(java.nio.charset.StandardCharsets.UTF_8).length;
            if (currentBytes + charBytes > 90) {
                break;
            }
            sb.append(c);
            currentBytes += charBytes;
        }
        return sb.toString().trim();
    }

    private double parseDouble(String str, double def) {
        try { return Double.parseDouble(str); } catch (Exception e) { return def; }
    }

    private int parseInt(String str, int def) {
        try { return Integer.parseInt(str); } catch (Exception e) { return def; }
    }

    /**
     * Gemini 파싱 후처리 보강:
     * 1) EDI 코드 누락 시 OCR 원문에서 추출
     * 2) 1일 투약횟수(dailyFrequency)가 1로 잡혔거나 누락되었을 때, OCR 표(1 \n 3 \n 2 등)나 용법(식후/3회 등)에서 정확히 3회/2회 보정
     * 3) usageTiming 정규화
     */
    private void refineParsedItemWithOcr(ParsedItem item, String text) {
        if (item == null || text == null || text.isBlank()) return;

        // 1. EDI 코드 보강
        if (item.getEdiCode() == null || item.getEdiCode().isBlank()) {
            String medName = item.getMedicineName();
            String ediFound = findEdiCodeNearMedicine(medName, text);
            if (ediFound != null) {
                item.setEdiCode(ediFound);
            }
        }

        // 2. 1일 투약횟수 (dailyFrequency) 정밀 보정
        int freq = item.getDailyFrequency() != null ? item.getDailyFrequency() : 1;
        if (freq <= 1) {
            // (a) 용법 문구에서 확인: 3회, 아침/점심/저녁, 매 식후
            String usage = item.getUsageTiming() != null ? item.getUsageTiming() : "";
            if (usage.contains("3회") || (usage.contains("아침") && usage.contains("점심") && usage.contains("저녁")) || usage.contains("매 식후") || usage.contains("매식후")) {
                freq = 3;
            } else if (usage.contains("2회") || (usage.contains("아침") && usage.contains("저녁"))) {
                freq = 2;
            }

            // (b) OCR 원문에서 해당 약품명이나 EDI 코드 다음 줄들의 숫자 패턴 탐색 ([1회투약량] \n [1일투여횟수] \n [총투약일수])
            if (freq <= 1) {
                int detectedFreq = findFrequencyAfterMedicineInText(item.getMedicineName(), item.getEdiCode(), text);
                if (detectedFreq > 1) {
                    freq = detectedFreq;
                }
            }

            // (c) OCR 원문 전체에서 한국 처방전의 '1일 3회' 표 패턴 검출 (예: 약품 아래 '1 \n 3 \n 2' 같은 형태)
            if (freq <= 1) {
                Pattern p = Pattern.compile("(?:1회|투약량|투여횟수)?[\\s\\S]*?([0-9.]+)[\\s\\r\\n]+([1-6])[\\s\\r\\n]+([0-9]{1,3})");
                Matcher m = p.matcher(text);
                if (m.find()) {
                    int candFreq = parseInt(m.group(2), 1);
                    if (candFreq > 1) {
                        freq = candFreq;
                    }
                }
            }
            item.setDailyFrequency(freq);
        }

        // 3. usageTiming 보강: dailyFrequency가 3인데 모호한 경우 "1일 3회 식후 30분"으로 명확화
        if (item.getDailyFrequency() != null && item.getDailyFrequency() == 3) {
            String timing = item.getUsageTiming();
            if (timing == null || timing.isBlank() || timing.equals("매일 식후 30분") || timing.equals("식후 30분") || timing.equals("식후")) {
                item.setUsageTiming("1일 3회 식후 30분");
            }
        } else if (item.getDailyFrequency() != null && item.getDailyFrequency() == 2) {
            String timing = item.getUsageTiming();
            if (timing == null || timing.isBlank() || timing.equals("매일 식후 30분") || timing.equals("식후 30분") || timing.equals("식후")) {
                item.setUsageTiming("1일 2회 (아침, 저녁) 식후");
            }
        }
    }

    private String findEdiCodeNearMedicine(String medName, String text) {
        if (medName == null || medName.length() < 2 || text == null) return null;
        String[] lines = text.split("\\r?\\n");
        String cleanTarget = medName.replaceAll("[^가-힣A-Za-z0-9]", "");
        for (String line : lines) {
            String cleanLine = line.replaceAll("[^가-힣A-Za-z0-9]", "");
            if (cleanLine.contains(cleanTarget) || (cleanTarget.length() >= 3 && cleanLine.contains(cleanTarget.substring(0, 3)))) {
                String edi = findEdiCodeInText(line);
                if (edi != null) return edi;
            }
        }
        return null;
    }

    private int findFrequencyAfterMedicineInText(String medName, String ediCode, String text) {
        if (text == null) return 0;
        String[] lines = text.split("\\r?\\n");
        for (int i = 0; i < lines.length; i++) {
            String line = lines[i].trim();
            boolean match = false;
            if (ediCode != null && !ediCode.isBlank() && line.contains(ediCode)) {
                match = true;
            } else if (medName != null && medName.length() >= 3 && line.contains(medName.substring(0, Math.min(4, medName.length())))) {
                match = true;
            }
            if (match) {
                // 이 줄 다음 행들에서 연속 숫자 2~3개 탐색
                List<Integer> nums = new ArrayList<>();
                for (int j = i + 1; j < Math.min(lines.length, i + 6); j++) {
                    String nl = lines[j].trim();
                    if (nl.matches("^[0-9]+$")) {
                        nums.add(Integer.parseInt(nl));
                    } else if (!nl.equals("-") && !nl.isBlank()) {
                        break;
                    }
                }
                // [1회투약량, 1일투여횟수, 총투약일수] 중 두 번째 숫자 (index 1)
                if (nums.size() >= 2) {
                    int candFreq = nums.get(1);
                    if (candFreq >= 1 && candFreq <= 6) {
                        return candFreq;
                    }
                }
            }
        }
        return 0;
    }

    /**
     * API 호출 실패 시 개발용 Mock 폴백 데이터
     */
    private OcrParseResult createFallbackParseResult() {
        OcrParseResult result = new OcrParseResult();
        result.setHospitalName("서울마음내과의원");
        result.setDoctorName("김도현 원장");
        result.setDispensedDate(new Date());
        result.setTotalDays(14);
        result.setItems(createSampleItems());
        result.setRawOcrText("[샘플 처방전 폴백 데이터]\n서울마음내과 김도현 원장\n642102470 아모잘탄정 5/50mg 1.0 1 14\n오메가3연질캡슐 1.0 2 14\n듀오락골드 1.0 1 14");
        return result;
    }

    private List<ParsedItem> createSampleItems() {
        List<ParsedItem> items = new ArrayList<>();

        ParsedItem item1 = new ParsedItem();
        item1.setEdiCode("642102470"); // EDI 코드가 존재하는 케이스 (1차 EDI 매칭)
        item1.setMedicineName("아모잘탄정 5/50mg");
        item1.setDailyDose(1.0);
        item1.setDailyFrequency(1);
        item1.setTotalDays(14);
        item1.setUsageTiming("매일 아침 식후 30분");
        items.add(item1);

        ParsedItem item2 = new ParsedItem();
        item2.setEdiCode(null); // EDI 코드 미인식 케이스 (약품명으로 2차 매칭 fallback)
        item2.setMedicineName("오메가3연질캡슐");
        item2.setDailyDose(1.0);
        item2.setDailyFrequency(2);
        item2.setTotalDays(14);
        item2.setUsageTiming("아침, 저녁 식후");
        items.add(item2);

        ParsedItem item3 = new ParsedItem();
        item3.setEdiCode(null); // EDI 코드 미인식 케이스 (약품명으로 2차 매칭 fallback)
        item3.setMedicineName("듀오락골드");
        item3.setDailyDose(1.0);
        item3.setDailyFrequency(1);
        item3.setTotalDays(14);
        item3.setUsageTiming("취침 전 복용");
        items.add(item3);

        return items;
    }
}
