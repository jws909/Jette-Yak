import { useEffect, useState } from 'react'
export default function useRemote(url, refresh = 0) {
  const [retry, setRetry] = useState(0)
  const [result, setResult] = useState(null)
  const key = url + ':' + retry + ':' + refresh
  useEffect(() => {
    if (!url) return
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 20000)
    let active = true
    async function load() {
      try {
        const response = await fetch(url, { signal: controller.signal, credentials: 'same-origin', cache: 'no-store' })
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

