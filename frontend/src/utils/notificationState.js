/* 정기 조회 때도 실시간 알림과 서버가 확인한 읽음 표시를 유지. */
export function mergeNotificationItems(previous, incoming, confirmedRead = new Set(), userId = null) {
  const incomingIds = new Set(incoming.map(item => item.id))
  const realtime = previous.filter(item => item.id.startsWith('realtime-dose-') && !incomingIds.has(item.id)
    && (userId == null || String(item.userId) === String(userId)))
  return [...realtime, ...incoming.map(item => ({
    ...item,
    read: item.saved ? Boolean(item.read || confirmedRead.has(item.id)) : Boolean(previous.find(old => old.id === item.id)?.read),
  }))]
}
