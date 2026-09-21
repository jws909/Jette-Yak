import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import logoImg from '../../assets/logo.png';
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
  const [notifications, setNotifications] = useState([]);

  const notifBoxRef = useRef(null);

  // 로그인 시 사용자의 실제 복약 일정 및 처방전 주의사항을 알림으로 로드
  useEffect(() => {
    if (!isLoggedIn) {
      setNotifications([]);
      return;
    }

    const userId = user?.userId || 1;
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const todayStr = `${y}-${m}-${d}`;

    let isMounted = true;

    const loadNotifications = async () => {
      const items = [];

      try {
        // 1. 처방전 주의사항 및 판매중단 약품 알림
        const rxRes = await fetch(`/api/prescriptions/latest?userId=${userId}`);
        if (rxRes.ok) {
          const rxData = await rxRes.json();
          if (rxData && rxData.found && rxData.prescription) {
            const rx = rxData.prescription;
            if (Number(rx.hasDiscontinuedDrug) === 1) {
              items.push({
                id: 'rx-discontinued',
                type: 'warning',
                title: '복용 주의 알림',
                text: '처방전에 판매중단 또는 주의 대상 의약품이 포함되어 있습니다. 복용 전 의료진과 상담하세요.',
                time: '주의',
                read: false,
              });
            }

            if (Array.isArray(rx.items)) {
              rx.items.forEach((it, idx) => {
                if (it.caution && it.caution.trim()) {
                  items.push({
                    id: `rx-caution-${it.itemId || idx}`,
                    type: 'warning',
                    title: `${it.name} 복약 주의`,
                    text: it.caution,
                    time: '주의사항',
                    read: false,
                  });
                }
              });
            }
          }
        }
      } catch (err) {
        console.warn('Navbar 처방전 알림 조회 실패:', err);
      }

      try {
        // 2. 오늘의 실제 복약 일정 알림 (캘린더 연동)
        const calRes = await fetch(`/api/calendar?userId=${userId}&date=${todayStr}`);
        if (calRes.ok) {
          const calList = await calRes.json();
          if (Array.isArray(calList)) {
            calList.forEach((sched) => {
              const medName = sched.name ? sched.name.trim() : '약품';
              items.push({
                id: `sched-${sched.scheduleId}`,
                type: 'routine',
                title: '복약 예정 안내',
                text: `${sched.time || ''} ${medName} 복용 예정입니다.`.trim(),
                time: sched.time || '오늘',
                read: false,
              });
            });
          }
        }
      } catch (err) {
        console.warn('Navbar 복약 일정 조회 실패:', err);
      }

      if (isMounted) {
        setNotifications(items);
      }
    };

    loadNotifications();

    return () => {
      isMounted = false;
    };
  }, [isLoggedIn, user?.userId]);

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

  const markAsRead = (id) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  return (
    <header className="site-navbar">
      <div className="navbar-container">
        {/* 좌측: 모바일 메뉴 토글 버튼 & 2번 로고 심볼 (logo.png) */}
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

          {/* 2번 로고 심볼: 클릭 시 메인 홈 이동 (모바일에서는 햄버거 메뉴를 가리지 않도록 숨김) */}
          <Link to="/" className="navbar-logo-symbol" title="제때약 홈으로 이동">
            <img src={logoImg} alt="제때약 로고 심볼" className="logo-symbol-img" />
          </Link>
        </div>

        {/* 중앙: 브랜드 글씨 (아까대로 한가운데 배치, mediary 캡슐 뱃지 제거) */}
        <div className="navbar-center">
          <Link to="/" className="navbar-brand-text" title="제때약 홈으로 이동">
            <span className="logo-text">제때약</span>
          </Link>
        </div>

        {/* 우측: 알림 및 로그인/로그아웃 액션 */}
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
                      {notifications.length === 0 ? (
                        <div className="notif-empty">
                          <div className="notif-empty-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="28" height="28">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0 1 18 14.158V11a6.002 6.002 0 0 0-4-5.659V5a2 2 0 1 0-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9" />
                            </svg>
                          </div>
                          <p className="notif-empty-text">새로운 알림이 없습니다.</p>
                        </div>
                      ) : (
                        notifications.map((n) => (
                          <div
                            key={n.id}
                            className={`notif-item ${n.read ? 'read' : 'unread'}`}
                            onClick={() => markAsRead(n.id)}
                            role="button"
                            tabIndex={0}
                          >
                            <div className={`notif-indicator ${n.type}`} />
                            <div className="notif-item-body">
                              <span className="notif-item-title">{n.title}</span>
                              <p className="notif-item-text">{n.text}</p>
                              <span className="notif-item-time">{n.time}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              <span className="nav-divider">|</span>

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
