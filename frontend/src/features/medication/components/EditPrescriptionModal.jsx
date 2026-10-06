import React from 'react';

/**
 * 처방전 정보 및 처방 약품 수정 모달
 */
export default function EditPrescriptionModal({
  isOpen,
  editForm,
  setEditForm,
  isSaving,
  editAlert,
  onClose,
  onSave,
  onAddItem,
  onRemoveItem,
  onItemChange,
}) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
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
                onClick={onAddItem}
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
                          onChange={(e) => onItemChange(idx, 'itemName', e.target.value)}
                          placeholder="약품명 입력"
                        />
                      </td>
                      <td>
                        <select
                          className="table-select"
                          value={item.dailyFrequency}
                          onChange={(e) => onItemChange(idx, 'dailyFrequency', parseInt(e.target.value, 10))}
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
                            onChange={(e) => onItemChange(idx, 'dailyDose', parseFloat(e.target.value) || 1)}
                          />
                          <span className="dose-unit">정/포</span>
                        </div>
                      </td>
                      <td>
                        <input
                          type="text"
                          className="table-input"
                          value={item.usageTiming}
                          onChange={(e) => onItemChange(idx, 'usageTiming', e.target.value)}
                          placeholder="예: 1일 3회 식후 30분"
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="table-del-btn"
                          onClick={() => onRemoveItem(idx)}
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
            onClick={onSave}
            disabled={isSaving}
          >
            {isSaving ? '저장 중...' : '저장 완료'}
          </button>
        </div>
      </div>
    </div>
  );
}
