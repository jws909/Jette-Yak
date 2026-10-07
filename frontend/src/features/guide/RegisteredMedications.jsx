/**
 * 같은 제품에 연결된 처방·직접 추가 기록과 복용 상태 표시
 * 등록 구분·현재 상태와 변경 입력창을 묶어 화면 폭이 좁아져도 정렬 유지
 * 상비약은 보관 상태만 표시, 처방이 끝났거나 시작 전인 기록도 상태 변경 제외
 * 변경 가능한 약은 저장 중 입력을 잠가 중복 요청 차단
 */
const labels = { PRESCRIPTION: '처방약', CABINET: '상비약', ROUTINE: '상시약 · 영양제' }
const statusLabels = { ACTIVE: '복용 중', STORED: '보관 중', UNCONFIRMED: '복용 확인 필요', PAUSED: '복용 안 함', ENDED: '종료', UPCOMING: '시작 전' }
export default function RegisteredMedications({ items, onStatus, busy }) {
  return <ul className="my-med-registrations">{items.map(item => {
    const sourceLabel = labels[item.source] || '등록 약'
    // 상비약은 선택창을 숨기는 대신 일반 텍스트로 고정 상태 표시
    const isCabinet = item.source === 'CABINET'
    const statusLabel = isCabinet ? '보관 중' : statusLabels[item.useStatus]
    const canChangeStatus = onStatus && !isCabinet && !['ENDED', 'UPCOMING'].includes(item.periodState)
    const hasDetails = item.startDate || item.takeTime || item.notes
      || (item.periodState === 'CURRENT' && item.daysRemaining > 0)

    return <li className="my-med-registration-item" key={item.registrationId}>
      <div className="my-med-registration-header">
        <div className="my-med-registration-identity">
          <span className="my-med-source">{sourceLabel}</span>
          {statusLabel && <strong className="my-med-status">{statusLabel}</strong>}
        </div>
        {canChangeStatus && <label className="my-med-status-control">
          <span>현재 상태</span>
          <select aria-label={`${item.itemName} ${sourceLabel} 복용 상태`} value={item.useStatus} disabled={busy}
            onChange={event => onStatus(item.registrationId, event.target.value)}>
            <option value="UNCONFIRMED" disabled>복용 여부를 선택하세요</option>
            <option value="ACTIVE">복용 중</option>
            <option value="PAUSED">복용 안 함</option>
            <option value="ENDED">복용 종료</option>
          </select>
        </label>}
      </div>
      {hasDetails && <div className="my-med-registration-details">
        {item.startDate && item.endDate && <span>처방 기간: {item.startDate} ~ {item.endDate}</span>}
        {item.startDate && !item.endDate && <span>처방 시작: {item.startDate}</span>}
        {item.periodState === 'CURRENT' && item.daysRemaining > 0 && <span>{item.daysRemaining === 1 ? '처방 기간 마지막 날' : `처방 기간 ${item.daysRemaining}일 남음 (오늘 포함)`}</span>}
        {item.takeTime && <span>복용 시각: {item.takeTime}</span>}
        {item.notes && <span>{item.notes}</span>}
      </div>}
    </li>
  })}</ul>
}
