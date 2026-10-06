/** 등록 약의 실제 주의 기록만 모아 자동 경고와 약별 경고에 같은 자료 사용 */
export function collectMedicationWarnings(items, guides) {
  return items.flatMap(item => {
    const records = guides[String(item.medicationId)]?.data?.dur?.items
    if (!Array.isArray(records) || !records.length) return []
    return [{ ...item, records }]
  })
}

// 기록 내용이 바뀐 경우에는 다시 알리고, 탭 이동·순서 변경만으로 같은 경고를 반복하지 않음
export function warningSignature(warnings, comparison) {
  const products = warnings.map(item => [String(item.medicationId), item.records])
    .sort(([left], [right]) => left.localeCompare(right))
  return JSON.stringify({ products, pairs: comparison?.pairs || [], duplicates: comparison?.duplicates || [] })
}

export function warningTypeLabels(records) {
  const labels = { 1: '임신 중 주의', 2: '어르신 복용 주의', 3: '나이에 따른 주의', 4: '다른 약과 함께 먹을 때 주의' }
  return [...new Set(records.map(record => labels[record.tabooType] || '복용 주의'))]
}
