/**
 * 역할: 현재 복용 중인 약 조합에서 확인된 병용 주의와 중복 성분 요약
 * 표시 기준: 연결 실패나 기록 없음은 빈 카드로 남기지 않고 생략
 */
import { Link } from 'react-router-dom'
import { DurRecord } from '../chatbot/components/CatalogResults'
import { hasInteractionWarnings } from './interactionWarnings'

export default function InteractionSummary({data}){
  if(!hasInteractionWarnings(data))return null
  const warningCount=(data.pairs||[]).reduce((total,pair)=>total+(pair.items?.length||0),0)
  return <section className="interaction-summary" aria-label="함께 복용할 때 확인할 주의정보">
    <div className="interaction-heading"><span aria-hidden="true">!</span><div><h3>이 약들을 함께 먹기 전에 확인하세요</h3><p>{warningCount>0?`함께 먹을 때 조심할 내용이 ${warningCount}건 있어요.`:'같은 성분이 들어 있는 약이 있어요.'}</p></div></div>
    {(data.pairs||[]).map((pair,index)=><details key={index} open={index===0}><summary><strong>{pair.left.itemName}</strong><span>+</span><strong>{pair.right.itemName}</strong><em>{pair.items.length}건</em></summary><div className="interaction-detail">{pair.items.map((row,rowIndex)=><DurRecord key={rowIndex} record={row}/>)}<Link className="my-med-action" to={'/chat?medicationId='+encodeURIComponent(pair.left.medicationId)+'&compareId='+encodeURIComponent(pair.right.medicationId)}>이 조합 자세히 질문하기 →</Link></div></details>)}
    {(data.duplicates||[]).length>0&&<details><summary><strong>같은 성분이 포함된 약</strong><em>{data.duplicates.length}조합</em></summary><div className="interaction-detail">{data.duplicates.map((row,index)=><p key={index}><b>{row.left} + {row.right}</b><span>{row.ingredients.join(', ')}</span></p>)}</div></details>}
  </section>
}
