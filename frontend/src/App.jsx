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

  const handleLoginSuccess = (loginData) => {
    const loggedInUser = {
      username: loginData.username,
      name: loginData.nickname || loginData.username,
      email: loginData.email || '',
    };
    setIsLoggedIn(true);
    setUser(loggedInUser);
    localStorage.setItem('token', loginData.token);
    localStorage.setItem('user', JSON.stringify(loggedInUser));
    navigate('/');
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
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
