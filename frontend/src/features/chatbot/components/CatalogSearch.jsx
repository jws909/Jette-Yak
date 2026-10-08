/**
 * 파일 역할: 조건 검색의 종류와 값을 입력받아 구조화된 검색 요청을 상위 컴포넌트로 전달합니다.
 * 핵심 규칙: 자연어 상담 입력과 목적이 다르므로 독립된 폼 상태를 유지합니다.
 */
import { useState } from 'react'
const options = [['NAME','약 이름'],['INGREDIENT','성분'],['EFFICACY','효능'],['USAGE','복용법'],['COMPANY','제조사'],['CLASSIFICATION','분류'],['CODE','품목·EDI 코드'],['CATEGORY','전문·일반 구분']]
export default function CatalogSearch({ onSearch, disabled, embedded = false }) {
  const [kind,setKind] = useState('MEDICATIONS')
  const [field,setField] = useState('INGREDIENT')
  const [value,setValue] = useState('')
  const [type,setType] = useState(0)
  const [grade,setGrade] = useState('')
  const [age,setAge] = useState('')
  const [status,setStatus] = useState('ANY')
  const form = <form className={embedded ? 'chat-catalog-search chat-catalog-search-embedded' : undefined} onSubmit={event => { event.preventDefault(); onSearch({kind,filters:value.trim() ? [{field,value:value.trim()}] : [],tabooType:type,grade:type===1?grade:'',ageBase:type===3?age.trim():'',status:kind==='MEDICATIONS'?status:'ANY'}) }}>
      <fieldset disabled={disabled}><p className="field-help">성분, 효능 또는 복용 주의 대상을 지정해서 찾을 수 있어요.</p><label>찾을 정보<select value={kind} onChange={event => {setKind(event.target.value);setField('INGREDIENT')}}><option value="MEDICATIONS">의약품</option><option value="DUR">복용 주의정보</option></select></label>
      <label>검색 항목<select value={field} onChange={event => setField(event.target.value)}>{(kind==='DUR'?[['INGREDIENT','성분'],['EFFECT','금기 설명']]:options).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>검색어<input value={value} maxLength={100} onChange={event=>setValue(event.target.value)} placeholder="비워두면 전체 조회" /></label>
      <label>주의 대상<select value={type} onChange={event=>setType(Number(event.target.value))}><option value={0}>전체</option><option value={1}>임신 중인 사람</option><option value={2}>고령자</option><option value={3}>특정 연령</option><option value={4}>함께 먹으면 안 되는 성분</option></select></label>
      {type===1 && <label>임부 등급<select value={grade} onChange={event=>setGrade(event.target.value)}><option value="">전체 등급</option>{['1등급','2등급','M등급'].map(g=><option key={g}>{g}</option>)}</select></label>}
      {type===3 && <label>연령 기준 문구<input value={age} maxLength={20} onChange={event=>setAge(event.target.value)} placeholder="예: 12세 미만" /></label>}
      {kind==='MEDICATIONS' && <label>저장된 허가 상태<select value={status} onChange={event=>setStatus(event.target.value)}><option value="ANY">전체</option><option value="ACTIVE">정상으로 분류</option><option value="DISCONTINUED">중단·취소로 분류</option></select></label>}
      <button type="submit" className="load-more">이 조건으로 찾기</button></fieldset>
    </form>
  // 사이드 카드의 접기·펼치기 안에서는 입력 폼만 표시해 중첩된 열기 버튼 제거
  return embedded ? form : <details className="chat-catalog-search"><summary>상세 조건으로 약 찾기</summary>{form}</details>
}
