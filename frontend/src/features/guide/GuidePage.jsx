/**
 * 역할: 로그인 사용자의 등록 약을 상태별·제품별 탭으로 표시
 * 요청 흐름: 목록, 약 상세, DUR 비교, AI 통합 요약을 독립적으로 조회해 부분 오류 격리
 */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import './GuidePage.css'
import DurInformation from './DurInformation'
import RegisteredMedications from './RegisteredMedications'
import useRemote from './useRemote'
import InteractionSummary from './InteractionSummary'
import { hasInteractionWarnings } from './interactionWarnings'
import OverallAiGuideCard from './OverallAiGuideCard'
import MedicationImage from './MedicationImage'
import { groupMedications } from './medicationGroups'
import UiDialog from '../../components/ui/UiDialog'

function present(value){return typeof value==='string'&&value.trim()?value.trim():null}

async function readJsonResponse(response) {
  // 톰캣 오류 HTML을 JSON으로 읽어 SyntaxError를 노출하지 않고 사용자가 이해할 메시지로 바꾼다.
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    throw new Error('서버 응답을 확인하지 못했습니다. 잠시 후 다시 시도해주세요.')
  }
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || '상태 저장에 실패했습니다.')
  return data
}

function MedicationInformation({ item, compact, onSelect, onStatus, busy }) {
  // 전체 약 탭(compact)과 제품별 상세 탭이 같은 서버 자료를 사용하도록 표시 로직을 공유한다.
  // medicationId가 없는 등록 행은 복용 상태만 표시하고 공식 제품 정보 요청은 보내지 않는다.
  const guide = useRemote(item.medicationId ? '/api/guides/medications/' + encodeURIComponent(item.medicationId) : null)
  const medication = guide.data?.medication
  const aiSummary = (() => {
    if (!medication?.aiSummaryJson) return null;
    try {
      return typeof medication.aiSummaryJson === 'string' ? JSON.parse(medication.aiSummaryJson) : medication.aiSummaryJson;
    } catch {
      return { summary: medication.aiSummaryJson };
    }
  })();
  const efficacy=present(medication?.efficacy)
  const usage=present(medication?.usageDosage)
  const manufacturer=present(medication?.entpName)
  const ingredient=present(medication?.materialName)
  const hasLifestyle=Boolean(aiSummary?.warnings||aiSummary?.foodCautions||aiSummary?.tips)
  const hasDur=Boolean(guide.data?.dur?.items?.length)
  const detailColumnCount=Math.max(1,Number(Boolean(efficacy||usage||aiSummary?.summary))+Number(hasLifestyle)+Number(hasDur))

  if (compact) return <article className="my-med-row">
    <div className="my-med-row-name"><button className="my-med-name" onClick={onSelect}>{item.itemName}</button>
      <MedicationImage url={item.itemImageUrl} name={item.itemName}/>{item.entpName&&<p className="guide-note">{item.entpName}</p>}<RegisteredMedications items={item.registrations} onStatus={onStatus} busy={busy} /></div>
    <div className="my-med-row-description">{item.medicationId && <Link className="my-med-action" to={'/chat?medicationId='+encodeURIComponent(item.medicationId)}>이 약 질문하기 →</Link>}
      {guide.loading && <p role="status">약 정보를 불러오고 있어요…</p>}
      {guide.error && <p role="alert">{guide.error} <button className="my-med-action" onClick={guide.retry}>다시 시도</button></p>}
      {aiSummary?.summary && <div className="guide-ai-summary-compact"><strong>AI 핵심 요약:</strong> {aiSummary.summary}</div>}
      {efficacy&&<><h3>효능 · 효과</h3><p className="guide-db-text">{efficacy}</p></>}
      {usage&&<><h3>복용 방법</h3><p className="guide-db-text">{usage}</p></>}
      {hasDur&&<p className="my-med-warning-link">복용 주의정보 {guide.data.dur.items.length}건 · 상세 보기에서 확인</p>}
    </div><button className="my-med-action" onClick={onSelect}>상세 보기 →</button>
  </article>
  return <>
    <section className="my-med-registration"><h2>{item.itemName}</h2><RegisteredMedications items={item.registrations} onStatus={onStatus} busy={busy} /></section>
    {guide.loading && <p role="status">약 정보를 불러오고 있어요…</p>}
    {guide.error && <p role="alert">{guide.error} <button className="my-med-action" onClick={guide.retry}>다시 시도</button></p>}
    {medication && <>
      <div className="guide-detail-card" style={{'--detail-columns':detailColumnCount}}>
        <aside className="guide-med-intro"><span className="meta-kicker">GUIDE FOR</span>
          <h2 className="intro-med-name">{medication.itemName}</h2>
          <MedicationImage url={medication.itemImageUrl} name={medication.itemName}/><Link className="my-med-action" to={'/chat?medicationId='+encodeURIComponent(item.medicationId)}>이 약 질문하기 →</Link>{medication.etcOtcCode&&<span className="intro-tag rx">{medication.etcOtcCode}</span>}
          {manufacturer&&<p className="guide-note">{manufacturer}</p>}
          {ingredient&&<><strong>성분</strong><p className="guide-db-text">{ingredient}</p></>}
        </aside>
        {(efficacy||usage||aiSummary?.summary)&&<section className="guide-col"><span className="col-num">01</span><h3 className="col-title">효능 · 복용법</h3>
          {aiSummary?.summary && (
            <div className="guide-ai-card">
              <span className="ai-tag">AI 핵심 요약</span>
              <p className="ai-summary-text">{aiSummary.summary}</p>
            </div>
          )}
          {efficacy&&<><strong>효능·효과</strong><p className="guide-db-text">{efficacy}</p></>}
          {usage&&<><strong>복용 방법</strong><p className="guide-db-text">{usage}</p></>}
        </section>}
        {hasLifestyle&&<section className="guide-col"><span className="col-num">02</span><h3 className="col-title">생활 속 주의사항</h3>
            <div className="guide-ai-precautions">
              {aiSummary.warnings && <><strong>주의사항</strong><p className="guide-db-text">{aiSummary.warnings}</p></>}
              {aiSummary.foodCautions && <><strong>음식 및 생활 주의</strong><p className="guide-db-text">{aiSummary.foodCautions}</p></>}
              {aiSummary.tips && <><strong>복약 꿀팁</strong><p className="guide-db-text">{aiSummary.tips}</p></>}
            </div>
        </section>}
        {hasDur&&<section className="guide-col guide-warning-col"><span className="col-num">!</span><h3 className="col-title">복용 전 확인하세요</h3>
          <DurInformation dur={guide.data.dur} />
        </section>}
      </div>
      {guide.data.source&&<p className="guide-note">자료: {guide.data.source}</p>}

    </>}
  </>
}

