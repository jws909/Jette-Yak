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

  // 로그인 시 사용자의 실제 복약 일정(원샷 브리핑) 및 처방전 주의사항 로드
  useEffect(() => {
    if (!isLoggedIn || !user?.userId) {
      setNotifications([]);
      return;
    }

    const userId = user.userId;
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
        // ★ 2. 오늘의 복약 일정 원샷(1장) 데일리 브리핑
        const calRes = await fetch(`/api/calendar?userId=${userId}&date=${todayStr}`);
        if (calRes.ok) {
          const calList = await calRes.json();
          if (Array.isArray(calList) && calList.length > 0) {
            // 시간순 정렬
            const sorted = [...calList].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
            
            // 시간대별 그룹화 (예: 08:30 -> ["아모잘탄정", "비타민C"])
            const grouped = {};
            sorted.forEach((sched) => {
              const t = (sched.time || '').substring(0, 5);
              if (!grouped[t]) grouped[t] = [];
              grouped[t].push(sched.name ? sched.name.trim() : '약품');
            });

            // "08:30 아모잘탄정 외 1건 · 13:00 소화제 · 19:00 비타민" 포맷 생성
            const summaryParts = Object.entries(grouped).map(([time, names]) => {
              const firstMed = names[0];
              const extraCount = names.length - 1;
              const medDesc = extraCount > 0 ? `${firstMed} 외 ${extraCount}건` : firstMed;
              return `${time} ${medDesc}`;
            });

            // 전체 일정을 단 1장의 카드로 깔끔하게 등록
            items.push({
              id: 'today-daily-briefing',
              type: 'routine',
              title: `오늘의 복약 브리핑 (총 ${calList.length}건)`,
              text: summaryParts.join(' · '),
              time: '오늘 일정',
              read: false,
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

    // ★ 3. 실시간 알림 이벤트 수신 (30분 전 예비 알림 + 정시 본 알람)
    const handleNewDoseAlarm = (e) => {
      const item = e.detail;
      if (!item) return;

      const isPre = Boolean(item.isPreAlarm);
      const newNotifId = `realtime-dose-${isPre ? 'pre' : 'main'}-${item.time}`;

      setNotifications((prev) => {
        // 중복 추가 방지
        if (prev.some((n) => n.id === newNotifId)) return prev;

        return [
          {
            id: newNotifId,
            type: 'routine',
            title: isPre ? '⏰ 복약 30분 전 안내' : '💊 지금 복약할 시간입니다!',
            text: isPre 
              ? `[${item.time}] '${item.name}' 복약 30분 전입니다. 미리 준비하세요.`
              : `[${item.time}] '${item.name}' 복용 시간입니다. 잊지 말고 복용하세요!`,
            time: item.time,
            read: false, // 미읽음 표시로 뱃지 카운트 증가
          },
          ...prev,
        ];
      });
    };

    window.addEventListener('NEW_MEDICATION_ALARM', handleNewDoseAlarm);

    return () => {
      isMounted = false;
      window.removeEventListener('NEW_MEDICATION_ALARM', handleNewDoseAlarm);
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
        {/* 좌측: 모바일 메뉴 토글 버튼 & 로고 심볼 */}
        <div className="navbar-left">
          <button
            type="button"
            className={`menu-toggle-btn ${isSidebarOpen ? 'is-open' : ''}`}
            onClick={onToggleSidebar}
            aria-label="메뉴 토글"
            title="메뉴 열기/닫기"
          >
            <div className="menu-icon-bars">
              <span className="bar-row"><i className="dot" /><span className="line" /></span>
              <span className="bar-row"><i className="dot" /><span className="line" /></span>
              <span className="bar-row"><i className="dot" /><span className="line" /></span>
            </div>
          </button>

          <Link to="/" className="navbar-logo-symbol" title="제때약 홈으로 이동">
            <img src={logoImg} alt="제때약 로고 심볼" className="logo-symbol-img" />
          </Link>
        </div>

        {/* 중앙: 브랜드 명 */}
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
                  <i className="fa-regular fa-bell bell-icon" aria-hidden="true" />
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
                            <i className="fa-regular fa-bell" aria-hidden="true" />
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
                aria-label="로그아웃"
                title="로그아웃"
              >
                <span className="logout-text">로그아웃</span>
                <i className="fa-solid fa-right-from-bracket logout-icon" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div className="guest-actions">
              <Link to="/login" className="nav-link-login">로그인</Link>
              <span className="nav-divider">/</span>
              <Link to="/signup" className="nav-link-signup">회원가입</Link>
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