package com.app.prescription.service;

import java.util.List;
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

    /**
     * 특정 사용자의 전체 처방전 목록 조회 (최신순)
     */
    List<PrescriptionDTO> getPrescriptionList(Long userId);

    /**
     * 처방전 단건 상세 조회 (약품 목록 포함)
     */
    PrescriptionDTO getPrescriptionDetail(Long prescriptionId);

    /**
     * 처방전 및 세부 약품 정보 수정
     */
    PrescriptionDTO updatePrescription(PrescriptionDTO prescription);

    /**
     * 처방전 및 세부 약품 삭제
     */
    boolean deletePrescription(Long prescriptionId, Long userId);
}
