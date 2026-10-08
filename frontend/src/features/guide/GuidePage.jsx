/**
 * 등록한 약을 상태별로 묶어 표시하고, 실제 복용 주의정보를 먼저 안내
 * 약별 경고와 함께 복용할 때의 경고는 한 모달에서 확인하고 해당 약 상세로 이동
 */
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import './GuidePage.css'
import DurInformation from './DurInformation'
import RegisteredMedications from './RegisteredMedications'
import useRemote from './useRemote'
import useMedicationGuides from './useMedicationGuides'
import InteractionSummary from './InteractionSummary'
import { hasInteractionWarnings } from './interactionWarnings'
import { collectMedicationWarnings, warningSignature, warningTypeLabels } from './medicationWarnings'
import OverallAiGuideCard from './OverallAiGuideCard'
import MedicationImage from './MedicationImage'
import { groupMedications } from './medicationGroups'
import UiDialog from '../../components/ui/UiDialog'
import { useReadingProfile } from '../../contexts/ReadingContext'

const scopes = [['CURRENT', '전체 약'], ['ACTIVE', '복용 중'], ['STORED', '보관 중'], ['PAUSED', '복용 안 함'], ['ENDED', '복용이 끝난 약']]
const present = value => typeof value === 'string' && value.trim() ? value.trim() : null

function summaryOf(medication) {
  if (!medication?.aiSummaryJson) return null
  try { return typeof medication.aiSummaryJson === 'string' ? JSON.parse(medication.aiSummaryJson) : medication.aiSummaryJson }
  catch { return { summary: medication.aiSummaryJson } }
}

async function readJsonResponse(response) {
  if (!(response.headers.get('content-type') || '').includes('application/json')) {
    throw new Error('저장하지 못했어요.\n잠시 후 다시 시도해주세요.')
  }
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || '상태를 저장하지 못했어요.')
  return data
}

