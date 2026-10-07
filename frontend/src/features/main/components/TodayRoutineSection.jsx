import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import RoutinePouchCard from './RoutinePouchCard';
import RoutineSingleCard from './RoutineSingleCard';
import {
  formatDateShort,
  formatDateWithDay,
  formatTimeOnly,
  getTargetDateDiffText,
  groupRoutineItemsByPouch,
  addMinutes,
} from '../utils/mainPageUtils';

/**
 * 메인 페이지 복약 루틴 섹션 (TODAY'S ROUTINE)
 */
export default function TodayRoutineSection({
  targetDate,
  isTargetToday,
  currentRxStatus,
  hasPrescription,
  prescriptionData,
  activeRoutineList,
  mealTimes,
  selectedRxId,
  onResetToday,
  onOpenMealModal,
  onJumpToDate,
  onTogglePouch,
  onToggleRoutine,
  onSelectMedDetail,
}) {
  const navigate = useNavigate();

  // 처방약 봉지 펼침/접힘 상태 (컴포넌트 자체 캡슐화)
  const [expandedPouches, setExpandedPouches] = useState({});

  const togglePouchExpand = (pouchKey, e) => {
    if (e) e.stopPropagation();
    setExpandedPouches((prev) => ({
      ...prev,
      [pouchKey]: !prev[pouchKey],
    }));
  };

  // 복약 루틴 시간대 탭 선택 상태 ('all' | 'breakfast' | 'lunch' | 'dinner' | 'bedtime')
  const [selectedRoutineSlot, setSelectedRoutineSlot] = useState(() => {
    const h = new Date().getHours();
    if (h < 11) return 'breakfast';
    if (h < 17) return 'lunch';
    return 'dinner';
  });

  const allRoutineUnits = useMemo(
    () => groupRoutineItemsByPouch(activeRoutineList),
    [activeRoutineList]
  );
  const takenUnitsCount = allRoutineUnits.filter((u) =>
    u.isPouch ? u.items.every((i) => i.taken) : u.taken
  ).length;
  const totalUnitsCount = allRoutineUnits.length;
  const takenCount = takenUnitsCount;
  const totalCount = totalUnitsCount;

  const slotMeta = [
    { key: 'breakfast', label: '아침', defaultTime: mealTimes?.breakfast || '07:30' },
    { key: 'lunch', label: '점심', defaultTime: mealTimes?.lunch || '12:00' },
    { key: 'dinner', label: '저녁', defaultTime: mealTimes?.dinner || '18:30' },
    { key: 'bedtime', label: '취침전', defaultTime: mealTimes?.bedtime || '22:00' },
  ];

  const groupedSlots = slotMeta
    .map((meta) => {
      const items = activeRoutineList.filter((i) => i.slot === meta.key);
      const units = groupRoutineItemsByPouch(items);
      const firstTime = items[0]?.time || addMinutes(meta.defaultTime, 30);
      return {
        slot: meta.key,
        label: meta.label,
        time: formatTimeOnly(firstTime),
        items,
        units,
      };
    })
    .filter((g) => g.items.length > 0);

  const activeSlotKey =
    selectedRoutineSlot === 'all' || groupedSlots.some((g) => g.slot === selectedRoutineSlot)
      ? selectedRoutineSlot
      : groupedSlots[0]?.slot || 'all';

  const routineSlotTabs = [
    {
      key: 'all',
      label: '전체',
      timeHint: '',
      taken: takenUnitsCount,
      total: totalUnitsCount,
      isAllDone: totalUnitsCount > 0 && takenUnitsCount === totalUnitsCount,
    },
    ...groupedSlots.map((g) => {
      const tCount = g.units.filter((u) =>
        u.isPouch ? u.items.every((i) => i.taken) : u.taken
      ).length;
      return {
        key: g.slot,
        label: g.label,
        timeHint: g.time,
        taken: tCount,
        total: g.units.length,
        isAllDone: g.units.length > 0 && tCount === g.units.length,
      };
    }),
  ];

  const displayedRoutineUnits =
    activeSlotKey === 'all'
      ? allRoutineUnits
      : groupRoutineItemsByPouch(activeRoutineList.filter((i) => i.slot === activeSlotKey));

  const routineDateBadge = `${String(targetDate.getMonth() + 1).padStart(2, '0')}.${String(
    targetDate.getDate()
  ).padStart(2, '0')}`;

  const renderRoutineEntry = (entry) => {
    if (entry.isPouch) {
      return (
        <RoutinePouchCard
          key={entry.pouchKey}
          entry={entry}
          isExpanded={Boolean(expandedPouches[entry.pouchKey])}
          onTogglePouch={onTogglePouch}
          onToggleExpand={togglePouchExpand}
          onToggleRoutineItem={onToggleRoutine}
          onSelectMedDetail={onSelectMedDetail}
        />
      );
    }

    return (
      <RoutineSingleCard
        key={entry.id}
        entry={entry}
        selectedRxId={selectedRxId}
        onToggleRoutine={onToggleRoutine}
      />
    );
  };

  return (
    <section className="today-routine-card today-routine-dark-card">
      {/* 1. 루틴 카드 헤더 액션 바 */}
      <div className="routine-header-row">
        <div className="routine-header-left">
          <span className="routine-label">TODAY'S ROUTINE</span>
          {!isTargetToday && (
            <span className="routine-past-pill">{getTargetDateDiffText(targetDate)} 기록</span>
          )}
        </div>
        <div className="routine-header-actions">
          <button
            type="button"
            className="med-register-quick-btn"
            onClick={() => navigate('/medication/register')}
            title="처방전, 상비약, 영양제 등록 페이지로 이동"
          >
            + 약 등록
          </button>
          <span className="routine-date-badge">{routineDateBadge}</span>
          {!isTargetToday && (
            <button
              type="button"
              className="routine-today-return-btn"
              onClick={onResetToday}
              title="오늘 날짜로 이동"
            >
              오늘로 복귀
            </button>
          )}
          <button
            type="button"
            className="meal-setting-btn"
            onClick={onOpenMealModal}
            title="아침/점심/저녁 식사 및 취침 시간 설정"
          >
            <svg className="setting-btn-icon" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
                clipRule="evenodd"
              />
            </svg>
            식사 시간 설정
          </button>
        </div>
      </div>

      {/* 2. 루틴 진행 타이틀 및 안내 팁 */}
      <div className="routine-title-row">
        <h3 className="routine-title">
          {isTargetToday ? '오늘의 복용' : `${formatDateShort(targetDate)} 복약 루틴`}{' '}
          <span className="taken-highlight">{takenCount}</span>/{totalCount}
        </h3>
        <span className="routine-rate-tip">
          {totalCount === 0
            ? currentRxStatus?.status === 'completed'
              ? '해당 일자에는 복용이 완료되어 일정이 없습니다.'
              : currentRxStatus?.status === 'upcoming'
              ? '해당 일자는 아직 복용 시작 전입니다.'
              : '등록된 복용 일정이 없습니다.'
            : !isTargetToday
            ? `${formatDateWithDay(targetDate)} 기준 복약 루틴을 확인하고 있습니다`
            : takenCount === totalCount
            ? '오늘 모든 복약을 완료했습니다!'
            : '시간대별 탭을 선택하여 간편하게 복용을 체크하세요'}
        </span>
      </div>

      {/* 3. 복약 루틴 시간대 탭 (아침, 점심, 저녁, 전체) */}
      {activeRoutineList.length > 0 && (
        <div className="routine-slot-tabs" role="tablist">
          {routineSlotTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeSlotKey === tab.key}
              className={`routine-slot-tab ${activeSlotKey === tab.key ? 'active' : ''} ${
                tab.isAllDone ? 'is-all-done' : ''
              }`}
              onClick={() => setSelectedRoutineSlot(tab.key)}
            >
              <span className="slot-tab-label">{tab.label}</span>
              {tab.timeHint && <span className="slot-tab-time">{tab.timeHint}</span>}
              <span className="slot-tab-badge">
                {tab.isAllDone ? '완료' : `${tab.taken}/${tab.total}`}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* 4. 체크리스트 항목들 */}
      <div className="routine-items-list">
        {activeRoutineList.length === 0 ? (
          <div className="routine-empty-box">
            <div className="routine-empty-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.8"
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                />
              </svg>
            </div>

            {hasPrescription ? (
              <>
                <h4 className="routine-empty-title">
                  {currentRxStatus?.status === 'completed'
                    ? '복용이 완료된 처방전입니다.'
                    : currentRxStatus?.status === 'upcoming'
                    ? '복용 시작 전입니다.'
                    : '복용 일정이 없습니다.'}
                </h4>
                <p className="routine-empty-text">
                  {currentRxStatus?.status === 'completed'
                    ? '선택하신 날짜에는 복용할 약이 없습니다. 아래 처방 약품 목록에서 약 정보를 확인하시거나, 당시 복약 체크 기록으로 바로 이동하실 수 있습니다.'
                    : currentRxStatus?.status === 'upcoming'
                    ? `복용 시작일(${prescriptionData?.dispensedDate || ''})부터 복약 루틴이 표시됩니다.`
                    : '선택하신 날짜에는 등록된 복약 일정이 없습니다.'}
                </p>
                {currentRxStatus?.status === 'completed' && prescriptionData?.dispensedDate && (
                  <button
                    type="button"
                    className="routine-jump-past-btn"
                    onClick={() => onJumpToDate(prescriptionData.dispensedDate)}
                  >
                    당시 복약 기록 확인하기 ({prescriptionData.dispensedDate}) &rarr;
                  </button>
                )}
              </>
            ) : (
              <>
                <h4 className="routine-empty-title">등록된 복약 일정이 없습니다.</h4>
                <p className="routine-empty-text">
                  처방전 사진을 등록하거나 상비약, 영양제를 등록하여 매일의 복약 루틴을 편리하게 관리해 보세요.
                </p>
                <button
                  type="button"
                  className="routine-empty-cta-btn"
                  onClick={() => navigate('/medication/register')}
                >
                  + 내 약 등록하러 가기 →
                </button>
              </>
            )}
          </div>
        ) : activeSlotKey === 'all' ? (
          /* 전체 보기 모드: 시간대별 섹션으로 그룹화 표시 */
          <div className="routine-grouped-container">
            {groupedSlots.map((group) => {
              const groupTaken = group.units.filter((u) =>
                u.isPouch ? u.items.every((i) => i.taken) : u.taken
              ).length;
              const groupAllDone = group.units.length > 0 && groupTaken === group.units.length;
              return (
                <div key={group.slot} className="routine-slot-section">
                  <div className="slot-section-header">
                    <div className="slot-section-info">
                      <span className="slot-section-badge">{group.label}</span>
                      <span className="slot-section-time">{group.time} 복용 예정</span>
                    </div>
                    <span className={`slot-section-counter ${groupAllDone ? 'done' : ''}`}>
                      {groupAllDone ? '복용 완료' : `${groupTaken} / ${group.units.length} 완료`}
                    </span>
                  </div>

                  <div className="slot-section-items">
                    {group.units.map((entry) => renderRoutineEntry(entry))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* 개별 시간대 탭 선택 모드: 선택된 시간대의 약품만 표시 */
          <div className="routine-single-slot-container">
            <div className="slot-single-header">
              <span className="slot-single-title">
                {routineSlotTabs.find((t) => t.key === activeSlotKey)?.label} 복약 리스트
              </span>
              <span className="slot-single-count">
                {displayedRoutineUnits.filter((u) => (u.isPouch ? u.items.every((i) => i.taken) : u.taken)).length} /{' '}
                {displayedRoutineUnits.length} 완료
              </span>
            </div>

            {displayedRoutineUnits.map((entry) => renderRoutineEntry(entry))}
          </div>
        )}
      </div>

      {/* 5. 복약 기록 전체 보기 버튼 (와이어프레임 캘린더 연동) */}
      <div className="routine-footer-action">
        <button
          type="button"
          className="view-all-records-btn"
          onClick={() => navigate('/calendar')}
        >
          복약 기록 전체 보기 <span className="arrow-right">→</span>
        </button>
      </div>
    </section>
  );
}
