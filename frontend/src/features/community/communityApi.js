// 커뮤니티 요청의 통신 오류·로그인 만료·HTML 오류 응답을 같은 안내로 변환
export async function communityApi(url, options) {
  let response
  try { response = await fetch(url, options) }
  catch (error) {
    if (error.name === 'AbortError') throw error
    throw new Error('서버에 연결하지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해주세요.', { cause: error })
  }
  if (response.status === 204) return {}
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const fallback = response.status === 413 ? '첨부파일 용량이 너무 커요. 파일 크기를 확인해주세요.' : response.status === 401 ? '로그인이 만료됐어요. 다시 로그인한 뒤 시도해주세요.' : '요청을 완료하지 못했어요. 잠시 후 다시 시도해주세요.'
    throw new Error(typeof data?.message === 'string' ? data.message : fallback)
  }
  if (data === null) throw new Error('서버 응답을 확인하지 못했어요. 잠시 후 다시 시도해주세요.')
  return data
}
