import { useState, useRef } from 'react';
import { useDialog } from '../../../contexts/DialogContext';
import { getTransformedFile } from '../../../utils/imageTransform';
import { uploadPrescription } from '../medicationApi';

/**
 * 처방전 / 약봉투 (AI 스마트 OCR 분석) 탭 컴포넌트
 * - 자체 파일 업로드, 회전/반전 미리보기 및 AI OCR 분석 요청 관리
 */
export default function PrescriptionTab({
  currentUserId,
  userPrescriptions,
  isLoadingRxList,
  fetchPrescriptionList,
  startEditPrescription,
  handleDeleteRx,
}) {
  const { showAlert, showLoading, hideLoading } = useDialog();

  const [rxFile, setRxFile] = useState(null);
  const [rxPreview, setRxPreview] = useState(null);
  const [rotation, setRotation] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileSelectDirect = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showAlert('이미지 파일(JPG, PNG, WEBP 등)만 등록 가능합니다.', '파일 형식 안내');
      return;
    }
    setRxFile(file);
    setRotation(0);
    setIsFlipped(false);
    const objectUrl = URL.createObjectURL(file);
    setRxPreview(objectUrl);
  };

  const handleRxFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleFileSelectDirect(file);
  };

  const rotateImage = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const flipImage = () => {
    setIsFlipped((prev) => !prev);
  };

  // 처방전 업로드 & OCR 요청
  const handleRxUploadSubmit = async (e) => {
    e.preventDefault();
    if (!currentUserId) {
      showAlert('로그인이 필요한 서비스입니다.');
      return;
    }
    if (!rxFile) {
      showAlert('처방전 또는 약봉투 사진을 선택해 주세요.');
      return;
    }

    setIsAnalyzing(true);
    showLoading({
      title: 'AI 처방전 자동 분석 및 등록 중',
      description: '처방전 이미지의 약품명, 용법, 일수를 AI로 분석하고 복약 일정을 생성하고 있습니다. 잠시만 기다려 주세요.',
    });

    try {
      const finalFile = await getTransformedFile(rxFile, rotation, isFlipped);
      const formData = new FormData();
      formData.append('file', finalFile);
      formData.append('userId', currentUserId);

      const data = await uploadPrescription(formData);
      if (data.success && data.prescription) {
        setRxFile(null);
        setRxPreview(null);
        await fetchPrescriptionList();
        window.dispatchEvent(new CustomEvent('jette-intake-updated', {
          detail: { userId: currentUserId }
        }));
        showAlert('처방전 분석 및 등록이 성공적으로 완료되었습니다!\n복약 일정이 자동 생성되었습니다.', '등록 완료');
        return;
      }
      throw new Error(data.message || '처방전 처리 응답 오류');
    } catch (err) {
      console.error('처방전 등록 오류:', err);
      showAlert('처방전 분석에 실패했습니다. 사진이 선명한지 확인 후 다시 시도해 주세요.', '분석 실패');
    } finally {
      setIsAnalyzing(false);
      hideLoading();
    }
  };

  return (
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
          <div className="rx-card-header">
            <span className="rx-card-step-badge">STEP 1</span>
            <h3 className="rx-card-title">처방전 · 약봉투 사진 등록</h3>
            <p className="rx-card-desc">
              병원 처방전이나 약국 약봉투를 카메라로 촬영하거나 사진을 업로드해 주세요.
            </p>
          </div>

          {/* 촬영 안내 팁 */}
          <div className="rx-guide-box">
            <div className="rx-guide-item">
              <svg className="guide-check-icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              <span><strong>병원 처방전</strong>과 약국 <strong>조제 약봉투</strong> 모두 지원합니다.</span>
            </div>
            <div className="rx-guide-item">
              <svg className="guide-check-icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              <span>글자가 수평으로 보이도록 평평하게 촬영하면 AI가 정확히 인식합니다.</span>
            </div>
          </div>

          <form onSubmit={handleRxUploadSubmit} className="rx-upload-form">
            {!rxPreview ? (
              <div
                className={`rx-dropzone ${isDragging ? 'drag-over' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  if (e.dataTransfer.files?.[0]) {
                    handleFileSelectDirect(e.dataTransfer.files[0]);
                  }
                }}
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
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="48" height="48">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <strong className="dropzone-main-title">사진을 여기에 끌어다 놓거나 클릭하세요</strong>
                <span className="dropzone-sub-info">스마트폰 촬영본, JPG, PNG, WEBP, PDF 지원 (최대 15MB)</span>
                <button type="button" className="dropzone-browse-btn">
                  사진 파일 선택 / 직접 촬영
                </button>
              </div>
            ) : (
              <div className="rx-preview-wrapper">
                <div className="preview-top-actions">
                  <span className="preview-file-name">{rxFile?.name}</span>
                  <div className="preview-tools">
                    <button type="button" onClick={rotateImage} title="90도 회전">
                      90° 회전
                    </button>
                    <button type="button" onClick={flipImage} title="좌우 반전">
                      좌우 반전
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
                      maxHeight: '380px',
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
                    'AI 분석 및 복약 일정 등록 완료하기 →'
                  )}
                </button>
              </div>
            )}
          </form>
        </div>

        {/* 우측: 내 등록 처방전 목록 */}
        <div className="rx-history-card">
          <div className="rx-history-head">
            <div>
              <h3 className="rx-history-title">등록된 처방전 내역 ({userPrescriptions.length}건)</h3>
              <p className="rx-history-desc">등록된 처방전과 처방 약품 목록 및 복약 일정을 확인하세요.</p>
            </div>
            <button type="button" className="refresh-btn" onClick={fetchPrescriptionList}>
              새로고침
            </button>
          </div>

          {isLoadingRxList ? (
            <div className="rx-list-empty">처방전 내역을 불러오는 중...</div>
          ) : userPrescriptions.length === 0 ? (
            <div className="rx-list-empty">
              <p className="empty-title">아직 등록된 처방전이 없습니다.</p>
              <span className="empty-desc">왼쪽에서 처방전이나 약봉투 사진을 등록해 보세요!</span>
            </div>
          ) : (
            <div className="rx-cards-list">
              {userPrescriptions.map((rx, index) => {
                const isLatest = index === 0;
                const dateStr = rx.dispensedDate
                  ? (typeof rx.dispensedDate === 'string' ? rx.dispensedDate.slice(0, 10).replace(/-/g, '.') : '')
                  : '날짜 미상';
                let purpose = rx.aiGuide?.purpose;
                if (!purpose && rx.aiSummaryJson) {
                  try {
                    const parsed = JSON.parse(rx.aiSummaryJson);
                    if (parsed.aiGuide?.purpose) purpose = parsed.aiGuide.purpose;
                  } catch { /* 저장 실패가 있어도 입력값을 유지 */ }
                }

                return (
                  <div key={rx.prescriptionId} className={`rx-item-card ${isLatest ? 'is-active-rx' : ''}`}>
                    <div className="rx-card-top-bar">
                      <div className="rx-hospital-meta">
                        <div className="rx-hospital-header-line">
                          <h4 className="rx-hospital-name">
                            {rx.nickname && <span className="rx-nickname-badge">[{rx.nickname}] </span>}
                            {rx.hospitalName || '의료기관'}
                          </h4>
                          {isLatest ? (
                            <span className="rx-tag-current">현재 복용</span>
                          ) : (
                            <span className="rx-tag-past">복용 완료</span>
                          )}
                          {rx.hasDiscontinuedDrug === 1 && (
                            <span className="rx-tag-discontinued">판매중단 포함</span>
                          )}
                        </div>
                        <div className="rx-meta-sub-line">
                          {rx.doctorName && <span>담당: {rx.doctorName}</span>}
                          {rx.doctorName && <span className="meta-sep">·</span>}
                          <span>조제일: {dateStr}</span>
                          <span className="meta-sep">·</span>
                          <span className="rx-days-badge">{rx.totalDays || 0}일분 처방</span>
                        </div>
                      </div>

                      <div className="rx-card-actions">
                        <button
                          type="button"
                          className="rx-action-edit"
                          onClick={() => startEditPrescription(rx)}
                          title="처방전 정보 및 약품 수정"
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          className="rx-action-delete"
                          onClick={() => handleDeleteRx(rx.prescriptionId)}
                          title="처방전 삭제"
                        >
                          삭제
                        </button>
                      </div>
                    </div>

                    {purpose && (
                      <div className="rx-purpose-box">
                        <span className="purpose-label">AI 처방 이유</span>
                        <span className="purpose-text">{purpose}</span>
                      </div>
                    )}

                    <div className="rx-meds-container">
                      <div className="rx-meds-header-row">
                        <span className="rx-meds-header-title">처방 의약품 ({rx.items?.length || 0}종)</span>
                        <span className="rx-meds-header-guide">복용 용법 및 투약량</span>
                      </div>

                      <div className="rx-meds-list-rows">
                        {rx.items && rx.items.length > 0 ? (
                          rx.items.map((it, itIdx) => (
                            <div key={itIdx} className={`rx-med-item-row ${it.isDiscontinued ? 'discontinued' : ''}`}>
                              <div className="med-row-info">
                                <span className="med-index-num">{itIdx + 1}</span>
                                <div className="med-title-block">
                                  <span className="med-title-text">{it.itemName}</span>
                                  {it.className && (
                                    <span className="med-category-text">{it.className}</span>
                                  )}
                                  {it.isDiscontinued && (
                                    <span className="med-danger-text">[판매중단]</span>
                                  )}
                                </div>
                              </div>

                              <div className="med-row-dosage">
                                <span className="med-freq-dose">1일 {it.dailyFrequency}회 · 1회 {it.dailyDose}정</span>
                                <span className="med-timing-text">{it.usageTiming || '식후 30분'}</span>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="rx-meds-empty-text">등록된 약품 정보가 없습니다.</div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
