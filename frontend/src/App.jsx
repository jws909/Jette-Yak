import { useState, useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import MainLayout from './components/layout/MainLayout';
import MainPage from './features/main/MainPage';
import CalendarPage from './calendarpage/CalendarPage';
import GuidePage from './features/guide/GuidePage';
import MyPage from './features/mypage/MyPage';
import SurveyPage from './features/survey/SurveyPage';
import MedicationChat from './features/chatbot/components/MedicationChat';
import CommunityPage from './features/community/CommunityPage';
import LoginPage from './components/LoginPage';
import SignupPage from './components/SignupPage';
import './App.css';

const getFormattedDate = (targetDate) => {
  const y = targetDate.getFullYear();
  const m = String(targetDate.getMonth() + 1).padStart(2, '0');
  const d = String(targetDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

function App() {
  const navigate = useNavigate();

  const [isLoggedIn, setIsLoggedIn] = useState(() => Boolean(
    localStorage.getItem('token') && localStorage.getItem('user')
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
    if (user?.username && (!user?.userId || !user?.role) && user.username !== 'demo') {
      fetch(`/api/users/profile?username=${encodeURIComponent(user.username)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && data.userId) {
            setUser((curr) => {
              const updated = { ...curr, userId: data.userId, role: data.role || curr?.role || 'USER' };
              localStorage.setItem('user', JSON.stringify(updated));
              return updated;
            });
          }
        })
        .catch(() => {});
    }
  }, [user?.username, user?.userId, user?.role]);

  // ★ 2. 로그인 시 브라우저 권한 상태를 확인하고, 미결정('default')이면 안내 모달 띄우기
  useEffect(() => {
    if (isLoggedIn && 'Notification' in window) {
      const isAlreadyDismissed = sessionStorage.getItem('notif_modal_dismissed') === 'true';
      if (Notification.permission === 'default' && !isAlreadyDismissed) {
        setShowPermissionModal(true);
      }
    }
  }, [isLoggedIn]);

  // 사용자가 모달에서 [알림 받기 (예)]를 클릭했을 때 실행되는 핸들러 (User Gesture 만족)
  const handleRequestPermission = async () => {
    setShowPermissionModal(false);
    if ('Notification' in window) {
      try {
        const result = await Notification.requestPermission();
        if (result === 'granted') {
          new Notification('💊 제때약 복약 알림이 활성화되었습니다', {
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
    let resolvedUserId = user?.userId;
    if (!resolvedUserId) {
      try {
        const stored = JSON.parse(localStorage.getItem('user'));
        resolvedUserId = stored?.userId;
      } catch {
        resolvedUserId = null;
      }
    }
    const currentUserId = resolvedUserId || 1;

    let timeoutId;
    let intervalId;
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
        if (!Array.isArray(todayList)) return;

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
              new Notification(`💊 [복약 알림] ${combinedNames}`, {
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
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, [user?.userId]);

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
    };
    setIsLoggedIn(true);
    setUser(loggedInUser);
    localStorage.setItem('token', loginData.token);
    localStorage.setItem('user', JSON.stringify(loggedInUser));
    const next = new URLSearchParams(window.location.search).get('next');
    navigate(['/guide','/chat','/community'].includes(next) ? next : '/');
  };

  const handleLogout = async () => {
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error();
    } catch {
      window.alert('로그아웃하지 못했습니다. 다시 시도해주세요.');
      return;
    }
    setIsLoggedIn(false);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.removeItem('notif_modal_dismissed');
  };

  const handleUserUpdated = (changes) => {
    setUser((currentUser) => {
      const updatedUser = { ...currentUser, ...changes };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      return updatedUser;
    });
  };

  const handleLoginDemoToggle = () => {
    const demoToken = 'demo-token';
    const demoUser = { username: 'demo', name: '체험 사용자', email: '' };
    setIsLoggedIn(true);
    setUser(demoUser);
    localStorage.setItem('token', demoToken);
    localStorage.setItem('user', JSON.stringify(demoUser));
  };

  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage onLoginSuccess={handleLoginSuccess} />} />
        <Route path="/signup" element={<SignupPage />} />

        <Route
          path="/"
          element={
            <MainLayout
              isLoggedIn={isLoggedIn}
              user={user}
              onLogout={handleLogout}
              onLoginDemoToggle={handleLoginDemoToggle}
            >
              <MainPage user={user} />
            </MainLayout>
          }
        />

        <Route
          path="/calendar"
          element={
            <MainLayout
              isLoggedIn={isLoggedIn}
              user={user}
              onLogout={handleLogout}
              onLoginDemoToggle={handleLoginDemoToggle}
            >
              <CalendarPage user={user} />
            </MainLayout>
          }
        />

        <Route
          path="/guide"
          element={
            <MainLayout
              isLoggedIn={isLoggedIn}
              user={user}
              onLogout={handleLogout}
              onLoginDemoToggle={handleLoginDemoToggle}
            >
              <GuidePage key={user?.userId || "guest"} />
            </MainLayout>
          }
        />

        <Route
          path="/mypage"
          element={
            <MainLayout
              isLoggedIn={isLoggedIn}
              user={user}
              onLogout={handleLogout}
              onLoginDemoToggle={handleLoginDemoToggle}
            >
              <MyPage user={user} onUserUpdated={handleUserUpdated} />
            </MainLayout>
          }
        />

        <Route
          path="/survey"
          element={
            <MainLayout
              isLoggedIn={isLoggedIn}
              user={user}
              onLogout={handleLogout}
              onLoginDemoToggle={handleLoginDemoToggle}
            >
              <SurveyPage />
            </MainLayout>
          }
        />

        <Route
          path="/chat"
          element={
            <MainLayout
              isLoggedIn={isLoggedIn}
              user={user}
              onLogout={handleLogout}
              onLoginDemoToggle={handleLoginDemoToggle}
            >
              <MedicationChat key={user?.userId || "guest"} />
            </MainLayout>
          }
        />

        <Route
          path="/community"
          element={
            <MainLayout
              isLoggedIn={isLoggedIn}
              user={user}
              onLogout={handleLogout}
              onLoginDemoToggle={handleLoginDemoToggle}
            >
              <CommunityPage user={user} />
            </MainLayout>
          }
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
            <div style={{ fontSize: '38px', marginBottom: '8px' }}>🔔</div>
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
            <div style={{ fontSize: '42px', marginBottom: '8px' }}>💊</div>
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
    </>
  );
}

export default App;
