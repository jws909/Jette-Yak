import { useNavigate } from 'react-router-dom';

/**
 * 처방전 요약 카드 (PRESCRIPTION SUMMARY)
 */
export default function PrescriptionSummaryCard({
  selectedRxId,
  allPrescriptions,
  prescriptionData,
  currentRxStatus,
  displayedMedList,
  onJumpToDate,
}) {
  const navigate = useNavigate();

  return (
    <section className="prescription-summary-card">
      <div className="summary-col-left">
        <div className="summary-meta-top-row">
          <span className="summary-meta-label">
            {selectedRxId === 'all' ? 'ALL PRESCRIPTIONS SUMMARY' : 'PRESCRIPTION SUMMARY'}
          </span>
          {currentRxStatus && (
            <span className={`summary-status-pill ${currentRxStatus.status}`}>
              {currentRxStatus.badgeText}
            </span>
          )}
        </div>
        <h2 className="summary-date-title">
          {selectedRxId === 'all'
            ? `전체 처방전 (${allPrescriptions.length}건) 통합 조회`
            : (prescriptionData?.dispensedDate ? `${prescriptionData.dispensedDate} 조제 처방전` : '처방전 상세')}
        </h2>
        <div className="summary-hospital-info-group">
          <span className="summary-hospital-name">
            {prescriptionData?.hospitalName || '의료기관'}
          </span>
          {selectedRxId !== 'all' && prescriptionData?.doctorName && (
            <>
              <span className="summary-info-divider">·</span>
              <span className="summary-doctor-name">
                {prescriptionData.doctorName}
              </span>
            </>
          )}
          {selectedRxId !== 'all' && currentRxStatus?.startDateStr && (
            <span className="summary-period-chip">
              기간: {currentRxStatus.startDateStr} ~ {currentRxStatus.endDateStr}
            </span>
          )}
        </div>

        {/* AI 처방전 가이드: 처방 목적 및 핵심 요약 */}
        {prescriptionData?.aiGuide?.purpose && (
          <div className="summary-ai-guide-banner">
            <div className="ai-guide-purpose-row">
              <span className="ai-guide-tag">
                {selectedRxId === 'all' ? '통합 복약 안내' : '이 처방을 받은 이유 (AI)'}
              </span>
              <strong className="ai-guide-purpose-text">{prescriptionData.aiGuide.purpose}</strong>
            </div>
            {prescriptionData.aiGuide.summary && (
              <p className="ai-guide-summary-text">{prescriptionData.aiGuide.summary}</p>
            )}
          </div>
        )}
      </div>

      <div className="summary-stats-group">
        <div className="stat-unit">
          <span className="stat-number">
            {selectedRxId === 'all' ? allPrescriptions.length : (prescriptionData?.totalDays || 0)}
          </span>
          <span className="stat-label">
            {selectedRxId === 'all' ? '등록 처방전' : (currentRxStatus?.status === 'taking' ? `${currentRxStatus.dayNum}일차 / 총일수` : '총 복용 일수')}
          </span>
        </div>
        <div className="stat-divider" />
        <div className="stat-unit">
          <span className="stat-number">{displayedMedList.length}</span>
          <span className="stat-label">처방 약품</span>
        </div>
      </div>

      <div className="summary-col-right">
        {selectedRxId !== 'all' && currentRxStatus?.status === 'completed' && prescriptionData?.dispensedDate && (
          <button
            type="button"
            className="summary-past-jump-btn"
            onClick={() => onJumpToDate(prescriptionData.dispensedDate)}
            title="당시 복약 기간으로 이동하여 체크 기록 확인"
          >
            당시 복약 기록 보기
          </button>
        )}
        <button
          type="button"
          className="new-prescription-btn"
          onClick={() => navigate('/medication/register?tab=prescription')}
        >
          + 처방전 · 약봉투 등록
        </button>
        <button
          type="button"
          className="summary-guide-btn"
          onClick={() => navigate('/guide')}
        >
          내 약 관리 등록 →
        </button>
      </div>
    </section>
  );
}
