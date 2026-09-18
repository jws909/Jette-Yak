import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import './GuidePage.css'
import DurInformation from './DurInformation'
import RegisteredMedications from './RegisteredMedications'

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
          throw new Error('생활가이드 API에 연결할 수 없습니다. 서버 배포 상태를 확인해주세요.')
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

export default function GuidePage() {
  const [params, setParams] = useSearchParams()
  const selectedId = params.get('medicationId') || ''
  const keyword = (params.get('med') || '').trim()
  const page = Math.max(1, Math.min(100000, Number.parseInt(params.get('page'), 10) || 1))
  const [draft, setDraft] = useState(null)
  const registered = useRemote('/api/guides/my-medications')
  const medicationId = selectedId || (!keyword ? registered.data?.items.find(item => item.medicationId)?.medicationId : '') || ''
  const search = useRemote(keyword ? '/api/medications/search?' + new URLSearchParams({ q: keyword, page }) : null)
  const guide = useRemote(medicationId ? '/api/guides/medications/' + encodeURIComponent(medicationId) : null)
  const medication = guide.data?.medication
  function submit(event) {
    event.preventDefault()
    const q = (draft ?? keyword).trim()
    if (!q) return
    if (q === keyword && page === 1 && !medicationId) search.retry()
    else setParams({ med: q })
    setDraft(null)
  }
  function select(id) {
    const next = new URLSearchParams(params)
    next.set('medicationId', id)
    setParams(next)
  }
  function turnPage(nextPage) {
    const next = new URLSearchParams(params)
    next.set('page', nextPage)
    setParams(next)
  }
  return <div className="guide-page-wrapper">
    <header className="guide-page-header">
      <div><span className="section-meta-tag">PERSONAL HEALTH GUIDE</span><h1 className="section-title">맞춤 생활 가이드</h1></div>
      <form className="guide-search-form" onSubmit={submit}>
        <label htmlFor="guide-search">약 이름 검색</label>
        <div className="guide-search-input">
          <input id="guide-search" type="search" maxLength={100} value={draft ?? keyword}
            onChange={event => setDraft(event.target.value)} placeholder="텐, 텐텐처럼 일부 이름으로 검색"
            onKeyDown={event => { if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault() }} />
          <button type="submit" disabled={!(draft ?? keyword).trim()}>검색</button>
        </div>
      </form>
    </header>
    <section className="guide-registered" aria-label="내 등록 약">
      <div className="guide-registered-header"><h2>내 등록 약</h2><button onClick={registered.retry} disabled={registered.loading}>목록 새로고침</button></div>
      <p className="guide-note">현재 처방 기간에 해당하는 약과 직접 등록한 약을 보여드려요. 상비약 등록 여부는 실제 복용 여부와 다를 수 있어요.</p>
      {registered.loading && <p role="status">등록한 약을 불러오고 있어요…</p>}
      {registered.error && (registered.status === 401 ? <p className="guide-note">로그인하면 내 등록 약을 볼 수 있어요. <a href="/login">로그인</a></p>
        : <p role="alert">{registered.error}</p>)}
      {registered.data && <RegisteredMedications items={registered.data.items} selectedId={medicationId} onSelect={select}
        onSearch={name => { setParams({ med: name }); setDraft(null) }} />}
    </section>
    {search.loading && <p role="status">약을 찾고 있어요…</p>}
    {search.error && <div role="alert">{search.error} <button onClick={search.retry}>검색 다시 시도</button></div>}
    {search.data && <section aria-label="약 검색 결과">
      <p className="guide-note">검색 결과 {search.data.total}개 · 이름과 제조사를 확인하고 제품을 선택해주세요.</p>
      <div className="med-pills-row">{search.data.items.map(item => <button type="button" key={item.itemSeq}
        className={'med-pill-tab' + (item.itemSeq === medicationId ? ' active' : '')}
        aria-pressed={item.itemSeq === medicationId} onClick={() => select(item.itemSeq)}>
        <span>{item.itemName}<small className="guide-maker">{item.entpName || '업체 정보 없음'}</small></span>
      </button>)}</div>
      {search.data.total === 0 && <p>일치하는 약이 없습니다. 더 짧은 이름으로 검색해주세요.</p>}
      <div className="guide-pagination">
        {page > 1 && <button onClick={() => turnPage(page - 1)}>이전 결과</button>}
        {search.data.total > 0 && <span>{page} 페이지</span>}
        {search.data.hasMore && <button onClick={() => turnPage(page + 1)}>다음 결과</button>}
      </div>
    </section>}
    {!medicationId && !registered.loading && <div className="guide-empty">{keyword ? '검색 결과에서 확인할 약을 선택해주세요.' : '약 이름을 검색하면 등록된 약별 정보를 확인할 수 있어요.'}</div>}
    {guide.loading && <p role="status">선택한 약의 정보를 불러오고 있어요…</p>}
    {guide.error && <div role="alert">{guide.error} <button onClick={guide.retry}>다시 시도</button></div>}
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
  </div>
}
