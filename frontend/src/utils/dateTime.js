/**
 * 역할: 화면의 시각을 24시간제로 통일
 * 서버의 시간대 없는 문자열은 그대로 표시하고, UTC·오프셋이 있는 값만 한국 시각으로 변환
 */
const koreanDateTime = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hourCycle: 'h23',
})

const pad = value => String(value).padStart(2, '0')

function dateParts(date) {
  if (!Number.isFinite(date.getTime())) return null
  const fields = Object.fromEntries(koreanDateTime.formatToParts(date)
    .filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]))
  return { ...fields, hasDate: true, hasTime: true }
}

function readParts(value) {
  if (value instanceof Date) return dateParts(value)
  if (typeof value === 'number') return dateParts(new Date(value))
  if (typeof value !== 'string' || !value.trim()) return null
  const text = value.trim()
  const time = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text)
  if (time) {
    const [hour, minute, second] = time.slice(1).map(part => Number(part || 0))
    return hour < 24 && minute < 60 && second < 60
      ? { hour, minute, second, hasDate: false, hasTime: true } : null
  }

  const match = /^(\d{4})[-.](\d{2})[-.](\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.exec(text)
  if (!match) return null
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, offset] = match
  const fields = {
    year: Number(yearText), month: Number(monthText), day: Number(dayText),
    hour: Number(hourText || 0), minute: Number(minuteText || 0), second: Number(secondText || 0),
    hasDate: true, hasTime: hourText !== undefined,
  }
  // 날짜 자동 보정(예: 2월 30일 → 3월)을 막아 잘못된 값을 정상 시각처럼 표시하지 않음
  const check = new Date(0)
  check.setUTCFullYear(fields.year, fields.month - 1, fields.day)
  check.setUTCHours(fields.hour, fields.minute, fields.second, 0)
  if (check.getUTCFullYear() !== fields.year || check.getUTCMonth() + 1 !== fields.month
    || check.getUTCDate() !== fields.day || fields.hour > 23 || fields.minute > 59 || fields.second > 59) return null
  if (!offset) return fields
  const iso = `${yearText}-${monthText}-${dayText}T${pad(fields.hour)}:${pad(fields.minute)}:${pad(fields.second)}${offset}`
  return dateParts(new Date(iso))
}

function clockText(parts, includeSeconds) {
  return `${pad(parts.hour)}:${pad(parts.minute)}${includeSeconds ? `:${pad(parts.second)}` : ''}`
}

export function formatTime24(value, { includeSeconds = false } = {}) {
  const parts = readParts(value)
  return parts?.hasTime ? clockText(parts, includeSeconds) : ''
}

export function formatDateTime24(value, { dateSeparator = '-', includeSeconds = false } = {}) {
  const parts = readParts(value)
  if (!parts) return ''
  const date = parts.hasDate ? [parts.year, pad(parts.month), pad(parts.day)].join(dateSeparator) : ''
  return [date, parts.hasTime ? clockText(parts, includeSeconds) : ''].filter(Boolean).join(' ')
}
