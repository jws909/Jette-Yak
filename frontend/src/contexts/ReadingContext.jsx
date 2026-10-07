import { createContext, useContext, useEffect, useMemo } from 'react'
import { deriveReadingProfile } from '../utils/readingProfile'
import '../styles/reading.css'

const ReadingContext = createContext(deriveReadingProfile(null))

/**
 * 로그인 프로필의 생년월일로 안내 문장과 글자 크기를 함께 선택
 * html에 모드를 표시해 body로 옮겨진 경고 모달에도 같은 읽기 방식 적용
 */
export function ReadingProvider({ user, children }) {
  const birthdate = user?.birthdate
  const profile = useMemo(() => deriveReadingProfile(birthdate), [birthdate])

  useEffect(() => {
    const root = document.documentElement
    const previousMode = root.getAttribute('data-reading-mode')
    root.setAttribute('data-reading-mode', profile.mode)
    return () => {
      // 로그아웃·페이지 해제 후 현재 사용자의 보기 설정이 다음 화면에 남지 않도록 복원
      if (previousMode === null) root.removeAttribute('data-reading-mode')
      else root.setAttribute('data-reading-mode', previousMode)
    }
  }, [profile.mode])

  return <ReadingContext.Provider value={profile}>{children}</ReadingContext.Provider>
}

// 컴포넌트와 훅을 같이 제공하는 Context 모듈이며, 상태는 Provider 한 곳에서 관리
// eslint-disable-next-line react-refresh/only-export-components
export function useReadingProfile() {
  return useContext(ReadingContext)
}
