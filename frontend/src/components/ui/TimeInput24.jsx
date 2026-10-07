/**
 * 역할: 브라우저·운영체제의 오전/오후 설정과 무관하게 00~23시로 시간 선택
 * 저장 값은 기존 API와 같은 HH:mm, 소비 컴포넌트는 기존 event.target.value 방식 사용
 */
import { formatTime24 } from '../../utils/dateTime'
import './TimeInput24.css'

const hours = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'))
const minutes = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'))

export default function TimeInput24({ id, name, className = '', value, onChange, onClick, disabled = false,
  required = false, title, 'aria-label': ariaLabel = '시간', 'aria-describedby': describedBy }) {
  const [hour = '', minute = ''] = formatTime24(value).split(':')
  const changePart = (part, next) => {
    const nextValue = part === 'hour' ? `${next}:${minute || '00'}` : `${hour || '00'}:${next}`
    onChange?.({ target: { name, value: nextValue }, currentTarget: { name, value: nextValue } })
  }
  return <span className={`time-input-24 ${className}`} onClick={onClick} title={title || '24시간 형식 (00:00~23:59)'}>
    <select id={id} aria-label={`${ariaLabel} 시 (00~23)`} aria-describedby={describedBy}
      value={hour} disabled={disabled} required={required} onChange={event => changePart('hour', event.target.value)}>
      <option value="" disabled>시</option>
      {hours.map(item => <option key={item} value={item}>{item}</option>)}
    </select>
    <span className="time-input-24-separator" aria-hidden="true">:</span>
    <select aria-label={`${ariaLabel} 분`} aria-describedby={describedBy}
      value={minute} disabled={disabled} required={required} onChange={event => changePart('minute', event.target.value)}>
      <option value="" disabled>분</option>
      {minutes.map(item => <option key={item} value={item}>{item}</option>)}
    </select>
    {name && <input type="hidden" name={name} value={formatTime24(value)} disabled={disabled} />}
  </span>
}
