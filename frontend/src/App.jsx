import { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import MainLayout from './components/layout/MainLayout';
import MainPage from './features/main/MainPage';
import CalendarPage from './calendarpage/CalendarPage';
import GuidePage from './features/guide/GuidePage';
import MyPage from './features/mypage/MyPage';
import FamilyPage from "./features/family/FamilyPage";
import MedicationChat from './features/chatbot/components/MedicationChat';
import CommunityPage from './features/community/CommunityPage';
import AdminPage from './features/admin/AdminPage';
import LoginPage from './components/LoginPage';
import SignupPage from './components/SignupPage';
import MedicationRegisterPage from './features/medication/MedicationRegisterPage';
import { useDialog } from './contexts/DialogContext';
import { ReadingProvider } from './contexts/ReadingContext';
import './App.css';

const getFormattedDate = (targetDate) => {
  const y = targetDate.getFullYear();
  const m = String(targetDate.getMonth() + 1).padStart(2, '0');
  const d = String(targetDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/**
 * 로그인 필수 보호 라우트 (비로그인 시 강제 로그인 이동)
 */
function ProtectedRoute({ isLoggedIn, children }) {
  const location = useLocation();

  if (!isLoggedIn) {
    const nextPath = location.pathname + location.search;
    const nextQuery = nextPath && nextPath !== '/' ? `?next=${encodeURIComponent(nextPath)}` : '';
    return <Navigate to={`/login${nextQuery}`} replace />;
  }

  return children;
}

/**
 * 비로그인 전용 라우트 (이미 로그인 상태면 메인으로 튕겨냄)
 */
function PublicOnlyRoute({ isLoggedIn, children }) {
  if (isLoggedIn) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function App() {
  const navigate = useNavigate();
  const { showAlert } = useDialog();

  const [isLoggedIn, setIsLoggedIn] = useState(() => Boolean(
    localStorage.getItem('user')
  ));
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('user'));
    } catch {
      return null;
    }
  });

  // 정시 복약 알람 모달 상태
  const [globalAlertItem, setGlobalAlertItem] = useState(null);

  // ★ 1. 로그인 후 알림 권한 유도 모달 상태 (사용자 클릭 유도)
  const [showPermissionModal, setShowPermissionModal] = useState(false);

  // 세션 userId 자동 복구
  useEffect(() => {
    if (user?.username && (!user?.userId || !user?.role || user?.pushEnabled === undefined || user?.isAdmin === undefined || user?.birthdate === undefined)) {
      const targetUser = user.username === 'demo' ? 'test12' : user.username;
      fetch(`/api/users/profile?username=${encodeURIComponent(targetUser)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && data.userId) {
            setUser((curr) => {
              const updated = {
                ...curr,
                userId: data.userId,
                id: data.userId,
                username: data.username || curr?.username || targetUser,
                name: curr?.name || data.nickname || '체험 사용자',
                role: data.role || curr?.role || 'USER',
                isAdmin: data.isAdmin === true || Number(data.isAdmin) === 1,
                pushEnabled: data.pushEnabled !== false && data.pushEnabled !== 0 && data.pushEnabled !== '0',
                // 생년월일은 읽기 쉬운 화면을 고르는 데만 사용하고 복용 주의기록은 숨기지 않음
                birthdate: data.birthdate || null,
              };
              localStorage.setItem('user', JSON.stringify(updated));
              return updated;
            });
          }
        })
        .catch(() => {});
    }
  }, [user?.username, user?.userId, user?.role, user?.isAdmin, user?.pushEnabled, user?.birthdate]);

  // 백엔드 세션 만료(401) 감지 시 유령 로그인 상태 자동 초기화
  useEffect(() => {
    const handleSessionExpired = () => {
      setIsLoggedIn(false);
      setUser(null);
      localStorage.removeItem('user');
      navigate('/login?expired=1', { replace: true });
    };

    window.addEventListener('AUTH_SESSION_EXPIRED', handleSessionExpired);
    return () => {
      window.removeEventListener('AUTH_SESSION_EXPIRED', handleSessionExpired);
    };
  }, [navigate]);

  // ★ 2. 로그인 시 브라우저 권한 상태를 확인하고, 미결정('default')이면 안내 모달 띄우기
  useEffect(() => {
    const pushEnabled = user?.pushEnabled !== false && user?.pushEnabled !== 0 && user?.pushEnabled !== '0';
    if (!pushEnabled) setShowPermissionModal(false);
    if (isLoggedIn && pushEnabled && 'Notification' in window) {
      const isAlreadyDismissed = sessionStorage.getItem('notif_modal_dismissed') === 'true';
      if (Notification.permission === 'default' && !isAlreadyDismissed) {
        setShowPermissionModal(true);
      }
    }
  }, [isLoggedIn, user?.pushEnabled]);

  // 사용자가 모달에서 [알림 받기 (예)]를 클릭했을 때 실행되는 핸들러 (User Gesture 만족)
  const handleRequestPermission = async () => {
    setShowPermissionModal(false);
    if ('Notification' in window) {
      try {
        const result = await Notification.requestPermission();
        if (result === 'granted') {
          new Notification('제때약 복약 알림이 활성화되었습니다', {
            body: '정해진 복약 시간 30분 전과 정시에 알림을 보내드립니다.',
            icon: '/favicon.ico',
          });
        }
      } catch (err) {
        console.warn('알림 권한 요청 오류:', err);
      }
    }
  };

  // 사용자가 모달에서 [나중에 하기 (아니오)]를 클릭했을 때
  const handleDismissPermission = () => {
    setShowPermissionModal(false);
    sessionStorage.setItem('notif_modal_dismissed', 'true');
  };

  // 3. 전역 00초 칼동기화 타이머: [30분 전 예비 알림] + [정시 본 알람]
  useEffect(() => {
    const medicationAlertsEnabled = user?.pushEnabled !== false
      && user?.pushEnabled !== 0
      && user?.pushEnabled !== '0';
    if (!medicationAlertsEnabled) {
      setGlobalAlertItem(null);
      return;
    }

    let resolvedUserId = user?.userId || user?.id;
    if (!resolvedUserId) {
      try {
        const stored = JSON.parse(localStorage.getItem('user'));
        resolvedUserId = stored?.userId || stored?.id;
      } catch {
        resolvedUserId = null;
      }
    }
    const currentUserId = resolvedUserId;
    if (!currentUserId) return;

    let timeoutId;
    let intervalId;
    let isActive = true;
    const alertedTags = new Set();

    const triggerCheck = async () => {
      const now = new Date();
      const currentH = String(now.getHours()).padStart(2, '0');
      const currentM = String(now.getMinutes()).padStart(2, '0');
      const currentTimeStr = `${currentH}:${currentM}`;
      const todayDateStr = getFormattedDate(now);

      const futureDate = new Date(now.getTime() + 30 * 60 * 1000);
      const preH = String(futureDate.getHours()).padStart(2, '0');
      const preM = String(futureDate.getMinutes()).padStart(2, '0');
      const preTimeStr = `${preH}:${preM}`;

      try {
        const res = await fetch(`/api/calendar?userId=${currentUserId}&date=${todayDateStr}`);
        if (!res.ok) return;
        const todayList = await res.json();
        if (!isActive || !Array.isArray(todayList)) return;

        const timeGroups = {};
        todayList.forEach((item) => {
          const targetTime = String(item.time || '').substring(0, 5);
          const isAlarmOff = item.alarmEnabled === false || item.alarmEnabled === 0 || item.alarmEnabled === '0';
          const isEnabled = !isAlarmOff;
          const isTaken = Boolean(item.takenAt);

          if (isEnabled && !isTaken) {
            if (!timeGroups[targetTime]) timeGroups[targetTime] = [];
            timeGroups[targetTime].push(item);
          }
        });

        // 30분 전 예비 알림
        if (timeGroups[preTimeStr]) {
          const items = timeGroups[preTimeStr];
          const combinedNames = items.map(i => i.name).join(', ');
          const preTag = `pre-dose-group-${preTimeStr}-${currentTimeStr}`;

          if (!alertedTags.has(preTag)) {
            alertedTags.add(preTag);

            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification(`⏰ [복약 30분 전 안내]`, {
                body: `30분 뒤(${preTimeStr}) ${combinedNames} 복용 시간입니다. 미리 준비하세요!`,
                icon: '/favicon.ico',
                tag: preTag,
              });
            }

            window.dispatchEvent(new CustomEvent('NEW_MEDICATION_ALARM', {
              detail: {
                name: combinedNames,
                time: preTimeStr,
                isPreAlarm: true,
              }
            }));
          }
        }

        // 정시 본 알람
        if (timeGroups[currentTimeStr]) {
          const items = timeGroups[currentTimeStr];
          const combinedNames = items.map(i => i.name).join(', ');
          const mainTag = `main-dose-group-${currentTimeStr}`;

          if (!alertedTags.has(mainTag)) {
            alertedTags.add(mainTag);

            setGlobalAlertItem({
              scheduleIds: items.map(i => i.scheduleId),
              name: combinedNames,
              time: currentTimeStr,
            });

            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification(`[복약 알림] ${combinedNames}`, {
                body: `현재 복용 시간(${currentTimeStr})입니다. 잊지 말고 복용하세요!`,
                icon: '/favicon.ico',
                tag: mainTag,
              });
            }

            window.dispatchEvent(new CustomEvent('NEW_MEDICATION_ALARM', {
              detail: {
                name: combinedNames,
                time: currentTimeStr,
                isPreAlarm: false,
              }
            }));
          }
        }
      } catch (e) {
        console.error("전역 복약 알림 검사 오류:", e);
      }
    };

    triggerCheck();

    const now = new Date();
    const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();

    timeoutId = setTimeout(() => {
      triggerCheck();
      intervalId = setInterval(triggerCheck, 60000);
    }, Math.max(0, msUntilNextMinute));

    return () => {
      isActive = false;
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, [user?.userId, user?.pushEnabled]);

  // 전역 모달 복약 완료 처리
  const handleConfirmTakeFromGlobalAlert = async () => {
    if (!globalAlertItem) return;
    try {
      const ids = globalAlertItem.scheduleIds || [globalAlertItem.scheduleId];
      await Promise.all(
        ids.map(id =>
          fetch(`/api/calendar/${id}/toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taken: true }),
          })
        )
      );
    } catch (err) {
      console.error("복약 완료 처리 통신 실패:", err);
    } finally {
      setGlobalAlertItem(null);
    }
  };

  const handleLoginSuccess = (loginData) => {
    const loggedInUser = {
      userId: loginData.userId,
      username: loginData.username,
      name: loginData.nickname || loginData.username,
      email: loginData.email || '',
      role: loginData.role || 'USER',
      isAdmin: loginData.isAdmin === true || Number(loginData.isAdmin) === 1,
      birthdate: loginData.birthdate,
    };
    setIsLoggedIn(true);
    setUser(loggedInUser);
    localStorage.setItem('user', JSON.stringify(loggedInUser));
    const next = new URLSearchParams(window.location.search).get('next');
    const targetUrl = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
    navigate(targetUrl, { replace: true });
  };

  const handleLogout = async () => {
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error();
    } catch {
      await showAlert('로그아웃하지 못했습니다. 다시 시도해주세요.', '로그아웃 실패');
      return;
    }
    setIsLoggedIn(false);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.removeItem('notif_modal_dismissed');
    navigate('/');
  };

  const handleUserUpdated = (changes) => {
    setUser((currentUser) => {
      const updatedUser = { ...currentUser, ...changes };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      return updatedUser;
    });
  };

  const handleLoginDemoToggle = async () => {
    try {
      const res = await fetch('/api/auth/demo', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        handleLoginSuccess(data);
        return;
      }
    } catch (e) {
      console.warn('데모 로그인 API 연동 실패, 폴백 진행:', e);
    }

    let targetUsername = 'test12';
    try {
      const mealRes = await fetch('/api/users/meal-times?userId=1');
      if (mealRes.ok) {
        const mealData = await mealRes.json();
        if (mealData?.username) targetUsername = mealData.username;
      }
    } catch {
      // fallback to test12
    }

    let profileData = null;
    try {
      const profileRes = await fetch(`/api/users/profile?username=${encodeURIComponent(targetUsername)}`);
      if (profileRes.ok) {
        profileData = await profileRes.json();
      }
    } catch {
      // fallback
    }

    const demoUser = {
      userId: profileData?.userId || 1,
      username: profileData?.username || targetUsername,
      name: profileData?.nickname || '체험 사용자',
      nickname: profileData?.nickname || '체험 사용자',
      email: profileData?.email || '',
      role: profileData?.role || 'USER',
      isAdmin: profileData?.isAdmin === true || Number(profileData?.isAdmin) === 1,
      profileImageUrl: profileData?.profileImageUrl || '',
      birthdate: profileData?.birthdate || null,
      isDemo: true,
    };

    setIsLoggedIn(true);
    setUser(demoUser);
    localStorage.setItem('user', JSON.stringify(demoUser));
    const next = new URLSearchParams(window.location.search).get('next');
    const targetUrl = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
    navigate(targetUrl, { replace: true });
  };

  return (
    <ReadingProvider user={user}>
      <Routes>
        {/* 비로그인 전용 라우트 (이미 로그인된 상태면 메인으로 튕겨냄) */}
        <Route
          path="/login"
          element={
            <PublicOnlyRoute isLoggedIn={isLoggedIn}>
              <LoginPage onLoginSuccess={handleLoginSuccess} onLoginDemoToggle={handleLoginDemoToggle} />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/signup"
          element={
            <PublicOnlyRoute isLoggedIn={isLoggedIn}>
              <SignupPage />
            </PublicOnlyRoute>
          }
        />

        {/* 보호된 라우트 (비로그인 상태면 강제로 /login으로 리다이렉트) */}
        <Route
          path="/"
          element={
            <ProtectedRoute isLoggedIn={isLoggedIn}>
              <MainLayout
                isLoggedIn={isLoggedIn}
                user={user}
                onLogout={handleLogout}
                onLoginDemoToggle={handleLoginDemoToggle}
              >
                <MainPage user={user} />
              </MainLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/calendar"
          element={
            <ProtectedRoute isLoggedIn={isLoggedIn}>
              <MainLayout
                isLoggedIn={isLoggedIn}
                user={user}
                onLogout={handleLogout}
                onLoginDemoToggle={handleLoginDemoToggle}
              >
                <CalendarPage user={user} />
              </MainLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/medication/register"
          element={
            <ProtectedRoute isLoggedIn={isLoggedIn}>
              <MainLayout
                isLoggedIn={isLoggedIn}
                user={user}
                onLogout={handleLogout}
                onLoginDemoToggle={handleLoginDemoToggle}
              >
                <MedicationRegisterPage user={user} />
              </MainLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/guide"
          element={
            <ProtectedRoute isLoggedIn={isLoggedIn}>
              <MainLayout
                isLoggedIn={isLoggedIn}
                user={user}
                onLogout={handleLogout}
                onLoginDemoToggle={handleLoginDemoToggle}
              >
                <GuidePage key={user?.userId || "guest"} />
              </MainLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/mypage"
          element={
            <ProtectedRoute isLoggedIn={isLoggedIn}>
              <MainLayout
                isLoggedIn={isLoggedIn}
                user={user}
                onLogout={handleLogout}
                onLoginDemoToggle={handleLoginDemoToggle}
              >
                <MyPage user={user} onUserUpdated={handleUserUpdated} onLogout={handleLogout} />
              </MainLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/family"
          element={
            <ProtectedRoute isLoggedIn={isLoggedIn}>
              <MainLayout
                isLoggedIn={isLoggedIn}
                user={user}
                onLogout={handleLogout}
                onLoginDemoToggle={handleLoginDemoToggle}
              >
                <FamilyPage user={user} onUserUpdated={handleUserUpdated} />
              </MainLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/chat"
          element={
            <ProtectedRoute isLoggedIn={isLoggedIn}>
              <MainLayout
                isLoggedIn={isLoggedIn}
                user={user}
                onLogout={handleLogout}
                onLoginDemoToggle={handleLoginDemoToggle}
              >
                <MedicationChat key={user?.userId || "guest"} />
              </MainLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/community"
          element={
            <ProtectedRoute isLoggedIn={isLoggedIn}>
              <MainLayout
                isLoggedIn={isLoggedIn}
                user={user}
                onLogout={handleLogout}
                onLoginDemoToggle={handleLoginDemoToggle}
              >
                <CommunityPage user={user} />
              </MainLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            (user?.isAdmin === true || Number(user?.isAdmin) === 1) ? (
              <MainLayout
                isLoggedIn={isLoggedIn}
                user={user}
                onLogout={handleLogout}
                onLoginDemoToggle={handleLoginDemoToggle}
              >
                <AdminPage />
              </MainLayout>
            ) : <Navigate to="/" replace />
          }
        />

        {/* 미등록 경로(404) 와일드카드 처리: 로그인 상태에 따라 메인 또는 로그인창으로 이동 */}
        <Route
          path="*"
          element={<Navigate to={isLoggedIn ? "/" : "/login"} replace />}
        />
      </Routes>

      {/* ★ 1. 로그인 후 알림 권한 요청 모달 (사용자 명시적 클릭 유도) */}
      {showPermissionModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.45)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 99998,
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            padding: '28px 24px',
            textAlign: 'center',
            maxWidth: '360px',
            width: '90%',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.2)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px', color: '#682335' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="38" height="38">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <h4 style={{ fontSize: '18px', fontWeight: 'bold', color: '#2b2520', margin: '0 0 8px 0' }}>
              복약 알림을 받아보시겠어요?
            </h4>
            <p style={{ fontSize: '13px', color: '#665f57', margin: '0 0 24px 0', lineHeight: '1.5' }}>
              정해진 복약 시간 30분 전과 제때에<br />
              바탕화면 알림으로 잊지 않게 알려드립니다.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                style={{
                  flex: 1,
                  padding: '11px 0',
                  borderRadius: '8px',
                  border: '1px solid #d9d2c9',
                  background: '#f7f6f4',
                  color: '#5c544d',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
                onClick={handleDismissPermission}
              >
                나중에
              </button>
              <button
                type="button"
                style={{
                  flex: 1,
                  padding: '11px 0',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#682335',
                  color: '#ffffff',
                  fontSize: '14px',
                  fontWeight: '700',
                  cursor: 'pointer',
                }}
                onClick={handleRequestPermission}
              >
                알림 받기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 정시 복약 전역 모달 */}
      {globalAlertItem && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.55)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 99999,
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            padding: '28px 24px',
            textAlign: 'center',
            maxWidth: '380px',
            width: '90%',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.25)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px', color: '#682335' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="42" height="42">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            </div>
            <h4 style={{ fontSize: '18px', fontWeight: 'bold', color: '#2b2520', margin: '0 0 8px 0' }}>
              복약할 시간입니다!
            </h4>
            <p style={{ fontSize: '16px', color: '#682335', margin: '10px 0 6px 0', fontWeight: '700' }}>
              [{globalAlertItem.time}] {globalAlertItem.name}
            </p>
            <p style={{ fontSize: '13px', color: '#7a7066', margin: '0 0 24px 0', lineHeight: '1.4' }}>
              정해진 시간에 복약하면 효과가 훨씬 좋습니다. 지금 복용하셨나요?
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button 
                type="button" 
                style={{
                  flex: 1,
                  padding: '11px 0',
                  borderRadius: '8px',
                  border: '1px solid #d9d2c9',
                  background: '#f7f6f4',
                  color: '#5c544d',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
                onClick={() => setGlobalAlertItem(null)}
              >
                닫기
              </button>
              <button 
                type="button" 
                style={{
                  flex: 1,
                  padding: '11px 0',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#682335',
                  color: '#ffffff',
                  fontSize: '14px',
                  fontWeight: '700',
                  cursor: 'pointer',
                }}
                onClick={handleConfirmTakeFromGlobalAlert}
              >
                지금 복약 완료
              </button>
            </div>
          </div>
        </div>
      )}
    </ReadingProvider>
  );
}

export default App;
