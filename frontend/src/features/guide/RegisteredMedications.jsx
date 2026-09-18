const groups = [
  ['PRESCRIPTION', '현재 처방약'], ['CABINET', '직접 추가한 상비약'], ['ROUTINE', '상시약 · 영양제'],
]
export default function RegisteredMedications({ items, selectedId, onSelect, onSearch }) {
  if (!items.length) return <p className="guide-note">현재 처방 기간에 해당하는 약이나 직접 등록한 약이 없습니다. 다른 약은 이름으로 검색할 수 있어요.</p>
  return <div className="guide-registered-groups">{groups.map(([source, title]) => {
    const rows = items.filter(item => item.source === source)
    if (!rows.length) return null
    return <section key={source} aria-label={title}><h3>{title} <small>{rows.length}건</small></h3>
      <div className="guide-registered-list">{rows.map(item => <article key={item.registrationId} className="guide-registered-item">
        {item.medicationId ? <button className={'med-pill-tab' + (selectedId === item.medicationId ? ' active' : '')}
          aria-pressed={selectedId === item.medicationId} onClick={() => onSelect(item.medicationId)}>
          <span>{item.itemName}<small className="guide-maker">{item.entpName}</small></span></button>
          : <><strong>{item.itemName}</strong><button onClick={() => onSearch(item.itemName)}>제품 검색</button>
            <p className="guide-note">품목코드가 연결되지 않아 상세 가이드는 제품 선택 후 확인할 수 있어요.</p></>}
        {item.startDate && <p className="guide-note">처방 기간: {item.startDate} ~ {item.endDate}</p>}
        {item.takeTime && <p className="guide-note">등록한 복용 시각: {item.takeTime}</p>}
        {item.notes && <p className="guide-note">{item.notes}</p>}
      </article>)}</div>
    </section>
  })}</div>
}
