import React from 'react';
import { formatTimeOnly, cleanCategoryName } from '../utils/mainPageUtils';

/**
 * 처방약 봉지(1포 단위) 복약 카드 컴포넌트
 */
export default function RoutinePouchCard({
  entry,
  isExpanded,
  onTogglePouch,
  onToggleExpand,
  onToggleRoutineItem,
  onSelectMedDetail,
}) {
  const allTaken = entry.items.every((i) => i.taken);
  const takenCount = entry.items.filter((i) => i.taken).length;
  const latestTaken = entry.items.find((i) => i.taken && i.takenAt)?.takenAt;

  const pouchTitle = entry.nickname
    ? entry.nickname
    : entry.purpose
    ? (entry.purpose.length > 25 ? entry.purpose.slice(0, 23) + '…' : entry.purpose)
    : `${entry.originHospital || '처방'}약`;

  const hospitalDateText = `${entry.originHospital || '의료기관'}${entry.dispensedDate ? ` · ${entry.dispensedDate.slice(0, 10).replace(/-/g, '.')} 조제` : ''}`;
  const pillsSummary = `${entry.items[0]?.name || '처방약'}${entry.items.length > 1 ? ` 외 ${entry.items.length - 1}종 (총 ${entry.items.length}종류)` : ' (1종류)'}`;

  return (
    <div className={`routine-pouch-card ${allTaken ? 'is-taken' : ''}`}>
      <div
        className="routine-pouch-header"
        onClick={(e) => onTogglePouch(entry, e)}
      >
        <div className="routine-item-left">
          <div
            className={`custom-checkbox ${allTaken ? 'checked' : ''}`}
            onClick={(e) => onTogglePouch(entry, e)}
            title={allTaken ? '복용 취소' : '봉지 전체 복용 완료'}
          >
            {allTaken && (
              <svg viewBox="0 0 14 14" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 7l3 3 5-6" />
              </svg>
            )}
          </div>

          <div className="pouch-icon-badge" title="약봉지 (1포 처방약)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="18" height="18" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>

          <div className="pouch-info-col">
            <div className="pouch-title-row">
              <span className="pouch-name">
                [{entry.slotLabel || '정시'} 1포] {pouchTitle}
              </span>
              <span className={`pouch-count-badge ${allTaken ? 'done' : ''}`}>
                {allTaken ? '전체 복용 완료' : `${takenCount}/${entry.items.length}종`}
              </span>
            </div>
            <div className="pouch-meta-row">
              <span className="pouch-hospital-date">{hospitalDateText}</span>
              <span className="pouch-summary-text">{pillsSummary}</span>
            </div>
          </div>
        </div>

        <div className="routine-item-right" onClick={(e) => e.stopPropagation()}>
          {allTaken && latestTaken && (
            <span className="routine-taken-time">
              {formatTimeOnly(latestTaken)} 복용
            </span>
          )}
          <button
            type="button"
            className="btn-pouch-toggle"
            onClick={(e) => onToggleExpand(entry.pouchKey, e)}
            title={isExpanded ? '처방약 목록 접기' : '포함된 처방약 보기'}
          >
            {isExpanded ? '접기 ▲' : `약 목록 (${entry.items.length}종) ▼`}
          </button>
        </div>
      </div>

      {/* 펼침 영역: 개별 처방약 목록 */}
      {isExpanded && (
        <div className="pouch-expanded-items">
          <div className="pouch-expanded-header">
            <span>봉지에 포함된 개별 처방약 목록 (개별 복용 체크 가능)</span>
          </div>
          {entry.items.map((subItem) => {
            const rawCategory = subItem.rawClassName || subItem.className || subItem.efficacy || '';
            const cleanCat = cleanCategoryName(rawCategory);
            const displayEfficacy = cleanCat.length > 12 ? cleanCat.slice(0, 11) + '…' : cleanCat;

            return (
              <div
                key={subItem.id}
                className={`pouch-subitem-row ${subItem.taken ? 'is-taken' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleRoutineItem(subItem.id);
                }}
              >
                <div className="routine-item-left">
                  <div className={`custom-checkbox sub-checkbox ${subItem.taken ? 'checked' : ''}`}>
                    {subItem.taken && (
                      <svg viewBox="0 0 14 14" fill="none" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 7l3 3 5-6" />
                      </svg>
                    )}
                  </div>
                  <span className="pouch-subitem-name">{subItem.name}</span>
                </div>

                <div className="routine-item-right" onClick={(e) => e.stopPropagation()}>
                  {displayEfficacy && (
                    <button
                      type="button"
                      className="subitem-efficacy-chip"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectMedDetail(subItem.rawMed || subItem);
                      }}
                      title={`${rawCategory ? `${rawCategory} · ` : ''}클릭 시 상세 복약 정보`}
                    >
                      <span>{displayEfficacy}</span>
                      <svg className="chip-info-icon" viewBox="0 0 20 20" fill="currentColor" width="11" height="11">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                    </button>
                  )}

                  {subItem.taken && subItem.takenAt && (
                    <span className="routine-taken-time">
                      {formatTimeOnly(subItem.takenAt)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
