import { useState } from 'react';
import Navbar from './Navbar';
import Sidebar from './Sidebar';
import './MainLayout.css';

export default function MainLayout({
  children,
  isLoggedIn,
  user,
  onLogout,
  onLoginDemoToggle
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const toggleSidebar = () => {
    setIsSidebarOpen((prev) => !prev);
  };

  const closeSidebar = () => {
    setIsSidebarOpen(false);
  };

  return (
    <div className="main-layout-root">
      {/* 글로벌 상단 내비게이션 바 */}
      <Navbar
        onToggleSidebar={toggleSidebar}
        isSidebarOpen={isSidebarOpen}
        isLoggedIn={isLoggedIn}
        user={user}
        onLogout={onLogout}
        onLoginDemoToggle={onLoginDemoToggle}
      />

      {/* 글로벌 사이드바 드로어 */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={closeSidebar}
        isLoggedIn={isLoggedIn}
        user={user}
        onLogout={onLogout}
      />

      {/* 메인 페이지 콘텐츠 래퍼 */}
      <main className="main-layout-content">
        <div className="main-content-container">
          {children}
        </div>
      </main>
    </div>
  );
}
