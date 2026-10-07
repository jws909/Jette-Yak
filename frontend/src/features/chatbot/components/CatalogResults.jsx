/**
 * 역할: 구조화된 의약품·DUR 검색 결과를 카드와 근거 목록으로 표시
 * 표시 기준: 값이 있는 필드와 실제로 연결된 주의 기록만 출력
 */
import { formatDateTime24 } from '../../../utils/dateTime.js'

const types={1:'임신 중 복용 주의',2:'어르신 복용 주의',3:'나이에 따라 조심할 점',4:'함께 먹으면 안 되는 성분'}
const fields=[['materialName','성분'],['efficacy','효능·효과'],['usageDosage','복용 방법'],['className','분류'],['etcOtcCode','전문·일반'],['ediCode','보험 코드'],['updatedAt','자료 수정일']]
const hasValue=value=>value!==null&&value!==undefined&&String(value).trim()!==''

export function DurRecord({record}){
  if(!record)return null
  return <article className="chat-dur-record"><strong>{types[record.tabooType]||'복용 주의'}{record.ingrAName?' · '+record.ingrAName:''}{Number(record.tabooType)===4&&record.ingrBName?' + '+record.ingrBName:''}</strong>
    {Number(record.tabooType)===1&&record.grade&&<p>임신 중 주의 등급: {record.grade}</p>}
    {Number(record.tabooType)===3&&record.ageBase&&<p>이 나이에 해당하면 확인하세요: {record.ageBase}</p>}
    {record.tabooEffect&&<p>{record.tabooEffect}</p>}
    {record.updatedAt&&<small>자료 수정일 {formatDateTime24(record.updatedAt)}</small>}
  </article>
}

export function DurReports({reports}){
  const visible=(reports||[]).filter(report=>report.total>0&&report.items?.length)
  if(!visible.length)return null
  return <section className="chat-dur-reports"><h4>복용 전 확인할 주의정보</h4>{visible.map((report,index)=><details key={index} open={index===0}><summary>{report.label}<span>{report.total}건</span></summary><div className="details-reveal">{report.items.map((record,itemIndex)=><DurRecord key={itemIndex} record={record}/>)}{report.total>report.items.length&&<p className="scope-note">추가 기록 {report.total-report.items.length}건이 있습니다.</p>}</div></details>)}</section>
}

export default function CatalogResults({data,onMore,onSelect,busy}){
  if(!data)return null
  return <section className="chat-catalog-results" aria-label="상세 검색 결과">
    <p className="scope-note">{data.query.filters.map(filter=>filter.value).join(' · ')||'전체'}{data.query.tabooType?' · '+types[data.query.tabooType]:''}{data.query.grade?' · '+data.query.grade:''}{data.query.ageBase?' · '+data.query.ageBase:''}</p>
    <p><strong>검색 결과 {data.total}건</strong></p>
    {!data.items.length&&<p className="chat-empty-result">일치하는 결과가 없어요. 검색어를 줄이거나 다른 표현으로 찾아보세요.</p>}
    {data.kind==='DUR'?data.items.map((record,index)=><DurRecord key={index} record={record}/>):data.items.map(item=><article key={item.itemSeq} className="chat-catalog-product">
      <strong>{item.itemName}</strong>{item.entpName&&<p>{item.entpName}</p>}
      <button type="button" className="load-more" disabled={busy} onClick={()=>onSelect(item)}>이 약으로 질문하기</button>
      {fields.some(([key])=>hasValue(item[key]))&&<details><summary>상세 정보 보기</summary><dl className="details-reveal">{fields.filter(([key])=>hasValue(item[key])).map(([key,label])=><div key={key}><dt>{label}</dt><dd>{key==='updatedAt'?formatDateTime24(item[key]):item[key]}</dd></div>)}</dl></details>}
      {item.durEvidence?.length>0&&<div className="catalog-warning-list">{item.durEvidence.map((record,index)=><DurRecord key={index} record={record}/>)}</div>}
    </article>)}
    {data.hasMore&&<button type="button" className="load-more" disabled={busy} onClick={onMore}>결과 더 보기 ({data.items.length}/{data.total})</button>}
  </section>
}
