import React, { useState, useEffect } from 'react';

const FALLBACK_DEFAULT_WEEKDAY = {
  breakfast: '07:30',
  lunch: '12:00',
  dinner: '18:30',
  bedtime: '22:00',
};

const FALLBACK_DEFAULT_WEEKEND = {
  breakfast: '09:00',
  lunch: '13:00',
  dinner: '19:00',
  bedtime: '23:00',
};

function addMinutes(timeStr, mins) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m + mins;
  const wrapped = ((total % 1440) + 1440) % 1440;
  const newH = Math.floor(wrapped / 60);
  const newM = wrapped % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

/**
 * 맞춤 식사 및 취침 시간 설정 모달 (평일 / 주말 분리 지원)
 */
export default function MealTimeSettingModal({
  isOpen,
  onClose,
  mealTimes,
  mealSchedule,
  defaultMealTimes = FALLBACK_DEFAULT_WEEKDAY,
  onSave,
}) {
  const [activeTab, setActiveTab] = useState('WEEKDAY'); // 'WEEKDAY' | 'WEEKEND'
  const [weekdayTimes, setWeekdayTimes] = useState(FALLBACK_DEFAULT_WEEKDAY);
  const [weekendTimes, setWeekendTimes] = useState(FALLBACK_DEFAULT_WEEKEND);
  const [originalWeekendTimes, setOriginalWeekendTimes] = useState(FALLBACK_DEFAULT_WEEKEND);
  const [sameAsWeekday, setSameAsWeekday] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const wk = mealSchedule?.weekday || mealTimes || defaultMealTimes;
      const we = mealSchedule?.weekend || FALLBACK_DEFAULT_WEEKEND;

      const initWk = {
        breakfast: wk.breakfast || '07:30',
        lunch: wk.lunch || '12:00',
        dinner: wk.dinner || '18:30',
        bedtime: wk.bedtime || '22:00',
      };

      const initWe = {
        breakfast: we.breakfast || '09:00',
        lunch: we.lunch || '13:00',
        dinner: we.dinner || '19:00',
        bedtime: we.bedtime || '23:00',
      };

      setWeekdayTimes(initWk);
      setWeekendTimes(initWe);

      const isSame =
        initWk.breakfast === initWe.breakfast &&
        initWk.lunch === initWe.lunch &&
        initWk.dinner === initWe.dinner &&
        initWk.bedtime === initWe.bedtime;

      setSameAsWeekday(isSame);
      setOriginalWeekendTimes(isSame ? FALLBACK_DEFAULT_WEEKEND : initWe);
      setActiveTab('WEEKDAY');
      setIsSaving(false);
    }
  }, [isOpen, mealTimes, mealSchedule, defaultMealTimes]);

  if (!isOpen) return null;

  const currentTimes = activeTab === 'WEEKDAY' ? weekdayTimes : (sameAsWeekday ? weekdayTimes : weekendTimes);

  const handleTimeChange = (field, val) => {
    if (activeTab === 'WEEKDAY') {
      const updated = { ...weekdayTimes, [field]: val };
      setWeekdayTimes(updated);
      if (sameAsWeekday) {
        setWeekendTimes(updated);
      }
    } else {
      const updated = { ...weekendTimes, [field]: val };
      setWeekendTimes(updated);
      setOriginalWeekendTimes(updated);
    }
  };

  const handleResetCurrent = () => {
    if (activeTab === 'WEEKDAY') {
      setWeekdayTimes(FALLBACK_DEFAULT_WEEKDAY);
      if (sameAsWeekday) setWeekendTimes(FALLBACK_DEFAULT_WEEKDAY);
    } else {
      setWeekendTimes(FALLBACK_DEFAULT_WEEKEND);
      setOriginalWeekendTimes(FALLBACK_DEFAULT_WEEKEND);
      setSameAsWeekday(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const finalWeekend = sameAsWeekday ? { ...weekdayTimes } : { ...weekendTimes };
      await onSave?.({
        weekday: weekdayTimes,
        weekend: finalWeekend,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={() => !isSaving && onClose?.()}
    >
      <div className="modal-content-box meal-time-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3 className="modal-title">맞춤 식사 및 취침 시간 설정</h3>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            disabled={isSaving}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="meal-modal-form">
          <div className="meal-modal-intro">
            <p>
              평소 식사하시는 시간을 설정해 두시면, 처방전과 영양제의 <strong>‘식후 30분’</strong>,{' '}
              <strong>‘식후 15분’</strong> 등 복약 알림 시간이 자동으로 계산되어 딱 맞춰집니다.
            </p>
          </div>

          {/* 평일 / 주말 선택 탭 */}
          <div className="meal-tab-bar">
            <button
              type="button"
              className={`meal-tab-btn ${activeTab === 'WEEKDAY' ? 'active' : ''}`}
              onClick={() => setActiveTab('WEEKDAY')}
            >
              <i className="fa-solid fa-briefcase" aria-hidden="true" /> 평일 (월~금)
            </button>
            <button
              type="button"
              className={`meal-tab-btn ${activeTab === 'WEEKEND' ? 'active' : ''}`}
              onClick={() => setActiveTab('WEEKEND')}
            >
              <i className="fa-solid fa-mug-hot" aria-hidden="true" /> 주말 (토~일)
            </button>
          </div>

          {/* 주말 탭 선택 시 '평일과 동일하게 적용' 체크 옵션 */}
          {activeTab === 'WEEKEND' && (
            <label className="meal-same-toggle-row">
              <input
                type="checkbox"
                checked={sameAsWeekday}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setSameAsWeekday(checked);
                  if (checked) {
                    const isCurrentlyDifferent =
                      weekendTimes.breakfast !== weekdayTimes.breakfast ||
                      weekendTimes.lunch !== weekdayTimes.lunch ||
                      weekendTimes.dinner !== weekdayTimes.dinner ||
                      weekendTimes.bedtime !== weekdayTimes.bedtime;
                    if (isCurrentlyDifferent) {
                      setOriginalWeekendTimes({ ...weekendTimes });
                    }
                    setWeekendTimes({ ...weekdayTimes });
                  } else {
                    const restored = { ...originalWeekendTimes };
                    const isRestoredSameAsWk =
                      restored.breakfast === weekdayTimes.breakfast &&
                      restored.lunch === weekdayTimes.lunch &&
                      restored.dinner === weekdayTimes.dinner &&
                      restored.bedtime === weekdayTimes.bedtime;
                    setWeekendTimes(isRestoredSameAsWk ? FALLBACK_DEFAULT_WEEKEND : restored);
                  }
                }}
              />
              <span>주말도 평일 시간과 동일하게 사용하기</span>
            </label>
          )}

          <div className="meal-inputs-grid">
            <div className="meal-input-group">
              <label htmlFor="meal-breakfast">아침 식사 시간</label>
              <input
                id="meal-breakfast"
                type="time"
                className="styled-time-input"
                value={currentTimes.breakfast}
                onChange={(e) => handleTimeChange('breakfast', e.target.value)}
                disabled={activeTab === 'WEEKEND' && sameAsWeekday}
                required
              />
              <span className="meal-calc-hint">
                식후 30분 복용 시 <strong>{addMinutes(currentTimes.breakfast, 30)}</strong>
              </span>
            </div>

            <div className="meal-input-group">
              <label htmlFor="meal-lunch">점심 식사 시간</label>
              <input
                id="meal-lunch"
                type="time"
                className="styled-time-input"
                value={currentTimes.lunch}
                onChange={(e) => handleTimeChange('lunch', e.target.value)}
                disabled={activeTab === 'WEEKEND' && sameAsWeekday}
                required
              />
              <span className="meal-calc-hint">
                식후 30분 복용 시 <strong>{addMinutes(currentTimes.lunch, 30)}</strong>
              </span>
            </div>

            <div className="meal-input-group">
              <label htmlFor="meal-dinner">저녁 식사 시간</label>
              <input
                id="meal-dinner"
                type="time"
                className="styled-time-input"
                value={currentTimes.dinner}
                onChange={(e) => handleTimeChange('dinner', e.target.value)}
                disabled={activeTab === 'WEEKEND' && sameAsWeekday}
                required
              />
              <span className="meal-calc-hint">
                식후 30분 복용 시 <strong>{addMinutes(currentTimes.dinner, 30)}</strong>
              </span>
            </div>

            <div className="meal-input-group">
              <label htmlFor="meal-bedtime">취침 시간</label>
              <input
                id="meal-bedtime"
                type="time"
                className="styled-time-input"
                value={currentTimes.bedtime}
                onChange={(e) => handleTimeChange('bedtime', e.target.value)}
                disabled={activeTab === 'WEEKEND' && sameAsWeekday}
                required
              />
              <span className="meal-calc-hint">
                취침 전 복용 시 <strong>{currentTimes.bedtime}</strong>
              </span>
            </div>
          </div>

          {/* 실시간 알림 시간대 미리보기 박스 */}
          <div className="meal-preview-box">
            <div className="preview-title">
              <span>
                {activeTab === 'WEEKDAY' ? '평일' : '주말'} 1일 3회 식후 30분 처방약 기준 복약 스케줄 미리보기
              </span>
            </div>
            <div className="preview-schedule-pills">
              <div className="preview-pill">
                <span className="pill-badge">아침</span>
                <span className="pill-time">{addMinutes(currentTimes.breakfast, 30)}</span>
              </div>
              <span className="preview-arrow">→</span>
              <div className="preview-pill">
                <span className="pill-badge">점심</span>
                <span className="pill-time">{addMinutes(currentTimes.lunch, 30)}</span>
              </div>
              <span className="preview-arrow">→</span>
              <div className="preview-pill">
                <span className="pill-badge">저녁</span>
                <span className="pill-time">{addMinutes(currentTimes.dinner, 30)}</span>
              </div>
            </div>
          </div>

          <div className="modal-foot">
            <button
              type="button"
              className="btn-default-reset"
              onClick={handleResetCurrent}
              disabled={isSaving}
              title={`${activeTab === 'WEEKDAY' ? '평일' : '주말'} 기본 시간으로 초기화`}
            >
              {activeTab === 'WEEKDAY' ? '평일 기본값' : '주말 기본값'} 복원
            </button>
            <div className="modal-foot-right">
              <button
                type="button"
                className="btn-cancel modal-cancel-btn"
                onClick={onClose}
                disabled={isSaving}
              >
                취소
              </button>
              <button
                type="submit"
                className="btn-confirm modal-confirm-btn"
                disabled={isSaving}
              >
                {isSaving ? '저장 중...' : '저장하기'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
