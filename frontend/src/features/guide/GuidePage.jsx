import { useState } from 'react'
import { Link } from 'react-router-dom'
import './GuidePage.css'
import DurInformation from './DurInformation'
import RegisteredMedications from './RegisteredMedications'
import useRemote from './useRemote'
import InteractionSummary from './InteractionSummary'
import MedicationImage from './MedicationImage'
import { groupMedications } from './medicationGroups'

function valueOrMissing(value) { return value?.trim() || '등록된 정보가 없습니다.' }


function MedicationInformation({ item, compact, onSelect, onStatus, busy }) {
  const guide = useRemote(item.medicationId ? '/api/guides/medications/' + encodeURIComponent(item.medicationId) : null)
  const medication = guide.data?.medication
  if (compact) return <article className="my-med-row">
    <div className="my-med-row-name"><button className="my-med-name" onClick={onSelect}>{item.itemName}</button>
      <MedicationImage url={item.itemImageUrl} name={item.itemName}/><p className="guide-note">{item.entpName || '제조사 미등록'}</p><RegisteredMedications items={item.registrations} onStatus={onStatus} busy={busy} /></div>
    <div className="my-med-row-description">{item.medicationId && <Link className="my-med-action" to={'/chat?medicationId='+encodeURIComponent(item.medicationId)}>이 약 질문하기 →</Link>}
      {guide.loading && <p role="status">약 정보를 불러오고 있어요…</p>}
      {guide.error && <p role="alert">{guide.error} <button className="my-med-action" onClick={guide.retry}>다시 시도</button></p>}
      {!item.medicationId && <p className="guide-note">제품이 연결되지 않아 등록한 복용 정보만 표시합니다.</p>}
      {medication && <><h3>효능 · 효과</h3><p className="guide-db-text">{valueOrMissing(medication.efficacy)}</p>
        <h3>용법 · 용량</h3><p className="guide-db-text">{valueOrMissing(medication.usageDosage)}</p>
        <p className="guide-note">{guide.data.dur?.items?.length ? '연결된 DUR 주의정보 ' + guide.data.dur.items.length + '건 · 상세 탭에서 확인하세요.' : '연결된 DUR 기록이 없습니다. 금기가 없다는 뜻은 아닙니다.'}</p></>}
    </div><button className="my-med-action" onClick={onSelect}>상세 보기 →</button>
  </article>
  return <>
    <section className="my-med-registration"><h2>{item.itemName}</h2><RegisteredMedications items={item.registrations} onStatus={onStatus} busy={busy} /></section>
    {!item.medicationId && <p className="guide-empty">제품이 연결되지 않아 상세 약 정보를 표시할 수 없습니다. 등록한 복용 정보는 위에서 확인할 수 있어요.</p>}
    {guide.loading && <p role="status">약 정보를 불러오고 있어요…</p>}
    {guide.error && <p role="alert">{guide.error} <button className="my-med-action" onClick={guide.retry}>다시 시도</button></p>}
    {medication && <>
      <div className="guide-detail-card">
        <aside className="guide-med-intro"><span className="meta-kicker">GUIDE FOR</span>
          <h2 className="intro-med-name">{medication.itemName}</h2>
          <MedicationImage url={medication.itemImageUrl} name={medication.itemName}/><Link className="my-med-action" to={'/chat?medicationId='+encodeURIComponent(item.medicationId)}>이 약 질문하기 →</Link><span className="intro-tag rx">{medication.etcOtcCode || '구분 정보 없음'}</span>
          <p className="guide-note">{valueOrMissing(medication.entpName)}</p>
          <strong>성분</strong><p className="guide-db-text">{valueOrMissing(medication.materialName)}</p>
        </aside>
        <section className="guide-col"><span className="col-num">01</span><h3 className="col-title">효능 · 복용법</h3>
          <strong>효능·효과</strong><p className="guide-db-text">{valueOrMissing(medication.efficacy)}</p>
          <strong>용법·용량</strong><p className="guide-db-text">{valueOrMissing(medication.usageDosage)}</p>
        </section>
        <section className="guide-col"><span className="col-num">02</span><h3 className="col-title">일상 제약 · 부작용</h3>
          <p className="guide-db-text">현재 연결된 자료에는 일상 활동 주의사항과 부작용·대처 정보가 없습니다.</p>
          <div className="side-effect-alert-box">정보가 없다는 것이 주의사항이나 부작용이 없다는 뜻은 아닙니다.</div>
        </section>
        <section className="guide-col"><span className="col-num">03</span><h3 className="col-title">DUR 주의정보</h3>
          <DurInformation dur={guide.data.dur} />
        </section>
      </div>
      <p className="guide-note">자료: {guide.data.source} · 개인의 전체 복약 내역을 반영한 가이드는 아닙니다.</p>

    </>}
  </>
}

