import { useState, useEffect } from 'react';
import { useDialog } from '../../../contexts/DialogContext';
import { updatePrescription } from '../medicationApi';

/**
 * 처방전 정보 및 처방 약품 수정 모달
 * - 자체 폼 상태 및 수정 API 처리 관리
 */
export default function EditPrescriptionModal({
  isOpen,
  prescription,
  currentUserId,
  onClose,
  onSuccess,
}) {
  const { showAlert, showLoading, hideLoading } = useDialog();

  const [editForm, setEditForm] = useState({
    prescriptionId: null,
    nickname: '',
    hospitalName: '',
    doctorName: '',
    dispensedDate: '',
    totalDays: 3,
    items: [],
  });
  const [isSaving, setIsSaving] = useState(false);
  const [editAlert, setEditAlert] = useState(null);

  // 대상 처방전이 바뀔 때 초기 폼 데이터 세팅
  useEffect(() => {
    if (!prescription) return;

    setEditAlert(null);
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

    setEditForm({
      prescriptionId: prescription.prescriptionId,
      nickname: prescription.nickname || '',
      hospitalName: prescription.hospitalName || '',
      doctorName: prescription.doctorName || '',
      dispensedDate: dateStr,
      totalDays: prescription.totalDays || 3,
      items: (prescription.items || []).map((it) => ({
        itemId: it.itemId,
        medicationId: it.medicationId,
        itemName: it.itemName || '',
        dailyDose: it.dailyDose != null ? it.dailyDose : 1,
        dailyFrequency: it.dailyFrequency || 3,
        usageTiming: it.usageTiming || '1일 3회 식후 30분',
        totalDays: it.totalDays || prescription.totalDays || 3,
      })),
    });
  }, [prescription]);

  if (!isOpen || !prescription) return null;

  const handleAddItem = () => {
    setEditForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          medicationId: null,
          itemName: '',
          dailyDose: 1,
          dailyFrequency: 3,
          usageTiming: '1일 3회 식후 30분',
          totalDays: prev.totalDays || 3,
        },
      ],
    }));
  };

  const handleRemoveItem = (idx) => {
    setEditForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== idx),
    }));
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
      showAlert('최소 1개 이상의 처방 약품이 포함되어야 합니다.');
      return;
    }
    for (let i = 0; i < editForm.items.length; i++) {
      if (!editForm.items[i].itemName.trim()) {
        showAlert(`${i + 1}번째 약품의 이름을 입력해주세요.`);
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
          {/* 기본 정보 */}
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
                <input
                  type="date"
                  value={editForm.dispensedDate}
                  onChange={(e) => setEditForm({ ...editForm, dispensedDate: e.target.value })}
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

          {/* 약품 목록 테이블 */}
          <div className="edit-form-section">
            <div className="edit-items-header">
              <h4 className="edit-section-title">처방 약품 및 용법 ({editForm.items.length}종)</h4>
              <button
                type="button"
                className="edit-add-item-btn"
                onClick={handleAddItem}
              >
                + 약품 추가
              </button>
            </div>

            <div className="edit-items-table-wrapper">
              <table className="edit-items-table">
                <thead>
                  <tr>
                    <th style={{ width: '32%' }}>약품명</th>
                    <th style={{ width: '18%' }}>1일 복용 횟수</th>
                    <th style={{ width: '16%' }}>1회 투약량</th>
                    <th style={{ width: '26%' }}>복용 시점 / 용법</th>
                    <th style={{ width: '8%' }}>삭제</th>
                  </tr>
                </thead>
                <tbody>
                  {editForm.items.map((item, idx) => (
                    <tr key={idx}>
                      <td>
                        <input
                          type="text"
                          className="table-input"
                          value={item.itemName}
                          onChange={(e) => handleItemChange(idx, 'itemName', e.target.value)}
                          placeholder="약품명 입력"
                        />
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
                        <input
                          type="text"
                          className="table-input"
                          value={item.usageTiming}
                          onChange={(e) => handleItemChange(idx, 'usageTiming', e.target.value)}
                          placeholder="예: 1일 3회 식후 30분"
                        />
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
                  ))}
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
