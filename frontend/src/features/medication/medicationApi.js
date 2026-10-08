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
  const data = await res.json().catch(() => null);
  // Tomcat의 HTML 오류 응답도 인증 만료·권한 오류로 구분해서 안내.
  if (res.status === 401) throw new Error('로그인이 만료되었어요. 다시 로그인한 뒤 등록해 주세요.');
  if (res.status === 403) throw new Error('선택한 대상자의 약을 등록할 권한이 없어요. 복용 대상자를 확인해 주세요.');
  if (!res.ok || data?.success !== true) {
    throw new Error(data?.message || '약 등록을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
  }
  return data;
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