function MedicationInformation({ item, compact, guide, onSelect, onWarning, onStatus, busy, warningRef, revision }) {
  // 전체 목록은 빠른 기본 조회 결과를 공유하고, 선택한 약만 필요할 때 AI 요약 생성
  const detailed = useRemote(!compact && item.medicationId ? '/api/guides/medications/' + encodeURIComponent(item.medicationId) : null, revision)
  const data = detailed.data || guide?.data
  const medication = data?.medication
  const aiSummary = summaryOf(medication)
  const efficacy = present(medication?.efficacy)
  const usage = present(medication?.usageDosage)
  const manufacturer = present(medication?.entpName)
  const ingredient = present(medication?.materialName)
  const hasLifestyle = Boolean(aiSummary?.warnings || aiSummary?.foodCautions || aiSummary?.tips)
  const records = data?.dur?.items || []
  const columnCount = Math.max(1, Number(Boolean(efficacy || usage || aiSummary?.summary)) + Number(hasLifestyle) + Number(records.length > 0))
  const loading = item.medicationId && !guide && !data
  const error = detailed.error || guide?.error
  const warningButton = records.length > 0 && <button type="button" className="my-med-warning-link" onClick={() => onWarning({ ...item, records })}>! 복용 전 주의사항 보기 · {records.length}건</button>

  if (compact) return <article className="my-med-row">
    <div className="my-med-row-name">
      <button className="my-med-name" onClick={onSelect}>{item.itemName}</button>
      <MedicationImage url={item.itemImageUrl} name={item.itemName} />
      {item.entpName && <p className="guide-note">{item.entpName}</p>}
      <RegisteredMedications items={item.registrations} onStatus={onStatus} busy={busy} />
    </div>
    <div className="my-med-row-description">
      {loading && <p role="status">약 정보를 불러오고 있어요…</p>}
      {error && <p className="guide-feedback error" role="alert">{error}</p>}
      {warningButton}
      {aiSummary?.summary && <div className="guide-ai-summary-compact"><strong>AI가 정리한 설명</strong><p>{aiSummary.summary}</p></div>}
      {efficacy && <><h3>어디에 쓰는 약인가요?</h3><p className="guide-db-text">{efficacy}</p></>}
      {usage && <><h3>어떻게 먹나요?</h3><p className="guide-db-text">{usage}</p></>}
    </div>
    <div className="my-med-row-actions"><button className="my-med-action" onClick={onSelect}>약 정보 보기 →</button>
      {item.medicationId && <Link className="my-med-action" to={'/chat?medicationId=' + encodeURIComponent(item.medicationId)}>이 약 물어보기 →</Link>}
    </div>
  </article>

  return <>
    <section className="my-med-registration"><h2>{item.itemName}</h2><RegisteredMedications items={item.registrations} onStatus={onStatus} busy={busy} />{warningButton}</section>
    {loading && <p role="status">약 정보를 불러오고 있어요…</p>}
    {detailed.loading && medication && <p className="guide-note" role="status">{'약 설명을 정리하고 있어요.\n아래 복용 주의사항은 먼저 확인할 수 있어요.'}</p>}
    {error && <p className="guide-feedback error" role="alert">{error}<button className="my-med-action" onClick={detailed.retry}>다시 시도</button></p>}
    {medication && <>
      <div className="guide-detail-card" style={{ '--detail-columns': columnCount }}>
        <aside className="guide-med-intro"><span className="meta-kicker">선택한 약</span>
          <h2 className="intro-med-name">{medication.itemName}</h2><MedicationImage url={medication.itemImageUrl} name={medication.itemName} />
          <Link className="my-med-action" to={'/chat?medicationId=' + encodeURIComponent(item.medicationId)}>이 약 물어보기 →</Link>
          {medication.etcOtcCode && <span className="intro-tag rx">{medication.etcOtcCode}</span>}
          {manufacturer && <p className="guide-note">{manufacturer}</p>}
          {ingredient && <><strong>들어 있는 성분</strong><p className="guide-db-text">{ingredient}</p></>}
        </aside>
        {(efficacy || usage || aiSummary?.summary) && <section className="guide-col"><h3 className="col-title">약의 쓰임과 먹는 방법</h3>
          {aiSummary?.summary && <div className="guide-ai-card"><span className="ai-tag">AI가 정리한 설명</span><p className="ai-summary-text">{aiSummary.summary}</p></div>}
          {efficacy && <><strong>어디에 쓰는 약인가요?</strong><p className="guide-db-text">{efficacy}</p></>}
          {usage && <><strong>어떻게 먹나요?</strong><p className="guide-db-text">{usage}</p></>}
        </section>}
        {hasLifestyle && <section className="guide-col"><h3 className="col-title">생활 속에서 조심할 점</h3>
          <p className="guide-note">{'AI 참고 설명이에요.\n복용량이나 복용 여부는 의사·약사와 확인해주세요.'}</p>
          <div className="guide-ai-precautions">
            {aiSummary.warnings && <><strong>조심할 점</strong><p className="guide-db-text">{aiSummary.warnings}</p></>}
            {aiSummary.foodCautions && <><strong>음식과 생활</strong><p className="guide-db-text">{aiSummary.foodCautions}</p></>}
            {aiSummary.tips && <><strong>기억하면 좋은 점</strong><p className="guide-db-text">{aiSummary.tips}</p></>}
          </div>
        </section>}
        {records.length > 0 && <section ref={warningRef} tabIndex={-1} className="guide-col guide-warning-col"><h3 className="col-title">먹기 전에 확인하세요</h3><DurInformation dur={data.dur} /></section>}
      </div>
      {data.source && <p className="guide-note">자료: {data.source}</p>}
    </>}
  </>
}

