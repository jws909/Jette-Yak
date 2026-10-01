import React, { useState, useEffect, useCallback } from 'react';
import './FamilyPage.css';

function getFormattedDate(targetDate) {
  const y = targetDate.getFullYear();
  const m = String(targetDate.getMonth() + 1).padStart(2, '0');
  const d = String(targetDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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
  const user = props.user;
  const currentUserId = user?.userId || null;
  const today = new Date();

  // 1. 상태 관리
  const [familyMembers, setFamilyMembers] = useState([]);
  const [selectedMemberId, setSelectedMemberId] = useState('all');

  const [currentDate, setCurrentDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(getFormattedDate(today));

  const [monthSummary, setMonthSummary] = useState({});
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(false);

  const [inviteRole, setInviteRole] = useState('BABY'); // 기본값: 자녀

  // 역할 영문 -> 한글 변환 함수
  // 역할 한글 변환 함수 (영문 대소문자/공백 완벽 대응)
  // 역할 한글 변환 함수 (영문 대소문자/공백 완벽 대응)
  // 역할 한글 변환 함수 (GUAR 대응)
  const getRoleLabel = (role) => {
    if (!role) return '';
    const r = String(role).trim().toUpperCase();

    // 보호자 / 관리자 (GUAR, PROT 등)
    if (['GUAR', 'GUARDIAN', 'PROT', 'PROTECTOR', '보호자'].includes(r)) {
      return '(보호자)';
    }

    // 부모님
    if (['PARENT', 'FATHER', 'MOTHER', 'PARENTS', '부모님', '부모', '아빠', '엄마'].includes(r)) {
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

  // 가족 등록 모달 상태
  const [isAddFamilyModalOpen, setIsAddFamilyModalOpen] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('PROT');

  // 기존 State들 부근에 추가
  const [familyAddTab, setFamilyAddTab] = useState('direct'); // 'direct' 또는 'invite'
  const [newMemberSex, setNewMemberSex] = useState('M');      // 남아 'M', 여아 'F'
  const [newMemberBirth, setNewMemberBirth] = useState('');    // 생년월일
  const [inviteLoginId, setInviteLoginId] = useState('');      // 회원 연동용 ID

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const currentYearMonth = `${year}-${String(month + 1).padStart(2, '0')}`;

  // =========================================================================
  // 2. 비동기 백엔드 API 통신 로직
  // =========================================================================

  // (1) 가족 구성원 목록 조회
  const fetchFamilyMembers = useCallback(async () => {
    if (!currentUserId) return;
    try {
      const res = await fetch(`/api/family/members?userId=${currentUserId}`);
      if (res.ok) {
        const data = await res.json();
        setFamilyMembers(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('가족 구성원 조회 오류:', err);
    }
  }, [currentUserId]);

  // (2) 월별 요약 조회 (달력 인디케이터용)
  const fetchMonthSummary = useCallback(async () => {
    if (!currentUserId) {
      setMonthSummary({});
      return;
    }
    try {
      const queryUser = selectedMemberId === 'all' ? currentUserId : selectedMemberId;
      const isFamilyParam = selectedMemberId === 'all' ? '&isFamily=true' : '';
      const res = await fetch(`/api/calendar/summary?userId=${queryUser}&yearMonth=${currentYearMonth}${isFamilyParam}`);
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
    } catch (err) {
      console.error('월별 요약 조회 실패:', err);
    }
  }, [currentYearMonth, currentUserId, selectedMemberId]);

  // (3) 선택 일자 복약 스케줄 조회
const fetchDailySchedules = useCallback(async (targetDateStr) => {
  if (!currentUserId) {
    setSchedules([]);
    return;
  }
  setLoading(true);
  try {
    // targetDateStr이 없거나 문자열 'undefined'면 현재 선택된 날짜나 오늘 날짜로 대체
    const dateParam = (targetDateStr && targetDateStr !== 'undefined') 
      ? targetDateStr 
      : (selectedDate || new Date().toISOString().slice(0, 10));

    const queryUser = selectedMemberId === 'all' ? currentUserId : selectedMemberId;
    const isFamilyParam = selectedMemberId === 'all' ? '&isFamily=true' : '';
    
    // date=${targetDateStr} -> date=${dateParam} 으로 수정
    const res = await fetch(`/api/calendar?userId=${queryUser}&date=${dateParam}${isFamilyParam}`);
    
    if (res.ok) {
      const data = await res.json();
      setSchedules(Array.isArray(data) ? data : []);
    } else {
      setSchedules([]);
    }
  } catch (err) {
    console.error('스케줄 조회 실패:', err);
    setSchedules([]);
  } finally {
    setLoading(false);
  }
}, [currentUserId, selectedMemberId, selectedDate]);

  useEffect(() => {
    fetchFamilyMembers();
  }, [fetchFamilyMembers]);

  useEffect(() => {
    fetchMonthSummary();
  }, [fetchMonthSummary]);

  useEffect(() => {
    fetchDailySchedules(selectedDate);
  }, [selectedDate, fetchDailySchedules]);

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
      alert('로그인 후 이용할 수 있습니다.');
      return;
    }
    const isTaken = !item.takenAt;
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const nowIso = isTaken
      ? `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
      : null;

    setSchedules((prev) =>
      prev.map((s) => (s.scheduleId === item.scheduleId ? { ...s, takenAt: nowIso } : s))
    );

    try {
      await fetch(`/api/calendar/${item.scheduleId}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taken: isTaken, date: selectedDate }),
      });
      fetchDailySchedules(selectedDate);
      fetchMonthSummary();
      window.dispatchEvent(new CustomEvent('jette-intake-updated', { detail: { date: selectedDate } }));
    } catch (err) {
      console.error('복약 체크 토글 실패:', err);
    }
  };

  // (5) 스케줄 삭제
  const handleDeleteSchedule = async (scheduleId, e) => {
    e.stopPropagation();
    if (!window.confirm('이 복약 일정을 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`/api/calendar/${scheduleId}`, { method: 'DELETE' });
      if (res.ok) {
        fetchDailySchedules(selectedDate);
        fetchMonthSummary();
      }
    } catch (err) {
      console.error('일정 삭제 오류:', err);
    }
  };

  // (6) [보고서] 버튼 클릭 시: 처방약 / 상시약 / 영양제 3단 분리 종합 취합
  const handleOpenReportModal = async () => {
    setIsReportOpen(true);
    setIsReportLoading(true);

    try {
      const targetId = selectedMemberId === 'all'
        ? (familyMembers[0]?.userId || currentUserId)
        : selectedMemberId;

      // 처방전 목록 조회
      let presList = [];
      try {
        const presRes = await fetch(`/api/prescriptions?userId=${targetId}`);
        if (presRes.ok) {
          const list = await presRes.json();
          presList = Array.isArray(list) ? list : [];
        }
      } catch (err) {}

      // 대상자명
      const targetMemberObj = familyMembers.find((m) => String(m.userId) === String(selectedMemberId));
      let currentTargetName = '';

      if (selectedMemberId === 'all') {
        currentTargetName = '가족 전체';
      } else if (targetMemberObj) {
        // role 매핑 (PROT: 자녀/부모님, GUAR: 배우자 등 프로젝트에 맞춤)
        const roleLabel = targetMemberObj.relation || targetMemberObj.roleLabel || 
          (targetMemberObj.role === 'GUAR' ? '배우자' : targetMemberObj.role === 'PROT' ? '자녀' : targetMemberObj.role);
        currentTargetName = roleLabel ? `${targetMemberObj.name} (${roleLabel})` : targetMemberObj.name;
      } else {
        currentTargetName = user?.name ? `${user.name} (본인)` : '본인';
      }

      const curDateObj = new Date(selectedDate);

      // ==========================================
      // [1] 처방약(Prescription) 취합
      // ==========================================
      const prescriptionItems = schedules.filter((s) => s.type === 'prescription');
      const uniquePrescriptions = [];
      const seenPresNames = new Set();

      for (const item of prescriptionItems) {
        if (!seenPresNames.has(item.name)) {
          seenPresNames.add(item.name);

          const pId = item.prescriptionId || item.prescription_id;
          let pData = presList.find(p => 
            (pId && (p.prescriptionId === pId || p.prescription_id === pId)) ||
            (p.medications && p.medications.some(m => m.name === item.name || m.itemName === item.name)) ||
            (p.medicationNames && p.medicationNames.includes(item.name))
          );

          if (!pData && presList.length > 0) pData = presList[0];

          const hospitalName = pData?.hospitalName || pData?.hospital_name || '한내과의원';
          const doctorName = pData?.doctorName || pData?.doctor_name || '유현영';
          const startRaw = pData?.startDate || pData?.start_date || pData?.prescribedDate || '2026-09-23';
          const totalDays = Number(pData?.totalDays || pData?.total_days || 180);

          let purposeText = '간 기능 개선 및 이상지질혈증(고지혈증) 조절을 통한 심혈관 질환 예방';
          const rawAiJson = pData?.aiSummaryJson || pData?.ai_summary_json;
          if (rawAiJson) {
            try {
              const parsed = typeof rawAiJson === 'string' ? JSON.parse(rawAiJson) : rawAiJson;
              if (parsed.purpose || parsed.prescriptionPurpose) purposeText = parsed.purpose || parsed.prescriptionPurpose;
            } catch (e) {}
          } else if (pData?.purpose || pData?.prescriptionPurpose) {
            purposeText = pData.purpose || pData.prescriptionPurpose;
          }

          const startObj = new Date(startRaw);
          const endObj = new Date(startObj);
          endObj.setDate(startObj.getDate() + (totalDays - 1));

          const diffDays = Math.floor((curDateObj.getTime() - startObj.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          const elapsedDays = Math.max(1, diffDays);

          const formatDate = (d) =>
            `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;

          const relatedDoses = schedules
            .filter((s) => s.name === item.name)
            .map((d) => ({
              time: String(d.time || '').substring(0, 5),
              slot: d.slotLabel || getSlotFromTime(d.time).slotLabel,
              taken: Boolean(d.takenAt),
            }));

          uniquePrescriptions.push({
            name: item.name,
            hospital: `${hospitalName} · ${doctorName}`,
            startDate: formatDate(startObj),
            endDate: formatDate(endObj),
            totalDays: totalDays,
            elapsedDays: elapsedDays,
            todayDoses: relatedDoses,
          });
        }
      }

      // ==========================================
      // [2] 상시약(Regular) 독립 취합
      // ==========================================
      const regularItems = schedules.filter((s) => s.type === 'regular');
      const uniqueRegulars = [];
      const seenRegNames = new Set();

      for (const item of regularItems) {
        if (!seenRegNames.has(item.name)) {
          seenRegNames.add(item.name);
          const relatedDoses = schedules
            .filter((s) => s.name === item.name)
            .map((d) => ({
              time: String(d.time || '').substring(0, 5),
              slot: d.slotLabel || getSlotFromTime(d.time).slotLabel,
              taken: Boolean(d.takenAt),
            }));

          uniqueRegulars.push({
            name: item.name,
            memo: item.memo || '정기 상시 복용',
            todayDoses: relatedDoses,
          });
        }
      }

      // ==========================================
      // [3] 영양제(Supplement) 독립 취합
      // ==========================================
      const supplementItems = schedules.filter((s) => s.type === 'supplement');
      const uniqueSupplements = [];
      const seenSupNames = new Set();

      for (const item of supplementItems) {
        if (!seenSupNames.has(item.name)) {
          seenSupNames.add(item.name);
          const relatedDoses = schedules
            .filter((s) => s.name === item.name)
            .map((d) => ({
              time: String(d.time || '').substring(0, 5),
              slot: d.slotLabel || getSlotFromTime(d.time).slotLabel,
              taken: Boolean(d.takenAt),
            }));

          uniqueSupplements.push({
            name: item.name,
            memo: item.memo || '건강기능식품 보충',
            todayDoses: relatedDoses,
          });
        }
      }

      setReportData({
        targetName: currentTargetName,
        targetDate: selectedDate,
        prescriptions: uniquePrescriptions,
        regulars: uniqueRegulars,
        supplements: uniqueSupplements,
      });

    } catch (err) {
      console.error('보고서 데이터 준비 오류:', err);
    } finally {
      setIsReportLoading(false);
    }
  };

  // 가족 등록
  const handleAddFamilyMember = async (e) => {
    e.preventDefault();
    if (!newMemberName.trim()) {
      alert('가족 구성원의 이름을 입력해주세요.');
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
        }),
      });
      if (res.ok) {
        alert('가족이 성공적으로 등록되었습니다.');
        setNewMemberName('');
        setIsAddFamilyModalOpen(false);
        fetchFamilyMembers();
      } else {
        alert('가족 등록에 실패했습니다.');
      }
    } catch (err) {
      console.error('가족 등록 통신 오류:', err);
    }
  };

  // 회원 연동(초대) 처리 함수
  const handleInviteFamilyMember = async (e) => {
  if (e) e.preventDefault(); // 1. 기본 submit 폼 새로고침 방지 (필수!)

  if (!inviteLoginId.trim()) {
    alert("초대할 가족의 아이디를 입력해주세요.");
    return;
  }

  // 로그인된 내 USER_ID 가져오기 (현재 프로젝트에서 쓰시는 상태나 변수명으로 확인)
  // 예: user?.userId, currentUser?.userId, loginUser?.userId, user?.id 등
  const myUserId = user?.userId || user?.id || 1; 

  try {
    const response = await fetch('/api/family/invite', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        senderId: myUserId,                 // 백엔드가 요구하는 키: senderId
        targetLoginId: inviteLoginId.trim(), // 백엔드가 요구하는 키: targetLoginId
        role: inviteRole,
      }),
    });

    const data = await response.json();

    if (response.ok) {
      alert("가족 연동 초대를 보냈습니다!");
      setInviteLoginId("");
      setIsAddFamilyModalOpen(false);
    } else {
      // 400, 404 등 백엔드에서 던진 구체적인 에러 메시지 출력
      alert(data.message || "연동 요청에 실패했습니다.");
    }
  } catch (error) {
    console.error("초대 요청 에러:", error);
    alert("서버 통신 중 오류가 발생했습니다.");
  }
};

const handleRemoveMember = async (member) => {
    const memberName = member.name || member.nickname || '구성원';
    if (!window.confirm(`'${memberName}' 님을 가족 목록에서 삭제하시겠습니까?`)) {
      return;
    }

    try {
      const response = await fetch(`http://localhost:8080/api/family/members/${member.userId}/remove`, {
        method: 'POST',
        credentials: 'include' // 세션 정보 전달
      });

      const data = await response.json();

      if (response.ok && data.success) {
        alert(`${memberName} 님이 삭제되었습니다.`);
        if (String(selectedMemberId) === String(member.userId)) {
          setSelectedMemberId('all');
        }
        if (typeof fetchFamilyMembers === 'function') await fetchFamilyMembers();
        if (typeof fetchMonthlySummary === 'function') fetchMonthlySummary();
        if (typeof fetchDailySchedules === 'function') fetchDailySchedules();
      } else {
        alert(data.message || '가족 삭제 처리에 실패했습니다.');
      }
    } catch (err) {
      console.error('가족 삭제 실패:', err);
      alert('삭제 처리 중 오류가 발생했습니다.');
    }
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

  // 알람 설정 모달 상태
  const [alarmModalOpen, setAlarmModalOpen] = useState(false);
  const [targetScheduleForAlarm, setTargetScheduleForAlarm] = useState(null);
  const [newAlarmTime, setNewAlarmTime] = useState('08:00');
  const [alarmEnabled, setAlarmEnabled] = useState(true);

  // 일정 삭제 모달 상태
  const [scheduleDeleteModalOpen, setScheduleDeleteModalOpen] = useState(false);
  const [targetScheduleForDelete, setTargetScheduleForDelete] = useState(null);

  // 1) 알람 모달 열기
  const handleOpenAlarmModal = (item) => {
    setTargetScheduleForAlarm(item);
    setNewAlarmTime(item.time ? String(item.time).substring(0, 5) : '08:00');
    setAlarmEnabled(item.alarmEnabled ?? true);
    setAlarmModalOpen(true);
  };

  // 2) 알람 일괄 저장 API 호출
  const handleSaveAlarm = async () => {
    if (!targetScheduleForAlarm) return;
    try {
      const res = await fetch(
        `/api/calendar/${targetScheduleForAlarm.scheduleId}/alarm?newTime=${encodeURIComponent(newAlarmTime)}&alarmEnabled=${alarmEnabled}&date=${selectedDate}`,
        { method: 'POST' }
      );
      if (res.ok) {
        alert('알람 설정이 변경되었습니다.');
        setAlarmModalOpen(false);
        // 당일 일정 다시 불러오기 (사용하시는 함수명 확인: fetchDailySchedules 등)
        if (typeof fetchDailySchedules === 'function') fetchDailySchedules(selectedDate);
      } else {
        alert('알람 설정 변경에 실패했습니다.');
      }
    } catch (err) {
      console.error('알람 변경 오류:', err);
    }
  };

  // 3) 삭제 모달 열기
  const handleOpenScheduleDeleteModal = (item) => {
    setTargetScheduleForDelete(item);
    setScheduleDeleteModalOpen(true);
  };

  // 4) 삭제 실행 API 호출 (deleteAll: true면 전체 반복 삭제, false면 오늘만 삭제)
  const handleExecuteScheduleDelete = async (deleteAll) => {
    if (!targetScheduleForDelete) return;
    try {
      const targetUid = targetScheduleForDelete.userId || currentUserId;
      const res = await fetch(
        `/api/calendar/${targetScheduleForDelete.scheduleId}/delete?deleteAll=${deleteAll}&userId=${targetUid}&date=${selectedDate}`,
        { method: 'POST' }
      );
      if (res.ok) {
        setScheduleDeleteModalOpen(false);
        setTargetScheduleForDelete(null);
        if (typeof fetchDailySchedules === 'function') fetchDailySchedules(selectedDate);
        if (typeof fetchMonthSummary === 'function') fetchMonthSummary();
      } else {
        alert('일정 삭제에 실패했습니다.');
      }
    } catch (err) {
      console.error('일정 삭제 오류:', err);
    }
  };

  return (
    <div className="family-page-wrapper">
      {/* 1. 상단 타이틀 & 필터 칩 */}
      <div className="family-header">
        <span className="family-subtitle">FAMILY MEDICATION</span>
        <h1 className="family-title">가족 페이지</h1>

        <div className="family-controls">
          <div className="family-chips-group">
            <button
              type="button"
              className={`family-chip ${selectedMemberId === 'all' ? 'selected' : ''}`}
              onClick={() => setSelectedMemberId('all')}
            >
              전체
            </button>
            {familyMembers.map((member) => {
              // 현재 로그인한 본인 계정인지 확인
              const isMe = Number(member.userId) === Number(currentUserId);

              // 현재 로그인한 사용자 본인이 보호자(방장)인지 확인
              const myInfo = familyMembers.find((m) => Number(m.userId) === Number(currentUserId));
              const isManager = myInfo?.role === 'GUAR' || myInfo?.role === '보호자';

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
                    <span style={{ fontSize: '0.85em', marginLeft: '4px', opacity: 0.85 }}>
                      {isMe ? '(본인)' : getRoleLabel(member.role)}
                    </span>
                  </button>

                  {/* 초대한 보호자 본인만, 타인 구성원 옆에 삭제(×) 버튼 노출 */}
                  {isManager && !isMe && (
                    <button
                      type="button"
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
            })}
          </div>

          <div className="family-action-buttons">
            <button
              type="button"
              className="family-btn-outline"
              onClick={() => setIsAddFamilyModalOpen(true)}
            >
              가족등록
            </button>
            <button
              type="button"
              className="family-btn-primary"
              onClick={handleOpenReportModal}
            >
              보고서
            </button>
          </div>
        </div>
      </div>

      {/* 2. 상단 캘린더 */}
      <div className="family-card">
        <div className="calendar-nav">
          <div className="calendar-month-selector">
            <button type="button" className="calendar-arrow-btn" onClick={() => changeMonth(-1)}>
              &lt;
            </button>
            <span>{year}년 {month + 1}월</span>
            <button type="button" className="calendar-arrow-btn" onClick={() => changeMonth(1)}>
              &gt;
            </button>
          </div>
          <button type="button" className="calendar-today-btn" onClick={handleGoToday}>
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
            <div className="chk-empty-message">해당 시간대에 등록된 복약 일정이 없습니다.</div>
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
                      <span className="chk-time-text">{String(item.time || '').substring(0, 5)}</span>
                      
                      {/* 전체 탭일 때: '가족' 대신 실제 유저 이름과 역할 표시 */}
                      {selectedMemberId === 'all' && (
                        <span className="chk-user-tag">
                          {(item.userName && item.userName !== '가족') 
                            ? item.userName 
                            : (familyMembers?.find(m => Number(m.userId) === Number(item.userId))?.name || '본인')}
                          {Number(item.userId) === Number(currentUserId) 
                            ? ' (본인)' 
                            : (item.userRole || item.role ? ` (${getRoleLabel(item.userRole || item.role)})` : '')}
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
                      onClick={() => handleOpenAlarmModal(item)}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                      </svg>
                    </button>

                    {/* 2. 캘린더 스타일 삭제 모달 열기 */}
                    <button
                      type="button"
                      className="chk-icon-btn delete"
                      title="일정 삭제"
                      onClick={() => handleOpenScheduleDeleteModal(item)}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
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
                          {p.elapsedDays}일차 <span className="report-total-days">/ 총 {p.totalDays}일분</span>
                        </span>
                      </div>

                      <div className="report-period-box">
                        <span style={{ fontSize: '12px', color: '#4a413a' }}>
                          <strong>조제/복용 기간:</strong> {p.startDate} ~ {p.endDate}
                        </span>
                      </div>

                      <div className="report-dose-chips">
                        {p.todayDoses?.map((d, dIdx) => (
                          <span
                            key={dIdx}
                            className={`report-dose-chip ${d.taken ? 'done' : 'undone'}`}
                          >
                            {d.slot}({d.time}): {d.taken ? '✓ 복용완료' : '미복용'}
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
                              {d.slot}({d.time}): {d.taken ? '✓ 복용완료' : '미복용'}
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
                              {d.slot}({d.time}): {d.taken ? '✓ 복용완료' : '미복용'}
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
                        <option value="PROT">자녀 (영유아/어린이)</option>
                        <option value="PROT_SENIOR">부모님 (어르신)</option>
                        <option value="GUAR">공동 보호자 (배우자)</option>
                        <option value="ETC">기타 피보호자</option>
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
                          남아
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="memberSex"
                            value="F"
                            checked={newMemberSex === 'F'}
                            onChange={() => setNewMemberSex('F')}
                          />
                          여아
                        </label>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="family-form-label">생년월일 (선택)</label>
                    <input
                      type="date"
                      className="family-form-input"
                      value={newMemberBirth}
                      onChange={(e) => setNewMemberBirth(e.target.value)}
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
                  이미 제떼약에 가입된 가족의 아이디를 검색하여 복약 일정을 공유하고 승인을 요청합니다.
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div>
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

                    <select 
                      value={inviteRole} 
                      onChange={(e) => setInviteRole(e.target.value)}
                      style={{ marginLeft: '8px', padding: '6px' }}
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

      


    </div>
  );
}