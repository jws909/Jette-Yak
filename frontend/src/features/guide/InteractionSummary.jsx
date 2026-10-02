/**
 * 현재 복용 중인 약 사이에서 실제로 확인된 주의정보만 보여준다.
 * 연결 실패나 기록 없음은 화면에 빈 카드로 남기지 않는다.
 */
import { Link } from 'react-router-dom'
import { DurRecord } from '../chatbot/components/CatalogResults'
import { hasInteractionWarnings } from './interactionWarnings'

export default function InteractionSummary({data}){
  if(!hasInteractionWarnings(data))return null
  const warningCount=(data.pairs||[]).reduce((total,pair)=>total+(pair.items?.length||0),0)
  return <section className="interaction-summary" aria-label="함께 복용할 때 확인할 주의정보">
    <div className="interaction-heading"><span aria-hidden="true">!</span><div><h3>함께 복용할 때 확인하세요</h3><p>{warningCount>0?`주의 기록 ${warningCount}건을 찾았습니다.`:'같은 성분이 포함된 약이 있습니다.'}</p></div></div>
    {(data.pairs||[]).map((pair,index)=><details key={index} open={index===0}><summary><strong>{pair.left.itemName}</strong><span>+</span><strong>{pair.right.itemName}</strong><em>{pair.items.length}건</em></summary><div className="interaction-detail">{pair.items.map((row,rowIndex)=><DurRecord key={rowIndex} record={row}/>)}<Link className="my-med-action" to={'/chat?medicationId='+encodeURIComponent(pair.left.medicationId)+'&compareId='+encodeURIComponent(pair.right.medicationId)}>이 조합 자세히 질문하기 →</Link></div></details>)}
    {(data.duplicates||[]).length>0&&<details><summary><strong>같은 성분이 포함된 약</strong><em>{data.duplicates.length}조합</em></summary><div className="interaction-detail">{data.duplicates.map((row,index)=><p key={index}><b>{row.left} + {row.right}</b><span>{row.ingredients.join(', ')}</span></p>)}</div></details>}
  </section>
}
