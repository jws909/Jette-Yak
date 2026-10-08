import { useNavigate } from 'react-router-dom';

/**
 * 처방 약품 목록 카드 컴포넌트 (PRESCRIBED MEDICINES)
 */
export default function PrescribedMedsCard({
  displayedMedList,
  currentRxStatus,
  selectedRxId,
  prescriptionData,
  groupedPrescriptionMeds,
  onSelectMedDetail,
  onJumpToDate,
}) {
  const navigate = useNavigate();

  return (
    <div className="prescribed-meds-card">
      <div className="card-top-row">
        <div>
          <span className="card-sub-label">PRESCRIBED MEDICINES</span>
          <h3 className="card-main-title">
            처방 약품 <span className="count-num">{String(displayedMedList.length).padStart(2, '0')}</span>
          </h3>
        </div>
        <button
          type="button"
          className="card-link-action"
          onClick={() => navigate('/medication/register?tab=prescription')}
          title="내 처방전 목록 및 수정/삭제 관리"
        >
          처방전 관리 &gt;
        </button>
      </div>

      {/* 과거 복용 완료 처방전인 경우 안내 배너 및 바로가기 */}
      {currentRxStatus?.status === 'completed' && selectedRxId !== 'all' && (
        <div className="past-rx-info-banner">
          <div className="past-rx-info-left">
            <span className="past-rx-badge">복용 완료 기록</span>
            <span className="past-rx-desc">
              조제일 {prescriptionData?.dispensedDate} ({prescriptionData?.totalDays}일 처방) 완료 내역입니다.
            </span>
          </div>
          {prescriptionData?.dispensedDate && (
            <button
              type="button"
              className="past-rx-jump-action"
              onClick={() => onJumpToDate(prescriptionData.dispensedDate)}
              title="당시 복약 체크 기록 확인"
            >
              당시 복약 기록 &rarr;
            </button>
          )}
        </div>
      )}

      <div className="meds-list-divider" />

      <div className="meds-vertical-list">
        {displayedMedList.length === 0 ? (
          <div className="meds-empty-notice">
            <div className="meds-empty-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <strong className="meds-empty-title">
              {currentRxStatus?.status === 'upcoming'
                ? '복용 시작 전입니다.'
                : '등록된 처방 약품이 없습니다.'}
            </strong>
            <p className="meds-empty-desc">
              {currentRxStatus?.status === 'upcoming'
                ? `조제일(${prescriptionData?.dispensedDate || ''})부터 처방 약품 목록이 표시됩니다.`
                : '처방전을 등록하시거나 유효한 복약 날짜를 선택해 주세요.'}
            </p>
          </div>
        ) : selectedRxId === 'all' ? (
          /* 통합 처방전 모드: 처방전별로 묶어서 그룹핑하여 표시 */
          groupedPrescriptionMeds.map((group) => {
            const groupTitle = group.nickname
              ? `${group.nickname} (${group.hospitalName})`
              : group.hospitalName;
            const dateFormatted = group.dispensedDate
              ? `${group.dispensedDate.slice(0, 10).replace(/-/g, '.')} 조제`
              : '';
            const metaText = [dateFormatted, `총 ${group.items.length}종`].filter(Boolean).join(' · ');

            return (
              <div key={group.prescriptionId} className="prescribed-group-box">
                <div className="prescribed-group-header">
                  <div className="prescribed-group-header-left">
                    <span className="prescribed-group-icon" title="처방전">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="15" height="15" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                    </span>
                    <strong className="prescribed-group-title" title={groupTitle}>
                      {groupTitle}
                    </strong>
                    {metaText && <span className="prescribed-group-meta">({metaText})</span>}
                  </div>

                  <div className="prescribed-group-header-right">
                    {group.status === 'taking' && (
                      <span className="prescribed-group-status-badge taking">
                        {group.dayNum ? `복용 중 (${group.dayNum}일차)` : '복용 중'}
                      </span>
                    )}
                    {group.status === 'completed' && (
                      <span className="prescribed-group-status-badge completed">복용 완료</span>
                    )}
                    {group.status === 'upcoming' && (
                      <span className="prescribed-group-status-badge upcoming">복용 예정</span>
                    )}
                  </div>
                </div>

                <div className="prescribed-group-items">
                  {group.items.map((med, idx) => (
                    <div
                      key={med.id || med.medicationId}
                      className="med-item-row"
                      onClick={() => onSelectMedDetail(med)}
                      title="상세 정보 보기"
                    >
                      <div className="med-item-left">
                        <span className="med-index-num">{String(idx + 1).padStart(2, '0')}</span>
                        <div className="med-text-group">
                          <div className="med-title-hospital-row">
                            <strong className="med-item-name">{med.name}</strong>
                          </div>
                          <p className="med-item-desc">{med.desc}</p>
                        </div>
                      </div>

                      <div className="med-item-right">
                        <span className={`med-type-pill ${med.badge === '처방' ? 'rx' : med.badge === '영양제' ? 'supp' : 'reg'}`}>
                          {med.badge || '처방'}
                        </span>
                        <button
                          type="button"
                          className="med-more-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectMedDetail(med);
                          }}
                          title="상세 복약 정보 보기"
                        >
                          ···
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        ) : (
          /* 개별 처방전 선택 모드: 그룹핑 헤더 없이 해당 처방전 약품들 평면 표시 */
          displayedMedList.map((med, idx) => (
            <div
              key={med.id || med.medicationId}
              className="med-item-row"
              onClick={() => onSelectMedDetail(med)}
              title="상세 정보 보기"
            >
              <div className="med-item-left">
                <span className="med-index-num">{String(idx + 1).padStart(2, '0')}</span>
                <div className="med-text-group">
                  <div className="med-title-hospital-row">
                    <strong className="med-item-name">{med.name}</strong>
                  </div>
                  <p className="med-item-desc">{med.desc}</p>
                </div>
              </div>

              <div className="med-item-right">
                <span className={`med-type-pill ${med.badge === '처방' ? 'rx' : med.badge === '영양제' ? 'supp' : 'reg'}`}>
                  {med.badge || '처방'}
                </span>
                <button
                  type="button"
                  className="med-more-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectMedDetail(med);
                  }}
                  title="상세 복약 정보 보기"
                >
                  ···
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
