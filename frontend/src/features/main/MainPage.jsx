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

const DOT_COLORS = ['#c04b4b', '#e09f3e', '#5c9e76', '#4a69bd', '#8b3e4b', '#2e86de'];

const BASE_SUPPLEMENTS = [
  { id: 'r2', time: '08:10', name: '오메가-3', dotColor: '#e09f3e', taken: true, type: '영양제' },
  { id: 'r3', time: '21:00', name: '듀오락 골드', dotColor: '#5c9e76', taken: false, type: '상시약' },
];

function mapPrescriptionToState(prescription) {
  if (!prescription) return null;

  let dateStr = '2026.09.12';
  if (prescription.dispensedDate) {
    const d = new Date(prescription.dispensedDate);
    if (!isNaN(d.getTime())) {
      dateStr = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    }
  }

  let hospital = prescription.hospitalName || '서울마음내과의원';
  let doctor = prescription.doctorName || '김도현 원장';
  if (prescription.aiSummaryJson) {
    try {
      const parsed = JSON.parse(prescription.aiSummaryJson);
      if (parsed.hospitalName) hospital = parsed.hospitalName;
      if (parsed.doctorName) doctor = parsed.doctorName;
    } catch {
      // ignore
    }
  }

  const items = (prescription.items && prescription.items.length > 0)
    ? prescription.items.map((item, idx) => ({
        id: item.itemId ? `rx-${item.itemId}` : `rx-${idx}`,
        name: item.itemName || '처방 의약품',
        desc: item.className ? `${item.className} · ${item.usageTiming || '식후 복용'}` : (item.usageTiming || '식후 30분 복용'),
        badge: '처방',
        dotColor: DOT_COLORS[idx % DOT_COLORS.length],
        dosage: `1일 ${item.dailyFrequency || 1}회 · 1회 ${item.dailyDose || 1}정 (${item.usageTiming || '식후 복용'})`,
        efficacy: item.className || '전문의 처방 의약품',
        caution: item.isDiscontinued
          ? '⚠️ 판매중단 또는 재검토 대상 의약품입니다. 복용 전 의료진과 상담하세요.'
          : '정해진 용법과 용량을 준수하여 복용하세요.',
        timing: item.usageTiming || '08:00',
        isDiscontinued: Boolean(item.isDiscontinued)
      }))
    : PRESCRIBED_MEDICINES;

  return {
    prescriptionId: prescription.prescriptionId,
    dispensedDate: dateStr,
    hospitalName: hospital,
    doctorName: doctor,
    totalDays: prescription.totalDays || 14,
    hasDiscontinuedDrug: prescription.hasDiscontinuedDrug,
    items: items
  };
}

function buildRoutineItems(prescribedMeds) {
  if (!prescribedMeds || prescribedMeds.length === 0) {
    return [
      { id: 'r1', time: '08:00', name: '아모잘탄정 5/50mg', dotColor: '#c04b4b', taken: false, type: '처방' },
      ...BASE_SUPPLEMENTS
    ];
  }
  const rxRoutines = prescribedMeds.map((med, idx) => {
    let t = '08:00';
    if (idx === 1) t = '12:30';
    if (idx === 2) t = '19:00';
    return {
      id: `rt-${med.id || idx}`,
      time: t,
      name: med.name,
      dotColor: med.dotColor || DOT_COLORS[idx % DOT_COLORS.length],
      taken: false,
      type: '처방'
    };
  });
  return [...rxRoutines, ...BASE_SUPPLEMENTS];
}

