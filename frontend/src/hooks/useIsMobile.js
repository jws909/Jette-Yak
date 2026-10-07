import { useState, useEffect } from 'react';

/**
 * 화면 너비가 지정한 breakpoint 이하인지 감지하는 커스텀 훅
 * @param {number} breakpoint 기준 너비 (기본값: 680px)
 * @returns {boolean} 모바일 여부
 */
export function useIsMobile(breakpoint = 680) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= breakpoint : false
  );

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= breakpoint);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [breakpoint]);

  return isMobile;
}

export default useIsMobile;
