import { Link } from 'react-router-dom'
import { DurRecord } from '../chatbot/components/CatalogResults'
export default function InteractionSummary({ data }) {
 if (!data) return null
 return <section className="interaction-summary" aria-label="약 사이의 DUR 조회 결과">
  <h3>약 사이의 병용 주의정보</h3><p>{data.medications.length}개 제품의 성분을 비교했습니다.</p>
  {data.unconfirmedCount > 0 && <p>복용 여부를 확인하지 않은 등록 건 {data.unconfirmedCount}개는 비교에서 제외했습니다.</p>}
  {data.medications.length < 2 ? <p>비교할 수 있는 제품이 2개 이상 필요합니다.</p> : !data.pairs.length && <p>선택된 제품 사이에 연결된 병용금기 기록이 없습니다.</p>}
  {data.pairs.map((pair,i) => <details key={i} open><summary>{pair.left.itemName} + {pair.right.itemName} · {pair.items.length}건</summary>
    {pair.items.map((row,j) => <DurRecord key={j} record={row}/>)}
    <Link className="my-med-action" to={'/chat?medicationId='+encodeURIComponent(pair.left.medicationId)+'&compareId='+encodeURIComponent(pair.right.medicationId)}>이 조합을 챗봇에서 확인 →</Link>
  </details>)}
  {data.duplicates.length > 0 && <details><summary>같은 성분이 들어 있는 제품 조합 {data.duplicates.length}건</summary>{data.duplicates.map((row,i)=><p key={i}>{row.left} + {row.right}: {row.ingredients.join(', ')}</p>)}</details>}
  {(data.unresolved.length > 0 || data.unlinked.length > 0) && <details open><summary>자료 연결이 불완전한 약</summary>
    {data.unlinked.map(name=><p key={name}>{name}: 제품이 연결되지 않아 비교하지 못했습니다.</p>)}
    {data.unresolved.map(row=><p key={row.medicationId}>{row.itemName}: {row.ingredients.length ? 'DUR 기록 미연결 성분 — '+row.ingredients.join(', ') : '성분 정보 없음'}</p>)}
  </details>}
  <p className="guide-note">{data.notice}</p>
 </section>
}
