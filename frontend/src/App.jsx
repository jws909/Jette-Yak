import { useState } from 'react'
import heroImg from './assets/hero.png'
import reactLogo from './assets/react.svg'
import viteLogo from './assets/vite.svg'
import LoginPage from "./components/LoginPage";
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  const [token, setToken] = useState(null);

  const handleLoginSuccess = (receivedToken) => {
    setToken(receivedToken);              // 앱 상태에 토큰 저장
    localStorage.setItem("token", receivedToken); // 새로고침해도 유지되게 저장
  };

  if (!token) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return <div>로그인 완료! 메인 화면</div>;
}

  
  


export default App
