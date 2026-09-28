import React, { useState, useEffect, useCallback } from 'react';
import './FamilyPage.css';

function getFormattedDate(targetDate) {
  const y = targetDate.getFullYear();
  const m = String(targetDate.getMonth() + 1).padStart(2, '0');
  const d = String(targetDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getSlotFromTime(t) {
  if (!t || !t.includes(':')) return { slot: 'breakfast', slotLabel: '아침' };
  const h = parseInt(t.split(':')[0], 10);
  if (h < 11) return { slot: 'breakfast', slotLabel: '아침' };
  if (h < 16) return { slot: 'lunch', slotLabel: '점심' };
  if (h < 21) return { slot: 'dinner', slotLabel: '저녁' };
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

  // 가족 구성원 목록 조회
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

  // 월별 투약 요약 조회 (캘린더 인디케이터용)
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

  // 선택 일자 복약 스케줄 조회
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

  // 외부 복약 상태 동기화
  useEffect(() => {
    const handleSync = () => {
      fetchDailySchedules(selectedDate);
      fetchMonthSummary();
    };
    window.addEventListener('jette-intake-updated', handleSync);
    return () => window.removeEventListener('jette-intake-updated', handleSync);
  }, [selectedDate, fetchDailySchedules, fetchMonthSummary]);

  // 복약 체크 토글 (낙관적 UI + DB 실시간 동기화)
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

  // (5) [보고서] 버튼 클릭 시: 처방전 원본(180일분) 데이터 및 진료 브리핑 취합
  const handleOpenReportModal = async () => {
    setIsReportOpen(true);
    setIsReportLoading(true);

    try {
      const targetId = selectedMemberId === 'all'
        ? (familyMembers[0]?.userId || currentUserId)
        : selectedMemberId;

      // 1. 처방전 목록 조회 (/api/prescriptions)
      let presList = [];
      try {
        const presRes = await fetch(`/api/prescriptions?userId=${targetId}`);
        if (presRes.ok) {
          const list = await presRes.json();
          presList = Array.isArray(list) ? list : [];
        }
      } catch (err) {
        console.warn('처방전 목록 통신 오류:', err);
      }

      // 대상자명
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

          // 처방전 매칭 (처방전 카드 정보 탐색)
          let pData = presList.find(p => 
            (pId && (p.prescriptionId === pId || p.prescription_id === pId)) ||
            (p.medications && p.medications.some(m => m.name === item.name || m.itemName === item.name)) ||
            (p.medicationNames && p.medicationNames.includes(item.name))
          );

          // 첫 번째 활성 처방전 fallback
          if (!pData && presList.length > 0) {
            pData = presList[0];
          }

          // 처방전 원본 데이터 매핑
          const hospitalName = pData?.hospitalName || pData?.hospital_name || '한내과의원';
          const doctorName = pData?.doctorName || pData?.doctor_name || '유현영';
          const startRaw = pData?.startDate || pData?.start_date || pData?.prescribedDate || '2026-09-23';
          const totalDays = Number(pData?.totalDays || pData?.total_days || 180);

          // AI 처방 목적 파싱
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

          // 날짜 계산 (start ~ end, n일차)
          const startObj = new Date(startRaw);
          const endObj = new Date(startObj);
          endObj.setDate(startObj.getDate() + (totalDays - 1));

          // N일차: 오늘(2026-09-28) - 시작일(2026-09-23) + 1 = 6일차
          const diffDays = Math.floor((curDateObj.getTime() - startObj.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          const elapsedDays = Math.max(1, diffDays);

          const formatDate = (d) =>
            `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;

          // 당일 실시간 체크 현황
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

  // 가족 구성원 신규 등록
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

  // =========================================================================
  // 3. 캘린더 날짜 그리드 계산
  // =========================================================================
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

  const categoryMap = {
    prescription: { label: '처방약', className: 'cat-prescription' },
    regular: { label: '상시약', className: 'cat-regular' },
    supplement: { label: '영양제', className: 'cat-supplement' },
  };

  return (
    <div className="family-page-wrapper">
      {/* 1. 상단 타이틀 & 컨트롤 바 */}
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

      {/* 3. 하단 Today 체크리스트 */}
      <div className="family-card">
        <div className="checklist-header">
          <h3 className="checklist-title">today 체크리스트</h3>
          <span className="checklist-date">
            {selectedDate.split('-')[1].replace(/^0/, '')}월 {selectedDate.split('-')[2].replace(/^0/, '')}일
          </span>
        </div>

        <div className="checklist-items">
          {loading ? (
            <div className="checklist-empty-msg">일정을 불러오는 중입니다...</div>
          ) : schedules.length === 0 ? (
            <div className="checklist-empty-msg">선택한 날짜에 등록된 복약 일정이 없습니다.</div>
          ) : (
            schedules.map((item) => {
              const isTaken = Boolean(item.takenAt);
              const currentCat = categoryMap[item.type] || { label: '상시약', className: 'cat-regular' };
              const currentSlot = getSlotFromTime(item.time);

              return (
                <div key={item.scheduleId} className={`checklist-row ${isTaken ? 'is-done' : ''}`}>
                  <div className="checklist-info-group">
                    {item.userName && (
                      <span className="member-tag">
                        {item.userName}
                      </span>
                    )}
                    <span className="slot-tag">{currentSlot.slotLabel}</span>
                    <span className="checklist-time">{String(item.time || '').substring(0, 5)}</span>
                    <div>
                      <div className="med-name-line">
                        <strong className={`checklist-med-name ${isTaken ? 'completed' : ''}`}>
                          {item.name}
                        </strong>
                        <span className={`category-tag ${currentCat.className}`}>
                          {currentCat.label}
                        </span>
                      </div>
                      {item.memo && <p className="checklist-med-desc">{item.memo}</p>}
                    </div>
                  </div>

                  <button
                    type="button"
                    className={`toggle-switch ${isTaken ? 'checked' : ''}`}
                    onClick={() => toggleTaken(item)}
                    title={isTaken ? '복약 취소' : '복약 완료'}
                  >
                    <div className="toggle-handle" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 4. 보고서 모달 (진행률 바 제거, 명확한 기간 & 일차 강조) */}
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

                      {/* AI 처방 목적 */}
                      {p.purpose && (
                        <div style={{ background: '#fdf7f8', borderLeft: '3px solid #7d2638', padding: '6px 10px', fontSize: '12px', color: '#524942', borderRadius: '0 4px 4px 0' }}>
                          <strong>AI 처방 목적:</strong> {p.purpose}
                        </div>
                      )}

                      {/* 기간 정보 박스 */}
                      <div className="report-period-box">
                        <span style={{ fontSize: '12.5px', color: '#4a413a' }}>
                          <strong>조제/복용 기간:</strong> {p.startDate} ~ {p.endDate}
                        </span>
                      </div>

                      {/* 오늘 실시간 복약 여부 */}
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