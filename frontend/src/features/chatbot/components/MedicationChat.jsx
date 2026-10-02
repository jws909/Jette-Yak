/**
 * 파일 역할: 약 검색, 선택 약 문맥, 대화 이력, AI 상담 응답을 한 화면에서 관리하는 챗봇 컨테이너입니다.
 * 핵심 규칙: 서버가 반환한 응답 종류에 따라 상담 문장, DB 출처, 검색 결과, 후속 질문을 구분해 표시합니다.
 */
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import useRemote from '../../guide/useRemote'
import InteractionSummary from '../../guide/InteractionSummary'
import RegisteredMedications from '../../guide/RegisteredMedications'
import { activeMedicationRegistrations, groupMedications } from '../../guide/medicationGroups'
import MedicationSearch from './MedicationSearch'
import CatalogSearch from './CatalogSearch'
import CatalogResults, { DurReports } from './CatalogResults'
import UiDialog from '../../../components/ui/UiDialog'
import './MedicationChat.css'

const fields=[['itemName','제품명'],['entpName','제조사'],['materialName','성분'],['updatedAt','자료 수정일'],['className','분류'],['etcOtcCode','전문·일반'],['efficacy','효능·효과'],['usageDosage','복용 방법']]
const hasValue=value=>value!==null&&value!==undefined&&String(value).trim()!==''
const suggestions = ['어제부터 머리가 아파', '약을 먹고 두드러기가 생겼어', '이 증상으로 병원에 가야 할까?', '임산부가 먹으면 안 되는 약들이 뭐야?']

function AnswerContent({ text }) {
  const normalized=String(text||'').replace(/\*\*/g,'').trim()
  let lines=normalized.split(/\n+/).map(line=>line.trim()).filter(Boolean)
  // 모델이 줄바꿈 없이 긴 문단을 반환해도 문장 단위로 나눠 읽기 쉽게 만든다.
  if(lines.length===1&&normalized.length>110) lines=normalized.split(/(?<=[.!?])\s+/).map(line=>line.trim()).filter(Boolean)
  return <div className="answer-content">{lines.map((line,index)=>{
    const heading=line.replace(/[:：]$/,'')
    if(line.endsWith(':')||line.endsWith('：')||/^(확인한 내용|주의할 점|다음 행동|복용 방법|참고 정보)$/.test(heading))
      return <h4 key={index}>{heading}</h4>
    if(/^[-•]\s*/.test(line)) return <p className="answer-list-item" key={index}>{line.replace(/^[-•]\s*/,'')}</p>
    return <p key={index}>{line}</p>
  })}</div>
}

async function readResponse(response) {
  if (!(response.headers.get('content-type') || '').includes('application/json'))
    throw new Error('서버 응답을 읽을 수 없습니다. Spring 서버와 검색 API를 확인해주세요. (HTTP ' + response.status + ')')
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || '요청 실패: HTTP ' + response.status)
  return data
}

