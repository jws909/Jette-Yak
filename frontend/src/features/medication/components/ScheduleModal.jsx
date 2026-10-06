import { useState, useEffect } from 'react';
import { useDialog } from '../../../contexts/DialogContext';
import { saveCalendarSchedule } from '../medicationApi';
import { DEFAULT_MEAL_TIMES, addMinutes } from '../../main/utils/mainPageUtils';

// 영양제 타이밍 프리셋 (6종)
const SUPPLEMENT_PRESETS = [
  { key: 'empty_stomach', label: '기상 직후 (공복)', defaultTime: '07:00', icon: 'fa-sun' },
  { key: 'breakfast_post', label: '아침 식후', defaultTime: '07:45', icon: 'fa-utensils' },
  { key: 'lunch_post', label: '점심 식후', defaultTime: '12:15', icon: 'fa-bowl-food' },
  { key: 'afternoon', label: '오후 활력 충전', defaultTime: '15:30', icon: 'fa-bolt' },
  { key: 'dinner_post', label: '저녁 식후', defaultTime: '18:45', icon: 'fa-moon' },
  { key: 'bedtime', label: '취침 전', defaultTime: '22:00', icon: 'fa-bed' },
];

// 영양제 성분/이름별 최적 섭취 가이드 분석 함수
function getSupplementGuide(name = '') {
  const n = (name || '').toLowerCase();
  if (/유산균|프로바이오|프리바이오|락토|철분|콜라겐|비피더스/.test(n)) {
    return {
      recommendedKey: 'empty_stomach',
      recommendedFrequency: 1,
      tag: '공복 섭취 권장',
      tip: '유산균·철분 등은 위산의 영향을 줄이기 위해 기상 직후 공복에 충분한 물과 함께 섭취하는 것이 좋습니다.',
    };
  }
  if (/오메가|루테인|비타민d|비타민 d|코엔자임|밀크씨슬|지용성|크릴오일/.test(n)) {
    return {
      recommendedKey: 'lunch_post',
      recommendedFrequency: 1,
      tag: '식사 직후 권장',
      tip: '지용성 영양소(오메가3, 비타민D, 루테인 등)는 식사 직후 음식물의 지방질과 함께 섭취 시 체내 흡수율이 크게 높아집니다.',
    };
  }
  if (/칼슘|어골칼슘|해조칼슘|구연산칼슘|칼마디/.test(n)) {
    return {
      recommendedKey: 'dinner_post',
      recommendedFrequency: 2,
      tag: '하루 2회 분할 섭취 권장',
      tip: '칼슘은 1회 체내 흡수량에 한계가 있어 아침과 저녁으로 나누어 섭취하면 흡수율이 더욱 높아집니다.',
    };
  }
  if (/msm|식이유황|콘드로이친|글루코사민|관절/.test(n)) {
    return {
      recommendedKey: 'lunch_post',
      recommendedFrequency: 2,
      tag: '하루 2회 분할 섭취 권장',
      tip: '관절 및 연골 보호 성분은 식사 후 아침/저녁 등으로 나누어 섭취하는 것을 권장합니다.',
    };
  }
  if (/가르시니아|카테킨|다이어트|공액리놀레산/.test(n)) {
    return {
      recommendedKey: 'lunch_post',
      recommendedFrequency: 2,
      tag: '식사 전후 2회 권장',
      tip: '탄수화물 및 체지방 대사를 위해 하루 2회(점심/저녁 식전 또는 식후) 섭취를 권장합니다.',
    };
  }
  if (/비타민b|비타민 b|종합비타민|멀티비타민|비타민c|비타민 c|아르기닌|홍삼|마카/.test(n)) {
    const isMegaC = /고려은단|비타민c|비타민 c/.test(n);
    return {
      recommendedKey: 'breakfast_post',
      recommendedFrequency: isMegaC ? 2 : 1,
      tag: isMegaC ? '식후 2회 분할 권장' : '오전/낮 섭취 권장',
      tip: isMegaC
        ? '수용성 비타민C는 체내 배출이 빠르므로 아침/점심 또는 아침/저녁으로 나누어 드시면 좋습니다.'
        : '에너지 활력을 돕는 비타민군은 저녁 늦게 섭취하면 수면을 방해할 수 있어 아침 또는 점심 식후 섭취를 권장합니다.',
    };
  }
  if (/마그네슘|테아닌|수면|멜라토닌|가바|타트체리/.test(n)) {
    return {
      recommendedKey: 'bedtime',
      recommendedFrequency: 1,
      tag: '취침 전 권장',
      tip: '마그네슘과 테아닌은 근육 긴장을 이완하고 신경 안정을 도와 편안한 숙면에 도움을 줍니다.',
    };
  }
  return {
    recommendedKey: 'breakfast_post',
    recommendedFrequency: 1,
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

// 상비약 슬롯별 시간 계산기
function calcCabinetSlotTimes(meals) {
  return {
    morning: addMinutes(meals?.breakfast || '07:30', 30),
    lunch: addMinutes(meals?.lunch || '12:00', 30),
    dinner: addMinutes(meals?.dinner || '18:30', 30),
    bedtime: meals?.bedtime || '22:00',
  };
}

// 영양제 프리셋별 시간 계산기
function calcSupplementPresetTimes(meals) {
  return {
    empty_stomach: meals?.breakfast ? addMinutes(meals.breakfast, -30) : '07:00',
    breakfast_post: meals?.breakfast ? addMinutes(meals.breakfast, 15) : '07:45',
    lunch_post: meals?.lunch ? addMinutes(meals.lunch, 15) : '12:15',
    afternoon: '15:30',
    dinner_post: meals?.dinner ? addMinutes(meals.dinner, 15) : '18:45',
    bedtime: meals?.bedtime || '22:00',
  };
}

/**
 * 상비약 / 영양제 캘린더 복약 일정 등록 모달
 * - 평일(월~금) 및 주말(토~일) 식사 시간 연동 분리 설정 지원
 * - "주말도 평일 시간과 동일하게 사용하기" 원클릭 동기화 지원
 * - 상비약: 식사 시간(식후 30분) 기준 평일/주말 4개 슬롯 시간 개별 관리
 * - 영양제: 6종 프리셋 및 평일/주말 세부 알림 시간 개별 조정
 */
export default function ScheduleModal({
  isOpen,
  med,
  currentUserId,
  mealTimes,
  mealSchedule,
  onClose,
  onSuccess,
}) {
  const { showAlert } = useDialog();

  const isCabinet = med?.source === 'CABINET';

  // 평일/주말 기준 식사시간 추출
  const weekdayMeals = mealSchedule?.weekday || mealTimes || DEFAULT_MEAL_TIMES;
  const weekendMeals = mealSchedule?.weekend || {
    breakfast: '09:00',
    lunch: '13:00',
    dinner: '19:00',
    bedtime: '23:00',
  };

  // 평일/주말 탭 상태 ('weekday' | 'weekend')
  const [dayTypeTab, setDayTypeTab] = useState('weekday');
  // 주말도 평일 시간과 동일하게 사용 여부
  const [syncWeekend, setSyncWeekend] = useState(false);

  // 상비약용 상태: 슬롯 선택 여부
  const [cabinetSlots, setCabinetSlots] = useState({ morning: true, lunch: false, dinner: false, bedtime: false });
  // 상비약 평일 / 주말 슬롯 시간
  const [weekdayCabinetTimes, setWeekdayCabinetTimes] = useState(() => calcCabinetSlotTimes(weekdayMeals));
  const [weekendCabinetTimes, setWeekendCabinetTimes] = useState(() => calcCabinetSlotTimes(weekendMeals));
  const [originalWeekendCabinetTimes, setOriginalWeekendCabinetTimes] = useState(() => calcCabinetSlotTimes(weekendMeals));

  // 영양제용 상태: 하루 섭취 횟수 및 선택된 타이밍
  const [suppFrequency, setSuppFrequency] = useState(1); // 1, 2, 3회
  const [suppSelectedKeys, setSuppSelectedKeys] = useState(['breakfast_post']);
  // 영양제 평일 / 주말 타이밍 시간
  const [weekdaySuppTimes, setWeekdaySuppTimes] = useState(() => calcSupplementPresetTimes(weekdayMeals));
  const [weekendSuppTimes, setWeekendSuppTimes] = useState(() => calcSupplementPresetTimes(weekendMeals));
  const [originalWeekendSuppTimes, setOriginalWeekendSuppTimes] = useState(() => calcSupplementPresetTimes(weekendMeals));

  // 공통 복용 기간
  const [schedDays, setSchedDays] = useState(isCabinet ? 7 : 30);
  const [isSaving, setIsSaving] = useState(false);

  const guide = isCabinet ? null : getSupplementGuide(med?.name);

  // 약 변경 또는 식사시간 업데이트 시 상태 초기화
  useEffect(() => {
    if (!med) return;

    const wkCabinet = calcCabinetSlotTimes(weekdayMeals);
    const weCabinet = calcCabinetSlotTimes(weekendMeals);
    setWeekdayCabinetTimes(wkCabinet);
    setWeekendCabinetTimes(weCabinet);
    setOriginalWeekendCabinetTimes(weCabinet);

    const wkSupp = calcSupplementPresetTimes(weekdayMeals);
    const weSupp = calcSupplementPresetTimes(weekendMeals);
    setWeekdaySuppTimes(wkSupp);
    setWeekendSuppTimes(weSupp);
    setOriginalWeekendSuppTimes(weSupp);

    // 평일/주말 식사시간이 완전히 동일한지 확인하여 sync 기본값 설정
    const isSameMealTimes = (
      weekdayMeals.breakfast === weekendMeals.breakfast &&
      weekdayMeals.lunch === weekendMeals.lunch &&
      weekdayMeals.dinner === weekendMeals.dinner &&
      weekdayMeals.bedtime === weekendMeals.bedtime
    );
    setSyncWeekend(isSameMealTimes);
    setDayTypeTab('weekday');

    if (isCabinet) {
      setCabinetSlots({ morning: true, lunch: false, dinner: false, bedtime: false });
      setSchedDays(7);
    } else {
      const rec = getSupplementGuide(med.name);
      const recKey = rec.recommendedKey || 'breakfast_post';
      const initialFreq = (med.frequency && Number(med.frequency) >= 1)
        ? Number(med.frequency)
        : (rec.recommendedFrequency || 1);
      setSuppFrequency(initialFreq);

      if (initialFreq === 2) {
        setSuppSelectedKeys(['breakfast_post', 'dinner_post']);
      } else if (initialFreq === 3) {
        setSuppSelectedKeys(['breakfast_post', 'lunch_post', 'dinner_post']);
      } else {
        setSuppSelectedKeys([recKey]);
      }
      setSchedDays(30);
    }
  }, [med, isCabinet, weekdayMeals, weekendMeals]);

  if (!isOpen || !med) return null;

  // 하루 섭취 횟수 변경 핸들러
  const handleChangeFrequency = (freq) => {
    setSuppFrequency(freq);
    setSuppSelectedKeys((prev) => {
      if (freq === 1) {
        return [prev[0] || guide?.recommendedKey || 'breakfast_post'];
      }
      if (freq === 2) {
        if (prev.length >= 2) return prev.slice(0, 2);
        const first = prev[0] || guide?.recommendedKey || 'breakfast_post';
        const second = first === 'breakfast_post' ? 'dinner_post' : first === 'dinner_post' ? 'breakfast_post' : 'lunch_post';
        return [first, second];
      }
      if (freq === 3) {
        return ['breakfast_post', 'lunch_post', 'dinner_post'];
      }
      return prev;
    });
  };

  // 영양제 타이밍 선택 핸들러 (단일 또는 다중 선택)
  const handleSelectSuppTiming = (key) => {
    if (suppFrequency === 1) {
      setSuppSelectedKeys([key]);
      return;
    }
    setSuppSelectedKeys((prev) => {
      if (prev.includes(key)) {
        if (prev.length <= 1) return prev; // 최소 1개 유지
        return prev.filter((k) => k !== key);
      }
      if (prev.length < suppFrequency) {
        return [...prev, key];
      }
      return [...prev.slice(1), key];
    });
  };

  // 주말 동일 동기화 토글
  const handleToggleSyncWeekend = (e) => {
    const checked = e.target.checked;
    setSyncWeekend(checked);
    if (checked) {
      setOriginalWeekendCabinetTimes({ ...weekendCabinetTimes });
      setOriginalWeekendSuppTimes({ ...weekendSuppTimes });

      setWeekendCabinetTimes({ ...weekdayCabinetTimes });
      setWeekendSuppTimes({ ...weekdaySuppTimes });
    } else {
      setWeekendCabinetTimes({ ...originalWeekendCabinetTimes });
      setWeekendSuppTimes({ ...originalWeekendSuppTimes });
    }
  };

  // 캘린더 복약 일정 저장
  const handleSaveSchedule = async (e) => {
    e.preventDefault();

    if (!currentUserId) {
      showAlert('로그인이 필요한 기능입니다.');
      return;
    }

    // 시간대 및 타임 페이로드 목록 생성 (평일/주말 각각 바인딩)
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
        const wkTime = weekdayCabinetTimes[slot] || '08:30';
        const weTime = syncWeekend ? wkTime : (weekendCabinetTimes[slot] || '09:30');
        targets.push({
          slot,
          weekdayTime: wkTime,
          weekendTime: weTime,
        });
      });
    } else {
      if (suppSelectedKeys.length === 0) {
        showAlert('최소 1개 이상의 섭취 타이밍을 선택해 주세요.');
        return;
      }
      suppSelectedKeys.forEach((key) => {
        const preset = SUPPLEMENT_PRESETS.find((p) => p.key === key);
        const wkTime = weekdaySuppTimes[key] || preset?.defaultTime || '09:00';
        const weTime = syncWeekend ? wkTime : (weekendSuppTimes[key] || preset?.defaultTime || '09:00');
        targets.push({
          key,
          weekdayTime: wkTime,
          weekendTime: weTime,
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
          scheduledTime: t.weekdayTime, // 기본 시간 (하위 호환)
          weekdayTime: t.weekdayTime,   // 평일(월~금) 복용 시간
          weekendTime: t.weekendTime,   // 주말(토~일) 복용 시간
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
        showAlert(
          `${med.name}의 ${schedDays}일 복약 일정이 캘린더에 성공적으로 등록되었습니다!\n(평일 및 주말 시간에 맞춰 자동 분기 적용)`,
          '등록 완료'
        );
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

  const currentMeals = dayTypeTab === 'weekday' ? weekdayMeals : weekendMeals;

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
          {/* ================= [평일 / 주말 구분 탭 컨트롤] ================= */}
          <div className="schedule-daytype-bar">
            <div className="schedule-daytype-tabs">
              <button
                type="button"
                className={`schedule-day-tab ${dayTypeTab === 'weekday' ? 'active' : ''}`}
                onClick={() => setDayTypeTab('weekday')}
              >
                <i className="fa-solid fa-briefcase" aria-hidden="true" />
                <span>평일 (월~금)</span>
              </button>
              <button
                type="button"
                className={`schedule-day-tab ${dayTypeTab === 'weekend' ? 'active' : ''}`}
                onClick={() => setDayTypeTab('weekend')}
              >
                <i className="fa-solid fa-mug-hot" aria-hidden="true" />
                <span>주말 (토~일)</span>
              </button>
            </div>

            <label className="schedule-sync-label">
              <input
                type="checkbox"
                checked={syncWeekend}
                onChange={handleToggleSyncWeekend}
              />
              <span>주말도 평일 시간과 동일하게 사용</span>
            </label>
          </div>

          {/* 현재 선택 탭 식사 시간 연동 안내 배너 */}
          <div className="supplement-meal-notice">
            <i className="fa-solid fa-circle-info" aria-hidden="true" />
            <span>
              현재 <strong>{dayTypeTab === 'weekday' ? '평일 (월~금)' : '주말 (토~일)'}</strong> 식사 시간(아침 {currentMeals.breakfast || '07:30'}, 점심 {currentMeals.lunch || '12:00'}, 저녁 {currentMeals.dinner || '18:30'}, 취침 {currentMeals.bedtime || '22:00'})을 기준으로 시간이 계산되었습니다.
              {syncWeekend && <span className="sync-active-note"> (주말 동일 적용 중)</span>}
            </span>
          </div>

          {isCabinet ? (
            /* ================= [상비약 모달 UI] ================= */
            <>
              <p className="modal-desc">
                <i className="fa-regular fa-lightbulb" style={{ color: '#b45309', marginRight: '4px' }} aria-hidden="true" />
                <strong>상비약 복약 일정:</strong> 비염, 알레르기 등 주기적으로 복용하는 상비약은 등록하신 <strong>식사 시간(식후 30분) 기준</strong>으로 평일과 주말 시간이 각각 자동 계산되었습니다.
              </p>

              <div className="slots-picker">
                <label className="picker-title">
                  복용 시간대 선택 및 알림 시간 설정 ({dayTypeTab === 'weekday' ? '평일 시간대' : '주말 시간대'})
                </label>
                <div className="slots-grid">
                  {CABINET_SLOTS.map((s) => {
                    const currentVal = dayTypeTab === 'weekday'
                      ? (weekdayCabinetTimes[s.key] || '08:30')
                      : (syncWeekend ? weekdayCabinetTimes[s.key] : (weekendCabinetTimes[s.key] || '09:30'));

                    const wkVal = weekdayCabinetTimes[s.key] || '08:30';
                    const weVal = syncWeekend ? wkVal : (weekendCabinetTimes[s.key] || '09:30');

                    return (
                      <div
                        key={s.key}
                        className={`slot-checkbox-label ${cabinetSlots[s.key] ? 'checked' : ''}`}
                        onClick={() => setCabinetSlots((prev) => ({ ...prev, [s.key]: !prev[s.key] }))}
                      >
                        <div className="slot-header-row">
                          <input
                            type="checkbox"
                            checked={Boolean(cabinetSlots[s.key])}
                            onChange={(e) => setCabinetSlots((prev) => ({ ...prev, [s.key]: e.target.checked }))}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <span className="slot-name-text">{s.label}</span>
                        </div>
                        <input
                          type="time"
                          className="slot-time-input"
                          value={currentVal}
                          disabled={dayTypeTab === 'weekend' && syncWeekend}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (dayTypeTab === 'weekday') {
                              setWeekdayCabinetTimes((prev) => ({ ...prev, [s.key]: val }));
                              if (syncWeekend) {
                                setWeekendCabinetTimes((prev) => ({ ...prev, [s.key]: val }));
                              }
                            } else {
                              setWeekendCabinetTimes((prev) => ({ ...prev, [s.key]: val }));
                              setOriginalWeekendCabinetTimes((prev) => ({ ...prev, [s.key]: val }));
                              setSyncWeekend(false);
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          title={`${s.label} 알림 시간 설정`}
                        />
                        <div className="slot-daytimes-summary" onClick={(e) => e.stopPropagation()}>
                          <span>평일 {wkVal}</span>
                          <span className="sep">·</span>
                          <span>주말 {weVal}</span>
                        </div>
                      </div>
                    );
                  })}
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
                <p className="repeat-info-text">
                  <i className="fa-regular fa-calendar-check" aria-hidden="true" /> 기간 내 평일(월~금)과 주말(토~일)에 맞추어 각각 설정하신 시간으로 캘린더 일정이 자동 등록됩니다.
                </p>
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
                {/* 하루 섭취 횟수 선택 */}
                <div className="supp-freq-selector">
                  <span className="freq-selector-label">하루 섭취 횟수:</span>
                  <div className="freq-pill-group">
                    {[
                      { value: 1, label: '하루 1회 (기본)' },
                      { value: 2, label: '하루 2회' },
                      { value: 3, label: '하루 3회' },
                    ].map((f) => (
                      <button
                        key={f.value}
                        type="button"
                        className={`freq-pill ${suppFrequency === f.value ? 'active' : ''}`}
                        onClick={() => handleChangeFrequency(f.value)}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="picker-title">
                  {suppFrequency === 1
                    ? '섭취할 시간대를 선택해 주세요 (1곳 선택)'
                    : `섭취할 시간대 ${suppFrequency}곳을 선택해 주세요`}
                </label>
                <div className="supplement-timing-grid">
                  {SUPPLEMENT_PRESETS.map((p) => {
                    const isSelected = suppSelectedKeys.includes(p.key);
                    const isRec = guide?.recommendedKey === p.key;
                    const dispTime = dayTypeTab === 'weekday'
                      ? (weekdaySuppTimes[p.key] || p.defaultTime)
                      : (syncWeekend ? weekdaySuppTimes[p.key] : (weekendSuppTimes[p.key] || p.defaultTime));

                    return (
                      <div
                        key={p.key}
                        className={`timing-card ${isSelected ? 'active' : ''}`}
                        onClick={() => handleSelectSuppTiming(p.key)}
                        role="button"
                        tabIndex={0}
                      >
                        {isRec && <span className="recommend-badge">추천</span>}
                        <i className={`timing-icon fa-solid ${p.icon}`} aria-hidden="true" />
                        <span className="timing-label">{p.label}</span>
                        <span className="timing-time">{dispTime}</span>
                      </div>
                    );
                  })}
                </div>

                {/* 선택한 타이밍별 평일/주말 알림 시간 동시 확인 & 세부 조정 */}
                <div className="timing-custom-container">
                  <div className="timing-custom-header">
                    <i className="fa-regular fa-clock" aria-hidden="true" />
                    <span>선택한 시간대 알림 시간 (평일 / 주말 개별 조정):</span>
                  </div>

                  <div className="timing-custom-list">
                    {suppSelectedKeys.map((key) => {
                      const preset = SUPPLEMENT_PRESETS.find((p) => p.key === key);
                      if (!preset) return null;
                      const wkTime = weekdaySuppTimes[key] || preset.defaultTime;
                      const weTime = syncWeekend ? wkTime : (weekendSuppTimes[key] || preset.defaultTime);

                      return (
                        <div key={key} className="timing-custom-item">
                          <span className="item-preset-label">
                            <i className={`fa-solid ${preset.icon}`} aria-hidden="true" /> {preset.label}
                          </span>
                          <div className="item-time-inputs">
                            <label className="time-sub-input-wrap">
                              <span className="time-sub-label">평일:</span>
                              <input
                                type="time"
                                value={wkTime}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setWeekdaySuppTimes((prev) => ({ ...prev, [key]: val }));
                                  if (syncWeekend) {
                                    setWeekendSuppTimes((prev) => ({ ...prev, [key]: val }));
                                  }
                                }}
                              />
                            </label>
                            <label className="time-sub-input-wrap">
                              <span className="time-sub-label">주말:</span>
                              <input
                                type="time"
                                value={weTime}
                                disabled={syncWeekend}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setWeekendSuppTimes((prev) => ({ ...prev, [key]: val }));
                                  setOriginalWeekendSuppTimes((prev) => ({ ...prev, [key]: val }));
                                  setSyncWeekend(false);
                                }}
                              />
                            </label>
                          </div>
                        </div>
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
                <p className="repeat-info-text">
                  <i className="fa-regular fa-calendar-check" aria-hidden="true" /> 기간 내 평일(월~금)과 주말(토~일)에 맞추어 각각 설정하신 시간으로 캘린더 일정이 자동 등록됩니다.
                </p>
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
