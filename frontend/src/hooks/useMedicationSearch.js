import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * 식약처 의약품 DB 실시간 자동완성 검색 커스텀 훅
 * 
 * - 디바운스(기본 250ms) 기반 API 과호출 방지
 * - 드롭다운 외부 클릭 감지 및 자동 닫힘
 * - 키보드 탐색 지원 (위/아래 방향키, Enter 선택, ESC 닫기)
 * 
 * @param {Object} options
 * @param {number} [options.debounceMs=250] - 디바운스 지연 시간 (밀리초)
 * @param {string} [options.apiEndpoint='/api/calendar/search-medications'] - 검색 API 경로
 * @returns {Object} 검색 상태 및 제어 함수
 */
export function useMedicationSearch({
  debounceMs = 250,
  apiEndpoint = '/api/calendar/search-medications',
} = {}) {
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const containerRef = useRef(null);

  // 드롭다운 외부 영역 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 검색어 디바운스 API 호출
  useEffect(() => {
    const keyword = searchText.trim();
    if (!keyword) return;

    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`${apiEndpoint}?keyword=${encodeURIComponent(keyword)}`, { signal: controller.signal });
        if (res.ok) {
          const list = await res.json();
          if (!active) return;
          setSearchResults(Array.isArray(list) ? list : []);
          setHighlightIndex(0);
          setIsDropdownOpen(true);
        } else if (active) {
          setSearchResults([]);
          setHighlightIndex(0);
        }
      } catch (err) {
        if (active) {
          console.warn('약품 검색 오류:', err);
          setSearchResults([]);
        }
      } finally {
        if (active) setIsSearching(false);
      }
    }, debounceMs);

    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [searchText, debounceMs, apiEndpoint]);

  // 검색창 입력 변경 핸들러
  const handleInputChange = useCallback((e) => {
    const val = typeof e === 'string' ? e : e?.target?.value || '';
    setSearchText(val);
    setIsSearching(false);
    if (!val.trim()) {
      setSearchResults([]);
      setIsDropdownOpen(false);
    }
  }, []);

  // 검색어 초기화
  const clearSearch = useCallback(() => {
    setSearchText('');
    setIsSearching(false);
    setSearchResults([]);
    setIsDropdownOpen(false);
    setHighlightIndex(0);
  }, []);

  // 키보드 방향키 및 Enter 선택 핸들러
  const handleKeyDown = useCallback(
    (e, onSelect) => {
      if (!isDropdownOpen || searchResults.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightIndex((prev) => (prev + 1 < searchResults.length ? prev + 1 : prev));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightIndex((prev) => (prev - 1 >= 0 ? prev - 1 : 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const target = searchResults[highlightIndex] || searchResults[0];
        if (target && onSelect) {
          onSelect(target);
        }
      } else if (e.key === 'Escape') {
        setIsDropdownOpen(false);
      }
    },
    [isDropdownOpen, searchResults, highlightIndex]
  );

  return {
    searchText,
    setSearchText: handleInputChange,
    handleInputChange,
    searchResults,
    isSearching,
    isDropdownOpen,
    setIsDropdownOpen,
    highlightIndex,
    setHighlightIndex,
    containerRef,
    clearSearch,
    handleKeyDown,
  };
}
