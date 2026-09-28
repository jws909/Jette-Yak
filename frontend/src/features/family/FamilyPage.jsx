import React, { useState } from 'react';
import './FamilyPage.css';

export default function FamilyPage() {
  const [filter, setFilter] = useState('all'); // all, son, daughter
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [checklist, setChecklist] = useState([
    { id: 1, member: '아들', memberClass: 'son', time: '08:00', name: '세파클러 건조시럽 (3.5ml)', desc: '아침 식후 30분', taken: true },
    { id: 2, member: '딸', memberClass: 'daughter', time: '08:30', name: '유산균 키즈 츄어블', desc: '식전 1정 복용', taken: false },
    { id: 3, member: '아들', memberClass: 'son', time: '13:00', name: '맥시부펜 시럽 (5.0ml)', desc: '발열 38℃ 이상 시 투약', taken: false },
  ]);

  const handleToggle = (id) => {
    setChecklist(prev => prev.map(item => item.id === id ? { ...item, taken: !item.taken } : item));
  };

  const filteredItems = checklist.filter(item => {
    if (filter === 'son') return item.member === '아들';
    if (filter === 'daughter') return item.member === '딸';
    return true;
  });

  return (
    <div className="family-page-wrapper">
      {/* 1. 상단 컨트롤 영역 (스케치 상단 칩 및 액션 버튼) */}
      <div className="family-header">
        <span className="family-subtitle">Family Care</span>
        <div className="family-controls">
          <div className="family-chips-group">
            <button 
              className={`family-chip ${filter === 'all' ? 'selected' : ''}`}
              onClick={() => setFilter('all')}
            >
              전체
            </button>
            <button 
              className={`family-chip ${filter === 'son' ? 'selected' : ''}`}
              onClick={() => setFilter('son')}
            >
              아들
            </button>
            <button 
              className={`family-chip ${filter === 'daughter' ? 'selected' : ''}`}
              onClick={() => setFilter('daughter')}
            >
              딸
            </button>
          </div>

          <div className="family-action-buttons">
            <button className="family-btn-outline">+ 가족등록</button>
            <button className="family-btn-primary" onClick={() => setIsReportOpen(true)}>보고서</button>
          </div>
        </div>
      </div>

      {/* 2. 캘린더 영역 (스케치 첫 번째 큰 박스) */}
      <div className="family-card">
        <div className="calendar-nav">
          <div className="calendar-month-selector">
            <button className="calendar-arrow-btn">&lt;</button>
            <span>2026년 9월</span>
            <button className="calendar-arrow-btn">&gt;</button>
          </div>
          <button className="calendar-today-btn">Today</button>
        </div>

        <div className="calendar-weekdays">
          <span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span>
        </div>

        <div className="calendar-grid">
          {/* 일자 셀 예시 */}
          {[20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 1, 2, 3].map((day, idx) => (
            <div key={idx} className={`calendar-day-cell ${day === 27 && idx === 7 ? 'selected' : ''}`}>
              <span className="day-num">{day}</span>
              <div className="pill-bars-container">
                {idx >= 1 && idx <= 5 && <div className="pill-bar son" title="아들 투약" />}
                {idx >= 0 && idx <= 8 && <div className="pill-bar daughter" title="딸 투약" />}
              </div>
            </div>
          ))}
        </div>

        <div className="calendar-legend">
          <div className="legend-item"><span className="legend-dot son"></span> 아들 일정</div>
          <div className="legend-item"><span className="legend-dot daughter"></span> 딸 일정</div>
        </div>
      </div>

      {/* 3. Today 체크리스트 영역 (스케치 두 번째 큰 박스) */}
      <div className="family-card">
        <div className="checklist-header">
          <h3 className="checklist-title">today 체크리스트</h3>
          <span className="checklist-date">2026.09.27 (일)</span>
        </div>

        <div className="checklist-items">
          {filteredItems.map(item => (
            <div key={item.id} className="checklist-row">
              <div className="checklist-info-group">
                <span className={`member-tag ${item.memberClass}`}>{item.member}</span>
                <span className="checklist-time">{item.time}</span>
                <div>
                  <p className={`checklist-med-name ${item.taken ? 'completed' : ''}`}>{item.name}</p>
                  <p className="checklist-med-desc">{item.desc}</p>
                </div>
              </div>
              <button 
                className={`toggle-switch ${item.taken ? 'checked' : ''}`}
                onClick={() => handleToggle(item.id)}
              >
                <div className="toggle-handle" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 4. [보고서] 클릭 시 열리는 진료 브리핑 모달 */}
      {isReportOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#2b2523' }}>
                🩺 진료 브리핑 보고서
              </h3>
              <button className="modal-close-btn" onClick={() => setIsReportOpen(false)}>✕</button>
            </div>
            <div style={{ fontSize: '13.5px', color: '#4a413a', lineHeight: 1.6 }}>
              <p><strong>환자:</strong> 아들 (김민우 / 만 4세)</p>
              <p><strong>복용 중인 약:</strong> 세파클러 건조시럽 (4일째 투약 중)</p>
              <p><strong>최근 투약:</strong> 오늘 08:15 완료</p>
            </div>
            <div className="survey-actions" style={{ marginTop: '20px' }}>
              <button className="survey-submit-btn" onClick={() => setIsReportOpen(false)}>
                확인 완료
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}