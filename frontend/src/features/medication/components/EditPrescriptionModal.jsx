import { useState, useEffect, useRef } from 'react';
import { useDialog } from '../../../contexts/DialogContext';
import { updatePrescription } from '../medicationApi';
import { useMedicationSearch } from '../../../hooks/useMedicationSearch';
import { useIsMobile } from '../../../hooks/useIsMobile';
import DatePicker from '../../../components/ui/DatePicker';

// 식약처 및 임상 처방전 표준 복용 시점 옵션
const STANDARD_TIMING_OPTIONS = [
  '식후 30분',
  '식사 직후',
  '식전 30분',
  '식전 1시간 (공복)',
  '취침 전',
  '기상 직후 (공복)',
  '필요시 (증상 있을 때)',
  '직접 입력',
];

const normalizeUsageTiming = (raw) => {
  if (!raw) return '식후 30분';
  const str = raw.trim();
  for (const std of STANDARD_TIMING_OPTIONS) {
    if (std === '직접 입력') continue;
    if (str === std) return std;
  }
  if (str.includes('직후')) return '식사 직후';
  if (str.includes('취침') || str.includes('자기전')) return '취침 전';
  if (str.includes('공복') || str.includes('식전 1시간')) return '식전 1시간 (공복)';
  if (str.includes('기상')) return '기상 직후 (공복)';
  if (str.includes('식전')) return '식전 30분';
  if (str.includes('필요시')) return '필요시 (증상 있을 때)';
  if (str.includes('식후')) return '식후 30분';
  return str;
};

/**
 * 처방전 정보 및 처방 약품 수정 모달
 * - 처방전 기본 정보 수정 (병원명, 의사명, 조제일자, 복용일수, 별칭)
 * - 처방 약품 목록은 식약처 공공 의약품 DB 실시간 검색을 통해서만 추가/변경 가능
 * - 임의의 비의약품 텍스트 등록 차단 및 공식 의약품 DB 데이터(medicationId) 엄격 연동
 * - 표준화된 복용 시점/용법 선택으로 비정상 텍스트 입력 방지
 */
export default function EditPrescriptionModal(props) {
  if (!props.isOpen || !props.prescription) return null;
  return <PrescriptionEditForm key={JSON.stringify(props.prescription)} {...props} />;
}