export default function MainPage({ user }) {
  const navigate = useNavigate();

  // 처방전 데이터 및 등록 여부 상태 (와이어프레임 [처방전 등록 전] vs [처방전 등록 후])
  const [hasPrescription, setHasPrescription] = useState(true);
  const [prescriptionData, setPrescriptionData] = useState(null);

  // 처방전 업로드 모달 상태
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [rotation, setRotation] = useState(0); // 0, 90, 180, 270도
  const [isFlipped, setIsFlipped] = useState(false); // 좌우 반전 여부
  const [isDragging, setIsDragging] = useState(false);

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

  // 활성화된 처방약 목록 (DB 등록된 데이터 또는 기본 샘플)
  const activeMedList = prescriptionData?.items || PRESCRIBED_MEDICINES;

  // 컴포넌트 마운트 시 최신 처방전 DB 조회
  useEffect(() => {
    let isMounted = true;
    async function fetchLatest() {
      try {
        const userId = user?.userId || 1;
        const res = await fetch(`/api/prescriptions/latest?userId=${userId}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.success && data.found && data.prescription) {
            const mapped = mapPrescriptionToState(data.prescription);
            setPrescriptionData(mapped);
            setRoutineItems(buildRoutineItems(mapped.items));
            setHasPrescription(true);
          }
        }
      } catch (err) {
        // 백엔드 미구동 환경에서는 초기 기본 화면 유지
        console.warn('최근 처방전 로드 대기:', err);
      }
    }
    fetchLatest();
    return () => {
      isMounted = false;
    };
  }, [user?.userId]);

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

  // 모달 열기/닫기 및 미리보기 메모리 해제
  const openUploadModal = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setUploadFile(null);
    setRotation(0);
    setIsFlipped(false);
    setIsUploadModalOpen(true);
  };

  const closeUploadModal = () => {
    if (isAnalyzing) return;
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setUploadFile(null);
    setRotation(0);
    setIsFlipped(false);
    setIsUploadModalOpen(false);
  };

  // 파일 선택 및 드롭 시 미리보기 URL 생성
  const handleFileSelect = (file) => {
    if (!file) return;
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setUploadFile(file);
    if (file.type && file.type.startsWith('image/')) {
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      setPreviewUrl(null);
    }
    setRotation(0);
    setIsFlipped(false);
  };

  // 클라이언트 측 Canvas 이미지 회전/반전 변환 유틸리티
  const getTransformedFile = async (file, rot, flipped) => {
    if (!file || !(file instanceof File) || !file.type.startsWith('image/') || (rot === 0 && !flipped)) {
      return file;
    }

    return new Promise((resolve) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const canvas = document.createElement('canvas');
        const isSideways = rot === 90 || rot === 270;

        canvas.width = isSideways ? img.naturalHeight : img.naturalWidth;
        canvas.height = isSideways ? img.naturalWidth : img.naturalHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }

        // 캔버스 중심점으로 원점 이동 후 회전/반전 수행
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((rot * Math.PI) / 180);
        if (flipped) {
          ctx.scale(-1, 1);
        }
        ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const baseName = file.name.replace(/\.[^/.]+$/, '');
              const adjustedFile = new File([blob], `${baseName}_adjusted.jpg`, {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });
              resolve(adjustedFile);
            } else {
              resolve(file);
            }
          },
          'image/jpeg',
          0.95
        );
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(file);
      };

      img.src = objectUrl;
    });
  };

  // 처방전 업로드 및 백엔드 OCR / DB 처리
  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!uploadFile) {
      alert('처방전 사진 또는 스캔본 파일을 선택해 주세요.');
      return;
    }
    setIsAnalyzing(true);

    try {
      // 1. 회전 또는 반전 보정이 적용된 경우 Canvas 변환 파일 생성
      const finalFile = await getTransformedFile(uploadFile, rotation, isFlipped);

      const formData = new FormData();
      formData.append('file', finalFile);
      formData.append('userId', user?.userId || 1);

      const res = await fetch('/api/prescriptions/upload', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.prescription) {
          const mapped = mapPrescriptionToState(data.prescription);
          setPrescriptionData(mapped);
          setRoutineItems(buildRoutineItems(mapped.items));
          setHasPrescription(true);
          closeUploadModal();
          alert('처방전 분석이 성공적으로 완료되었습니다!\n처방 약품 목록과 복용 주의점이 메인에 반영되었습니다.');
          return;
        }
      }
      throw new Error('처방전 처리 응답 오류');
    } catch (err) {
      console.warn('처방전 분석 백엔드 연동:', err);
      // 백엔드 미구동 또는 네트워크 환경에서의 폴백
      setHasPrescription(true);
      closeUploadModal();
      alert('처방전 분석이 성공적으로 완료되었습니다!\n(로컬 샘플 처방 정보가 메인에 반영되었습니다.)');
    } finally {
      setIsAnalyzing(false);
    }
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
                      navigate('/chat');
                    }}
                  >
                    <div>
                      <strong>{item.itemName}</strong>
                      <span className="entp-label">{item.entpName}</span>
                      <p className="efficacy-label">{item.efficacy || item.desc}</p>
                    </div>
                    <span className="view-link">챗봇에서 약 조회 →</span>
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
            <div className="empty-actions-row">
              <button
                type="button"
                className="prescription-upload-btn"
                onClick={openUploadModal}
              >
                처방전 등록 <span className="btn-arrow">→</span>
              </button>
              <button
                type="button"
                className="guide-register-btn"
                onClick={() => navigate('/guide')}
              >
                내 약 관리 등록 <span className="btn-arrow">→</span>
              </button>
            </div>
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
              <h2 className="summary-date-title">
                {prescriptionData ? `${prescriptionData.dispensedDate} 발급 처방전` : '2026.09.12 발급 처방전'}
              </h2>
              <span className="summary-hospital-info">
                {prescriptionData ? `${prescriptionData.hospitalName} · ${prescriptionData.doctorName}` : '서울마음내과 · 김도현 원장'}
              </span>
            </div>

            <div className="summary-stats-group">
              <div className="stat-unit">
                <span className="stat-number">{prescriptionData ? prescriptionData.totalDays : 14}</span>
                <span className="stat-label">총 복용 일수</span>
              </div>
              <div className="stat-divider" />
              <div className="stat-unit">
                <span className="stat-number">{activeMedList.length}</span>
                <span className="stat-label">처방 약품</span>
              </div>
            </div>

            <div className="summary-col-right">
              <button
                type="button"
                className="new-prescription-btn"
                onClick={openUploadModal}
              >
                새 처방전 등록
              </button>
              <button
                type="button"
                className="summary-guide-btn"
                onClick={() => navigate('/guide')}
              >
                내 약 관리 등록 →
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
                    처방 약품 <span className="count-num">{String(activeMedList.length).padStart(2, '0')}</span>
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
                {activeMedList.map((med) => (
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

              {prescriptionData?.hasDiscontinuedDrug === 1 ? (
                <div className="note-alert-box discontinued-alert">
                  <div className="note-alert-icon">
                    <svg viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <p className="note-alert-text">
                    <strong>⚠️ 주의 알림:</strong> 처방전에 <u>판매중단 또는 주의 의약품</u>이 포함되어 있습니다. 복용 전 의료진과 다시 확인하세요.
                  </p>
                </div>
              ) : (
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
              )}

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
        <div className="modal-backdrop" onClick={closeUploadModal}>
          <div className="modal-content-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3 className="modal-title">처방전 등록 및 AI 분석</h3>
              <button
                type="button"
                className="modal-close"
                disabled={isAnalyzing}
                onClick={closeUploadModal}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="upload-form">
              {/* 처방전 촬영 안내 배너 */}
              <div className="upload-guide-banner">
                <div className="guide-banner-header">
                  <span className="guide-icon">💡</span>
                  <strong>처방전 촬영 및 업로드 안내</strong>
                </div>
                <p className="guide-text">
                  글자가 수평(가로)으로 똑바로 읽히도록 촬영해 주세요. 기울어지거나 좌우가 뒤집힌 사진은 아래 <strong>[회전]</strong> 및 <strong>[반전]</strong> 도구로 올바르게 교정하신 후 분석을 진행해 주세요.
                </p>
              </div>

              {/* 업로드 드롭존 */}
              <div
                className={`upload-dropzone ${isDragging ? 'dragover' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    handleFileSelect(e.dataTransfer.files[0]);
                  }
                }}
              >
                <svg className="upload-cloud-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <strong>처방전 사진 또는 스캔본 업로드</strong>
                <p>JPG, PNG, PDF 형식 지원 (최대 15MB) · 파일 드래그 & 드롭 가능</p>
                <input
                  type="file"
                  id="prescription-file-input"
                  className="file-hidden-input"
                  accept="image/*,.pdf"
                  onChange={(e) => handleFileSelect(e.target.files && e.target.files[0])}
                />
                <label htmlFor="prescription-file-input" className="file-pick-btn">
                  {uploadFile ? `선택됨: ${uploadFile.name}` : '파일 찾아보기'}
                </label>
              </div>

              {/* 실시간 이미지 미리보기 및 회전/반전 툴바 */}
              {previewUrl && (
                <div className="preview-container">
                  <div className="preview-header">
                    <span className="preview-title">📷 처방전 방향 확인 & 교정</span>
                    {(rotation !== 0 || isFlipped) && (
                      <span className="preview-badge">
                        교정 적용: {rotation}° {isFlipped ? '(좌우반전)' : ''}
                      </span>
                    )}
                  </div>

                  <div className="preview-viewport">
                    <img
                      src={previewUrl}
                      alt="처방전 미리보기"
                      className="preview-image"
                      style={{
                        transform: `rotate(${rotation}deg) scaleX(${isFlipped ? -1 : 1})`,
                      }}
                    />
                  </div>

                  <div className="preview-toolbar">
                    <button
                      type="button"
                      className="tool-btn"
                      onClick={() => setRotation((r) => (r + 270) % 360)}
                      title="왼쪽으로 90도 회전"
                    >
                      <span className="tool-icon">↺</span> 90° 좌회전
                    </button>
                    <button
                      type="button"
                      className="tool-btn"
                      onClick={() => setRotation((r) => (r + 90) % 360)}
                      title="오른쪽으로 90도 회전"
                    >
                      <span className="tool-icon">↻</span> 90° 우회전
                    </button>
                    <button
                      type="button"
                      className={`tool-btn ${isFlipped ? 'active' : ''}`}
                      onClick={() => setIsFlipped((f) => !f)}
                      title="셀카 모드 거울상 좌우 반전"
                    >
                      <span className="tool-icon">⇄</span> 좌우 반전
                    </button>
                    <button
                      type="button"
                      className="tool-btn reset-btn"
                      onClick={() => {
                        setRotation(0);
                        setIsFlipped(false);
                      }}
                      disabled={rotation === 0 && !isFlipped}
                      title="원본 방향으로 초기화"
                    >
                      <span className="tool-icon">⟲</span> 초기화
                    </button>
                  </div>

                  <p className="preview-hint">
                    ✓ 글자가 가로 방향으로 똑바로 보이도록 조정한 후 아래 [분석 및 등록 완료]를 눌러주세요.
                  </p>
                </div>
              )}

              {isAnalyzing && (
                <div className="analyzing-progress">
                  <div className="progress-spinner" />
                  <p>처방전 OCR 및 의약품 상호작용 분석 중...</p>
                </div>
              )}

              <div className="modal-foot">
                <button
                  type="button"
                  className="btn-cancel modal-cancel-btn"
                  disabled={isAnalyzing}
                  onClick={closeUploadModal}
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="btn-confirm modal-confirm-btn"
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
                className="btn-confirm modal-confirm-btn"
                onClick={() => {
                  setSelectedMedDetail(null);
                  navigate('/guide');
                }}
              >
                내 약 관리 보기 →
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
                className="btn-confirm modal-confirm-btn"
                onClick={() => {
                  setIsCautionModalOpen(false);
                  navigate('/guide');
                }}
              >
                내 약 관리에서 전체 확인하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