export default function GuidePage() {
  const reading = useReadingProfile()
  const [searchParams, setSearchParams] = useSearchParams()
  const [revision, setRevision] = useState(0)
  const registered = useRemote('/api/guides/collection', revision)
  const comparison = useRemote(registered.data ? '/api/guides/collection/dur' : null, revision)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [saveTone, setSaveTone] = useState('success')
  const [warningModal, setWarningModal] = useState(null)
  const shownWarnings = useRef(new Set())
  const warningSection = useRef(null)
  const medicationWarningSection = useRef(null)
  const rows = registered.data?.items || []
  const scope = scopes.some(([value]) => value === searchParams.get('scope')) ? searchParams.get('scope') : 'CURRENT'
  const filtered = rows.filter(row => scope === 'CURRENT' ? row.useStatus !== 'ENDED' : row.useStatus === scope)
  const items = groupMedications(filtered)
  const selected = items.find(item => String(item.medicationId) === searchParams.get('medicationId') || item.key === searchParams.get('registration'))
  const activeKey = selected?.key || 'all'
  const tabs = [{ key: 'all', itemName: '전체 약' }, ...items]
  const currentItems = groupMedications(rows.filter(row => row.useStatus !== 'ENDED'))
  const guides = useMedicationGuides(selected ? [...currentItems, selected] : currentItems, revision)
  // 나이에 관한 유형을 먼저 안내하되 다른 상황의 주의정보도 그대로 유지
  const priorityType = reading.isSenior ? 2 : reading.isChild ? 3 : null
  const productWarnings = collectMedicationWarnings(currentItems, guides.guides).sort((left, right) =>
    Number(right.records.some(record => Number(record.tabooType) === priorityType)) - Number(left.records.some(record => Number(record.tabooType) === priorityType)))
  const interactionWarning = hasInteractionWarnings(comparison.data)
  const signature = warningSignature(productWarnings, comparison.data)

  useEffect(() => {
    // 제품별 조회와 조합 조회가 끝난 뒤 한 번만 열어 약마다 모달이 연달아 뜨는 상황 방지
    if (!registered.data || guides.loading || comparison.loading || (!productWarnings.length && !interactionWarning)) return
    if (shownWarnings.current.has(signature)) return
    const timer = setTimeout(() => {
      shownWarnings.current.add(signature)
      setWarningModal({ products: productWarnings, comparison: comparison.data })
    }, 0)
    return () => clearTimeout(timer)
  }, [registered.data, guides.loading, comparison.loading, signature, productWarnings, comparison.data, interactionWarning])

  useEffect(() => {
    if (activeKey === 'all' || searchParams.get('section') !== 'precautions') return
    const timer = setTimeout(() => {
      const section = medicationWarningSection.current
      section?.focus({ preventScroll: true })
      section?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 80)
    return () => clearTimeout(timer)
  }, [activeKey, searchParams, guides.loading])

  function selectItem(item, precautions = false) {
    setWarningModal(null)
    const params = { scope }
    if (item?.medicationId) params.medicationId = String(item.medicationId)
    else if (item?.key !== 'all') params.registration = item.key
    if (precautions) params.section = 'precautions'
    setSearchParams(params)
  }

  async function updateStatus(id, status) {
    setSaving(true); setSaveMessage(''); setSaveTone('success')
    try {
      const response = await fetch('/api/guides/collection/' + encodeURIComponent(id), {
        method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
      })
      await readJsonResponse(response)
      setSaveMessage('약의 상태를 저장했어요.')
      setRevision(value => value + 1)
    } catch (error) { setSaveTone('error'); setSaveMessage(error.message) }
    finally { setSaving(false) }
  }

  function tabKeyDown(event, index) {
    let next
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
    if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = tabs.length - 1
    if (next === undefined) return
    event.preventDefault()
    selectItem(tabs[next])
    event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next].focus()
  }

  const modalProducts = warningModal?.products || []
  const modalComparison = warningModal?.comparison
  function confirmWarning() {
    if (modalProducts[0]) { selectItem(modalProducts[0], true); return }
    setWarningModal(null)
    setTimeout(() => warningSection.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80)
  }

  return <div className="guide-page-wrapper">
    <header className="guide-page-header"><div><h1 className="section-title">내 약 관리</h1>
      <p className="guide-note">{reading.isChild ? '내가 먹는 약을 확인해요.\n먹는 방법과 조심할 점은 보호자와 함께 읽어주세요.' : reading.isSenior ? '내가 먹는 약을 한눈에 보세요.\n약 이름을 누르면 먹는 방법과 조심할 점이 나와요.' : '등록한 약을 확인하세요.\n약마다 먹는 방법과 조심할 점을 살펴보세요.'}</p></div>
      <div className="my-med-header-actions"><Link className="my-med-register-action" to="/medication/register">새 약 등록하기 →</Link><Link to="/chat">약 정보 물어보기 →</Link>
        <button className="my-med-action" disabled={registered.loading || guides.loading} onClick={() => setRevision(value => value + 1)}>목록 새로고침</button></div>
    </header>
    {registered.data && <>
      {/* 안내는 문장 단위로 나누고, 약의 효능·복용법 원문은 그대로 표시 */}
      <p className="guide-note">{'상비약은 ‘보관 중’으로 표시돼요.\n처방약과 상시약·영양제는 아래 ‘현재 상태’에서 복용 상태를 바꿀 수 있어요.'}</p>
      <div className="my-med-filters" aria-label="약 상태 선택">{scopes.map(([value, label]) => <button className="my-med-action" aria-pressed={scope === value} key={value} onClick={() => setSearchParams({ scope: value })}>{label} ({rows.filter(row => value === 'CURRENT' ? row.useStatus !== 'ENDED' : row.useStatus === value).length})</button>)}</div>
      {saveMessage && <p className={'guide-feedback ' + saveTone} role={saveTone === 'error' ? 'alert' : 'status'}>{saveMessage}</p>}
      {(comparison.loading || guides.loading) && <div className="guide-loading" role="status"><span aria-hidden="true" />약 정보를 불러오고, 먹기 전에 조심할 점을 확인하고 있어요…</div>}
      {comparison.error && <p className="guide-feedback error" role="alert"><span>{comparison.error}</span><button className="my-med-action" onClick={comparison.retry}>다시 확인하기</button></p>}
      {Object.values(guides.guides).some(result => result.error) && <p className="guide-feedback error" role="alert"><span>일부 약 정보를 불러오지 못했어요.</span><button className="my-med-action" onClick={guides.retry}>다시 불러오기</button></p>}
      {productWarnings.length > 0 && <section className="my-med-caution-summary" aria-label="약별 복용 주의사항"><h2>이 약은 먹기 전에 확인하세요</h2>
        <p className="guide-note">{'나이, 임신 여부, 함께 먹는 약에 따라 달라질 수 있어요.\n약을 누르면 자세한 내용을 볼 수 있어요.'}</p>
        <div className="my-med-caution-list">{productWarnings.map(item => <button key={item.key} type="button" onClick={() => setWarningModal({ products: [item] })}><strong>{item.itemName}</strong><span>{warningTypeLabels(item.records).join(' · ')}</span><span className="my-med-caution-action">주의사항 확인 →</span></button>)}</div>
      </section>}
      {interactionWarning && <div ref={warningSection}><InteractionSummary data={comparison.data} /></div>}
      <OverallAiGuideCard revision={revision} />
    </>}
    <div className="my-med-tabs" role="tablist" aria-label="내 약 선택">{tabs.map((item, index) => <button key={item.key} id={'med-tab-' + index} type="button" role="tab" aria-selected={activeKey === item.key}
      aria-controls="my-med-panel" tabIndex={activeKey === item.key ? 0 : -1} className={'med-pill-tab' + (activeKey === item.key ? ' active' : '')}
      onClick={() => selectItem(item)} onKeyDown={event => tabKeyDown(event, index)}>{item.itemName}</button>)}</div>
    <section key={activeKey} id="my-med-panel" className="my-med-panel" role="tabpanel" aria-labelledby={'med-tab-' + tabs.findIndex(item => item.key === activeKey)} tabIndex={0}>
      {registered.loading && <p role="status">등록한 약을 불러오고 있어요…</p>}
      {registered.error && (registered.status === 401 ? <div className="guide-empty"><p>로그인하면 내 약을 볼 수 있어요.</p><Link className="my-med-action" to="/login?next=/guide">로그인</Link></div> : <p className="guide-feedback error" role="alert">{registered.error}</p>)}
      {registered.data && !items.length && <p className="guide-empty">{rows.length ? '선택한 상태의 약이 없어요.' : '아직 등록한 약이 없어요.'}{!rows.length && <Link className="my-med-action" to="/medication/register"> 약 등록하기 →</Link>}</p>}
      {registered.data && items.length > 0 && (selected ? <><button type="button" className="my-med-action my-med-back" onClick={() => selectItem(tabs[0])}>← 전체 약 보기</button>
        <MedicationInformation key={selected.key} item={selected} guide={guides.guides[String(selected.medicationId)]} revision={revision} warningRef={medicationWarningSection} onWarning={item => setWarningModal({ products: [item] })} onStatus={updateStatus} busy={saving || registered.loading} /></>
        : <><div className="my-med-overview-heading"><h2>전체 약 <span>{items.length}개</span></h2><p className="guide-note">약 이름을 누르면 먹는 방법과 조심할 점을 자세히 볼 수 있어요.</p></div>
          <div className="my-med-overview">{items.map(item => <MedicationInformation key={item.key} item={item} compact guide={guides.guides[String(item.medicationId)]} onSelect={() => selectItem(item)} onWarning={warning => setWarningModal({ products: [warning] })} onStatus={updateStatus} busy={saving || registered.loading} />)}</div></>)}
    </section>
    <UiDialog open={Boolean(warningModal)} title="약을 먹기 전에 확인해주세요" description={reading.isChild ? '조심해야 할 내용이 있는 약을 찾았어요.\n보호자와 함께 읽고, 약을 먹기 전에는 의사나 약사에게 물어보세요.' : '등록한 약에 복용 주의사항이 있어요.\n내 상황에 해당하는지 확인하고, 복용 여부는 의사나 약사에게 물어보세요.'}
      confirmLabel={modalProducts.length > 1 ? '첫 번째 약 자세히 보기' : modalProducts.length ? '이 약 정보 자세히 보기' : '함께 먹을 때 주의사항 보기'} cancelLabel="닫기" tone="danger" onCancel={() => setWarningModal(null)} onConfirm={confirmWarning}>
      <div className="guide-product-warning-preview">{modalProducts.map(item => <article key={item.key}><h3>{item.itemName}</h3><p>{warningTypeLabels(item.records).join(' · ')}</p>
        {modalProducts.length === 1 ? <DurInformation dur={{ items: item.records }} /> : <button type="button" className="my-med-action" onClick={() => selectItem(item, true)}>이 약 정보 보기 →</button>}
      </article>)}</div>
      {hasInteractionWarnings(modalComparison) && <div className="guide-warning-preview">{(modalComparison.pairs || []).map((pair, index) => <p key={'pair-' + index}><strong>{pair.left.itemName}</strong><span>+</span><strong>{pair.right.itemName}</strong><em>함께 먹을 때 주의</em></p>)}
        {(modalComparison.duplicates || []).map((row, index) => <p key={'duplicate-' + index}><strong>{row.left}</strong><span>+</span><strong>{row.right}</strong><em>같은 성분이 들어 있어요</em></p>)}
        {modalProducts.length > 0 && <button type="button" className="my-med-action" onClick={() => { setWarningModal(null); setTimeout(() => warningSection.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80) }}>함께 먹을 때 주의사항 자세히 보기 →</button>}</div>}
    </UiDialog>
  </div>
}
