import { useState, useEffect } from 'react';

/**
 * 약품 상세 정보 모달 (AI 핵심 복약 요약, 효능, 용법, 주의사항)
 */
export default function MedicationDetailModal(props) {
  if (!props.isOpen || !props.medDetail) return null;
  // 다른 약을 열 때 이전 약의 추가 설명이 잠깐 노출되지 않도록 분리합니다.
  return <MedicationDetail key={props.medDetail.medicationId || props.medDetail.name} {...props} />;
}

function MedicationDetail({
  medDetail,
  onClose,
  onNavigateGuide,
}) {
  const [medDetailExtra, setMedDetailExtra] = useState(null);

  // 모달이 열릴 때 AI 요약 및 최신 정보 On-Demand 패치
  useEffect(() => {
    if (!medDetail?.medicationId) return;

    let isCancelled = false;
    fetch(`/api/guides/medications/${encodeURIComponent(medDetail.medicationId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isCancelled && data) {
          setMedDetailExtra(data);
        }
      })
      .catch(() => {});

    return () => {
      isCancelled = true;
    };
  }, [medDetail?.medicationId]);

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
            <label>주요 효능 및 효과</label>
            <p>{medDetail.desc || medDetail.efficacy || '등록된 정보 없음'}</p>
          </div>

          {medDetail.usage && (
            <div className="detail-field">
              <label>용법 및 용량</label>
              <p>{medDetail.usage}</p>
            </div>
          )}

          {medDetail.caution && (
            <div className="detail-field caution-field">
              <label>복용 시 주의사항</label>
              <p>{medDetail.caution}</p>
            </div>
          )}

          {medDetail.originHospital && (
            <div className="detail-field">
              <label>처방 의료기관</label>
              <p>
                {medDetail.originHospital}
                {medDetail.originDispensedDate ? ` · ${medDetail.originDispensedDate} 조제` : ''}
              </p>
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button type="button" className="btn-guide-link" onClick={onNavigateGuide}>
            내 약 관리에서 전체 정보 보기 →
          </button>
          <button type="button" className="btn-modal-confirm" onClick={onClose}>
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
