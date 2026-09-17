import { NavLink, useNavigate } from 'react-router-dom';
import './Sidebar.css';

export default function Sidebar({
  isOpen,
  onClose,
  isLoggedIn,
  user,
  onLogout
}) {
  const navigate = useNavigate();

  const handleLinkClick = () => {
    // 모바일이나 화면 폭이 좁은 경우 링크 클릭 시 사이드바 자동 닫힘
    if (window.innerWidth < 1024) {
      onClose();
    }
  };

  const handleProfileClick = () => {
    navigate('/mypage');
    handleLinkClick();
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

          {/* 프로필 카드 영역 (와이어프레임 명세) */}
          <div className="sidebar-profile-card" onClick={handleProfileClick} title="마이페이지로 이동">
            <div className="profile-avatar-box">
              <div className="profile-avatar-circle">
                {user?.profileImg ? (
                  <img src={user.profileImg} alt="프로필" />
                ) : (
                  <svg className="avatar-sketch-icon" viewBox="0 0 48 48" fill="none">
                    <circle cx="24" cy="18" r="10" stroke="#7d2638" strokeWidth="2.5" fill="#f5ede7" />
                    <circle cx="21" cy="16" r="1.5" fill="#7d2638" />
                    <circle cx="27" cy="16" r="1.5" fill="#7d2638" />
                    <path d="M21 21 C22.5 23, 25.5 23, 27 21" stroke="#7d2638" strokeWidth="2" strokeLinecap="round" />
                    <path d="M12 40 C12 33, 17 29, 24 29 C31 29, 36 33, 36 40" stroke="#7d2638" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                )}
              </div>
              <span className="avatar-edit-badge" title="프로필 사진">✎</span>
            </div>

            <div className="profile-info-box">
              <div className="profile-name-row">
                <strong className="profile-name">{user?.name || '김메디'}</strong>
                <span className="profile-tag">복약 관리중</span>
              </div>
              <span className="profile-sub">{user?.email || 'mediary_2026 · hello@mediary.kr'}</span>
            </div>
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

            {/* 가이드 (맞춤 생활 가이드) */}
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
              <span className="nav-item-text">가이드</span>
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
          </nav>

          {/* 하단 보조 정보 및 로그아웃 */}
          <div className="sidebar-footer">
            <div className="routine-mini-card">
              <span className="routine-mini-label">오늘의 복용 진척도</span>
              <div className="routine-mini-bar">
                <div className="routine-mini-progress" style={{ width: '33%' }} />
              </div>
              <span className="routine-mini-status">1 / 3 복용 완료</span>
            </div>

            {isLoggedIn ? (
              <button
                type="button"
                className="sidebar-logout-link"
                onClick={onLogout}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="footer-icon">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                로그아웃
              </button>
            ) : (
              <button
                type="button"
                className="sidebar-login-link"
                onClick={() => { navigate('/login'); handleLinkClick(); }}
              >
                로그인 하러가기 →
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
