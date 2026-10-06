/**
 * 역할: 제품 성분에 연결된 DUR 기록을 임신·고령자·연령·병용 유형별로 표시
 * 표시 기준: 조회 기록이 없는 유형은 빈 영역 없이 생략
 */
const categories=[
  {type:1,title:'임신 중 복용 주의'},
  {type:2,title:'고령자 복용 주의'},
  {type:3,title:'연령별 복용 주의'},
  {type:4,title:'함께 복용하면 안 되는 성분'},
]

export default function DurInformation({dur}){
  const items=Array.isArray(dur?.items)?dur.items:[]
  if(!items.length)return null
  return <div className="dur-information">
    <p className="dur-count">확인된 복용 주의정보 {items.length}건</p>
    {categories.map(({type,title})=>{
      const rows=items.filter(item=>Number(item.tabooType)===type)
      if(!rows.length)return null
      return <details className="dur-category" key={type} open><summary>{title}<span>{rows.length}건</span></summary><ul className="dur-records">{rows.map((item,index)=><li key={index}>
        {(item.ingrAName||item.ingrBName)&&<p className="dur-ingredient">{item.ingrAName}{type===4&&item.ingrBName?' + '+item.ingrBName:''}</p>}
        {type===1&&item.grade&&<p className="dur-meta">임부 금기 등급 {item.grade}</p>}
        {type===3&&item.ageBase&&<p className="dur-meta">기준 연령 {item.ageBase}</p>}
        {item.tabooEffect?.trim()&&<p className="guide-db-text">{item.tabooEffect.trim()}</p>}
        {item.updatedAt&&<small className="guide-note">자료 수정일 {item.updatedAt}</small>}
      </li>)}</ul></details>
    })}
  </div>
}
