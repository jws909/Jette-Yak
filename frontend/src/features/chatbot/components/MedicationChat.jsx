import { useEffect, useRef, useState } from 'react'
import MedicationSearch from './MedicationSearch'
import './MedicationChat.css'

const fields = [
  ['itemName', '제품명'], ['entpName', '업체명'], ['materialName', '성분'],
  ['className', '분류'], ['etcOtcCode', '전문·일반'], ['efficacy', '효능·효과'], ['usageDosage', '용법·용량'],
]
const suggestions = ['텐텐의 효능을 알려줘', '트레스탄캡슐의 성분을 알려줘']

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
  const [selected, setSelected] = useState(null)
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [paging, setPaging] = useState(null)
  const requestRef = useRef(null)
  const logRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => () => { requestRef.current?.abort(); requestRef.current = null }, [])
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [messages, loading])

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
    const id = crypto.randomUUID()
    setLoading(true)
    setError('')
    setMessages(previous => [...previous, {
      id, question: text, choiceLabel, selections, answer: null, sources: [], choices: [], choicePage: 1,
    }])
    try {
      const data = await postQuestion({ itemSeq: selected?.itemSeq, question: text, selections }, controller.signal)
      if (typeof data.answer !== 'string' || !data.answer.trim()) throw new Error('서버 응답에 답변이 없습니다.')
      if (requestRef.current !== controller) return
      const seconds = data.seconds
      setMessages(previous => previous.map(message => message.id === id ? {
        ...message, answer: data.answer,
        sources: Array.isArray(data.sources) ? data.sources : [],
        choices: Array.isArray(data.choices) ? data.choices : [],
        choiceKeyword: data.choiceKeyword, choiceTotal: data.choiceTotal || 0,
        seconds,
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

  return <main className="chat-page">
    <header className="page-heading">
      <span className="eyebrow">JETTE-YAK / PERSONAL HEALTH GUIDE</span>
      <h1>궁금한 약 정보,<br /><em>이름으로 물어보세요.</em></h1>
      <p>이름의 일부만 검색해도, 대화 중 다른 약을 물어봐도 괜찮아요.</p>
    </header>
    <section className="chat-layout" aria-label="약 정보 AI 도우미">
      <aside className="product-panel">
        <span className="eyebrow">FIND YOUR MEDICINE</span>
        <h2>어떤 약이<br />궁금하세요?</h2>
        <MedicationSearch onSelect={selectDrug} disabled={loading} />
        <div className="product-note active-medication">
          <span>현재 대화 중인 약</span>
          {selected ? <><p><strong>{selected.itemName}</strong><br />{selected.entpName}</p>
            <button type="button" className="clear-selection" disabled={loading} onClick={() => setSelected(null)}>선택 해제</button></>
            : <p>선택한 약이 없어요.<br />검색하거나 질문에 약 이름을 적어주세요.</p>}
        </div>
        <p className="scope-note">다른 약 이름을 질문하면 새로 찾아드려요.<br />“효능은?”처럼 이름을 생략하면 현재 선택한 약을 기준으로 안내해요.</p>
      </aside>
      <div className="conversation">
        <header className="conversation-heading"><h2>약 정보 AI 도우미</h2><span>DB 자료 기반 안내</span></header>
        <div className="chat-log" ref={logRef} role="log" aria-label="질문과 답변" aria-live="polite" aria-relevant="additions text">
          {messages.length === 0 && <div className="welcome"><span className="welcome-mark" aria-hidden="true">✦</span><h3>약 이름으로 시작해보세요.</h3>
            <p>“텐텐의 효능을 알려줘”처럼 물어보세요.<br />같은 이름의 제품이 여러 개면 선택을 도와드려요.</p>
            <div className="suggestions">{suggestions.map(text => <button type="button" key={text} onClick={() => { setQuestion(text); inputRef.current?.focus() }}>{text} ↗</button>)}</div>
          </div>}
          {messages.map(message => <article className="exchange" key={message.id}>
            <div className="question-bubble"><span className="bubble-label">내 질문</span><p>{message.question}</p>{message.choiceLabel && <small>선택한 제품: {message.choiceLabel}</small>}</div>
            {message.answer !== null && <div className="answer-bubble"><span className="bubble-label">✦ AI 도우미</span><p>{message.answer}</p>
              {message.sources.length > 0 && <p className="answer-subject">{message.sources.map(source => source.itemName).join(' · ')}</p>}
              {message.choices.length > 0 && <div className="choice-list">
                {message.choices.map(drug => <button type="button" className="drug-option" key={drug.itemSeq} disabled={loading}
                  onClick={() => sendQuestion(message.question, { ...message.selections, [message.choiceKeyword]: drug.itemSeq }, drug.itemName)}>
                  <strong>{drug.itemName}</strong><small>{drug.entpName || '업체 정보 없음'}</small>
                </button>)}
                {message.choices.length < message.choiceTotal && <button type="button" className="load-more" disabled={Boolean(paging) || loading} onClick={() => moreChoices(message)}>다른 제품 더 보기 ({message.choices.length}/{message.choiceTotal})</button>}
              </div>}
              <small className="response-time">응답 시간 {message.seconds}초</small>
              {message.sources.length > 0 && <details className="sources"><summary>참고한 DB 원문 보기 ({message.sources.length})</summary>
                {message.sources.map((source, index) => <dl key={String(source.itemSeq) + index}>{fields.map(([field, label]) =>
                  <div key={field}><dt>{label}</dt><dd>{source[field] == null || String(source[field]).trim() === '' ? '등록된 정보 없음' : String(source[field])}</dd></div>)}</dl>)}
              </details>}
            </div>}
            {message.failed && <p className="failed-message">답변을 받지 못했어요. 질문을 다시 보내주세요.</p>}
          </article>)}
          {loading && <p className="loading" role="status"><span aria-hidden="true" />약 정보를 찾아 답변을 작성하고 있어요…</p>}
        </div>
        <form className="composer" onSubmit={event => { event.preventDefault(); sendQuestion(question) }}>
          <label htmlFor="chat-question">질문하기</label>
          <textarea id="chat-question" ref={inputRef} onKeyDown={submitOnEnter} value={question} onChange={event => setQuestion(event.target.value)} maxLength={1000} rows={3} disabled={loading} required placeholder="예: 텐텐의 효능은? / 타이레놀은 어떤 약이야?" />
          {error && <p className="error-message" role="alert">{error}</p>}
          <div className="composer-footer"><small>Enter 전송 · Shift+Enter 줄바꿈 · {question.length} / 1000</small><button type="submit" disabled={loading || !question.trim()}>{loading ? '답변 작성 중…' : '질문 보내기'} ↗</button></div>
        </form>
      </div>
    </section>
    <footer className="page-footer">정확한 내용은 참고 원문을 확인해주세요. 등록되지 않은 상호작용은 판단하지 않습니다.</footer>
  </main>
}
