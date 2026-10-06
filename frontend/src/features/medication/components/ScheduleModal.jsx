import { useState, useEffect } from 'react';
import { useDialog } from '../../../contexts/DialogContext';
import { saveCalendarSchedule } from '../medicationApi';
import { DEFAULT_MEAL_TIMES, addMinutes } from '../../main/utils/mainPageUtils';

// 영양제 타이밍 프리셋 (6종)
const SUPPLEMENT_PRESETS = [
  { key: 'empty_stomach', label: '기상 직후 (공복)', defaultTime: '07:00', icon: 'fa-sun' },
  { key: 'breakfast_post', label: '아침 식후', defaultTime: '09:00', icon: 'fa-utensils' },
  { key: 'lunch_post', label: '점심 식후', defaultTime: '13:00', icon: 'fa-bowl-food' },
  { key: 'afternoon', label: '오후 활력 충전', defaultTime: '15:30', icon: 'fa-bolt' },
  { key: 'dinner_post', label: '저녁 식후', defaultTime: '19:30', icon: 'fa-moon' },
  { key: 'bedtime', label: '취침 전', defaultTime: '22:30', icon: 'fa-bed' },
];

// 영양제 성분/이름별 최적 섭취 가이드 분석 함수
function getSupplementGuide(name = '') {
  const n = (name || '').toLowerCase();
  if (/유산균|프로바이오|프리바이오|락토|철분|콜라겐|비피더스/.test(n)) {
    return {
      recommendedKey: 'empty_stomach',
      tag: '공복 섭취 권장',
      tip: '유산균·철분 등은 위산의 영향을 줄이기 위해 기상 직후 공복에 충분한 물과 함께 섭취하는 것이 좋습니다.',
    };
  }
  if (/오메가|루테인|비타민d|비타민 d|코엔자임|밀크씨슬|지용성|크릴오일/.test(n)) {
    return {
      recommendedKey: 'lunch_post',
      tag: '식사 직후 권장',
      tip: '지용성 영양소(오메가3, 비타민D, 루테인 등)는 식사 직후 음식물의 지방질과 함께 섭취 시 체내 흡수율이 크게 높아집니다.',
    };
  }
  if (/비타민b|비타민 b|종합비타민|멀티비타민|비타민c|비타민 c|아르기닌|홍삼|마카/.test(n)) {
    return {
      recommendedKey: 'breakfast_post',
      tag: '오전/낮 섭취 권장',
      tip: '에너지 활력을 돕는 비타민군은 저녁 늦게 섭취하면 수면을 방해할 수 있어 아침 또는 점심 식후 섭취를 권장합니다.',
    };
  }
  if (/마그네슘|칼슘|테아닌|수면|멜라토닌|가바|타트체리/.test(n)) {
    return {
      recommendedKey: 'bedtime',
      tag: '취침 전 권장',
      tip: '마그네슘과 테아닌은 근육 긴장을 이완하고 신경 안정을 도와 편안한 숙면에 도움을 줍니다.',
    };
  }
  return {
    recommendedKey: 'breakfast_post',
    tag: '규칙적 섭취 권장',
    tip: '영양제는 매일 일정한 시간대에 꾸준히 섭취하는 것이 가장 효과적입니다.',
  };
}

// 상비약 기본 4개 슬롯
const CABINET_SLOTS = [
  { key: 'morning', label: '아침' },
  { key: 'lunch', label: '점심' },
  { key: 'dinner', label: '저녁' },
  { key: 'bedtime', label: '취침전' },
];

/**
 * 상비약 / 영양제 캘린더 복약 일정 등록 모달
 * - 상비약: 식사 시간(식후 30분) 연동 4개 슬롯 및 단기/중기 기간 제공
 * - 영양제: 성분별 스마트 권장 타이밍 가이드, 6종 프리셋 칩, 세부 시간 조정 제공
 */
