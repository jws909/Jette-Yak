import React from 'react';

/**
 * 영양제 / 건강기능식품 직접 등록 탭 컴포넌트
 */
export default function SupplementTab({
  customSupplementName,
  setCustomSupplementName,
  customSupplementSlot,
  setCustomSupplementSlot,
  customSupplementTime,
  setCustomSupplementTime,
  autoRegisterSchedule,
  setAutoRegisterSchedule,
  customSupplementDays,
  setCustomSupplementDays,
  onAddCustomSupplement,
  everydayMeds,
  onRemoveMed,
  onOpenScheduleModal,
}) {
  const routineMeds = (everydayMeds || []).filter((m) => m.source === 'ROUTINE');

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
          <form onSubmit={onAddCustomSupplement}>
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
