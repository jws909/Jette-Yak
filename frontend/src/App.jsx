import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import UiDialog from './components/ui/UiDialog';
import { saveIntakeStatus } from './utils/intakeApi';
import { formatTime24 } from './utils/dateTime.js';
import { showForegroundNotification } from './features/pwa/foregroundNotifications.js';
import { useBackgroundPush } from './features/pwa/useBackgroundPush.js';
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
  const { showAlert, showLoading, hideLoading } = useDialog();
  const logoutLock = useRef(false);

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
  const [pendingGlobalAlertItem, setGlobalAlertItem] = useState(null);
  const medicationAlertsEnabled = user?.pushEnabled !== false && user?.pushEnabled !== 0 && user?.pushEnabled !== '0';
  const alertUserId = user?.userId || user?.id;
  const backgroundPush = useBackgroundPush({ userId: isLoggedIn ? alertUserId : null, enabled: medicationAlertsEnabled });
  const serverPushActiveRef = useRef(false);
  useEffect(() => { serverPushActiveRef.current = backgroundPush.active; }, [backgroundPush.active]);
  const alertSession = useMemo(() => ({ userId: alertUserId, enabled: medicationAlertsEnabled, isLoggedIn }), [isLoggedIn, medicationAlertsEnabled, alertUserId]);
  // 알림을 끄거나 사용자가 바뀌면 이전 알람을 즉시 숨깁니다.
  const globalAlertItem = isLoggedIn && medicationAlertsEnabled
    && pendingGlobalAlertItem?.session === alertSession ? pendingGlobalAlertItem : null;
  const [globalAlertSaving, setGlobalAlertSaving] = useState(false);
  const [globalAlertError, setGlobalAlertError] = useState('');
  const [appFeedback, setAppFeedback] = useState('');
  const intakeLock = useRef(false);

  // ★ 1. 로그인 후 알림 권한 유도 모달 상태 (사용자 클릭 유도)
  const [permissionDismissed, setPermissionDismissed] = useState(() => sessionStorage.getItem('notif_modal_dismissed') === 'true');
  const [notificationPermission, setNotificationPermission] = useState(() => 'Notification' in window ? Notification.permission : 'unsupported');
  const showPermissionModal = isLoggedIn && medicationAlertsEnabled
    && !backgroundPush.checking && !permissionDismissed
    && (notificationPermission === 'default' || (backgroundPush.environment.supported && backgroundPush.config?.enabled
      && notificationPermission === 'granted' && !backgroundPush.subscribed));
  const canUseBackgroundPush = backgroundPush.environment.supported && backgroundPush.config?.enabled;

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
      setGlobalAlertItem(null);
      localStorage.removeItem('user');
      navigate('/login?expired=1', { replace: true });
    };

    window.addEventListener('AUTH_SESSION_EXPIRED', handleSessionExpired);
    return () => {
      window.removeEventListener('AUTH_SESSION_EXPIRED', handleSessionExpired);
    };
  }, [navigate]);

  // 브라우저 설정 변경은 실제 창 포커스 이벤트에서 다시 확인합니다.
  useEffect(() => {
    const syncPermission = () => setNotificationPermission('Notification' in window ? Notification.permission : 'unsupported');
    window.addEventListener('focus', syncPermission);
    return () => window.removeEventListener('focus', syncPermission);
  }, []);

  // 사용자가 모달에서 [알림 받기 (예)]를 클릭했을 때 실행되는 핸들러 (User Gesture 만족)
  const handleRequestPermission = async () => {
    if (canUseBackgroundPush) {
      try {
        if (await backgroundPush.enable()) {
          setPermissionDismissed(true);
          setNotificationPermission(Notification.permission);
          setAppFeedback('이 기기의 복약 알림을 켰어요. 앱을 닫아도 복약 시간 30분 전과 정시에 알려드려요. 마이페이지에서 테스트 알림을 보내볼 수 있어요.');
        }
      } catch (error) {
        setPermissionDismissed(true);
        setNotificationPermission(Notification.permission);
        await showAlert(error.message, '알림 설정 안내');
      }
      return;
    }
    setPermissionDismissed(true);
    if ('Notification' in window) {
      try {
        const result = await Notification.requestPermission();
        setNotificationPermission(result);
        if (result === 'granted') {
          setAppFeedback('복약 알림을 켰어요. 사이트나 앱이 열려 있고 인터넷에 연결되어 있을 때 복약 시간을 확인해 알려드려요.');
          void showForegroundNotification('제때약 복약 알림을 켰어요', {
            body: '사이트나 앱이 열려 있고 인터넷에 연결되어 있을 때 복약 시간 30분 전과 정시에 확인해 알려드려요.',
            data: { type: 'notification-permission', url: '/' },
          });
        }
      } catch (err) {
        console.warn('알림 권한 요청 오류:', err);
      }
    }
  };

  // 사용자가 모달에서 [나중에 하기 (아니오)]를 클릭했을 때
  const handleDismissPermission = () => {
    setPermissionDismissed(true);
    sessionStorage.setItem('notif_modal_dismissed', 'true');
  };

  // 3. 전역 00초 칼동기화 타이머: [30분 전 예비 알림] + [정시 본 알람]
  useEffect(() => {
    if (!isLoggedIn || !medicationAlertsEnabled) return;

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
      const futureDateStr = getFormattedDate(futureDate);
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

        // 자정을 넘는 30분 전 알림은 다음 날 일정을 확인.
        let preItems = timeGroups[preTimeStr] || [];
        if (futureDateStr !== todayDateStr) {
          const nextResponse = await fetch(`/api/calendar?userId=${currentUserId}&date=${futureDateStr}`);
          const nextItems = nextResponse.ok ? await nextResponse.json() : [];
          if (!isActive) return;
          preItems = Array.isArray(nextItems) ? nextItems.filter(item =>
            String(item.time || '').substring(0, 5) === preTimeStr && !item.takenAt
            && ![false, 0, '0'].includes(item.alarmEnabled)) : [];
        }

        // 30분 전 예비 알림
        if (preItems.length) {
          const items = preItems;
          const combinedNames = items.map(i => i.name).join(', ');
          const preTag = `pre-dose-group-${futureDateStr}-${preTimeStr}-${currentTimeStr}`;

          if (!alertedTags.has(preTag)) {
            alertedTags.add(preTag);

            if (!serverPushActiveRef.current && 'Notification' in window && Notification.permission === 'granted') {
              void showForegroundNotification('제때약 · 복약 30분 전 안내', {
                body: `30분 뒤(${preTimeStr}) 복약할 시간이 다가와요. 앱에서 오늘 일정을 확인해 주세요.`,
                tag: preTag,
                data: { type: 'medication-reminder', url: '/', date: futureDateStr, time: preTimeStr, isPreAlarm: true },
              });
            }

            window.dispatchEvent(new CustomEvent('NEW_MEDICATION_ALARM', {
              detail: {
                name: combinedNames,
                time: preTimeStr,
                date: futureDateStr,
                isPreAlarm: true,
              }
            }));
          }
        }

        // 정시 본 알람
        if (timeGroups[currentTimeStr]) {
          const items = timeGroups[currentTimeStr];
          const combinedNames = items.map(i => i.name).join(', ');
          const mainTag = `main-dose-group-${todayDateStr}-${currentTimeStr}`;

          if (!alertedTags.has(mainTag)) {
            alertedTags.add(mainTag);

            setGlobalAlertError('');
            setGlobalAlertItem({
              userId: currentUserId,
              session: alertSession,
              date: todayDateStr,
              scheduleIds: items.map(i => i.scheduleId),
              name: combinedNames,
              time: currentTimeStr,
            });

            if (!serverPushActiveRef.current && 'Notification' in window && Notification.permission === 'granted') {
              void showForegroundNotification('제때약 · 복약 알림', {
                body: `복약 시간(${currentTimeStr})이에요. 앱에서 오늘 일정을 확인해 주세요.`,
                tag: mainTag,
                data: { type: 'medication-reminder', url: '/', date: todayDateStr, time: currentTimeStr, isPreAlarm: false },
              });
            }

            window.dispatchEvent(new CustomEvent('NEW_MEDICATION_ALARM', {
              detail: {
                name: combinedNames,
                time: currentTimeStr,
                date: todayDateStr,
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
  }, [isLoggedIn, medicationAlertsEnabled, user?.userId, user?.id, alertSession]);

  // 전역 모달 복약 완료 처리
  const handleConfirmTakeFromGlobalAlert = async () => {
    if (!globalAlertItem || intakeLock.current) return;
    intakeLock.current = true;
    setGlobalAlertSaving(true);
    setGlobalAlertError('');
    const date = globalAlertItem.date || getFormattedDate(new Date());
    try {
      await saveIntakeStatus({ scheduleIds: globalAlertItem.scheduleIds || [globalAlertItem.scheduleId], taken: true, date });
      window.dispatchEvent(new CustomEvent('jette-intake-updated', { detail: { userId: user?.userId || user?.id, date, origin: 'global' } }));
      setGlobalAlertItem(null);
    } catch (error) {
      setGlobalAlertError(error.message || '복약 체크를 저장하지 못했습니다. 다시 시도해주세요.');
    } finally {
      intakeLock.current = false;
      setGlobalAlertSaving(false);
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
    if (logoutLock.current) return;
    logoutLock.current = true;
    showLoading({ title: '로그아웃 중…', description: '이 기기의 알림 연결을 정리하고 있어요.' });
    try {
      // 로그아웃 전에 현재 기기의 수신 주소 해제. 다른 기기의 구독은 유지
      await backgroundPush.prepareLogout();
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error();
    } catch {
      hideLoading();
      backgroundPush.refresh();
      await showAlert('로그아웃하지 못했어요. 다시 시도해 주세요.\n이 기기의 알림이 해제되었다면 마이페이지에서 다시 켤 수 있어요.', '로그아웃 실패');
      return;
    } finally {
      hideLoading();
      logoutLock.current = false;
    }
    setIsLoggedIn(false);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.removeItem('notif_modal_dismissed');
    setPermissionDismissed(false);
    setGlobalAlertItem(null);
    navigate('/');
  };

  const handleUserUpdated = useCallback((changes) => {
    if ([false, 0, '0'].includes(changes.pushEnabled)) setGlobalAlertItem(null);
    setUser((currentUser) => {
      const updatedUser = { ...currentUser, ...changes };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      return updatedUser;
    });
  }, []);

  const handleLoginDemoToggle = async () => {
    try {
      const response = await fetch('/api/auth/demo', { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.userId) throw new Error(data.message || '체험 로그인에 실패했습니다. 잠시 후 다시 시도해주세요.');
      handleLoginSuccess(data);
    } catch (error) {
      setAppFeedback(error.message || '서버에 연결하지 못했습니다. 네트워크 상태를 확인해주세요.');
    }
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
                <MainPage key={user?.userId || user?.id || user?.username} user={user} />
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
                <MyPage user={user} onUserUpdated={handleUserUpdated} onLogout={handleLogout} backgroundPush={backgroundPush} />
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

      {/* 권한 요청은 사용자가 버튼을 누른 순간에만 실행 */}
      <UiDialog
        open={showPermissionModal}
        title="복약 알림을 받아보시겠어요?"
        description={canUseBackgroundPush
          ? '앱을 닫아도 복약 시간 30분 전과 정시에 알려드려요.\n잠금 화면에는 약 이름을 표시하지 않아요.\n서버가 켜져 있고 인터넷에 연결되어 있어야 해요.'
          : '사이트나 앱이 열려 있고 인터넷에 연결되어 있을 때 복약 시간을 확인해 알려드려요.\n앱 종료 후 알림은 마이페이지에서 지원 여부를 확인할 수 있어요.'}
        confirmLabel="알림 받기"
        cancelLabel="나중에"
        busy={Boolean(backgroundPush.busy)}
        onConfirm={handleRequestPermission}
        onCancel={handleDismissPermission}
      />
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
              [{formatTime24(globalAlertItem.time)}] {globalAlertItem.name}
            </p>
            <p style={{ fontSize: '13px', color: '#7a7066', margin: '0 0 24px 0', lineHeight: '1.4' }}>
              정해진 시간에 복약하면 효과가 훨씬 좋습니다. 지금 복용하셨나요?
            </p>
            {globalAlertError && <p role="alert" style={{ color: '#a02c32', lineHeight: 1.6 }}>{globalAlertError}</p>}
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
                disabled={globalAlertSaving}
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
                disabled={globalAlertSaving}
                onClick={handleConfirmTakeFromGlobalAlert}
              >
                {globalAlertSaving ? '저장 중…' : '지금 복약 완료'}
              </button>
            </div>
          </div>
        </div>
      )}

      <UiDialog open={Boolean(appFeedback)} title="연결 상태를 확인해주세요" description={appFeedback} confirmLabel="확인" cancelLabel="" onConfirm={() => setAppFeedback('')} onCancel={() => setAppFeedback('')}/>
    </ReadingProvider>
  );
}

export default App;
