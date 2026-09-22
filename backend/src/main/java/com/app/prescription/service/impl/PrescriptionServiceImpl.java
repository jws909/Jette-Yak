package com.app.prescription.service.impl;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import com.app.prescription.dao.PrescriptionDAO;
import com.app.prescription.dto.MatchedMedicationDTO;
import com.app.prescription.dto.OcrParseResult;
import com.app.prescription.dto.OcrParseResult.ParsedItem;
import com.app.prescription.dto.PrescriptionDTO;
import com.app.prescription.dto.PrescriptionItemDTO;
import com.app.prescription.service.PrescriptionService;
import com.app.prescription.service.VisionOcrService;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class PrescriptionServiceImpl implements PrescriptionService {
    private static final Logger log = LogManager.getLogger(PrescriptionServiceImpl.class);

    // [처리방법.txt ②] 대표 제약사 접두어 목록 (제약사명 분리용)
    private static final List<String> PHARMA_PREFIXES = List.of(
        "한미", "종근당", "대웅", "유한", "일동", "녹십자", "동아", "보령", "JW", "중외",
        "삼진", "신풍", "셀트리온", "명인", "환인", "한국", "동광", "대원", "하나", "건일",
        "안국", "일양", "태준", "휴온스", "바이엘", "화이자", "노바티스", "광동", "영진",
        "대화", "국제", "고려", "삼일", "현대", "명문", "한림", "동국", "신일", "알보젠",
        "경보", "동구", "비보존", "CMG", "HK이노엔", "GC녹십자", "SK케미칼", "씨제이", "CJ", "SK"
    );

    private final PrescriptionDAO prescriptionDAO;
    private final VisionOcrService visionOcrService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public PrescriptionServiceImpl(PrescriptionDAO prescriptionDAO, VisionOcrService visionOcrService) {
        this.prescriptionDAO = prescriptionDAO;
        this.visionOcrService = visionOcrService;
    }

    @Override
    @Transactional
    public PrescriptionDTO uploadAndProcessPrescription(MultipartFile file, Long userId) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("업로드할 처방전 사진 파일이 없습니다.");
        }
        if (userId == null || userId <= 0L) {
            throw new IllegalArgumentException("처방전을 등록할 사용자 정보가 올바르지 않습니다.");
        }

        // 1. 파일 바이트를 먼저 안전하게 메모리에 확보 (이후 CommonsMultipartFile 스트림 소멸/이동 방지)
        byte[] fileBytes;
        try {
            fileBytes = file.getBytes();
        } catch (IOException e) {
            log.error("업로드 파일 바이트 추출 실패", e);
            throw new RuntimeException("업로드된 처방전 파일을 읽을 수 없습니다.", e);
        }

        // 2. 파일 로컬 저장 (바이트 직접 쓰기로 스트림 이동 예외 방지)
        String savedImageUrl = saveFile(fileBytes, file.getOriginalFilename());

        // 3. Google Cloud Vision API OCR 및 Gemini/규칙 기반 텍스트 파싱
        OcrParseResult parseResult = visionOcrService.processPrescriptionImage(fileBytes, file.getOriginalFilename());

        // 4. PRESCRIPTIONS 마스터 DTO 생성
        PrescriptionDTO prescription = new PrescriptionDTO();
        prescription.setUserId(userId);
        prescription.setDispensedDate(parseResult.getDispensedDate() != null ? parseResult.getDispensedDate() : new Date());
        prescription.setTotalDays(parseResult.getTotalDays() != null ? parseResult.getTotalDays() : 14);
        prescription.setPrescriptionImageUrl(savedImageUrl);
        prescription.setHospitalName(parseResult.getHospitalName());
        prescription.setDoctorName(parseResult.getDoctorName());

        // AI 요약 JSON 문자열 직렬화 (VARCHAR2(4000) 이내)
        try {
            String jsonStr = objectMapper.writeValueAsString(parseResult);
            if (jsonStr.length() > 3900) {
                jsonStr = jsonStr.substring(0, 3900) + "...}";
            }
            prescription.setAiSummaryJson(jsonStr);
        } catch (Exception e) {
            prescription.setAiSummaryJson("{\"status\":\"parsed\",\"hospital\":\"" + parseResult.getHospitalName() + "\"}");
        }

        boolean hasDiscontinued = false;
        List<PrescriptionItemDTO> itemsToInsert = new ArrayList<>();
        Set<String> seenMedicationIds = new HashSet<>();

        // 5. [처리방법.txt 2단계 검색 파이프라인]
        // 1단계: EDI 코드가 있고 유효한가? -> DB 조회 성공 시 종료
        // 2단계: 유효하지 않거나 DB에 없으면(비급여 등) -> 한글 약품명 기반 검색 (Fallback)
        if (parseResult.getItems() != null) {
            for (ParsedItem parsed : parseResult.getItems()) {
                String ediCode = parsed.getEdiCode();
                String medName = parsed.getMedicineName();
                MatchedMedicationDTO matched = null;

                // 1단계 검색: 유효한 표준 EDI 코드가 있는 경우 DB 우선 조회
                if (ediCode != null && !ediCode.isBlank() && isValidEdiCode(ediCode)) {
                    matched = prescriptionDAO.findMedicationByEdiCode(ediCode.trim());
                    if (matched != null) {
                        log.info("[PRESCRIPTION] [1단계 성공] EDI 코드('{}')로 의약품 매칭 성공: '{}' (ID: {})", 
                                ediCode, matched.getItemName(), matched.getItemSeq());
                    } else {
                        log.warn("[PRESCRIPTION] [1단계 실패] EDI 코드('{}')가 DB에 없습니다 (비급여 매핑 누락 등). 2단계 한글 약품명 Fallback 전환", ediCode);
                    }
                } else {
                    log.info("[PRESCRIPTION] [1단계 패스] 유효한 EDI 코드가 없음 (EDI: {}). 2단계 한글 약품명 Fallback 전환", ediCode);
                }

                // 2단계 검색 (Fallback): 한글 약품명 기반 검색 (제형/규격 분리, 제약사명 분리)
                if (matched == null && medName != null && !medName.isBlank()) {
                    matched = findBestMatch(medName);
                    if (matched != null) {
                        log.info("[PRESCRIPTION] [2단계 성공] 한글 약품명('{}') Fallback 검색 매칭 성공: '{}' (ID: {}, EDI: {})", 
                                medName, matched.getItemName(), matched.getItemSeq(), matched.getEdiCode());
                    }
                }

                if (matched != null) {
                    String medId = matched.getItemSeq();
                    // 동일 처방전 내 동일 의약품(medication_id) 중복 등록 방지
                    if (seenMedicationIds.contains(medId)) {
                        log.info("[PRESCRIPTION] ⚠️ 동일 처방전 내 이미 등록된 의약품(medication_id: {}) 중복 항목 건너뜀: '{}'",
                                medId, matched.getItemName());
                        // 만약 기존 등록 항목에 EDI 코드가 비어있고 현재 항목에 EDI 코드가 있다면 보강
                        for (PrescriptionItemDTO existing : itemsToInsert) {
                            if (medId.equals(existing.getMedicationId())) {
                                if ((existing.getEdiCode() == null || existing.getEdiCode().isBlank()) && ediCode != null) {
                                    existing.setEdiCode(ediCode);
                                }
                                break;
                            }
                        }
                        continue;
                    }
                    seenMedicationIds.add(medId);

                    PrescriptionItemDTO item = new PrescriptionItemDTO();
                    item.setDailyDose(parsed.getDailyDose() != null ? parsed.getDailyDose() : 1.0);
                    int dFreq = parsed.getDailyFrequency() != null ? parsed.getDailyFrequency() : 1;
                    String uTiming = parsed.getUsageTiming();
                    if (dFreq <= 1 && uTiming != null) {
                        if (uTiming.contains("3회") || (uTiming.contains("아침") && uTiming.contains("점심") && uTiming.contains("저녁")) || uTiming.contains("매 식후") || uTiming.contains("매식후")) {
                            dFreq = 3;
                        } else if (uTiming.contains("2회") || (uTiming.contains("아침") && uTiming.contains("저녁"))) {
                            dFreq = 2;
                        }
                    }
                    item.setDailyFrequency(dFreq);
                    item.setTotalDays(parsed.getTotalDays() != null ? parsed.getTotalDays() : prescription.getTotalDays());
                    item.setUsageTiming(safeTruncateUsageTiming(uTiming));
                    item.setMedicationId(matched.getItemSeq());
                    item.setItemName(matched.getItemName());
                    item.setEdiCode(matched.getEdiCode() != null ? matched.getEdiCode() : ediCode);
                    item.setClassName(matched.getClassName());
                    item.setIsDiscontinued(matched.getIsDiscontinued());
                    if (Boolean.TRUE.equals(matched.getIsDiscontinued())) {
                        hasDiscontinued = true;
                    }
                    itemsToInsert.add(item);
                    log.info("[PRESCRIPTION] prescription_items 등록 목록에 추가: '{}' (medication_id: {})", 
                            item.getItemName(), item.getMedicationId());
                } else {
                    log.warn("[PRESCRIPTION] ⚠️ EDI 코드 및 한글 약품명으로도 medications 테이블에서 의약품을 찾지 못했습니다 (외래키 제약 보호를 위해 items INSERT 제외): EDI='{}', Name='{}'", 
                            ediCode, medName);
                }
            }
        }

        prescription.setHasDiscontinuedDrug(hasDiscontinued ? 1 : 0);

        // 6. DB 저장: prescriptions 테이블 INSERT (selectKey order=AFTER로 prescriptionId 자동 취득)
        prescriptionDAO.insertPrescription(prescription);

        // 7. DB 저장: prescription_items 테이블 INSERT (DB에 실존하는 medication_id만 등록)
        try {
            for (PrescriptionItemDTO item : itemsToInsert) {
                item.setPrescriptionId(prescription.getPrescriptionId());
                prescriptionDAO.insertPrescriptionItem(item);
            }
        } catch (Exception e) {
            log.error("[PRESCRIPTION] ❌ prescription_items DB 저장 중 오류 발생 -> 방금 생성된 처방전(ID: {}) 고아 데이터 정리 중...", prescription.getPrescriptionId(), e);
            try {
                prescriptionDAO.deletePrescription(prescription.getPrescriptionId());
            } catch (Exception ex) {
                log.warn("[PRESCRIPTION] 고아 처방전 삭제 실패: {}", ex.getMessage());
            }
            throw e;
        }

        prescription.setItems(itemsToInsert);
        return prescription;
    }

    private boolean isValidEdiCode(String ediCode) {
        if (ediCode == null) return false;
        String trimmed = ediCode.trim();
        // 비급여 원내 임의 코드(NON..., V01 등) 제외
        if (trimmed.startsWith("NON") || trimmed.startsWith("V0") || trimmed.startsWith("비")) return false;
        // 표준 EDI 코드는 7~10자리의 영숫자
        return trimmed.length() >= 7 && trimmed.length() <= 10 && trimmed.matches(".*[0-9].*");
    }

    private MatchedMedicationDTO findBestMatch(String rawName) {
        if (rawName == null || rawName.isBlank()) return null;
        try {
            List<String> candidates = generateSearchCandidates(rawName);
            for (String candidate : candidates) {
                MatchedMedicationDTO match = prescriptionDAO.findMedicationByName(candidate);
                if (match != null) {
                    log.info("[PRESCRIPTION] 의약품 매칭 성공 (후보 키워드: '{}' -> 매칭품목: '{}', ID: {})",
                            candidate, match.getItemName(), match.getItemSeq());
                    return match;
                }
            }
        } catch (Exception e) {
            log.warn("의약품 DB 매칭 조회 실패: {}", e.getMessage());
        }
        return null;
    }

    private List<String> generateSearchCandidates(String rawName) {
        Set<String> candidates = new LinkedHashSet<>();
        if (rawName == null || rawName.isBlank()) return new ArrayList<>();

        // 1. 접두어(비급여/급여 등) 및 포장단위(/1정 등), 특수문자 정리
        String cleaned = rawName
            .replaceAll("^(?:비|급|급여|비급여|전액|본인|일반)[\\s\\)\\]\\.\\-:]+", "")
            .replaceAll("(?:비|급|급여|비급여)[\\)\\]]", " ")
            .replaceAll("/[0-9]+(?:정|캡슐|포|ml|g|캅셀)?", " ")
            .replaceAll("(?i)\\b[0-9]{7,10}\\b", " ")
            .trim();

        // 2. [처리방법.txt ①] 성분명 괄호 제거: (아세트아미노펜), (피나스테리드) 등
        String noParens = cleaned
            .replaceAll("\\([^\\)]*\\)", " ")
            .replaceAll("\\[[^\\]]*\\]", " ")
            .trim();

        if (noParens.length() >= 2) {
            candidates.add(noParens);
        }

        // 3. [처리방법.txt ①] 용량 및 규격 단위 정규화 (mg -> 밀리그램, 밀리그람)
        String convertedUnits = noParens
            .replaceAll("(?i)(\\d+(?:\\.\\d+)?)\\s*mg", "$1밀리그램")
            .replaceAll("(?i)(\\d+(?:\\.\\d+)?)\\s*g\\b", "$1그램")
            .replaceAll("(?i)(\\d+(?:\\.\\d+)?)\\s*ml", "$1밀리리터");
        if (!convertedUnits.equals(noParens) && convertedUnits.length() >= 2) {
            candidates.add(convertedUnits);
            candidates.add(convertedUnits.replace("밀리그램", "밀리그람"));
        }

        // 4. [처리방법.txt ①] 용량 규격(숫자+단위)을 완전히 제거한 핵심 품목명 (예: 피나온정1mg -> 피나온정)
        String noDosage = noParens
            .replaceAll("(?i)[0-9./]+\\s*(?:밀리그램|밀리그람|그램|밀리리터|마이크로그램|mg|g|ml|mcg|캅셀|캡슐|정|포)?", " ")
            .replaceAll("[\\s]+", " ")
            .trim();
        if (noDosage.length() >= 2) {
            candidates.add(noDosage);
        }

        // 5. [처리방법.txt ②] 제약사명 분리 (예: 한미아스피린장용정 -> 아스피린장용정)
        for (String target : List.of(noDosage, noParens)) {
            for (String prefix : PHARMA_PREFIXES) {
                if (target.startsWith(prefix) && target.length() > prefix.length() + 1) {
                    String stripped = target.substring(prefix.length()).trim();
                    if (stripped.length() >= 2) {
                        candidates.add(stripped);
                    }
                }
            }
        }

        // 6. 앞부분 순수 제형 약품명 추출 (예: 피나온정 -> 피나온)
        Matcher m = Pattern.compile("^([가-힣A-Za-z]{2,20}(?:정|캡슐|시럽|액|산|연고|패취|주사|캅셀|서방정|장용정)?)")
                .matcher(noDosage.replaceAll("[\\s]+", ""));
        if (m.find()) {
            String pureName = m.group(1).trim();
            if (pureName.length() >= 2) {
                candidates.add(pureName);
                if (pureName.endsWith("서방정") || pureName.endsWith("장용정")) {
                    candidates.add(pureName.substring(0, pureName.length() - 3));
                } else if (pureName.endsWith("정") || pureName.endsWith("산") || pureName.endsWith("액")) {
                    candidates.add(pureName.substring(0, pureName.length() - 1));
                } else if (pureName.endsWith("캡슐") || pureName.endsWith("캅셀") || pureName.endsWith("주사")) {
                    candidates.add(pureName.substring(0, pureName.length() - 2));
                }
            }
        }

        // 7. 단어 토큰 분리 (단, 숫자가 포함된 토큰이나 일반 제형 단독어는 절대 제외)
        String[] tokens = noDosage.split("[^가-힣A-Za-z0-9]+");
        for (String token : tokens) {
            token = token.trim();
            if (token.length() < 2) continue;
            // 숫자가 포함된 토큰은 절대 후보군으로 쓰지 않음 (1정, 31121정 등 오매칭 원천 차단)
            if (token.matches(".*[0-9].*")) continue;
            // 일반적인 제형 명칭 단독어 제외
            if (token.equals("정") || token.equals("캡슐") || token.equals("연질캡슐") || 
                token.equals("캅셀") || token.equals("서방정") || token.equals("장용정") || 
                token.equals("시럽") || token.equals("주사") || token.equals("주사액") ||
                token.equals("과립") || token.equals("산") || token.equals("액")) continue;
            candidates.add(token);
        }

        return new ArrayList<>(candidates);
    }

    private String safeTruncateUsageTiming(String timing) {
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

    private String saveFile(byte[] bytes, String originalName) {
        try {
            // 톰캣 실행 시 user.dir이 C:\WINDOWS\system32 로 잡혀 권한 에러가 발생하는 문제를 방지하기 위해
            // 사용자 홈 디렉토리(user.home) 기준으로 안전하게 업로드 폴더를 생성합니다.
            String uploadDir = System.getProperty("user.home") + File.separator + ".jette_yak" + File.separator + "uploads" + File.separator + "prescriptions";
            File dir = new File(uploadDir);
            if (!dir.exists()) {
                dir.mkdirs();
            }
            String ext = "";
            if (originalName != null && originalName.contains(".")) {
                ext = originalName.substring(originalName.lastIndexOf("."));
            }
            String savedName = UUID.randomUUID().toString() + ext;
            File dest = new File(dir, savedName);
            java.nio.file.Files.write(dest.toPath(), bytes);
            log.info("[PRESCRIPTION] 처방전 이미지 파일 로컬 저장 완료: {}", dest.getAbsolutePath());
            return "/uploads/prescriptions/" + savedName;
        } catch (Exception e) {
            log.error("처방전 파일 로컬 저장 실패", e);
            return "/uploads/prescriptions/default_prescription.png";
        }
    }

    private void populateHospitalAndDoctor(PrescriptionDTO p) {
        if (p == null) return;
        if (p.getAiSummaryJson() != null && !p.getAiSummaryJson().isBlank()) {
            try {
                com.fasterxml.jackson.databind.JsonNode root = objectMapper.readTree(p.getAiSummaryJson());
                if ((p.getHospitalName() == null || p.getHospitalName().isBlank()) && root.has("hospitalName") && !root.get("hospitalName").isNull()) {
                    p.setHospitalName(root.get("hospitalName").asText());
                }
                if ((p.getDoctorName() == null || p.getDoctorName().isBlank()) && root.has("doctorName") && !root.get("doctorName").isNull()) {
                    p.setDoctorName(root.get("doctorName").asText());
                }
            } catch (Exception e) {
                // ignore
            }
        }
    }

    @Override
    public PrescriptionDTO getLatestPrescription(Long userId) {
        if (userId == null || userId <= 0L) return null;
        PrescriptionDTO prescription = prescriptionDAO.getLatestPrescriptionByUserId(userId);
        if (prescription != null && prescription.getPrescriptionId() != null) {
            List<PrescriptionItemDTO> items = prescriptionDAO.getPrescriptionItemsByPrescriptionId(prescription.getPrescriptionId());
            prescription.setItems(items);
            populateHospitalAndDoctor(prescription);
        }
        return prescription;
    }

    @Override
    public List<PrescriptionDTO> getPrescriptionList(Long userId) {
        if (userId == null || userId <= 0L) return Collections.emptyList();
        List<PrescriptionDTO> list = prescriptionDAO.getPrescriptionListByUserId(userId);
        if (list != null) {
            for (PrescriptionDTO p : list) {
                if (p.getPrescriptionId() != null) {
                    List<PrescriptionItemDTO> items = prescriptionDAO.getPrescriptionItemsByPrescriptionId(p.getPrescriptionId());
                    p.setItems(items);
                    populateHospitalAndDoctor(p);
                }
            }
        }
        return list != null ? list : new ArrayList<>();
    }

    @Override
    public PrescriptionDTO getPrescriptionDetail(Long prescriptionId) {
        if (prescriptionId == null) return null;
        PrescriptionDTO prescription = prescriptionDAO.getPrescriptionById(prescriptionId);
        if (prescription != null) {
            List<PrescriptionItemDTO> items = prescriptionDAO.getPrescriptionItemsByPrescriptionId(prescriptionId);
            prescription.setItems(items);
            populateHospitalAndDoctor(prescription);
        }
        return prescription;
    }

    @Override
    @Transactional
    public PrescriptionDTO updatePrescription(PrescriptionDTO prescription) {
        if (prescription == null || prescription.getPrescriptionId() == null) {
            throw new IllegalArgumentException("수정할 처방전 정보가 올바르지 않습니다.");
        }

        PrescriptionDTO existing = prescriptionDAO.getPrescriptionById(prescription.getPrescriptionId());
        if (existing == null) {
            throw new IllegalArgumentException("존재하지 않는 처방전입니다: ID=" + prescription.getPrescriptionId());
        }

        // 병원명/의사명 갱신 및 aiSummaryJson 보존/업데이트
        String currentJson = existing.getAiSummaryJson();
        com.fasterxml.jackson.databind.node.ObjectNode root;
        if (currentJson != null && !currentJson.isBlank()) {
            try {
                root = (com.fasterxml.jackson.databind.node.ObjectNode) objectMapper.readTree(currentJson);
            } catch (Exception e) {
                root = objectMapper.createObjectNode();
            }
        } else {
            root = objectMapper.createObjectNode();
        }

        if (prescription.getHospitalName() != null) {
            root.put("hospitalName", prescription.getHospitalName().trim());
        }
        if (prescription.getDoctorName() != null) {
            root.put("doctorName", prescription.getDoctorName().trim());
        }
        prescription.setAiSummaryJson(root.toString());

        if (prescription.getDispensedDate() == null) {
            prescription.setDispensedDate(existing.getDispensedDate());
        }
        if (prescription.getTotalDays() == null) {
            prescription.setTotalDays(existing.getTotalDays());
        }

        // 약품 목록 수정
        if (prescription.getItems() != null) {
            prescriptionDAO.deletePrescriptionItemsByPrescriptionId(prescription.getPrescriptionId());

            boolean hasDiscontinued = false;
            for (PrescriptionItemDTO item : prescription.getItems()) {
                item.setPrescriptionId(prescription.getPrescriptionId());

                if (item.getMedicationId() == null || item.getMedicationId().isBlank()) {
                    MatchedMedicationDTO matched = findBestMatch(item.getItemName());
                    if (matched != null) {
                        item.setMedicationId(matched.getItemSeq());
                        item.setItemName(matched.getItemName());
                        item.setEdiCode(matched.getEdiCode());
                        item.setClassName(matched.getClassName());
                        item.setIsDiscontinued(matched.getIsDiscontinued());
                    } else {
                        // DB에 품목이 없는 경우에도 기본 약품 식별값 부여 (예: 임의 등록)
                        item.setMedicationId("MANUAL_" + System.currentTimeMillis());
                    }
                }

                if (Boolean.TRUE.equals(item.getIsDiscontinued())) {
                    hasDiscontinued = true;
                }

                if (item.getDailyDose() == null) item.setDailyDose(1.0);
                if (item.getDailyFrequency() == null) item.setDailyFrequency(1);
                if (item.getTotalDays() == null) item.setTotalDays(prescription.getTotalDays());
                item.setUsageTiming(safeTruncateUsageTiming(item.getUsageTiming()));

                prescriptionDAO.insertPrescriptionItem(item);
            }
            prescription.setHasDiscontinuedDrug(hasDiscontinued ? 1 : 0);
        } else {
            prescription.setHasDiscontinuedDrug(existing.getHasDiscontinuedDrug());
        }

        prescriptionDAO.updatePrescription(prescription);
        return getPrescriptionDetail(prescription.getPrescriptionId());
    }

    @Override
    @Transactional
    public boolean deletePrescription(Long prescriptionId, Long userId) {
        if (prescriptionId == null) return false;

        PrescriptionDTO existing = prescriptionDAO.getPrescriptionById(prescriptionId);
        if (existing == null) {
            log.warn("[PRESCRIPTION] 삭제 대상 처방전 미존재: ID={}", prescriptionId);
            return false;
        }

        if (userId != null && existing.getUserId() != null && !userId.equals(existing.getUserId())) {
            log.warn("[PRESCRIPTION] 처방전 삭제 권한 불일치: 요청 userId={}, 실제 userId={}", userId, existing.getUserId());
            // 필요한 경우 권한 제약 적용
        }

        log.info("[PRESCRIPTION] 처방전 및 세부 항목 삭제 시작: ID={}, userId={}", prescriptionId, userId);
        prescriptionDAO.deletePrescriptionItemsByPrescriptionId(prescriptionId);
        prescriptionDAO.deletePrescription(prescriptionId);
        log.info("[PRESCRIPTION] 처방전 삭제 완료: ID={}", prescriptionId);
        return true;
    }
}
