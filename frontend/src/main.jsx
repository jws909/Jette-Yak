import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { BrowserRouter } from 'react-router-dom'
import { DialogProvider } from './contexts/DialogProvider'
import PwaControls from './features/pwa/PwaControls.jsx'
import { initializePwa } from './features/pwa/pwaController.js'

// 설치 요청을 놓치지 않도록 렌더링 전에 연결; 서비스 워커는 빌드 환경에서만 등록
initializePwa()

// 전역 401(인증 만료/미로그인) 감지 및 로그인 페이지 자동 안내 인터셉터
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  const response = await originalFetch(...args);

  const [resource] = args;
  const url = typeof resource === 'string' ? resource : resource?.url || '';

  // 로그인 시도 자체가 아닌 일반 API 요청에서 401(인증 만료) 응답을 받은 경우
  if (response.status === 401 && !url.includes('/api/auth/login')) {
    if (localStorage.getItem('user')) {
      localStorage.removeItem('user');
      localStorage.removeItem('token');
      const currentPath = window.location.pathname + window.location.search;
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = `/login?expired=1&next=${encodeURIComponent(currentPath)}`;
      }
    }
  }

  return response;
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <DialogProvider>
        <App />
        <PwaControls />
      </DialogProvider>
    </BrowserRouter>
  </StrictMode>,
)
