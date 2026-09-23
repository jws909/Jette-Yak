package com.app.prescription.controller;

import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.app.prescription.dto.PrescriptionDTO;
import com.app.prescription.service.PrescriptionService;

@RestController
@RequestMapping("/api/prescriptions")
@CrossOrigin(origins = "*")
public class PrescriptionController {
    private static final Logger log = LogManager.getLogger(PrescriptionController.class);

    private final PrescriptionService prescriptionService;

    public PrescriptionController(PrescriptionService prescriptionService) {
        this.prescriptionService = prescriptionService;
    }

    /**
     * 처방전 사진 업로드 및 OCR 텍스트 분석/의약품 DB 매칭/DB 등록
     * POST /api/prescriptions/upload
     */
    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> uploadPrescription(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "userId", required = false) Long userId,
            javax.servlet.http.HttpServletRequest request) {

        if (userId == null || userId <= 0L) {
            var session = request.getSession(false);
            Object sessionVal = session != null ? session.getAttribute("userId") : null;
            if (sessionVal instanceof Long) {
                userId = (Long) sessionVal;
            } else if (sessionVal instanceof Number) {
                userId = ((Number) sessionVal).longValue();
            }
        }

        if (userId == null || userId <= 0L) {
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("message", "로그인이 필요한 기능입니다.");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(errorResponse);
        }

        log.info("처방전 업로드 요청 수신: fileName={}, size={}, userId={}", 
                file != null ? file.getOriginalFilename() : "null", 
                file != null ? file.getSize() : 0, 
                userId);

        if (file == null || file.isEmpty()) {
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("message", "업로드할 처방전 사진 파일이 제공되지 않았습니다.");
            return ResponseEntity.badRequest().body(errorResponse);
        }

        try {
            PrescriptionDTO result = prescriptionService.uploadAndProcessPrescription(file, userId);
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "처방전 분석 및 등록이 성공적으로 완료되었습니다.");
            response.put("prescription", result);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("처방전 분석 및 저장 중 오류 발생", e);
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("message", "처방전 처리 중 오류가 발생했습니다: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }

    /**
     * 사용자의 가장 최근 처방전 및 포함된 처방 약품 목록 조회
     * GET /api/prescriptions/latest?userId=1
     */
    @GetMapping(value = "/latest", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> getLatestPrescription(
            @RequestParam(value = "userId", required = false) Long userId,
            javax.servlet.http.HttpServletRequest request) {

        if (userId == null || userId <= 0L) {
            var session = request.getSession(false);
            Object sessionVal = session != null ? session.getAttribute("userId") : null;
            if (sessionVal instanceof Long) {
                userId = (Long) sessionVal;
            } else if (sessionVal instanceof Number) {
                userId = ((Number) sessionVal).longValue();
            }
        }

        if (userId == null || userId <= 0L) {
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("found", false);
            response.put("message", "로그인이 필요합니다.");
            return ResponseEntity.ok(response);
        }

        try {
            PrescriptionDTO result = prescriptionService.getLatestPrescription(userId);
            Map<String, Object> response = new HashMap<>();
            if (result != null) {
                response.put("success", true);
                response.put("found", true);
                response.put("prescription", result);
            } else {
                response.put("success", true);
                response.put("found", false);
                response.put("message", "등록된 처방전 내역이 없습니다.");
            }
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("최근 처방전 조회 실패: userId={}", userId, e);
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("message", "최근 처방전 조회 중 오류가 발생했습니다: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }

    /**
     * 사용자의 전체 처방전 목록 조회 (최신순)
     * GET /api/prescriptions/list?userId=1
     */
    @GetMapping(value = "/list", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> getPrescriptionList(
            @RequestParam(value = "userId", required = false) Long userId,
            javax.servlet.http.HttpServletRequest request) {

        if (userId == null || userId <= 0L) {
            var session = request.getSession(false);
            Object sessionVal = session != null ? session.getAttribute("userId") : null;
            if (sessionVal instanceof Long) {
                userId = (Long) sessionVal;
            } else if (sessionVal instanceof Number) {
                userId = ((Number) sessionVal).longValue();
            }
        }

        if (userId == null || userId <= 0L) {
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("prescriptions", Collections.emptyList());
            response.put("count", 0);
            return ResponseEntity.ok(response);
        }

        try {
            List<PrescriptionDTO> list = prescriptionService.getPrescriptionList(userId);
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("prescriptions", list != null ? list : Collections.emptyList());
            response.put("count", list != null ? list.size() : 0);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("처방전 목록 조회 실패: userId={}", userId, e);
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("message", "처방전 목록 조회 중 오류가 발생했습니다: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }

    /**
     * 특정 처방전 단건 상세 조회
     * GET /api/prescriptions/{prescriptionId}
     */
    @GetMapping(value = "/{prescriptionId}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> getPrescriptionDetail(@PathVariable("prescriptionId") Long prescriptionId) {
        try {
            PrescriptionDTO result = prescriptionService.getPrescriptionDetail(prescriptionId);
            if (result == null) {
                Map<String, Object> errorResponse = new HashMap<>();
                errorResponse.put("success", false);
                errorResponse.put("message", "해당 처방전을 찾을 수 없습니다.");
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(errorResponse);
            }
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("prescription", result);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("처방전 상세 조회 실패: ID={}", prescriptionId, e);
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("message", "처방전 조회 중 오류가 발생했습니다: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }

    /**
     * 특정 처방전 및 포함된 세부 약품 정보 수정
     * PUT /api/prescriptions/{prescriptionId}
     */
    @PutMapping(value = "/{prescriptionId}", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> updatePrescription(
            @PathVariable("prescriptionId") Long prescriptionId,
            @RequestBody PrescriptionDTO dto) {
        try {
            dto.setPrescriptionId(prescriptionId);
            PrescriptionDTO updated = prescriptionService.updatePrescription(dto);
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "처방전 정보가 성공적으로 수정되었습니다.");
            response.put("prescription", updated);
            return ResponseEntity.ok(response);
        } catch (IllegalArgumentException e) {
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("message", e.getMessage());
            return ResponseEntity.badRequest().body(errorResponse);
        } catch (Exception e) {
            log.error("처방전 수정 실패: ID={}", prescriptionId, e);
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("message", "처방전 수정 중 오류가 발생했습니다: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }

    /**
     * 특정 처방전 및 소속 약품 삭제
     * DELETE /api/prescriptions/{prescriptionId}
     */
    @DeleteMapping(value = "/{prescriptionId}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> deletePrescription(
            @PathVariable("prescriptionId") Long prescriptionId,
            @RequestParam(value = "userId", required = false) Long userId,
            javax.servlet.http.HttpServletRequest request) {

        if (userId == null || userId <= 0L) {
            var session = request.getSession(false);
            Object sessionVal = session != null ? session.getAttribute("userId") : null;
            if (sessionVal instanceof Long) {
                userId = (Long) sessionVal;
            } else if (sessionVal instanceof Number) {
                userId = ((Number) sessionVal).longValue();
            }
        }

        if (userId == null || userId <= 0L) {
            Map<String, Object> response = new HashMap<>();
            response.put("success", false);
            response.put("message", "로그인이 필요한 기능입니다.");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(response);
        }

        try {
            boolean deleted = prescriptionService.deletePrescription(prescriptionId, userId);
            Map<String, Object> response = new HashMap<>();
            if (deleted) {
                response.put("success", true);
                response.put("message", "처방전이 성공적으로 삭제되었습니다.");
                return ResponseEntity.ok(response);
            } else {
                response.put("success", false);
                response.put("message", "삭제할 처방전이 존재하지 않거나 권한이 없습니다.");
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(response);
            }
        } catch (Exception e) {
            log.error("처방전 삭제 실패: ID={}", prescriptionId, e);
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("message", "처방전 삭제 중 오류가 발생했습니다: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
}
