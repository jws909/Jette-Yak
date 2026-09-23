import { useState, useEffect, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import './Sidebar.css';

function getTodayDateStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function Sidebar({
  isOpen,
  onClose,
  isLoggedIn,
  onLogout,
  user
}) {
  const [progress, setProgress] = useState({ total: 0, taken: 0, percent: 0 });

  const fetchTodayProgress = useCallback(async () => {
    if (!isLoggedIn || !user?.userId) {
      setProgress({ total: 0, taken: 0, percent: 0 });
      return;
    }

    const todayStr = getTodayDateStr();

    try {
      const res = await fetch(`/api/calendar?userId=${user.userId}&date=${todayStr}`);
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list)) {
          const total = list.length;
          const taken = list.filter((item) => Boolean(item.takenAt)).length;
          const percent = total > 0 ? Math.round((taken / total) * 100) : 0;
          setProgress({ total, taken, percent });
          return;
        }
      }
    } catch (err) {
      console.warn('사이드바 복용 진척도 조회 실패:', err);
    }

    setProgress({ total: 0, taken: 0, percent: 0 });
  }, [isLoggedIn, user?.userId]);

  useEffect(() => {
    if (!isLoggedIn || !user?.userId) {
      setProgress({ total: 0, taken: 0, percent: 0 });
      return;
    }

    fetchTodayProgress();

    // 메인화면/캘린더에서 체크 즉시 실시간 동기화
    const handleIntakeUpdate = () => {
      fetchTodayProgress();
      // 네트워크/DB 커밋 타이밍 감안하여 지연 재호출
      setTimeout(fetchTodayProgress, 250);
    };

    window.addEventListener('jette-intake-updated', handleIntakeUpdate);
    window.addEventListener('focus', handleIntakeUpdate);
    const timer = setInterval(fetchTodayProgress, 30000);

    return () => {
      window.removeEventListener('jette-intake-updated', handleIntakeUpdate);
      window.removeEventListener('focus', handleIntakeUpdate);
      clearInterval(timer);
    };
  }, [fetchTodayProgress, isLoggedIn, user?.userId, isOpen]);

  const handleLinkClick = () => {
    // 모바일(768px 미만)인 경우에만 링크 클릭 시 사이드바 자동 닫힘
    if (window.innerWidth < 768) {
      onClose();
    }
  };

  return (
    <>
      {/* 모바일/오버레이 배경 백드롭 */}
      <div
        className={`sidebar-backdrop ${isOpen ? 'active' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside className={`site-sidebar ${isOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-inner">
          {/* 상단 닫기 버튼 (모바일/작은 화면용) */}
          <div className="sidebar-top-bar">
            <span className="sidebar-brand-label">메뉴</span>
            <button
              type="button"
              className="sidebar-close-btn"
              onClick={onClose}
              aria-label="사이드바 닫기"
              title="닫기"
            >
              ✕
            </button>
          </div>

          {/* 내비게이션 메뉴 목록 (와이어프레임 순서) */}
          <nav className="sidebar-nav">
            <div className="nav-group-title">서비스 메뉴</div>

            <NavLink
              to="/"
              end
              className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
              onClick={handleLinkClick}
            >
              <span className="nav-item-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              </span>
              <span className="nav-item-text">메인 홈</span>
            </NavLink>

            {/* My Page (마이페이지) */}
            <NavLink
              to="/mypage"
              className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
              onClick={handleLinkClick}
            >
              <span className="nav-item-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </span>
              <span className="nav-item-text">My Page (마이페이지)</span>
            </NavLink>

            {/* 캘린더 (복약 캘린더) */}
            <NavLink
              to="/calendar"
              className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
              onClick={handleLinkClick}
            >
              <span className="nav-item-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </span>
              <span className="nav-item-text">캘린더</span>
              <span className="nav-item-badge">오늘</span>
            </NavLink>

            {/* 내 약 관리 */}
            <NavLink
              to="/guide"
              className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
              onClick={handleLinkClick}
            >
              <span className="nav-item-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </span>
              <span className="nav-item-text">내 약 관리</span>
            </NavLink>

            {/* 문진표 */}
            <NavLink
              to="/survey"
              className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
              onClick={handleLinkClick}
            >
              <span className="nav-item-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
              </span>
              <span className="nav-item-text">문진표</span>
            </NavLink>

            {/* 복약 상담 챗봇 */}
            <NavLink
              to="/chat"
              className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
              onClick={handleLinkClick}
            >
              <span className="nav-item-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </span>
              <span className="nav-item-text">복약 상담 AI 챗봇</span>
            </NavLink>

            <NavLink
              to="/community"
              className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
              onClick={handleLinkClick}
            >
              <span className="nav-item-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8h2a2 2 0 012 2v7a2 2 0 01-2 2h-4l-3 3v-3H7a2 2 0 01-2-2v-2m12-7V5a2 2 0 00-2-2H5a2 2 0 00-2 2v7a2 2 0 002 2h4l3 3v-3h3a2 2 0 002-2V8z" />
                </svg>
              </span>
              <span className="nav-item-text">약 이야기 커뮤니티</span>
              {user?.role === 'ADMIN' && <span className="nav-item-badge">관리</span>}
            </NavLink>
          </nav>

          {/* 하단 보조 정보: 로그인 상태에서만 실제 오늘의 복용 진척도 표시 */}
          {isLoggedIn && user?.userId && (
            <div className="sidebar-footer">
              <div className="routine-mini-card">
                <span className="routine-mini-label">오늘의 복용 진척도</span>
                <div className="routine-mini-bar">
                  <div
                    className="routine-mini-progress"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
                <span className="routine-mini-status">
                  {progress.total > 0
                    ? `${progress.taken} / ${progress.total} 복용 완료 (${progress.percent}%)`
                    : '오늘 예정된 복약 없음'}
                </span>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
