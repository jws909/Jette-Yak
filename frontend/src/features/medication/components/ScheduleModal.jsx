import React from 'react';

/**
 * 상비약 / 영양제 캘린더 복약 일정 등록 모달
 */
export default function ScheduleModal({
  isOpen,
  med,
  slots,
  setSlots,
  times,
  setTimes,
  days,
  setDays,
  isSaving,
  onClose,
  onSave,
}) {
  if (!isOpen || !med) return null;

  return (
    <div className="modal-overlay" onClick={() => !isSaving && onClose()}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
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

        <form onSubmit={onSave}>
          <p className="modal-desc">
            캘린더와 메인 화면에 매일 복약 체크를 진행할 시간대와 일수를 설정하세요.
          </p>

          <div className="slots-picker">
            <label className="picker-title">복용 시간대 선택 및 알림 시간 설정 (복수 선택 가능)</label>
            <div className="slots-grid">
              {[
                { key: 'morning', label: '아침', defaultTime: '08:30' },
                { key: 'lunch', label: '점심', defaultTime: '12:30' },
                { key: 'dinner', label: '저녁', defaultTime: '18:30' },
                { key: 'bedtime', label: '취침전', defaultTime: '22:00' },
              ].map((s) => (
                <div
                  key={s.key}
                  className={`slot-checkbox-label ${slots[s.key] ? 'checked' : ''}`}
                  onClick={() => setSlots((prev) => ({ ...prev, [s.key]: !prev[s.key] }))}
                >
                  <input
                    type="checkbox"
                    checked={Boolean(slots[s.key])}
                    onChange={(e) => setSlots((prev) => ({ ...prev, [s.key]: e.target.checked }))}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span>{s.label}</span>
                  <input
                    type="time"
                    className="slot-time-input"
                    value={times[s.key] || s.defaultTime}
                    onChange={(e) => {
                      const val = e.target.value;
                      setTimes((prev) => ({ ...prev, [s.key]: val }));
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
              {[7, 14, 30, 60, 90].map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`days-pill ${days === d ? 'active' : ''}`}
                  onClick={() => setDays(d)}
                >
                  {d}일분
                </button>
              ))}
            </div>
          </div>

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
              className="btn-submit"
              disabled={isSaving}
            >
              {isSaving ? '일정 생성 중...' : `${days}일 복약 일정 등록 완료`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
