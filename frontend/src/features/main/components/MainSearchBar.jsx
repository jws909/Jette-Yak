import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * 메인 페이지 약 검색 바 및 결과 팝업 모달 컴포넌트
 */
export default function MainSearchBar() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);

  // 디바운스 검색 핸들러 (250ms)
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;

    let active = true;
    const timer = setTimeout(async () => {
      setIsSearching(true);
      setShowSearchResults(true);
      try {
        const res = await fetch(`/api/medications/search?q=${encodeURIComponent(trimmed)}&page=1`);
        if (res.ok) {
          const data = await res.json();
          if (active) setSearchResults(data.items || []);
        } else {
          if (active) setSearchResults([]);
        }
      } catch {
        if (active) setSearchResults([]);
      } finally {
        if (active) setIsSearching(false);
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  const handleQueryChange = (e) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (!val.trim()) {
      setSearchResults([]);
      setShowSearchResults(false);
      setIsSearching(false);
    }
  };

  const handleClearQuery = () => {
    setSearchQuery('');
    setSearchResults([]);
    setShowSearchResults(false);
    setIsSearching(false);
  };

  return (
    <section className="main-search-section">
      <div className="main-search-bar">
        <svg className="main-search-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 19l-4-4m0-7A7 7 0 1 1 1 8a7 7 0 0 1 14 0Z" />
        </svg>
        <input
          type="text"
          className="main-search-input"
          placeholder="약 이름을 검색해 보세요"
          value={searchQuery}
          onChange={handleQueryChange}
          onFocus={() => searchQuery.trim() && setShowSearchResults(true)}
        />
        {searchQuery && (
          <button
            type="button"
            className="main-search-clear"
            onClick={handleClearQuery}
          >
            ✕
          </button>
        )}
      </div>

      {/* 검색 결과 팝업 */}
      {showSearchResults && searchQuery.trim() && (
        <div className="main-search-results-modal">
          <div className="results-inner-head">
            <span>검색된 약품 ({searchResults.length}건)</span>
            <button type="button" onClick={() => setShowSearchResults(false)}>닫기</button>
          </div>
          {isSearching ? (
            <div className="results-loading">약 정보를 찾고 있습니다...</div>
          ) : searchResults.length > 0 ? (
            <div className="results-scroll-area">
              {searchResults.map((item, idx) => (
                <div
                  key={idx}
                  className="result-row-card"
                  onClick={() => {
                    setShowSearchResults(false);
                    navigate('/chat');
                  }}
                >
                  <div>
                    <strong>{item.itemName}</strong>
                    <span className="entp-label">{item.entpName}</span>
                    <p className="efficacy-label">{item.efficacy || item.desc}</p>
                  </div>
                  <span className="view-link">챗봇에서 약 조회 →</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="results-none">
              검색된 약품이 없습니다. 다른 이름으로 검색해 보세요.
            </div>
          )}
        </div>
      )}
    </section>
  );
}
