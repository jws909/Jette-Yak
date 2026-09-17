import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from "./components/LoginPage";
import SignupPage from "./components/SignupPage";
import './App.css'

function App() {
  const [token, setToken] = useState(null);

  const handleLoginSuccess = (receivedToken) => {
    setToken(receivedToken);
    localStorage.setItem("token", receivedToken);
  };

  return (
    <Routes>
      <Route path="/login" element={<LoginPage onLoginSuccess={handleLoginSuccess} />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route
        path="/"
        element={token ? <div>로그인 완료! 메인 화면</div> : <Navigate to="/login" replace />}
      />
    </Routes>
  );
}

export default App