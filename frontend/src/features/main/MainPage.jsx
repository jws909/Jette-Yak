import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './MainPage.css';

const PRESCRIBED_MEDICINES = [
  {
    id: 'm1',
    name: '아모잘탄정 5/50mg',
    desc: '혈압을 안정적으로 관리해요',
    badge: '처방',
    dotColor: '#c04b4b',
    dosage: '1일 1회 아침 식후 30분',
    efficacy: '본태성 고혈압 치료',
    caution: '어지러움이 있을 수 있으니 일어날 때 천천히 움직이세요.'
  },
  {
    id: 'm2',
    name: '오메가-3',
    desc: '식후 흡수율이 좋아요',
    badge: '영양제',
    dotColor: '#e09f3e',
    dosage: '1일 1회 식후 복용',
    efficacy: '혈중 중성지질 및 혈행 개선',
    caution: '아스피린 등 항응고제와 함께 복용 시 출혈 경향에 유의하세요.'
  },
  {
    id: 'm3',
    name: '듀오락 골드',
    desc: '장 건강을 위한 유익균 증식',
    badge: '상시약',
    dotColor: '#5c9e76',
    dosage: '1일 1회 취침 전 1캡슐',
    efficacy: '장내 유익균 증식 및 원활한 배변 활동',
    caution: '항생제 복용 시 2시간 간격을 두고 복용하세요.'
  }
];

const FALLBACK_SEARCH_LIST = [
  ...PRESCRIBED_MEDICINES.map(m => ({ itemName: m.name, entpName: '제약사', efficacy: m.efficacy, desc: m.desc })),
  { itemName: '타이레놀정 500mg', entpName: '한국존슨앤드존슨', efficacy: '해열 및 감기로 인한 통증 완화', desc: '해열 진통제' },
  { itemName: '아스피린프로텍트정 100mg', entpName: '바이엘코리아', efficacy: '혈전 생성 억제', desc: '혈전 예방' },
  { itemName: '비타민D 1000IU', entpName: '종근당', efficacy: '뼈의 형성과 유지', desc: '면역력 및 뼈 건강' },
];

function fallbackSearch(keyword) {
  return FALLBACK_SEARCH_LIST.filter(i => i.itemName.includes(keyword));
}