export default function GuidePage() {
  const [revision, setRevision] = useState(0)
  const registered = useRemote('/api/guides/collection', revision)
  const comparison = useRemote(registered.data ? '/api/guides/collection/dur' : null, revision)
  const [scope, setScope] = useState('CURRENT')
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const rows = registered.data?.items || []
  const scopes = [['CURRENT','전체 약'],['ACTIVE','복용 중'],['STORED','보관 중'],['UNCONFIRMED','확인 필요'],['PAUSED','복용 안 함'],['ENDED','종료된 기록']]
  const filtered = rows.filter(row => scope === 'CURRENT' ? row.useStatus !== 'ENDED' : row.useStatus === scope)
  async function updateStatus(id,status) {
    setSaving(true);setSaveMessage('')
    try {
      const response = await fetch('/api/guides/collection/'+encodeURIComponent(id), {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})})
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '상태 저장에 실패했습니다.')
      setSaveMessage('상태를 저장했습니다.');setRevision(value=>value+1)
    } catch(error) { setSaveMessage(error.message) } finally {setSaving(false)}
  }
  const [selectedKey, setSelectedKey] = useState('all')
  const items = groupMedications(filtered)
  const selected = items.find(item => item.key === selectedKey)
  const activeKey = selected?.key || 'all'
  const tabs = [{ key: 'all', itemName: '전체 약' }, ...items]
  function tabKeyDown(event, index) {
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
      <div className="my-med-header-actions"><Link to="/chat">약 검색 · 질문은 챗봇에서 →</Link>
        <button className="my-med-action" disabled={registered.loading} onClick={()=>{registered.retry();setRevision(value=>value+1)}}>목록 새로고침</button></div>
    </header>
    {registered.data && <>
      <p className="guide-note">실제 복용 중인 약을 확인해주세요. 이 상태는 기록 관리용이며 처방·복용법을 변경하지 않습니다.</p>
      <div className="my-med-filters" aria-label="복용 상태 필터">{scopes.map(([value,label])=><button className="my-med-action" aria-pressed={scope===value} key={value} onClick={()=>{setScope(value);setSelectedKey('all')}}>{label} ({rows.filter(row=>value==='CURRENT'?row.useStatus!=='ENDED':row.useStatus===value).length})</button>)}</div>
      {saveMessage && <p role="status">{saveMessage}</p>}
      {comparison.loading && <p role="status">복용 중인 약의 DUR을 비교하고 있어요…</p>}
      {comparison.error && <p role="alert">{comparison.error} <button className="my-med-action" onClick={comparison.retry}>비교 다시 시도</button></p>}
      <InteractionSummary data={comparison.data}/>
    </>}
    <div className="my-med-tabs" role="tablist" aria-label="내 약 선택">{tabs.map((item, index) =>
      <button key={item.key} id={'med-tab-' + index} type="button" role="tab" aria-selected={activeKey === item.key}
        aria-controls="my-med-panel" tabIndex={activeKey === item.key ? 0 : -1}
        className={'med-pill-tab' + (activeKey === item.key ? ' active' : '')}
        onClick={() => setSelectedKey(item.key)} onKeyDown={event => tabKeyDown(event, index)}>{item.itemName}</button>)}</div>
    <section id="my-med-panel" role="tabpanel" aria-labelledby={'med-tab-' + tabs.findIndex(item => item.key === activeKey)} tabIndex={0}>
      {registered.loading && <p role="status">등록한 약을 불러오고 있어요…</p>}
      {registered.error && (registered.status === 401 ? <p className="guide-empty">로그인하면 내 등록 약을 볼 수 있어요. <Link to="/login?next=/guide">로그인</Link></p>
        : <p role="alert">{registered.error}</p>)}
      {registered.data && !items.length && <p className="guide-empty">선택한 상태의 약이 없습니다. <Link className="my-med-action" to="/?register=prescription">처방전 등록하기 →</Link></p>}
      {registered.data && items.length > 0 && (selected ? <MedicationInformation key={selected.key} item={selected} onStatus={updateStatus} busy={saving || registered.loading} />
        : <><div className="my-med-overview-heading"><h2>전체 약 <span>{items.length}개</span></h2>
          <p className="guide-note">등록 출처와 복용 상태를 함께 표시합니다. 제품명을 누르면 상세 정보를 볼 수 있어요.</p></div>
          <div className="my-med-overview">{items.map(item => <MedicationInformation key={item.key} item={item} onStatus={updateStatus} busy={saving || registered.loading} compact onSelect={() => setSelectedKey(item.key)} />)}</div></>)}
    </section>
  </div>
}
