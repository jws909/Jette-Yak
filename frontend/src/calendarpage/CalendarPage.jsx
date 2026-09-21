import React, { useState, useEffect, useCallback } from 'react';
import './CalendarPage.css';

const getFormattedDate = (targetDate) => {
  const y = targetDate.getFullYear();
  const m = String(targetDate.getMonth() + 1).padStart(2, '0');
  const d = String(targetDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export default function CalendarPage({ user }) {
  const today = new Date();
  const currentUserId = user?.userId || 1;
  
  const [currentDate, setCurrentDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(getFormattedDate(today));
  const [schedules, setSchedules] = useState([]);
  const [monthSummary, setMonthSummary] = useState({});
  const [loading, setLoading] = useState(false);

  // 알람 모달 상태
  const [isAlarmModalOpen, setIsAlarmModalOpen] = useState(false);
  const [activeItem, setActiveItem] = useState(null);
  const [ampm, setAmpm] = useState('오전');
  const [hour, setHour] = useState('08');
  const [minute, setMinute] = useState('00');
  const [isAlarmEnabled, setIsAlarmEnabled] = useState(true);

  // 복약 추가 모달 상태
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newMedName, setNewMedName] = useState('');
  const [selectedMed, setSelectedMed] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [newMedType, setNewMedType] = useState('regular'); // 'regular' | 'supplement'
  const [newAmpm, setNewAmpm] = useState('오전');
  const [newHour, setNewHour] = useState('09');
  const [newMinute, setNewMinute] = useState('00');
  const [addedSuccessMsg, setAddedSuccessMsg] = useState('');

  // 삭제 확인 커스텀 모달 상태
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const currentYearMonth = `${year}-${String(month + 1).padStart(2, '0')}`;

  // 1. 월별 요약 조회 (달력 점/바 인디케이터)
  const fetchMonthSummary = useCallback(async () => {
    try {
      const res = await fetch(`/api/calendar/summary?userId=${currentUserId}&yearMonth=${currentYearMonth}`);
      if (res.ok) {
        const list = await res.json();
        const map = {};
        list.forEach((item) => {
          map[item.scheduleDate] = {
            hasPrescription: Number(item.hasPrescription) === 1,
            hasRegular: Number(item.hasRegular) === 1,
            hasSupplement: Number(item.hasSupplement) === 1,
          };
        });
        setMonthSummary(map);
      }
    } catch (err) {
      console.error("월별 요약 조회 실패:", err);
    }
  }, [currentYearMonth, currentUserId]);

  // 2. 일별 일정 목록 조회
  const fetchDailySchedules = useCallback(async (targetDateStr) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/calendar?userId=${currentUserId}&date=${targetDateStr}`);
      if (response.ok) {
        const data = await response.json();
        setSchedules(data);
      } else {
        setSchedules([]);
      }
    } catch (err) {
      console.error("데이터 조회 실패:", err);
      setSchedules([]);
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    fetchMonthSummary();
  }, [fetchMonthSummary]);

  useEffect(() => {
    fetchDailySchedules(selectedDate);
  }, [selectedDate, fetchDailySchedules]);

  // 약품 검색 자동완성
  useEffect(() => {
    if (!newMedName.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/calendar/search-medications?keyword=${encodeURIComponent(newMedName)}`);
        if (res.ok) {
          const list = await res.json();
          setSearchResults(list);
        }
      } catch (err) {
        console.error("약품 검색 실패:", err);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [newMedName]);

  const handleSelectMed = (med) => {
    setSelectedMed({
      id: med.medicationId,
      name: med.itemName
    });
    setNewMedName('');
    setSearchResults([]);
  };

  const handleRemoveSelectedMed = () => {
    setSelectedMed(null);
  };

  const changeMonth = (offset) => {
    setCurrentDate(new Date(year, month + offset, 1));
  };

  const handleGoToday = () => {
    const now = new Date();
    setCurrentDate(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDate(getFormattedDate(now));
  };

  // 체크박스 토글
  const toggleTaken = async (item) => {
    const isTaken = !item.takenAt;
    try {
      const response = await fetch(`http://localhost:8080/api/calendar/${item.scheduleId}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taken: isTaken }),
      });
      if (response.ok) {
        setSchedules((prev) =>
          prev.map((s) => (s.scheduleId === item.scheduleId ? { ...s, takenAt: isTaken ? new Date().toISOString() : null } : s))
        );
      }
    } catch (err) {
      console.error("체크박스 토글 실패:", err);
    }
  };

  // 삭제 모달 열기
  const openDeleteModal = (item, e) => {
    e.stopPropagation();
    setItemToDelete(item);
    setIsDeleteModalOpen(true);
  };

  // 모달 내 [삭제] 버튼 클릭 시 실행
  const confirmDeleteSchedule = async () => {
    if (!itemToDelete) return;

    try {
      const response = await fetch(`http://localhost:8080/api/calendar/${itemToDelete.scheduleId}/delete`, {
        method: 'POST',
      });
      if (response.ok) {
        setSchedules((prev) => prev.filter((s) => s.scheduleId !== itemToDelete.scheduleId));
        fetchMonthSummary();
      } else {
        alert("삭제에 실패했습니다.");
      }
    } catch (err) {
      console.error("삭제 통신 실패:", err);
      alert("삭제 통신 중 오류가 발생했습니다.");
    } finally {
      setIsDeleteModalOpen(false);
      setItemToDelete(null);
    }
  };

  const stepHour = (current, delta) => {
    let val = parseInt(current, 10) || 1;
    val = ((val - 1 + delta) % 12 + 12) % 12 + 1;
    return String(val).padStart(2, '0');
  };

  const stepMinute = (current, delta) => {
    let val = parseInt(current, 10) || 0;
    val = ((val + delta) % 60 + 60) % 60;
    return String(val).padStart(2, '0');
  };

  const handleWheel = (e, type, isAdd = false) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1 : -1;
    if (type === 'ampm') {
      if (isAdd) setNewAmpm((prev) => (prev === '오전' ? '오후' : '오전'));
      else setAmpm((prev) => (prev === '오전' ? '오후' : '오전'));
    } else if (type === 'hour') {
      if (isAdd) setNewHour((prev) => stepHour(prev, delta));
      else setHour((prev) => stepHour(prev, delta));
    } else if (type === 'minute') {
      if (isAdd) setNewMinute((prev) => stepMinute(prev, delta));
      else setMinute((prev) => stepMinute(prev, delta));
    }
  };

  const openAlarmModal = (item) => {
    setActiveItem(item);
    const [h, m] = (item.time || '08:00').split(':').map(Number);
    setAmpm(h >= 12 ? '오후' : '오전');
    const displayH = h % 12 === 0 ? 12 : h % 12;
    setHour(String(displayH).padStart(2, '0'));
    setMinute(String(m).padStart(2, '0'));
    setAlarmOn(item.alarmEnabled ?? true);
    setIsAlarmModalOpen(true);
  };

  const saveAlarmSetting = async () => {
    if (!activeItem) return;
    let numericHour = parseInt(hour, 10) || 12;
    if (ampm === '오후' && numericHour < 12) numericHour += 12;
    if (ampm === '오전' && numericHour === 12) numericHour = 0;
    const formattedMinute = String(Math.min(59, Math.max(0, parseInt(minute, 10) || 0))).padStart(2, '0');
    const newTime = `${String(numericHour).padStart(2, '0')}:${formattedMinute}`;

    try {
      const response = await fetch(
        `http://localhost:8080/api/calendar/${activeItem.scheduleId}/alarm?newTime=${newTime}&alarmEnabled=${alarmOn}`,
        { method: 'POST' }
      );
      if (response.ok) {
        setSchedules((prev) =>
          prev.map((s) => (s.scheduleId === activeItem.scheduleId ? { ...s, time: newTime, alarmEnabled: alarmOn } : s))
        );
      }
    } catch (err) {
      console.error("알람 수정 실패:", err);
    }
    setIsAlarmModalOpen(false);
  };

  // 복약 추가 제출 핸들러 (사용자가 선택한 '영양제/상시약' 상태를 화면에 즉시 보장)
  const handleAddMedication = async (e) => {
    e.preventDefault();
    if (!selectedMed) {
      alert('추가할 약을 검색하여 선택해 주세요.');
      return;
    }

    let numericHour = parseInt(newHour, 10) || 12;
    if (newAmpm === '오후' && numericHour < 12) numericHour += 12;
    if (newAmpm === '오전' && numericHour === 12) numericHour = 0;
    const formattedMinute = String(Math.min(59, Math.max(0, parseInt(newMinute, 10) || 0))).padStart(2, '0');
    const formattedTime = `${String(numericHour).padStart(2, '0')}:${formattedMinute}`;

    const savedMedName = selectedMed.name;
    const chosenType = newMedType; // 'supplement' 또는 'regular'

    try {
      const response = await fetch(`/api/calendar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          medicationId: selectedMed.id,
          name: savedMedName,
          type: chosenType,
          scheduledDate: selectedDate,
          scheduledTime: formattedTime,
        }),
      });

      if (response.ok) {
        // 백엔드 반환값과 무관하게 사용자가 등록한 타입을 즉시 화면 상태에 주입
        const tempId = Date.now();
        setSchedules((prev) => [
          ...prev,
          {
            scheduleId: tempId,
            name: savedMedName,
            time: formattedTime,
            type: chosenType,
            takenAt: null,
            alarmEnabled: true,
          }
        ]);

        // 달력 인디케이터 점 즉시 갱신
        setMonthSummary((prev) => {
          const prevStatus = prev[selectedDate] || {};
          return {
            ...prev,
            [selectedDate]: {
              ...prevStatus,
              hasSupplement: chosenType === 'supplement' ? true : prevStatus.hasSupplement,
              hasRegular: chosenType === 'regular' ? true : prevStatus.hasRegular,
            }
          };
        });

        setAddedSuccessMsg(`'${savedMedName}' 등록 완료!`);
        setTimeout(() => setAddedSuccessMsg(''), 2000);

        setSelectedMed(null);
        setNewMedName('');
        setSearchResults([]);
        setIsAddModalOpen(false);
      } else {
        const errorText = await response.text();
        console.error("서버 등록 실패:", errorText);
        alert(`일정 등록 실패: ${errorText}`);
      }
    } catch (err) {
      console.error("일정 등록 통신 실패:", err);
      alert("서버 통신 중 오류가 발생했습니다.");
    }
  };

  const handleCloseAddModal = () => {
    setSelectedMed(null);
    setNewMedName('');
    setSearchResults([]);
    setAddedSuccessMsg('');
    setNewMedType('regular');
    setIsAddModalOpen(false);
  };

  // 달력 날짜 계산
  const firstDayIndex = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();

  const days = [];
  for (let i = 0; i < firstDayIndex; i++) days.push(null);
  for (let d = 1; d <= lastDate; d++) days.push(d);
  const remainingCells = 7 - (days.length % 7);
  if (remainingCells < 7) {
    for (let i = 0; i < remainingCells; i++) days.push(null);
  }

  const sortedList = [...schedules].sort((a, b) => Number(!!a.takenAt) - Number(!!b.takenAt));

  const categoryMap = {
    prescription: { label: '처방약', className: 'cat-prescription' },
    regular: { label: '상시약', className: 'cat-regular' },
    supplement: { label: '영양제', className: 'cat-supplement' },
  };

  return (
    <div className="calendar-page-wrap">
      <header className="page-header">
        <span className="sub-title">MEDICATION CALENDAR</span>
        <h1>복약캘린더</h1>
      </header>

      {/* 메인 캘린더 카드 */}
      <div className="calendar-main-card">
        {/* 좌측 달력 영역 */}
        <div className="calendar-left">
          <div className="cal-nav">
            <div className="month-controls">
              <button onClick={() => changeMonth(-1)}>&lt;</button>
              <h2>{year}년 {month + 1}월</h2>
              <button onClick={() => changeMonth(1)}>&gt;</button>
            </div>
            <button className="btn-today" onClick={handleGoToday}>Today</button>
          </div>

          <div className="cal-week-header">
            {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>

          <div className="cal-grid">
            {days.map((day, idx) => {
              if (day === null) {
                return <div key={`empty-${idx}`} className="cal-cell empty" />;
              }

              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isSelected = selectedDate === dateStr;
              const isToday = getFormattedDate(today) === dateStr;
              const dayStatus = monthSummary[dateStr];

              return (
                <div
                  key={dateStr}
                  className={`cal-cell ${isSelected ? 'selected' : ''} ${isToday ? 'today-cell' : ''}`}
                  onClick={() => setSelectedDate(dateStr)}
                >
                  <span className="day-number">{day}</span>
                  
                  {dayStatus && (
                    <div className="cell-indicators">
                      {dayStatus.hasPrescription && <div className="indicator-bar prescription" />}
                      <div className="indicator-dots">
                        {dayStatus.hasRegular && <div className="indicator-dot regular" />}
                        {dayStatus.hasSupplement && <div className="indicator-dot supplement" />}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="cal-legend">
            <span><i className="legend-bar prescription"></i> 처방약</span>
            <span><i className="legend-dot regular"></i> 상시약</span>
            <span><i className="legend-dot supplement"></i> 영양제</span>
          </div>
        </div>

        {/* 우측 목록 패널 */}
        <div className="calendar-right">
          <div>
            <div className="panel-header">
              <span className="panel-sub">SELECTED DATE</span>
              <h3>{selectedDate.split('-')[1].replace(/^0/, '')}월 {selectedDate.split('-')[2].replace(/^0/, '')}일</h3>
            </div>

            <div className="dose-list">
              {loading ? (
                <div style={{ color: '#7a7066', padding: '20px 0' }}>일정을 불러오는 중입니다...</div>
              ) : sortedList.length === 0 ? (
                <div style={{ color: '#7a7066', padding: '20px 0' }}>복약 일정이 없습니다.</div>
              ) : (
                sortedList.map((item) => {
                  const isTaken = !!item.takenAt;
                  const currentCat = categoryMap[item.type] || { label: '상시약', className: 'cat-regular' };

                  return (
                    <div
                      key={item.scheduleId}
                      className={`dose-item ${isTaken ? 'done' : ''}`}
                    >
                      <input
                        type="checkbox"
                        className="check-box"
                        checked={isTaken}
                        onChange={() => toggleTaken(item)}
                      />

                      <div className="dose-info">
                        <div className="time-row">
                          <span className={`type-dot ${item.type || 'regular'}`} />
                          <span className="time">{item.time}</span>
                        </div>
                        
                        <div className="name-row">
                          <strong
                            className="name"
                            title={item.name}
                            style={{ textDecoration: isTaken ? 'line-through' : 'none' }}
                          >
                            {item.name}
                          </strong>

                          <span className={`category-tag ${currentCat.className}`}>
                            {currentCat.label}
                          </span>
                        </div>
                      </div>

                      {/* 알람 종 & 삭제 버튼 그룹 */}
                      <div className="dose-item-actions">
                        <button
                          className={`btn-alarm ${item.alarmEnabled ? 'active' : ''}`}
                          onClick={() => openAlarmModal(item)}
                          title="알람 시간 설정"
                        >
                          <svg
                            className="bell-icon"
                            viewBox="0 0 24 24"
                            fill={item.alarmEnabled ? "currentColor" : "none"}
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                          </svg>
                        </button>

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

          <button className="btn-add-dose" onClick={() => setIsAddModalOpen(true)}>
            + 이 날짜에 복약 추가
          </button>
        </div>
      </div>

      {/* 모달 1: 알람 시간 설정 */}
      {isAlarmModalOpen && (
        <div className="modal-overlay" onClick={() => setIsAlarmModalOpen(false)}>
          <div className="alarm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h4>복약 알림 시간 설정</h4>
              <button className="btn-close" onClick={() => setIsAlarmModalOpen(false)}>✕</button>
            </div>

            <div className="wheel-picker-box">
              <div className="picker-column" onWheel={(e) => handleWheel(e, 'ampm')}>
                <button onClick={() => setAmpm(ampm === '오전' ? '오후' : '오전')}>▲</button>
                <div className="picker-value clickable" onClick={() => setAmpm(ampm === '오전' ? '오후' : '오전')}>
                  {ampm}
                </div>
                <button onClick={() => setAmpm(ampm === '오전' ? '오후' : '오전')}>▼</button>
              </div>

              <div className="picker-divider" />

              <div className="picker-column" onWheel={(e) => handleWheel(e, 'hour')}>
                <button onClick={() => setHour((prev) => stepHour(prev, 1))}>▲</button>
                <input
                  type="text"
                  className="picker-input"
                  maxLength={2}
                  value={hour}
                  onChange={(e) => setHour(e.target.value.replace(/[^0-9]/g, ''))}
                  onBlur={() => {
                    let n = parseInt(hour, 10);
                    if (isNaN(n) || n < 1) n = 1;
                    if (n > 12) n = 12;
                    setHour(String(n).padStart(2, '0'));
                  }}
                />
                <button onClick={() => setHour((prev) => stepHour(prev, -1))}>▼</button>
              </div>

              <div className="picker-divider" />

              <div className="picker-column" onWheel={(e) => handleWheel(e, 'minute')}>
                <button onClick={() => setMinute((prev) => stepMinute(prev, 1))}>▲</button>
                <input
                  type="text"
                  className="picker-input"
                  maxLength={2}
                  value={minute}
                  onChange={(e) => setMinute(e.target.value.replace(/[^0-9]/g, ''))}
                  onBlur={() => {
                    let n = parseInt(minute, 10);
                    if (isNaN(n) || n < 0) n = 0;
                    if (n > 59) n = 59;
                    setMinute(String(n).padStart(2, '0'));
                  }}
                />
                <button onClick={() => setMinute((prev) => stepMinute(prev, -1))}>▼</button>
              </div>
            </div>

            <div className="alarm-toggle-row">
              <span>이 시간에 알람 받기</span>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={alarmOn}
                  onChange={(e) => setAlarmOn(e.target.checked)}
                />
                <span className="slider"></span>
              </label>
            </div>

            <div className="modal-actions">
              <button className="btn-confirm" onClick={saveAlarmSetting}>확인</button>
            </div>
          </div>
        </div>
      )}

      {/* 모달 2: 이 날짜에 복약 추가 */}
      {isAddModalOpen && (
        <div className="modal-overlay" onClick={handleCloseAddModal}>
          <div className="add-med-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h4>복약 일정 추가</h4>
              <button className="btn-close" onClick={handleCloseAddModal}>✕</button>
            </div>

            <form onSubmit={handleAddMedication}>
              <div className="form-group">
                <label>약 이름 검색</label>
                <div className="search-input-wrapper">
                  <input
                    type="text"
                    placeholder={selectedMed ? "다른 약으로 변경하려면 검색하세요" : "약 이름을 입력하세요 (예: 비타민, 아모잘탄)"}
                    value={newMedName}
                    onChange={(e) => setNewMedName(e.target.value)}
                    autoComplete="off"
                    autoFocus
                  />
                  {searchResults.length > 0 && (
                    <ul className="search-results-dropdown">
                      {searchResults.map((item) => (
                        <li
                          key={item.medicationId}
                          className="search-result-item"
                          onClick={() => handleSelectMed(item)}
                        >
                          {item.itemName}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {selectedMed && (
                  <div className="selected-med-chip">
                    <span className="chip-name" title={selectedMed.name}>
                      {selectedMed.name}
                    </span>
                    <button
                      type="button"
                      className="btn-remove-chip"
                      onClick={handleRemoveSelectedMed}
                      title="선택 취소"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>

              {/* 분류: 상시약 & 영양제 */}
              <div className="form-group">
                <label>분류</label>
                <div className="category-select-group">
                  <button
                    type="button"
                    className={`cat-btn ${newMedType === 'regular' ? 'active reg' : ''}`}
                    onClick={() => setNewMedType('regular')}
                  >
                    상시약
                  </button>
                  <button
                    type="button"
                    className={`cat-btn ${newMedType === 'supplement' ? 'active sup' : ''}`}
                    onClick={() => setNewMedType('supplement')}
                  >
                    영양제
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label>복용 시간</label>
                <div className="wheel-picker-box add-picker">
                  <div className="picker-column" onWheel={(e) => handleWheel(e, 'ampm', true)}>
                    <button type="button" onClick={() => setNewAmpm(newAmpm === '오전' ? '오후' : '오전')}>▲</button>
                    <div className="picker-value clickable" onClick={() => setNewAmpm(newAmpm === '오전' ? '오후' : '오전')}>
                      {newAmpm}
                    </div>
                    <button type="button" onClick={() => setNewAmpm(newAmpm === '오전' ? '오후' : '오전')}>▼</button>
                  </div>

                  <div className="picker-divider" />

                  <div className="picker-column" onWheel={(e) => handleWheel(e, 'hour', true)}>
                    <button type="button" onClick={() => setNewHour((prev) => stepHour(prev, 1))}>▲</button>
                    <input
                      type="text"
                      className="picker-input"
                      maxLength={2}
                      value={newHour}
                      onChange={(e) => setNewHour(e.target.value.replace(/[^0-9]/g, ''))}
                      onBlur={() => {
                        let n = parseInt(newHour, 10);
                        if (isNaN(n) || n < 1) n = 1;
                        if (n > 12) n = 12;
                        setNewHour(String(n).padStart(2, '0'));
                      }}
                    />
                    <button type="button" onClick={() => setNewHour((prev) => stepHour(prev, -1))}>▼</button>
                  </div>

                  <div className="picker-divider" />

                  <div className="picker-column" onWheel={(e) => handleWheel(e, 'minute', true)}>
                    <button type="button" onClick={() => setNewMinute((prev) => stepMinute(prev, 1))}>▲</button>
                    <input
                      type="text"
                      className="picker-input"
                      maxLength={2}
                      value={newMinute}
                      onChange={(e) => setNewMinute(e.target.value.replace(/[^0-9]/g, ''))}
                      onBlur={() => {
                        let n = parseInt(newMinute, 10);
                        if (isNaN(n) || n < 0) n = 0;
                        if (n > 59) n = 59;
                        setNewMinute(String(n).padStart(2, '0'));
                      }}
                    />
                    <button type="button" onClick={() => setNewMinute((prev) => stepMinute(prev, -1))}>▼</button>
                  </div>
                </div>
              </div>

              {addedSuccessMsg && (
                <div className="toast-success-banner">
                  ✓ {addedSuccessMsg}
                </div>
              )}

              <div className="modal-actions-dual">
                <button type="button" className="btn-cancel" onClick={handleCloseAddModal}>
                  닫기
                </button>
                <button type="submit" className="btn-save-med">
                  추가하기
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 모달 3: 화면 정중앙 커스텀 삭제 모달 */}
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
            
            <h4 className="delete-modal-title">복약 일정을 삭제하시겠습니까?</h4>
            
            {itemToDelete && (
              <p className="delete-modal-target">
                [{itemToDelete.time}] <strong>{itemToDelete.name}</strong>
              </p>
            )}
            
            <p className="delete-modal-desc">삭제된 복약 기록은 되돌릴 수 없습니다.</p>

            <div className="delete-modal-actions">
              <button 
                type="button" 
                className="btn-modal-cancel" 
                onClick={() => setIsDeleteModalOpen(false)}
              >
                취소
              </button>
              <button 
                type="button" 
                className="btn-modal-delete" 
                onClick={confirmDeleteSchedule}
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}