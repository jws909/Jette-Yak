import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import './MyPage.css';
import defaultProfileImg from '../../assets/Default_profile.png';

export default function MyPage({ user, onUserUpdated, onLogout }) {
  const [nickname, setNickname] = useState(user?.nickname || user?.name || user?.username || '');
  const [nicknameDraft, setNicknameDraft] = useState('');
  const [isNicknameModalOpen, setIsNicknameModalOpen] = useState(false);
  const [isNicknameSaving, setIsNicknameSaving] = useState(false);
  const [email, setEmail] = useState(user?.email || '');
  const [accountDetails, setAccountDetails] = useState({ sex: '', isPregnant: 0, familyName: '' });
  const [profileImage, setProfileImage] = useState(user?.profileImageUrl || '');
  const [imgError, setImgError] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [myPosts, setMyPosts] = useState([]);
  const [myPostsLoading, setMyPostsLoading] = useState(true);
  const [myPostsError, setMyPostsError] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!user?.username) {
      setMyPosts([]);
      setMyPostsLoading(false);
      return;
    }
    let active = true;
    setMyPostsLoading(true);
    setMyPostsError('');
    fetch('/api/community/my-posts')
      .then(async (response) => {
        if (response.ok) return response.json();
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || '작성한 게시글을 불러오지 못했습니다.');
      })
      .then((posts) => {
        if (active) setMyPosts(Array.isArray(posts) ? posts : []);
      })
      .catch((error) => {
        if (active) {
          setMyPosts([]);
          setMyPostsError(error.message || '작성한 게시글을 불러오지 못했습니다.');
        }
      })
      .finally(() => {
        if (active) setMyPostsLoading(false);
      });
    return () => { active = false; };
  }, [user?.username]);

  useEffect(() => {
    if (!user?.username) return;
    const targetUser = user.username === 'demo' ? 'test12' : user.username;
    fetch(`/api/users/profile?username=${encodeURIComponent(targetUser)}`)
      .then((response) => response.ok ? response.json() : null)
      .then((profile) => {
        if (!profile) return;
        setNickname(profile.nickname || user.name);
        if (profile.email) setEmail(profile.email);
        setAccountDetails((prev) => ({
          ...prev,
          sex: profile.sex || '',
          isPregnant: profile.isPregnant === 1 || profile.isPregnant === '1',
        }));
        setProfileImage(profile.profileImageUrl || '');
        setImgError(false);
        const isPush = profile.pushEnabled !== false && profile.pushEnabled !== 0 && profile.pushEnabled !== '0';
        setPushEnabled(isPush);
        onUserUpdated?.({
          name: profile.nickname || user.name,
          email: profile.email || user?.email || '',
          profileImageUrl: profile.profileImageUrl || '',
          userId: profile.userId || user?.userId,
          pushEnabled: isPush,
        });

        if (profile.userId) {
          fetch(`/api/family/members?userId=${encodeURIComponent(profile.userId)}`)
            .then((response) => response.ok ? response.json() : [])
            .then((members) => {
              const familyName = Array.isArray(members) && members[0]?.familyName ? members[0].familyName : '';
              setAccountDetails((prev) => ({ ...prev, familyName }));
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, [user?.username]);

  useEffect(() => {
    if (user?.pushEnabled !== undefined) {
      setPushEnabled(user.pushEnabled !== false && user.pushEnabled !== 0 && user.pushEnabled !== '0');
    }
  }, [user?.pushEnabled]);

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

  const openNicknameModal = () => {
    setNicknameDraft(nickname);
    setProfileMessage('');
    setIsNicknameModalOpen(true);
  };

  const handleNicknameSave = async (e) => {
    e.preventDefault();
    const trimmedNickname = nicknameDraft.trim();
    if (!trimmedNickname) {
      setProfileMessage('닉네임을 입력해 주세요.');
      return;
    }
    setIsNicknameSaving(true);
    const saved = await updateProfile({ nextNickname: trimmedNickname });
    setIsNicknameSaving(false);
    if (saved) {
      setIsNicknameModalOpen(false);
    }
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
  const [isChangingPw, setIsChangingPw] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

  const openPasswordModal = () => {
    setCurrentPw('');
    setNewPw('');
    setConfirmPw('');
    setPwMessage('');
    setIsPasswordModalOpen(true);
  };

  const closePasswordModal = () => {
    if (isChangingPw) return;
    setIsPasswordModalOpen(false);
    setPwMessage('');
  };

  // 알림 환경 설정
  const [pushEnabled, setPushEnabled] = useState(user?.pushEnabled !== false && user?.pushEnabled !== 0 && user?.pushEnabled !== '0');
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [saveToast, setSaveToast] = useState(false);
  const [browserPerm, setBrowserPerm] = useState(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'unsupported';
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    const updatePerm = () => {
      setBrowserPerm(Notification.permission);
    };
    updatePerm();

    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'notifications' }).then((status) => {
        status.onchange = () => {
          updatePerm();
        };
      }).catch(() => {});
    }

    window.addEventListener('focus', updatePerm);
    return () => window.removeEventListener('focus', updatePerm);
  }, []);


  const handlePwChange = async (e) => {
    e.preventDefault();
    if (!currentPw || !newPw || !confirmPw) {
      setPwMessage('모든 비밀번호 항목을 입력해주세요.');
      return;
    }
    if (newPw.length < 8) {
      setPwMessage('새 비밀번호는 8자 이상이어야 합니다.');
      return;
    }
    if (newPw !== confirmPw) {
      setPwMessage('새 비밀번호가 일치하지 않습니다.');
      return;
    }
    if (currentPw === newPw) {
      setPwMessage('새 비밀번호는 현재 비밀번호와 다르게 설정해 주세요.');
      return;
    }

    setIsChangingPw(true);
    setPwMessage('');

    try {
      const res = await fetch('/api/users/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.userId,
          username: user?.username,
          currentPassword: currentPw,
          newPassword: newPw,
          confirmPassword: confirmPw,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setPwMessage(data.message || '비밀번호가 성공적으로 변경되었습니다.');
        setCurrentPw('');
        setNewPw('');
        setConfirmPw('');
        setIsPasswordModalOpen(false);
        setSaveToast(true);
        setTimeout(() => setSaveToast(false), 3000);
      } else {
        setPwMessage(data.message || '비밀번호 변경에 실패했습니다.');
      }
    } catch (err) {
      setPwMessage('서버 통신 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setIsChangingPw(false);
    }
  };

  const savePushSetting = async (targetVal) => {
    const uname = user?.username || '';
    const uid = user?.userId || '';
    if (!uid && !uname) return false;

    setIsSavingSettings(true);
    try {
      const response = await fetch('/api/users/push-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: uid,
          username: uname,
          pushEnabled: targetVal,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.message || '알림 설정 저장에 실패했습니다.');
      }
      const savedPushEnabled = data.pushEnabled !== false && data.pushEnabled !== 0 && data.pushEnabled !== '0';
      setPushEnabled(savedPushEnabled);
      onUserUpdated?.({ pushEnabled: savedPushEnabled });
      setSaveToast(true);
      setTimeout(() => setSaveToast(false), 3000);
      return true;
    } catch (error) {
      alert(error.message || '알림 설정 저장에 실패했습니다.');
      return false;
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleTogglePush = async (e) => {
    const nextVal = e.target.checked;

    if (!('Notification' in window)) {
      alert('현재 브라우저는 웹 알림 기능을 지원하지 않습니다.');
      return;
    }

    if (nextVal) {
      if (Notification.permission === 'denied') {
        alert(
          '브라우저 알림 권한이 차단되어 있어 알림을 켤 수 없습니다.\n\n' +
          '브라우저 주소창 왼쪽의 사이트 설정(자물쇠 아이콘)을 클릭하여 알림을 "허용"으로 변경한 후 다시 시도해 주세요.'
        );
        return;
      }

      if (Notification.permission === 'default') {
        try {
          const result = await Notification.requestPermission();
          setBrowserPerm(result);
          if (result !== 'granted') {
            alert('브라우저 알림 권한이 허용되지 않아 알림이 활성화되지 않았습니다.');
            return;
          }
          try {
            new Notification('제때약 복약 알림이 활성화되었습니다', {
              body: '정해진 복약 시간 30분 전과 정시에 알림을 보내드립니다.',
              icon: '/favicon.ico',
            });
          } catch (ignored) {}
        } catch (err) {
          console.warn('알림 권한 요청 실패:', err);
          alert('알림 권한 요청 중 오류가 발생했습니다.');
          return;
        }
      }
    }

    setPushEnabled(nextVal);
    const ok = await savePushSetting(nextVal);
    if (!ok) {
      setPushEnabled(!nextVal);
    }
  };

  const handleSaveSettings = async () => {
    if (pushEnabled) {
      if (!('Notification' in window)) {
        alert('현재 브라우저는 웹 알림 기능을 지원하지 않습니다.');
        return;
      }
      if (Notification.permission === 'denied') {
        alert(
          '브라우저 알림 권한이 차단되어 있어 알림을 켤 수 없습니다.\n\n' +
          '브라우저 주소창 왼쪽의 사이트 설정(자물쇠 아이콘)을 클릭하여 알림을 "허용"으로 변경한 후 다시 시도해 주세요.'
        );
        return;
      }
      if (Notification.permission === 'default') {
        try {
          const result = await Notification.requestPermission();
          setBrowserPerm(result);
          if (result !== 'granted') {
            alert('브라우저 알림 권한이 허용되지 않아 알림 설정을 저장할 수 없습니다.');
            return;
          }
        } catch (err) {
          console.warn('알림 권한 요청 실패:', err);
          return;
        }
      }
    }
    await savePushSetting(pushEnabled);
  };

  const handleWithdraw = async () => {
    // 체험용 계정 보호 체크
    if (!user || user.isDemo || user.username === 'demo' || user.username === 'test12' || user.userId === 1) {
      alert('체험용 계정은 탈퇴할 수 없습니다.');
      return;
    }

    const confirmed = true; /*
      '정말 회원 탈퇴를 진행하시겠습니까?\n\n' +
      '탈퇴 시 등록된 복약 스케줄, 처방전, 보관함 및 영양제 목록, 커뮤니티 작성 글/댓글, 가족 연동 등 모든 개인 데이터가 영구적으로 완전 삭제되며 복구할 수 없습니다.'
    ); */
    if (!confirmed) return;

    try {
      setIsWithdrawing(true);
      const res = await fetch('/api/users/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.userId, username: user.username }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        alert('회원 탈퇴가 정상적으로 완료되었습니다. 그동안 제때약을 이용해 주셔서 감사합니다.');
        try {
          if (onLogout) {
            await onLogout();
          }
        } catch (ignored) {}
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        sessionStorage.clear();
        window.location.replace('/');
      } else {
        alert(data.message || '회원 탈퇴 처리에 실패했습니다.');
      }
    } catch (err) {
      console.error('회원 탈퇴 오류:', err);
      alert('서버와 통신 중 오류가 발생했습니다.');
    } finally {
      setIsWithdrawing(false);
    }
  };

  if (!user) {
    return (
      <div className="mypage-wrapper">
        <header className="page-section-header">
          <span className="section-meta-tag">MY ACCOUNT</span>
          <h1 className="section-title">마이 페이지</h1>
        </header>
        <p className="mypage-empty-guide">
          로그인하면 마이페이지와 내 약 설정을 이용할 수 있어요.{' '}
          <Link to="/login?next=/mypage">로그인</Link>
        </p>
      </div>
    );
  }

  const normalizedSex = String(accountDetails.sex || '').trim().toUpperCase();
  const isFemale = ['F', 'FEMALE', '여성'].includes(normalizedSex);
  const sexLabel = isFemale ? '여성' : ['M', 'MALE', '남성'].includes(normalizedSex) ? '남성' : '미입력';
  const emailLabel = email || user?.email || (user?.username ? `${user.username}@jetteyak.kr` : '미입력');

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
            className="profile-photo-circle has-image"
            style={{ backgroundImage: `url(${profileImage && !imgError ? profileImage : defaultProfileImg})` }}
          >
            {profileImage && !imgError && (
              <img
                src={profileImage}
                alt=""
                style={{ display: 'none' }}
                onError={() => setImgError(true)}
              />
            )}
          </div>
          <input ref={fileInputRef} className="profile-photo-input" type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={handleProfilePhotoChange} />
          <button type="button" className="photo-change-btn">사진 변경</button>
        </div>

        <div className="profile-main-meta">
          <span className="meta-kicker">PROFILE</span>
          <div className="meta-name-editor">
            <strong className="nickname-display">{nickname}</strong>
            <button
              type="button"
              className="nickname-edit-icon"
              onClick={openNicknameModal}
              title="닉네임 수정"
            >
              ✎
            </button>
          </div>
          {profileMessage && <span className="profile-message">{profileMessage}</span>}
        </div>
      </section>

      {/* 2단 그리드: 회원 정보/비밀번호 변경 (좌) + 서비스 환경설정 & 계정관리 (우) */}
      <div className="mypage-two-cols">
        {/* 좌측 열: 비밀번호 변경 및 약 등록 바로가기 안내 */}
        <div className="mypage-col-left">
          <section className="mypage-subcard account-info-card">
            <span className="meta-kicker">ACCOUNT INFORMATION</span>
            <h2 className="subcard-title">계정 정보</h2>
            <dl className="account-info-list">
              <div><dt>아이디</dt><dd>{user?.username || '미입력'}</dd></div>
              <div><dt>이메일</dt><dd>{emailLabel}</dd></div>
              <div><dt>성별</dt><dd>{sexLabel}</dd></div>
              {isFemale && <div><dt>임신 여부</dt><dd>{accountDetails.isPregnant ? '임신 중' : '해당 없음'}</dd></div>}
              <div><dt>가족 이름</dt><dd>{accountDetails.familyName || '소속 가족 없음'}</dd></div>
            </dl>
          </section>
          {/* 비밀번호 변경 */}
          <section className="mypage-subcard">
            <span className="meta-kicker">PASSWORD</span>
            <h2 className="subcard-title">비밀번호 변경</h2>

            <form onSubmit={handlePwChange} className="password-form" hidden>
              <input
                type="password"
                placeholder="현재 비밀번호"
                className="styled-input"
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
              />
              <input
                type="password"
                placeholder="새 비밀번호 (8자 이상)"
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

              <button type="submit" className="action-outline-btn" disabled={isChangingPw}>
                {isChangingPw ? '변경 중...' : '비밀번호 변경'}
              </button>
            </form>
            <button type="button" className="action-outline-btn password-modal-open-btn" onClick={openPasswordModal}>
              비밀번호 변경
            </button>
          </section>
        </div>

        {/* 우측 열: 서비스 환경설정 & 회원 탈퇴 */}
        <div className="mypage-col-right">
          <section className="mypage-subcard my-posts-card">
            <span className="meta-kicker">COMMUNITY</span>
            <div className="my-posts-heading">
              <h2 className="subcard-title">내가 작성한 글</h2>
              <Link to="/community" className="my-posts-all-link">전체 보기</Link>
            </div>
            {myPostsLoading ? (
              <p className="my-posts-status">게시글을 불러오는 중입니다.</p>
            ) : myPostsError ? (
              <p className="my-posts-status my-posts-error">{myPostsError}</p>
            ) : myPosts.length ? (
              <ul className="my-posts-list">
                {myPosts.map((post) => (
                  <li key={post.postId}>
                    <Link to={`/community?postId=${post.postId}`}>
                      <span className="my-post-title">{post.title}</span>
                      <span className="my-post-date">{post.createdAt}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="my-posts-status">아직 작성한 게시글이 없습니다.</p>
            )}
          </section>
          {/* 서비스 환경 설정 */}
          <section className="mypage-subcard service-settings-card">
            <span className="meta-kicker">SERVICE SETTINGS</span>
            <h2 className="subcard-title">서비스 환경 설정</h2>

            <div className="setting-toggle-row">
              <div className="setting-info">
                <strong>복용 알림 전체 Push</strong>
                <p>모든 복약 알림을 받아볼게요.</p>
                <div className="browser-perm-status">
                  <span className="perm-label">브라우저 알림 권한:</span>
                  {browserPerm === 'granted' && (
                    <span className="perm-badge perm-granted">허용됨</span>
                  )}
                  {browserPerm === 'denied' && (
                    <span className="perm-badge perm-denied">차단됨 (주소창 설정 필요)</span>
                  )}
                  {browserPerm === 'default' && (
                    <span className="perm-badge perm-default">미설정 (토글 시 요청)</span>
                  )}
                  {browserPerm === 'unsupported' && (
                    <span className="perm-badge perm-unsupported">미지원 브라우저</span>
                  )}
                </div>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={pushEnabled && browserPerm !== 'denied'}
                  onChange={handleTogglePush}
                />
                <span className="toggle-slider" />
              </label>
            </div>

            {browserPerm === 'denied' && (
              <div className="browser-perm-alert">
                현재 브라우저에서 알림이 차단되어 있습니다. 알림을 받으시려면 브라우저 주소창 좌측의 설정(자물쇠) 아이콘을 눌러 알림 권한을 '허용'으로 변경해주세요.
              </div>
            )}

            <div className="withdraw-row">
              <button
                type="button"
                className="withdraw-btn"
                onClick={() => setIsWithdrawModalOpen(true)}
                disabled={isWithdrawing}
              >
                {isWithdrawing ? '탈퇴 처리 중...' : '회원 탈퇴'}
              </button>
            </div>
          </section>
        </div>
      </div>

      {isNicknameModalOpen && (
        <div className="mypage-modal-backdrop" role="presentation" onMouseDown={() => !isNicknameSaving && setIsNicknameModalOpen(false)}>
          <section className="mypage-account-modal" role="dialog" aria-modal="true" aria-labelledby="nickname-modal-title" onMouseDown={(e) => e.stopPropagation()}>
            <div className="account-modal-header">
              <div><span className="meta-kicker">PROFILE</span><h2 id="nickname-modal-title">닉네임 변경</h2></div>
              <button type="button" className="account-modal-close" aria-label="닫기" onClick={() => setIsNicknameModalOpen(false)} disabled={isNicknameSaving}>×</button>
            </div>
            <form onSubmit={handleNicknameSave} className="password-modal-form">
              <label htmlFor="nickname-draft">새 닉네임</label>
              <input id="nickname-draft" type="text" className="styled-input" value={nicknameDraft} onChange={(e) => setNicknameDraft(e.target.value)} minLength="2" maxLength="6" autoFocus />
              <p className="account-modal-help">2~6자로 입력해 주세요.</p>
              {profileMessage && <div className="form-feedback error">{profileMessage}</div>}
              <div className="account-modal-actions">
                <button type="button" className="account-modal-cancel" onClick={() => setIsNicknameModalOpen(false)} disabled={isNicknameSaving}>취소</button>
                <button type="submit" className="action-solid-btn" disabled={isNicknameSaving}>{isNicknameSaving ? '저장 중...' : '저장'}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {isPasswordModalOpen && (
        <div className="mypage-modal-backdrop" role="presentation" onMouseDown={closePasswordModal}>
          <section className="mypage-account-modal" role="dialog" aria-modal="true" aria-labelledby="password-modal-title" onMouseDown={(e) => e.stopPropagation()}>
            <div className="account-modal-header">
              <div><span className="meta-kicker">PASSWORD</span><h2 id="password-modal-title">비밀번호 변경</h2></div>
              <button type="button" className="account-modal-close" aria-label="닫기" onClick={closePasswordModal} disabled={isChangingPw}>×</button>
            </div>
            <form onSubmit={handlePwChange} className="password-modal-form">
              <label htmlFor="current-password">현재 비밀번호</label>
              <input id="current-password" type="password" className="styled-input" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} autoComplete="current-password" autoFocus />
              <label htmlFor="new-password">새 비밀번호</label>
              <input id="new-password" type="password" className="styled-input" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" />
              <label htmlFor="confirm-password">새 비밀번호 확인</label>
              <input id="confirm-password" type="password" className="styled-input" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} autoComplete="new-password" />
              {pwMessage && <div className="form-feedback error">{pwMessage}</div>}
              <div className="account-modal-actions">
                <button type="button" className="account-modal-cancel" onClick={closePasswordModal} disabled={isChangingPw}>취소</button>
                <button type="submit" className="action-solid-btn" disabled={isChangingPw}>{isChangingPw ? '변경 중...' : '저장'}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {isWithdrawModalOpen && (
        <div className="withdraw-modal-backdrop" role="presentation" onMouseDown={() => !isWithdrawing && setIsWithdrawModalOpen(false)}>
          <section className="withdraw-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="withdraw-dialog-title" onMouseDown={(e) => e.stopPropagation()}>
            <div className="withdraw-modal-icon" aria-hidden="true">!</div>
            <h2 id="withdraw-dialog-title">회원 탈퇴를 진행할까요?</h2>
            <p>탈퇴하면 복약 일정, 처방전, 영양제 목록, 커뮤니티 작성글과 댓글, 가족 연동을 포함한 모든 데이터가 영구 삭제됩니다. 삭제된 데이터는 복구할 수 없습니다.</p>
            <div className="withdraw-modal-actions">
              <button type="button" className="withdraw-modal-cancel" onClick={() => setIsWithdrawModalOpen(false)} disabled={isWithdrawing}>취소</button>
              <button type="button" className="withdraw-modal-confirm" onClick={handleWithdraw} disabled={isWithdrawing}>{isWithdrawing ? '탈퇴 처리 중...' : '탈퇴하기'}</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
