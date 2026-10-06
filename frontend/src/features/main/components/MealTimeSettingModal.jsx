import React, { useState, useEffect } from 'react';

const FALLBACK_DEFAULT_MEAL_TIMES = {
  breakfast: '07:30',
  lunch: '12:00',
  dinner: '18:30',
  bedtime: '22:00',
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
 * 맞춤 식사 및 취침 시간 설정 모달
 */
export default function MealTimeSettingModal({
  isOpen,
  onClose,
  mealTimes,
  defaultMealTimes = FALLBACK_DEFAULT_MEAL_TIMES,
  onSave,
}) {
  const [tempMealTimes, setTempMealTimes] = useState(mealTimes || defaultMealTimes);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTempMealTimes(mealTimes || defaultMealTimes);
      setIsSaving(false);
    }
  }, [isOpen, mealTimes, defaultMealTimes]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSave?.(tempMealTimes);
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
              평소 식사하시는 시간을 설정해 두시면, 처방전의 <strong>‘식후 30분’</strong>,{' '}
              <strong>‘식전 30분’</strong> 등의 복약 알림 시간이 자동으로 계산되어 딱 맞춰집니다.
            </p>
          </div>

          <div className="meal-inputs-grid">
            <div className="meal-input-group">
              <label htmlFor="meal-breakfast">아침 식사 시간</label>
              <input
                id="meal-breakfast"
                type="time"
                className="styled-time-input"
                value={tempMealTimes.breakfast}
                onChange={(e) =>
                  setTempMealTimes((prev) => ({ ...prev, breakfast: e.target.value }))
                }
                required
              />
              <span className="meal-calc-hint">
                식후 30분 복용 시 <strong>{addMinutes(tempMealTimes.breakfast, 30)}</strong>
              </span>
            </div>

            <div className="meal-input-group">
              <label htmlFor="meal-lunch">점심 식사 시간</label>
              <input
                id="meal-lunch"
                type="time"
                className="styled-time-input"
                value={tempMealTimes.lunch}
                onChange={(e) =>
                  setTempMealTimes((prev) => ({ ...prev, lunch: e.target.value }))
                }
                required
              />
              <span className="meal-calc-hint">
                식후 30분 복용 시 <strong>{addMinutes(tempMealTimes.lunch, 30)}</strong>
              </span>
            </div>

            <div className="meal-input-group">
              <label htmlFor="meal-dinner">저녁 식사 시간</label>
              <input
                id="meal-dinner"
                type="time"
                className="styled-time-input"
                value={tempMealTimes.dinner}
                onChange={(e) =>
                  setTempMealTimes((prev) => ({ ...prev, dinner: e.target.value }))
                }
                required
              />
              <span className="meal-calc-hint">
                식후 30분 복용 시 <strong>{addMinutes(tempMealTimes.dinner, 30)}</strong>
              </span>
            </div>

            <div className="meal-input-group">
              <label htmlFor="meal-bedtime">취침 시간</label>
              <input
                id="meal-bedtime"
                type="time"
                className="styled-time-input"
                value={tempMealTimes.bedtime}
                onChange={(e) =>
                  setTempMealTimes((prev) => ({ ...prev, bedtime: e.target.value }))
                }
                required
              />
              <span className="meal-calc-hint">
                취침 전 복용 시 <strong>{tempMealTimes.bedtime}</strong>
              </span>
            </div>
          </div>

          {/* 실시간 알림 시간대 미리보기 박스 */}
          <div className="meal-preview-box">
            <div className="preview-title">
              <span>1일 3회 식후 30분 처방약 기준 복약 스케줄 미리보기</span>
            </div>
            <div className="preview-schedule-pills">
              <div className="preview-pill">
                <span className="pill-badge">아침</span>
                <span className="pill-time">{addMinutes(tempMealTimes.breakfast, 30)}</span>
              </div>
              <span className="preview-arrow">→</span>
              <div className="preview-pill">
                <span className="pill-badge">점심</span>
                <span className="pill-time">{addMinutes(tempMealTimes.lunch, 30)}</span>
              </div>
              <span className="preview-arrow">→</span>
              <div className="preview-pill">
                <span className="pill-badge">저녁</span>
                <span className="pill-time">{addMinutes(tempMealTimes.dinner, 30)}</span>
              </div>
            </div>
          </div>

          <div className="modal-foot">
            <button
              type="button"
              className="btn-default-reset"
              onClick={() => setTempMealTimes(defaultMealTimes)}
              disabled={isSaving}
              title="기본값(07:30, 12:00, 18:30, 22:00)으로 초기화"
            >
              기본값 복원
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
