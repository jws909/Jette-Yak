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

// 날짜 포맷팅 헬퍼 (YYYY-MM-DD)
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

  // 전역 복약 알림 모달 상태 (어느 페이지에서든 팝업)
  const [globalAlertItem, setGlobalAlertItem] = useState(null);

  // 이미 로그인되어 있으나 과거 세션 데이터로 인해 userId가 누락된 경우 서버 프로필에서 자동 복구
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

  // 1. 브라우저 시스템 알림 권한 획득 (최초 1회)
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // ★ 2. 전역 00초 칼동기화 타이머 (수정 완료: userId 안전 추적 + 조건식 관대화 + 시간 규격 호환)
  useEffect(() => {
    // 1순위: user state의 userId, 2순위: localStorage의 user.userId, 3순위: 기본값 1
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
      const currentTimeStr = `${currentH}:${currentM}`; // "HH:mm"
      const todayDateStr = getFormattedDate(now);

      try {
        const res = await fetch(`/api/calendar?userId=${currentUserId}&date=${todayDateStr}`);
        if (!res.ok) return;
        const todayList = await res.json();

        if (!Array.isArray(todayList)) return;

        todayList.forEach((item) => {
          // DB의 시간 포맷이 "08:30:00" 형태일 경우 앞 5자리("08:30")만 추출
          const targetTime = String(item.time || '').substring(0, 5);

          // 알람 플래그: true, 1, '1', undefined 모두 허용 (명시적으로 false/0 일 때만 비활성화)
          const isAlarmOff = item.alarmEnabled === false || item.alarmEnabled === 0 || item.alarmEnabled === '0';
          const isEnabled = !isAlarmOff;

          // 복약 여부
          const isTaken = Boolean(item.takenAt);

          const tag = `dose-${item.scheduleId}-${targetTime}-${currentTimeStr}`;

          // 조건: 알람 켜짐 + 미복용 + 시간 일치 + 중복 방지
          if (isEnabled && !isTaken && targetTime === currentTimeStr && !alertedTags.has(tag)) {
            alertedTags.add(tag);

            // 1) 화면 중앙 모달 즉시 팝업
            setGlobalAlertItem({
              ...item,
              time: targetTime
            });

            // 2) 브라우저 시스템 푸시 알림 발송
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification(`💊 [복약 알림] ${item.name}`, {
                body: `현재 복용 시간(${targetTime})입니다. 잊지 말고 복용하세요!`,
                icon: '/favicon.ico',
                tag: tag,
              });
            }

            // 3) Navbar에 실시간 신호 전달 (종 아이콘 뱃지 점등)
            window.dispatchEvent(new CustomEvent('NEW_MEDICATION_ALARM', { 
              detail: {
                ...item,
                time: targetTime
              }
            }));
          }
        });
      } catch (e) {
        console.error("전역 복약 알림 검사 오류:", e);
      }
    };

    // 진입 즉시 1회 검사
    triggerCheck();

    // 다음 분 00초 정각까지 대기 밀리초 계산
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

  // 3. 전역 모달에서 [지금 복약 완료] 클릭 시 실행
  const handleConfirmTakeFromGlobalAlert = async () => {
    if (!globalAlertItem) return;
    try {
      await fetch(`/api/calendar/${globalAlertItem.scheduleId}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taken: true }),
      });
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
        {/* 1. 독립 인증 페이지들 */}
        <Route
          path="/login"
          element={<LoginPage onLoginSuccess={handleLoginSuccess} />}
        />
        <Route
          path="/signup"
          element={<SignupPage />}
        />

        {/* 2. 글로벌 레이아웃(Navbar & Sidebar)이 적용되는 메인 서비스 페이지들 */}
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

      {/* 전역 복약 알림 모달 (어느 페이지에서든 최상위 레이어로 팝업) */}
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
            maxWidth: '360px',
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
