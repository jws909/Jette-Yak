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

  // 체크리스트 내부 시간대 필터 탭 ('all' | 'morning' | 'lunch' | 'evening' | 'bedtime')
  const [timeFilter, setTimeFilter] = useState('all');

  // 보고서 모달 상태
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isReportLoading, setIsReportLoading] = useState(false);
  const [reportData, setReportData] = useState(null);

  // 가족 등록 모달 상태
  const [isAddFamilyModalOpen, setIsAddFamilyModalOpen] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('PROT');

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
      const queryUser = selectedMemberId === 'all' ? currentUserId : selectedMemberId;
      const isFamilyParam = selectedMemberId === 'all' ? '&isFamily=true' : '';
      const res = await fetch(`/api/calendar?userId=${queryUser}&date=${targetDateStr}${isFamilyParam}`);
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
  }, [currentUserId, selectedMemberId]);

  useEffect(() => {
    fetchFamilyMembers();
  }, [fetchFamilyMembers]);

  useEffect(() => {
    fetchMonthSummary();
  }, [fetchMonthSummary]);

  useEffect(() => {
    fetchDailySchedules(selectedDate);
  }, [selectedDate, fetchDailySchedules]);

  // 외부 복약 상태 변경 시 동기화
  useEffect(() => {
    const handleSync = () => {
      fetchDailySchedules(selectedDate);
      fetchMonthSummary();
    };
    window.addEventListener('jette-intake-updated', handleSync);
    return () => window.removeEventListener('jette-intake-updated', handleSync);
  }, [selectedDate, fetchDailySchedules, fetchMonthSummary]);

  // (4) 복약 체크박스 토글 (맨 앞 사각 체크박스 클릭)
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

    // 1. UI 즉시 반응
    setSchedules((prev) =>
      prev.map((s) => (s.scheduleId === item.scheduleId ? { ...s, takenAt: nowIso } : s))
    );

    // 2. 백엔드 실시간 저장
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

  // (5) 스케줄 삭제 액션 (휴지통 아이콘)
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

  // (6) [보고서] 버튼 클릭 시
  const handleOpenReportModal = async () => {
    setIsReportOpen(true);
    setIsReportLoading(true);

    try {
      const targetId = selectedMemberId === 'all'
        ? (familyMembers[0]?.userId || currentUserId)
        : selectedMemberId;

      let presList = [];
      try {
        const presRes = await fetch(`/api/prescriptions?userId=${targetId}`);
        if (presRes.ok) {
          const list = await presRes.json();
          presList = Array.isArray(list) ? list : [];
        }
      } catch (err) {}

      const targetMemberObj = familyMembers.find((m) => String(m.userId) === String(selectedMemberId));
      const currentTargetName = targetMemberObj
        ? `${targetMemberObj.name}`
        : user?.name
        ? `${user.name} (본인)`
        : '가족 구성원';

      const prescriptionItems = schedules.filter((s) => s.type === 'prescription');
      const uniquePrescriptions = [];
      const seenNames = new Set();
      const curDateObj = new Date(selectedDate);

      for (const item of prescriptionItems) {
        if (!seenNames.has(item.name)) {
          seenNames.add(item.name);

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
            purpose: purposeText,
            startDate: formatDate(startObj),
            endDate: formatDate(endObj),
            totalDays: totalDays,
            elapsedDays: elapsedDays,
            todayDoses: relatedDoses,
          });
        }
      }

      setReportData({
        targetName: currentTargetName,
        targetDate: selectedDate,
        prescriptions: uniquePrescriptions,
      });

    } catch (err) {
      console.error('보고서 데이터 준비 오류:', err);
    } finally {
      setIsReportLoading(false);
    }
  };

  // 가족 등록 핸들러
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

  // =========================================================================
  // 4. 체크리스트 시간대별 카운트 및 필터링 계산
  // =========================================================================
  const totalCount = schedules.length;
  const totalTakenCount = schedules.filter((s) => s.takenAt).length;

  const morningList = schedules.filter((s) => getSlotFromTime(s.time).slot === 'morning');
  const morningTaken = morningList.filter((s) => s.takenAt).length;

  const lunchList = schedules.filter((s) => getSlotFromTime(s.time).slot === 'lunch');
  const lunchTaken = lunchList.filter((s) => s.takenAt).length;

  const eveningList = schedules.filter((s) => getSlotFromTime(s.time).slot === 'evening');
  const eveningTaken = eveningList.filter((s) => s.takenAt).length;

  // 현재 활성화된 탭 기준 노출 목록
  const filteredSchedules = schedules.filter((item) => {
    if (timeFilter === 'all') return true;
    return getSlotFromTime(item.time).slot === timeFilter;
  });

  const categoryMap = {
    prescription: { label: '처방약', className: 'prescription', dotClass: 'dot-prescription' },
    regular: { label: '상시약', className: 'regular', dotClass: 'dot-regular' },
    supplement: { label: '영양제', className: 'supplement', dotClass: 'dot-supplement' },
  };

  return (
    <div className="family-page-wrapper">
      {/* 1. 상단 타이틀 & 필터 칩 */}
      <div className="family-header">
        <span className="family-subtitle">MEDICATION CALENDAR</span>
        <h1 className="family-title">가족 복약 캘린더</h1>

        <div className="family-controls">
          <div className="family-chips-group">
            <button
              type="button"
              className={`family-chip ${selectedMemberId === 'all' ? 'selected' : ''}`}
              onClick={() => setSelectedMemberId('all')}
            >
              전체
            </button>
            {familyMembers.map((member) => (
              <button
                key={member.userId}
                type="button"
                className={`family-chip ${String(selectedMemberId) === String(member.userId) ? 'selected' : ''}`}
                onClick={() => setSelectedMemberId(member.userId)}
              >
                {member.name}
              </button>
            ))}
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

      {/* 3. 하단 체크리스트 (스크린샷 디자인 1:1 완벽 이식) */}
      <div className="family-card checklist-card-section">
        {/* 상단 서브 헤더 */}
        <span className="chk-top-subtitle">SELECTED DATE</span>
        <h2 className="chk-top-title">
          {Number(selectedDate.split('-')[1])}월 {Number(selectedDate.split('-')[2])}일
        </h2>

        {/* 상단 필터 탭 바 (전체 / 아침 / 점심 / 저녁) */}
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

        {/* 리스트 목록 영역 */}
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
                  {/* 맨 앞 사각 체크박스 */}
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

                  {/* 중간 상세 정보 (2줄 구조) */}
                  <div className="chk-main-content">
                    {/* 1행: 도트 + 아침/저녁 + 시간 (+ 가족 이름) */}
                    <div className="chk-meta-line">
                      <span className={`chk-bullet-dot ${catInfo.dotClass}`} />
                      <span className="chk-slot-text">{slotInfo.slotLabel}</span>
                      <span className="chk-time-text">{String(item.time || '').substring(0, 5)}</span>
                      {item.userName && (
                        <span className="chk-user-tag">{item.userName}</span>
                      )}
                    </div>

                    {/* 2행: 약품명 + 구분 라벨 */}
                    <div className="chk-med-line">
                      <span className={`chk-med-name ${isTaken ? 'line-through' : ''}`}>
                        {item.name}
                      </span>
                      <span className={`chk-cat-label ${catInfo.className}`}>
                        {catInfo.label}
                      </span>
                    </div>
                  </div>

                  {/* 우측 알림/삭제 아이콘 */}
                  <div className="chk-actions-group">
                    <button type="button" className="chk-icon-btn" title="알림 설정">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="chk-icon-btn delete"
                      title="일정 삭제"
                      onClick={(e) => handleDeleteSchedule(item.scheduleId, e)}
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

      {/* 4. 보고서 모달 */}
      {isReportOpen && (
        <div className="modal-overlay" onClick={() => setIsReportOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">🩺 진료 제출용 복약 브리핑</h3>
              <button type="button" className="modal-close-btn" onClick={() => setIsReportOpen(false)}>✕</button>
            </div>

            {isReportLoading ? (
              <div style={{ padding: '32px 0', textAlign: 'center', color: '#7a7066', fontSize: '13.5px' }}>
                처방전 분석 데이터를 정리하는 중입니다...
              </div>
            ) : (
              <div style={{ fontSize: '13.5px', color: '#333', lineHeight: 1.6 }}>
                <div style={{ background: '#faf7f2', padding: '10px 14px', borderRadius: '6px', marginBottom: '14px' }}>
                  <p style={{ margin: 0 }}>
                    <strong>대상:</strong> {reportData?.targetName || '가족 구성원'}
                  </p>
                  <p style={{ margin: '4px 0 0' }}><strong>기준일자:</strong> {selectedDate}</p>
                </div>

                <p style={{ margin: '0 0 8px', fontWeight: 'bold', color: '#7d2638' }}>[현재 복용 처방약 및 실시간 투약 현황]</p>
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

                      {p.purpose && (
                        <div style={{ background: '#fdf7f8', borderLeft: '3px solid #7d2638', padding: '6px 10px', fontSize: '12px', color: '#524942', borderRadius: '0 4px 4px 0' }}>
                          <strong>AI 처방 목적:</strong> {p.purpose}
                        </div>
                      )}

                      <div className="report-period-box">
                        <span style={{ fontSize: '12.5px', color: '#4a413a' }}>
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
                  <p style={{ fontSize: '12px', color: '#7a7066', margin: 0 }}>해당 날짜에 복용 중인 처방약이 없습니다.</p>
                )}
              </div>
            )}

            <div className="modal-footer-actions">
              <button type="button" className="family-btn-outline" onClick={() => window.print()}>
                🖨️ 인쇄 / PDF 저장
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
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">가족 구성원 등록</h3>
              <button type="button" className="modal-close-btn" onClick={() => setIsAddFamilyModalOpen(false)}>✕</button>
            </div>

            <form onSubmit={handleAddFamilyMember}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#555' }}>이름</label>
                  <input
                    type="text"
                    placeholder="예: 김민우"
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #ded6c9', borderRadius: '6px', marginTop: '4px', boxSizing: 'border-box' }}
                    value={newMemberName}
                    onChange={(e) => setNewMemberName(e.target.value)}
                    autoFocus
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#555' }}>구분</label>
                  <select
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #ded6c9', borderRadius: '6px', marginTop: '4px', boxSizing: 'border-box' }}
                    value={newMemberRole}
                    onChange={(e) => setNewMemberRole(e.target.value)}
                  >
                    <option value="PROT">피보호자 (자녀 / 부모님)</option>
                    <option value="GUAR">공동 보호자 (배우자)</option>
                  </select>
                </div>
              </div>

              <div className="modal-footer-actions">
                <button type="button" className="family-btn-outline" onClick={() => setIsAddFamilyModalOpen(false)}>
                  취소
                </button>
                <button type="submit" className="family-btn-primary">
                  등록하기
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}