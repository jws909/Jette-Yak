import MedicationChat from './features/chatbot/components/MedicationChat'
import { useState } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import LoginPage from "./components/LoginPage";
import SignupPage from "./components/SignupPage";
import './App.css'

function App() {
  const [token, setToken] = useState(null);
  const navigate = useNavigate();

  const handleLoginSuccess = (receivedToken) => {
    setToken(receivedToken);
    localStorage.setItem("token", receivedToken);
    navigate('/');
  };

  return (
    <Routes>
      <Route path="/login" element={<LoginPage onLoginSuccess={handleLoginSuccess} />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route
        path="/"
        element={token ? <MedicationChat /> : <Navigate to="/login" replace />}
      />
    </Routes>
  );
}

export default App
