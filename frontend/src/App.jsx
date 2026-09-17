import { useState } from 'react';
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

  // 와이어프레임 기본 사용자 상태 (김메디님)
  const [isLoggedIn, setIsLoggedIn] = useState(() => Boolean(localStorage.getItem('token') || 'demo-token'));
  const [user] = useState({
    name: '김메디',
    email: 'mediary_2026 · hello@mediary.kr'
  });

  const handleLoginSuccess = (receivedToken) => {
    setIsLoggedIn(true);
    localStorage.setItem('token', receivedToken);
    navigate('/');
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    localStorage.removeItem('token');
  };

  const handleLoginDemoToggle = () => {
    const demoToken = 'demo-token';
    setIsLoggedIn(true);
    localStorage.setItem('token', demoToken);
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
            <CalendarPage />
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
            <GuidePage />
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
            <MyPage user={user} />
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
            <MedicationChat />
          </MainLayout>
        }
      />
    </Routes>
  );
}

export default App;
