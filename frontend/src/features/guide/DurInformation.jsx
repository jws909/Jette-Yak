/**
 * 역할: 제품 성분에 연결된 DUR 기록을 임신·고령자·연령·병용 유형별로 표시
 * 표시 기준: 조회 기록이 없는 유형은 빈 영역 없이 생략
 */
import { useReadingProfile } from '../../contexts/ReadingContext'

const categories=[
  {type:1,title:'임신 중 복용 주의'},
  {type:2,title:'어르신이 먹을 때 주의'},
  {type:3,title:'나이에 따라 조심할 점'},
  {type:4,title:'다른 약과 함께 먹을 때 주의'},
]

export default function DurInformation({dur}){
  const reading=useReadingProfile()
  const items=Array.isArray(dur?.items)?dur.items:[]
  if(!items.length)return null
  // 나이 관련 기록을 먼저 배치하되 다른 유형도 모두 남겨 주의정보 누락 방지
  const priority=reading.isSenior?2:reading.isChild?3:null
  const ordered=[...categories].sort((left,right)=>Number(right.type===priority)-Number(left.type===priority))
  return <div className="dur-information">
    <p className="dur-count">먹기 전에 확인할 내용 {items.length}건</p>
    <p className="guide-note">{'내 나이, 임신 여부, 함께 먹는 약을 살펴보세요.\n나에게 해당하는 주의사항인지 확인해주세요.'}</p>
    {ordered.map(({type,title})=>{
      const rows=items.filter(item=>Number(item.tabooType)===type)
      if(!rows.length)return null
      return <details className="dur-category" key={type} open><summary>{title}<span>{rows.length}건</span></summary><ul className="dur-records">{rows.map((item,index)=><li key={index}>
        {(item.ingrAName||item.ingrBName)&&<p className="dur-ingredient">{item.ingrAName}{type===4&&item.ingrBName?' + '+item.ingrBName:''}</p>}
        {type===1&&item.grade&&<p className="dur-meta">임신 중 주의 등급: {item.grade}</p>}
        {type===3&&item.ageBase&&<p className="dur-meta">이 나이에 해당하면 확인하세요: {item.ageBase}</p>}
        {item.tabooEffect?.trim()&&<p className="guide-db-text">{item.tabooEffect.trim()}</p>}
        {item.updatedAt&&<small className="guide-note">자료 수정일 {item.updatedAt}</small>}
      </li>)}</ul></details>
    })}
  </div>
}
