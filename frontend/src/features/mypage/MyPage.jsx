import { useEffect, useRef, useState } from 'react';
import './MyPage.css';

export default function MyPage({ user, onUserUpdated }) {
  const [nickname, setNickname] = useState(user?.name || '김메디');
  const [isEditingNick, setIsEditingNick] = useState(false);
  const [email] = useState(user?.email || 'jetteyak_2026 · hello@jetteyak.kr');
  const [profileImage, setProfileImage] = useState(user?.profileImageUrl || '');
  const [profileMessage, setProfileMessage] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!user?.username || user.username === 'demo') return;
    fetch(`/api/users/profile?username=${encodeURIComponent(user.username)}`)
      .then((response) => response.ok ? response.json() : null)
      .then((profile) => {
        if (!profile) return;
        setNickname(profile.nickname || user.name);
        setProfileImage(profile.profileImageUrl || '');
        onUserUpdated?.({ name: profile.nickname || user.name, profileImageUrl: profile.profileImageUrl || '' });
      })
      .catch(() => {});
  }, [user?.username]);

  const updateProfile = async ({ nextNickname, file } = {}) => {
    if (!user?.username || user.username === 'demo') {
      setProfileMessage('체험 계정에서는 프로필을 변경할 수 없습니다.');
      return false;
    }
    const formData = new FormData();
    formData.append('username', user.username);
    if (nextNickname !== undefined) formData.append('nickname', nextNickname);
    if (file) formData.append('file', file);
    const response = await fetch('/api/users/profile', { method: 'POST', body: formData });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setProfileMessage(data.message || '프로필 저장에 실패했습니다.');
      return false;
    }
    setNickname(data.nickname);
    setProfileImage(data.profileImageUrl || '');
    onUserUpdated?.({ name: data.nickname, profileImageUrl: data.profileImageUrl || '' });
    setProfileMessage('프로필이 저장되었습니다.');
    return true;
  };

  const handleNicknameSave = async () => {
    const trimmedNickname = nickname.trim();
    if (!trimmedNickname) return;
    setIsEditingNick(false);
    await updateProfile({ nextNickname: trimmedNickname });
  };

  const handleProfilePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setProfileMessage('이미지 파일만 등록할 수 있습니다.');
      return;
    }
    await updateProfile({ file });
    e.target.value = '';
  };

  // 비밀번호 변경 폼
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwMessage, setPwMessage] = useState('');

  // 평소 복용 관리 (와이어프레임 2.png)
  const [everydayMeds, setEverydayMeds] = useState([
    { id: 1, name: '오메가-3', type: '영양제', dotColor: '#e09f3e' },
    { id: 2, name: '듀오락 골드', type: '상시약', dotColor: '#5c9e76' }
  ]);
  const [medSearchText, setMedSearchText] = useState('');

  // 알림 환경 설정
  const [pushEnabled, setPushEnabled] = useState(true);
  const [saveToast, setSaveToast] = useState(false);

  const handleAddMed = (e) => {
    e.preventDefault();
    if (!medSearchText.trim()) return;
    const newMed = {
      id: Date.now(),
      name: medSearchText.trim(),
      type: '영양제',
      dotColor: '#e09f3e'
    };
    setEverydayMeds(prev => [...prev, newMed]);
    setMedSearchText('');
  };

  const handleRemoveMed = (id) => {
    setEverydayMeds(prev => prev.filter(m => m.id !== id));
  };

  const handlePwChange = (e) => {
    e.preventDefault();
    if (!currentPw || !newPw || !confirmPw) {
      setPwMessage('모든 비밀번호 항목을 입력해주세요.');
      return;
    }
    if (newPw !== confirmPw) {
      setPwMessage('새 비밀번호가 일치하지 않습니다.');
      return;
    }
    setPwMessage('비밀번호가 성공적으로 변경되었습니다.');
    setCurrentPw('');
    setNewPw('');
    setConfirmPw('');
    setTimeout(() => setPwMessage(''), 3000);
  };

  const handleSaveSettings = () => {
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 3000);
  };

  return (
    <div className="mypage-wrapper">
      {/* 토스트 알림 */}
      {saveToast && (
        <div className="save-toast-popup">
          변경 사항이 저장되었습니다.
        </div>
      )}

      <header className="page-section-header">
        <span className="section-meta-tag">MY ACCOUNT</span>
        <h1 className="section-title">마이 페이지</h1>
      </header>

      {/* 1. 상단 프로필 영역 */}
      <section className="mypage-profile-card">
        <div className="profile-photo-unit" onClick={(e) => {
          if (e.target.closest('button')) fileInputRef.current?.click();
        }}>
          <div
            className={`profile-photo-circle ${profileImage ? 'has-image' : ''}`}
            style={profileImage ? { backgroundImage: `url(${profileImage})` } : undefined}
          >김</div>
          <input ref={fileInputRef} className="profile-photo-input" type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={handleProfilePhotoChange} />
          <button type="button" className="photo-change-btn">사진 변경</button>
        </div>

        <div className="profile-main-meta">
          <span className="meta-kicker">PROFILE</span>
          <div className="meta-name-editor">
            {isEditingNick ? (
              <input
                type="text"
                className="nickname-input"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                onBlur={handleNicknameSave}
                autoFocus
              />
            ) : (
              <strong className="nickname-display">{nickname}</strong>
            )}
            <button
              type="button"
              className="nickname-edit-icon"
              onClick={() => isEditingNick ? handleNicknameSave() : setIsEditingNick(true)}
              title="닉네임 수정"
            >
              ✎
            </button>
          </div>
          <span className="email-display">{email}</span>
          {profileMessage && <span className="profile-message">{profileMessage}</span>}
        </div>
      </section>

      {/* 2단 그리드: 비밀번호 변경 & 환경설정 (좌) + 평소 복용 관리 (우) */}
      <div className="mypage-two-cols">
        {/* 좌측 열 */}
        <div className="mypage-col-left">
          {/* 비밀번호 변경 */}
          <section className="mypage-subcard">
            <span className="meta-kicker">PASSWORD</span>
            <h2 className="subcard-title">비밀번호 변경</h2>

            <form onSubmit={handlePwChange} className="password-form">
              <input
                type="password"
                placeholder="현재 비밀번호"
                className="styled-input"
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
              />
              <input
                type="password"
                placeholder="새 비밀번호"
                className="styled-input"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
              />
              <input
                type="password"
                placeholder="새 비밀번호 확인"
                className="styled-input"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
              />

              {pwMessage && (
                <div className={`form-feedback ${pwMessage.includes('성공') ? 'success' : 'error'}`}>
                  {pwMessage}
                </div>
              )}

              <button type="submit" className="action-outline-btn">
                비밀번호 변경
              </button>
            </form>
          </section>

          {/* 서비스 환경 설정 */}
          <section className="mypage-subcard service-settings-card">
            <span className="meta-kicker">SERVICE SETTINGS</span>
            <h2 className="subcard-title">서비스 환경 설정</h2>

            <div className="setting-toggle-row">
              <div className="setting-info">
                <strong>복용 알림 전체 Push</strong>
                <p>모든 복약 알림을 받아볼게요.</p>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={pushEnabled}
                  onChange={(e) => setPushEnabled(e.target.checked)}
                />
                <span className="toggle-slider" />
              </label>
            </div>

            <button
              type="button"
              className="action-solid-btn"
              onClick={handleSaveSettings}
            >
              변경 사항 저장
            </button>

            <div className="withdraw-row">
              <button
                type="button"
                className="withdraw-btn"
                onClick={() => alert('탈퇴 전 저장된 복약 기록이 모두 삭제됩니다. 정말 탈퇴하시겠습니까?')}
              >
                회원 탈퇴
              </button>
            </div>
          </section>
        </div>

        {/* 우측 열: 평소 복용 관리 (EVERYDAY MEDICATION) */}
        <div className="mypage-col-right">
          <section className="mypage-subcard full-height">
            <span className="meta-kicker">EVERYDAY MEDICATION</span>
            <h2 className="subcard-title">평소 복용 관리</h2>

            {/* 검색 및 추가 인풋 */}
            <form onSubmit={handleAddMed} className="everyday-search-form">
              <div className="search-pill-box">
                <svg className="inner-search-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 19l-4-4m0-7A7 7 0 1 1 1 8a7 7 0 0 1 14 0Z" />
                </svg>
                <input
                  type="text"
                  placeholder="약 또는 비타민 검색"
                  className="search-pill-input"
                  value={medSearchText}
                  onChange={(e) => setMedSearchText(e.target.value)}
                />
                <button type="submit" className="search-add-btn" title="복용 목록에 추가">+</button>
              </div>
            </form>

            {/* 등록된 목록 */}
            <div className="everyday-list">
              {everydayMeds.map((med) => (
                <div key={med.id} className="everyday-item-row">
                  <div className="everyday-left">
                    <span className="everyday-dot" style={{ backgroundColor: med.dotColor }} />
                    <strong className="everyday-name">{med.name}</strong>
                  </div>
                  <div className="everyday-right">
                    <span className="everyday-type-badge">{med.type}</span>
                    <button
                      type="button"
                      className="everyday-delete-btn"
                      onClick={() => handleRemoveMed(med.id)}
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
