const categories = [
  { type: 1, title: '임부금기' },
  { type: 2, title: '노인금기' },
  { type: 3, title: '특정연령대금기' },
  { type: 4, title: '병용금기' },
]

export default function DurInformation({ dur }) {
  if (!dur) return <p className="guide-db-text">DUR 정보를 불러오지 못했습니다. 다시 조회해주세요.</p>
  return <div className="dur-information">
    <p className="guide-note">선택한 약의 성분과 연결된 금기·주의 기록입니다. 개인의 금기 해당 여부를 판정한 결과는 아닙니다.</p>
    {dur.status === 'NO_INGREDIENTS' ? <p className="guide-db-text">등록된 성분 정보가 없어 DUR 정보를 조회할 수 없습니다.</p>
      : dur.items.length === 0 ? <p className="guide-db-text">해당 성분명으로 조회된 DUR 기록이 없습니다.</p>
        : <>
          <p className="dur-count">연결된 DUR 기록 {dur.items.length}건</p>
          {categories.map(({ type, title }) => {
            const rows = dur.items.filter(item => item.tabooType === type)
            return <details className="dur-category" key={type} open={type !== 4}>
              <summary>{title} <span>{rows.length}건</span></summary>
              {rows.length === 0 ? <p className="guide-note">조회된 기록이 없습니다.</p>
                : <ul className="dur-records">{rows.map((item, index) => <li key={index}>
                  <p className="dur-ingredient">{item.ingrAName}{type === 4 && item.ingrBName ? ' + ' + item.ingrBName : ''}</p>
                  {type === 1 && <p className="dur-meta">등급: {item.grade || '등록된 등급 없음'}</p>}
                  {type === 3 && <p className="dur-meta">연령 기준: {item.ageBase || '등록된 연령 기준 없음'}</p>}
                  {type === 4 && !item.ingrBName && <p className="dur-meta">병용 성분 정보가 등록되어 있지 않습니다.</p>}
                  <p className="guide-db-text">{item.tabooEffect?.trim() || '상세 설명이 등록되어 있지 않습니다.'}</p>
                  {item.updatedAt && <small className="guide-note">자료 수정일: {item.updatedAt}</small>}
                </li>)}</ul>}
            </details>
          })}
        </>}
    {dur.unmatchedIngredients?.length > 0 && <details className="dur-unmatched">
      <summary>DUR 기록이 연결되지 않은 성분 {dur.unmatchedIngredients.length}개</summary>
      <ul>{dur.unmatchedIngredients.map(name => <li key={name}>{name}</li>)}</ul>
      <p>성분 표기가 다르거나 등록된 기록이 없을 수 있습니다.</p>
    </details>}
    <p className="dur-footnote">조회된 기록이 없더라도 금기가 없거나 안전하다는 의미는 아닙니다. 병용금기의 상대 성분은 현재 복용 중인 약으로 확인된 것이 아닙니다.</p>
  </div>
}
