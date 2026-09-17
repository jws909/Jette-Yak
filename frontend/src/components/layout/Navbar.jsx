import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Navbar.css';

const MOCK_DB = [
  { itemSeq: 'm1', itemName: '아모잘탄정 5/50mg', entpName: '한미약품', efficacy: '본태성 고혈압 치료제', type: '처방약' },
  { itemSeq: 'm2', itemName: '오메가-3 트리플 스트렝스', entpName: '종근당건강', efficacy: '혈중 중성지질 개선 및 혈행 개선', type: '영양제' },
  { itemSeq: 'm3', itemName: '듀오락 골드 캡슐', entpName: '쎌바이오텍', efficacy: '장 건강 및 유익균 증식 돕는 프로바이오틱스', type: '상시약' },
  { itemSeq: 'm4', itemName: '타이레놀정 500mg', entpName: '한국존슨앤드존슨', efficacy: '해열 및 진통제', type: '일반의약품' },
  { itemSeq: 'm5', itemName: '아스피린장용정 100mg', entpName: '바이엘코리아', efficacy: '혈전 생성 억제', type: '처방약' },
  { itemSeq: 'm6', itemName: '텐텐츄정', entpName: '한미약품', efficacy: '성장기 어린이 영양 보급', type: '영양제' },
];

function fallbackMockSearch(keyword) {
  return MOCK_DB.filter(m => m.itemName.includes(keyword) || m.entpName.includes(keyword));
}