async function postQuestion(payload, signal) {
  const started = performance.now()
  const data = await readResponse(await fetch('/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload), signal,
  }))
  return { ...data, seconds: ((performance.now() - started) / 1000).toFixed(2) }
}
export default function MedicationChat() {
  const location = useLocation()
  return <MedicationConversation key={location.search} />
}
function MedicationConversation() {
  const params = new URLSearchParams(useLocation().search)
  const id = params.get('medicationId')
  const compareId = params.get('compareId')

  // 내 약 관리 또는 커뮤니티에서 전달한 품목코드가 있으면 해당 약을 초기 대화 대상으로 불러온다.
  // URL의 표시 이름은 신뢰하지 않고 서버가 품목코드로 조회한 제품 정보를 사용한다.
  const linked = useRemote(id ? '/api/guides/medications/'+encodeURIComponent(id) : null)
  const linkedCompare = useRemote(compareId ? '/api/guides/medications/'+encodeURIComponent(compareId) : null)
  const mine = useRemote('/api/guides/collection')
  const [selection, setSelected] = useState(undefined)
  const selected = selection === undefined ? (linked.data?.medication ? {...linked.data.medication,itemSeq:linked.data.medication.medicationId} : null) : selection
  const [otherSelection, setOther] = useState(undefined)
  const other = otherSelection === undefined ? (linkedCompare.data?.medication ? {...linkedCompare.data.medication,itemSeq:linkedCompare.data.medication.medicationId} : null) : otherSelection
  const ownProducts = groupMedications(activeMedicationRegistrations(mine.data?.items || [])).filter(item=>item.medicationId)
  const community = useRemote(selected?.itemSeq ? '/api/community/posts?medicationId='+encodeURIComponent(selected.itemSeq)+'&sort=LATEST&page=1' : null)
  const communityQuery = selected ? new URLSearchParams({medicationId:String(selected.itemSeq),medicationName:selected.itemName||''}).toString() : ''
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState([])
  const [conversationId, setConversationId] = useState(null)
  const [historyItems, setHistoryItems] = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyLoginRequired, setHistoryLoginRequired] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [paging, setPaging] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [evidenceDialog, setEvidenceDialog] = useState(null)
  // 화면 안의 메시지 구분용 ID. HTTP LAN에서도 동작하며 인증에는 사용하지 않는다.
  const messageSequence = useRef(0)
  function nextMessageId() { return 'chat-' + (++messageSequence.current) }
  const requestRef = useRef(null)
  const logRef = useRef(null)
  const inputRef = useRef(null)

  async function loadHistories() {
    setHistoryLoading(true)
    try {
      const response = await fetch('/api/chat/conversations', { headers: { Accept: 'application/json' } })
      if (response.status === 401) {
        setHistoryLoginRequired(true)
        setHistoryItems([])
        return
      }
      const data = await readResponse(response)
      setHistoryLoginRequired(false)
      setHistoryItems(Array.isArray(data.items) ? data.items : [])
    } catch (err) {
      setError(err.message)
    } finally {
      setHistoryLoading(false)
    }
  }

  // 페이지를 벗어난 뒤 늦게 도착한 응답이 화면 상태를 바꾸지 않도록 진행 중 요청을 취소한다.
  useEffect(() => () => { requestRef.current?.abort(); requestRef.current = null }, [])
  useEffect(() => {
    let active = true
    fetch('/api/chat/conversations', { headers: { Accept: 'application/json' } }).then(async response => {
      if (!active) return
      if (response.status === 401) { setHistoryLoginRequired(true); setHistoryItems([]); return }
      const data = await readResponse(response)
      if (active) { setHistoryLoginRequired(false); setHistoryItems(Array.isArray(data.items) ? data.items : []) }
    }).catch(err => { if (active) setError(err.message) }).finally(() => { if (active) setHistoryLoading(false) })
    return () => { active = false }
  }, [])
  useEffect(() => {
    const log = logRef.current
    if (!log) return
    const latest = log.querySelector('.exchange:last-of-type')
    if (loading || !latest) log.scrollTop = log.scrollHeight
    else log.scrollTop += latest.getBoundingClientRect().top - log.getBoundingClientRect().top
  }, [messages.length, loading])

  function submitOnEnter(event) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return
    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
  }

  function selectDrug(drug) {
    setSelected(drug)
    setError('')
    inputRef.current?.focus()
  }

  async function sendQuestion(text, selections = {}, choiceLabel = '', chosenDrug = null) {
    // 한 번에 하나의 상담 요청만 유지해 답변 순서가 뒤바뀌는 현상을 막는다.
    // 사용자 질문은 먼저 화면에 넣고 같은 ID의 메시지에 서버 답변을 채운다.
    text = text.trim()
    if (requestRef.current || !text || text.length > 1000) return
    const controller = new AbortController()
    requestRef.current = controller
    const timer = setTimeout(() => controller.abort(), 200000)
    const id = nextMessageId()
    setLoading(true)
    setError('')
    // 여러 검색 결과 중 고른 제품은 이 요청과 이후 대화의 기준 약으로 즉시 확정한다.
    // selections는 서버의 검색어-품목 일치 검증에, itemSeq는 현재 대화 약 갱신에 사용한다.
    if (chosenDrug) setSelected(chosenDrug)
    setMessages(previous => [...previous, {
      id, question: text, choiceLabel, selections, answer: null, sources: [], choices: [], choicePage: 1,
    }])
    try {
      // 실패한 요청과 별도 조건 검색은 자연어 대화 문맥에서 제외한다.
      // 서버 제한에 맞춰 최근 질문 4개, 완성된 대화 6개만 전송한다.
      const completed = messages.filter(message => !message.failed && message.answer !== null && !message.question.startsWith('조건 검색: '))
      const recentQuestions = completed.slice(-4).map(message => message.question)
      const conversation = completed.slice(-6).flatMap(message => [
        { role: 'user', content: message.question.slice(0, 1500) },
        { role: 'assistant', content: message.answer.slice(0, 1500) },
      ])
      const data = await postQuestion({ conversationId, itemSeq: chosenDrug?.itemSeq || selected?.itemSeq, selectionConfirmed:Boolean(chosenDrug), question: text, selections, recentQuestions, conversation }, controller.signal)
      if (typeof data.answer !== 'string' || !data.answer.trim()) throw new Error('서버 응답에 답변이 없습니다.')
      if (requestRef.current !== controller) return
      const seconds = data.seconds
      setMessages(previous => previous.map(message => message.id === id ? {
        ...message, answer: data.answer, comparison: data.comparison, registeredMedications: data.registeredMedications, loginRequired: data.loginRequired,
        sources: Array.isArray(data.sources) ? data.sources : [],
        choices: Array.isArray(data.choices) ? data.choices : [],
        choiceKeyword: data.choiceKeyword, choiceTotal: data.choiceTotal || 0,
        catalog: data.catalog, durReports: data.durReports, durNotice: data.durNotice,
        conversationMode: Boolean(data.conversationMode), urgency: data.urgency,
        aiSupplemented: Boolean(data.aiSupplemented), evidenceLimited: Boolean(data.evidenceLimited), evidenceWarning: data.evidenceWarning,
        followUpQuestions: Array.isArray(data.followUpQuestions) ? data.followUpQuestions : [], seconds,
      } : message))
      if (data.activeMedication) setSelected(data.activeMedication)
      if (data.conversationId) {
        setConversationId(Number(data.conversationId))
        loadHistories()
      }
      if(data.aiSupplemented) setEvidenceDialog(data.evidenceWarning||'우리 DB에서 확인되지 않은 내용을 AI 일반 지식으로 보완했습니다.')
      setQuestion('')
    } catch (err) {
      if (requestRef.current !== controller) return
      setError(err.name === 'AbortError' ? '응답 시간이 초과됐습니다. 잠시 후 다시 시도해주세요.' : err.message)
      setMessages(previous => previous.map(message => message.id === id ? { ...message, failed: true } : message))
    } finally {
      clearTimeout(timer)
      if (requestRef.current === controller) { requestRef.current = null; setLoading(false) }
    }
  }

  function startNewConversation() {
    // 현재 선택 약은 유지하고 대화 이력만 초기화한다.
    if (requestRef.current) return
    setMessages([])
    setConversationId(null)
    setQuestion('')
    setError('')
    inputRef.current?.focus()
  }

  async function openConversation(id) {
    if (requestRef.current || loading || paging) return
    setHistoryLoading(true); setError('')
    try {
      const data = await readResponse(await fetch('/api/chat/conversations/' + encodeURIComponent(id)))
      const restored = (Array.isArray(data.messages) ? data.messages : []).map(message => ({
        ...message,
        sources: Array.isArray(message.sources) ? message.sources : [],
        choices: Array.isArray(message.choices) ? message.choices : [],
        followUpQuestions: Array.isArray(message.followUpQuestions) ? message.followUpQuestions : [],
        choicePage: message.choicePage || 1,
      }))
      setMessages(restored)
      setConversationId(Number(data.conversation?.conversationId || id))
      const activeMedication = [...restored].reverse().find(message => message.activeMedication)?.activeMedication
      if (activeMedication) setSelected(activeMedication)
      else if (data.conversation?.medicationId) {
        const guide = await readResponse(await fetch('/api/guides/medications/' + encodeURIComponent(data.conversation.medicationId)))
        if (guide.medication) setSelected({ ...guide.medication, itemSeq: guide.medication.medicationId })
      } else setSelected(null)
      setQuestion('')
    } catch (err) { setError(err.message) }
    finally { setHistoryLoading(false) }
  }

  async function deleteConversation(id) {
    if (requestRef.current) return
    try {
      await readResponse(await fetch('/api/chat/conversations/' + encodeURIComponent(id), { method: 'DELETE' }))
      if (Number(id) === Number(conversationId)) startNewConversation()
      await loadHistories()
      setDeleteTarget(null)
    } catch (err) { setDeleteTarget(null);setError(err.message) }
  }

  async function compareProducts() {
    // 일반 상담 경로로 보내 DB 기록이 없을 때에도 AI 보완 설명과 출처 경고를 받을 수 있게 한다.
    if (!selected || !other || selected.itemSeq===other.itemSeq || requestRef.current || paging) return
    const text=`${selected.itemName}과 ${other.itemName}을 함께 먹어도 될까요?`
    await sendQuestion(text,{[selected.itemName]:selected.itemSeq,[other.itemName]:other.itemSeq},
      `${selected.itemName} · ${other.itemName}`)
  }

  async function moreChoices(message) {
    if (paging) return
    setPaging(message.id)
    setError('')
    try {
      const page = message.choicePage + 1
      const data = await readResponse(await fetch('/api/medications/search?' + new URLSearchParams({ q: message.choiceKeyword, page })))
      setMessages(previous => previous.map(entry => entry.id === message.id
        ? { ...entry, choices: [...entry.choices, ...data.items], choicePage: page, choiceTotal: data.total } : entry))
    } catch (err) { setError(err.message) }
    finally { setPaging(null) }
  }

  async function searchCatalog(query, existing = null) {
    // 조건 검색은 /api/chat/catalog를 사용하는 별도 흐름이다.
    // existing이 있으면 다음 페이지를 기존 검색 결과 뒤에 이어 붙인다.
    if (requestRef.current || paging) return
    const id = nextMessageId()
    const controller = new AbortController()
    requestRef.current = controller
    const timer = setTimeout(() => controller.abort(), 60000)
    setPaging(existing?.id || 'catalog')
    setError('')
    try {
      const started = performance.now()
      const data = await readResponse(await fetch('/api/chat/catalog', {method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({query,page:existing ? existing.catalog.page+1 : 1}),signal:controller.signal}))
      if (existing) setMessages(previous => previous.map(entry => entry.id===existing.id ? {...entry,catalog:{...data,items:[...entry.catalog.items,...data.items]}} : entry))
      else setMessages(previous => [...previous,{id,question:'조건 검색: ' + (query.filters.map(f=>f.value).join(' · ') || '전체') + (query.tabooType ? ' · ' + ({1:'임부금기',2:'노인금기',3:'특정연령대금기',4:'병용금기'})[query.tabooType] : ''),
        answer:'DB 조건 검색 결과입니다.',sources:[],choices:[],catalog:data,seconds:((performance.now()-started)/1000).toFixed(2)}])
    } catch(err) { setError(err.name==='AbortError'?'검색 시간이 초과됐습니다. 조건을 좁혀 다시 조회해주세요.':err.message) }
    finally { clearTimeout(timer); requestRef.current=null;setPaging(null) }
  }

  return <main className="chat-page">
    <header className="page-heading">
      <span className="eyebrow">JETTE-YAK / PERSONAL HEALTH GUIDE</span>
      <h1>궁금한 약 정보,<br /><em>다양하게 물어보세요.</em></h1>
      <p>불편한 증상과 복약 고민을 자연스럽게 이야기하면 필요한 내용을 함께 좁혀가요.</p>
    </header>
    <section className="chat-layout" aria-label="약 정보 AI 도우미">
      <aside className="product-panel">
        <span className="eyebrow">FIND YOUR MEDICINE</span>
        <h2>상담 도구</h2>
        <p className="panel-intro">약을 직접 찾거나, 내 복용약을 불러오고, 지난 상담을 이어갈 수 있어요.</p>
        <section className="side-tool-card side-tool-primary">
          <div className="side-tool-heading"><span>01</span><div><strong>약 선택하기</strong><small>제품을 고르면 질문의 기준이 됩니다</small></div></div>
          <MedicationSearch onSelect={selectDrug} disabled={loading || Boolean(paging)} />
        </section>
        {linked.loading && <div className="side-loading" role="status"><span aria-hidden="true"/>선택한 약을 확인하고 있어요…</div>}
        {linked.error && <p role="alert">{linked.error}</p>}
        <div className="product-note active-medication">
          <span>현재 상담 기준</span>
          {selected ? <><p><strong>{selected.itemName}</strong><br />{selected.entpName}</p>
            <button type="button" className="clear-selection" disabled={loading} onClick={() => setSelected(null)}>선택 해제</button></>
            : <p>선택한 약이 없어요.<br />검색하거나 질문에 약 이름을 적어주세요.</p>}
        </div>
        <details className="chat-personal-panel side-tool-card"><summary><span className="side-summary-number">02</span> 내 복용약으로 질문하기</summary>
          {mine.loading && <div className="side-loading" role="status"><span aria-hidden="true"/>복용약을 불러오고 있어요…</div>}
          {mine.error && (mine.status===401 ? <Link to="/login?next=/chat">로그인하고 내 약 불러오기 →</Link> : <p role="alert">{mine.error}<button onClick={mine.retry}>다시 시도</button></p>)}
          {mine.data && <>{ownProducts.length > 0 && <button type="button" className="side-action-button" disabled={loading || Boolean(paging)} onClick={()=>sendQuestion('내가 먹는 약끼리 같이 먹어도 돼?')}>내 약을 함께 먹어도 되는지 확인 <span>→</span></button>}
            {ownProducts.map(item=><button type="button" className="drug-option" key={item.key} disabled={loading || Boolean(paging)} onClick={()=>selectDrug({...item,itemSeq:item.medicationId})}>{item.itemName}</button>)}
            {!ownProducts.length && <p>현재 복용 중인 약이 없습니다. <Link to="/guide">내 약 관리 →</Link></p>}</>}
        </details>
        <section className="side-tool-card"><div className="side-tool-heading"><span>03</span><div><strong>조건으로 찾아보기</strong><small>성분·효능·주의 대상을 자세히 검색</small></div></div><CatalogSearch onSearch={searchCatalog} disabled={loading || Boolean(paging)} /></section>
        <details className="chat-history-panel side-tool-card">
          <summary><span className="side-summary-number">04</span> 지난 상담 이어보기</summary>
          {historyLoading && <div className="side-loading"><span aria-hidden="true"/>상담 기록을 불러오고 있어요…</div>}
          {historyLoginRequired && <p><Link to="/login?next=/chat">로그인하고 상담 기록 보기 →</Link></p>}
          {!historyLoading && !historyLoginRequired && historyItems.length === 0 && <p>저장된 상담 기록이 없습니다.</p>}
          <div className="chat-history-list">
            {historyItems.map(item => <div className={Number(item.conversationId) === Number(conversationId) ? 'active' : ''} key={item.conversationId}>
              <button type="button" className="chat-history-open" disabled={loading || Boolean(paging)} onClick={() => openConversation(item.conversationId)}>
                <strong>{item.title}</strong><small>{item.updatedAt} · 질문 {item.messageCount || 0}개</small>
              </button>
              <button type="button" className="chat-history-delete" aria-label={`${item.title} 대화 삭제`} onClick={() => setDeleteTarget(item)}>×</button>
            </div>)}
          </div>
        </details>
        {selected&&<section className="related-community"><div><span>이 약의 커뮤니티</span><Link to={'/community?'+communityQuery}>전체 보기 →</Link></div>{community.loading&&<p>관련 글을 찾고 있어요…</p>}{community.error&&<p>관련 글을 불러오지 못했습니다.</p>}{community.data?.items?.slice(0,3).map(post=><Link className="related-community-post" key={post.postId} to={'/community?'+communityQuery+'&postId='+post.postId}><strong>{post.title}</strong><small>{post.authorName} · 댓글 {post.commentCount||0}</small></Link>)}{community.data&&community.data.total===0&&<p>아직 이 약에 연결된 글이 없어요.</p>}</section>}
        {selected && <details className="chat-personal-panel" open={Boolean(compareId)}><summary>다른 약과 함께 먹어도 될까요?</summary>
          <select aria-label="복용 중인 약 중 비교할 약" disabled={loading || Boolean(paging)} value={other?.itemSeq || ''} onChange={event=>{const item=ownProducts.find(item=>item.medicationId===event.target.value);setOther(item?{...item,itemSeq:item.medicationId}:null)}}>
            <option value="">복용 중인 내 약에서 선택</option>{other && !ownProducts.some(item=>item.medicationId===other.itemSeq) && <option value={other.itemSeq}>{other.itemName}</option>}
            {ownProducts.filter(item=>item.medicationId!==selected.itemSeq).map(item=><option key={item.key} value={item.medicationId}>{item.itemName}</option>)}
          </select>
          <MedicationSearch onSelect={setOther} disabled={loading || Boolean(paging)} />
          {other && <p>비교 대상: {other.itemName}</p>}{linkedCompare.error && <p role="alert">{linkedCompare.error}</p>}
          <button type="button" className="load-more" disabled={!other || selected.itemSeq===other.itemSeq || loading || Boolean(paging)} onClick={compareProducts}>함께 먹을 때 주의사항 확인</button>
        </details>}
        <p className="scope-note">다른 약 이름을 질문하면 새로 찾아드려요.<br />“효능은?”처럼 이름을 생략하면 현재 선택한 약을 기준으로 안내해요.</p>
      </aside>
      <div className="conversation">
        <header className="conversation-heading"><h2>복약 상담 AI 도우미</h2><div className="conversation-heading-actions"><span>{conversationId?'이어지는 상담':'새 상담'} · 등록 정보 우선 · AI 보완</span><button type="button" onClick={startNewConversation} disabled={loading || !messages.length}>새 대화</button></div></header>
        {selected && <div className="suggestions selected-suggestions" aria-label="선택한 약 추천 질문">{['어디에 쓰는 약이야?','어떻게 먹어?','복용할 때 주의할 점은?'].map(text=><button key={text} type="button" disabled={loading || Boolean(paging)} onClick={()=>sendQuestion(text)}>{text}</button>)}</div>}
        <div className="chat-log" ref={logRef} role="log" aria-label="질문과 답변" aria-live="polite" aria-relevant="additions text">
          {messages.length === 0 && <div className="welcome"><span className="welcome-mark" aria-hidden="true">✦</span><h3>지금 어떤 도움이 필요한가요?</h3>
            <p>증상이나 복용 중 불편한 점을 편하게 말해주세요.<br />필요한 질문을 이어가며 다음 행동을 함께 정리해드려요.</p>
            <div className="suggestions">{suggestions.map(text => <button type="button" key={text} onClick={() => { setQuestion(text); inputRef.current?.focus() }}>{text} ↗</button>)}</div>
          </div>}
          {messages.map(message => <article className="exchange" key={message.id}>
            <div className="question-bubble"><span className="bubble-label">내 질문</span><p>{message.question}</p>{message.choiceLabel && <small>선택한 제품: {message.choiceLabel}</small>}</div>
            {message.answer !== null && <div className={'answer-bubble ' + (message.urgency === 'EMERGENCY' ? 'answer-emergency' : message.urgency === 'PROMPT' ? 'answer-prompt' : '')}><span className="bubble-label">✦ {message.conversationMode ? '상담 답변' : '답변 요약'}</span><AnswerContent text={message.answer}/>
              {message.followUpQuestions?.length > 0 && <section className="follow-up-questions" aria-label="추가로 필요한 정보"><strong>답변을 위해 이것만 더 알려주세요</strong><ul>{message.followUpQuestions.map(item => <li key={item}>{item}</li>)}</ul></section>}
              {(message.aiSupplemented || message.evidenceLimited) && <aside className="ai-evidence-warning" role="note"><strong>{message.aiSupplemented?'AI 참고정보가 포함됐어요':'확인 가능한 정보가 제한적이에요'}</strong><p>{message.evidenceWarning}</p></aside>}
              {message.sources.length > 0 && <p className="answer-subject">{message.sources.map(source => source.itemName).join(' · ')}</p>}
              {message.choices.length > 0 && <div className="choice-list">
                {message.choices.map(drug => <button type="button" className="drug-option" key={drug.itemSeq} disabled={loading}
                  onClick={() => sendQuestion(message.question, { ...message.selections, [message.choiceKeyword]: drug.itemSeq }, drug.itemName, drug)}>
                  <strong>{drug.itemName}</strong>{drug.entpName&&<small>{drug.entpName}</small>}
                </button>)}
                {message.choices.length < message.choiceTotal && <button type="button" className="load-more" disabled={Boolean(paging) || loading} onClick={() => moreChoices(message)}>다른 제품 더 보기 ({message.choices.length}/{message.choiceTotal})</button>}
              </div>}
              {message.loginRequired && <Link to="/login?next=/chat">로그인하기 →</Link>}
              {message.registeredMedications && <div>{groupMedications(activeMedicationRegistrations(message.registeredMedications)).map(item=><div key={item.key}><strong>{item.itemName}</strong><RegisteredMedications items={item.registrations}/>{item.medicationId && <button type="button" className="drug-option" onClick={()=>selectDrug({...item,itemSeq:item.medicationId})}>이 약 질문하기</button>}</div>)}</div>}
              <InteractionSummary data={message.comparison}/>
              {message.sources.length > 0 && <h4>답변에 참고한 약 정보</h4>}
              <CatalogResults data={message.catalog} onMore={() => searchCatalog(message.catalog.query,message)} onSelect={drug=>sendQuestion(message.question,{},drug.itemName,drug)} busy={loading || Boolean(paging)} />
              <DurReports reports={message.durReports} notice={message.durNotice} />
              {message.seconds && <small className="response-time">응답 시간 {message.seconds}초</small>}
              {message.sources.length > 0 && !message.aiSupplemented && !message.evidenceLimited && <p className="scope-note">공식 등록 자료를 참고한 답변입니다. 개인의 상태에 따른 복용 결정은 의사나 약사에게 확인해주세요.</p>}
              {message.sources.length > 0 && <details className="sources"><summary>참고한 상세 정보 보기 ({message.sources.length})</summary>
                <div className="details-reveal">{message.sources.map((source, index) => <dl key={String(source.itemSeq) + index}>{fields.filter(([field])=>hasValue(source[field])).map(([field, label]) =>
                  <div key={field}><dt>{label}</dt><dd>{String(source[field])}</dd></div>)}</dl>)}</div>
              </details>}
            </div>}
            {message.failed && <p className="failed-message">답변을 받지 못했어요. 질문을 다시 보내주세요.</p>}
          </article>)}
          {(loading || paging) && <div className="loading" role="status"><span aria-hidden="true" /><div><strong>답변을 준비하고 있어요</strong><small>대화 내용과 필요한 약 정보를 함께 확인 중입니다.</small></div></div>}
        </div>
        <form className="composer" onSubmit={event => { event.preventDefault(); sendQuestion(question) }}>
          <label htmlFor="chat-question">질문하기</label>
          <textarea id="chat-question" ref={inputRef} onKeyDown={submitOnEnter} value={question} onChange={event => setQuestion(event.target.value)} maxLength={1000} rows={3} disabled={loading || Boolean(paging)} required placeholder="예: 어제부터 머리가 아파 / 이 약 먹고 속이 불편해 / 이 증상으로 병원에 가야 할까?" />
          {error && <p className="error-message" role="alert">{error}</p>}
          <div className="composer-footer"><small>Enter 전송 · Shift+Enter 줄바꿈 · {question.length} / 1000</small><button type="submit" disabled={loading || Boolean(paging) || !question.trim()}>{loading ? '답변 작성 중…' : '질문 보내기'} ↗</button></div>
        </form>
      </div>
    </section>
    <footer className="page-footer">증상 안내는 진단을 대신하지 않습니다. 약 정보는 표시된 DB 근거를 확인하고, 응급 증상은 119 또는 응급실에 도움을 요청하세요.</footer>
    <UiDialog open={Boolean(deleteTarget)} title="상담 기록을 삭제할까요?" description={`“${deleteTarget?.title||'선택한 대화'}” 기록이 목록에서 삭제됩니다.`} confirmLabel="기록 삭제" tone="danger" busy={historyLoading} onCancel={()=>setDeleteTarget(null)} onConfirm={()=>deleteConversation(deleteTarget.conversationId)}/>
    <UiDialog open={Boolean(evidenceDialog)} title="AI 참고정보를 확인해주세요" description={evidenceDialog||''} confirmLabel="답변 확인" cancelLabel="" onCancel={()=>setEvidenceDialog(null)} onConfirm={()=>setEvidenceDialog(null)} />
  </main>
}
