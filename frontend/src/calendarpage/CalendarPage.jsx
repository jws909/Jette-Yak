import React, { useState, useEffect } from 'react';
import './CalendarPage.css';

// 날짜 포맷 유틸리티 (YYYY-MM-DD)
const getFormattedDate = (targetDate) => {
  const y = targetDate.getFullYear();
  const m = String(targetDate.getMonth() + 1).padStart(2, '0');
  const d = String(targetDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export default function CalendarPage() {
  const today = new Date();
  
  // 현재 보고 있는 달력의 연/월 (실제 오늘 기준)
  const [currentDate, setCurrentDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  // 선택된 날짜 (기본값: 오늘)
  const [selectedDate, setSelectedDate] = useState(getFormattedDate(today));
  // 백엔드에서 가져온 복약 목록 데이터
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(false);

  // 알람 시간 수정 모달
  const [isAlarmModalOpen, setIsAlarmModalOpen] = useState(false);
  const [activeItem, setActiveItem] = useState(null);
  const [ampm, setAmpm] = useState('오전');
  const [hour, setHour] = useState('08');
  const [minute, setMinute] = useState('00');
  const [alarmOn, setAlarmOn] = useState(true);

  // 복약 추가 모달
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newMedName, setNewMedName] = useState('');
  const [newMedType, setNewMedType] = useState('prescription');
  const [newAmpm, setNewAmpm] = useState('오전');
  const [newHour, setNewHour] = useState('09');
  const [newMinute, setNewMinute] = useState('00');

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // ★ 선택된 날짜가 바뀌거나, 월이 바뀔 때 백엔드 자동 조회
  const fetchDailySchedules = async (targetDateStr) => {
    setLoading(true);
    try {
      // 백엔드 CalendarController 연동
      const response = await fetch(`http://localhost:8080/api/calendar?userId=1&date=${targetDateStr}`);
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
  };

  useEffect(() => {
    fetchDailySchedules(selectedDate);
  }, [selectedDate]);

  // 이전달 / 다음달 이동
  const changeMonth = (offset) => {
    setCurrentDate(new Date(year, month + offset, 1));
  };

  // 오늘(Today)로 즉시 돌아가기
  const handleGoToday = () => {
    const now = new Date();
    setCurrentDate(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDate(getFormattedDate(now));
  };

  // 체크박스 클릭 (복용 완료 토글) -> 백엔드 업데이트 후 자동 재조회
  const toggleTaken = async (item) => {
    const isTaken = !item.takenAt;
    try {
      const response = await fetch(`http://localhost:8080/api/calendar/${item.scheduleId}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taken: isTaken }),
      });
      if (response.ok) {
        fetchDailySchedules(selectedDate);
      }
    } catch (err) {
      console.error("체크박스 토글 실패:", err);
    }
  };

  // 알람 시간 증감 유틸리티 (1분 단위, 마우스 휠)
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

  // 알람 모달 열기
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

  // 알람 시간 저장 -> 백엔드 업데이트 후 자동 재조회
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
        fetchDailySchedules(selectedDate);
      }
    } catch (err) {
      console.error("알람 수정 실패:", err);
    }
    setIsAlarmModalOpen(false);
  };

  // 새 복약 일정 추가 -> 백엔드 저장 후 자동 재조회
  const handleAddMedication = async (e) => {
    e.preventDefault();
    if (!newMedName.trim()) {
      alert('약 이름을 입력해 주세요.');
      return;
    }

    let numericHour = parseInt(newHour, 10) || 12;
    if (newAmpm === '오후' && numericHour < 12) numericHour += 12;
    if (newAmpm === '오전' && numericHour === 12) numericHour = 0;
    const formattedMinute = String(Math.min(59, Math.max(0, parseInt(newMinute, 10) || 0))).padStart(2, '0');
    const formattedTime = `${String(numericHour).padStart(2, '0')}:${formattedMinute}`;

    try {
      const response = await fetch(`http://localhost:8080/api/calendar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 1,
          name: newMedName.trim(),
          type: newMedType,
          scheduledDate: selectedDate,
          scheduledTime: formattedTime,
        }),
      });
      if (response.ok) {
        fetchDailySchedules(selectedDate);
      }
    } catch (err) {
      console.error("일정 등록 실패:", err);
    }

    setNewMedName('');
    setNewMedType('prescription');
    setNewAmpm('오전');
    setNewHour('09');
    setNewMinute('00');
    setIsAddModalOpen(false);
  };

  // ★ 자동 달력 요일 및 날짜 그리드 생성
  const firstDayIndex = new Date(year, month, 1).getDay(); // 해당 월 1일의 요일
  const lastDate = new Date(year, month + 1, 0).getDate(); // 해당 월 말일

  const days = [];
  for (let i = 0; i < firstDayIndex; i++) {
    days.push(null);
  }
  for (let d = 1; d <= lastDate; d++) {
    days.push(d);
  }
  const remainingCells = 7 - (days.length % 7);
  if (remainingCells < 7) {
    for (let i = 0; i < remainingCells; i++) {
      days.push(null);
    }
  }

  // 복용 미완료 우선 정렬
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

      <div className="calendar-main-card">
        {/* 좌측 달력 */}
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

              return (
                <div
                  key={dateStr}
                  className={`cal-cell ${isSelected ? 'selected' : ''} ${isToday ? 'today-cell' : ''}`}
                  onClick={() => setSelectedDate(dateStr)}
                >
                  <span className="day-number">{day}</span>
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

        {/* 우측 상세 목록 패널 */}
        <div className="calendar-right">
          <div className="panel-header">
            <span className="panel-sub">SELECTED DATE</span>
            <h3>{selectedDate.split('-')[1].replace(/^0/, '')}월 {selectedDate.split('-')[2].replace(/^0/, '')}일</h3>
          </div>

          <div className="dose-list">
            {loading ? (
              <div style={{ color: '#888', padding: '20px 0' }}>일정을 불러오는 중입니다...</div>
            ) : sortedList.length === 0 ? (
              <div style={{ color: '#aaa', padding: '20px 0' }}>복약 일정이 없습니다.</div>
            ) : (
              sortedList.map((item) => {
                const isTaken = !!item.takenAt;
                const currentCat = categoryMap[item.type] || { label: '처방약', className: 'cat-prescription' };

                return (
                  <div key={item.scheduleId} className={`dose-item ${isTaken ? 'done' : ''}`}>
                    <input
                      type="checkbox"
                      className="check-box"
                      checked={isTaken}
                      onChange={() => toggleTaken(item)}
                    />

                    <div className="dose-info">
                      <div className="time-row">
                        <span className={`type-dot ${item.type || 'prescription'}`} />
                        <span className="time">{item.time}</span>
                      </div>
                      <div className="name-row">
                        <strong className="name">{item.name}</strong>
                        <span className={`category-tag ${currentCat.className}`}>
                          {currentCat.label}
                        </span>
                      </div>
                    </div>

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
                  </div>
                );
              })
            )}
          </div>

          <button className="btn-add-dose" onClick={() => setIsAddModalOpen(true)}>
            + 이 날짜에 복약 추가
          </button>
        </div>
      </div>

      {/* 모달 1: 알람 시간 수정 */}
      {isAlarmModalOpen && (
        <div className="modal-overlay">
          <div className="alarm-modal">
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
        <div className="modal-overlay">
          <div className="add-med-modal">
            <div className="modal-header">
              <h4>복약 일정 추가</h4>
              <button className="btn-close" onClick={() => setIsAddModalOpen(false)}>✕</button>
            </div>

            <form onSubmit={handleAddMedication}>
              <div className="form-group">
                <label>약 이름</label>
                <input
                  type="text"
                  placeholder="예: 타이레놀, 비타민C"
                  value={newMedName}
                  onChange={(e) => setNewMedName(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label>분류</label>
                <div className="category-select-group">
                  <button
                    type="button"
                    className={`cat-btn ${newMedType === 'prescription' ? 'active pres' : ''}`}
                    onClick={() => setNewMedType('prescription')}
                  >
                    처방약
                  </button>
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

              <div className="modal-actions">
                <button type="submit" className="btn-save-med">추가하기</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}