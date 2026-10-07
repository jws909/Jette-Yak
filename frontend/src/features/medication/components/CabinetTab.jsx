import { useMedicationSearch } from '../../../hooks/useMedicationSearch';
import { useDialog } from '../../../contexts/DialogContext';
import { addEverydayMed, saveCalendarSchedule } from '../medicationApi';
import { useIsMobile } from '../../../hooks/useIsMobile';

/**
 * 상비약 / 일반의약품 검색 등록 탭 컴포넌트
 * - 자체 검색 훅(useMedicationSearch) 및 등록 핸들러 관리
 * - 필요 시 즉시 복용(⚡ 지금 복용) 및 식사시간 연동 주기적 일정 등록 지원
 */
export default function CabinetTab({
  currentUserId,
  username,
  everydayMeds,
  onSuccess,
  onRemoveMed,
  onOpenScheduleModal,
}) {
  const { showAlert, showConfirm } = useDialog();

  const {
    searchText: medSearchText,
    setSearchText: setMedSearchText,
    handleInputChange: handleMedSearchChange,
    handleKeyDown: handleMedSearchKeyDown,
    searchResults,
    isSearching,
    isDropdownOpen,
    setIsDropdownOpen,
    highlightIndex,
    setHighlightIndex,
    containerRef: searchBoxRef,
    clearSearch,
  } = useMedicationSearch({ debounceMs: 250 });

  const isMobile = useIsMobile(680);
  const cabinetMeds = (everydayMeds || []).filter((m) => m.source === 'CABINET');

  // 상비약 등록 (CABINET)
  const handleAddCabinetMed = async (item) => {
    const medId = item?.medicationId || item?.itemSeq;
    if (!medId) return;

    if (!currentUserId) {
      showAlert('로그인이 필요한 기능입니다.');
      return;
    }

    try {
      await addEverydayMed({
        userId: currentUserId,
        username: username,
        type: 'CABINET',
        medicationId: String(medId),
      });

      showAlert(`'${item.itemName}' 이(가) 상비약으로 등록되었습니다.`, '등록 완료');
      clearSearch();
      onSuccess?.();
      window.dispatchEvent(new CustomEvent('jette-intake-updated', {
        detail: { userId: currentUserId }
      }));
    } catch (err) {
      console.error('상비약 등록 오류:', err);
      showAlert(err.message || '상비약 등록 처리 중 오류가 발생했습니다.', '등록 오류');
    }
  };

  // 상비약 지금 즉시 1회 복용 기록 (필요 시 복용)
  const handleQuickTake = async (med) => {
    if (!currentUserId) {
      showAlert('로그인이 필요한 기능입니다.');
      return;
    }

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const timeStr = `${hours}:${minutes}`;

    const confirmed = await showConfirm(
      `'${med.name}'을(를) 지금(${timeStr}) 복용하셨나요?\n오늘 복약 기록에 1회 즉시 기록됩니다.`,
      '상비약 지금 복용 기록'
    );
    if (!confirmed) return;

    try {
      const rawNumericId = med.rawId ? Number(med.rawId) : null;
      await saveCalendarSchedule({
        userId: currentUserId,
        name: med.name,
        type: 'regular',
        medicationId: med.medicationId ? String(med.medicationId) : null,
        cabinetId: rawNumericId,
        scheduledDate: todayStr,
        scheduledTime: timeStr,
        repeatDays: 1, // 오늘 당일 1회 복용
        alarmEnabled: 0,
      });

      showAlert(`'${med.name}' 복용이 기록되었습니다! (${timeStr})\n메인 화면과 캘린더에서 확인하실 수 있습니다.`, '복용 기록 완료');
      window.dispatchEvent(new CustomEvent('jette-intake-updated', {
        detail: { userId: currentUserId }
      }));
      onSuccess?.();
    } catch (err) {
      console.error('지금 복용 기록 오류:', err);
      showAlert(err.message || '복용 기록 저장 중 오류가 발생했습니다.', '오류');
    }
  };

  return (
    <section className="tab-section cabinet-section">
      <div className="section-intro-card">
        <div className="intro-badge">식약처 공공 의약품 DB 연동</div>
        <h2>가정 상비약 및 일반의약품 검색 등록</h2>
        <p>
          타이레놀, 소화제, 지사제 등 집에 상비해 둔 약이나 약국에서 구입한 일반의약품을 검색하여 등록하세요.
          원하는 경우 매일/주기적인 복약 일정을 캘린더에 바로 추가할 수 있습니다.
        </p>
      </div>

      <div className="cabinet-search-box" ref={searchBoxRef}>
        <div className="search-input-wrapper">
          <div className="search-input-row">
            <svg className="search-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 19l-4-4m0-7A7 7 0 1 1 1 8a7 7 0 0 1 14 0Z" />
            </svg>
            <input
              type="text"
              className="cabinet-search-input"
              placeholder={isMobile ? '상비약 검색 (예: 타이레놀)' : '상비약 검색 (예: 타이레놀, 훼스탈, 베아제)'}
              value={medSearchText}
              onChange={handleMedSearchChange}
              onFocus={() => {
                if (medSearchText.trim()) setIsDropdownOpen(true);
              }}
              onKeyDown={(e) => handleMedSearchKeyDown(e, handleAddCabinetMed)}
              autoFocus
            />
            {isSearching && <span className="searching-spinner" />}
          </div>

          {/* 검색 자동완성 드롭다운 (식약처 DB 약품 등록) */}
          {isDropdownOpen && medSearchText.trim() && (
            <div className="search-autocomplete-dropdown">
              {searchResults.length > 0 ? (
                <div className="dropdown-section">
                  <div className="dropdown-header">
                    식약처 의약품 DB 검색 결과 ({searchResults.length}건) · 클릭 또는 Enter로 바로 등록
                  </div>
                  <div className="dropdown-med-list">
                    {searchResults.map((item, idx) => (
                      <div
                        key={item.medicationId || item.itemSeq || idx}
                        className={`dropdown-med-item ${highlightIndex === idx ? 'highlighted' : ''}`}
                        onClick={() => handleAddCabinetMed(item)}
                        onMouseEnter={() => setHighlightIndex(idx)}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="med-info">
                          <strong className="med-title">{item.itemName}</strong>
                          {item.entpName && <span className="med-corp">{item.entpName}</span>}
                        </div>
                        <div className="med-add-actions">
                          <span className="med-add-badge badge-cabinet">
                            + 상비약 등록
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : !isSearching ? (
                <div className="dropdown-empty-hint">
                  검색된 의약품이 없습니다. 정확한 약품명을 입력해 주세요.
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* 검색 추천 태그 */}
        <div className="popular-tags">
          <span className="tags-label">자주 찾는 상비약:</span>
          {['타이레놀', '판피린', '훼스탈', '이지엔6', '후시딘', '까스활명수'].map((tag) => (
            <button
              key={tag}
              type="button"
              className="tag-chip"
              onClick={() => {
                setMedSearchText(tag);
                setIsDropdownOpen(true);
              }}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* 현재 등록된 상비약 목록 */}
      <div className="registered-sub-section">
        <h3>현재 등록된 상비약 목록 ({cabinetMeds.length}건)</h3>
        <div className="everyday-grid">
          {cabinetMeds.length === 0 ? (
            <p className="empty-hint">등록된 상비약이 없습니다. 위 검색창에서 약을 검색해 보세요!</p>
          ) : (
            cabinetMeds.map((med) => (
              <div key={med.id} className="everyday-card cabinet">
                <div className="card-header">
                  <span className="type-badge cabinet">상비약</span>
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
                {med.entpName && <span className="entp-name">{med.entpName}</span>}
                <div className="card-actions-row">
                  <button
                    type="button"
                    className="btn-quick-take"
                    onClick={() => handleQuickTake(med)}
                    title="방금 급하게 드셨을 때 지금 시각으로 즉시 기록"
                  >
                    <i className="fa-solid fa-bolt" aria-hidden="true" /> 지금 복용
                  </button>
                  <button
                    type="button"
                    className="schedule-add-btn"
                    onClick={() => onOpenScheduleModal(med)}
                    title="비염/알레르기 등 식사시간 기준 주기적 복약 일정 등록"
                  >
                    <i className="fa-regular fa-calendar-plus" aria-hidden="true" /> 일정 등록
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
