/* 복약 표시는 서버 저장 성공 뒤에만 바꾸고 실패 응답은 호출한 화면에 전달. */
export function createIntakeGate() {
  let active = false
  return {
    acquire() { if (active) return false; active = true; return true },
    release() { active = false },
  }
}

export async function saveIntakeStatus({ scheduleIds, taken, date, fetchImpl = fetch }) {
  const ids = [...new Set(scheduleIds.filter(id => id != null && id !== ''))]
  if (!ids.length) throw new Error('복약 일정을 다시 불러온 뒤 체크해주세요.')
  const batch = ids.length > 1
  const response = await fetchImpl(batch ? '/api/calendar/toggle-batch' : `/api/calendar/${encodeURIComponent(ids[0])}/toggle`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(batch ? { scheduleIds: ids, taken, date } : { taken, date }),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.message || '복약 체크를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.')
  }
}
