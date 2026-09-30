/**
 * 파일 역할: 같은 제품에 연결된 처방·직접 추가 등록 행과 각 복용 상태 변경 버튼을 표시합니다.
 * 핵심 규칙: 상태 저장 중에는 중복 요청을 막기 위해 버튼을 비활성화합니다.
 */
const labels = { PRESCRIPTION: '처방약', CABINET: '상비약', ROUTINE: '상시약 · 영양제' }
const statusLabels = { ACTIVE: '복용 중', STORED: '보관 중', UNCONFIRMED: '복용 확인 필요', PAUSED: '복용 안 함', ENDED: '종료', UPCOMING: '시작 전' }
export default function RegisteredMedications({ items, onStatus, busy }) {
  return <ul className="my-med-registrations">{items.map(item => <li key={item.registrationId}>
    <span className="my-med-source">{labels[item.source] || '등록 약'}</span>
    {item.useStatus && <strong>{statusLabels[item.useStatus]}</strong>}
    {item.startDate && <span>처방 기간: {item.startDate} ~ {item.endDate || '종료일 미등록'}</span>}
    {item.periodState === 'CURRENT' && item.daysRemaining > 0 && <span>{item.daysRemaining === 1 ? '처방 기간 마지막 날' : '처방 기간 '+item.daysRemaining+'일 남음 (오늘 포함)'}</span>}
    {item.takeTime && <span>복용 시각: {item.takeTime}</span>}{item.notes && <span>{item.notes}</span>}
    {onStatus && !['ENDED','UPCOMING'].includes(item.periodState) && <label>현재 상태 <select aria-label={item.itemName+' '+labels[item.source]+' 복용 상태'} value={item.useStatus} disabled={busy} onChange={e => onStatus(item.registrationId,e.target.value)}>
      <option value="UNCONFIRMED" disabled>복용 여부를 선택하세요</option><option value="ACTIVE">복용 중</option><option value="PAUSED">복용 안 함</option><option value="ENDED">복용 종료</option>
      {item.source === 'CABINET' && <option value="STORED">상비약으로 보관</option>}
    </select></label>}
  </li>)}</ul>
}
