import { formatTimeOnly } from '../utils/mainPageUtils';

/**
 * 단일 상비약 / 영양제 복약 카드 컴포넌트
 */
export default function RoutineSingleCard({
  entry,
  selectedRxId,
  onToggleRoutine,
}) {
  const isSupplement = entry.type === '영양제' || entry.rawType === 'supplement';
  const itemCategory = isSupplement ? 'supplement' : 'regular';
  const categoryLabel = isSupplement ? '영양제' : (entry.type === '상비약' ? '상비약' : (entry.type || '상비약'));
  const isSingleTaken = Boolean(entry.taken);
  const subDescText = entry.notes || (isSupplement ? '일일 건강 영양제 · 활력 보충' : '가정 상비의약품 · 증상 완화');

  return (
    <div
      className={`routine-single-card ${itemCategory} ${isSingleTaken ? 'is-taken' : ''}`}
      onClick={() => onToggleRoutine(entry.id)}
    >
      <div className="routine-item-left">
        <div
          className={`custom-checkbox ${itemCategory}-checkbox ${isSingleTaken ? 'checked' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleRoutine(entry.id);
          }}
          title={isSingleTaken ? '복용 취소' : '복용 완료 체크'}
        >
          {isSingleTaken && (
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 7l3 3 5-6" />
            </svg>
          )}
        </div>

        <div
          className={`single-card-icon-badge ${itemCategory}`}
          title={`${categoryLabel} (${entry.name})`}
        >
          {isSupplement ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="18" height="18" strokeWidth="2">
              <circle cx="12" cy="12" r="4" strokeWidth="2" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v3m0 14v3M4.93 4.93l2.12 2.12m9.9 9.9l2.12 2.12M2 12h3m14 0h3M4.93 19.07l2.12-2.12m9.9-9.9l2.12-2.12" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="18" height="18" strokeWidth="2">
              <rect x="3" y="6" width="18" height="14" rx="3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M12 10v6m-3-3h6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>

        <div className="single-card-info-col">
          <div className="single-card-title-row">
            <span className={`single-card-time-slot ${itemCategory}`}>
              [{entry.slotLabel || '정시'}{entry.time ? ` ${formatTimeOnly(entry.time)}` : ''}]
            </span>
            <strong className="single-card-name" title={entry.name}>
              {entry.name}
            </strong>
            <span className={`single-card-type-badge ${itemCategory}`}>
              {categoryLabel}
            </span>
            {selectedRxId === 'all' && entry.originHospital && (
              <span className="routine-origin-hospital-chip">{entry.originHospital}</span>
            )}
          </div>
          <div className="single-card-meta-row">
            <span className="single-card-sub-desc">{subDescText}</span>
          </div>
        </div>
      </div>

      <div className="routine-item-right" onClick={(e) => e.stopPropagation()}>
        {isSingleTaken && entry.takenAt ? (
          <span className={`routine-taken-time ${itemCategory}`}>
            {formatTimeOnly(entry.takenAt)} 복용 완료
          </span>
        ) : (
          <span className={`routine-pending-badge ${itemCategory}`}>
            복용 대기
          </span>
        )}
      </div>
    </div>
  );
}
