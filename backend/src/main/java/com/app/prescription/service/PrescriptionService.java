package com.app.prescription.service;

import org.springframework.web.multipart.MultipartFile;
import com.app.prescription.dto.PrescriptionDTO;

public interface PrescriptionService {
    /**
     * 처방전 사진 파일을 업로드 받아 OCR 분석 -> DB 매칭 -> 데이터 저장 후 전체 처방전 객체 반환
     */
    PrescriptionDTO uploadAndProcessPrescription(MultipartFile file, Long userId);

    /**
     * 특정 사용자의 가장 최근 처방전 및 약품 목록 조회
     */
    PrescriptionDTO getLatestPrescription(Long userId);
}
