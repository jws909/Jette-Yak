import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import './DatePicker.css';

/**
 * 날짜 문자열(YYYY-MM-DD)을 년, 월, 일 숫자로 분해
 */
function parseDateParts(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const match = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10); // 1-12
  const day = parseInt(match[3], 10);
  return { year, month, day };
}

/**
 * 년, 월, 일 숫자를 'YYYY-MM-DD' 형식의 문자열로 변환
 */
function formatDateString(year, month, day) {
  const y = String(year).padStart(4, '0');
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const WEEKDAYS = [
  { label: '일', isSunday: true },
  { label: '월' },
  { label: '화' },
  { label: '수' },
  { label: '목' },
  { label: '금' },
  { label: '토', isSaturday: true },
];

/**
 * 연/월 빠른 선택이 가능한 공용 DatePicker 컴포넌트
 */
export default function DatePicker({
  value = '',
  onChange,
  name,
  id,
  placeholder = 'YYYY-MM-DD',
  min = '1920-01-01',
  max,
  minYear = 1920,
  maxYear,
  disabled = false,
  required = false,
  className = '',
  style = {},
  showClear = true,
  yearOrder = 'desc', // 생년월일 입력에 직관적인 최신순 기본값
  title = '날짜 선택',
}) {
  const containerRef = useRef(null);
  const popoverRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 320, isMobile: false });

  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(
    () => formatDateString(today.getFullYear(), today.getMonth() + 1, today.getDate()),
    [today]
  );

  // 연도 범위 결정
  const effectiveMaxYear = useMemo(() => {
    if (maxYear) return maxYear;
    if (max) {
      const p = parseDateParts(max);
      if (p) return p.year;
    }
    return today.getFullYear() + 5;
  }, [maxYear, max, today]);

  const effectiveMinYear = useMemo(() => {
    if (minYear) return minYear;
    if (min) {
      const p = parseDateParts(min);
      if (p) return p.year;
    }
    return 1920;
  }, [minYear, min]);

  // 파싱된 선택 값
  const parsedValue = useMemo(() => parseDateParts(value), [value]);

  // 달력에서 현재 바라보고 있는 연도 및 월 (월: 1~12)
  const [viewYear, setViewYear] = useState(() => parsedValue?.year || today.getFullYear());
  const [viewMonth, setViewMonth] = useState(() => parsedValue?.month || today.getMonth() + 1);

  // value가 외부에서 변경될 경우 view 동기화
  useEffect(() => {
    if (parsedValue) {
      setViewYear(parsedValue.year);
      setViewMonth(parsedValue.month);
    }
  }, [parsedValue]);

  // 연도 목록 생성
  const yearOptions = useMemo(() => {
    const list = [];
    for (let y = effectiveMinYear; y <= effectiveMaxYear; y++) {
      list.push(y);
    }
    return yearOrder === 'desc' ? list.reverse() : list;
  }, [effectiveMinYear, effectiveMaxYear, yearOrder]);

  // 팝오버 위치 계산
  const updateCoords = useCallback(() => {
    if (!containerRef.current) return;
    const isMobile = window.innerWidth <= 600;
    if (isMobile) {
      setCoords({ isMobile: true, top: 0, left: 0, width: 320 });
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const popoverWidth = 320;
    const popoverHeight = 360;

    let top = rect.bottom + window.scrollY + 6;
    let left = rect.left + window.scrollX;

    // 우측 화면 밖으로 넘치면 조정
    if (left + popoverWidth > window.innerWidth - 16) {
      left = Math.max(16, window.innerWidth - popoverWidth - 16 + window.scrollX);
    }

    // 아래쪽 화면 밖으로 넘치면 인풋 위쪽으로 배치
    if (rect.bottom + popoverHeight > window.innerHeight && rect.top > popoverHeight + 20) {
      top = rect.top + window.scrollY - popoverHeight - 6;
    }

    setCoords({
      isMobile: false,
      top,
      left,
      width: Math.max(rect.width, popoverWidth),
    });
  }, []);

  // 모달/팝오버 열릴 때 위치 갱신 및 리스너 등록
  useEffect(() => {
    if (!isOpen) return;
    updateCoords();

    const handleResize = () => updateCoords();
    const handleScroll = (e) => {
      // 팝오버 내부 스크롤이 아니면 위치 재계산
      if (popoverRef.current && popoverRef.current.contains(e.target)) return;
      updateCoords();
    };

    const handlePointerDown = (e) => {
      if (
        containerRef.current?.contains(e.target) ||
        popoverRef.current?.contains(e.target)
      ) {
        return;
      }
      setIsOpen(false);
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, true);
    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll, true);
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, updateCoords]);

  // 값 변경 핸들러
  const handleSelectDate = (dateStr) => {
    if (disabled) return;
    if (onChange) {
      // 기존 <input type="date" /> 이벤트 호환용 Synthetic Event 생성
      const syntheticEvent = {
        target: { value: dateStr, name: name || id, id },
        currentTarget: { value: dateStr, name: name || id, id },
        preventDefault: () => {},
        stopPropagation: () => {},
      };
      onChange(syntheticEvent);
    }
    setIsOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    if (disabled) return;
    if (onChange) {
      const syntheticEvent = {
        target: { value: '', name: name || id, id },
        currentTarget: { value: '', name: name || id, id },
        preventDefault: () => {},
        stopPropagation: () => {},
      };
      onChange(syntheticEvent);
    }
  };

  const handlePrevMonth = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (viewMonth === 1) {
      setViewYear((y) => y - 1);
      setViewMonth(12);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (viewMonth === 12) {
      setViewYear((y) => y + 1);
      setViewMonth(1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleTodayClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isDateDisabled(todayStr)) return;
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth() + 1);
    handleSelectDate(todayStr);
  };

  // 날짜 비활성화 여부 검사 (min/max)
  const isDateDisabled = useCallback(
    (dateStr) => {
      if (min && dateStr < min) return true;
      if (max && dateStr > max) return true;
      return false;
    },
    [min, max]
  );

  // 현재 월의 달력 그리드 계산
  const calendarDays = useMemo(() => {
    const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
    const firstDayOfWeek = new Date(viewYear, viewMonth - 1, 1).getDay(); // 0(일) ~ 6(토)
    const prevMonthDays = new Date(viewYear, viewMonth - 1, 0).getDate();

    const cells = [];

    // 이전 달 잔여 일수
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const day = prevMonthDays - i;
      const prevM = viewMonth === 1 ? 12 : viewMonth - 1;
      const prevY = viewMonth === 1 ? viewYear - 1 : viewYear;
      const dateStr = formatDateString(prevY, prevM, day);
      cells.push({
        dateStr,
        day,
        isCurrentMonth: false,
        disabled: isDateDisabled(dateStr),
        year: prevY,
        month: prevM,
      });
    }

    // 이번 달 일수
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = formatDateString(viewYear, viewMonth, day);
      cells.push({
        dateStr,
        day,
        isCurrentMonth: true,
        disabled: isDateDisabled(dateStr),
        year: viewYear,
        month: viewMonth,
      });
    }

    // 다음 달 일수 (총 35개 또는 42개 칸 유지)
    const totalSlots = cells.length > 35 ? 42 : 35;
    const remainingSlots = totalSlots - cells.length;
    for (let day = 1; day <= remainingSlots; day++) {
      const nextM = viewMonth === 12 ? 1 : viewMonth + 1;
      const nextY = viewMonth === 12 ? viewYear + 1 : viewYear;
      const dateStr = formatDateString(nextY, nextM, day);
      cells.push({
        dateStr,
        day,
        isCurrentMonth: false,
        disabled: isDateDisabled(dateStr),
        year: nextY,
        month: nextM,
      });
    }

    return cells;
  }, [viewYear, viewMonth, isDateDisabled]);

  const popoverContent = (
    <div
      ref={popoverRef}
      className={`datepicker-popover ${coords.isMobile ? 'datepicker-modal-view' : ''}`}
      style={
        coords.isMobile
          ? undefined
          : {
              top: `${coords.top}px`,
              left: `${coords.left}px`,
            }
      }
      onClick={(e) => e.stopPropagation()}
    >
      {/* 팝오버 상단: 제목 & 닫기(모바일) */}
      <div className="datepicker-popover-header">
        <span className="datepicker-header-title">{title}</span>
        <button
          type="button"
          className="datepicker-close-btn"
          onClick={() => setIsOpen(false)}
          title="닫기"
        >
          ✕
        </button>
      </div>

      {/* 년도/월 빠른 점프 드롭다운 & 이전/다음 월 네비게이션 */}
      <div className="datepicker-controls">
        <button
          type="button"
          className="datepicker-arrow-btn"
          onClick={handlePrevMonth}
          title="이전 달"
        >
          ‹
        </button>

        <div className="datepicker-select-group">
          {/* 연도 빠른 선택 드롭다운 */}
          <select
            className="datepicker-year-select"
            value={viewYear}
            onChange={(e) => setViewYear(Number(e.target.value))}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>

          {/* 월 빠른 선택 드롭다운 */}
          <select
            className="datepicker-month-select"
            value={viewMonth}
            onChange={(e) => setViewMonth(Number(e.target.value))}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}월
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className="datepicker-arrow-btn"
          onClick={handleNextMonth}
          title="다음 달"
        >
          ›
        </button>
      </div>

      {/* 요일 헤더 */}
      <div className="datepicker-weekdays">
        {WEEKDAYS.map((wd) => (
          <div
            key={wd.label}
            className={`datepicker-weekday ${
              wd.isSunday ? 'sunday' : wd.isSaturday ? 'saturday' : ''
            }`}
          >
            {wd.label}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div className="datepicker-days-grid">
        {calendarDays.map((cell, idx) => {
          const isSelected = cell.dateStr === value;
          const isToday = cell.dateStr === todayStr;

          return (
            <button
              key={`${cell.dateStr}-${idx}`}
              type="button"
              disabled={cell.disabled}
              className={`datepicker-day-cell ${
                !cell.isCurrentMonth ? 'other-month' : ''
              } ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}`}
              onClick={() => {
                if (cell.disabled) return;
                setViewYear(cell.year);
                setViewMonth(cell.month);
                handleSelectDate(cell.dateStr);
              }}
            >
              {cell.day}
            </button>
          );
        })}
      </div>

      {/* 팝오버 하단 액션 버튼 */}
      <div className="datepicker-actions">
        <button
          type="button"
          className="datepicker-action-btn today-btn"
          onClick={handleTodayClick}
          disabled={isDateDisabled(todayStr)}
        >
          오늘
        </button>
        {showClear && value && (
          <button
            type="button"
            className="datepicker-action-btn clear-btn"
            onClick={(e) => {
              handleClear(e);
              setIsOpen(false);
            }}
          >
            선택 해제
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div
      ref={containerRef}
      className={`custom-datepicker-wrapper ${className}`}
      style={style}
    >
      <div
        className={`custom-datepicker-input-box ${disabled ? 'disabled' : ''} ${
          isOpen ? 'focused' : ''
        }`}
        onClick={() => {
          if (!disabled) setIsOpen((prev) => !prev);
        }}
      >
        <input
          type="text"
          id={id}
          name={name}
          readOnly
          disabled={disabled}
          required={required}
          value={value}
          placeholder={placeholder}
          className="custom-datepicker-input"
        />
        {showClear && value && !disabled && (
          <button
            type="button"
            className="datepicker-input-clear-btn"
            onClick={handleClear}
            title="날짜 지우기"
          >
            ✕
          </button>
        )}
        <span className="datepicker-calendar-svg-icon" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </span>
      </div>

      {/* Portal을 통해 모달이나 오버플로우 제한 없이 렌더링 */}
      {isOpen &&
        createPortal(
          coords.isMobile ? (
            <div
              className="datepicker-backdrop"
              onClick={() => setIsOpen(false)}
            >
              {popoverContent}
            </div>
          ) : (
            popoverContent
          ),
          document.body
        )}
    </div>
  );
}
