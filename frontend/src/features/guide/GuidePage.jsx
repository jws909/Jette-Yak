import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import './GuidePage.css'
import DurInformation from './DurInformation'
import RegisteredMedications from './RegisteredMedications'
import { groupMedications } from './medicationGroups'

function useRemote(url) {
  const [retry, setRetry] = useState(0)
  const [result, setResult] = useState(null)
  const key = url + ':' + retry
  useEffect(() => {
    if (!url) return
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 20000)
    let active = true
    async function load() {
      try {
        const response = await fetch(url, { signal: controller.signal })
        if (!(response.headers.get('content-type') || '').includes('application/json'))
          throw new Error('약 정보 API에 연결할 수 없습니다. 서버 배포 상태를 확인해주세요.')
        const data = await response.json()
        if (!response.ok) throw Object.assign(new Error(data.error || '약 정보를 불러오지 못했습니다.'), { status: response.status })
        if (active) setResult({ key, data })
      } catch (error) {
        if (active) setResult({ key, status: error.status, error: error.name === 'AbortError' ? '요청 시간이 초과됐습니다. 다시 시도해주세요.' : error.message })
      } finally { clearTimeout(timer) }
    }
    load()
    return () => { active = false; clearTimeout(timer); controller.abort() }
  }, [url, key])
  return {
    loading: Boolean(url) && result?.key !== key,
    data: url && result?.key === key ? result.data : null,
    error: url && result?.key === key ? result.error : null,
    status: url && result?.key === key ? result.status : null,
    retry: () => setRetry(value => value + 1),
  }
}

function valueOrMissing(value) { return value?.trim() || '등록된 정보가 없습니다.' }


function MedicationInformation({ item, compact, onSelect }) {
  const guide = useRemote(item.medicationId ? '/api/guides/medications/' + encodeURIComponent(item.medicationId) : null)
  const medication = guide.data?.medication
  if (compact) return <article className="my-med-row">
    <div className="my-med-row-name"><button className="my-med-name" onClick={onSelect}>{item.itemName}</button>
      <p className="guide-note">{item.entpName}</p><RegisteredMedications items={item.registrations} /></div>
    <div className="my-med-row-description">
      {guide.loading && <p role="status">약 정보를 불러오고 있어요…</p>}
      {guide.error && <p role="alert">{guide.error} <button className="my-med-action" onClick={guide.retry}>다시 시도</button></p>}
      {!item.medicationId && <p className="guide-note">제품이 연결되지 않아 등록한 복용 정보만 표시합니다.</p>}
      {medication && <><h3>효능 · 효과</h3><p className="guide-db-text">{valueOrMissing(medication.efficacy)}</p>
        <h3>용법 · 용량</h3><p className="guide-db-text">{valueOrMissing(medication.usageDosage)}</p>
        <p className="guide-note">{guide.data.dur?.items?.length ? '연결된 DUR 주의정보 ' + guide.data.dur.items.length + '건 · 상세 탭에서 확인하세요.' : '연결된 DUR 기록이 없습니다. 금기가 없다는 뜻은 아닙니다.'}</p></>}
    </div><button className="my-med-action" onClick={onSelect}>상세 보기 →</button>
  </article>
  return <>
    <section className="my-med-registration"><h2>{item.itemName}</h2><RegisteredMedications items={item.registrations} /></section>
    {!item.medicationId && <p className="guide-empty">제품이 연결되지 않아 상세 약 정보를 표시할 수 없습니다. 등록한 복용 정보는 위에서 확인할 수 있어요.</p>}
    {guide.loading && <p role="status">약 정보를 불러오고 있어요…</p>}
    {guide.error && <p role="alert">{guide.error} <button className="my-med-action" onClick={guide.retry}>다시 시도</button></p>}
    {medication && <>
      <div className="guide-detail-card">
        <aside className="guide-med-intro"><span className="meta-kicker">GUIDE FOR</span>
          <h2 className="intro-med-name">{medication.itemName}</h2>
          <span className="intro-tag rx">{medication.etcOtcCode || '구분 정보 없음'}</span>
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
  const registered = useRemote('/api/guides/my-medications')
  const [selectedKey, setSelectedKey] = useState('all')
  const items = groupMedications(registered.data?.items || [])
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
        <button className="my-med-action" disabled={registered.loading} onClick={registered.retry}>목록 새로고침</button></div>
    </header>
    <div className="my-med-tabs" role="tablist" aria-label="내 약 선택">{tabs.map((item, index) =>
      <button key={item.key} id={'med-tab-' + index} type="button" role="tab" aria-selected={activeKey === item.key}
        aria-controls="my-med-panel" tabIndex={activeKey === item.key ? 0 : -1}
        className={'med-pill-tab' + (activeKey === item.key ? ' active' : '')}
        onClick={() => setSelectedKey(item.key)} onKeyDown={event => tabKeyDown(event, index)}>{item.itemName}</button>)}</div>
    <section id="my-med-panel" role="tabpanel" aria-labelledby={'med-tab-' + tabs.findIndex(item => item.key === activeKey)} tabIndex={0}>
      {registered.loading && <p role="status">등록한 약을 불러오고 있어요…</p>}
      {registered.error && (registered.status === 401 ? <p className="guide-empty">로그인하면 내 등록 약을 볼 수 있어요. <Link to="/login">로그인</Link></p>
        : <p role="alert">{registered.error}</p>)}
      {registered.data && !items.length && <p className="guide-empty">현재 처방 기간에 해당하는 약이나 직접 등록한 약이 없습니다.</p>}
      {registered.data && items.length > 0 && (selected ? <MedicationInformation key={selected.key} item={selected} />
        : <><div className="my-med-overview-heading"><h2>전체 약 <span>{items.length}개</span></h2>
          <p className="guide-note">현재 처방약과 직접 등록한 약입니다. 상비약 등록은 실제 복용을 의미하지 않습니다.</p></div>
          <div className="my-med-overview">{items.map(item => <MedicationInformation key={item.key} item={item} compact onSelect={() => setSelectedKey(item.key)} />)}</div></>)}
    </section>
  </div>
}
