import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDialog } from '../../contexts/DialogContext';
import DatePicker from '../../components/ui/DatePicker';
import { saveIntakeStatus } from '../../utils/intakeApi';
import { buildFamilyMedicationReport } from './familyReport';
import './FamilyPage.css';
import { createLatestRequest } from '../../utils/latestRequest';
import { formatTime24 } from '../../utils/dateTime';

function getFormattedDate(targetDate) {
  const y = targetDate.getFullYear();
  const m = String(targetDate.getMonth() + 1).padStart(2, '0');
  const d = String(targetDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// 입력과 저장 모두 같은 시/분 범위를 사용합니다.
function normalizeTimePart(value, max, fallback = 0) {
  const parsed = parseInt(value, 10);
  return String(Number.isNaN(parsed) ? fallback : Math.min(max, Math.max(0, parsed))).padStart(2, '0');
}

// 시간을 조절하는 동안 모달이 함께 스크롤되지 않게 합니다.
function preventPickerScroll(node) {
  if (!node) return;
  const preventScroll = (event) => {
    if (event.deltaY !== 0) event.preventDefault();
  };
  node.addEventListener('wheel', preventScroll, { passive: false });
  return () => node.removeEventListener('wheel', preventScroll);
}

function getSlotFromTime(t) {
  if (!t || !t.includes(':')) return { slot: 'morning', slotLabel: '아침' };
  const h = parseInt(t.split(':')[0], 10);
  if (h < 11) return { slot: 'morning', slotLabel: '아침' };
  if (h < 16) return { slot: 'lunch', slotLabel: '점심' };
  if (h < 21) return { slot: 'evening', slotLabel: '저녁' };
  return { slot: 'bedtime', slotLabel: '취침전' };
}

export default function FamilyPage(props) {
  return <FamilyContent key={props.user?.userId || props.user?.id || props.user?.username || 'guest'} {...props} />;
}

function FamilyContent(props) {
  const navigate = useNavigate();
  const { showAlert, showConfirm } = useDialog();
  const user = props.user;
  const intakeLock = useRef(false);
  const currentUserId = user?.userId || null;
  const today = new Date();

  // 1. 상태 관리
  const [familyMembers, setFamilyMembers] = useState([]);
  const [selectedMemberId, setSelectedMemberId] = useState('all');

  const [currentDate, setCurrentDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(getFormattedDate(today));

  // 연/월 빠른 선택 팝오버 상태
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false);
  const [isYearDropdownOpen, setIsYearDropdownOpen] = useState(false);
  const monthPickerRef = useRef(null);
  const yearDropdownRef = useRef(null);
  const closeMonthPicker = useCallback(() => {
    setIsMonthPickerOpen(false);
    setIsYearDropdownOpen(false);
  }, []);
  const todayYear = today.getFullYear();

  // 빠른 연도 점프 옵션 (현재 연도 기준 -50년 ~ +10년)
  const calYearOptions = [];
  for (let optionYear = todayYear - 50; optionYear <= todayYear + 10; optionYear++) {
    calYearOptions.push(optionYear);
  }

  // 이전/다음 연도 1년 단위 이동
  const handleJumpYear = (delta) => {
    setCurrentDate((prev) => new Date(prev.getFullYear() + delta, prev.getMonth(), 1));
  };

  const [monthSummary, setMonthSummary] = useState({});
  const [schedules, setSchedules] = useState([]);
  const [dailyRequests] = useState(createLatestRequest);
  const [dailyLoadedKey, setDailyLoadedKey] = useState(null);
  const dailyQueryKey = `${currentUserId}|${selectedMemberId}|${selectedDate}`;
  const loading = Boolean(currentUserId) && dailyLoadedKey !== dailyQueryKey;

  const [inviteRole, setInviteRole] = useState('BABY'); // 기본값: 자녀

  // 역할 영문 -> 한글 변환 함수
  // 역할 한글 변환 함수 (영문 대소문자/공백 완벽 대응)
  // 역할 한글 변환 함수 (영문 대소문자/공백 완벽 대응)
  // 역할 한글 변환 함수 (GUAR 대응)
  const getRoleLabel = (role) => {
    if (!role) return '';
    const r = String(role).trim().toUpperCase();

    // 보호자 / 관리자 (GUAR 등)
    if (['GUAR', 'GUARDIAN', '보호자'].includes(r)) {
      return '(보호자)';
    }

    // 피보호자 (PROT 등)
    if (['PROT', 'PROTECTED', '피보호자'].includes(r)) {
      return '(피보호자)';
    }

    // 부모님
    if (['PARENT', 'FATHER', 'MOTHER', 'PARENTS', '부모님', '부모', '아빠', '엄마', 'PROT_SENIOR'].includes(r)) {
      return '(부모님)';
    }

    // 자녀
    if (['BABY', 'CHILD', 'KID', 'SON', 'DAUGHTER', '자녀', '아이', '아기'].includes(r)) {
      return '(자녀)';
    }

    // 배우자
    if (['SPOUSE', 'HUSBAND', 'WIFE', '배우자', '남편', '아내'].includes(r)) {
      return '(배우자)';
    }

    // 본인
    if (['SELF', 'ME', '본인'].includes(r)) {
      return '(본인)';
    }

    return `(${role})`;
  };
  // 체크리스트 내부 시간대 필터 탭 ('all' | 'morning' | 'lunch' | 'evening')
  const [timeFilter, setTimeFilter] = useState('all');

  // 보고서 모달 상태 (처방약 / 상시약 / 영양제 3단 분리)
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isReportLoading, setIsReportLoading] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [reportError, setReportError] = useState('');

  // 가족 등록 모달 상태
  const [isAddFamilyModalOpen, setIsAddFamilyModalOpen] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('PROT');

  // 가족 만들기 모달 상태
  const [isCreateFamilyModalOpen, setIsCreateFamilyModalOpen] = useState(false);
  const [newFamilyName, setNewFamilyName] = useState('');
  const [isCreatingFamily, setIsCreatingFamily] = useState(false);

  // 가족 이름 및 변경 모달 상태
  const [familyName, setFamilyName] = useState('');
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [editFamilyName, setEditFamilyName] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  // 기존 State들 부근에 추가
  const [familyAddTab, setFamilyAddTab] = useState('direct'); // 'direct' 또는 'invite'
  const [newMemberSex, setNewMemberSex] = useState('M');      // 남아 'M', 여아 'F'
  const [newMemberBirth, setNewMemberBirth] = useState('');    // 생년월일
  const [inviteLoginId, setInviteLoginId] = useState('');      // 회원 연동용 ID
  const [pendingInvitations, setPendingInvitations] = useState([]); // 도착한 초대 목록

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const currentYearMonth = `${year}-${String(month + 1).padStart(2, '0')}`;

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);

  // =========================================================================
  // 2. 비동기 백엔드 API 통신 로직
  // =========================================================================

  // 나에게 온 초대 목록 조회 (가족이 없을 때 수락할 수 있도록 안내)
  const fetchPendingInvitations = useCallback(async () => {
    if (!currentUserId) {
      setPendingInvitations([]);
      return;
    }
    try {
      const res = await fetch(`/api/family/invitations?userId=${currentUserId}`);
      if (res.ok) {
        const list = await res.json();
        setPendingInvitations(Array.isArray(list) ? list : []);
      }
    } catch (err) {
      console.warn('초대 목록 조회 실패:', err);
    }
  }, [currentUserId]);

  // (1) 가족 구성원 목록 조회
  const fetchFamilyMembers = useCallback(() => {
    if (!currentUserId) return;
    return fetch(`/api/family/members?userId=${currentUserId}`)
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : [];
          setFamilyMembers(list);
          if (list.length > 0 && list[0].familyName) {
            setFamilyName(list[0].familyName);
            setPendingInvitations([]);
          } else {
            setFamilyName('');
            fetchPendingInvitations();
          }
        }
      })
      .catch((err) => {
        console.error('가족 구성원 조회 오류:', err);
      });
  }, [currentUserId, fetchPendingInvitations, setFamilyMembers]);

  // (2) 월별 요약 조회 (달력 인디케이터용)
  const fetchMonthSummary = useCallback(() => {
    if (!currentUserId) return;
    const queryUser = selectedMemberId === 'all' ? currentUserId : selectedMemberId;
    const isFamilyParam = selectedMemberId === 'all' ? '&isFamily=true' : '';
    return fetch(`/api/calendar/summary?userId=${queryUser}&yearMonth=${currentYearMonth}${isFamilyParam}`)
      .then(async (res) => {
        if (res.ok) {
          const list = await res.json();
          const map = {};
          if (Array.isArray(list)) {
            list.forEach((item) => {
              map[item.scheduleDate] = {
                hasPrescription: Number(item.hasPrescription) === 1,
                hasRegular: Number(item.hasRegular) === 1,
                hasSupplement: Number(item.hasSupplement) === 1,
              };
            });
          }
          setMonthSummary(map);
        }
      })
      .catch((err) => {
        console.error('월별 요약 조회 실패:', err);
      });
  }, [currentYearMonth, currentUserId, selectedMemberId]);

  // (3) 선택 일자 복약 스케줄 조회
  const fetchDailySchedules = useCallback((targetDateStr) => {
    if (!currentUserId) return;
    const isLatest = dailyRequests.begin();
    const dateParam = targetDateStr && targetDateStr !== 'undefined'
      ? targetDateStr : (selectedDate || getFormattedDate(new Date()));
    const queryKey = `${currentUserId}|${selectedMemberId}|${dateParam}`;
    const queryUser = selectedMemberId === 'all' ? currentUserId : selectedMemberId;
    const isFamilyParam = selectedMemberId === 'all' ? '&isFamily=true' : '';
    return fetch(`/api/calendar?userId=${queryUser}&date=${dateParam}${isFamilyParam}`)
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          if (isLatest()) setSchedules(Array.isArray(data) ? data : []);
        } else if (isLatest()) {
          setSchedules([]);
        }
      })
      .catch((err) => {
        console.error('스케줄 조회 실패:', err);
        if (isLatest()) setSchedules([]);
      })
      .finally(() => {
        if (isLatest()) setDailyLoadedKey(queryKey);
      });
  }, [currentUserId, selectedMemberId, selectedDate, dailyRequests]);

  useEffect(() => {
    fetchFamilyMembers();
  }, [fetchFamilyMembers]);

  useEffect(() => {
    fetchMonthSummary();
  }, [fetchMonthSummary]);

  useEffect(() => {
    fetchDailySchedules(selectedDate);
    return () => dailyRequests.cancel();
  }, [selectedDate, fetchDailySchedules, dailyRequests]);

  // 외부 복약 상태 동기화 수신
  useEffect(() => {
    const handleSync = () => {
      fetchDailySchedules(selectedDate);
      fetchMonthSummary();
    };
    window.addEventListener('jette-intake-updated', handleSync);
    return () => window.removeEventListener('jette-intake-updated', handleSync);
  }, [selectedDate, fetchDailySchedules, fetchMonthSummary]);

  // (4) 복약 체크박스 토글
  const toggleTaken = async (item) => {
    if (!currentUserId) {
      showAlert('로그인 후 이용할 수 있습니다.', '안내');
      return;
    }
    const isTaken = !item.takenAt;
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const nowIso = isTaken
      ? `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
      : null;

    if (intakeLock.current) return;
    intakeLock.current = true;
    try {
      await saveIntakeStatus({ scheduleIds: [item.scheduleId], taken: isTaken, date: selectedDate });
      setSchedules(prev => prev.map(s => s.scheduleId === item.scheduleId ? { ...s, takenAt: nowIso } : s));
      fetchDailySchedules(selectedDate);
      fetchMonthSummary();
      window.dispatchEvent(new CustomEvent('jette-intake-updated', { detail: { date: selectedDate } }));
    } catch (error) {
      showAlert(error.message || '복약 체크를 저장하지 못했습니다.', '복약 체크 실패');
    } finally {
      intakeLock.current = false;
    }
  };


  // (6) [보고서] 버튼 클릭 시: 처방약 / 상시약 / 영양제 3단 분리 종합 취합
  const handleOpenReportModal = async () => {
    setIsReportOpen(true);
    setIsReportLoading(true);
    setReportData(null);
    setReportError('');
    try {
      const allMembers = selectedMemberId === 'all';
      const targetIds = [...new Set((allMembers
        ? [currentUserId, ...familyMembers.map(member => member.userId), ...schedules.map(item => item.userId)]
        : [selectedMemberId]).filter(Boolean).map(String))];
      const loaded = await Promise.allSettled(targetIds.map(async userId => {
        const response = await fetch('/api/prescriptions/list?userId=' + encodeURIComponent(userId));
        if (!response.ok) throw new Error('처방전 정보를 불러오지 못했습니다.');
        const data = await response.json();
        if (data.success === false) throw new Error(data.message || '처방전 정보를 불러오지 못했습니다.');
        const list = Array.isArray(data) ? data : Array.isArray(data.prescriptions) ? data.prescriptions : [];
        return list.map(item => ({ ...item, userId: item.userId ?? userId }));
      }));
      const prescriptions = loaded.filter(item => item.status === 'fulfilled').flatMap(item => item.value);
      if (loaded.some(item => item.status === 'rejected')) {
        setReportError('일부 처방전 정보를 불러오지 못했습니다. 확인되지 않은 의료기관과 복용 기간은 정보 없음으로 표시합니다.');
      }
      const member = familyMembers.find(item => String(item.userId) === String(selectedMemberId));
      const targetName = allMembers ? '가족 전체' : member
        ? member.name + ' ' + getRoleLabel(member.relation || member.roleLabel || member.role)
        : (user?.name || '본인');
      setReportData({
        targetName, targetDate: selectedDate,
        ...buildFamilyMedicationReport({ schedules, prescriptions, targetDate: selectedDate, familyMembers, includeOwner: allMembers, slotFromTime: getSlotFromTime }),
      });
    } catch {
      setReportError('복약 브리핑을 준비하지 못했습니다. 창을 닫은 뒤 다시 시도해주세요.');
    } finally {
      setIsReportLoading(false);
    }
  };

  // 신규 가족 그룹 생성
  const handleCreateFamily = async (e) => {
    if (e) e.preventDefault();
    if (!currentUserId) {
      showAlert('로그인이 필요한 서비스입니다.', '로그인 필요');
      return;
    }
    setIsCreatingFamily(true);
    try {
      const res = await fetch('/api/family/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          userId: currentUserId,
          familyName: newFamilyName.trim() || undefined,
        }),
      });
      let data = {};
      try {
        data = await res.json();
      } catch (parseErr) {
        throw new Error('서버 응답 오류가 발생했습니다. (HTTP ' + res.status + ')', { cause: parseErr });
      }
      if (res.ok && data.success) {
        showAlert(data.message || '가족 그룹이 성공적으로 생성되었습니다.', '가족 그룹 생성');
        setIsCreateFamilyModalOpen(false);
        setNewFamilyName('');
        if (data.familyName) {
          setFamilyName(data.familyName);
        }
        if (props.onUserUpdated) {
          props.onUserUpdated({
            familyId: data.familyId,
            role: 'GUAR',
          });
        }
        await fetchFamilyMembers();
        fetchDailySchedules(selectedDate);
        fetchMonthSummary();
      } else {
        showAlert(data.message || '가족 생성에 실패했습니다.', '오류');
      }
    } catch (err) {
      console.error('가족 생성 통신 오류:', err);
      showAlert(err.message || '서버 통신 중 오류가 발생했습니다.', '오류');
    } finally {
      setIsCreatingFamily(false);
    }
  };

  // 가족 이름 변경
  const handleRenameFamily = async (e) => {
    if (e) e.preventDefault();
    if (!editFamilyName.trim()) {
      showAlert('가족 이름을 입력해주세요.', '입력 안내');
      return;
    }
    setIsRenaming(true);
    try {
      const res = await fetch('/api/family/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          familyName: editFamilyName.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFamilyName(editFamilyName.trim());
        setIsRenameModalOpen(false);
        fetchFamilyMembers();
      } else {
        showAlert(data.message || '가족 이름 변경에 실패했습니다.', '오류');
      }
    } catch (err) {
      console.error('가족 이름 변경 오류:', err);
      showAlert('서버 통신 중 오류가 발생했습니다.', '오류');
    } finally {
      setIsRenaming(false);
    }
  };

  // 가족 등록
  const handleAddFamilyMember = async (e) => {
    e.preventDefault();
    if (!newMemberName.trim()) {
      showAlert('가족 구성원의 이름을 입력해주세요.', '입력 안내');
      return;
    }
    try {
      const res = await fetch(`/api/family/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guardianId: currentUserId,
          name: newMemberName.trim(),
          role: newMemberRole,
          sex: newMemberSex,
          birthdate: newMemberBirth,
        }),
      });
      if (res.ok) {
        showAlert('가족이 성공적으로 등록되었습니다.', '등록 완료');
        setNewMemberName('');
        setNewMemberSex('M');
        setNewMemberBirth('');
        setIsAddFamilyModalOpen(false);
        fetchFamilyMembers();
      } else {
        showAlert('가족 등록에 실패했습니다.', '오류');
      }
    } catch (err) {
      console.error('가족 등록 통신 오류:', err);
      showAlert('가족 등록 통신 중 오류가 발생했습니다.', '오류');
    }
  };

  // 회원 연동(초대) 처리 함수
  const handleInviteFamilyMember = async (e) => {
    if (e) e.preventDefault();

    if (!currentUserId) {
      showAlert('로그인이 필요한 서비스입니다.', '로그인 필요');
      return;
    }

    if (!inviteLoginId.trim()) {
      showAlert('초대할 가족의 아이디를 입력해주세요.', '입력 안내');
      return;
    }

    try {
      const response = await fetch('/api/family/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          senderId: currentUserId,
          targetLoginId: inviteLoginId.trim(),
          role: inviteRole,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        showAlert('가족 연동 초대를 보냈습니다!', '초대 완료');
        setInviteLoginId('');
        setIsAddFamilyModalOpen(false);
      } else {
        // 400, 404 등 백엔드에서 던진 구체적인 에러 메시지 출력
        showAlert(data.message || '연동 요청에 실패했습니다.', '초대 실패');
      }
    } catch (error) {
      console.error('초대 요청 에러:', error);
      showAlert('서버 통신 중 오류가 발생했습니다.', '오류');
    }
  };

  const handleRemoveMember = (member) => {
    const memberName = member.name || member.nickname || '구성원';
    const isVirtual = member.isVirtual === 'Y';
    showConfirm({
      title: isVirtual ? '가상 구성원 삭제' : '가족 구성원 내보내기',
      description: isVirtual
        ? `'${memberName}' 님의 모든 복약 정보 및 가상 계정이 영구 삭제됩니다. 계속하시겠습니까?`
        : `'${memberName}' 님을 가족 목록에서 내보내시겠습니까? (해당 회원의 개인 계정 및 복약 정보는 유지됩니다.)`,
      confirmLabel: '삭제',
      cancelLabel: '취소',
      tone: 'danger',
      onConfirm: async () => {
        try {
          const response = await fetch(`/api/family/members/${member.userId}/remove?userId=${currentUserId || ''}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ userId: currentUserId }),
          });

          const data = await response.json();

          if (response.ok && data.success) {
            showAlert(`${memberName} 님이 삭제되었습니다.`, '삭제 완료');
            if (String(selectedMemberId) === String(member.userId)) {
              setSelectedMemberId('all');
            }
            await fetchFamilyMembers();
            fetchMonthSummary();
            fetchDailySchedules(selectedDate);
          } else {
            showAlert(data.message || '가족 삭제 처리에 실패했습니다.', '오류');
          }
        } catch (err) {
          console.error('가족 삭제 실패:', err);
          showAlert('삭제 처리 중 오류가 발생했습니다.', '오류');
        }
      },
    });
  };

  // 도착한 초대 수락/거절 핸들러 (가족이 없을 때 바로 수락 가능)
  const handleRespondInvitation = async (inviteId, action) => {
    if (!currentUserId) return;
    try {
      const res = await fetch('/api/family/invitations/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          inviteId,
          userId: currentUserId,
          action,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        if (action === 'ACCEPT') {
          showAlert('가족 연동 초대를 수락했습니다!', '초대 수락');
          if (props.onUserUpdated) {
            props.onUserUpdated({ role: 'PROT' });
          }
          await fetchFamilyMembers();
          fetchMonthSummary();
          fetchDailySchedules(selectedDate);
        } else {
          showAlert('가족 초대를 거절했습니다.', '초대 거절');
          fetchPendingInvitations();
        }
      } else {
        showAlert(data.message || '초대 처리에 실패했습니다.', '오류');
      }
    } catch (err) {
      console.error('초대 응답 오류:', err);
      showAlert('서버 통신 중 오류가 발생했습니다.', '오류');
    }
  };

  // 가족 나가기 / 가족 그룹 해체 핸들러
  const handleLeaveFamily = () => {
    if (!currentUserId) {
      showAlert('로그인이 필요합니다.', '안내');
      return;
    }

    const myMemberInfo = familyMembers.find((m) => Number(m.userId) === Number(currentUserId));
    const isUserRoleManager = myMemberInfo?.role === 'GUAR' || myMemberInfo?.role === '보호자' || myMemberInfo?.role === 'USER' || familyMembers.every((m) => m.role !== 'GUAR');
    const remainingRealMembers = familyMembers.filter((m) => m.isVirtual !== 'Y' && Number(m.userId) !== Number(currentUserId));
    const isOnlyRealUser = remainingRealMembers.length === 0;

    let confirmTitle;
    let confirmDesc;
    let btnLabel;
    let forceDissolve = false;

    if (isOnlyRealUser) {
      confirmTitle = '가족 그룹 해체';
      confirmDesc = '가족 그룹을 해체하시겠습니까? 등록된 가상 프로필과 가족 그룹이 삭제되며, 이후 다른 가족의 연동 초대를 받을 수 있게 됩니다.';
      btnLabel = '그룹 해체';
      forceDissolve = true;
    } else if (isUserRoleManager) {
      confirmTitle = '가족 그룹 해체';
      confirmDesc = '보호자가 나가면 가족 그룹 전체가 해체되며 다른 구성원들의 가족 연동도 함께 해제됩니다. 정말 해체하시겠습니까?';
      btnLabel = '가족 해체';
      forceDissolve = true;
    } else {
      confirmTitle = '가족 나가기';
      confirmDesc = '가족 그룹에서 나가시겠습니까? 본인만 가족 목록에서 제외되며, 개인 복약 정보와 계정은 그대로 유지됩니다.';
      btnLabel = '가족 나가기';
      forceDissolve = false;
    }

    showConfirm({
      title: confirmTitle,
      description: confirmDesc,
      confirmLabel: btnLabel,
      cancelLabel: '취소',
      tone: 'danger',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/family/leave?userId=${currentUserId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              userId: currentUserId,
              forceDissolve,
            }),
          });
          const data = await res.json();
          if (res.ok && data.success) {
            showAlert(data.message || '가족 그룹에서 정상적으로 나갔습니다.', '완료');
            if (props.onUserUpdated) {
              props.onUserUpdated({
                familyId: null,
                role: 'PROT',
              });
            }
            setFamilyName('');
            setFamilyMembers([]);
            setSelectedMemberId('all');
            await fetchFamilyMembers();
            fetchMonthSummary();
            fetchDailySchedules(selectedDate);
          } else {
            showAlert(data.message || '가족 나가기 처리에 실패했습니다.', '오류');
          }
        } catch (err) {
          console.error('가족 나가기 오류:', err);
          showAlert('서버 통신 중 오류가 발생했습니다.', '오류');
        }
      },
    });
  };


  // 3. 캘린더 그리드 계산
  const firstDayIndex = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();

  const days = [];
  for (let i = 0; i < firstDayIndex; i++) days.push(null);
  for (let d = 1; d <= lastDate; d++) days.push(d);
  const remainingCells = 7 - (days.length % 7);
  if (remainingCells < 7) {
    for (let i = 0; i < remainingCells; i++) days.push(null);
  }

  const changeMonth = (offset) => {
    setCurrentDate(new Date(year, month + offset, 1));
  };

  const handleGoToday = () => {
    const now = new Date();
    setCurrentDate(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDate(getFormattedDate(now));
  };

  // 월 선택 팝오버 외부 클릭 닫기
  useEffect(() => {
    if (!isMonthPickerOpen) return;
    const handleOutside = (e) => {
      if (monthPickerRef.current && !monthPickerRef.current.contains(e.target)) {
        closeMonthPicker();
      }
    };
    const handleEsc = (e) => {
      if (e.key === 'Escape') closeMonthPicker();
    };
    document.addEventListener('pointerdown', handleOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('pointerdown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isMonthPickerOpen, closeMonthPicker]);

  // 연도 드롭다운 외부 클릭 닫기
  useEffect(() => {
    if (!isYearDropdownOpen) return;
    const handleOutsideYear = (e) => {
      if (yearDropdownRef.current && !yearDropdownRef.current.contains(e.target)) {
        setIsYearDropdownOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleOutsideYear);
    return () => {
      document.removeEventListener('pointerdown', handleOutsideYear);
    };
  }, [isYearDropdownOpen]);

  // 연도 드롭다운 열릴 때 현재 연도로 자동 스크롤
  useEffect(() => {
    if (isYearDropdownOpen && yearDropdownRef.current) {
      const selectedItem = yearDropdownRef.current.querySelector('.custom-year-item.selected');
      if (selectedItem) {
        selectedItem.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [isYearDropdownOpen]);

  // 4. 체크리스트 시간대별 카운트 및 필터링
  const totalCount = schedules.length;
  const totalTakenCount = schedules.filter((s) => s.takenAt).length;

  const morningList = schedules.filter((s) => getSlotFromTime(s.time).slot === 'morning');
  const morningTaken = morningList.filter((s) => s.takenAt).length;

  const lunchList = schedules.filter((s) => getSlotFromTime(s.time).slot === 'lunch');
  const lunchTaken = lunchList.filter((s) => s.takenAt).length;

  const eveningList = schedules.filter((s) => getSlotFromTime(s.time).slot === 'evening');
  const eveningTaken = eveningList.filter((s) => s.takenAt).length;

  const filteredSchedules = schedules.filter((item) => {
    if (timeFilter === 'all') return true;
    return getSlotFromTime(item.time).slot === timeFilter;
  });

  const categoryMap = {
    prescription: { label: '처방약', className: 'prescription', dotClass: 'dot-prescription' },
    regular: { label: '상시약', className: 'regular', dotClass: 'dot-regular' },
    supplement: { label: '영양제', className: 'supplement', dotClass: 'dot-supplement' },
  };

  // 알람 설정 모달 상태 (두 번째 변수 기준)
  const [alarmModalOpen, setAlarmModalOpen] = useState(false);
  const [targetScheduleForAlarm, setTargetScheduleForAlarm] = useState(null);
  const [alarmEnabled, setAlarmEnabled] = useState(true);

  // 휠 피커 내부 제어 상태
  const [hour, setHour] = useState('08');
  const [minute, setMinute] = useState('00');

  // 시/분은 각각 00~23, 00~59 안에서 순환합니다.
  const stepHour = (val, delta) => {
    const n = ((Number(normalizeTimePart(val, 23)) + delta) % 24 + 24) % 24;
    return String(n).padStart(2, '0');
  };

  const stepMinute = (val, delta) => {
    const n = ((Number(normalizeTimePart(val, 59)) + delta) % 60 + 60) % 60;
    return String(n).padStart(2, '0');
  };

  const stepPicker = (type, delta) => {
    if (type === 'hour') {
      setHour((prev) => stepHour(prev, delta));
    } else if (type === 'minute') {
      setMinute((prev) => stepMinute(prev, delta));
    }
  };

  const handleWheel = (e, type) => {
    if (e.deltaY === 0) return;
    stepPicker(type, e.deltaY < 0 ? 1 : -1);
  };

  const handleTimeKeyDown = (e, type) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    stepPicker(type, e.key === 'ArrowUp' ? 1 : -1);
  };

  // 1) 알람 모달 열기
  const handleOpenAlarmModal = (item, e) => {
    if (e) e.stopPropagation();
    setTargetScheduleForAlarm(item);

    // 저장된 24시간 값을 그대로 표시합니다.
    const timeStr = formatTime24(item.time || item.intakeTime || '08:00');
    const [hStr, mStr] = timeStr.split(':');
    setHour(normalizeTimePart(hStr, 23, 8));
    setMinute(normalizeTimePart(mStr, 59));
    setAlarmEnabled(item.alarmEnabled ?? true);
    setAlarmModalOpen(true);
  };

  // 2) 알람 일괄 저장 API 호출
  const handleSaveAlarm = async () => {
    if (!targetScheduleForAlarm) return;

    const calculatedTime = `${normalizeTimePart(hour, 23)}:${normalizeTimePart(minute, 59)}`;

    try {
      const res = await fetch(
        `/api/calendar/${targetScheduleForAlarm.scheduleId}/alarm?newTime=${encodeURIComponent(calculatedTime)}&alarmEnabled=${alarmEnabled}&date=${encodeURIComponent(selectedDate)}`,
        { method: 'POST' }
      );

      if (res.ok) {
        showAlert('알람 설정이 변경되었습니다.', '알람 설정');
        setAlarmModalOpen(false);
        setTargetScheduleForAlarm(null);

        // 가족 페이지 선택 구성원 상태 유지하며 일정 재조회
        if (typeof fetchDailySchedules === 'function') {
          fetchDailySchedules(selectedDate, selectedMemberId);
        }
      } else {
        const errText = await res.text();
        console.error('알람 설정 실패:', res.status, errText);
        showAlert('알람 설정 변경에 실패했습니다.', '오류');
      }
    } catch (err) {
      console.error('알람 변경 오류:', err);
      showAlert('알람 변경 중 오류가 발생했습니다.', '오류');
    }
  };

  // 복약 일정 삭제 처리
  const openDeleteModal = (item, e) => {
    e.stopPropagation();
    if (!currentUserId) {
      showAlert('로그인 후 일정을 삭제할 수 있습니다.', '안내');
      return;
    }
    setItemToDelete(item);
    setIsDeleteModalOpen(true);
  };

  // 삭제 확정 (deleteAll: true면 이 약의 전체 스케줄 및 원천 데이터 삭제, false면 당일 일정만 삭제)
  const confirmDeleteSchedule = async (deleteAll = false) => {
    if (!itemToDelete) return;
    try {
      const response = await fetch(
        `/api/calendar/${itemToDelete.scheduleId}/delete?deleteAll=${deleteAll}&userId=${currentUserId}&date=${encodeURIComponent(selectedDate)}`,
        {
          method: 'POST',
        }
      );
      if (response.ok) {
        if (deleteAll) {
          setSchedules((prev) =>
            prev.filter((s) => {
              if (itemToDelete.prescriptionId && s.prescriptionId === itemToDelete.prescriptionId) return false;
              if (itemToDelete.cabinetId && s.cabinetId === itemToDelete.cabinetId) return false;
              if (itemToDelete.routineId && s.routineId === itemToDelete.routineId) return false;
              if (s.name === itemToDelete.name) return false;
              return s.scheduleId !== itemToDelete.scheduleId;
            })
          );
        } else {
          setSchedules((prev) => prev.filter((s) => s.scheduleId !== itemToDelete.scheduleId));
        }

        await fetchDailySchedules(selectedDate, true);
        await fetchMonthSummary();

        // 사이드바 및 메인 홈 등 전역 UI에 복약 진척도 즉시 갱신 알림
        window.dispatchEvent(new CustomEvent('jette-intake-updated', {
          detail: { userId: currentUserId, date: selectedDate }
        }));
      } else {
        showAlert('삭제에 실패했습니다.', '오류');
      }
    } catch (err) {
      console.error("삭제 통신 실패:", err);
      showAlert('삭제 통신 중 오류가 발생했습니다.', '오류');
    } finally {
      setIsDeleteModalOpen(false);
      setItemToDelete(null);
    }
  };

  const myInfo = useMemo(() => {
    return familyMembers.find((m) => Number(m.userId) === Number(currentUserId));
  }, [familyMembers, currentUserId]);

  const isManager = useMemo(() => {
    if (!myInfo) return true;
    return myInfo.role === 'GUAR' || myInfo.role === '보호자' || myInfo.role === 'USER' || familyMembers.every((m) => m.role !== 'GUAR');
  }, [myInfo, familyMembers]);

  const otherRealMembers = useMemo(() => {
    return familyMembers.filter((m) => m.isVirtual !== 'Y' && Number(m.userId) !== Number(currentUserId));
  }, [familyMembers, currentUserId]);

  const isSoleRealMember = otherRealMembers.length === 0;

  return (
    <div className="family-page-wrapper">
      {/* 1. 상단 타이틀 & 필터 칩 */}
      <div className="family-header">
        <span className="family-subtitle">FAMILY MEDICATION</span>
        <div className="family-title-wrap">
          <h1 className="family-title">가족 페이지</h1>
          {familyName && (
            <button
              type="button"
              className="family-name-badge"
              onClick={() => {
                setEditFamilyName(familyName);
                setIsRenameModalOpen(true);
              }}
              title="가족 이름 변경"
            >
              <span className="family-name-text">{familyName}</span>
              <svg
                className="family-name-edit-icon"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </button>
          )}
        </div>

        <div className="family-controls">
          <div className="family-chips-group">
            <button
              type="button"
              className={`family-chip ${selectedMemberId === 'all' ? 'selected' : ''}`}
              onClick={() => setSelectedMemberId('all')}
            >
              전체
            </button>
            {familyMembers.length === 0 ? (
              <span className="family-chips-empty-hint">
                가족 그룹을 생성하면 본인 및 구성원이 여기에 표시됩니다.
              </span>
            ) : (
              familyMembers.map((member) => {
                // 현재 로그인한 본인 계정인지 확인
                const isMe = Number(member.userId) === Number(currentUserId);
                const canDelete = !isMe && (isManager || member.isVirtual === 'Y');

                return (
                  <div
                    key={member.userId}
                    style={{ display: 'inline-flex', alignItems: 'center', position: 'relative' }}
                  >
                    <button
                      type="button"
                      className={`family-chip ${String(selectedMemberId) === String(member.userId) ? 'selected' : ''}`}
                      onClick={() => setSelectedMemberId(member.userId)}
                    >
                      {member.name}
                      {/* 본인일 때만 (본인) 표시, 추가한 가족은 호칭 없이 이름만 표시 */}
                      {isMe && (
                        <span style={{ fontSize: '0.85em', marginLeft: '4px', opacity: 0.85 }}>
                          (본인)
                        </span>
                      )}
                    </button>

                    {/* 초대한 보호자 또는 가상 계정 등 타인 구성원 옆에 삭제(×) 버튼 노출 */}
                    {canDelete && (
                      <button
                        type="button"
                        className="btn-family-member-delete"
                        title="가족 구성원 삭제"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveMember(member);
                        }}
                        style={{
                          marginLeft: '-8px',
                          marginRight: '6px',
                          border: 'none',
                          borderRadius: '50%',
                          width: '18px',
                          height: '18px',
                          background: '#fee2e2',
                          color: '#ef4444',
                          fontSize: '12px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 'bold',
                          zIndex: 2
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="family-action-buttons">
            {familyMembers.length === 0 ? (
              <button
                type="button"
                className="family-btn-primary"
                onClick={() => {
                  setNewFamilyName(user?.name ? `${user.name} 가족` : '우리 가족');
                  setIsCreateFamilyModalOpen(true);
                }}
              >
                가족 만들기
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="family-btn-outline"
                  onClick={() => setIsAddFamilyModalOpen(true)}
                >
                  가족등록
                </button>
                <button
                  type="button"
                  className="family-btn-med"
                  onClick={() => {
                    const targetId = selectedMemberId === 'all'
                      ? (familyMembers[0]?.userId || currentUserId)
                      : selectedMemberId;
                    navigate(`/medication/register?userId=${targetId}`);
                  }}
                  title="선택된 구성원의 복용 약(처방전, 상비약, 영양제) 등록"
                >
                  + 약 등록
                </button>
                <button
                  type="button"
                  className="family-btn-primary"
                  onClick={handleOpenReportModal}
                >
                  보고서
                </button>
                <button
                  type="button"
                  className="family-btn-leave"
                  onClick={handleLeaveFamily}
                  title={isSoleRealMember || isManager ? '가족 그룹 해체' : '가족 나가기'}
                >
                  {isSoleRealMember ? '가족 그룹 해체' : isManager ? '가족 해체' : '가족 나가기'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 도착한 가족 연동 초대 배너 (소속된 가족이 없을 때 표시) */}
      {familyMembers.length === 0 && pendingInvitations.length > 0 && (
        <div className="family-invite-banner">
          <div className="family-invite-banner-header">
            <span className="family-invite-banner-badge">초대 도착</span>
            <span className="family-invite-banner-title">도착한 가족 연동 초대가 있습니다</span>
          </div>
          <div className="family-invite-list">
            {pendingInvitations.map((inv) => (
              <div key={inv.inviteId} className="family-invite-item">
                <div className="family-invite-item-info">
                  <span className="family-invite-sender"><strong>{inv.senderName}</strong> 님</span>께서{' '}
                  <span className="family-invite-target"><strong>[{inv.familyName}]</strong></span> 그룹으로 초대했습니다.
                  {inv.createdAt && <span className="family-invite-date">{inv.createdAt}</span>}
                </div>
                <div className="family-invite-item-actions">
                  <button
                    type="button"
                    className="family-invite-btn-accept"
                    onClick={() => handleRespondInvitation(inv.inviteId, 'ACCEPT')}
                  >
                    수락
                  </button>
                  <button
                    type="button"
                    className="family-invite-btn-reject"
                    onClick={() => handleRespondInvitation(inv.inviteId, 'REJECT')}
                  >
                    거절
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. 상단 캘린더 */}
      <div className="family-card">
        <div className="calendar-nav">
          <div className="month-controls" ref={monthPickerRef}>
            <button
              type="button"
              className="cal-nav-arrow-btn"
              onClick={() => changeMonth(-1)}
              title="이전 달로 이동"
              aria-label="이전 달"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>

            <div className="month-picker-anchor">
              <button
                type="button"
                className={`month-picker-trigger-btn ${isMonthPickerOpen ? 'active' : ''}`}
                onClick={() => { setIsMonthPickerOpen((prev) => !prev); setIsYearDropdownOpen(false); }}
                title="클릭하여 연도 및 월 선택"
              >
                <span className="picker-title-text">{year}년 {month + 1}월</span>
                <svg
                  className={`picker-chevron-svg ${isMonthPickerOpen ? 'open' : ''}`}
                  width="14"
                  height="14"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.51a.75.75 0 01-1.08 0l-4.25-4.51a.75.75 0 01.02-1.06z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>

              {isMonthPickerOpen && (
                <div className="month-picker-popover" onClick={(e) => e.stopPropagation()}>
                  {/* 연도 이동 행 */}
                  <div className="popover-year-row">
                    <button
                      type="button"
                      className="popover-arrow-btn"
                      onClick={() => handleJumpYear(-1)}
                      title="이전 연도"
                      aria-label="이전 연도"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 18 9 12 15 6" />
                      </svg>
                    </button>

                    <div className="custom-year-dropdown-wrap" ref={yearDropdownRef}>
                      <button
                        type="button"
                        className={`custom-year-btn ${isYearDropdownOpen ? 'active' : ''}`}
                        onClick={() => setIsYearDropdownOpen((prev) => !prev)}
                        title="연도 목록 보기"
                      >
                        <span className="year-btn-text">{year}년</span>
                        <svg
                          className={`year-chevron-svg ${isYearDropdownOpen ? 'open' : ''}`}
                          width="12"
                          height="12"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.51a.75.75 0 01-1.08 0l-4.25-4.51a.75.75 0 01.02-1.06z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </button>

                      {isYearDropdownOpen && (
                        <div className="custom-year-dropdown-menu">
                          {calYearOptions.map((y) => (
                            <button
                              key={y}
                              type="button"
                              className={`custom-year-item ${y === year ? 'selected' : ''}`}
                              onClick={() => {
                                setCurrentDate(new Date(y, month, 1));
                                setIsYearDropdownOpen(false);
                              }}
                            >
                              <span>{y}년</span>
                              {y === year && (
                                <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      className="popover-arrow-btn"
                      onClick={() => handleJumpYear(1)}
                      title="다음 연도"
                      aria-label="다음 연도"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                  </div>

                  {/* 12개월 그리드 */}
                  <div className="popover-months-grid">
                    {Array.from({ length: 12 }, (_, i) => {
                      const isCurrentMonth = i === month;
                      const isThisMonth = i === today.getMonth() && year === today.getFullYear();
                      return (
                        <button
                          key={i}
                          type="button"
                          className={`popover-month-btn ${isCurrentMonth ? 'selected' : ''} ${isThisMonth ? 'is-today' : ''}`}
                          onClick={() => {
                            setCurrentDate(new Date(year, i, 1));
                            closeMonthPicker();
                          }}
                        >
                          {i + 1}월
                        </button>
                      );
                    })}
                  </div>

                  {/* 하단 오늘 바로가기 */}
                  <div className="popover-footer">
                    <button
                      type="button"
                      className="popover-today-btn"
                      onClick={() => {
                        handleGoToday();
                        closeMonthPicker();
                      }}
                    >
                      이번 달로 이동
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              className="cal-nav-arrow-btn"
              onClick={() => changeMonth(1)}
              title="다음 달로 이동"
              aria-label="다음 달"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>

          <button type="button" className="btn-today" onClick={handleGoToday}>
            Today
          </button>
        </div>

        <div className="calendar-weekdays">
          {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>

        <div className="calendar-grid">
          {days.map((day, idx) => {
            if (day === null) return <div key={`empty-${idx}`} className="calendar-day-cell empty" />;

            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isSelected = selectedDate === dateStr;
            const dayStatus = monthSummary[dateStr];

            return (
              <div
                key={dateStr}
                className={`calendar-day-cell ${isSelected ? 'selected' : ''}`}
                onClick={() => setSelectedDate(dateStr)}
              >
                <span className="day-num">{day}</span>

                <div className="cell-indicators">
                  {dayStatus?.hasPrescription && (
                    <div className="indicator-bar prescription" title="처방약 복용 기간" />
                  )}
                  <div className="indicator-dots">
                    {dayStatus?.hasRegular && <div className="indicator-dot regular" title="상시약" />}
                    {dayStatus?.hasSupplement && <div className="indicator-dot supplement" title="영양제" />}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="calendar-legend">
          <div className="legend-item">
            <span className="legend-bar prescription"></span>
            <span>처방약</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot regular"></span>
            <span>상시약</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot supplement"></span>
            <span>영양제</span>
          </div>
        </div>
      </div>

      {/* 3. 하단 체크리스트 */}
      <div className="family-card checklist-card-section">
        <span className="chk-top-subtitle">SELECTED DATE</span>
        <h2 className="chk-top-title">
          {Number(selectedDate.split('-')[1])}월 {Number(selectedDate.split('-')[2])}일
        </h2>

        {/* 필터 탭 */}
        <div className="chk-filter-bar">
          <button
            type="button"
            className={`chk-tab-btn ${timeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setTimeFilter('all')}
          >
            전체 <span className="chk-count-badge">{totalTakenCount}/{totalCount}</span>
          </button>
          <button
            type="button"
            className={`chk-tab-btn ${timeFilter === 'morning' ? 'active' : ''}`}
            onClick={() => setTimeFilter('morning')}
          >
            아침 <span className="chk-count-badge">{morningTaken}/{morningList.length}</span>
          </button>
          {lunchList.length > 0 && (
            <button
              type="button"
              className={`chk-tab-btn ${timeFilter === 'lunch' ? 'active' : ''}`}
              onClick={() => setTimeFilter('lunch')}
            >
              점심 <span className="chk-count-badge">{lunchTaken}/{lunchList.length}</span>
            </button>
          )}
          <button
            type="button"
            className={`chk-tab-btn ${timeFilter === 'evening' ? 'active' : ''}`}
            onClick={() => setTimeFilter('evening')}
          >
            저녁 <span className="chk-count-badge">{eveningTaken}/{eveningList.length}</span>
          </button>
        </div>

        {/* 체크리스트 목록 */}
        <div className="chk-items-container">
          {loading ? (
            <div className="chk-empty-message">일정을 불러오는 중입니다...</div>
          ) : filteredSchedules.length === 0 ? (
            <div className="chk-empty-message">
              <p style={{ margin: '0 0 8px 0' }}>해당 시간대에 등록된 복약 일정이 없습니다.</p>
              {selectedMemberId !== 'all' && (
                <button
                  type="button"
                  className="family-chk-add-med-btn"
                  onClick={() => navigate(`/medication/register?userId=${selectedMemberId}`)}
                >
                  + {familyMembers.find((m) => String(m.userId) === String(selectedMemberId))?.name || '구성원'} 복용 약 등록하기
                </button>
              )}
            </div>
          ) : (
            filteredSchedules.map((item) => {
              const isTaken = Boolean(item.takenAt);
              const catInfo = categoryMap[item.type] || categoryMap.regular;
              const slotInfo = getSlotFromTime(item.time);

              return (
                <div key={item.scheduleId} className={`chk-list-row ${isTaken ? 'is-taken' : ''}`}>
                  <label className="chk-checkbox-label">
                    <input
                      type="checkbox"
                      checked={isTaken}
                      onChange={() => toggleTaken(item)}
                      className="chk-native-input"
                    />
                    <span className="chk-custom-box">
                      {isTaken && (
                        <svg viewBox="0 0 24 24" className="chk-check-icon">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </span>
                  </label>

                  <div className="chk-main-content">
                    {/* 상단: 점 + 시간대 + 시간 + 실제 복용자 이름/역할 */}
                      <div className="chk-meta-line">
                        <span className={`chk-bullet-dot ${catInfo.dotClass}`} />
                        <span className="chk-slot-text">{slotInfo.slotLabel}</span>
                        <span className="chk-time-text">{formatTime24(item.time)}</span>
                        
                        {/* 전체 탭일 때: 본인만 (본인) 붙이고 가족은 이름만 깔끔하게 표시 */}
                        {selectedMemberId === 'all' && (
                          <span className="chk-user-tag">
                            {(item.userName && item.userName !== '가족') 
                              ? item.userName 
                              : (familyMembers?.find(m => Number(m.userId) === Number(item.userId))?.name || '본인')}
                            {Number(item.userId) === Number(currentUserId) ? ' (본인)' : ''}
                          </span>
                        )}
                      </div>

                    {/* 하단: 약 이름 + 처방약/영양제 라벨 (기존 코드 그대로 유지) */}
                    <div className="chk-med-line">
                      <span className={`chk-med-name ${isTaken ? 'line-through' : ''}`}>
                        {item.name || item.medicationName}
                      </span>
                      <span className={`chk-cat-label ${catInfo.className}`}>
                        {catInfo.label}
                      </span>
                    </div>
                  </div>

                  {/* 액션 버튼: 알림 설정 & 일정 삭제 */}
                  <div className="chk-actions-group">
                    {/* 1. 알람 휠 모달 열기 */}
                    <button 
                      type="button" 
                      className="chk-icon-btn" 
                      title="알림 설정"
                      onClick={(e) => handleOpenAlarmModal(item, e)}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                      </svg>
                    </button>

                    {/* 2. 캘린더 스타일 삭제 모달 열기 */}
                    <button
                      type="button"
                      className="btn-delete-schedule"
                      onClick={(e) => openDeleteModal(item, e)}
                      title="일정 삭제"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 4. 보고서 모달 (처방약 / 상시약 / 영양제 3단 완전 분리 표기) */}
      {isReportOpen && (
        <div className="modal-overlay" onClick={() => setIsReportOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">병원 제출용 복약 브리핑</h3>
              <button type="button" className="modal-close-btn" onClick={() => setIsReportOpen(false)}>✕</button>
            </div>

            {isReportLoading ? (
              <div style={{ padding: '32px 0', textAlign: 'center', color: '#7a7066', fontSize: '13.5px' }}>
                복약 브리핑 데이터를 정리하는 중입니다...
              </div>
            ) : (
              <div className="report-scroll-body">
                {reportError && <p className="report-empty-text" role="alert">{reportError}</p>}
                <div className="report-header-info">
                  <div className="report-patient-name">
                    {reportData?.targetName || '본인'}
                  </div>
                  <div className="report-date-text">
                    {selectedDate.split('-')[0]}년 {Number(selectedDate.split('-')[1])}월 {Number(selectedDate.split('-')[2])}일 기준
                  </div>
                </div>

                {/* ============================================================== */}
                {/* [섹션 1] 현재 복용 처방약 */}
                {/* ============================================================== */}
                <div className="report-group-header prescription">
                  <span className="report-group-dot dot-prescription" />
                  <span className="report-group-title">1. 현재 복용 처방약</span>
                  <span className="report-group-count">{reportData?.prescriptions?.length || 0}건</span>
                </div>

                {reportData?.prescriptions && reportData.prescriptions.length > 0 ? (
                  reportData.prescriptions.map((p, idx) => (
                    <div key={idx} className="report-prescription-card">
                      <div className="report-card-top">
                        <div>
                          <strong className="report-med-title">{p.name}</strong>
                          <span style={{ display: 'block', fontSize: '11px', color: '#8c827a', marginTop: '2px' }}>
                            {p.hospital}
                          </span>
                        </div>
                        <span className="report-day-badge">
                          {p.elapsedDays == null ? '시작일 정보 없음' : p.elapsedDays + '일차'} <span className="report-total-days">/ {p.totalDays == null ? '투약일수 정보 없음' : '총 ' + p.totalDays + '일분'}</span>
                        </span>
                      </div>

                      <div className="report-period-box">
                        <span style={{ fontSize: '12px', color: '#4a413a' }}>
                          <strong>조제/복용 기간:</strong> {p.startDate || '정보 없음'} ~ {p.endDate || '정보 없음'}
                        </span>
                      </div>

                      <div className="report-dose-chips">
                        {p.todayDoses?.map((d, dIdx) => (
                          <span
                            key={dIdx}
                            className={`report-dose-chip ${d.taken ? 'done' : 'undone'}`}
                          >
                            {d.slot}({formatTime24(d.time)}): {d.taken ? '✓ 복용완료' : '미복용'}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="report-empty-notice">해당 날짜에 복용 중인 처방약이 없습니다.</p>
                )}

                {/* ============================================================== */}
                {/* [섹션 2] 상시약 (정기 복용약) */}
                {/* ============================================================== */}
                <div className="report-group-header regular">
                  <span className="report-group-dot dot-regular" />
                  <span className="report-group-title">2. 상시 복용약</span>
                  <span className="report-group-count">{reportData?.regulars?.length || 0}건</span>
                </div>

                {reportData?.regulars && reportData.regulars.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                    {reportData.regulars.map((r, idx) => (
                      <div key={idx} className="report-sub-item-card regular">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <strong style={{ fontSize: '14px', color: '#2b2523' }}>{r.name}</strong>
                        </div>
                        <p style={{ margin: '3px 0 6px', fontSize: '11.5px', color: '#7a7066' }}>{r.memo}</p>
                        <div className="report-dose-chips">
                          {r.todayDoses?.map((d, dIdx) => (
                            <span
                              key={dIdx}
                              className={`report-dose-chip ${d.taken ? 'done' : 'undone'}`}
                            >
                              {d.slot}({formatTime24(d.time)}): {d.taken ? '✓ 복용완료' : '미복용'}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="report-empty-notice">등록된 상시약이 없습니다.</p>
                )}

                {/* ============================================================== */}
                {/* [섹션 3] 영양제 (건강기능식품) */}
                {/* ============================================================== */}
                <div className="report-group-header supplement">
                  <span className="report-group-dot dot-supplement" />
                  <span className="report-group-title">3. 영양제 및 건강기능식품</span>
                  <span className="report-group-count">{reportData?.supplements?.length || 0}건</span>
                </div>

                {reportData?.supplements && reportData.supplements.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {reportData.supplements.map((s, idx) => (
                      <div key={idx} className="report-sub-item-card supplement">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <strong style={{ fontSize: '14px', color: '#2b2523' }}>{s.name}</strong>
                        </div>
                        <p style={{ margin: '3px 0 6px', fontSize: '11.5px', color: '#7a7066' }}>{s.memo}</p>
                        <div className="report-dose-chips">
                          {s.todayDoses?.map((d, dIdx) => (
                            <span
                              key={dIdx}
                              className={`report-dose-chip ${d.taken ? 'done' : 'undone'}`}
                            >
                              {d.slot}({formatTime24(d.time)}): {d.taken ? '✓ 복용완료' : '미복용'}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="report-empty-notice">등록된 영양제가 없습니다.</p>
                )}
              </div>
            )}

            <div className="modal-footer-actions">
              <button type="button" className="family-btn-outline" onClick={() => window.print()}>
                인쇄 / PDF 저장
              </button>
              <button type="button" className="family-btn-primary" onClick={() => setIsReportOpen(false)}>
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. 가족 등록 모달 */}

      
      {isAddFamilyModalOpen && (
        <div className="modal-overlay" onClick={() => setIsAddFamilyModalOpen(false)}>
          <div className="modal-content family-add-modal" onClick={(e) => e.stopPropagation()}>
            {/* 상단 헤더: 깔끔한 원형 SVG 닫기 버튼 적용 */}
            <div className="modal-header">
              <h3 className="modal-title">가족 구성원 추가</h3>
              <button 
                type="button" 
                className="modal-close-btn" 
                onClick={() => setIsAddFamilyModalOpen(false)}
                aria-label="닫기"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            {/* 2-Track 탭 전환 (영유아 직접등록 vs 회원 연동) */}
            <div className="family-add-tabs">
              <button
                type="button"
                className={`family-add-tab ${familyAddTab === 'direct' ? 'active' : ''}`}
                onClick={() => setFamilyAddTab('direct')}
              >
                직접 등록 (영유아·피보호자)
              </button>
              <button
                type="button"
                className={`family-add-tab ${familyAddTab === 'invite' ? 'active' : ''}`}
                onClick={() => setFamilyAddTab('invite')}
              >
                회원 연동 (배우자·성인)
              </button>
            </div>

            {/* [Track 1] 1~2세 영유아 / 가입 불가능한 피보호자 직접 등록 */}
            {familyAddTab === 'direct' ? (
              <form onSubmit={handleAddFamilyMember}>
                <div className="family-add-notice">
                  스마트폰이 없거나 가입이 불가능한 영유아·자녀는 보호자가 직접 프로필을 생성하여 대리 관리합니다.
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div>
                    <label className="family-form-label">
                      이름 <span style={{ color: '#c94040' }}>*</span>
                    </label>
                    <input
                      type="text"
                      className="family-form-input"
                      placeholder="예: 김민우"
                      value={newMemberName}
                      onChange={(e) => setNewMemberName(e.target.value)}
                      autoFocus
                      required
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label className="family-form-label">관계 구분</label>
                      <select
                        className="family-form-select"
                        value={newMemberRole}
                        onChange={(e) => setNewMemberRole(e.target.value)}
                      >
                        <option value="PROT">피보호자</option>
                        <option value="GUAR">보호자</option>
                      </select>
                    </div>

                    <div>
                      <label className="family-form-label">성별</label>
                      <div style={{ display: 'flex', gap: '14px', alignItems: 'center', height: '38px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="memberSex"
                            value="M"
                            checked={newMemberSex === 'M'}
                            onChange={() => setNewMemberSex('M')}
                          />
                          남성
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="memberSex"
                            value="F"
                            checked={newMemberSex === 'F'}
                            onChange={() => setNewMemberSex('F')}
                          />
                          여성
                        </label>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="family-form-label">생년월일 (선택)</label>
                    <DatePicker
                      value={newMemberBirth}
                      onChange={(e) => setNewMemberBirth(e.target.value)}
                      placeholder="생년월일 선택"
                      max={getFormattedDate(today)}
                      title="생년월일 선택"
                    />
                  </div>
                </div>

                <div className="modal-footer-actions">
                  <button type="button" className="family-btn-outline" onClick={() => setIsAddFamilyModalOpen(false)}>
                    취소
                  </button>
                  <button type="submit" className="family-btn-primary">
                    프로필 생성
                  </button>
                </div>
              </form>
            ) : (
              /* [Track 2] 기존 가입 회원 연동 */
              <form onSubmit={handleInviteFamilyMember}>
                <div className="family-add-notice">
                  이미 제떼약에 가입된 가족의 아이디로 연동 초대를 보냅니다. (단, 이미 가족 그룹에 소속되어 있는 회원은 초대할 수 없습니다.)
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', margin: '18px 0' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label className="family-form-label">
                      가족 로그인 아이디 <span style={{ color: '#c94040' }}>*</span>
                    </label>
                    <input
                      type="text"
                      className="family-form-input"
                      placeholder="예: spouse_id123"
                      value={inviteLoginId}
                      onChange={(e) => setInviteLoginId(e.target.value)}
                      autoFocus
                      required
                    />
                  </div>
                  

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label className="family-form-label">
                      관계 구분 <span style={{ color: '#c94040' }}>*</span>
                    </label>
                    <select 
                      className="family-form-input"
                      value={inviteRole} 
                      onChange={(e) => setInviteRole(e.target.value)}
                      style={{ cursor: 'pointer' }}
                    >
                      <option value="BABY">자녀</option>
                      <option value="PARENT">부모님</option>
                      <option value="SPOUSE">배우자</option>
                    </select>
                  </div>
                </div>

                <div className="modal-footer-actions">
                  <button type="button" className="family-btn-outline" onClick={() => setIsAddFamilyModalOpen(false)}>
                    취소
                  </button>
                  <button type="submit" className="family-btn-primary">
                    연동 요청 보내기
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* 모달: 알람 시간 설정 */}
      {alarmModalOpen && ( /* 1. isAlarmModalOpen -> alarmModalOpen */
        <div className="modal-overlay" onClick={() => setAlarmModalOpen(false)}>
          <div className="alarm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h4>복약 알림 시간 설정</h4>
              {/* 2. 닫기 버튼 수정 */}
              <button type="button" className="btn-close" onClick={() => setAlarmModalOpen(false)}>✕</button>
            </div>

            <div className="wheel-picker-box" ref={preventPickerScroll}>
              <div className="picker-column" onWheel={(e) => handleWheel(e, 'hour')}>
                <button type="button" aria-label="시 늘리기" onClick={() => stepPicker('hour', 1)}>▲</button>
                <input
                  type="text"
                  inputMode="numeric"
                  aria-label="시 (00~23)"
                  className="picker-input"
                  maxLength={2}
                  value={hour}
                  onChange={(e) => setHour(e.target.value.replace(/[^0-9]/g, ''))}
                  onBlur={() => setHour(normalizeTimePart(hour, 23))}
                  onKeyDown={(e) => handleTimeKeyDown(e, 'hour')}
                />
                <button type="button" aria-label="시 줄이기" onClick={() => stepPicker('hour', -1)}>▼</button>
              </div>

              <div className="picker-divider" aria-hidden="true" />

              <div className="picker-column" onWheel={(e) => handleWheel(e, 'minute')}>
                <button type="button" aria-label="분 늘리기" onClick={() => stepPicker('minute', 1)}>▲</button>
                <input
                  type="text"
                  inputMode="numeric"
                  aria-label="분 (00~59)"
                  className="picker-input"
                  maxLength={2}
                  value={minute}
                  onChange={(e) => setMinute(e.target.value.replace(/[^0-9]/g, ''))}
                  onBlur={() => setMinute(normalizeTimePart(minute, 59))}
                  onKeyDown={(e) => handleTimeKeyDown(e, 'minute')}
                />
                <button type="button" aria-label="분 줄이기" onClick={() => stepPicker('minute', -1)}>▼</button>
              </div>
            </div>

            <div className="modal-actions">
              {/* 3. saveAlarmSetting -> handleSaveAlarm */}
              <button type="button" className="btn-confirm" onClick={handleSaveAlarm}>
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 모달 3: 삭제 확인 (단건 vs 전체 스케줄 연계 삭제) */}
      {isDeleteModalOpen && (
        <div className="modal-overlay" onClick={() => setIsDeleteModalOpen(false)}>
          <div className="custom-delete-modal" onClick={(e) => e.stopPropagation()}>
            <div className="delete-modal-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="#7d2638" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '28px', height: '28px' }}>
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
            </div>
            
            <h4 className="delete-modal-title">복약 일정 삭제</h4>
            {itemToDelete && (
              <div className="delete-modal-target-box">
                <span className={`target-type-badge ${itemToDelete.type || 'regular'}`}>
                  {itemToDelete.type === 'prescription' ? '처방약' : itemToDelete.type === 'supplement' ? '영양제' : '상비약'}
                </span>
                <span className="target-time-badge">{formatTime24(itemToDelete.time) || '시간미정'}</span>
                <strong className="target-med-name">{itemToDelete.name}</strong>
              </div>
            )}
            <p className="delete-modal-desc">
              선택한 날짜의 일정만 삭제할 수도 있고,<br />
              등록된 약 정보는 유지한 채 전체 복약 일정만 삭제할 수 있습니다.
            </p>

            <div className="delete-modal-choice-group">
              <button
                type="button"
                className="btn-delete-choice btn-choice-single"
                onClick={() => confirmDeleteSchedule(false)}
              >
                <span className="choice-title">이 일정만 삭제</span>
                <span className="choice-desc">{selectedDate} 일정만 삭제합니다</span>
              </button>
              
              <button
                type="button"
                className="btn-delete-choice btn-choice-all"
                onClick={() => confirmDeleteSchedule(true)}
              >
                <span className="choice-title">이 약의 전체 스케줄 삭제</span>
                <span className="choice-desc">등록된 약의 모든 날짜의 일정을 삭제합니다</span>
              </button>
            </div>

            <div className="delete-modal-footer">
              <button 
                type="button" 
                className="btn-modal-cancel" 
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setItemToDelete(null);
                }}
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 가족 그룹 만들기 모달 */}
      {isCreateFamilyModalOpen && (
        <div className="modal-overlay" onClick={() => !isCreatingFamily && setIsCreateFamilyModalOpen(false)}>
          <div className="modal-content family-add-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">가족 그룹 만들기</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsCreateFamilyModalOpen(false)}
                disabled={isCreatingFamily}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreateFamily}>
              <div className="family-add-notice">
                가족 그룹을 생성하면 회원님이 보호자(관리자)로 설정되며, 가족 목록에 본인이 등록됩니다. 이후 다른 가족 구성원을 추가하거나 초대할 수 있습니다.
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '16px' }}>
                <div>
                  <label className="family-form-label">
                    가족 그룹 이름 <span style={{ color: '#c94040' }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="family-form-input"
                    placeholder="예: 우리 가족"
                    value={newFamilyName}
                    onChange={(e) => setNewFamilyName(e.target.value)}
                    autoFocus
                    required
                    disabled={isCreatingFamily}
                  />
                </div>
              </div>

              <div className="modal-footer-actions">
                <button
                  type="button"
                  className="family-btn-outline"
                  onClick={() => setIsCreateFamilyModalOpen(false)}
                  disabled={isCreatingFamily}
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="family-btn-primary"
                  disabled={isCreatingFamily}
                >
                  {isCreatingFamily ? '생성 중...' : '가족 그룹 만들기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 가족 이름 변경 모달 */}
      {isRenameModalOpen && (
        <div className="modal-overlay" onClick={() => !isRenaming && setIsRenameModalOpen(false)}>
          <div className="modal-content family-add-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">가족 이름 변경</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsRenameModalOpen(false)}
                disabled={isRenaming}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleRenameFamily}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', margin: '14px 0' }}>
                <div>
                  <label className="family-form-label">
                    가족 이름 <span style={{ color: '#c94040' }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="family-form-input"
                    placeholder="예: 우리 가족"
                    value={editFamilyName}
                    onChange={(e) => setEditFamilyName(e.target.value)}
                    autoFocus
                    required
                    disabled={isRenaming}
                  />
                </div>
              </div>

              <div className="modal-footer-actions">
                <button
                  type="button"
                  className="family-btn-outline"
                  onClick={() => setIsRenameModalOpen(false)}
                  disabled={isRenaming}
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="family-btn-primary"
                  disabled={isRenaming}
                >
                  {isRenaming ? '저장 중...' : '저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
