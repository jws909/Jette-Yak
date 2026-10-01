import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './MedicationRegisterPage.css';

export default function MedicationRegisterPage({ user }) {
  const navigate = useNavigate();
  const location = useLocation();

  // URL query parameter ?tab=prescription | cabinet | supplement
  const queryTab = new URLSearchParams(location.search).get('tab');
  const [activeTab, setActiveTab] = useState(
    ['prescription', 'cabinet', 'supplement'].includes(queryTab) ? queryTab : 'prescription'
  );

  // ==========================================
  // [1] 처방전 / 약봉투 (OCR) 상태
  // ==========================================
  const [rxFile, setRxFile] = useState(null);
  const [rxPreview, setRxPreview] = useState(null);
  const [rotation, setRotation] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [userPrescriptions, setUserPrescriptions] = useState([]);
  const [isLoadingRxList, setIsLoadingRxList] = useState(false);
  const fileInputRef = useRef(null);

  // ==========================================
  // [2] 상비약 & 영양제 검색 및 등록 상태
  // ==========================================
  const [medSearchText, setMedSearchText] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [everydayMeds, setEverydayMeds] = useState([]);
  const [isLoadingEverydayMeds, setIsLoadingEverydayMeds] = useState(false);

  // 영양제 직접 입력 전용 상태
  const [customSupplementName, setCustomSupplementName] = useState('');
  const [customSupplementSlot, setCustomSupplementSlot] = useState('morning');
  const [customSupplementTime, setCustomSupplementTime] = useState('08:30');

  // 일정 등록 모달 상태 (상비약/영양제 복용 주기 설정)
  const [scheduleModalMed, setScheduleModalMed] = useState(null);
  const [schedSlots, setSchedSlots] = useState({ morning: true, lunch: false, dinner: false, bedtime: false });
  const [schedTimes, setSchedTimes] = useState({ morning: '08:30', lunch: '12:30', dinner: '18:30', bedtime: '22:00' });
  const [schedDays, setSchedDays] = useState(30);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);

  // ==========================================
  // 데이터 불러오기 (처방전 목록 & 상비약/영양제 목록)
  // ==========================================
  const fetchPrescriptionList = useCallback(async () => {
    if (!user?.userId) return;
    setIsLoadingRxList(true);
    try {
      const res = await fetch(`/api/prescriptions/list?userId=${user.userId}`);
      if (res.ok) {
        const data = await res.json();
        setUserPrescriptions(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.warn('처방전 목록 조회 실패:', err);
    } finally {
      setIsLoadingRxList(false);
    }
  }, [user?.userId]);

  const fetchEverydayMeds = useCallback(async () => {
    if (!user?.userId) return;
    setIsLoadingEverydayMeds(true);
    try {
      const res = await fetch(`/api/users/everyday-meds?userId=${user.userId}`);
      if (res.ok) {
        const data = await res.json();
        setEverydayMeds(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.warn('평소 복용 약 목록 조회 실패:', err);
    } finally {
      setIsLoadingEverydayMeds(false);
    }
  }, [user?.userId]);

  useEffect(() => {
    fetchPrescriptionList();
    fetchEverydayMeds();
  }, [fetchPrescriptionList, fetchEverydayMeds]);

  // ==========================================
  // [1-1] 처방전 사진 선택 및 보정 처리
  // ==========================================
  const handleRxFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('이미지 파일(JPG, PNG, WEBP 등)만 등록 가능합니다.');
      return;
    }

    setRxFile(file);
    setRotation(0);
    setIsFlipped(false);
    const objectUrl = URL.createObjectURL(file);
    setRxPreview(objectUrl);
  };

  const rotateImage = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const flipImage = () => {
    setIsFlipped((prev) => !prev);
  };

  // 캔버스 변환 파일 생성
  const getTransformedFile = (file, rot, flip) => {
    return new Promise((resolve) => {
      if (rot === 0 && !flip) {
        resolve(file);
        return;
      }
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (rot === 90 || rot === 270) {
          canvas.width = img.height;
          canvas.height = img.width;
        } else {
          canvas.width = img.width;
          canvas.height = img.height;
        }
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((rot * Math.PI) / 180);
        if (flip) ctx.scale(-1, 1);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);

        canvas.toBlob((blob) => {
          URL.revokeObjectURL(objectUrl);
          const transformed = new File([blob], file.name, { type: file.type });
          resolve(transformed);
        }, file.type);
      };
      img.src = objectUrl;
    });
  };

  // 처방전 업로드 & OCR 요청
  const handleRxUploadSubmit = async (e) => {
    e.preventDefault();
    if (!user?.userId) {
      alert('로그인이 필요한 서비스입니다.');
      return;
    }
    if (!rxFile) {
      alert('처방전 또는 약봉투 사진을 선택해 주세요.');
      return;
    }

    setIsAnalyzing(true);
    try {
      const finalFile = await getTransformedFile(rxFile, rotation, isFlipped);
      const formData = new FormData();
      formData.append('file', finalFile);
      formData.append('userId', user.userId);

      const res = await fetch('/api/prescriptions/upload', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.prescription) {
          alert('처방전 분석 및 등록이 성공적으로 완료되었습니다!\n복약 일정이 자동 생성되었습니다.');
          setRxFile(null);
          setRxPreview(null);
          fetchPrescriptionList();
          return;
        }
        throw new Error(data.message || '처방전 처리 응답 오류');
      }
      throw new Error('처방전 업로드 실패');
    } catch (err) {
      console.error('처방전 등록 오류:', err);
      alert('처방전 분석에 실패했습니다. 사진이 선명한지 확인 후 다시 시도해 주세요.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 처방전 삭제
  const handleDeleteRx = async (prescriptionId) => {
    if (!window.confirm('해당 처방전과 등록된 일정을 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`/api/prescriptions/${prescriptionId}?userId=${user.userId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        alert('처방전이 삭제되었습니다.');
        fetchPrescriptionList();
      } else {
        alert('처방전 삭제에 실패했습니다.');
      }
    } catch (err) {
      console.error('처방전 삭제 오류:', err);
      alert('삭제 처리 중 오류가 발생했습니다.');
    }
  };

  // ==========================================
  // [2-1] 의약품 검색 (상비약 및 영양제)
  // ==========================================
  useEffect(() => {
    if (!medSearchText.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/medications/search?query=${encodeURIComponent(medSearchText.trim())}`);
        if (res.ok) {
          const list = await res.json();
          setSearchResults(Array.isArray(list) ? list : []);
        }
      } catch (err) {
        console.warn('약품 검색 오류:', err);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [medSearchText]);

  // 상비약 등록 (CABINET)
  const handleAddCabinetMed = async (item) => {
    const medId = item?.medicationId || item?.itemSeq;
    if (!medId) return;

    try {
      const res = await fetch('/api/users/everyday-meds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.userId,
          username: user?.username,
          type: 'CABINET',
          medicationId: medId,
        }),
      });

      if (res.ok) {
        alert(`'${item.itemName}' 이(가) 상비약으로 등록되었습니다.`);
        setMedSearchText('');
        fetchEverydayMeds();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.message || '상비약 등록에 실패했습니다.');
      }
    } catch (err) {
      console.error('상비약 등록 오류:', err);
    }
  };

  // 영양제 직접 등록 (ROUTINE)
  const handleAddCustomSupplement = async (e) => {
    if (e) e.preventDefault();
    const name = customSupplementName.trim();
    if (!name) {
      alert('영양제 또는 건강기능식품 이름을 입력해 주세요.');
      return;
    }

    try {
      const res = await fetch('/api/users/everyday-meds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.userId,
          username: user?.username,
          type: 'ROUTINE',
          name: name,
          takeTime: customSupplementTime,
          notes: `${customSupplementSlot === 'morning' ? '아침' : customSupplementSlot === 'lunch' ? '점심' : customSupplementSlot === 'evening' ? '저녁' : '취침전'} 식후`,
        }),
      });

      if (res.ok) {
        alert(`'${name}' 영양제가 성공적으로 등록되었습니다.`);
        setCustomSupplementName('');
        fetchEverydayMeds();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.message || '영양제 등록에 실패했습니다.');
      }
    } catch (err) {
      console.error('영양제 등록 오류:', err);
    }
  };

  // 평소 복용 약 삭제
  const handleRemoveEverydayMed = async (med) => {
    if (!window.confirm(`'${med.name}' 을(를) 목록에서 삭제하시겠습니까?`)) return;
    try {
      const res = await fetch(`/api/users/everyday-meds/${med.id}?userId=${user?.userId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        fetchEverydayMeds();
      } else {
        alert('삭제에 실패했습니다.');
      }
    } catch (err) {
      console.error('삭제 오류:', err);
    }
  };

  // ==========================================
  // [3] 상비약/영양제 캘린더 일정 등록 모달
  // ==========================================
  const handleOpenScheduleModal = (med) => {
    setScheduleModalMed(med);
    setSchedSlots({ morning: true, lunch: false, dinner: false, bedtime: false });
    setSchedDays(30);
  };

  const handleSaveSchedule = async (e) => {
    e.preventDefault();
    if (!scheduleModalMed) return;

    const selectedSlots = Object.keys(schedSlots).filter((k) => schedSlots[k]);
    if (selectedSlots.length === 0) {
      alert('최소 1개 이상의 복용 시간대를 선택해 주세요.');
      return;
    }

    setIsSavingSchedule(true);
    try {
      const startDate = new Date();
      const schedules = [];

      for (let day = 0; day < schedDays; day++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + day);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dt = String(d.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${dt}`;

        selectedSlots.forEach((slot) => {
          const time = schedTimes[slot];
          schedules.push({
            userId: user?.userId,
            scheduleDate: dateStr,
            time: time,
            type: scheduleModalMed.source === 'CABINET' ? 'regular' : 'supplement',
            name: scheduleModalMed.name,
            memo: `${slot === 'morning' ? '아침' : slot === 'lunch' ? '점심' : slot === 'evening' ? '저녁' : '취침전'} 복용`,
            medicationId: scheduleModalMed.medicationId || null,
          });
        });
      }

      const res = await fetch('/api/medications/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(schedules),
      });

      if (res.ok) {
        alert(`${scheduleModalMed.name}의 ${schedDays}일 복약 일정이 캘린더에 성공적으로 등록되었습니다!`);
        setScheduleModalMed(null);
      } else {
        alert('일정 등록에 실패했습니다.');
      }
    } catch (err) {
      console.error('일정 저장 오류:', err);
      alert('일정 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSavingSchedule(false);
    }
  };

  return (
    <div className="med-register-page">
      {/* 1. 상단 타이틀 & 탭 네비게이션 */}
      <header className="med-register-header">
        <div className="med-register-title-row">
          <div>
            <span className="med-register-kicker">MEDICATION ONBOARDING</span>
            <h1 className="med-register-title">약 등록</h1>
            <p className="med-register-desc">
              처방전 사진부터 상비약, 매일 먹는 영양제까지 한곳에서 스마트하게 등록하세요.
            </p>
          </div>
          <button
            type="button"
            className="med-register-back-btn"
            onClick={() => navigate('/')}
          >
            ← 메인 홈으로 가기
          </button>
        </div>

        {/* 3대 등록 탭 */}
        <div className="med-register-tabs">
          <button
            type="button"
            className={`med-tab-btn ${activeTab === 'prescription' ? 'active' : ''}`}
            onClick={() => setActiveTab('prescription')}
          >
            <svg className="tab-svg-icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
            </svg>
            처방전 · 약봉투 (AI 분석)
          </button>
          <button
            type="button"
            className={`med-tab-btn ${activeTab === 'cabinet' ? 'active' : ''}`}
            onClick={() => setActiveTab('cabinet')}
          >
            <svg className="tab-svg-icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
              <path fillRule="evenodd" d="M7 2a1 1 0 00-.707.293l-4 4a1 1 0 000 1.414l8 8a1 1 0 001.414 0l4-4a1 1 0 000-1.414l-8-8A1 1 0 007 2zm4.707 9.293L8 7.586 9.414 6.172l3.707 3.707-1.414 1.414z" clipRule="evenodd" />
            </svg>
            상비약 · 일반의약품 검색
          </button>
          <button
            type="button"
            className={`med-tab-btn ${activeTab === 'supplement' ? 'active' : ''}`}
            onClick={() => setActiveTab('supplement')}
          >
            <svg className="tab-svg-icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
              <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.508.79-.83 1.83-.984 3.033-1.042.06-2.07.41-2.915 1.05C4.945 8.167 4 9.873 4 12c0 2.227 1.082 4.14 2.75 5.226C8.423 18.314 10.667 19 13 19c2.81 0 5.244-.98 6.472-2.58.536-.697.77-1.52.684-2.33-.086-.807-.487-1.554-1.084-2.126-1.196-1.144-2.986-1.804-5.074-1.928.09-.768.272-1.436.544-1.954.276-.525.64-.897 1.077-1.127a1 1 0 00.38-1.4z" clipRule="evenodd" />
            </svg>
            영양제 · 건강기능식품 등록
          </button>
        </div>
      </header>

      {/* 2. 탭별 컨텐츠 본문 */}
      <main className="med-register-content">
        {/* =========================================================
            [탭 1] 처방전 / 약봉투 사진 OCR 등록
           ========================================================= */}
        {activeTab === 'prescription' && (
          <section className="tab-section prescription-section">
            <div className="section-intro-card">
              <div className="intro-badge">AI 스마트 광학인식 (OCR)</div>
              <h2>처방전 또는 약봉투 사진을 등록하세요</h2>
              <p>
                병원에서 받은 <strong>처방전</strong>이나 약국 <strong>약봉투</strong>를 사진으로 찍어 올리시면,
                AI가 자동으로 병원명, 조제일자, 복용 일수 및 처방 약품 목록을 추출하여 복약 일정을 생성해 드립니다.
              </p>
            </div>

            <div className="rx-upload-layout">
              {/* 좌측: 파일 업로드 & 미리보기 */}
              <div className="rx-upload-card">
                <form onSubmit={handleRxUploadSubmit}>
                  {!rxPreview ? (
                    <div
                      className="rx-dropzone"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept="image/*"
                        capture="environment"
                        style={{ display: 'none' }}
                        onChange={handleRxFileSelect}
                      />
                      <div className="dropzone-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                      <strong>사진을 촬영하거나 파일을 선택하세요</strong>
                      <span>JPG, PNG, WEBP 지원 (최대 10MB)</span>
                      <button type="button" className="dropzone-browse-btn">
                        사진 선택하기
                      </button>
                    </div>
                  ) : (
                    <div className="rx-preview-wrapper">
                      <div className="preview-top-actions">
                        <span className="preview-file-name">{rxFile?.name}</span>
                        <div className="preview-tools">
                          <button type="button" onClick={rotateImage} title="90도 회전">
                            회전
                          </button>
                          <button type="button" onClick={flipImage} title="좌우 반전">
                            반전
                          </button>
                          <button
                            type="button"
                            className="preview-reset-btn"
                            onClick={() => {
                              setRxFile(null);
                              setRxPreview(null);
                            }}
                          >
                            × 다른 사진 선택
                          </button>
                        </div>
                      </div>

                      <div className="preview-canvas-box">
                        <img
                          src={rxPreview}
                          alt="처방전 미리보기"
                          style={{
                            transform: `rotate(${rotation}deg) scaleX(${isFlipped ? -1 : 1})`,
                            maxWidth: '100%',
                            maxHeight: '400px',
                            objectFit: 'contain',
                            borderRadius: '8px',
                          }}
                        />
                      </div>

                      <button
                        type="submit"
                        className="rx-submit-btn"
                        disabled={isAnalyzing}
                      >
                        {isAnalyzing ? (
                          <>
                            <span className="analyzing-spinner" />
                            AI가 처방전을 정밀 분석 중입니다...
                          </>
                        ) : (
                          '분석 및 복약 일정 등록 완료하기 →'
                        )}
                      </button>
                    </div>
                  )}
                </form>
              </div>

              {/* 우측: 내 등록 처방전 목록 */}
              <div className="rx-history-card">
                <div className="rx-history-head">
                  <h3>등록된 처방전 내역 ({userPrescriptions.length}건)</h3>
                  <button type="button" className="refresh-btn" onClick={fetchPrescriptionList}>
                    새로고침
                  </button>
                </div>

                {isLoadingRxList ? (
                  <div className="rx-list-empty">처방전 내역을 불러오는 중...</div>
                ) : userPrescriptions.length === 0 ? (
                  <div className="rx-list-empty">
                    <p>아직 등록된 처방전이 없습니다.</p>
                    <span>왼쪽에서 처방전이나 약봉투 사진을 등록해 보세요!</span>
                  </div>
                ) : (
                  <div className="rx-cards-list">
                    {userPrescriptions.map((rx) => (
                      <div key={rx.prescriptionId} className="rx-item-card">
                        <div className="rx-item-top">
                          <div>
                            <strong className="rx-hospital">{rx.hospitalName || '의료기관'}</strong>
                            <span className="rx-dispensed-date">조제일 {rx.dispensedDate || '미상'}</span>
                          </div>
                          <span className="rx-days-badge">{rx.totalDays}일 처방</span>
                        </div>

                        <div className="rx-item-meds">
                          약품 {rx.items?.length || 0}종: {rx.items?.map((m) => m.itemName).slice(0, 3).join(', ')}
                          {(rx.items?.length || 0) > 3 ? ` 외 ${(rx.items?.length || 0) - 3}건` : ''}
                        </div>

                        <div className="rx-item-bottom">
                          <button
                            type="button"
                            className="rx-delete-btn"
                            onClick={() => handleDeleteRx(rx.prescriptionId)}
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* =========================================================
            [탭 2] 상비약 / 일반의약품 검색 등록
           ========================================================= */}
        {activeTab === 'cabinet' && (
          <section className="tab-section cabinet-section">
            <div className="section-intro-card">
              <div className="intro-badge">식약처 공공 의약품 DB 연동</div>
              <h2>가정 상비약 및 일반의약품 검색 등록</h2>
              <p>
                타이레놀, 소화제, 지사제 등 집에 상비해 둔 약이나 약국에서 구입한 일반의약품을 검색하여 등록하세요.
                원하는 경우 매일/주기적인 복약 일정을 캘린더에 바로 추가할 수 있습니다.
              </p>
            </div>

            <div className="cabinet-search-box">
              <div className="search-input-row">
                <svg className="search-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 19l-4-4m0-7A7 7 0 1 1 1 8a7 7 0 0 1 14 0Z" />
                </svg>
                <input
                  type="text"
                  className="cabinet-search-input"
                  placeholder="예: 타이레놀, 게보린, 훼스탈, 베아제, 이부프로펜..."
                  value={medSearchText}
                  onChange={(e) => setMedSearchText(e.target.value)}
                  autoFocus
                />
                {isSearching && <span className="searching-spinner" />}
              </div>

              {/* 검색 추천 태그 */}
              <div className="popular-tags">
                <span className="tags-label">자주 찾는 상비약:</span>
                {['타이레놀', '판피린', '훼스탈', '이지엔6', '후시딘', '까스활명수'].map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className="tag-chip"
                    onClick={() => setMedSearchText(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>

              {/* 검색 결과 목록 */}
              {searchResults.length > 0 && (
                <div className="search-results-container">
                  <h3 className="results-header">검색 결과 ({searchResults.length}건)</h3>
                  <div className="results-grid">
                    {searchResults.map((item, idx) => (
                      <div key={item.medicationId || item.itemSeq || idx} className="result-card">
                        <div className="result-info">
                          <strong className="result-name">{item.itemName}</strong>
                          <span className="result-corp">{item.entpName || '제조사 미상'}</span>
                          {item.efficacy && <p className="result-efficacy">{item.efficacy}</p>}
                        </div>
                        <div className="result-actions">
                          <button
                            type="button"
                            className="btn-add-cabinet"
                            onClick={() => handleAddCabinetMed(item)}
                          >
                            + 상비약함에 등록
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 현재 등록된 상비약 목록 */}
            <div className="registered-sub-section">
              <h3>현재 등록된 상비약 목록 ({everydayMeds.filter((m) => m.source === 'CABINET').length}건)</h3>
              <div className="everyday-grid">
                {everydayMeds.filter((m) => m.source === 'CABINET').length === 0 ? (
                  <p className="empty-hint">등록된 상비약이 없습니다. 위 검색창에서 약을 검색해 보세요!</p>
                ) : (
                  everydayMeds
                    .filter((m) => m.source === 'CABINET')
                    .map((med) => (
                      <div key={med.id} className="everyday-card cabinet">
                        <div className="card-header">
                          <span className="type-badge cabinet">상비약</span>
                          <button
                            type="button"
                            className="del-icon-btn"
                            onClick={() => handleRemoveEverydayMed(med)}
                            title="삭제"
                          >
                            ×
                          </button>
                        </div>
                        <strong className="med-name">{med.name}</strong>
                        {med.entpName && <span className="entp-name">{med.entpName}</span>}
                        <button
                          type="button"
                          className="schedule-add-btn"
                          onClick={() => handleOpenScheduleModal(med)}
                        >
                          일정 등록
                        </button>
                      </div>
                    ))
                )}
              </div>
            </div>
          </section>
        )}

        {/* =========================================================
            [탭 3] 영양제 / 건강기능식품 등록
           ========================================================= */}
        {activeTab === 'supplement' && (
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
                          if (slot === 'evening') setCustomSupplementTime('18:30');
                          if (slot === 'bedtime') setCustomSupplementTime('22:00');
                        }}
                      >
                        <option value="morning">아침 식후 (권장 08:30)</option>
                        <option value="lunch">점심 식후 (권장 12:30)</option>
                        <option value="evening">저녁 식후 (권장 18:30)</option>
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

                  <button type="submit" className="supplement-submit-btn">
                    + 영양제 목록에 등록하기
                  </button>
                </form>
              </div>

              {/* 현재 등록된 영양제 목록 */}
              <div className="supplement-list-card">
                <h3>현재 등록된 영양제 목록 ({everydayMeds.filter((m) => m.source === 'ROUTINE').length}건)</h3>
                <div className="everyday-grid">
                  {everydayMeds.filter((m) => m.source === 'ROUTINE').length === 0 ? (
                    <p className="empty-hint">등록된 영양제가 없습니다. 왼쪽 폼에서 챙겨 먹는 영양제를 등록해 보세요!</p>
                  ) : (
                    everydayMeds
                      .filter((m) => m.source === 'ROUTINE')
                      .map((med) => (
                        <div key={med.id} className="everyday-card supplement">
                          <div className="card-header">
                            <span className="type-badge supplement">영양제</span>
                            <button
                              type="button"
                              className="del-icon-btn"
                              onClick={() => handleRemoveEverydayMed(med)}
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
                            onClick={() => handleOpenScheduleModal(med)}
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
        )}
      </main>

      {/* =========================================================
          [공통] 상비약/영양제 캘린더 일정 생성 모달
         ========================================================= */}
      {scheduleModalMed && (
        <div className="modal-overlay" onClick={() => !isSavingSchedule && setScheduleModalMed(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{scheduleModalMed.name} 복약 일정 등록</h2>
              <button
                type="button"
                className="close-btn"
                onClick={() => setScheduleModalMed(null)}
                disabled={isSavingSchedule}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSaveSchedule}>
              <p className="modal-desc">
                캘린더와 메인 화면에 매일 복약 체크를 진행할 시간대와 일수를 설정하세요.
              </p>

              <div className="slots-picker">
                <label className="picker-title">복용 시간대 선택 (복수 선택 가능)</label>
                <div className="slots-grid">
                  {[
                    { key: 'morning', label: '아침', defaultTime: '08:30' },
                    { key: 'lunch', label: '점심', defaultTime: '12:30' },
                    { key: 'evening', label: '저녁', defaultTime: '18:30' },
                    { key: 'bedtime', label: '취침전', defaultTime: '22:00' },
                  ].map((s) => (
                    <label key={s.key} className={`slot-checkbox-label ${schedSlots[s.key] ? 'checked' : ''}`}>
                      <input
                        type="checkbox"
                        checked={schedSlots[s.key]}
                        onChange={(e) => setSchedSlots({ ...schedSlots, [s.key]: e.target.checked })}
                      />
                      <span>{s.label}</span>
                      <small>{schedTimes[s.key]}</small>
                    </label>
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
                  onClick={() => setScheduleModalMed(null)}
                  disabled={isSavingSchedule}
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="btn-submit"
                  disabled={isSavingSchedule}
                >
                  {isSavingSchedule ? '일정 생성 중...' : `${schedDays}일 복약 일정 등록 완료`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