export default function GuidePage() {
  // revision이 증가하면 목록·DUR 비교·AI 통합 가이드가 같은 시점의 데이터로 다시 조회된다.
  const [revision, setRevision] = useState(0)
  const registered = useRemote('/api/guides/collection', revision)
  // 목록이 먼저 준비된 뒤 비교를 요청해 로그인 오류나 초기 로딩 중 중복 요청을 줄인다.
  const comparison = useRemote(registered.data ? '/api/guides/collection/dur' : null, revision)
  const [scope, setScope] = useState('CURRENT')
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [saveTone, setSaveTone] = useState('success')
  const [warningOpen,setWarningOpen]=useState(false)
  const shownWarning=useRef('')
  const warningSection=useRef(null)
  const rows = registered.data?.items || []
  const scopes = [['CURRENT','전체 약'],['ACTIVE','복용 중'],['STORED','보관 중'],['PAUSED','복용 안 함'],['ENDED','종료된 기록']]
  const filtered = rows.filter(row => scope === 'CURRENT' ? row.useStatus !== 'ENDED' : row.useStatus === scope)
  const interactionWarning=hasInteractionWarnings(comparison.data)
  useEffect(()=>{
    if(!interactionWarning)return
    const signature=JSON.stringify((comparison.data.pairs||[]).map(pair=>[pair.left?.medicationId,pair.right?.medicationId,pair.items?.length]).concat((comparison.data.duplicates||[]).map(row=>[row.left,row.right])))
    if(signature&&shownWarning.current!==signature){shownWarning.current=signature;setWarningOpen(true)}
  },[comparison.data,interactionWarning])
  async function updateStatus(id,status) {
    // registrationId에는 처방약과 직접 추가 약을 구분하는 접두사가 포함된다.
    // 프런트에서 분해하지 않고 서버에 그대로 보내 소유권 확인과 실제 테이블 갱신을 맡긴다.
    setSaving(true);setSaveMessage('');setSaveTone('success')
    try {
      const response = await fetch('/api/guides/collection/'+encodeURIComponent(id), {
        method:'PATCH', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify({status}),
      })
      await readJsonResponse(response)
      setSaveMessage('복용 상태를 저장했습니다.');setRevision(value=>value+1)
    } catch(error) { setSaveTone('error');setSaveMessage(error.message) } finally {setSaving(false)}
  }
  const [selectedKey, setSelectedKey] = useState('all')
  // 같은 제품이 처방전과 직접 추가 목록에 여러 번 있어도 제품 탭은 하나만 만들고 등록 내역은 묶어서 보여준다.
  const items = groupMedications(filtered)
  const hasRegistrations = rows.length > 0
  const selected = items.find(item => item.key === selectedKey)
  const activeKey = selected?.key || 'all'
  const tabs = [{ key: 'all', itemName: '전체 약' }, ...items]
  function tabKeyDown(event, index) {
    // WAI-ARIA 탭 키보드 규칙에 맞춰 방향키와 Home/End로 탭을 이동한다.
    let next
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
    if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = tabs.length - 1
    if (next === undefined) return
    event.preventDefault()
    setSelectedKey(tabs[next].key)
    event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next].focus()
  }
  return <div className="guide-page-wrapper">
    <header className="guide-page-header"><div><span className="section-meta-tag">MY MEDICATIONS</span>
      <h1 className="section-title">내 약 관리</h1><p className="guide-note">등록한 약을 한눈에 확인하고, 약별 복용 정보와 주의사항을 살펴보세요.</p></div>
      <div className="my-med-header-actions"><Link className="my-med-register-action" to="/medication/register">새 약 등록하기 →</Link>
        <Link to="/chat">약 검색 · 질문은 챗봇에서 →</Link>
        <button className="my-med-action" disabled={registered.loading} onClick={()=>{registered.retry();setRevision(value=>value+1)}}>목록 새로고침</button></div>
    </header>
    {registered.data && <>
      <p className="guide-note">등록한 약은 기본적으로 복용 중으로 표시됩니다. 보관만 하거나 복용을 마친 약은 상태를 변경해주세요.</p>
      <div className="my-med-filters" aria-label="복용 상태 필터">{scopes.map(([value,label])=><button className="my-med-action" aria-pressed={scope===value} key={value} onClick={()=>{setScope(value);setSelectedKey('all')}}>{label} ({rows.filter(row=>value==='CURRENT'?row.useStatus!=='ENDED':row.useStatus===value).length})</button>)}</div>
      {saveMessage && <p className={'guide-feedback '+saveTone} role={saveTone==='error'?'alert':'status'}>{saveMessage}</p>}
      {comparison.loading && <div className="guide-loading" role="status"><span aria-hidden="true"/>복용 중인 약을 함께 먹을 때 주의할 점을 확인하고 있어요…</div>}
      {comparison.error && <p className="guide-feedback error" role="alert"><span>{comparison.error}</span><button className="my-med-action" onClick={comparison.retry}>비교 다시 시도</button></p>}
      <OverallAiGuideCard revision={revision} />
      {interactionWarning&&<div ref={warningSection}><InteractionSummary data={comparison.data}/></div>}
    </>}
    <div className="my-med-tabs" role="tablist" aria-label="내 약 선택">{tabs.map((item, index) =>
      <button key={item.key} id={'med-tab-' + index} type="button" role="tab" aria-selected={activeKey === item.key}
        aria-controls="my-med-panel" tabIndex={activeKey === item.key ? 0 : -1}
        className={'med-pill-tab' + (activeKey === item.key ? ' active' : '')}
        onClick={() => setSelectedKey(item.key)} onKeyDown={event => tabKeyDown(event, index)}>{item.itemName}</button>)}</div>
    <section key={activeKey} id="my-med-panel" className="my-med-panel" role="tabpanel" aria-labelledby={'med-tab-' + tabs.findIndex(item => item.key === activeKey)} tabIndex={0}>
      {registered.loading && <p role="status">등록한 약을 불러오고 있어요…</p>}
      {registered.error && (registered.status === 401 ? <p className="guide-empty">로그인하면 내 등록 약을 볼 수 있어요. <Link to="/login?next=/guide">로그인</Link></p>
        : <p className="guide-feedback error" role="alert">{registered.error}</p>)}
      {registered.data && !items.length && <p className="guide-empty">
        {hasRegistrations ? '선택한 상태의 약이 없습니다.' : '아직 등록한 약이 없습니다.'}
        {!hasRegistrations && <Link className="my-med-action" to="/medication/register"> 약 등록하기 →</Link>}
      </p>}
      {registered.data && items.length > 0 && (selected ? <MedicationInformation key={selected.key} item={selected} onStatus={updateStatus} busy={saving || registered.loading} />
        : <><div className="my-med-overview-heading"><h2>전체 약 <span>{items.length}개</span></h2>
          <p className="guide-note">등록 출처와 복용 상태를 함께 표시합니다. 제품명을 누르면 상세 정보를 볼 수 있어요.</p></div>
          <div className="my-med-overview">{items.map(item => <MedicationInformation key={item.key} item={item} onStatus={updateStatus} busy={saving || registered.loading} compact onSelect={() => setSelectedKey(item.key)} />)}</div></>)}
    </section>
    <UiDialog open={warningOpen} title="함께 복용할 때 주의할 내용이 있어요" description="현재 복용 중인 약 사이에서 확인이 필요한 성분 조합을 찾았습니다. 내용을 확인한 뒤 복용 여부가 불확실하면 의사나 약사에게 문의해주세요." confirmLabel="주의사항 확인" cancelLabel="닫기" tone="danger" onCancel={()=>setWarningOpen(false)} onConfirm={()=>{setWarningOpen(false);setTimeout(()=>warningSection.current?.scrollIntoView({behavior:'smooth',block:'center'}),80)}}>
      <div className="guide-warning-preview">{(comparison.data?.pairs||[]).slice(0,3).map((pair,index)=><p key={'pair-'+index}><strong>{pair.left.itemName}</strong><span>+</span><strong>{pair.right.itemName}</strong><em>{pair.items.length}건</em></p>)}{!(comparison.data?.pairs||[]).length&&(comparison.data?.duplicates||[]).slice(0,3).map((row,index)=><p key={'duplicate-'+index}><strong>{row.left}</strong><span>+</span><strong>{row.right}</strong><em>같은 성분</em></p>)}</div>
    </UiDialog>
  </div>
}
