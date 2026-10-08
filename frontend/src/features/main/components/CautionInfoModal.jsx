import { useState } from 'react';

function formatDateShort(dateObj) {
  if (!dateObj) return '';
  const m = dateObj.getMonth() + 1;
  const d = dateObj.getDate();
  return `${m}월 ${d}일`;
}

/**
 * 복용 주의점 및 성분 안내 모달
 */
export default function CautionInfoModal({
  isOpen,
  onClose,
  targetDate,
  selectedRxId,
  prescriptionData,
  currentRxStatus,
  activeMedList = [],
  onJumpToDate,
  onNavigateGuide,
}) {
  const [showPastMedsInModal, setShowPastMedsInModal] = useState(false);

  if (!isOpen) return null;

  const handleClose = () => {
    setShowPastMedsInModal(false);
    onClose?.();
  };

  const handleJump = (dateStr) => {
    handleClose();
    onJumpToDate?.(dateStr);
  };

  const handleNavigate = () => {
    handleClose();
    onNavigateGuide?.();
  };

  return (
    <div className="modal-backdrop" onClick={handleClose}>
      <div className="modal-content-box caution-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-head-info">
            <h3 className="modal-title">복용 주의사항 &amp; 성분 안내</h3>
            <span className="modal-subtitle">
              {formatDateShort(targetDate)} 기준 ·{' '}
              {selectedRxId === 'all'
                ? '전체 처방전 통합'
                : prescriptionData?.hospitalName || '처방전'}
            </span>
          </div>
          <button type="button" className="modal-close" onClick={handleClose}>
            ✕
          </button>
        </div>

        <div className="caution-modal-body">
          {/* 복용 중인 약품 중 판매중단 또는 주의 대상 의약품 경고 */}
          {activeMedList.some((item) => item.isDiscontinued) && (
            <div
              className="caution-summary-card"
              style={{ borderColor: '#e5a7ad', background: '#fff8f8' }}
            >
              <strong style={{ color: '#c04b4b' }}>
                [주의] 판매중단 또는 주의 대상 의약품 포함
              </strong>
              <p>
                현재 복용 중인 처방 약품 중 주의 또는 재검토 대상 의약품이 포함되어 있습니다. 복용
                전 반드시 처방의료진과 재확인하세요.
              </p>
            </div>
          )}

          {activeMedList.length > 0 ? (
            <div className="caution-guidance">
              <div className="caution-section-header">
                <h4>현재 복용 처방 약품 ({activeMedList.length}종):</h4>
                <span className="caution-status-chip">복용 중</span>
              </div>
              <ul className="caution-items-list">
                {activeMedList.map((item, idx) => (
                  <li key={item.id || idx} className="caution-item-card">
                    <div className="caution-item-top">
                      <strong className="caution-item-name">{item.name}</strong>
                      {selectedRxId === 'all' && item.originHospital && (
                        <span className="med-hospital-tag">{item.originHospital}</span>
                      )}
                      {item.isDiscontinued && (
                        <span className="caution-discontinued-tag">주의</span>
                      )}
                    </div>
                    <p className="caution-item-text">
                      {item.caution || '정해진 용법과 용량을 준수하여 복용하세요.'}
                    </p>
                    <div className="caution-item-dosage-info">용법: {item.dosage}</div>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            /* 복용 완료 또는 대기 상태 */
            <div className="caution-empty-notice-wrap">
              <div className="caution-modal-empty-notice">
                <div className="caution-empty-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.8"
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <strong className="caution-empty-title">
                  {currentRxStatus?.status === 'completed'
                    ? '선택하신 날짜에 복용 중인 처방 약품이 없습니다.'
                    : currentRxStatus?.status === 'upcoming'
                    ? '복용 시작 전 처방전입니다.'
                    : '해당 일자에 복용할 처방 약품이 없습니다.'}
                </strong>
                <p className="caution-empty-desc">
                  {currentRxStatus?.status === 'completed'
                    ? '처방전의 복약 기간이 이미 완료되었습니다. 과거 처방 약품의 복용 주의사항을 확인하시려면 아래 접기/펼치기 또는 당시 복약 기록 날짜로 바로 이동해 보세요.'
                    : currentRxStatus?.status === 'upcoming'
                    ? `조제일(${prescriptionData?.dispensedDate || ''})부터 처방 약품 주의사항이 표시됩니다.`
                    : '유효한 복약 일자를 선택해 주세요.'}
                </p>
                {currentRxStatus?.status === 'completed' && prescriptionData?.dispensedDate && (
                  <button
                    type="button"
                    className="btn-modal-jump-date"
                    onClick={() => handleJump(prescriptionData.dispensedDate)}
                  >
                    당시 복약 기록 날짜로 이동 ({prescriptionData.dispensedDate})
                  </button>
                )}
              </div>

              {/* 지난 처방전 기록 접기/펼치기 */}
              {prescriptionData?.items && prescriptionData.items.length > 0 && (
                <div className="past-meds-toggle-area">
                  <button
                    type="button"
                    className="btn-past-meds-toggle"
                    onClick={() => setShowPastMedsInModal(!showPastMedsInModal)}
                  >
                    {showPastMedsInModal
                      ? '지난 처방 약품 목록 닫기 ▲'
                      : `지난 처방 약품 목록 확인하기 (${prescriptionData.items.length}종) ▼`}
                  </button>

                  {showPastMedsInModal && (
                    <div className="past-meds-dropdown-list">
                      <div className="past-meds-header-note">
                        ※ 아래는 복용이 완료된 지난 처방 기록입니다. (참고용)
                      </div>
                      <ul className="caution-items-list past">
                        {prescriptionData.items.map((item, idx) => (
                          <li key={idx} className="caution-item-card past">
                            <div className="caution-item-top">
                              <strong className="caution-item-name past">{item.name}</strong>
                              <span className="past-status-tag">복용 완료</span>
                            </div>
                            <p className="caution-item-text">
                              {item.caution || '정해진 용법과 용량을 준수하여 복용하세요.'}
                            </p>
                            <div className="caution-item-dosage-info">용법: {item.dosage}</div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button
            type="button"
            className="btn-confirm modal-confirm-btn"
            onClick={handleNavigate}
          >
            내 약 관리에서 전체 확인하기
          </button>
        </div>
      </div>
    </div>
  );
}
