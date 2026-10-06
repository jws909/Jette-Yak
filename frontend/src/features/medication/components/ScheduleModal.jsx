import { useState, useEffect } from 'react';
import { useDialog } from '../../../contexts/DialogContext';
import { saveCalendarSchedule } from '../medicationApi';
import { DEFAULT_MEAL_TIMES, addMinutes } from '../../main/utils/mainPageUtils';

const DEFAULT_SUPPLEMENT_TIMES = {
  morning: '08:30',
  lunch: '12:30',
  dinner: '18:30',
  bedtime: '22:00',
};

/**
 * 상비약 / 영양제 캘린더 복약 일정 등록 모달
 * - 자체 상태 관리 (슬롯 선택, 알림 시간, 예정 기간)
 * - 상비약: 유저 식사 시간(식후 30분) 연동 및 단기/중기 맞춤 기간 제공
 * - 영양제: 독립 시간대 및 정기 복용 기간 제공
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

  const getSlotBaseTimes = (isCab) => {
    if (isCab) {
      return {
        morning: addMinutes(baseMeals?.breakfast || '07:30', 30),
        lunch: addMinutes(baseMeals?.lunch || '12:00', 30),
        dinner: addMinutes(baseMeals?.dinner || '18:30', 30),
        bedtime: baseMeals?.bedtime || '22:00',
      };
    }
    return { ...DEFAULT_SUPPLEMENT_TIMES };
  };

  const [schedSlots, setSchedSlots] = useState({ morning: true, lunch: false, dinner: false, bedtime: false });
  const [schedTimes, setSchedTimes] = useState(() => getSlotBaseTimes(isCabinet));
  const [schedDays, setSchedDays] = useState(isCabinet ? 7 : 30);
  const [isSaving, setIsSaving] = useState(false);

  // 약 선택 시 복용 시간(takeTime) 및 상비약의 경우 유저 식사 시간에 따른 초기값 설정
  useEffect(() => {
    if (!med) return;

    const base = getSlotBaseTimes(isCabinet);
    let initSlot = 'morning';
    let initTimes = { ...base };

    if (med.takeTime && med.takeTime.includes(':')) {
      const hour = parseInt(med.takeTime.split(':')[0], 10);
      if (hour < 11) initSlot = 'morning';
      else if (hour < 16) initSlot = 'lunch';
      else if (hour < 21) initSlot = 'dinner';
      else initSlot = 'bedtime';
      initTimes[initSlot] = med.takeTime;
    }

    setSchedSlots({
      morning: initSlot === 'morning',
      lunch: initSlot === 'lunch',
      dinner: initSlot === 'dinner',
      bedtime: initSlot === 'bedtime',
    });
    setSchedTimes(initTimes);
    setSchedDays(isCabinet ? 7 : 30);
  }, [med, isCabinet, baseMeals]);

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
          <p className="modal-desc">
            {isCabinet ? (
              <>
                <i className="fa-regular fa-lightbulb" style={{ color: '#b45309', marginRight: '4px' }} aria-hidden="true" />
                <strong>상비약 복약 일정:</strong> 비염, 알레르기 등 주기적으로 복용하는 상비약은 등록하신 <strong>식사 시간(식후 30분) 기준</strong>으로 시간이 자동 계산되었습니다. 복용할 기간(1일~30일)을 선택해 주세요.
              </>
            ) : (
              '캘린더와 메인 화면에 매일 복약 체크를 진행할 시간대와 일수를 설정하세요.'
            )}
          </p>

          <div className="slots-picker">
            <label className="picker-title">복용 시간대 선택 및 알림 시간 설정 (복수 선택 가능)</label>
            <div className="slots-grid">
              {[
                { key: 'morning', label: '아침', defaultTime: getSlotBaseTimes(isCabinet).morning },
                { key: 'lunch', label: '점심', defaultTime: getSlotBaseTimes(isCabinet).lunch },
                { key: 'dinner', label: '저녁', defaultTime: getSlotBaseTimes(isCabinet).dinner },
                { key: 'bedtime', label: '취침전', defaultTime: getSlotBaseTimes(isCabinet).bedtime },
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
              {(isCabinet ? [1, 3, 7, 14, 30] : [7, 14, 30, 60, 90]).map((d) => (
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
              {isSaving
                ? '일정 생성 중...'
                : schedDays === 1
                ? '오늘 1회 복약 일정 등록'
                : `${schedDays}일 복약 일정 등록 완료`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
