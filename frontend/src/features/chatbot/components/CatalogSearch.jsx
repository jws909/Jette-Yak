import { useState } from 'react'
const options = [['NAME','약 이름'],['INGREDIENT','성분'],['EFFICACY','효능'],['USAGE','복용법'],['COMPANY','제조사'],['CLASSIFICATION','분류'],['CODE','품목·EDI 코드'],['CATEGORY','전문·일반 구분']]
export default function CatalogSearch({ onSearch, disabled }) {
  const [kind,setKind] = useState('MEDICATIONS')
  const [field,setField] = useState('INGREDIENT')
  const [value,setValue] = useState('')
  const [type,setType] = useState(0)
  const [grade,setGrade] = useState('')
  const [age,setAge] = useState('')
  const [status,setStatus] = useState('ANY')
  return <details className="chat-catalog-search"><summary>성분 · 효능 · DUR 조건 검색</summary>
    <form onSubmit={event => { event.preventDefault(); onSearch({kind,filters:value.trim() ? [{field,value:value.trim()}] : [],tabooType:type,grade:type===1?grade:'',ageBase:type===3?age.trim():'',status:kind==='MEDICATIONS'?status:'ANY'}) }}>
      <fieldset disabled={disabled}><label>조회 대상<select value={kind} onChange={event => {setKind(event.target.value);setField('INGREDIENT')}}><option value="MEDICATIONS">의약품 목록</option><option value="DUR">DUR 성분·금기 원문</option></select></label>
      <label>검색 항목<select value={field} onChange={event => setField(event.target.value)}>{(kind==='DUR'?[['INGREDIENT','성분'],['EFFECT','금기 설명']]:options).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>검색어<input value={value} maxLength={100} onChange={event=>setValue(event.target.value)} placeholder="비워두면 전체 조회" /></label>
      <label>DUR 조건<select value={type} onChange={event=>setType(Number(event.target.value))}><option value={0}>전체</option><option value={1}>임부금기</option><option value={2}>노인금기</option><option value={3}>특정연령대금기</option><option value={4}>병용금기</option></select></label>
      {type===1 && <label>임부 등급<select value={grade} onChange={event=>setGrade(event.target.value)}><option value="">전체 등급</option>{['1등급','2등급','M등급'].map(g=><option key={g}>{g}</option>)}</select></label>}
      {type===3 && <label>연령 기준 문구<input value={age} maxLength={20} onChange={event=>setAge(event.target.value)} placeholder="예: 12세 미만" /></label>}
      {kind==='MEDICATIONS' && <label>저장된 허가 상태<select value={status} onChange={event=>setStatus(event.target.value)}><option value="ANY">전체</option><option value="ACTIVE">정상으로 분류</option><option value="DISCONTINUED">중단·취소로 분류</option></select></label>}
      <button type="submit" className="load-more">조건으로 조회</button></fieldset>
    </form></details>
}