export default function ScheduleModal({
  isOpen,
  med,
  currentUserId,
  mealTimes,
  onClose,
  onSuccess,
}) {
  const { showAlert } = useDialog();

  const isCabinet = med?.source === 'CABINET';
  const baseMeals = mealTimes || DEFAULT_MEAL_TIMES;

  // 상비약 식사시간 연동 슬롯 시간
  const getCabinetSlotTimes = () => ({
    morning: addMinutes(baseMeals?.breakfast || '07:30', 30),
    lunch: addMinutes(baseMeals?.lunch || '12:00', 30),
    dinner: addMinutes(baseMeals?.dinner || '18:30', 30),
    bedtime: baseMeals?.bedtime || '22:00',
  });

  // 상비약용 상태
  const [cabinetSlots, setCabinetSlots] = useState({ morning: true, lunch: false, dinner: false, bedtime: false });
  const [cabinetTimes, setCabinetTimes] = useState(getCabinetSlotTimes);

  // 영양제용 상태
  const [suppSelectedKeys, setSuppSelectedKeys] = useState(['breakfast_post']);
  const [suppTimes, setSuppTimes] = useState(() => {
    const init = {};
    SUPPLEMENT_PRESETS.forEach((p) => {
      init[p.key] = p.defaultTime;
    });
    return init;
  });

  // 공통 복용 기간
  const [schedDays, setSchedDays] = useState(isCabinet ? 7 : 30);
  const [isSaving, setIsSaving] = useState(false);

  const guide = isCabinet ? null : getSupplementGuide(med?.name);

  // 약 변경 시 초기화
  useEffect(() => {
    if (!med) return;

    if (isCabinet) {
      setCabinetTimes(getCabinetSlotTimes());
      setCabinetSlots({ morning: true, lunch: false, dinner: false, bedtime: false });
      setSchedDays(7);
    } else {
      // 영양제인 경우 성분 추천 기반 초기화
      const rec = getSupplementGuide(med.name);
      const recKey = rec.recommendedKey || 'breakfast_post';
      setSuppSelectedKeys([recKey]);

      const initialTimes = {};
      SUPPLEMENT_PRESETS.forEach((p) => {
        initialTimes[p.key] = p.defaultTime;
      });

      // 만약 약에 기존 takeTime이 설정되어 있으면 해당 시간에 반영
      if (med.takeTime && med.takeTime.includes(':')) {
        initialTimes[recKey] = med.takeTime;
      }
      setSuppTimes(initialTimes);
      setSchedDays(30);
    }
  }, [med, isCabinet, baseMeals]);

  if (!isOpen || !med) return null;

  // 영양제 타이밍 선택 토글
  const handleToggleSuppTiming = (key) => {
    setSuppSelectedKeys((prev) => {
      if (prev.includes(key)) {
        if (prev.length === 1) return prev; // 최소 1개 유지
        return prev.filter((k) => k !== key);
      }
      return [...prev, key];
    });
  };

  const handleSaveSchedule = async (e) => {
    e.preventDefault();

    if (!currentUserId) {
      showAlert('로그인이 필요한 기능입니다.');
      return;
    }

    // 시간대 및 타임 페이로드 목록 생성
    const targets = [];
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const rawNumericId = med.rawId ? Number(med.rawId) : null;

    if (isCabinet) {
      const selected = Object.keys(cabinetSlots).filter((k) => cabinetSlots[k]);
      if (selected.length === 0) {
        showAlert('최소 1개 이상의 복용 시간대를 선택해 주세요.');
        return;
      }
      selected.forEach((slot) => {
        targets.push({
          time: cabinetTimes[slot] || '08:30',
        });
      });
    } else {
      if (suppSelectedKeys.length === 0) {
        showAlert('최소 1개 이상의 섭취 타이밍을 선택해 주세요.');
        return;
      }
      suppSelectedKeys.forEach((key) => {
        const preset = SUPPLEMENT_PRESETS.find((p) => p.key === key);
        targets.push({
          time: suppTimes[key] || preset?.defaultTime || '09:00',
        });
      });
    }

    setIsSaving(true);
    try {
      let allSuccess = true;
      let lastErrMsg = '';

      for (const t of targets) {
        const payload = {
          userId: currentUserId,
          name: med.name,
          type: isCabinet ? 'regular' : 'supplement',
          medicationId: med.medicationId ? String(med.medicationId) : null,
          cabinetId: isCabinet ? rawNumericId : null,
          routineId: !isCabinet ? rawNumericId : null,
          scheduledDate: todayStr,
          scheduledTime: t.time,
          repeatDays: Number(schedDays) || (isCabinet ? 7 : 30),
          alarmEnabled: 1,
        };

        try {
          await saveCalendarSchedule(payload);
        } catch (schedErr) {
          allSuccess = false;
          lastErrMsg = schedErr.message || '';
        }
      }

      if (allSuccess) {
        showAlert(`${med.name}의 ${schedDays}일 복약 일정이 캘린더에 성공적으로 등록되었습니다!`, '등록 완료');
        onSuccess?.();
      } else {
        showAlert('일정 등록에 실패했습니다.' + (lastErrMsg ? ` (${lastErrMsg})` : ''), '등록 실패');
      }
    } catch (err) {
      console.error('일정 저장 오류:', err);
      showAlert('일정 저장 중 오류가 발생했습니다.', '오류');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={() => !isSaving && onClose()}>
      <div className="modal-box schedule-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{med.name} 복약 일정 등록</h2>
          <button
            type="button"
            className="close-btn"
            onClick={onClose}
            disabled={isSaving}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSaveSchedule}>
          {isCabinet ? (
            /* ================= [상비약 모달 UI] ================= */
            <>
              <p className="modal-desc">
                <i className="fa-regular fa-lightbulb" style={{ color: '#b45309', marginRight: '4px' }} aria-hidden="true" />
                <strong>상비약 복약 일정:</strong> 비염, 알레르기 등 주기적으로 복용하는 상비약은 등록하신 <strong>식사 시간(식후 30분) 기준</strong>으로 시간이 자동 계산되었습니다. 복용할 기간(1일~30일)을 선택해 주세요.
              </p>

              <div className="slots-picker">
                <label className="picker-title">복용 시간대 선택 및 알림 시간 설정 (식사시간 연동)</label>
                <div className="slots-grid">
                  {CABINET_SLOTS.map((s) => (
                    <div
                      key={s.key}
                      className={`slot-checkbox-label ${cabinetSlots[s.key] ? 'checked' : ''}`}
                      onClick={() => setCabinetSlots((prev) => ({ ...prev, [s.key]: !prev[s.key] }))}
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(cabinetSlots[s.key])}
                        onChange={(e) => setCabinetSlots((prev) => ({ ...prev, [s.key]: e.target.checked }))}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span>{s.label}</span>
                      <input
                        type="time"
                        className="slot-time-input"
                        value={cabinetTimes[s.key] || '08:30'}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCabinetTimes((prev) => ({ ...prev, [s.key]: val }));
                        }}
                        onClick={(e) => e.stopPropagation()}
                        title={`${s.label} 알림 시간 설정`}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="days-picker">
                <label className="picker-title">복용 예정 기간</label>
                <div className="days-options">
                  {[1, 3, 7, 14, 30].map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={`days-pill ${schedDays === d ? 'active' : ''}`}
                      onClick={() => setSchedDays(d)}
                    >
                      {d === 1 ? '오늘만 (1일)' : `${d}일분`}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            /* ================= [영양제 모달 UI] ================= */
            <>
              {guide && (
                <div className="supplement-tip-banner">
                  <div className="tip-badge-row">
                    <span className="tip-badge">
                      <i className="fa-regular fa-lightbulb" aria-hidden="true" /> {guide.tag}
                    </span>
                  </div>
                  <p className="tip-text">{guide.tip}</p>
                </div>
              )}

              <div className="slots-picker">
                <label className="picker-title">권장 섭취 타이밍 선택 (클릭하여 선택/변경)</label>
                <div className="supplement-timing-grid">
                  {SUPPLEMENT_PRESETS.map((p) => {
                    const isSelected = suppSelectedKeys.includes(p.key);
                    const isRec = guide?.recommendedKey === p.key;
                    return (
                      <div
                        key={p.key}
                        className={`timing-card ${isSelected ? 'active' : ''}`}
                        onClick={() => handleToggleSuppTiming(p.key)}
                        role="button"
                        tabIndex={0}
                      >
                        {isRec && <span className="recommend-badge">추천</span>}
                        <i className={`timing-icon fa-solid ${p.icon}`} aria-hidden="true" />
                        <span className="timing-label">{p.label}</span>
                        <span className="timing-time">{suppTimes[p.key] || p.defaultTime}</span>
                      </div>
                    );
                  })}
                </div>

                {/* 선택한 타이밍 시간 직접 조정 */}
                <div className="timing-custom-row">
                  <div className="custom-row-desc">
                    <i className="fa-regular fa-clock" aria-hidden="true" />
                    <span>선택한 시간대 알림 시간:</span>
                  </div>
                  <div className="custom-time-inputs-wrap">
                    {suppSelectedKeys.map((key) => {
                      const preset = SUPPLEMENT_PRESETS.find((p) => p.key === key);
                      if (!preset) return null;
                      return (
                        <label key={key} className="timing-badge-tag">
                          <span>{preset.label}:</span>
                          <input
                            type="time"
                            value={suppTimes[key] || preset.defaultTime}
                            onChange={(e) => {
                              const val = e.target.value;
                              setSuppTimes((prev) => ({ ...prev, [key]: val }));
                            }}
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="days-picker">
                <label className="picker-title">섭취 목표 기간</label>
                <div className="days-options">
                  {[30, 60, 90, 180].map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={`days-pill ${schedDays === d ? 'active' : ''}`}
                      onClick={() => setSchedDays(d)}
                    >
                      {d === 30 ? '30일 (1달분)' : d === 60 ? '60일 (2달분)' : d === 90 ? '90일 (3달분)' : '180일 (6달분)'}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="modal-actions">
            <button
              type="button"
              className="btn-cancel"
              onClick={onClose}
              disabled={isSaving}
            >
              취소
            </button>
            <button
              type="submit"
              className={`btn-submit ${!isCabinet ? 'supplement' : ''}`}
              disabled={isSaving}
            >
              {isSaving
                ? '일정 생성 중...'
                : isCabinet && schedDays === 1
                ? '오늘 1회 복약 일정 등록'
                : `${schedDays}일 복약 일정 등록 완료`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

