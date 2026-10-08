/** 알림 조회·이벤트에서 공통으로 사용하는 날짜와 상대 시간. 화면 렌더링과 분리 */
export function localNotificationDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function parseDateToMs(dateStr) {
  if (!dateStr) return Date.now();
  if (typeof dateStr === 'number') return dateStr;
  const str = String(dateStr).trim();
  const normalized = str.includes(' ') && !str.includes('T') ? str.replace(' ', 'T') : str;
  const ms = new Date(normalized).getTime();
  return Number.isNaN(ms) ? Date.now() : ms;
}

export function formatRelativeTime(dateOrMs, fallback) {
  if (!dateOrMs && fallback) return fallback;
  const ms = typeof dateOrMs === 'number' ? dateOrMs : parseDateToMs(dateOrMs);
  const diffMs = Date.now() - ms;
  if (diffMs < 0) return fallback || '방금 전';
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return '방금 전';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  const diffDays = Math.floor(diffHour / 24);
  if (diffDays < 7) return `${diffDays}일 전`;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return fallback || '';
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}
