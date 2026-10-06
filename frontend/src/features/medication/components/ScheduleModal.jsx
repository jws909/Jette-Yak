import { useState, useEffect } from 'react';
import { useDialog } from '../../../contexts/DialogContext';
import { saveCalendarSchedule } from '../medicationApi';

/**
 * 상비약 / 영양제 캘린더 복약 일정 등록 모달
 * - 자체 상태 관리 (슬롯 선택, 알림 시간, 예정 기간)
 */
export default function ScheduleModal({
  isOpen,
  med,
  currentUserId,
  onClose,
  onSuccess,
}) {
  const { showAlert } = useDialog();

  const [schedSlots, setSchedSlots] = useState({ morning: true, lunch: false, dinner: false, bedtime: false });
  const [schedTimes, setSchedTimes] = useState({ morning: '08:30', lunch: '12:30', dinner: '18:30', bedtime: '22:00' });
  const [schedDays, setSchedDays] = useState(30);
  const [isSaving, setIsSaving] = useState(false);

  // 약 선택 시 복용 시간(takeTime)에 따른 초기값 설정
  useEffect(() => {
    if (!med) return;

    let initSlot = 'morning';
    const timeVal = med.takeTime || '08:30';
    if (med.takeTime && med.takeTime.includes(':')) {
      const hour = parseInt(med.takeTime.split(':')[0], 10);
      if (hour < 11) initSlot = 'morning';
      else if (hour < 16) initSlot = 'lunch';
      else if (hour < 21) initSlot = 'dinner';
      else initSlot = 'bedtime';
    }

    setSchedSlots({
      morning: initSlot === 'morning',
      lunch: initSlot === 'lunch',
      dinner: initSlot === 'dinner',
      bedtime: initSlot === 'bedtime',
    });
    setSchedTimes((prev) => ({
      ...prev,
      [initSlot]: timeVal,
    }));
    setSchedDays(30);
  }, [med]);

  if (!isOpen || !med) return null;

  const handleSaveSchedule = async (e) => {
    e.preventDefault();
    const selectedSlots = Object.keys(schedSlots).filter((k) => schedSlots[k]);
    if (selectedSlots.length === 0) {
      showAlert('최소 1개 이상의 복용 시간대를 선택해 주세요.');
      return;
    }

    if (!currentUserId) {
      showAlert('로그인이 필요한 기능입니다.');
      return;
    }

    setIsSaving(true);
    try {
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      let allSuccess = true;
      let lastErrMsg = '';

      const isCabinet = med.source === 'CABINET';
      const rawNumericId = med.rawId ? Number(med.rawId) : null;

      for (const slot of selectedSlots) {
        const time = schedTimes[slot] || (slot === 'morning' ? '08:30' : slot === 'lunch' ? '12:30' : slot === 'dinner' ? '18:30' : '22:00');
        const payload = {
          userId: currentUserId,
          name: med.name,
          type: isCabinet ? 'regular' : 'supplement',
          medicationId: med.medicationId ? String(med.medicationId) : null,
          cabinetId: isCabinet ? rawNumericId : null,
          routineId: !isCabinet ? rawNumericId : null,
          scheduledDate: todayStr,
          scheduledTime: time,
          repeatDays: Number(schedDays) || 30,
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

        <form onSubmit={handleSaveSchedule}>
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
                  className={`slot-checkbox-label ${schedSlots[s.key] ? 'checked' : ''}`}
                  onClick={() => setSchedSlots((prev) => ({ ...prev, [s.key]: !prev[s.key] }))}
                >
                  <input
                    type="checkbox"
                    checked={Boolean(schedSlots[s.key])}
                    onChange={(e) => setSchedSlots((prev) => ({ ...prev, [s.key]: e.target.checked }))}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span>{s.label}</span>
                  <input
                    type="time"
                    className="slot-time-input"
                    value={schedTimes[s.key] || s.defaultTime}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSchedTimes((prev) => ({ ...prev, [s.key]: val }));
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
                  className={`days-pill ${schedDays === d ? 'active' : ''}`}
                  onClick={() => setSchedDays(d)}
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
              {isSaving ? '일정 생성 중...' : `${schedDays}일 복약 일정 등록 완료`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