export default function MainPage({ user }) {
  const navigate = useNavigate();

  // 처방전 등록 여부 상태 (와이어프레임 [처방전 등록 전] vs [처방전 등록 후])
  const [hasPrescription, setHasPrescription] = useState(true);

  // 처방전 업로드 모달 상태
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);

  // 약품 상세 모달 상태
  const [selectedMedDetail, setSelectedMedDetail] = useState(null);
  const [isCautionModalOpen, setIsCautionModalOpen] = useState(false);

  // 메인 인라인 검색 상태
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);

  // 오늘의 복약 루틴 리스트 (다크 테마 영역)
  const [routineItems, setRoutineItems] = useState([
    { id: 'r1', time: '08:00', name: '아모잘탄정 5/50mg', dotColor: '#c04b4b', taken: false, type: '처방' },
    { id: 'r2', time: '08:10', name: '오메가-3', dotColor: '#e09f3e', taken: true, type: '영양제' },
    { id: 'r3', time: '21:00', name: '듀오락 골드', dotColor: '#5c9e76', taken: false, type: '상시약' },
  ]);

  // 오늘의 복용 체크박스 토글
  const toggleRoutine = (id) => {
    setRoutineItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, taken: !item.taken } : item
      )
    );
  };

  // 처방전 등록 전에는 상시약/영양제만 표시 (와이어프레임 명세), 등록 후에는 전체 처방약 포함
  const activeRoutineList = hasPrescription
    ? routineItems
    : routineItems.filter(item => item.type !== '처방');

  const takenCount = activeRoutineList.filter((i) => i.taken).length;
  const totalCount = activeRoutineList.length;

  // 메인 검색 핸들러
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;

    let active = true;
    const timer = setTimeout(async () => {
      setIsSearching(true);
      setShowSearchResults(true);
      try {
        const res = await fetch(`/api/medications/search?q=${encodeURIComponent(trimmed)}&page=1`);
        if (res.ok) {
          const data = await res.json();
          if (active) setSearchResults(data.items || []);
        } else {
          if (active) setSearchResults(fallbackSearch(trimmed));
        }
      } catch {
        if (active) setSearchResults(fallbackSearch(trimmed));
      } finally {
        if (active) setIsSearching(false);
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  const handleQueryChange = (e) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (!val.trim()) {
      setSearchResults([]);
      setShowSearchResults(false);
      setIsSearching(false);
    }
  };

  const handleClearQuery = () => {
    setSearchQuery('');
    setSearchResults([]);
    setShowSearchResults(false);
    setIsSearching(false);
  };

  // 처방전 업로드 및 모의 분석
  const handleUploadSubmit = (e) => {
    e.preventDefault();
    setIsAnalyzing(true);

    setTimeout(() => {
      setIsAnalyzing(false);
      setIsUploadModalOpen(false);
      setHasPrescription(true);
      alert('처방전 분석이 성공적으로 완료되었습니다!\n처방 약품 목록과 복용 주의점이 메인에 반영되었습니다.');
    }, 1500);
  };

  return (
    <div className="main-page-wrapper">
      {/* 상태 시연용 상단 툴바 (와이어프레임의 처방전 등록 전/후 상태 비교용) */}
      <div className="state-switcher-banner">
        <div className="state-switcher-content">
          <span className="state-tip">
            <strong>와이어프레임 뷰 모드:</strong> {hasPrescription ? '처방전 등록 후 (메인.png)' : '처방전 등록 전 (메인,navbar,sidebar.jpg)'}
          </span>
          <div className="state-buttons">
            <button
              type="button"
              className={`state-btn ${!hasPrescription ? 'active' : ''}`}
              onClick={() => setHasPrescription(false)}
            >
              처방전 등록 전 화면
            </button>
            <button
              type="button"
              className={`state-btn ${hasPrescription ? 'active' : ''}`}
              onClick={() => setHasPrescription(true)}
            >
              처방전 등록 후 화면
            </button>
          </div>
        </div>
      </div>

      {/* 1. 상단 인사말 영역 (메인.png 헤더) */}
      <header className="main-greeting-header">
        <span className="greeting-date">MONDAY, 14 SEPTEMBER</span>
        <h1 className="greeting-title">
          안녕하세요, <span className="user-highlight">{user?.name || '김메디'}</span>님.
        </h1>
        <p className="greeting-subtitle">오늘도 몸의 이야기에 귀 기울여 볼까요?</p>
      </header>

      {/* 2. 약 검색창 (메인.png 검색 바) */}
      <section className="main-search-section">
        <div className="main-search-bar">
          <svg className="main-search-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 19l-4-4m0-7A7 7 0 1 1 1 8a7 7 0 0 1 14 0Z" />
          </svg>
          <input
            type="text"
            className="main-search-input"
            placeholder="약 이름을 검색해 보세요"
            value={searchQuery}
            onChange={handleQueryChange}
            onFocus={() => searchQuery.trim() && setShowSearchResults(true)}
          />
          {searchQuery && (
            <button
              type="button"
              className="main-search-clear"
              onClick={handleClearQuery}
            >
              ✕
            </button>
          )}
        </div>

        {/* 검색 결과 팝업 */}
        {showSearchResults && searchQuery.trim() && (
          <div className="main-search-results-modal">
            <div className="results-inner-head">
              <span>검색된 약품 ({searchResults.length}건)</span>
              <button type="button" onClick={() => setShowSearchResults(false)}>닫기</button>
            </div>
            {isSearching ? (
              <div className="results-loading">약 정보를 찾고 있습니다...</div>
            ) : searchResults.length > 0 ? (
              <div className="results-scroll-area">
                {searchResults.map((item, idx) => (
                  <div
                    key={idx}
                    className="result-row-card"
                    onClick={() => {
                      setShowSearchResults(false);
                      navigate(`/guide?med=${encodeURIComponent(item.itemName)}`);
                    }}
                  >
                    <div>
                      <strong>{item.itemName}</strong>
                      <span className="entp-label">{item.entpName}</span>
                      <p className="efficacy-label">{item.efficacy || item.desc}</p>
                    </div>
                    <span className="view-link">상세 가이드 보기 →</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="results-none">
                검색된 약품이 없습니다. 다른 이름으로 검색해 보세요.
              </div>
            )}
          </div>
        )}
      </section>

      {/* 3. 처방전 등록 전 vs 처방전 등록 후 영역 */}
      {!hasPrescription ? (
        /* -------------------------------------------------------------
           [처방전 등록 전 화면] (와이어프레임 메인,navbar,sidebar.jpg 명세)
           ------------------------------------------------------------- */
        <section className="empty-prescription-hero">
          <div className="empty-prescription-box">
            <div className="empty-icon-circle">
              <svg viewBox="0 0 48 48" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 8h20a4 4 0 0 1 4 4v24a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4V12a4 4 0 0 1 4-4z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M24 18v12m-6-6h12" />
              </svg>
            </div>
            <h2 className="empty-title">처방전을 등록해주세요.</h2>
            <p className="empty-subtitle">처방전 등록시 복용 일정과 성분을 자동으로 분석해 드립니다.</p>
            <button
              type="button"
              className="prescription-upload-btn"
              onClick={() => setIsUploadModalOpen(true)}
            >
              처방전 업로드 <span className="btn-arrow">→</span>
            </button>
          </div>
        </section>
      ) : (
        /* -------------------------------------------------------------
           [처방전 등록 후 화면] (메인.png 디자인)
           ------------------------------------------------------------- */
        <>
          {/* 처방전 요약 바 (PRESCRIPTION SUMMARY) */}
          <section className="prescription-summary-card">
            <div className="summary-col-left">
              <span className="summary-meta-label">PRESCRIPTION SUMMARY</span>
              <h2 className="summary-date-title">2026.09.12 발급 처방전</h2>
              <span className="summary-hospital-info">서울마음내과 · 김도현 원장</span>
            </div>

            <div className="summary-stats-group">
              <div className="stat-unit">
                <span className="stat-number">14</span>
                <span className="stat-label">총 복용 일수</span>
              </div>
              <div className="stat-divider" />
              <div className="stat-unit">
                <span className="stat-number">3</span>
                <span className="stat-label">처방 약품</span>
              </div>
            </div>

            <div className="summary-col-right">
              <button
                type="button"
                className="new-prescription-btn"
                onClick={() => setIsUploadModalOpen(true)}
              >
                새 처방전 등록
              </button>
            </div>
          </section>

          {/* 2단 그리드: 처방 약품 목록 (좌) + 복용 주의점 (우) */}
          <section className="main-two-column-grid">
            {/* 좌측: 처방 약품 (PRESCRIBED MEDICINES) */}
            <div className="prescribed-meds-card">
              <div className="card-top-row">
                <div>
                  <span className="card-sub-label">PRESCRIBED MEDICINES</span>
                  <h3 className="card-main-title">
                    처방 약품 <span className="count-num">03</span>
                  </h3>
                </div>
                <button
                  type="button"
                  className="card-link-action"
                  onClick={() => navigate('/guide')}
                >
                  전체보기 &gt;
                </button>
              </div>

              <div className="meds-list-divider" />

              <div className="meds-vertical-list">
                {PRESCRIBED_MEDICINES.map((med) => (
                  <div
                    key={med.id}
                    className="med-item-row"
                    onClick={() => setSelectedMedDetail(med)}
                    title="상세 정보 보기"
                  >
                    <div className="med-item-left">
                      <span className="med-color-dot" style={{ backgroundColor: med.dotColor }} />
                      <div className="med-text-group">
                        <strong className="med-item-name">{med.name}</strong>
                        <p className="med-item-desc">{med.desc}</p>
                      </div>
                    </div>

                    <div className="med-item-right">
                      <span className={`med-type-pill ${med.badge === '처방' ? 'rx' : med.badge === '영양제' ? 'supp' : 'reg'}`}>
                        {med.badge}
                      </span>
                      <button
                        type="button"
                        className="med-more-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedMedDetail(med);
                        }}
                      >
                        ···
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 우측: 복용 전, 잠깐만요. (MEDICATION NOTE) */}
            <div className="medication-note-card">
              <div className="card-top-row">
                <div>
                  <span className="card-sub-label">MEDICATION NOTE</span>
                  <h3 className="card-main-title">복용 전, 잠깐만요.</h3>
                </div>
              </div>

              <div className="note-alert-box">
                <div className="note-alert-icon">
                  <svg viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <p className="note-alert-text">
                  <strong>오메가-3</strong>와 <strong>아스피린</strong>을 함께 복용 중이라면 <u>출혈 위험</u>이 높아질 수 있어요.
                </p>
              </div>

              <div className="note-action-footer">
                <button
                  type="button"
                  className="note-detail-btn"
                  onClick={() => setIsCautionModalOpen(true)}
                >
                  주의사항 자세히 보기 &gt;
                </button>
              </div>
            </div>
          </section>
        </>
      )}

      {/* 4. 하단 영역: 오늘의 복약 루틴 (TODAY'S ROUTINE - 다크 테마 섹션) */}
      <section className="today-routine-dark-card">
        <div className="routine-header-row">
          <span className="routine-label">TODAY'S ROUTINE</span>
          <span className="routine-date-badge">09.14</span>
        </div>

        <div className="routine-title-row">
          <h3 className="routine-title">
            오늘의 복용 <span className="taken-highlight">{takenCount}</span>/{totalCount}
          </h3>
          <span className="routine-rate-tip">
            {takenCount === totalCount ? '🎉 오늘 모든 복약을 완료했습니다!' : '복용 후 체크박스를 눌러 완료하세요'}
          </span>
        </div>

        {/* 체크리스트 항목들 */}
        <div className="routine-items-list">
          {activeRoutineList.map((item) => (
            <div
              key={item.id}
              className={`routine-item-row ${item.taken ? 'is-taken' : ''}`}
              onClick={() => toggleRoutine(item.id)}
            >
              <div className="routine-item-left">
                {/* 커스텀 체크박스 */}
                <div className={`custom-checkbox ${item.taken ? 'checked' : ''}`}>
                  {item.taken && (
                    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 7l3 3 5-6" />
                    </svg>
                  )}
                </div>

                <span className="routine-time">{item.time}</span>
                <span className="routine-name">{item.name}</span>
              </div>

              <div className="routine-item-right">
                <span className="routine-dot" style={{ backgroundColor: item.dotColor }} />
              </div>
            </div>
          ))}
        </div>

        {/* 복약 기록 전체 보기 버튼 (와이어프레임 캘린더 연동) */}
        <div className="routine-footer-action">
          <button
            type="button"
            className="view-all-records-btn"
            onClick={() => navigate('/calendar')}
          >
            복약 기록 전체 보기 <span className="arrow-left">←</span>
          </button>
        </div>
      </section>

      {/* -------------------------------------------------------------
         모달 1: 처방전 업로드 & 자동 분석 모달
         ------------------------------------------------------------- */}
      {isUploadModalOpen && (
        <div className="modal-backdrop" onClick={() => !isAnalyzing && setIsUploadModalOpen(false)}>
          <div className="modal-content-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3 className="modal-title">처방전 등록 및 AI 분석</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => !isAnalyzing && setIsUploadModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="upload-form">
              <div className="upload-dropzone">
                <svg className="upload-cloud-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <strong>처방전 사진 또는 스캔본 업로드</strong>
                <p>JPG, PNG, PDF 형식 지원 (최대 15MB)</p>
                <input
                  type="file"
                  id="prescription-file-input"
                  className="file-hidden-input"
                  accept="image/*,.pdf"
                  onChange={(e) => setUploadFile(e.target.files[0])}
                />
                <label htmlFor="prescription-file-input" className="file-pick-btn">
                  {uploadFile ? `선택됨: ${uploadFile.name}` : '파일 찾아보기'}
                </label>
              </div>

              <div className="sample-presets">
                <span className="preset-title">또는 샘플 처방전으로 즉시 테스트:</span>
                <button
                  type="button"
                  className="preset-pill"
                  onClick={() => {
                    setUploadFile({ name: '서울마음내과_20260912_처방전.jpg' });
                  }}
                >
                  📄 서울마음내과 처방전 샘플
                </button>
              </div>

              {isAnalyzing && (
                <div className="analyzing-progress">
                  <div className="progress-spinner" />
                  <p>처방전 OCR 및 의약품 상호작용 분석 중...</p>
                </div>
              )}

              <div className="modal-foot">
                <button
                  type="button"
                  className="btn-cancel"
                  disabled={isAnalyzing}
                  onClick={() => setIsUploadModalOpen(false)}
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="btn-confirm"
                  disabled={isAnalyzing}
                >
                  {isAnalyzing ? '분석 중...' : '분석 및 등록 완료'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------
         모달 2: 약품 상세 정보 모달
         ------------------------------------------------------------- */}
      {selectedMedDetail && (
        <div className="modal-backdrop" onClick={() => setSelectedMedDetail(null)}>
          <div className="modal-content-box med-detail-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div className="detail-head-left">
                <span className="med-color-dot" style={{ backgroundColor: selectedMedDetail.dotColor }} />
                <h3 className="modal-title">{selectedMedDetail.name}</h3>
                <span className="med-type-pill rx">{selectedMedDetail.badge}</span>
              </div>
              <button type="button" className="modal-close" onClick={() => setSelectedMedDetail(null)}>✕</button>
            </div>

            <div className="med-detail-body">
              <div className="detail-field">
                <label>효능 · 효과</label>
                <p>{selectedMedDetail.efficacy}</p>
              </div>
              <div className="detail-field">
                <label>용법 · 용량</label>
                <p>{selectedMedDetail.dosage}</p>
              </div>
              <div className="detail-field">
                <label>복용 시 주의사항</label>
                <p className="caution-text">{selectedMedDetail.caution}</p>
              </div>
            </div>

            <div className="modal-foot">
              <button
                type="button"
                className="btn-confirm"
                onClick={() => {
                  setSelectedMedDetail(null);
                  navigate(`/guide?med=${encodeURIComponent(selectedMedDetail.name)}`);
                }}
              >
                맞춤 생활 가이드 보기 →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------
         모달 3: 복용 주의점 자세히 보기 모달
         ------------------------------------------------------------- */}
      {isCautionModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsCautionModalOpen(false)}>
          <div className="modal-content-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3 className="modal-title">⚠️ 복용 전 성분 상호작용 주의사항</h3>
              <button type="button" className="modal-close" onClick={() => setIsCautionModalOpen(false)}>✕</button>
            </div>

            <div className="caution-modal-body">
              <div className="caution-summary-card">
                <strong>오메가-3 × 아스피린 (항응고제)</strong>
                <p>오메가-3(EPA/DHA)와 아스피린을 병용할 경우 지혈 지연 및 멍이나 출혈 위험이 증가할 수 있습니다.</p>
              </div>

              <div className="caution-guidance">
                <h4>의료진 권고사항:</h4>
                <ul>
                  <li>수술이나 치과 치료 예정이 있는 경우 1~2주 전 주치의에게 병용 사실을 알리세요.</li>
                  <li>잇몸 출혈, 코피, 멍이 평소보다 쉽게 생기는지 모니터링하세요.</li>
                  <li>복용 시간대를 오전/저녁으로 분리하거나 전문가와 상담하여 복용량을 조절하세요.</li>
                </ul>
              </div>
            </div>

            <div className="modal-foot">
              <button
                type="button"
                className="btn-confirm"
                onClick={() => {
                  setIsCautionModalOpen(false);
                  navigate('/guide');
                }}
              >
                가이드에서 전체 확인하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