function PrescriptionEditForm({
  prescription,
  currentUserId,
  onClose,
  onSuccess,
}) {
  const { showAlert, showLoading, hideLoading } = useDialog();
  const isMobile = useIsMobile(680);

  const [editForm, setEditForm] = useState(() => {
    let dateStr = '';
    if (prescription.dispensedDate) {
      if (typeof prescription.dispensedDate === 'string') {
        dateStr = prescription.dispensedDate.slice(0, 10);
      } else {
        const d = new Date(prescription.dispensedDate);
        if (!isNaN(d.getTime())) {
          dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }
      }
    }

    return {
      prescriptionId: prescription.prescriptionId,
      nickname: prescription.nickname || '',
      hospitalName: prescription.hospitalName || '',
      doctorName: prescription.doctorName || '',
      dispensedDate: dateStr,
      totalDays: prescription.totalDays || 3,
      items: (prescription.items || []).map((it) => ({
        itemId: it.itemId,
        medicationId: it.medicationId ? String(it.medicationId) : null,
        itemName: it.itemName || '',
        entpName: it.entpName || it.className || '',
        dailyDose: it.dailyDose != null ? it.dailyDose : 1,
        dailyFrequency: it.dailyFrequency || 3,
        usageTiming: normalizeUsageTiming(it.usageTiming),
        totalDays: it.totalDays || prescription.totalDays || 3,
      })),
    };
  });
  const [isSaving, setIsSaving] = useState(false);
  const [editAlert, setEditAlert] = useState(null);

  // 상단 처방약 추가용 식약처 DB 검색 훅
  const {
    searchText: addSearchText,
    handleInputChange: handleAddSearchChange,
    searchResults: addSearchResults,
    isSearching: isAddSearching,
    isDropdownOpen: isAddDropdownOpen,
    setIsDropdownOpen: setIsAddDropdownOpen,
    highlightIndex: addHighlightIndex,
    setHighlightIndex: setAddHighlightIndex,
    containerRef: addSearchRef,
    clearSearch: clearAddSearch,
    handleKeyDown: handleAddKeyDown,
  } = useMedicationSearch({ debounceMs: 250 });

  // 개별 행 약품 변경용 상태
  const [changingIndex, setChangingIndex] = useState(null);
  const [rowSearchText, setRowSearchText] = useState('');
  const [rowSearchResults, setRowSearchResults] = useState([]);
  const [isRowSearching, setIsRowSearching] = useState(false);
  const [isRowDropdownOpen, setIsRowDropdownOpen] = useState(false);
  const rowSearchRef = useRef(null);



  // 행 약품 변경 디바운스 검색
  useEffect(() => {
    const keyword = rowSearchText.trim();
    if (!keyword) return;

    const timer = setTimeout(async () => {
      setIsRowSearching(true);
      try {
        const res = await fetch(`/api/calendar/search-medications?keyword=${encodeURIComponent(keyword)}`);
        if (res.ok) {
          const list = await res.json();
          setRowSearchResults(Array.isArray(list) ? list : []);
          setIsRowDropdownOpen(true);
        } else {
          setRowSearchResults([]);
        }
      } catch (err) {
        console.warn('약품 검색 오류:', err);
        setRowSearchResults([]);
      } finally {
        setIsRowSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [rowSearchText]);

  // 행 검색 바깥 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (rowSearchRef.current && !rowSearchRef.current.contains(e.target)) {
        setIsRowDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 약품 추가 (식약처 DB 검색 결과에서 선택)
  const handleSelectAddMedication = (med) => {
    if (!med) return;
    const medId = String(med.medicationId || med.itemSeq);
    const exists = editForm.items.some((it) => it.medicationId === medId);
    if (exists) {
      showAlert(`'${med.itemName}'은(는) 이미 처방 약품 목록에 추가되어 있습니다.`, '약품 중복');
      return;
    }

    setEditForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          medicationId: medId,
          itemName: med.itemName,
          entpName: med.entpName || '',
          dailyDose: 1,
          dailyFrequency: 3,
          usageTiming: '식후 30분',
          totalDays: prev.totalDays || 3,
        },
      ],
    }));

    clearAddSearch();
  };

  // 행 약품 변경 시작
  const handleStartChangeItem = (idx) => {
    setChangingIndex(idx);
    setRowSearchText('');
    setRowSearchResults([]);
    setIsRowDropdownOpen(false);
  };

  // 행 약품 변경 적용
  const handleApplyChangeItem = (idx, med) => {
    if (!med) return;
    const medId = String(med.medicationId || med.itemSeq);
    const exists = editForm.items.some((it, i) => i !== idx && it.medicationId === medId);
    if (exists) {
      showAlert(`'${med.itemName}'은(는) 이미 처방 약품 목록에 존재합니다.`, '약품 중복');
      return;
    }

    setEditForm((prev) => ({
      ...prev,
      items: prev.items.map((it, i) =>
        i === idx
          ? {
              ...it,
              medicationId: medId,
              itemName: med.itemName,
              entpName: med.entpName || '',
            }
          : it
      ),
    }));

    setChangingIndex(null);
    setRowSearchText('');
    setRowSearchResults([]);
    setIsRowDropdownOpen(false);
  };

  const handleRemoveItem = (idx) => {
    setEditForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== idx),
    }));
    if (changingIndex === idx) {
      setChangingIndex(null);
    }
  };

  const handleItemChange = (idx, field, value) => {
    setEditForm((prev) => ({
      ...prev,
      items: prev.items.map((it, i) => (i === idx ? { ...it, [field]: value } : it)),
    }));
  };

  const handleSave = async () => {
    if (!editForm.hospitalName.trim()) {
      showAlert('의료기관(병원명)을 입력해주세요.');
      return;
    }
    if (editForm.items.length === 0) {
      showAlert('최소 1개 이상의 처방 약품이 포함되어야 합니다. 위 검색창에서 공식 의약품을 추가해 주세요.');
      return;
    }
    for (let i = 0; i < editForm.items.length; i++) {
      const it = editForm.items[i];
      if (!it.itemName.trim()) {
        showAlert(`${i + 1}번째 약품의 이름을 입력해주세요.`);
        return;
      }
      if (!it.medicationId || it.medicationId.startsWith('MANUAL_')) {
        showAlert(
          `'${it.itemName}'은(는) 식약처 의약품 DB에 등록되지 않은 미인증 약품입니다.\n[약품 변경] 버튼을 눌러 공식 의약품을 검색 후 선택해 주세요.`,
          '의약품 인증 필요'
        );
        return;
      }
      if (!it.usageTiming || !it.usageTiming.trim()) {
        showAlert(`${i + 1}번째 약품의 복용 시점/용법을 선택하거나 입력해 주세요.`);
        return;
      }
      const timingLower = it.usageTiming.toLowerCase();
      const validTimingKeywords = ['식후', '식전', '직후', '취침', '공복', '기상', '필요시', '시간', '분', '식간', '매일', '아침', '점심', '저녁'];
      const hasValidTiming = validTimingKeywords.some((kw) => timingLower.includes(kw));
      if (!hasValidTiming) {
        showAlert(
          `'${it.itemName}'의 복용 시점('${it.usageTiming}')이 올바르지 않습니다.\n'식후 30분', '식전', '취침 전' 등 복약 시기를 알 수 있는 표준 용법을 입력해 주세요.`,
          '용법 입력 확인'
        );
        return;
      }
    }

    setIsSaving(true);
    showLoading({
      title: '처방전 정보 수정 중',
      description: '수정된 처방전과 관련 복약 일정을 안전하게 반영하고 있습니다. 잠시만 기다려 주세요.',
    });
    setEditAlert(null);

    try {
      await updatePrescription(editForm.prescriptionId, editForm);
      setEditAlert({ type: 'success', message: '처방전 정보가 성공적으로 수정되었습니다.' });

      window.dispatchEvent(new CustomEvent('jette-intake-updated', {
        detail: { userId: currentUserId }
      }));

      setTimeout(() => {
        onSuccess?.();
        showAlert('처방전 정보가 성공적으로 수정되었습니다.', '수정 완료');
      }, 600);
    } catch (err) {
      console.error('처방전 수정 오류:', err);
      setEditAlert({ type: 'error', message: err.message || '서버 통신 중 오류가 발생했습니다.' });
      showAlert(err.message || '서버 통신 중 오류가 발생했습니다.', '수정 오류');
    } finally {
      setIsSaving(false);
      hideLoading();
    }
  };

  return (
    <div className="modal-overlay" onClick={() => !isSaving && onClose()}>
      <div className="modal-box rx-edit-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="rx-edit-kicker">PRESCRIPTION EDIT</span>
            <h2>처방전 정보 및 약품 수정</h2>
          </div>
          <button
            type="button"
            className="close-btn"
            onClick={onClose}
            disabled={isSaving}
          >
            ✕
          </button>
        </div>

        {editAlert && (
          <div className={`rx-edit-alert-banner ${editAlert.type}`}>
            {editAlert.type === 'success' ? '[완료] ' : '[주의] '}
            {editAlert.message}
          </div>
        )}

        <div className="rx-edit-modal-body">
          {/* 1. 기본 정보 */}
          <div className="edit-form-section">
            <h4 className="edit-section-title">기본 정보</h4>
            <div className="edit-fields-grid">
              <div className="edit-field-group">
                <label>처방전 별칭 (예: 감기약, 비염약)</label>
                <input
                  type="text"
                  value={editForm.nickname || ''}
                  onChange={(e) => setEditForm({ ...editForm, nickname: e.target.value })}
                  placeholder="예: 감기약 (비어있으면 처방 목적 자동 적용)"
                />
              </div>
              <div className="edit-field-group">
                <label>의료기관명 (병원/의원)</label>
                <input
                  type="text"
                  value={editForm.hospitalName}
                  onChange={(e) => setEditForm({ ...editForm, hospitalName: e.target.value })}
                  placeholder="예: 한내과의원"
                />
              </div>
              <div className="edit-field-group">
                <label>처방의 / 담당의사</label>
                <input
                  type="text"
                  value={editForm.doctorName}
                  onChange={(e) => setEditForm({ ...editForm, doctorName: e.target.value })}
                  placeholder="예: 김도현 원장"
                />
              </div>
              <div className="edit-field-group">
                <label>처방 / 조제 일자</label>
                <DatePicker
                  value={editForm.dispensedDate}
                  onChange={(e) => setEditForm({ ...editForm, dispensedDate: e.target.value })}
                  placeholder="조제 일자 선택"
                  title="조제 일자 선택"
                />
              </div>
              <div className="edit-field-group">
                <label>총 투약 일수 (일)</label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={editForm.totalDays}
                  onChange={(e) => setEditForm({ ...editForm, totalDays: parseInt(e.target.value, 10) || 1 })}
                />
              </div>
            </div>
          </div>

          {/* 2. 처방 약품 목록 (식약처 DB 실시간 연동) */}
          <div className="edit-form-section">
            <div className="edit-items-header">
              <div>
                <h4 className="edit-section-title">처방 약품 및 용법 ({editForm.items.length}종)</h4>
                <p className="edit-section-sub">
                  처방 약품은 식약처 공공 의약품 DB에 등록된 실제 의약품으로만 추가 및 수정할 수 있습니다.
                </p>
              </div>
            </div>

            {/* 식약처 공식 의약품 검색 및 추가 바 */}
            <div className="rx-item-add-box" ref={addSearchRef}>
              <div className="rx-search-input-row">
                <i className="fa-solid fa-magnifying-glass search-icon" />
                <input
                  type="text"
                  className="rx-search-input"
                  placeholder={isMobile ? '식약처 의약품 검색 (예: 타이레놀)' : '식약처 DB 의약품 검색하여 추가 (예: 타이레놀, 아모디핀, 세파클러...)'}
                  value={addSearchText}
                  onChange={handleAddSearchChange}
                  onFocus={() => { if (addSearchText.trim()) setIsAddDropdownOpen(true); }}
                  onKeyDown={(e) => handleAddKeyDown(e, handleSelectAddMedication)}
                />
                {isAddSearching && <span className="searching-spinner" />}
                {addSearchText && (
                  <button type="button" className="clear-search-btn" onClick={clearAddSearch}>✕</button>
                )}
              </div>

              {isAddDropdownOpen && addSearchText.trim() && (
                <div className="rx-add-dropdown">
                  {addSearchResults.length > 0 ? (
                    <div className="rx-add-results-list">
                      <div className="rx-add-dropdown-header">
                        식약처 의약품 검색 결과 ({addSearchResults.length}건) · 클릭하여 처방약 추가
                      </div>
                      {addSearchResults.map((med, aIdx) => (
                        <div
                          key={med.medicationId || aIdx}
                          className={`rx-add-item-option ${addHighlightIndex === aIdx ? 'highlighted' : ''}`}
                          onClick={() => handleSelectAddMedication(med)}
                          onMouseEnter={() => setAddHighlightIndex(aIdx)}
                        >
                          <div className="option-info">
                            <strong className="option-name">{med.itemName}</strong>
                            {med.entpName && <span className="option-corp">{med.entpName}</span>}
                          </div>
                          <span className="option-add-badge">+ 처방약 추가</span>
                        </div>
                      ))}
                    </div>
                  ) : !isAddSearching ? (
                    <div className="rx-add-empty-hint">
                      검색된 의약품이 없습니다. 식약처에 등록된 정확한 약품명을 입력해 주세요.
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <div className="edit-items-table-wrapper">
              <table className="edit-items-table">
                <thead>
                  <tr>
                    <th style={{ width: '38%' }}>처방 약품명 (식약처 DB)</th>
                    <th style={{ width: '16%' }}>1일 복용 횟수</th>
                    <th style={{ width: '16%' }}>1회 투약량</th>
                    <th style={{ width: '22%' }}>복용 시점 / 용법</th>
                    <th style={{ width: '8%', textAlign: 'center' }}>삭제</th>
                  </tr>
                </thead>
                <tbody>
                  {editForm.items.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="table-empty-row">
                        등록된 처방 약품이 없습니다. 위 검색창에서 공식 의약품을 검색하여 추가해 주세요.
                      </td>
                    </tr>
                  ) : (
                    editForm.items.map((item, idx) => (
                      <tr key={idx}>
                        <td>
                          {changingIndex === idx ? (
                            <div className="row-change-search-wrap" ref={rowSearchRef}>
                              <div className="row-change-input-bar">
                                <input
                                  type="text"
                                  className="row-change-input"
                                  placeholder={isMobile ? '대체 약품 검색 (예: 타이레놀)' : '대체할 식약처 약품명 검색 (예: 타이레놀...)'}
                                  value={rowSearchText}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setRowSearchText(val);
                                    if (!val.trim()) { setRowSearchResults([]); setIsRowDropdownOpen(false); }
                                    if (!val.trim()) {
                                      setRowSearchResults([]);
                                      setIsRowDropdownOpen(false);
                                    }
                                  }}
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  className="row-change-cancel-btn"
                                  onClick={() => setChangingIndex(null)}
                                >
                                  취소
                                </button>
                              </div>
                              {isRowSearching && (
                                <div className="row-search-loading">검색 중...</div>
                              )}
                              {isRowDropdownOpen && rowSearchResults.length > 0 && (
                                <div className="row-search-dropdown-menu">
                                  {rowSearchResults.map((res) => (
                                    <div
                                      key={res.medicationId}
                                      className="row-search-dropdown-item"
                                      onClick={() => handleApplyChangeItem(idx, res)}
                                    >
                                      <strong className="res-item-name">{res.itemName}</strong>
                                      {res.entpName && <span className="res-entp-name">({res.entpName})</span>}
                                    </div>
                                  ))}
                                </div>
                              )}
                              {isRowDropdownOpen && !isRowSearching && rowSearchResults.length === 0 && rowSearchText.trim() && (
                                <div className="row-search-empty-note">
                                  일치하는 의약품이 없습니다.
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="table-med-cell">
                              <div className="med-name-line">
                                <strong className="med-name-strong">{item.itemName}</strong>
                                {item.medicationId && !item.medicationId.startsWith('MANUAL_') ? (
                                  <span className="med-badge-verified">
                                    <i className="fa-solid fa-circle-check" /> DB 인증
                                  </span>
                                ) : (
                                  <span className="med-badge-unverified">
                                    <i className="fa-solid fa-triangle-exclamation" /> 미인증
                                  </span>
                                )}
                              </div>
                              {item.entpName && (
                                <div className="med-entp-sub">{item.entpName}</div>
                              )}
                              <button
                                type="button"
                                className="btn-change-drug"
                                onClick={() => handleStartChangeItem(idx)}
                                title="식약처 의약품 DB에서 다른 약품으로 검색 및 변경"
                              >
                                <i className="fa-solid fa-arrows-rotate" /> 약품 변경
                              </button>
                            </div>
                          )}
                        </td>
                        <td>
                          <select
                            className="table-select"
                            value={item.dailyFrequency}
                            onChange={(e) => handleItemChange(idx, 'dailyFrequency', parseInt(e.target.value, 10))}
                          >
                            <option value={1}>1일 1회</option>
                            <option value={2}>1일 2회</option>
                            <option value={3}>1일 3회</option>
                            <option value={4}>1일 4회</option>
                          </select>
                        </td>
                        <td>
                          <div className="dose-input-group">
                            <input
                              type="number"
                              step="0.5"
                              min="0.5"
                              max="10"
                              className="table-input number-input"
                              value={item.dailyDose}
                              onChange={(e) => handleItemChange(idx, 'dailyDose', parseFloat(e.target.value) || 1)}
                            />
                            <span className="dose-unit">정/포</span>
                          </div>
                        </td>
                        <td>
                          <div className="table-timing-cell">
                            <select
                              className="table-select"
                              value={
                                STANDARD_TIMING_OPTIONS.slice(0, -1).includes(item.usageTiming)
                                  ? item.usageTiming
                                  : '직접 입력'
                              }
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === '직접 입력') {
                                  handleItemChange(idx, 'usageTiming', '');
                                } else {
                                  handleItemChange(idx, 'usageTiming', val);
                                }
                              }}
                            >
                              {STANDARD_TIMING_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                            {!STANDARD_TIMING_OPTIONS.slice(0, -1).includes(item.usageTiming) && (
                              <input
                                type="text"
                                className="table-input custom-timing-input"
                                value={item.usageTiming}
                                onChange={(e) => handleItemChange(idx, 'usageTiming', e.target.value)}
                                placeholder="예: 식후 1시간 (시점 입력)"
                                autoFocus
                              />
                            )}
                          </div>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className="table-del-btn"
                            onClick={() => handleRemoveItem(idx)}
                            title="약품 삭제"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
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
            type="button"
            className="btn-submit"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? '저장 중...' : '저장 완료'}
          </button>
        </div>
      </div>
    </div>
  );
}
