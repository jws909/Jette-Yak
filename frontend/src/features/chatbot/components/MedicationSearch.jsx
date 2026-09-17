import { useEffect, useRef, useState } from 'react'

export default function MedicationSearch({ onSelect, disabled }) {
  const immediate = useRef(false)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [retry, setRetry] = useState(0)
  const [state, setState] = useState({ items: [], total: 0, hasMore: false, loading: false, error: '' })
  useEffect(() => {
    if (!query.trim()) return
    const controller = new AbortController()
    let active = true
    const delay = immediate.current ? 0 : 300
    immediate.current = false
    const timer = setTimeout(async () => {
      setState(previous => ({ ...previous, loading: true, error: '' }))
      try {
        const response = await fetch('/api/medications/search?' + new URLSearchParams({ q: query.trim(), page }), { signal: controller.signal })
        if (!(response.headers.get('content-type') || '').includes('application/json')) throw new Error('이름 검색 API를 사용할 수 없습니다. Spring 서버를 재시작해주세요.')
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || '약 검색에 실패했습니다.')
        if (active) setState(previous => ({
          items: page === 1 ? data.items : [...previous.items, ...data.items],
          total: data.total, hasMore: data.hasMore, loading: false, error: '',
        }))
      } catch (err) {
        if (active && err.name !== 'AbortError') setState(previous => ({ ...previous, loading: false, error: err.message }))
      }
    }, delay)
    return () => { active = false; clearTimeout(timer); controller.abort() }
  }, [query, page, retry])

  function searchOnEnter(event) {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.keyCode === 229) return
    event.preventDefault()
    if (!query.trim()) return
    immediate.current = true
    setPage(1)
    setRetry(value => value + 1)
  }

  function changeQuery(event) {
    setQuery(event.target.value)
    setPage(1)
    setState({ items: [], total: 0, hasMore: false, loading: Boolean(event.target.value.trim()), error: '' })
  }
  return <div className="medication-search">
    <label htmlFor="medication-name">약 이름 검색</label>
    <input id="medication-name" type="search" value={query} onChange={changeQuery} onKeyDown={searchOnEnter}
      placeholder="텐, 텐텐처럼 일부만 입력해도 돼요" maxLength={100} />
    <p className="field-help">이름에 검색어가 들어간 약을 모두 찾아요.</p>
    {state.error && <div><p className="error-message" role="alert">{state.error}</p><button type="button" className="load-more" disabled={state.loading} onClick={() => setRetry(value => value + 1)}>검색 다시 시도</button></div>}
    {query.trim() && !state.loading && !state.error && <p className="search-count" role="status">{state.total}개 약품 · {state.items.length}개 표시</p>}
    <div className="search-results">
      {state.items.map(item => <button className="drug-option" key={item.itemSeq} type="button"
        disabled={disabled} onClick={() => onSelect(item)}>
        <strong>{item.itemName}</strong><small>{item.entpName || '업체 정보 없음'}</small>
      </button>)}
    </div>
    {state.loading && <p role="status" className="field-help">약을 찾고 있어요…</p>}
    {query.trim() && !state.loading && !state.error && state.items.length === 0 && <p className="field-help">일치하는 약이 없어요. 더 짧은 이름으로 검색해보세요.</p>}
    {state.hasMore && !state.error && <button type="button" className="load-more" disabled={state.loading}
      onClick={() => setPage(previous => previous + 1)}>검색 결과 더 보기</button>}
  </div>
}
