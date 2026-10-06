import React, { useState } from 'react';
import { useDialog } from '../../../contexts/DialogContext';
import { addEverydayMed, saveCalendarSchedule } from '../medicationApi';

/**
 * 영양제 / 건강기능식품 직접 등록 탭 컴포넌트
 * - 자체 폼 상태 및 등록 핸들러 관리
 */
export default function SupplementTab({
  currentUserId,
  username,
  everydayMeds,
  onSuccess,
  onRemoveMed,
  onOpenScheduleModal,
}) {
  const { showAlert } = useDialog();

  const [customSupplementName, setCustomSupplementName] = useState('');
  const [customSupplementSlot, setCustomSupplementSlot] = useState('morning');
  const [customSupplementTime, setCustomSupplementTime] = useState('08:30');
  const [autoRegisterSchedule, setAutoRegisterSchedule] = useState(true);
  const [customSupplementDays, setCustomSupplementDays] = useState(30);

  const routineMeds = (everydayMeds || []).filter((m) => m.source === 'ROUTINE');

  // 영양제 직접 등록 (ROUTINE)
  const handleAddCustomSupplement = async (e) => {
    if (e) e.preventDefault();
    const name = customSupplementName.trim();
    if (!name) {
      showAlert('영양제 또는 건강기능식품 이름을 입력해 주세요.');
      return;
    }

    if (!currentUserId) {
      showAlert('로그인이 필요한 기능입니다.');
      return;
    }

    try {
      // 1. 평소 복용 영양제 (ROUTINE) 보관함 등록
      await addEverydayMed({
        userId: currentUserId,
        username: username,
        type: 'ROUTINE',
        name: name,
        takeTime: customSupplementTime,
        notes: `${(customSupplementSlot === 'morning' ? '아침' : (customSupplementSlot === 'lunch' ? '점심' : (customSupplementSlot === 'dinner' || customSupplementSlot === 'evening' ? '저녁' : '취침전')))} 식후`,
      });

      // 2. 캘린더 복약 일정 동시 등록 (autoRegisterSchedule 체크 시)
      let scheduleCreated = false;
      if (autoRegisterSchedule) {
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        try {
          await saveCalendarSchedule({
            userId: currentUserId,
            name: name,
            type: 'supplement',
            medicationId: null,
            scheduledDate: todayStr,
            scheduledTime: customSupplementTime,
            repeatDays: Number(customSupplementDays) || 30,
            alarmEnabled: 1,
          });
          scheduleCreated = true;
        } catch (calErr) {
          console.warn('캘린더 복약 일정 생성 실패:', calErr);
        }
      }

      showAlert(
        scheduleCreated
          ? `'${name}' 영양제 및 ${customSupplementDays}일간의 복약 일정이 캘린더에 성공적으로 등록되었습니다!`
          : `'${name}' 영양제가 성공적으로 등록되었습니다.`,
        '등록 완료'
      );
      setCustomSupplementName('');
      onSuccess?.();
      window.dispatchEvent(new CustomEvent('jette-intake-updated', {
        detail: { userId: currentUserId }
      }));
    } catch (err) {
      console.error('영양제 등록 오류:', err);
      showAlert(err.message || '영양제 등록 처리 중 오류가 발생했습니다.', '등록 오류');
    }
  };

  return (
    <section className="tab-section supplement-section">
      <div className="section-intro-card">
        <div className="intro-badge">데일리 헬스케어 루틴</div>
        <h2>영양제 및 건강기능식품 등록</h2>
        <p>
          매일 챙겨 먹는 비타민, 오메가3, 유산균, 루테인 등을 등록해 보세요.
          식사 시간대에 맞춰 제때 복용할 수 있도록 메인 체크리스트에 반영해 드립니다.
        </p>
      </div>

      <div className="supplement-form-layout">
        {/* 직접 등록 카드 */}
        <div className="supplement-input-card">
          <h3>새 영양제 등록하기</h3>
          <form onSubmit={handleAddCustomSupplement}>
            <div className="form-group">
              <label>영양제 제품명 또는 성분 <span className="required">*</span></label>
              <input
                type="text"
                className="form-input"
                placeholder="예: 고려은단 비타민C 1000, 락토핏 유산균, rTG 오메가3..."
                value={customSupplementName}
                onChange={(e) => setCustomSupplementName(e.target.value)}
                required
              />
            </div>

            {/* 빠른 추천 키워드 */}
            <div className="quick-supplement-tags">
              <span className="tags-label">추천 키워드:</span>
              {['종합비타민', '오메가3', '유산균', '루테인', '밀크씨슬', '마그네슘', '비타민D'].map((name) => (
                <button
                  key={name}
                  type="button"
                  className="tag-chip"
                  onClick={() => setCustomSupplementName(name)}
                >
                  + {name}
                </button>
              ))}
            </div>

            <div className="form-row-grid">
              <div className="form-group">
                <label>권장 복용 시간대</label>
                <select
                  className="form-select"
                  value={customSupplementSlot}
                  onChange={(e) => {
                    const slot = e.target.value;
                    setCustomSupplementSlot(slot);
                    if (slot === 'morning') setCustomSupplementTime('08:30');
                    if (slot === 'lunch') setCustomSupplementTime('12:30');
                    if (slot === 'dinner' || slot === 'evening') setCustomSupplementTime('18:30');
                    if (slot === 'bedtime') setCustomSupplementTime('22:00');
                  }}
                >
                  <option value="morning">아침 식후 (권장 08:30)</option>
                  <option value="lunch">점심 식후 (권장 12:30)</option>
                  <option value="dinner">저녁 식후 (권장 18:30)</option>
                  <option value="bedtime">취침 전 (권장 22:00)</option>
                </select>
              </div>

              <div className="form-group">
                <label>알림 시각</label>
                <input
                  type="time"
                  className="form-input"
                  value={customSupplementTime}
                  onChange={(e) => setCustomSupplementTime(e.target.value)}
                />
              </div>
            </div>

            {/* 복약 일정 동시 등록 옵션 */}
            <div className="schedule-sync-options">
              <label className="sync-checkbox-label">
                <input
                  type="checkbox"
                  checked={autoRegisterSchedule}
                  onChange={(e) => setAutoRegisterSchedule(e.target.checked)}
                />
                <span className="sync-title">캘린더 복약 일정에 함께 등록</span>
              </label>

              {autoRegisterSchedule && (
                <div className="days-picker-inline">
                  <span className="days-label">반복 기간:</span>
                  {[7, 14, 30, 90].map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={`day-btn-mini ${customSupplementDays === d ? 'active' : ''}`}
                      onClick={() => setCustomSupplementDays(d)}
                    >
                      {d}일
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button type="submit" className="supplement-submit-btn">
              + 영양제 {autoRegisterSchedule ? '및 복약 일정 ' : ''}등록하기
            </button>
          </form>
        </div>

        {/* 현재 등록된 영양제 목록 */}
        <div className="supplement-list-card">
          <h3>현재 등록된 영양제 목록 ({routineMeds.length}건)</h3>
          <div className="everyday-grid">
            {routineMeds.length === 0 ? (
              <p className="empty-hint">등록된 영양제가 없습니다. 왼쪽 폼에서 챙겨 먹는 영양제를 등록해 보세요!</p>
            ) : (
              routineMeds.map((med) => (
                <div key={med.id} className="everyday-card supplement">
                  <div className="card-header">
                    <span className="type-badge supplement">영양제</span>
                    <button
                      type="button"
                      className="del-icon-btn"
                      onClick={() => onRemoveMed(med)}
                      title="삭제"
                    >
                      ×
                    </button>
                  </div>
                  <strong className="med-name">{med.name}</strong>
                  {med.takeTime && <span className="time-tag">매일 {med.takeTime}</span>}
                  <button
                    type="button"
                    className="schedule-add-btn"
                    onClick={() => onOpenScheduleModal(med)}
                  >
                    일정 등록
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
