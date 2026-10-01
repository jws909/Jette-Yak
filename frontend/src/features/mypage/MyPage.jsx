import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import './MyPage.css';
import defaultProfileImg from '../../assets/Default_profile.png';

export default function MyPage({ user, onUserUpdated, onLogout }) {
  const [nickname, setNickname] = useState(user?.nickname || user?.name || user?.username || '');
  const [isEditingNick, setIsEditingNick] = useState(false);
  const [email, setEmail] = useState(user?.email || '');
  const [profileImage, setProfileImage] = useState(user?.profileImageUrl || '');
  const [imgError, setImgError] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!user?.username) return;
    const targetUser = user.username === 'demo' ? 'test12' : user.username;
    fetch(`/api/users/profile?username=${encodeURIComponent(targetUser)}`)
      .then((response) => response.ok ? response.json() : null)
      .then((profile) => {
        if (!profile) return;
        setNickname(profile.nickname || user.name);
        if (profile.email) setEmail(profile.email);
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
  const [isChangingPw, setIsChangingPw] = useState(false);

  // 평소 복용 관리 (상비약 & 영양제 DB 연동)
  const [everydayMeds, setEverydayMeds] = useState([]);
  const [isLoadingMeds, setIsLoadingMeds] = useState(false);
  const [medSearchText, setMedSearchText] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const searchBoxRef = useRef(null);

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

  // 캘린더 복약 일정 등록 모달 state
  const [scheduleModalMed, setScheduleModalMed] = useState(null);
  const [schedStartDate, setSchedStartDate] = useState('');
  const [schedTime, setSchedTime] = useState('09:00');
  const [schedRepeatDays, setSchedRepeatDays] = useState(30);
  const [isSubmittingSched, setIsSubmittingSched] = useState(false);

  const fetchEverydayMeds = async () => {
    if (!user?.userId && !user?.username) {
      setEverydayMeds([]);
      return;
    }
    try {
      setIsLoadingMeds(true);
      const uid = user?.userId || '';
      const uname = user?.username || '';
      const params = new URLSearchParams();
      if (uid) params.append('userId', uid);
      if (uname) params.append('username', uname);
      const queryStr = params.toString() ? `?${params.toString()}` : '';
      const res = await fetch(`/api/users/everyday-meds${queryStr}`);
      if (res.ok) {
        const list = await res.json();
        setEverydayMeds(Array.isArray(list) ? list : []);
      }
    } catch (err) {
      console.error('Failed to fetch everyday meds', err);
    } finally {
      setIsLoadingMeds(false);
    }
  };

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      if (!user?.userId && !user?.username) {
        setEverydayMeds([]);
        return;
      }
      try {
        const uid = user?.userId || '';
        const uname = user?.username || '';
        const params = new URLSearchParams();
        if (uid) params.append('userId', uid);
        if (uname) params.append('username', uname);
        const queryStr = params.toString() ? `?${params.toString()}` : '';
        const res = await fetch(`/api/users/everyday-meds${queryStr}`);
        if (!ignore && res.ok) {
          const list = await res.json();
          setEverydayMeds(Array.isArray(list) ? list : []);
        }
      } catch (err) {
        console.error('Failed to fetch everyday meds', err);
      }
    };
    load();
    return () => { ignore = true; };
  }, [user?.userId, user?.username]);

  // 검색어 입력 시 의약품 자동완성 (250ms 디바운스)
  useEffect(() => {
    const keyword = medSearchText.trim();
    if (!keyword) return;

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/calendar/search-medications?keyword=${encodeURIComponent(keyword)}`);
        if (res.ok) {
          const list = await res.json();
          setSearchResults(Array.isArray(list) ? list : []);
          setIsDropdownOpen(true);
        }
      } catch (e) {
        console.error('Search error', e);
      } finally {
        setIsSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [medSearchText]);

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 상비약 추가 (의약품 DB 선택)
  const handleAddCabinetMed = async (item) => {
    try {
      const uid = user?.userId || '';
      const uname = user?.username || '';
      const medId = item?.medicationId || item?.itemSeq;
      if (!medId) return;
      const res = await fetch('/api/users/everyday-meds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: uid,
          username: uname,
          type: 'CABINET',
          medicationId: medId,
        }),
      });
      if (res.ok) {
        setMedSearchText('');
        setIsDropdownOpen(false);
        fetchEverydayMeds();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.message || '상비약 등록에 실패했습니다.');
      }
    } catch (e) {
      console.error('Failed to add cabinet med', e);
    }
  };

  // 영양제 추가 (직접 입력)
  const handleAddRoutineMed = async (name, item = null) => {
    const trimmed = (item?.itemName || name || '').trim();
    if (!trimmed) return;
    try {
      const uid = user?.userId || '';
      const uname = user?.username || '';
      const res = await fetch('/api/users/everyday-meds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: uid,
          username: uname,
          type: 'ROUTINE',
          name: trimmed,
          medicationId: item?.medicationId || item?.itemSeq || null,
        }),
      });
      if (res.ok) {
        setMedSearchText('');
        setIsDropdownOpen(false);
        fetchEverydayMeds();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.message || '영양제 등록에 실패했습니다.');
      }
    } catch (e) {
      console.error('Failed to add routine med', e);
    }
  };

  const handleAddMed = (e) => {
    e.preventDefault();
    if (!medSearchText.trim()) return;
    handleAddRoutineMed(medSearchText.trim());
  };

  const handleRemoveMed = async (med) => {
    if (!med?.source || !med?.rawId) return;
    if (!window.confirm(`'${med.name}'을(를) 평소 복용 목록에서 삭제하시겠습니까?`)) return;
    try {
      const uid = user?.userId || '';
      const uname = user?.username || '';
      const params = new URLSearchParams();
      if (uid) params.append('userId', uid);
      if (uname) params.append('username', uname);
      const queryStr = params.toString() ? `?${params.toString()}` : '';
      const res = await fetch(`/api/users/everyday-meds/${med.source.toLowerCase()}/${med.rawId}${queryStr}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        fetchEverydayMeds();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.message || '삭제에 실패했습니다.');
      }
    } catch (e) {
      console.error('Failed to delete everyday med', e);
    }
  };

  const handleOpenScheduleModal = (med) => {
    setScheduleModalMed(med);
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    setSchedStartDate(todayStr);
    setSchedTime(med.takeTime && med.takeTime.includes(':') ? med.takeTime : '09:00');
    setSchedRepeatDays(30);
  };

  const handleSaveScheduleFromMyPage = async (e) => {
    e.preventDefault();
    if (!scheduleModalMed) return;
    const uid = user?.userId || '';
    if (!uid) {
      alert('로그인이 필요합니다.');
      return;
    }

    setIsSubmittingSched(true);
    try {
      const res = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: uid,
          name: scheduleModalMed.name,
          medicationId: scheduleModalMed.medicationId || null,
          type: scheduleModalMed.source === 'CABINET' ? 'regular' : 'supplement',
          scheduledDate: schedStartDate,
          scheduledTime: schedTime,
          alarmEnabled: 1,
          repeatDays: schedRepeatDays,
        }),
      });

      if (res.ok) {
        alert(`'${scheduleModalMed.name}'의 ${schedRepeatDays}일간 복약 일정이 캘린더에 성공적으로 등록되었습니다!`);
        setScheduleModalMed(null);
        fetchEverydayMeds();
        window.dispatchEvent(new CustomEvent('jette-intake-updated', {
          detail: { userId: uid, date: schedStartDate }
        }));
      } else {
        const errText = await res.text().catch(() => '');
        alert('일정 등록에 실패했습니다.' + (errText ? ` (${errText})` : ''));
      }
    } catch (err) {
      console.error('일정 등록 오류:', err);
      alert('서버 통신 중 오류가 발생했습니다.');
    } finally {
      setIsSubmittingSched(false);
    }
  };

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
        setTimeout(() => setPwMessage(''), 3000);
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

    const confirmed = window.confirm(
      '정말 회원 탈퇴를 진행하시겠습니까?\n\n' +
      '탈퇴 시 등록된 복약 스케줄, 처방전, 보관함 및 영양제 목록, 커뮤니티 작성 글/댓글, 가족 연동 등 모든 개인 데이터가 영구적으로 완전 삭제되며 복구할 수 없습니다.'
    );
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
          <span className="email-display">{email || user?.email || (user?.username ? `${user.username}@jetteyak.kr` : '')}</span>
          {profileMessage && <span className="profile-message">{profileMessage}</span>}
        </div>
      </section>

      {/* 2단 그리드: 평소 복용 관리 (좌) + 비밀번호 변경 & 환경설정 (우) */}
      <div className="mypage-two-cols">
        {/* 좌측 열: 평소 복용 관리 (EVERYDAY MEDICATION) */}
        <div className="mypage-col-left">
          <section className="mypage-subcard full-height">
            <span className="meta-kicker">EVERYDAY MEDICATION</span>
            <h2 className="subcard-title">평소 복용 관리</h2>

            {/* 검색 및 추가 인풋 */}
            <div className="everyday-search-wrapper" ref={searchBoxRef}>
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
                    onChange={(e) => {
                      const val = e.target.value;
                      setMedSearchText(val);
                      if (!val.trim()) {
                        setSearchResults([]);
                        setIsDropdownOpen(false);
                      }
                    }}
                    onFocus={() => { if (medSearchText.trim()) setIsDropdownOpen(true); }}
                  />
                  {isSearching ? (
                    <span className="search-mini-spinner" />
                  ) : (
                    <button type="submit" className="search-add-btn" title="영양제로 바로 추가">+</button>
                  )}
                </div>
              </form>

              {/* 검색 자동완성 드롭다운 */}
              {isDropdownOpen && medSearchText.trim() && (
                <div className="search-autocomplete-dropdown">
                  {searchResults.length > 0 && (
                    <div className="dropdown-section">
                      <div className="dropdown-header">식약처 의약품과 연결해 등록</div>
                      <div className="dropdown-med-list">
                        {searchResults.slice(0, 8).map((item, idx) => (
                          <div
                            key={item.medicationId || item.itemSeq || idx}
                            className="dropdown-med-item"
                          >
                            <div className="med-info">
                              <strong className="med-title">{item.itemName}</strong>
                              {item.entpName && <span className="med-corp">{item.entpName}</span>}
                            </div>
                            <div className="med-add-actions">
                              <button type="button" className="med-add-badge badge-cabinet" onClick={() => handleAddCabinetMed(item)}>+ 상비약</button>
                              <button type="button" className="med-add-badge badge-routine" onClick={() => handleAddRoutineMed('', item)}>+ 영양제</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 하단: 영양제 직접 등록 버튼 */}
                  <div
                    className="dropdown-routine-item"
                    onClick={() => handleAddRoutineMed(medSearchText.trim())}
                  >
                    <div className="routine-prompt">
                      <span><strong>&lsquo;{medSearchText.trim()}&rsquo;</strong> 영양제로 등록하기</span>
                    </div>
                    <span className="med-add-badge badge-routine">+ 영양제</span>
                  </div>
                </div>
              )}
            </div>

            {/* 등록된 목록 */}
            <div className="everyday-list">
              {isLoadingMeds ? (
                <div className="everyday-loading">복용 목록을 불러오는 중...</div>
              ) : everydayMeds.length === 0 ? (
                <div className="everyday-empty">
                  <p>등록된 평소 복용 약(상비약, 영양제)이 없습니다.</p>
                  <span>위 검색창에서 의약품을 검색하거나 비타민 이름을 입력하여 등록해 보세요.</span>
                </div>
              ) : (
                everydayMeds.map((med) => (
                  <div key={med.id} className="everyday-item-row">
                    <div className="everyday-left">
                      <span className="everyday-dot" style={{ backgroundColor: med.dotColor || ('CABINET' === med.source ? '#5c9e76' : '#e09f3e') }} />
                      <div className="everyday-name-block">
                        <strong className="everyday-name">{med.name}</strong>
                        {med.entpName && <small className="everyday-subtext">{med.entpName}</small>}
                        {med.takeTime && (
                          <small className="everyday-time-tag">
                            권장 {med.takeTime}{med.notes && med.notes !== '보관 등록' ? ` · ${med.notes}` : ''}
                          </small>
                        )}
                      </div>
                    </div>
                    <div className="everyday-right">
                      <span className={`everyday-type-badge ${med.source === 'CABINET' ? 'badge-cabinet' : 'badge-routine'}`}>
                        {med.type || (med.source === 'CABINET' ? '상비약' : '영양제')}
                      </span>
                      <span className={`everyday-status-pill ${med.useStatus === 'ACTIVE' ? 'status-active' : 'status-stored'}`}>
                        {med.useStatus === 'ACTIVE' ? '복용 중' : '보관 중'}
                      </span>
                      <button
                        type="button"
                        className="everyday-sched-btn"
                        onClick={() => handleOpenScheduleModal(med)}
                        title="캘린더에 매일/주기적 복약 일정 등록"
                      >
                        일정 등록
                      </button>
                      <button
                        type="button"
                        className="everyday-delete-btn"
                        onClick={() => handleRemoveMed(med)}
                        title="복용 목록에서 삭제"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* 우측 열: 비밀번호 변경 & 환경설정 */}
        <div className="mypage-col-right">
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

              <button type="submit" className="action-outline-btn" disabled={isChangingPw}>
                {isChangingPw ? '변경 중...' : '비밀번호 변경'}
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

            <button
              type="button"
              className="action-solid-btn"
              onClick={handleSaveSettings}
              disabled={isSavingSettings}
            >
              {isSavingSettings ? '저장 중...' : '변경 사항 저장'}
            </button>

            <div className="withdraw-row">
              <button
                type="button"
                className="withdraw-btn"
                onClick={handleWithdraw}
                disabled={isWithdrawing}
              >
                {isWithdrawing ? '탈퇴 처리 중...' : '회원 탈퇴'}
              </button>
            </div>
          </section>
        </div>
      </div>

      {/* 캘린더 복약 일정 등록 모달 */}
      {scheduleModalMed && (
        <div className="modal-overlay" onClick={() => !isSubmittingSched && setScheduleModalMed(null)}>
          <div className="mypage-sched-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sched-modal-header">
              <h3>캘린더 복약 일정 등록</h3>
              <button
                type="button"
                className="sched-modal-close"
                onClick={() => !isSubmittingSched && setScheduleModalMed(null)}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveScheduleFromMyPage}>
              <div className="sched-med-summary">
                <span className="sched-med-badge">{scheduleModalMed.source === 'CABINET' ? '상비약' : '영양제'}</span>
                <strong className="sched-med-title">{scheduleModalMed.name}</strong>
              </div>

              <div className="sched-form-group">
                <label>시작일</label>
                <input
                  type="date"
                  className="styled-input"
                  value={schedStartDate}
                  onChange={(e) => setSchedStartDate(e.target.value)}
                  required
                />
              </div>

              <div className="sched-form-group">
                <label>복용 시간</label>
                <input
                  type="time"
                  className="styled-input"
                  value={schedTime}
                  onChange={(e) => setSchedTime(e.target.value)}
                  required
                />
              </div>

              <div className="sched-form-group">
                <label>복용 기간 (주기)</label>
                <div className="repeat-days-group">
                  {[
                    { label: '7일 (1주)', days: 7 },
                    { label: '14일 (2주)', days: 14 },
                    { label: '30일 (1개월)', days: 30 },
                    { label: '90일 (3개월)', days: 90 },
                  ].map(({ label, days }) => (
                    <button
                      key={days}
                      type="button"
                      className={`repeat-btn ${schedRepeatDays === days ? 'active' : ''}`}
                      onClick={() => setSchedRepeatDays(days)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="field-hint-repeat">
                  {schedStartDate || '시작일'}부터 <strong>{schedRepeatDays}일 동안 매일</strong> 같은 시간에 복약 일정이 자동 생성됩니다.
                </p>
              </div>

              <div className="sched-modal-actions">
                <button
                  type="button"
                  className="btn-sched-cancel"
                  onClick={() => setScheduleModalMed(null)}
                  disabled={isSubmittingSched}
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="btn-sched-confirm"
                  disabled={isSubmittingSched}
                >
                  {isSubmittingSched ? '일정 등록 중...' : `${schedRepeatDays}일간 일정 등록`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
