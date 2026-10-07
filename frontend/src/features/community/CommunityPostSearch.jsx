/**
 * 역할: 검색창 아래에 관련 게시글 미리보기 표시. 선택한 글은 기존 상세 화면으로 연결
 * 검색 규칙: 목록과 같은 유형·약·정렬 조건 사용. 한글 조합 중 전송과 지난 응답 덮어쓰기 방지
 */
import { useEffect, useId, useRef, useState } from 'react'
import { communityApi } from './communityApi'

export default function CommunityPostSearch({ value, onChange, onSearch, onSelect, category, sort, medicationId, categories, busy }) {
  const [open, setOpen] = useState(false)
  const [composing, setComposing] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState({ key: '', items: [], total: 0, error: '' })
  const inputRef = useRef(null)
  const rootRef = useRef(null)
  const resultsRef = useRef(null)
  const resultId = useId()
  const keyword = value.trim()
  const query = new URLSearchParams({ q: keyword, category: category === 'ALL' ? '' : category, sort, medicationId, page: '1' }).toString()
  const requestKey = `${query}&attempt=${attempt}`
  const expanded = open && Boolean(keyword)
  const tooLong = keyword.length > 100
  const searching = !tooLong && (composing || result.key !== requestKey)
  const items = result.key === requestKey ? result.items : []
  const error = result.key === requestKey ? result.error : ''

  useEffect(() => {
    if (!expanded || tooLong || composing) return undefined
    let active = true
    const controller = new AbortController()
    const timer = setTimeout(() => {
      communityApi('/api/community/posts?' + query, { signal: controller.signal })
        .then(data => { if (active) setResult({ key: requestKey, items: data.items, total: data.total, error: '' }) })
        .catch(error => { if (active && error.name !== 'AbortError') setResult({ key: requestKey, items: [], total: 0, error: error.message }) })
    }, 250)
    return () => { active = false; clearTimeout(timer); controller.abort() }
  }, [expanded, tooLong, composing, query, requestKey])

  useEffect(() => {
    if (!open) return undefined
    const closeOutside = event => { if (!rootRef.current?.contains(event.target)) setOpen(false) }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [open])

  function submit(event) {
    event.preventDefault()
    if (composing || tooLong || busy) return
    // 이벤트 객체를 상태 updater에 넘기지 않고 현재 검색 문자열만 전달
    onSearch(keyword)
    setOpen(Boolean(keyword))
  }
  function clear() {
    onChange(''); onSearch(''); setOpen(false); inputRef.current?.focus()
  }
  function inputKeyDown(event) {
    if (event.key === 'Enter' && (composing || event.nativeEvent.isComposing)) event.preventDefault()
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false) }
    if (event.key === 'ArrowDown' && expanded && !searching) {
      event.preventDefault(); resultsRef.current?.querySelector('button')?.focus()
    }
  }
  function resultsKeyDown(event) {
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); inputRef.current?.focus(); return }
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return
    const buttons = [...resultsRef.current.querySelectorAll('button:not(:disabled)')]
    const index = buttons.indexOf(document.activeElement)
    if (index < 0) return
    event.preventDefault()
    const next = index + (event.key === 'ArrowDown' ? 1 : -1)
    if (next < 0) inputRef.current?.focus()
    else buttons[Math.min(next, buttons.length - 1)]?.focus()
  }

  return <div ref={rootRef} className="community-post-search" onBlur={event => {
    // 재시도 버튼이 로딩 문구로 바뀌며 초점을 잃는 경우에는 결과창 유지
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false)
  }}>
    <form className="community-post-search-form" role="search" onSubmit={submit}>
      <div className="community-post-search-input">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" strokeWidth="1.7"/><path d="m15.5 15.5 5 5" strokeWidth="1.7" strokeLinecap="round"/></svg>
        <input ref={inputRef} type="search" name="q" aria-label="커뮤니티 게시글 검색" value={value} disabled={busy}
          placeholder="약 이름이나 궁금한 내용 검색" autoComplete="off" aria-expanded={expanded} aria-controls={expanded ? resultId : undefined}
          aria-describedby="community-post-search-help" aria-invalid={tooLong}
          onChange={event => { onChange(event.target.value); setOpen(true) }} onFocus={() => setOpen(Boolean(keyword))}
          onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)} onKeyDown={inputKeyDown}/>
        {value && <button type="button" className="community-post-search-clear" disabled={busy} aria-label="검색어 지우기" onClick={clear}>×</button>}
      </div>
      <button type="submit" className="community-post-search-submit" disabled={busy || tooLong}>검색</button>
    </form>
    <p id="community-post-search-help" className="community-post-search-help">약 이름의 일부만 입력해도 관련 글을 찾을 수 있어요.</p>
    {expanded && <section ref={resultsRef} id={resultId} className="community-post-search-results" aria-label="관련 게시글 검색 결과" aria-busy={searching} onKeyDown={resultsKeyDown}>
      <header><strong>관련 게시글</strong>{!searching && !error && !tooLong && <span>{result.total}개</span>}</header>
      {tooLong ? <p className="community-post-search-status" role="alert">검색어는 100자 이내로 적어주세요.</p>
        : searching ? <p className="community-post-search-status" role="status"><span className="community-spinner" aria-hidden="true"/>관련 글을 찾고 있어요…</p>
          : error ? <div className="community-post-search-status" role="alert"><p>{error}</p><button type="button" onClick={() => setAttempt(previous => previous + 1)}>다시 찾기</button></div>
            : items.length ? <>
              <ul>{items.map(post => <li key={post.postId}><button type="button" disabled={busy} onClick={() => { setOpen(false); onSearch(keyword); onSelect(post.postId) }}>
                <span className="community-post-search-meta">{post.medicationName && <strong>{post.medicationName}</strong>}<span>{categories[post.category] || '약 이야기'}</span></span>
                <span className="community-post-search-title">{post.title}</span>
                <span className="community-post-search-byline">{post.authorName}{post.createdAt && <> · {post.createdAt}</>}</span>
              </button></li>)}</ul>
              {result.total > items.length && <button type="button" className="community-post-search-more" onClick={() => { onSearch(keyword); setOpen(false) }}>검색 결과 {result.total}개 전체 보기 →</button>}
            </> : <p className="community-post-search-status">관련 글을 찾지 못했어요. 약 이름을 더 짧게 입력하거나 다른 검색어로 찾아보세요.</p>}
    </section>}
  </div>
}
