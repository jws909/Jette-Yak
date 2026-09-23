import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import useRemote from '../../guide/useRemote'
import InteractionSummary from '../../guide/InteractionSummary'
import RegisteredMedications from '../../guide/RegisteredMedications'
import { groupMedications } from '../../guide/medicationGroups'
import MedicationSearch from './MedicationSearch'
import CatalogSearch from './CatalogSearch'
import CatalogResults, { DurReports } from './CatalogResults'
import './MedicationChat.css'

const fields = [
  ['itemName', '제품명'], ['entpName', '업체명'], ['materialName', '성분'],
  ['ediCode', 'EDI 코드'], ['updatedAt', '자료 수정일'], ['className', '분류'], ['etcOtcCode', '전문·일반'], ['efficacy', '효능·효과'], ['usageDosage', '용법·용량'],
]
const suggestions = ['임산부가 먹으면 안 되는 약들이 뭐야?', '아세트아미노펜 성분이 들어간 약', '나이 많은 사람이 주의해야 하는 약은?', '두통 효능이 있는 약']

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
  const linked = useRemote(id ? '/api/guides/medications/'+encodeURIComponent(id) : null)
  const linkedCompare = useRemote(compareId ? '/api/guides/medications/'+encodeURIComponent(compareId) : null)
  const mine = useRemote('/api/guides/collection')
  const [selection, setSelected] = useState(undefined)
  const selected = selection === undefined ? (linked.data?.medication ? {...linked.data.medication,itemSeq:linked.data.medication.medicationId} : null) : selection
  const [otherSelection, setOther] = useState(undefined)
  const other = otherSelection === undefined ? (linkedCompare.data?.medication ? {...linkedCompare.data.medication,itemSeq:linkedCompare.data.medication.medicationId} : null) : otherSelection
  const ownProducts = groupMedications(mine.data?.items || []).filter(item=>item.medicationId)
  const community = useRemote(selected?.itemSeq ? '/api/community/posts?medicationId='+encodeURIComponent(selected.itemSeq)+'&sort=LATEST&page=1' : null)
  const communityQuery = selected ? new URLSearchParams({medicationId:String(selected.itemSeq),medicationName:selected.itemName||''}).toString() : ''
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [paging, setPaging] = useState(null)
  // 화면 안의 메시지 구분용 ID. HTTP LAN에서도 동작하며 인증에는 사용하지 않는다.
  const messageSequence = useRef(0)
  function nextMessageId() { return 'chat-' + (++messageSequence.current) }
  const requestRef = useRef(null)
  const logRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => () => { requestRef.current?.abort(); requestRef.current = null }, [])
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

  async function sendQuestion(text, selections = {}, choiceLabel = '') {
    text = text.trim()
    if (requestRef.current || !text || text.length > 1000) return
    const controller = new AbortController()
    requestRef.current = controller
    const timer = setTimeout(() => controller.abort(), 200000)
    const id = nextMessageId()
    setLoading(true)
    setError('')
    setMessages(previous => [...previous, {
      id, question: text, choiceLabel, selections, answer: null, sources: [], choices: [], choicePage: 1,
    }])
    try {
      const recentQuestions = messages.filter(message => !message.failed && message.answer !== null && !message.question.startsWith('조건 검색: ')).slice(-4).map(message => message.question)
      const data = await postQuestion({ itemSeq: selected?.itemSeq, question: text, selections, recentQuestions }, controller.signal)
      if (typeof data.answer !== 'string' || !data.answer.trim()) throw new Error('서버 응답에 답변이 없습니다.')
      if (requestRef.current !== controller) return
      const seconds = data.seconds
      setMessages(previous => previous.map(message => message.id === id ? {
        ...message, answer: data.answer, comparison: data.comparison, registeredMedications: data.registeredMedications, loginRequired: data.loginRequired,
        sources: Array.isArray(data.sources) ? data.sources : [],
        choices: Array.isArray(data.choices) ? data.choices : [],
        choiceKeyword: data.choiceKeyword, choiceTotal: data.choiceTotal || 0,
        catalog: data.catalog, durReports: data.durReports, durNotice: data.durNotice, seconds,
      } : message))
      if (data.activeMedication) setSelected(data.activeMedication)
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

  async function compareProducts() {
    if (!selected || !other || selected.itemSeq===other.itemSeq || requestRef.current || paging) return
    const id = nextMessageId()
    const controller = new AbortController();requestRef.current=controller;setLoading(true);setError('')
    const timer=setTimeout(()=>controller.abort(),60000)
    try {
      const data=await readResponse(await fetch('/api/guides/compare',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({medicationIds:[selected.itemSeq,other.itemSeq]}),signal:controller.signal}))
      if(requestRef.current!==controller)return
      setMessages(previous=>[...previous,{id,question:selected.itemName+' + '+other.itemName+' 병용 주의정보',answer:'선택한 두 제품의 성분을 대조한 DB 조회 결과입니다.',sources:[],choices:[],comparison:data}])
    } catch(error) {if(requestRef.current===controller)setError(error.name==='AbortError'?'비교 시간이 초과됐습니다. 다시 시도해주세요.':error.message)}
    finally {clearTimeout(timer);if(requestRef.current===controller){requestRef.current=null;setLoading(false)}}
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
      <p>약 이름·성분·효능부터 임부·노인·연령·병용금기까지 DB에서 찾아드려요.</p>
    </header>
    <section className="chat-layout" aria-label="약 정보 AI 도우미">
      <aside className="product-panel">
        <span className="eyebrow">FIND YOUR MEDICINE</span>
        <h2>어떤 약이<br />궁금하세요?</h2>
        <MedicationSearch onSelect={selectDrug} disabled={loading || Boolean(paging)} />
        {linked.loading && <p role="status">선택한 약을 불러오는 중…</p>}
        {linked.error && <p role="alert">{linked.error}</p>}
        <CatalogSearch onSearch={searchCatalog} disabled={loading || Boolean(paging)} />
        <div className="product-note active-medication">
          <span>현재 대화 중인 약</span>
          {selected ? <><p><strong>{selected.itemName}</strong><br />{selected.entpName}</p>
            <button type="button" className="clear-selection" disabled={loading} onClick={() => setSelected(null)}>선택 해제</button></>
            : <p>선택한 약이 없어요.<br />검색하거나 질문에 약 이름을 적어주세요.</p>}
        </div>
        {selected&&<section className="related-community"><div><span>이 약의 커뮤니티</span><Link to={'/community?'+communityQuery}>전체 보기 →</Link></div>{community.loading&&<p>관련 글을 찾고 있어요…</p>}{community.error&&<p>관련 글을 불러오지 못했습니다.</p>}{community.data?.items?.slice(0,3).map(post=><Link className="related-community-post" key={post.postId} to={'/community?'+communityQuery+'&postId='+post.postId}><strong>{post.title}</strong><small>{post.authorName} · 댓글 {post.commentCount||0}</small></Link>)}{community.data&&community.data.total===0&&<p>아직 이 약에 연결된 글이 없어요.</p>}</section>}
        <details className="chat-personal-panel"><summary>내 약에서 선택</summary>
          {mine.loading && <p role="status">등록 약을 불러오는 중…</p>}
          {mine.error && (mine.status===401 ? <Link to="/login?next=/chat">로그인하고 내 약 불러오기 →</Link> : <p role="alert">{mine.error}<button onClick={mine.retry}>다시 시도</button></p>)}
          {mine.data && <><button type="button" className="load-more" disabled={loading || Boolean(paging)} onClick={()=>sendQuestion('내가 먹는 약끼리 같이 먹어도 돼?')}>복용 중인 내 약 DUR 확인</button>
            {ownProducts.map(item=><button type="button" className="drug-option" key={item.key} disabled={loading || Boolean(paging)} onClick={()=>selectDrug({...item,itemSeq:item.medicationId})}>{item.itemName}</button>)}
            {!ownProducts.length && <p>연결된 제품이 없습니다. <Link to="/guide">내 약 관리 →</Link></p>}</>}
        </details>
        {selected && <details className="chat-personal-panel" open={Boolean(compareId)}><summary>다른 약과 함께 먹어도 될까? · 비교 약 선택</summary>
          <select aria-label="내 등록 약 중 비교할 약" disabled={loading || Boolean(paging)} value={other?.itemSeq || ''} onChange={event=>{const item=ownProducts.find(item=>item.medicationId===event.target.value);setOther(item?{...item,itemSeq:item.medicationId}:null)}}>
            <option value="">내 등록 약에서 선택</option>{other && !ownProducts.some(item=>item.medicationId===other.itemSeq) && <option value={other.itemSeq}>{other.itemName}</option>}
            {ownProducts.filter(item=>item.medicationId!==selected.itemSeq).map(item=><option key={item.key} value={item.medicationId}>{item.itemName}</option>)}
          </select>
          <MedicationSearch onSelect={setOther} disabled={loading || Boolean(paging)} />
          {other && <p>비교 대상: {other.itemName}</p>}{linkedCompare.error && <p role="alert">{linkedCompare.error}</p>}
          <button type="button" className="load-more" disabled={!other || selected.itemSeq===other.itemSeq || loading || Boolean(paging)} onClick={compareProducts}>두 약의 DUR 비교</button>
        </details>}
        <p className="scope-note">다른 약 이름을 질문하면 새로 찾아드려요.<br />“효능은?”처럼 이름을 생략하면 현재 선택한 약을 기준으로 안내해요.</p>
      </aside>
      <div className="conversation">
        <header className="conversation-heading"><h2>약 정보 AI 도우미</h2><span>DB 자료 기반 안내</span></header>
        {selected && <div className="suggestions selected-suggestions" aria-label="선택한 약 추천 질문">{['효능은?','복용법은?','등록된 DUR 주의사항은?'].map(text=><button key={text} type="button" disabled={loading || Boolean(paging)} onClick={()=>sendQuestion(text)}>{text}</button>)}</div>}
        <div className="chat-log" ref={logRef} role="log" aria-label="질문과 답변" aria-live="polite" aria-relevant="additions text">
          {messages.length === 0 && <div className="welcome"><span className="welcome-mark" aria-hidden="true">✦</span><h3>궁금한 조건으로 물어보세요.</h3>
            <p>약 이름이 없어도 성분·효능·금기 조건으로 조회할 수 있어요.<br />특정 제품의 질문은 제품을 선택하면 이어갈 수 있어요.</p>
            <div className="suggestions">{suggestions.map(text => <button type="button" key={text} onClick={() => { setQuestion(text); inputRef.current?.focus() }}>{text} ↗</button>)}</div>
          </div>}
          {messages.map(message => <article className="exchange" key={message.id}>
            <div className="question-bubble"><span className="bubble-label">내 질문</span><p>{message.question}</p>{message.choiceLabel && <small>선택한 제품: {message.choiceLabel}</small>}</div>
            {message.answer !== null && <div className="answer-bubble"><span className="bubble-label">✦ 답변 요약</span><p>{message.answer}</p>
              {message.sources.length > 0 && <p className="answer-subject">{message.sources.map(source => source.itemName).join(' · ')}</p>}
              {message.choices.length > 0 && <div className="choice-list">
                {message.choices.map(drug => <button type="button" className="drug-option" key={drug.itemSeq} disabled={loading}
                  onClick={() => sendQuestion(message.question, { ...message.selections, [message.choiceKeyword]: drug.itemSeq }, drug.itemName)}>
                  <strong>{drug.itemName}</strong><small>{drug.entpName || '업체 정보 없음'}</small>
                </button>)}
                {message.choices.length < message.choiceTotal && <button type="button" className="load-more" disabled={Boolean(paging) || loading} onClick={() => moreChoices(message)}>다른 제품 더 보기 ({message.choices.length}/{message.choiceTotal})</button>}
              </div>}
              {message.loginRequired && <Link to="/login?next=/chat">로그인하기 →</Link>}
              {message.registeredMedications && <div>{groupMedications(message.registeredMedications).map(item=><div key={item.key}><strong>{item.itemName}</strong><RegisteredMedications items={item.registrations}/>{item.medicationId && <button type="button" className="drug-option" onClick={()=>selectDrug({...item,itemSeq:item.medicationId})}>이 약 질문하기</button>}</div>)}</div>}
              <InteractionSummary data={message.comparison}/>
              {message.sources.length > 0 && <h4>확인한 약 · DB 근거</h4>}
              <CatalogResults data={message.catalog} onMore={() => searchCatalog(message.catalog.query,message)} onSelect={selectDrug} busy={loading || Boolean(paging)} />
              <DurReports reports={message.durReports} notice={message.durNotice} />
              {message.seconds && <small className="response-time">응답 시간 {message.seconds}초</small>}
              {message.sources.length > 0 && <p className="scope-note"><strong>확인 범위</strong> · DB에 등록된 해당 제품의 자료를 참고했습니다. 음식·음주나 개인별 복용 가능 여부는 근거가 없으면 판단할 수 없습니다.</p>}
              {message.sources.length > 0 && <details className="sources"><summary>참고한 DB 원문 보기 ({message.sources.length})</summary>
                {message.sources.map((source, index) => <dl key={String(source.itemSeq) + index}>{fields.map(([field, label]) =>
                  <div key={field}><dt>{label}</dt><dd>{source[field] == null || String(source[field]).trim() === '' ? '등록된 정보 없음' : String(source[field])}</dd></div>)}</dl>)}
              </details>}
            </div>}
            {message.failed && <p className="failed-message">답변을 받지 못했어요. 질문을 다시 보내주세요.</p>}
          </article>)}
          {(loading || paging) && <p className="loading" role="status"><span aria-hidden="true" />약 정보를 찾아 답변을 작성하고 있어요…</p>}
        </div>
        <form className="composer" onSubmit={event => { event.preventDefault(); sendQuestion(question) }}>
          <label htmlFor="chat-question">질문하기</label>
          <textarea id="chat-question" ref={inputRef} onKeyDown={submitOnEnter} value={question} onChange={event => setQuestion(event.target.value)} maxLength={1000} rows={3} disabled={loading || Boolean(paging)} required placeholder="예: 임부금기 약 알려줘 / 아세트아미노펜 성분 검색 / 이 약의 DUR은?" />
          {error && <p className="error-message" role="alert">{error}</p>}
          <div className="composer-footer"><small>Enter 전송 · Shift+Enter 줄바꿈 · {question.length} / 1000</small><button type="submit" disabled={loading || Boolean(paging) || !question.trim()}>{loading ? '답변 작성 중…' : '질문 보내기'} ↗</button></div>
        </form>
      </div>
    </section>
    <footer className="page-footer">정확한 내용은 참고 원문을 확인해주세요. 등록되지 않은 상호작용은 판단하지 않습니다.</footer>
  </main>
}
