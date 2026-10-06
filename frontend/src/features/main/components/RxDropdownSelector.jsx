import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPrescriptionStatus } from '../utils/mainPageUtils';

/**
 * 처방전 선택 드롭다운 셀렉터 컴포넌트
 */
export default function RxDropdownSelector({
  allPrescriptions,
  selectedRxId,
  onSelectRxId,
  currentPrescriptionView,
  currentRxStatus,
  targetDate,
  onSetTargetDate,
}) {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <section className="rx-selector-section">
      <div className="rx-selector-header">
        <div className="rx-selector-header-left">
          <span className="rx-tabs-title-badge">등록 처방전</span>
          <span className="rx-tabs-count-title">처방전 선택 ({allPrescriptions.length}건)</span>
        </div>
        <button
          type="button"
          className="rx-manage-shortcut-btn"
          onClick={() => navigate('/medication/register?tab=prescription')}
          title="내 처방전 목록/수정/삭제 관리"
        >
          처방전 관리 &gt;
        </button>
      </div>

      <div className="rx-dropdown-container" ref={dropdownRef}>
        <button
          type="button"
          className={`rx-dropdown-trigger ${isOpen ? 'open' : ''}`}
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
        >
          <div className="rx-dropdown-trigger-left">
            <span className="rx-dropdown-icon">
              <svg viewBox="0 0 20 20" fill="currentColor">
                <path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 011 1v10a1 1 0 01-1 1H5a1 1 0 01-1-1V7zm3 4a1 1 0 000 2h6a1 1 0 100-2H7z" />
              </svg>
            </span>
            <div className="rx-dropdown-trigger-info">
              <strong className="rx-dropdown-trigger-title">
                {selectedRxId === 'all'
                  ? `전체 처방전 통합 (${allPrescriptions.length}건)`
                  : (currentPrescriptionView?.hospitalName || '의료기관')}
              </strong>
              <span className="rx-dropdown-trigger-sub">
                {selectedRxId === 'all'
                  ? '모든 등록 처방전 약품 종합 루틴'
                  : `조제일 ${currentPrescriptionView?.dispensedDate || '미상'} · ${currentPrescriptionView?.totalDays || 0}일분 · 약품 ${currentPrescriptionView?.items?.length || 0}종`}
              </span>
            </div>
          </div>

          <div className="rx-dropdown-trigger-right">
            {currentRxStatus && (
              <span className={`rx-tab-badge-chip ${currentRxStatus.status}`}>
                {currentRxStatus.badgeText}
              </span>
            )}
            <span className={`rx-dropdown-arrow-icon ${isOpen ? 'rotated' : ''}`}>
              <svg viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </span>
          </div>
        </button>

        {isOpen && (
          <div className="rx-dropdown-menu" role="listbox">
            {/* 전체 처방전 통합 옵션 */}
            <div
              role="option"
              aria-selected={selectedRxId === 'all'}
              className={`rx-dropdown-option ${selectedRxId === 'all' ? 'active' : ''}`}
              onClick={() => {
                onSelectRxId('all');
                setIsOpen(false);
                onSetTargetDate(new Date());
              }}
            >
              <div className="rx-dropdown-option-left">
                <span className="rx-dropdown-option-icon all">
                  <svg viewBox="0 0 20 20" fill="currentColor">
                    <path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 011 1v10a1 1 0 01-1 1H5a1 1 0 01-1-1V7zm3 4a1 1 0 000 2h6a1 1 0 100-2H7z" />
                  </svg>
                </span>
                <div className="rx-dropdown-option-info">
                  <strong className="rx-dropdown-option-title">전체 처방전 ({allPrescriptions.length}건) 통합 조회</strong>
                  <span className="rx-dropdown-option-sub">등록된 모든 처방전의 약품을 합산하여 루틴을 확인합니다.</span>
                </div>
              </div>
              <span className="rx-tab-badge-chip all">통합</span>
            </div>

            <div className="rx-dropdown-divider" />

            {/* 개별 처방전 옵션 목록 */}
            {allPrescriptions.map((rx) => {
              const today = new Date();
              const todayStatus = getPrescriptionStatus(rx.dispensedDate, rx.totalDays, today);
              const rxStatus = getPrescriptionStatus(rx.dispensedDate, rx.totalDays, targetDate);
              const isSelected = String(selectedRxId) === String(rx.prescriptionId);
              return (
                <div
                  key={rx.prescriptionId}
                  role="option"
                  aria-selected={isSelected}
                  className={`rx-dropdown-option ${isSelected ? 'active' : ''}`}
                  onClick={() => {
                    onSelectRxId(rx.prescriptionId);
                    setIsOpen(false);
                    if (todayStatus.status === 'taking') {
                      onSetTargetDate(today);
                    }
                  }}
                >
                  <div className="rx-dropdown-option-left">
                    <span className="rx-dropdown-option-icon rx">
                      <svg viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 2a1 1 0 011 1v6h6a1 1 0 110 2h-6v6a1 1 0 11-2 0v-6H3a1 1 0 110-2h6V3a1 1 0 011-1z" clipRule="evenodd" />
                      </svg>
                    </span>
                    <div className="rx-dropdown-option-info">
                      <div className="rx-dropdown-option-title-row">
                        <strong className="rx-dropdown-option-title">{rx.hospitalName || '의료기관'}</strong>
                        {rx.doctorName && <span className="rx-dropdown-option-doctor">{rx.doctorName}</span>}
                      </div>
                      <span className="rx-dropdown-option-sub">
                        조제일 {rx.dispensedDate || '미상'} · {rx.totalDays}일 처방 · 약품 {rx.items?.length || 0}종
                      </span>
                    </div>
                  </div>
                  <span className={`rx-tab-badge-chip ${rxStatus.status}`}>
                    {rxStatus.badgeText}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
