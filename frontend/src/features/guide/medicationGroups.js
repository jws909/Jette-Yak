/**
 * 파일 역할: 여러 등록 행을 동일한 의약품 단위로 묶어 제품별 탭에 사용할 모델을 만듭니다.
 * 핵심 규칙: medicationId가 없는 행도 잃지 않도록 대체 그룹 키를 생성합니다.
 */
export function groupMedications(items) {
  const groups = new Map()
  for (const item of items) {
    const key = item.medicationId ? 'med:' + item.medicationId : 'registration:' + item.registrationId
    if (!groups.has(key)) groups.set(key, { ...item, key, registrations: [] })
    groups.get(key).registrations.push(item)
  }
  return [...groups.values()]
}

export function activeMedicationRegistrations(items) {
  return items.filter(item => item.useStatus === 'ACTIVE'
    && item.periodState !== 'ENDED'
    && item.periodState !== 'UPCOMING')
}
