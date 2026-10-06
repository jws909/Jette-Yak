import { useState } from 'react';
import { useDialog } from '../../../contexts/DialogContext';
import { addEverydayMed } from '../medicationApi';

/**
 * 영양제 / 건강기능식품 등록 탭 컴포넌트
 * - 상비약 탭과 디자인 & 등록 흐름 100% 통일:
 *   1) 상단: 깔끔한 인라인 등록 입력창 + 추천 키워드 태그
 *   2) 하단: 보관함 카드 그리드 -> 각 카드의 [일정 등록] 버튼으로 복용 시간 및 캘린더 일정 등록
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

  const routineMeds = (everydayMeds || []).filter((m) => m.source === 'ROUTINE');

  // 영양제 보관함 등록 (ROUTINE)
  const handleAddCustomSupplement = async (overrideName) => {
    const name = (typeof overrideName === 'string' ? overrideName : customSupplementName).trim();
    if (!name) {
      showAlert('영양제 또는 건강기능식품 이름을 입력해 주세요.');
      return;
    }

    if (!currentUserId) {
      showAlert('로그인이 필요한 기능입니다.');
      return;
    }

    try {
      await addEverydayMed({
        userId: currentUserId,
        username: username,
        type: 'ROUTINE',
        name: name,
        notes: '건강기능식품',
      });

      showAlert(`'${name}' 이(가) 영양제 보관함에 등록되었습니다.\n복약 시간 알림이 필요한 경우 카드의 [일정 등록]을 눌러주세요.`, '등록 완료');
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
      {/* 1. 상단 안내 카드 */}
      <div className="section-intro-card">
        <div className="intro-badge">데일리 헬스케어 루틴</div>
        <h2>영양제 및 건강기능식품 등록</h2>
        <p>
          매일 챙겨 먹는 비타민, 오메가3, 유산균, 루테인 등을 보관함에 등록하세요.
          등록된 영양제 카드의 [일정 등록] 버튼을 눌러 복용 시간과 알림 일정을 캘린더에 바로 추가할 수 있습니다.
        </p>
      </div>

      {/* 2. 상단 등록 박스 (상비약 검색창과 100% 동일한 구조) */}
      <div className="cabinet-search-box">
        <form onSubmit={(e) => { e.preventDefault(); handleAddCustomSupplement(); }}>
          <div className="search-input-wrapper">
            <div className="search-input-row">
              <svg className="search-icon" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 2a8 8 0 100 16 8 8 0 000-16zM9 5a1 1 0 112 0v4h4a1 1 0 110 2h-4v4a1 1 0 11-2 0v-4H5a1 1 0 110-2h4V5z" clipRule="evenodd" />
              </svg>
              <input
                type="text"
                className="cabinet-search-input"
                placeholder="영양제 또는 건강기능식품 입력 (예: 고려은단 비타민C 1000, 락토핏 유산균, 오메가3...)"
                value={customSupplementName}
                onChange={(e) => setCustomSupplementName(e.target.value)}
                autoFocus
              />
              <button type="submit" className="cabinet-inline-submit-btn">
                + 영양제 등록
              </button>
            </div>
          </div>
        </form>

        {/* 추천 키워드 태그 */}
        <div className="popular-tags">
          <span className="tags-label">자주 찾는 영양제:</span>
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
      </div>

      {/* 3. 현재 등록된 영양제 목록 (상비약 탭과 완전히 통일된 카드 그리드) */}
      <div className="registered-sub-section">
        <h3>현재 등록된 영양제 목록 ({routineMeds.length}건)</h3>
        <div className="everyday-grid">
          {routineMeds.length === 0 ? (
            <p className="empty-hint">등록된 영양제가 없습니다. 위 입력창에서 영양제를 등록해 보세요!</p>
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
                <span className="entp-name">
                  {med.notes || '건강기능식품'}
                  {med.frequency && med.frequency > 1 ? ` · 하루 ${med.frequency}회 권장` : ''}
                </span>
                <button
                  type="button"
                  className="schedule-add-btn"
                  onClick={() => onOpenScheduleModal(med)}
                >
                  <i className="fa-regular fa-calendar-plus" aria-hidden="true" /> 일정 등록
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
