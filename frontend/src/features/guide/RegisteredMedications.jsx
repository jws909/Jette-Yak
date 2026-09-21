const labels = { PRESCRIPTION: '처방약', CABINET: '상비약', ROUTINE: '상시약 · 영양제' }
export default function RegisteredMedications({ items }) {
  return <ul className="my-med-registrations">{items.map(item => <li key={item.registrationId}>
    <span className="my-med-source">{labels[item.source] || '등록 약'}</span>
    {item.startDate && <span>처방 기간: {item.startDate} ~ {item.endDate}</span>}
    {item.takeTime && <span>복용 시각: {item.takeTime}</span>}
    {item.notes && <span>{item.notes}</span>}
  </li>)}</ul>
}
