package com.app.prescription.service.impl;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.UUID;

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
        if (userId == null) {
            userId = 1L; // 기본 사용자 ID fallback
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

        // 3. Google Cloud Vision API OCR 및 텍스트 파싱
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

        // 5. EDI 코드 우선 매칭 -> 미인식/미존재 시 약품명으로 2차 재검색 (medications 테이블은 읽기 전용)
        if (parseResult.getItems() != null) {
            for (ParsedItem parsed : parseResult.getItems()) {
                String ediCode = parsed.getEdiCode();
                String medName = parsed.getMedicineName();
                MatchedMedicationDTO matched = null;

                // 1차 검색: EDI 코드가 OCR로 인식된 경우, EDI 코드로 DB 우선 조회
                if (ediCode != null && !ediCode.isBlank()) {
                    matched = prescriptionDAO.findMedicationByEdiCode(ediCode.trim());
                    if (matched != null) {
                        log.info("[PRESCRIPTION] [1차 성공] EDI 코드('{}')로 의약품 매칭 성공: '{}' (ID: {})", 
                                ediCode, matched.getItemName(), matched.getItemSeq());
                    } else {
                        log.warn("[PRESCRIPTION] EDI 코드('{}')가 DB(medications)에 존재하지 않습니다. 약품명('{}')으로 재검색합니다.", 
                                ediCode, medName);
                    }
                } else {
                    log.info("[PRESCRIPTION] EDI 코드가 인식되지 않았습니다. 약품명('{}')으로 검색을 진행합니다.", medName);
                }

                // 2차 검색 (Fallback): EDI 코드가 없거나, EDI 코드로 매칭되지 않은 경우 약품명으로 다시 검색
                if (matched == null && medName != null && !medName.isBlank()) {
                    matched = findBestMatch(medName);
                    if (matched != null) {
                        log.info("[PRESCRIPTION] [2차 성공] 약품명('{}')으로 의약품 재검색 매칭 성공: '{}' (ID: {}, EDI: {})", 
                                medName, matched.getItemName(), matched.getItemSeq(), matched.getEdiCode());
                    }
                }

                if (matched != null) {
                    PrescriptionItemDTO item = new PrescriptionItemDTO();
                    item.setDailyDose(parsed.getDailyDose() != null ? parsed.getDailyDose() : 1.0);
                    item.setDailyFrequency(parsed.getDailyFrequency() != null ? parsed.getDailyFrequency() : 3);
                    item.setTotalDays(parsed.getTotalDays() != null ? parsed.getTotalDays() : prescription.getTotalDays());
                    item.setUsageTiming(parsed.getUsageTiming());
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
                    log.warn("[PRESCRIPTION] ⚠️ EDI 코드 및 약품명으로도 medications 테이블에서 의약품을 찾지 못했습니다 (외래키 제약 보호를 위해 items INSERT 제외): EDI='{}', Name='{}'", 
                            ediCode, medName);
                }
            }
        }

        prescription.setHasDiscontinuedDrug(hasDiscontinued ? 1 : 0);

        // 6. DB 저장: prescriptions 테이블 INSERT (selectKey order=AFTER로 prescriptionId 자동 취득)
        prescriptionDAO.insertPrescription(prescription);

        // 7. DB 저장: prescription_items 테이블 INSERT (DB에 실존하는 medication_id만 등록)
        for (PrescriptionItemDTO item : itemsToInsert) {
            item.setPrescriptionId(prescription.getPrescriptionId());
            prescriptionDAO.insertPrescriptionItem(item);
        }

        prescription.setItems(itemsToInsert);
        return prescription;
    }

    private MatchedMedicationDTO findBestMatch(String rawName) {
        if (rawName == null || rawName.isBlank()) return null;
        try {
            // 1) 전체 이름으로 검색 (공백 제거 및 LIKE)
            MatchedMedicationDTO match = prescriptionDAO.findMedicationByName(rawName.trim());
            if (match != null) return match;

            // 2) 용량/제형 부분(예: 5/50mg, 100mg) 제거 후 핵심 명칭으로 2차 검색
            String coreName = rawName.replaceAll("[0-9./mgMG\\s]+", " ").trim();
            if (coreName.length() >= 2) {
                match = prescriptionDAO.findMedicationByName(coreName);
                if (match != null) return match;
            }

            // 3) 토큰 단위 3차 검색
            String[] tokens = rawName.split("[^가-힣A-Za-z0-9]+");
            for (String token : tokens) {
                if (token.length() >= 2 && !token.equals("정") && !token.equals("캡슐")) {
                    match = prescriptionDAO.findMedicationByName(token);
                    if (match != null) return match;
                }
            }
        } catch (Exception e) {
            log.warn("의약품 DB 매칭 조회 실패: {}", e.getMessage());
        }
        return null;
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

    @Override
    public PrescriptionDTO getLatestPrescription(Long userId) {
        if (userId == null) userId = 1L;
        PrescriptionDTO prescription = prescriptionDAO.getLatestPrescriptionByUserId(userId);
        if (prescription != null && prescription.getPrescriptionId() != null) {
            List<PrescriptionItemDTO> items = prescriptionDAO.getPrescriptionItemsByPrescriptionId(prescription.getPrescriptionId());
            prescription.setItems(items);
        }
        return prescription;
    }
}
