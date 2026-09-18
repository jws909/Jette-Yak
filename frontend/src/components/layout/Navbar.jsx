import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import './Navbar.css';

export default function Navbar({
  onToggleSidebar,
  isSidebarOpen,
  isLoggedIn,
  user,
  onLogout,
  onLoginDemoToggle
}) {
  const [showNotification, setShowNotification] = useState(false);
  const [notifications, setNotifications] = useState([
    { id: 1, type: 'warning', title: '복용 주의 알림', text: '오메가-3와 아스피린 병용 시 출혈 위험이 있으니 주의하세요.', time: '10분 전', read: false },
    { id: 2, type: 'routine', title: '복약 예정 안내', text: '오후 21:00 듀오락 골드 복용 예정입니다.', time: '1시간 전', read: false }
  ]);

  const notifBoxRef = useRef(null);

  // 외부 클릭 시 알림창 닫기
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notifBoxRef.current && !notifBoxRef.current.contains(e.target)) {
        setShowNotification(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
