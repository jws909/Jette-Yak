/**
 * 등록 약의 기본정보·주의기록을 제품별 한 번씩 조회
 * AI 생성은 상세 화면에서 요청하고, 경고 조회는 기다리지 않도록 분리
 */
import { useCallback, useEffect, useState } from 'react'

export default function useMedicationGuides(items, revision) {
  const [retryCount, setRetryCount] = useState(0)
  const [snapshot, setSnapshot] = useState(null)
  const idsKey = JSON.stringify([...new Set(items.map(item => item.medicationId).filter(Boolean).map(String))].sort())
  const key = `${idsKey}:${revision}:${retryCount}`
  useEffect(() => {
    const ids = JSON.parse(idsKey)
    const controllers = new Set()
    let active = true
    const results = {}
    let nextIndex = 0
    async function worker() {
      while (active && nextIndex < ids.length) {
        const id = ids[nextIndex++]
        const controller = new AbortController()
        controllers.add(controller)
        const timer = setTimeout(() => controller.abort(), 20000)
        try {
          const response = await fetch(`/api/guides/medications/${encodeURIComponent(id)}?includeAi=false`, {
            signal: controller.signal, credentials: 'same-origin', cache: 'no-store',
          })
          if (!(response.headers.get('content-type') || '').includes('application/json')) {
            throw new Error('약 정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요.')
          }
          const data = await response.json()
          if (!response.ok) throw new Error(data.error || '약 정보를 불러오지 못했어요.')
          results[id] = { data }
        } catch (error) {
          results[id] = { error: error.name === 'AbortError' ? '약 정보를 불러오는 데 시간이 걸려요. 다시 시도해주세요.' : error.message }
        } finally {
          clearTimeout(timer)
          controllers.delete(controller)
        }
        if (active) setSnapshot({ key, results: { ...results }, complete: false })
      }
    }
    // 약이 많아도 서버에 모든 요청을 동시에 보내지 않도록 네 개씩 조회
    Promise.all(Array.from({ length: Math.min(4, ids.length) }, worker)).then(() => {
      if (active) setSnapshot({ key, results: { ...results }, complete: true })
    })
    return () => { active = false; controllers.forEach(controller => controller.abort()) }
  }, [idsKey, key])
  const current = snapshot?.key === key ? snapshot : null
  const retry = useCallback(() => setRetryCount(value => value + 1), [])
  return { guides: current?.results || {}, loading: !current?.complete, retry }
}
