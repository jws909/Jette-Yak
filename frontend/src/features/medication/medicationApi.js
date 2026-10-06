/**
 * Medication Register 및 처방전/상비약/영양제 관련 전용 API 서비스 모듈
 */

/**
 * 사용자 처방전 목록 조회
 * @param {number|string} userId
 */
export async function fetchPrescriptions(userId) {
  if (!userId) return [];
  const res = await fetch(`/api/prescriptions/list?userId=${userId}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.prescriptions || (Array.isArray(data) ? data : []);
}

/**
 * 처방전 / 약봉투 이미지 업로드 & AI OCR 분석
 * @param {FormData} formData
 */
export async function uploadPrescription(formData) {
  const res = await fetch('/api/prescriptions/upload', {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.message || '처방전 업로드 실패');
  }
  return await res.json();
}

/**
 * 처방전 정보 및 약품 목록 수정
 * @param {number|string} prescriptionId
 * @param {Object} editForm
 */
export async function updatePrescription(prescriptionId, editForm) {
  const res = await fetch(`/api/prescriptions/${prescriptionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(editForm),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.message || '처방전 수정에 실패했습니다.');
  }
  return await res.json().catch(() => ({}));
}

/**
 * 처방전 및 하위 처방약 삭제
 * @param {number|string} prescriptionId
 * @param {number|string} userId
 */
export async function deletePrescription(prescriptionId, userId) {
  const res = await fetch(`/api/prescriptions/${prescriptionId}?userId=${userId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.message || '처방전 삭제에 실패했습니다.');
  }
  return await res.json().catch(() => ({}));
}

/**
 * 사용자의 상비약/영양제 (everyday-meds) 보관함 조회
 * @param {number|string} userId
 */
export async function fetchEverydayMeds(userId) {
  if (!userId) return [];
  const res = await fetch(`/api/users/everyday-meds?userId=${userId}`);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/**
 * 상비약/영양제 등록 (CABINET 또는 ROUTINE)
 * @param {Object} payload
 */
export async function addEverydayMed(payload) {
  const res = await fetch('/api/users/everyday-meds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.message || '등록에 실패했습니다.');
  }
  return await res.json().catch(() => ({}));
}

/**
 * 상비약/영양제 삭제
 * @param {string} source - 'cabinet' 또는 'routine'
 * @param {string|number} rawId
 * @param {string|number} userId
 */
export async function deleteEverydayMed(source, rawId, userId) {
  const src = source ? source.toLowerCase() : 'cabinet';
  const res = await fetch(`/api/users/everyday-meds/${src}/${rawId}?userId=${userId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.message || '삭제에 실패했습니다.');
  }
  return await res.json().catch(() => ({}));
}

/**
 * 캘린더 복약 일정 등록
 * @param {Object} payload
 */
export async function saveCalendarSchedule(payload) {
  const res = await fetch('/api/calendar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.message || '캘린더 일정 등록에 실패했습니다.');
  }
  return await res.json().catch(() => ({}));
}