export default function Navbar({
  onToggleSidebar,
  isSidebarOpen,
  isLoggedIn,
  user,
  onLogout,
  onLoginDemoToggle
}) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [notifications, setNotifications] = useState([
    { id: 1, type: 'warning', title: '복용 주의 알림', text: '오메가-3와 아스피린 병용 시 출혈 위험이 있으니 주의하세요.', time: '10분 전', read: false },
    { id: 2, type: 'routine', title: '복약 예정 안내', text: '오후 21:00 듀오락 골드 복용 예정입니다.', time: '1시간 전', read: false }
  ]);

  const searchBoxRef = useRef(null);
  const notifBoxRef = useRef(null);

  // 단축키 ⌘ K / Ctrl+K 지원
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        const input = document.getElementById('navbar-drug-search');
        if (input) {
          input.focus();
          input.select();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 외부 클릭 시 검색결과/알림창 닫기
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target)) {
        setIsSearchFocused(false);
      }
      if (notifBoxRef.current && !notifBoxRef.current.contains(e.target)) {
        setShowNotification(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 약품 실시간 검색 (Spring Boot /api/medications/search + fallback mock)
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;

    let active = true;
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/medications/search?q=${encodeURIComponent(trimmed)}&page=1`);
        if (res.ok) {
          const data = await res.json();
          if (active) setSearchResults(data.items || []);
        } else {
          if (active) setSearchResults(fallbackMockSearch(trimmed));
        }
      } catch {
        if (active) setSearchResults(fallbackMockSearch(trimmed));
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
      setIsSearching(false);
    }
  };

  const handleClearQuery = () => {
    setSearchQuery('');
    setSearchResults([]);
    setIsSearching(false);
  };

  const handleSelectMed = (med) => {
    setSearchQuery('');
    setSearchResults([]);
    setIsSearchFocused(false);
    navigate(`/guide?med=${encodeURIComponent(med.itemName)}`);
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  return (
    <header className="site-navbar">
      <div className="navbar-container">
        {/* 좌측: 사이드바 토글 버튼 & 브랜드 로고 */}
        <div className="navbar-left">
          <button
            type="button"
            className={`menu-toggle-btn ${isSidebarOpen ? 'is-open' : ''}`}
            onClick={onToggleSidebar}
            aria-label="메뉴 토글"
            title="메뉴 열기/닫기"
          >
            {/* 와이어프레임의 점+선 형태 메뉴 아이콘 */}
            <div className="menu-icon-bars">
              <span className="bar-row"><i className="dot" /><span className="line" /></span>
              <span className="bar-row"><i className="dot" /><span className="line" /></span>
              <span className="bar-row"><i className="dot" /><span className="line" /></span>
            </div>
          </button>

          <Link to="/" className="navbar-logo">
            <span className="logo-text">Jette-Yak</span>
            <span className="logo-badge">mediary</span>
          </Link>
        </div>

        {/* 중앙: 통합 검색창 */}
        <div className="navbar-center" ref={searchBoxRef}>
          <div className={`search-input-wrapper ${isSearchFocused ? 'focused' : ''}`}>
            <svg className="search-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 19l-4-4m0-7A7 7 0 1 1 1 8a7 7 0 0 1 14 0Z" />
            </svg>
            <input
              id="navbar-drug-search"
              type="text"
              className="search-input"
              placeholder="약 이름을 검색해 보세요"
              value={searchQuery}
              onChange={handleQueryChange}
              onFocus={() => setIsSearchFocused(true)}
              autoComplete="off"
            />
            {searchQuery && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={handleClearQuery}
              >
                ✕
              </button>
            )}
            <div className="search-shortcut">⌘ K</div>
          </div>

          {/* 검색 결과 드롭다운 */}
          {isSearchFocused && searchQuery.trim() && (
            <div className="search-dropdown-panel">
              {isSearching ? (
                <div className="search-state-msg">
                  <span className="spinner-small" /> 약 정보를 검색 중입니다...
                </div>
              ) : searchResults.length > 0 ? (
                <div className="search-results-list">
                  <div className="results-header">
                    <span>검색 결과 <strong>{searchResults.length}</strong>건</span>
                    <span className="results-tip">클릭 시 맞춤 가이드로 이동합니다</span>
                  </div>
                  {searchResults.map((item, idx) => (
                    <div
                      key={item.itemSeq || idx}
                      className="search-result-item"
                      onClick={() => handleSelectMed(item)}
                    >
                      <div className="result-item-main">
                        <span className="result-item-name">{item.itemName}</span>
                        <span className="result-item-entp">{item.entpName}</span>
                      </div>
                      {item.efficacy && (
                        <p className="result-item-desc">{item.efficacy}</p>
                      )}
                      <span className="result-arrow">→</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="search-empty-msg">
                  <p>'{searchQuery}'에 대한 검색 결과가 없습니다.</p>
                  <small>약 이름의 일부(예: 아모, 오메가, 텐)만 입력해 보세요.</small>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 우측: 로그인 전 / 후 상태 (와이어프레임 메인화면 & 내비게이션바 명세) */}
        <div className="navbar-right">
          {isLoggedIn ? (
            <div className="logged-in-actions">
              {/* 알림 버튼 & 팝오버 */}
              <div className="notif-wrapper" ref={notifBoxRef}>
                <button
                  type="button"
                  className={`notif-btn ${unreadCount > 0 ? 'has-unread' : ''}`}
                  onClick={() => setShowNotification(!showNotification)}
                  aria-label="알림"
                  title="복약 및 주의 알림"
                >
                  <svg className="bell-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0 1 18 14.158V11a6.002 6.002 0 0 0-4-5.659V5a2 2 0 1 0-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9" />
                  </svg>
                  {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
                  <span className="notif-label">알림</span>
                </button>

                {showNotification && (
                  <div className="notif-popover">
                    <div className="notif-popover-header">
                      <strong>알림</strong>
                      {unreadCount > 0 && (
                        <button type="button" className="mark-read-btn" onClick={markAllAsRead}>
                          모두 읽음
                        </button>
                      )}
                    </div>
                    <div className="notif-list">
                      {notifications.map((n) => (
                        <div key={n.id} className={`notif-item ${n.read ? 'read' : 'unread'}`}>
                          <div className={`notif-indicator ${n.type}`} />
                          <div className="notif-item-body">
                            <span className="notif-item-title">{n.title}</span>
                            <p className="notif-item-text">{n.text}</p>
                            <span className="notif-item-time">{n.time}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <span className="nav-divider">|</span>

              {/* 프로필 칩 */}
              <Link to="/mypage" className="user-profile-chip" title="마이페이지로 이동">
                <div className="avatar-mini">
                  {user?.name ? user.name[0] : '김'}
                </div>
                <span className="user-name-text">{user?.name || '김메디'}님</span>
              </Link>

              {/* 로그아웃 버튼 */}
              <button
                type="button"
                className="logout-btn"
                onClick={onLogout}
              >
                로그아웃
              </button>
            </div>
          ) : (
            <div className="guest-actions">
              <Link to="/login" className="nav-link-login">
                로그인
              </Link>
              <span className="nav-divider">/</span>
              <Link to="/signup" className="nav-link-signup">
                회원가입
              </Link>
              <button
                type="button"
                className="demo-login-btn"
                onClick={onLoginDemoToggle}
                title="와이어프레임 데모용 빠른 로그인"
              >
                체험하기
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
