import React from 'react';

/**
 * 약품 상세 정보 모달 (AI 핵심 복약 요약, 효능, 용법, 주의사항)
 */
export default function MedicationDetailModal({
  isOpen,
  medDetail,
  medDetailExtra,
  onClose,
  onNavigateGuide,
}) {
  if (!isOpen || !medDetail) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content-box med-detail-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="detail-head-left">
            <h3 className="modal-title">{medDetail.name}</h3>
            {medDetail.badge && <span className="med-type-pill rx">{medDetail.badge}</span>}
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="med-detail-body">
          {medDetail.medicationId && !medDetailExtra && (
            <div className="ai-summary-loading-hint">
              AI 복약 요약 및 상세 정보를 조회하고 있습니다...
            </div>
          )}

          {medDetailExtra?.medication?.aiSummaryJson && (() => {
            try {
              const ai =
                typeof medDetailExtra.medication.aiSummaryJson === 'string'
                  ? JSON.parse(medDetailExtra.medication.aiSummaryJson)
                  : medDetailExtra.medication.aiSummaryJson;
              return (
                <div className="detail-field ai-summary-highlight-box">
                  <label className="ai-summary-label">AI 핵심 복약 요약</label>
                  <p className="ai-summary-main-text">{ai.summary}</p>
                  {ai.tips && (
                    <p className="ai-sub-line">
                      <strong>복용 팁:</strong> {ai.tips}
                    </p>
                  )}
                  {ai.warnings && (
                    <p className="ai-sub-line ai-warning-line">
                      <strong>주의사항:</strong> {ai.warnings}
                    </p>
                  )}
                  {ai.foodCautions && (
                    <p className="ai-sub-line">
                      <strong>음식 주의:</strong> {ai.foodCautions}
                    </p>
                  )}
                </div>
              );
            } catch {
              return null;
            }
          })()}

          <div className="detail-field">
            <label>효능 · 효과</label>
            <p>
              {medDetail.efficacy ||
                medDetailExtra?.medication?.efficacy ||
                medDetail.className ||
                '전문의 처방 의약품'}
            </p>
          </div>
          <div className="detail-field">
            <label>용법 · 용량</label>
            <p>
              {medDetail.dosage ||
                medDetailExtra?.medication?.usageDosage ||
                '처방전 용법·용량 준수'}
            </p>
          </div>
          <div className="detail-field">
            <label>복용 시 주의사항</label>
            <p className="caution-text">
              {medDetail.caution ||
                '정해진 용법과 용량을 준수하여 충분한 물과 함께 복용하세요.'}
            </p>
          </div>
        </div>

        <div className="modal-foot">
          <button
            type="button"
            className="btn-confirm modal-confirm-btn"
            onClick={onNavigateGuide || onClose}
          >
            내 약 관리 보기 →
          </button>
        </div>
      </div>
    </div>
  );
}
