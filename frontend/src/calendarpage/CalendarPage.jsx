import React, { useState, useEffect, useCallback } from 'react';
import './CalendarPage.css';

function getFormattedDate(targetDate) {
  const y = targetDate.getFullYear();
  const m = String(targetDate.getMonth() + 1).padStart(2, '0');
  const d = String(targetDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getTypeStorageMap() {
  try {
    return JSON.parse(localStorage.getItem('cal_type_overrides') || '{}');
  } catch (e) {
    return {};
  }
}

function saveTypeOverride(key, type) {
  try {
    const map = getTypeStorageMap();
    map[key] = type;
    localStorage.setItem('cal_type_overrides', JSON.stringify(map));
  } catch (e) {
    console.warn('Type override save error', e);
  }
}

const CalendarPage = (props) => {
  const user = props.user;
  const today = new Date();
  const currentUserId = (user && user.userId) ? user.userId : null;
  
  const [currentDate, setCurrentDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(getFormattedDate(today));
  const [schedules, setSchedules] = useState([]);
  const [monthSummary, setMonthSummary] = useState({});
  const [loading, setLoading] = useState(false);

  // 알람 설정 모달 (시간 변경 전용)
  const [isAlarmModalOpen, setIsAlarmModalOpen] = useState(false);
  const [activeItem, setActiveItem] = useState(null);
  const [ampm, setAmpm] = useState('오전');
  const [hour, setHour] = useState('08');
  const [minute, setMinute] = useState('00');

  // 일정 추가 모달
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newMedName, setNewMedName] = useState('');
  const [selectedMed, setSelectedMed] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [newMedType, setNewMedType] = useState('regular'); // 'regular' | 'supplement'
  const [newAmpm, setNewAmpm] = useState('오전');
  const [newHour, setNewHour] = useState('09');
  const [newMinute, setNewMinute] = useState('00');
  const [addedSuccessMsg, setAddedSuccessMsg] = useState('');

  // 삭제 확인 모달
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const currentYearMonth = `${year}-${String(month + 1).padStart(2, '0')}`;

  // 1. 월별 요약 조회 (비로그인 시 빈 객체 처리)
  const fetchMonthSummary = useCallback(async () => {
    if (!currentUserId) {
      setMonthSummary({});
      return;
    }
    try {
      const res = await fetch(`/api/calendar/summary?userId=${currentUserId}&yearMonth=${currentYearMonth}`);
      if (res.ok) {
        const list = await res.json();
        const map = {};
        const overrides = getTypeStorageMap();

        list.forEach((item) => {
          map[item.scheduleDate] = {
            hasPrescription: Number(item.hasPrescription) === 1,
            hasRegular: Number(item.hasRegular) === 1,
            hasSupplement: Number(item.hasSupplement) === 1,
          };
        });

        Object.keys(overrides).forEach((key) => {
          const parts = key.split('_');
          const d = parts[0];
          const t = parts[3];
          if (t === 'supplement' && d.startsWith(currentYearMonth)) {
            if (!map[d]) {
              map[d] = { hasPrescription: false, hasRegular: false, hasSupplement: true };
            } else {
              map[d].hasSupplement = true;
            }
          }
        });

        setMonthSummary(map);
      }
    } catch (err) {
      console.error("월별 요약 조회 실패:", err);
    }
  }, [currentYearMonth, currentUserId]);

  // 2. 일별 일정 목록 조회 (비로그인 시 빈 배열 처리)
  const fetchDailySchedules = useCallback(async (targetDateStr) => {
    if (!currentUserId) {
      setSchedules([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/calendar?userId=${currentUserId}&date=${targetDateStr}`);
      if (response.ok) {
        const data = await response.json();
        const overrides = getTypeStorageMap();

        const normalized = data.map((item) => {
          const formattedT = String(item.time || '').substring(0, 5);
          const overrideKey = `${targetDateStr}_${item.name}_${formattedT}_supplement`;
          const idKey = `id_${item.scheduleId}`;

          const isSup = overrides[overrideKey] === 'supplement' || overrides[idKey] === 'supplement' || item.type === 'supplement';
          return {
            ...item,
            time: formattedT,
            type: isSup ? 'supplement' : (item.type || 'regular'),
          };
        });

        setSchedules(normalized);
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

  // 약품 자동완성 검색
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
    setSelectedMed({ id: med.medicationId, name: med.itemName });
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

  // 복용 체크박스 토글
  const toggleTaken = async (item) => {
    if (!currentUserId) {
      alert('로그인 후 복약 체크 기능을 이용할 수 있습니다.');
      return;
    }
    const isTaken = !item.takenAt;
    try {
      const response = await fetch(`/api/calendar/${item.scheduleId}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taken: isTaken }),
      });

      if (response.ok) {
        setSchedules((prev) =>
          prev.map((s) =>
            s.scheduleId === item.scheduleId
              ? { ...s, takenAt: isTaken ? new Date().toISOString() : null }
              : s
          )
        );
      }
    } catch (err) {
      console.error("체크박스 토글 실패:", err);
    }
  };

  // 삭제 모달 열기
  const openDeleteModal = (item, e) => {
    e.stopPropagation();
    if (!currentUserId) {
      alert('로그인 후 일정을 삭제할 수 있습니다.');
      return;
    }
    setItemToDelete(item);
    setIsDeleteModalOpen(true);
  };

  // 삭제 확정
  const confirmDeleteSchedule = async () => {
    if (!itemToDelete) return;
    try {
      const response = await fetch(`/api/calendar/${itemToDelete.scheduleId}/delete`, {
        method: 'POST',
      });
      if (response.ok) {
        try {
          const map = getTypeStorageMap();
          delete map[`id_${itemToDelete.scheduleId}`];
          delete map[`${selectedDate}_${itemToDelete.name}_${itemToDelete.time}_supplement`];
          localStorage.setItem('cal_type_overrides', JSON.stringify(map));
        } catch (e) {}

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

  // 알람 시간 설정 모달 열기
  const openAlarmModal = (item, e) => {
    if (e) e.stopPropagation();
    if (!currentUserId) {
      alert('로그인 후 알람 시간을 수정할 수 있습니다.');
      return;
    }
    setActiveItem(item);
    const timeParts = (item.time || '08:00').split(':');
    const h = parseInt(timeParts[0], 10) || 8;
    const m = parseInt(timeParts[1], 10) || 0;
    setAmpm(h >= 12 ? '오후' : '오전');
    const displayH = h % 12 === 0 ? 12 : h % 12;
    setHour(String(displayH).padStart(2, '0'));
    setMinute(String(m).padStart(2, '0'));
    setIsAlarmModalOpen(true);
  };

  // 알람 시간 저장 (빈 응답 대응: await response.json() 배제)
  const saveAlarmSetting = async () => {
    if (!activeItem) return;
    let numericHour = parseInt(hour, 10) || 12;
    if (ampm === '오후' && numericHour < 12) numericHour += 12;
    if (ampm === '오전' && numericHour === 12) numericHour = 0;
    const formattedMinute = String(Math.min(59, Math.max(0, parseInt(minute, 10) || 0))).padStart(2, '0');
    const newTime = `${String(numericHour).padStart(2, '0')}:${formattedMinute}`;

    try {
      const response = await fetch(
        `/api/calendar/${activeItem.scheduleId}/alarm?newTime=${encodeURIComponent(newTime)}&alarmEnabled=true`,
        {
          method: 'POST',
        }
      );

      if (response.ok) {
        setSchedules((prev) =>
          prev.map((s) =>
            s.scheduleId === activeItem.scheduleId
              ? { ...s, time: newTime }
              : s
          )
        );
      } else {
        alert('알람 시간을 저장하지 못했습니다.');
      }
    } catch (err) {
      console.error("알람 시간 수정 실패:", err);
      alert('서버 통신 중 오류가 발생했습니다.');
    } finally {
      setIsAlarmModalOpen(false);
    }
  };

  // 신규 등록 제출
  const handleAddMedication = async (e) => {
    e.preventDefault();
    if (!currentUserId) {
      alert('로그인 후 복약 일정을 등록할 수 있습니다.');
      return;
    }

    if (newMedType === 'regular') {
      // 상시약: medications에 존재하는 약을 검색하여 선택 필수!
      if (!selectedMed || !selectedMed.id) {
        alert('상시약은 의약품 검색 목록에서 약을 선택해야 등록할 수 있습니다.\n목록에 없는 약품은 상시약으로 등록할 수 없습니다.');
        return;
      }
    } else if (newMedType === 'supplement') {
      // 영양제: 검색 선택 또는 직접 입력
      const supName = selectedMed ? selectedMed.name : newMedName.trim();
      if (!supName) {
        alert('영양제 이름을 입력하거나 검색하여 선택해 주세요.');
        return;
      }
    }

    let numericHour = parseInt(newHour, 10) || 12;
    if (newAmpm === '오후' && numericHour < 12) numericHour += 12;
    if (newAmpm === '오전' && numericHour === 12) numericHour = 0;
    const formattedMinute = String(Math.min(59, Math.max(0, parseInt(newMinute, 10) || 0))).padStart(2, '0');
    const formattedTime = `${String(numericHour).padStart(2, '0')}:${formattedMinute}`;

    const savedMedName = selectedMed ? selectedMed.name : newMedName.trim();
    const chosenType = newMedType;

    try {
      const response = await fetch(`/api/calendar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          name: savedMedName,
          medicationId: selectedMed ? selectedMed.id : null,
          type: chosenType,
          scheduledDate: selectedDate,
          scheduledTime: formattedTime,
          alarmEnabled: 1,
        }),
      });

      if (response.ok) {
        await fetchDailySchedules(selectedDate);
        await fetchMonthSummary();

        setAddedSuccessMsg(`'${savedMedName}' 등록 완료!`);
        setTimeout(() => setAddedSuccessMsg(''), 2000);

        setSelectedMed(null);
        setNewMedName('');
        setSearchResults([]);
        setIsAddModalOpen(false);
      } else {
        const errorText = await response.text().catch(() => '');
        alert('일정 등록에 실패했습니다.' + (errorText ? ` (${errorText})` : ''));
      }
    } catch (err) {
      console.error("일정 등록 실패:", err);
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

      <div className="calendar-main-card">
        {/* 달력 영역 */}
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
              if (day === null) return <div key={`empty-${idx}`} className="cal-cell empty" />;

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

        {/* 일정 목록 패널 */}
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
                    <div key={item.scheduleId} className={`dose-item ${isTaken ? 'done' : ''}`}>
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

                      <div className="dose-item-actions">
                        <button
                          type="button"
                          className="btn-alarm"
                          onClick={(e) => openAlarmModal(item, e)}
                          title="알람 시간 설정"
                        >
                          <svg
                            className="bell-icon"
                            viewBox="0 0 24 24"
                            fill="none"
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

          <button
            className="btn-add-dose"
            onClick={() => {
              if (!currentUserId) {
                alert('로그인 후 복약 일정을 추가할 수 있습니다.');
                return;
              }
              setIsAddModalOpen(true);
            }}
          >
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
                <button type="button" onClick={() => setAmpm(ampm === '오전' ? '오후' : '오전')}>▲</button>
                <div className="picker-value clickable" onClick={() => setAmpm(ampm === '오전' ? '오후' : '오전')}>
                  {ampm}
                </div>
                <button type="button" onClick={() => setAmpm(ampm === '오전' ? '오후' : '오전')}>▼</button>
              </div>

              <div className="picker-divider" />

              <div className="picker-column" onWheel={(e) => handleWheel(e, 'hour')}>
                <button type="button" onClick={() => setHour((prev) => stepHour(prev, 1))}>▲</button>
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
                <button type="button" onClick={() => setHour((prev) => stepHour(prev, -1))}>▼</button>
              </div>

              <div className="picker-divider" />

              <div className="picker-column" onWheel={(e) => handleWheel(e, 'minute')}>
                <button type="button" onClick={() => setMinute((prev) => stepMinute(prev, 1))}>▲</button>
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
                <button type="button" onClick={() => setMinute((prev) => stepMinute(prev, -1))}>▼</button>
              </div>
            </div>

            <div className="modal-actions">
              <button type="button" className="btn-confirm" onClick={saveAlarmSetting}>확인</button>
            </div>
          </div>
        </div>
      )}

      {/* 모달 2: 일정 추가 */}
      {isAddModalOpen && (
        <div className="modal-overlay" onClick={handleCloseAddModal}>
          <div className="add-med-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h4>복약 일정 추가</h4>
              <button className="btn-close" onClick={handleCloseAddModal}>✕</button>
            </div>

            <form onSubmit={handleAddMedication}>
              <div className="form-group">
                <label>분류</label>
                <div className="category-select-group">
                  <button
                    type="button"
                    className={`cat-btn ${newMedType === 'regular' ? 'active reg' : ''}`}
                    onClick={() => {
                      setNewMedType('regular');
                      setSelectedMed(null);
                      setNewMedName('');
                    }}
                  >
                    상시약
                  </button>
                  <button
                    type="button"
                    className={`cat-btn ${newMedType === 'supplement' ? 'active sup' : ''}`}
                    onClick={() => {
                      setNewMedType('supplement');
                    }}
                  >
                    영양제
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label>
                  {newMedType === 'regular' ? '의약품 검색 (필수 선택)' : '영양제 이름 (검색 또는 직접 입력)'}
                </label>
                <div className="search-input-wrapper">
                  <input
                    type="text"
                    placeholder={
                      selectedMed
                        ? "선택 취소 후 다시 검색할 수 있습니다"
                        : newMedType === 'regular'
                        ? "의약품 이름을 검색하여 선택하세요 (예: 타이레놀, 아모잘탄)"
                        : "영양제 이름을 입력하거나 검색하세요 (예: 루테인, 비타민C)"
                    }
                    value={selectedMed ? selectedMed.name : newMedName}
                    onChange={(e) => {
                      if (selectedMed) setSelectedMed(null);
                      setNewMedName(e.target.value);
                    }}
                    autoComplete="off"
                    autoFocus
                  />
                  {searchResults.length > 0 && !selectedMed && (
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

                {selectedMed ? (
                  <div className="selected-med-chip">
                    <span className="chip-name" title={selectedMed.name}>
                      선택됨: {selectedMed.name}
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
                ) : newMedType === 'regular' ? (
                  <p className="field-hint-warning">
                    상시약은 의약품(medications) 목록에서 검색하여 선택해야 등록 가능합니다.
                  </p>
                ) : (
                  <p className="field-hint-info">
                    영양제는 검색 목록에서 선택하거나 직접 이름을 입력하여 등록할 수 있습니다.
                  </p>
                )}
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
                        setMinute(String(n).padStart(2, '0'));
                      }}
                    />
                    <button type="button" onClick={() => setNewMinute((prev) => stepMinute(prev, -1))}>▼</button>
                  </div>
                </div>
              </div>

              {addedSuccessMsg && (
                <div className="toast-success-banner">✓ {addedSuccessMsg}</div>
              )}

              <div className="modal-actions-dual">
                <button type="button" className="btn-cancel" onClick={handleCloseAddModal}>닫기</button>
                <button type="submit" className="btn-save-med">추가하기</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 모달 3: 삭제 확인 */}
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
              <p className="delete-modal-target">[{itemToDelete.time}] <strong>{itemToDelete.name}</strong></p>
            )}
            <p className="delete-modal-desc">삭제된 복약 기록은 되돌릴 수 없습니다.</p>

            <div className="delete-modal-actions">
              <button type="button" className="btn-modal-cancel" onClick={() => setIsDeleteModalOpen(false)}>취소</button>
              <button type="button" className="btn-modal-delete" onClick={confirmDeleteSchedule}>삭제</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarPage;