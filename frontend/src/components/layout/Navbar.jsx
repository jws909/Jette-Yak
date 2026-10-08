import { useState, useEffect, useRef, useMemo } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import logoImg from '../../assets/logo.png';
import UiDialog from '../ui/UiDialog';
import './Navbar.css';
import { mergeNotificationItems } from '../../utils/notificationState';
import { formatRelativeTime, localNotificationDate, parseDateToMs } from '../../utils/notificationTime';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export default function Navbar({
  onToggleSidebar,
  isSidebarOpen,
  isLoggedIn,
  user,
  onLogout
}) {
  const navigate = useNavigate();
  const currentUserId = user?.userId || user?.id;
  const isAdmin = user?.isAdmin === true || Number(user?.isAdmin) === 1;
  const [showNotification, setShowNotification] = useState(false);
  const [activeTab, setActiveTab] = useState('unread');
  const [notifications, setNotifications] = useState([]);
  // 같은 조회/이벤트의 목록과 뱃지는 동일한 기준 시각으로 계산
  const [notificationNow, setNotificationNow] = useState(() => Date.now());
  const [notificationDialog, setNotificationDialog] = useState(null);

  const notifBoxRef = useRef(null);
  const readLock = useRef(false);
  const confirmedRead = useRef(new Set());

  // 1. 가족 초대 수락/거절 핸들러 함수
  const handleRespondInvitation = async (inviteId, action) => {
    if (!currentUserId) return;

    try {
      const res = await fetch('/api/family/invitations/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inviteId: inviteId,
          userId: currentUserId,
          action: action // 'ACCEPT' 또는 'REJECT'
        })
      });

      const data = await res.json();

      if (res.ok) {
        if (action === 'ACCEPT') {
          setNotificationDialog({title:'가족 초대를 수락했습니다.',text:'가족 약 관리에 새 가족 정보가 반영됩니다.',reload:true});
          setNotifications((prev) => prev.filter((n) => n.id !== `invitation-${inviteId}`));
        } else {
          setNotificationDialog({title:'가족 초대를 거절했습니다.',text:'해당 초대는 알림 목록에서 제거됐습니다.'});
          setNotifications((prev) => prev.filter((n) => n.id !== `invitation-${inviteId}`));
        }
      } else {
        setNotificationDialog({title:'초대 요청을 처리하지 못했습니다.',text:data.message || '잠시 후 다시 시도해주세요.'});
      }
    } catch (err) {
      console.error('초대 처리 에러:', err);
      setNotificationDialog({title:'서버에 연결하지 못했습니다.',text:'네트워크 상태를 확인한 뒤 다시 시도해주세요.'});
    }
  };

  // 로그인 시 사용자의 실제 복약 일정(원샷 브리핑) 및 처방전 주의사항 로드
  useEffect(() => {
    if (!isLoggedIn || !currentUserId) {
      const clearTimer=window.setTimeout(()=>setNotifications([]),0);
      return ()=>window.clearTimeout(clearTimer);
    }

    const userId = currentUserId;
    confirmedRead.current = new Set();

    let isMounted = true;

    const loadNotifications = async () => {
      const items = [];
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      // ★ 2. 나에게 도착한 가족 연동 초대 내역 조회
      try {
        const invRes = await fetch(`/api/family/invitations?userId=${userId}`);
        if (invRes.ok) {
          const invList = await invRes.json();
          if (Array.isArray(invList) && invList.length > 0) {
            invList.forEach((inv) => {
              const tMs = parseDateToMs(inv.createdAt);
              items.push({
                id: `invitation-${inv.inviteId}`,
                type: 'routine',
                title: '가족 연동 초대 요청',
                text: `'${inv.senderName}'님이 [${inv.familyName}] 그룹으로 초대했습니다.`,
                time: formatRelativeTime(tMs, inv.createdAt || '방금 전'),
                timestamp: tMs,
                read: false,
                isInvitation: true,
                inviteId: inv.inviteId,
              });
            });
          }
        }
      } catch (err) {
        console.warn('Navbar 가족 초대 조회 실패:', err);
      }

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
                timestamp: now.getTime(),
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
                    timestamp: now.getTime(),
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
            const sorted = [...calList].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
            
            const grouped = {};
            sorted.forEach((sched) => {
              const t = (sched.time || '').substring(0, 5);
              if (!grouped[t]) grouped[t] = [];
              grouped[t].push(sched.name ? sched.name.trim() : '약품');
            });

            const summaryParts = Object.entries(grouped).map(([time, names]) => {
              const firstMed = names[0];
              const extraCount = names.length - 1;
              const medDesc = extraCount > 0 ? `${firstMed} 외 ${extraCount}건` : firstMed;
              return `${time} ${medDesc}`;
            });

            items.push({
              id: 'today-daily-briefing',
              type: 'routine',
              title: `오늘의 복약 브리핑 (총 ${calList.length}건)`,
              text: summaryParts.join(' · '),
              time: '오늘 일정',
              timestamp: now.getTime(),
              read: false,
            });
          }
        }
      } catch (err) {
        console.warn('Navbar 복약 일정 조회 실패:', err);
      }

      // 커뮤니티 활동과 관리자 처리 결과는 DB에 저장된 알림을 읽어 다른 기기에서도 유지한다.
      try {
        const savedRes = await fetch('/api/notifications', { headers: { Accept: 'application/json' } });
        if (savedRes.ok) {
          const savedData = await savedRes.json();
          const savedItems = (Array.isArray(savedData.items) ? savedData.items : []).map(item => {
            const tMs = parseDateToMs(item.createdAt);
            return {
              id: `saved-${item.notificationId}`,
              notificationId: item.notificationId,
              type: item.type === 'ADMIN_REPORT' || item.type === 'REPORT_RESULT' ? 'warning' : 'routine',
              title: item.title,
              text: item.content,
              time: formatRelativeTime(tMs, item.createdAt),
              timestamp: tMs,
              read: Number(item.read) === 1,
              saved: true,
              postId: item.postId,
              targetType: item.targetType,
            };
          });
          items.unshift(...savedItems);
        }
      } catch (err) {
        console.warn('Navbar 저장 알림 조회 실패:', err);
      }

      if (isMounted) {
        setNotificationNow(Date.now());
        setNotifications(previous => mergeNotificationItems(previous, items, confirmedRead.current, currentUserId));
      }
    };

    loadNotifications();
    const notificationTimer = window.setInterval(loadNotifications, 30000);

    // ★ 3. 실시간 알림 이벤트 수신 (30분 전 예비 알림 + 정시 본 알람)
    const handleNewDoseAlarm = (e) => {
      const item = e.detail;
      if (!item) return;

      const isPre = Boolean(item.isPreAlarm);
      // 이벤트에 날짜가 없을 때도 현재 날짜를 여기서 결정. 조회 함수의 지역 변수에 의존하지 않음
      const eventDate = item.date || localNotificationDate();
      const newNotifId = `realtime-dose-${isPre ? 'pre' : 'main'}-${eventDate}-${item.time}`;
      const tMs = parseDateToMs(`${eventDate}T${item.time}:00`);
      setNotificationNow(Date.now());

      setNotifications((prev) => {
        if (prev.some((n) => n.id === newNotifId)) return prev;

        return [
          {
            id: newNotifId,
            userId: currentUserId,
            type: 'routine',
            title: isPre ? '복약 30분 전 안내' : '지금 복약할 시간입니다!',
            text: isPre 
              ? `[${item.time}] '${item.name}' 복약 30분 전입니다. 미리 준비하세요.`
              : `[${item.time}] '${item.name}' 복용 시간입니다. 잊지 말고 복용하세요!`,
            time: item.time,
            timestamp: tMs,
            read: false,
          },
          ...prev,
        ];
      });
    };

    window.addEventListener('NEW_MEDICATION_ALARM', handleNewDoseAlarm);

    return () => {
      isMounted = false;
      window.clearInterval(notificationTimer);
      window.removeEventListener('NEW_MEDICATION_ALARM', handleNewDoseAlarm);
    };
  }, [isLoggedIn, currentUserId]);

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

  // 전체 알림 정렬: 가족 연동 초대는 항상 최상단, 그 외에는 최신순
  const sortedNotifications = useMemo(() => {
    return [...notifications].sort((a, b) => {
      if (a.isInvitation && !b.isInvitation) return -1;
      if (!a.isInvitation && b.isInvitation) return 1;
      const timeA = a.timestamp || 0;
      const timeB = b.timestamp || 0;
      return timeB - timeA;
    });
  }, [notifications]);

  // 안 읽음 목록: 가족 초대 및 커뮤니티 알림은 사용자가 직접 처리/읽을 때까지 유지, 당일 복약/주의 알림은 24시간 이내 유지 (최대 5개)
  const unreadList = useMemo(() => {
    const now = notificationNow;
    return sortedNotifications.filter((n) => {
      if (n.isInvitation) return true;
      if (n.read) return false;
      if (n.saved) return true;
      const time = n.timestamp || now;
      return (now - time) < ONE_DAY_MS;
    }).slice(0, 5);
  }, [sortedNotifications, notificationNow]);

  // 전체 목록: 가족 초대 최상단 + 전체 알림 (최대 10개)
  const allList = useMemo(() => {
    return sortedNotifications.slice(0, 10);
  }, [sortedNotifications]);

  const displayedNotifications = activeTab === 'unread' ? unreadList : allList;

  // 알림 뱃지 카운트: 가족 초대 + 미확인 커뮤니티 알림 + 24시간 이내 미확인 당일 복약 알림 총 개수
  const unreadCount = useMemo(() => {
    const now = notificationNow;
    return notifications.filter((n) => {
      if (n.isInvitation) return true;
      if (n.read) return false;
      if (n.saved) return true;
      const time = n.timestamp || now;
      return (now - time) < ONE_DAY_MS;
    }).length;
  }, [notifications, notificationNow]);

  const markAllAsRead = async () => {
    if (readLock.current) return;
    readLock.current = true;
    const targetIds = notifications.map(item => item.id);
    try {
      const response = await fetch('/api/notifications/read-all', { method: 'PATCH' });
      if (!response.ok) throw new Error('알림을 읽음으로 저장하지 못했습니다. 다시 시도해주세요.');
      targetIds.forEach(id => confirmedRead.current.add(id));
      setNotifications(prev => prev.map(item => targetIds.includes(item.id) ? { ...item, read: true } : item));
    } catch (error) {
      setNotificationDialog({ title: '알림을 처리하지 못했습니다.', text: error.message });
    } finally {
      readLock.current = false;
    }
  };

  const markAsRead = async (item) => {
    if (item.isInvitation) return;
    if (item.saved && item.notificationId) {
      if (!item.read) {
        if (readLock.current) return;
        readLock.current = true;
        try {
          const response = await fetch('/api/notifications/' + encodeURIComponent(item.notificationId) + '/read', { method: 'PATCH' });
          if (!response.ok) throw new Error('알림을 읽음으로 저장하지 못했습니다. 다시 시도해주세요.');
          confirmedRead.current.add(item.id);
        } catch (error) {
          setNotificationDialog({ title: '알림을 처리하지 못했습니다.', text: error.message });
          return;
        } finally {
          readLock.current = false;
        }
      }
      setNotificationDialog(item);
      setShowNotification(false);
    } else {
      setNotificationDialog(item);
      setShowNotification(false);
    }
    const id = item.id;
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  function closeNotificationDialog(){ setNotificationDialog(null); }
  function confirmNotificationDialog(){
    if(notificationDialog?.reload){window.location.reload();return}
    closeNotificationDialog();
  }
  function followNotification(){
    const postId=notificationDialog?.postId;
    closeNotificationDialog();
    if(postId)navigate('/community?postId='+encodeURIComponent(postId));
  }

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
              {/* 관리자 진입은 알림 왼쪽에 표시. 모바일 메뉴가 열려 있으면 이동할 때 함께 닫기 */}
              {isAdmin && <NavLink
                to="/admin"
                className={({ isActive }) => `navbar-admin-link${isActive ? ' active' : ''}`}
                onClick={() => { setShowNotification(false); if (isSidebarOpen) onToggleSidebar?.(); }}
              >
                <svg className="navbar-admin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3l7 4v5c0 4.4-2.9 7.8-7 9-4.1-1.2-7-4.6-7-9V7l7-4zm-3 9l2 2 4-4" />
                </svg>
                <span>관리자 센터</span>
              </NavLink>}
              {isAdmin && <span className="nav-divider" aria-hidden="true">|</span>}
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
                      <div className="notif-header-title-row">
                        <strong>알림</strong>
                        {unreadCount > 0 && (
                          <button type="button" className="mark-read-btn" onClick={markAllAsRead}>
                            모두 읽음
                          </button>
                        )}
                      </div>
                      <div className="notif-tabs" role="tablist">
                        <button
                          type="button"
                          role="tab"
                          aria-selected={activeTab === 'unread'}
                          className={`notif-tab ${activeTab === 'unread' ? 'active' : ''}`}
                          onClick={() => setActiveTab('unread')}
                        >
                          안 읽음
                          {unreadCount > 0 && <span className="notif-tab-badge">{unreadCount}</span>}
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={activeTab === 'all'}
                          className={`notif-tab ${activeTab === 'all' ? 'active' : ''}`}
                          onClick={() => setActiveTab('all')}
                        >
                          전체
                        </button>
                      </div>
                    </div>
                    <div className="notif-list">
                      {displayedNotifications.length === 0 ? (
                        <div className="notif-empty">
                          <div className="notif-empty-icon">
                            <i className="fa-regular fa-bell" aria-hidden="true" />
                          </div>
                          <p className="notif-empty-text">
                            {activeTab === 'unread' ? '새로운 안 읽은 알림이 없습니다.' : '알림 내역이 없습니다.'}
                          </p>
                        </div>
                      ) : (
                        displayedNotifications.map((n) => (
                          <div
                            key={n.id}
                            className={`notif-item ${n.read ? 'read' : 'unread'}${n.isInvitation ? ' is-invitation' : ''}`}
                            onClick={() => markAsRead(n)}
                            onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();markAsRead(n)}}}
                            role="button"
                            tabIndex={0}
                          >
                            <div className={`notif-indicator ${n.type}`} />
                            <div className="notif-item-body">
                              <div className="notif-item-header">
                                <span className="notif-item-title">{n.title}</span>
                                {n.isInvitation ? (
                                  <span className="notif-pin-badge">
                                    <i className="fa-solid fa-thumbtack" aria-hidden="true" /> 고정
                                  </span>
                                ) : !n.read ? (
                                  <span className="notif-unread-dot" title="읽지 않음" />
                                ) : null}
                              </div>
                              <p className="notif-item-text">{n.text}</p>
                              <span className="notif-item-time">{n.time}</span>

                              {/* 초대 알림 전용 액션 버튼 영역 */}
                              {n.isInvitation && (
                                <div 
                                  className="notif-actions" 
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    type="button"
                                    className="notif-btn-accept"
                                    onClick={() => handleRespondInvitation(n.inviteId, 'ACCEPT')}
                                  >
                                    수락
                                  </button>
                                  <button
                                    type="button"
                                    className="notif-btn-reject"
                                    onClick={() => handleRespondInvitation(n.inviteId, 'REJECT')}
                                  >
                                    거절
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              <span className="nav-divider" aria-hidden="true">|</span>

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
            </div>
          )}
        </div>
      </div>
      <UiDialog open={Boolean(notificationDialog)} title={notificationDialog?.title} description={notificationDialog?.text} confirmLabel={notificationDialog?.postId?'게시글 보기':'확인'} cancelLabel={notificationDialog?.postId?'닫기':''} onCancel={closeNotificationDialog} onConfirm={notificationDialog?.postId?followNotification:confirmNotificationDialog}/>
    </header>
  );
}
