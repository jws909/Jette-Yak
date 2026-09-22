import { useState, useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import MainLayout from './components/layout/MainLayout';
import MainPage from './features/main/MainPage';
import CalendarPage from './calendarpage/CalendarPage';
import GuidePage from './features/guide/GuidePage';
import MyPage from './features/mypage/MyPage';
import SurveyPage from './features/survey/SurveyPage';
import MedicationChat from './features/chatbot/components/MedicationChat';
import LoginPage from './components/LoginPage';
import SignupPage from './components/SignupPage';
import './App.css';

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

  // 이미 로그인되어 있으나 과거 세션 데이터로 인해 userId가 누락된 경우 서버 프로필에서 자동 복구
  useEffect(() => {
    if (user?.username && !user?.userId && user.username !== 'demo') {
      fetch(`/api/users/profile?username=${encodeURIComponent(user.username)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && data.userId) {
            setUser((curr) => {
              const updated = { ...curr, userId: data.userId };
              localStorage.setItem('user', JSON.stringify(updated));
              return updated;
            });
          }
        })
        .catch(() => {});
    }
  }, [user?.username, user?.userId]);

  const handleLoginSuccess = (loginData) => {
    const loggedInUser = {
      userId: loginData.userId,
      username: loginData.username,
      name: loginData.nickname || loginData.username,
      email: loginData.email || '',
    };
    setIsLoggedIn(true);
    setUser(loggedInUser);
    localStorage.setItem('token', loginData.token);
    localStorage.setItem('user', JSON.stringify(loggedInUser));
    const next = new URLSearchParams(window.location.search).get('next');
    navigate(['/guide','/chat'].includes(next) ? next : '/');
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
    </Routes>
  );
}

export default App;
