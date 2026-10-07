import {
  formatDateWithDay,
  getTargetDateDiffText,
  formatDateToHyphen,
  parseDateOnly,
} from '../utils/mainPageUtils';
import DatePicker from '../../../components/ui/DatePicker';
const DAY_NAMES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
];

/**
 * 상단 사용자 인사말 및 복약 날짜 네비게이터 컴포넌트
 */
export default function MainGreetingHeader({
  user,
  targetDate,
  isTargetToday,
  onPrevDay,
  onNextDay,
  onResetToday,
  onSetTargetDate,
}) {
  const greetingDateStr = `${DAY_NAMES[targetDate.getDay()]}, ${targetDate.getDate()} ${MONTH_NAMES[targetDate.getMonth()]}`;

  return (
    <header className="main-greeting-header">
      <div className="greeting-flex-row">
        <div className="greeting-text-block">
          <span className="greeting-date">{greetingDateStr}</span>
          <h1 className="greeting-title">
            안녕하세요, <span className="user-highlight">{user?.name || user?.username || '사용자'}</span>님.
          </h1>
          <p className="greeting-subtitle">오늘도 몸의 이야기에 귀 기울여 볼까요?</p>
        </div>

        {/* 날짜 이동 네비게이터 */}
        <div className="main-date-navigator" title="복약 기준 날짜 변경">
          <button
            type="button"
            className="date-nav-arrow-btn"
            onClick={onPrevDay}
            title="하루 전으로 이동"
          >
            ‹
          </button>
          <DatePicker
            value={formatDateToHyphen(targetDate)}
            onChange={(e) => {
              const parsed = parseDateOnly(e.target.value);
              if (parsed) onSetTargetDate(parsed);
            }}
            title="복약 기준 날짜 선택"
            showClear={false}
            customTrigger={({ open }) => (
              <div
                className="date-nav-display-box"
                onClick={open}
                title="클릭하여 달력에서 날짜 직접 선택"
              >
                <span className="date-nav-calendar-icon">
                  <svg viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                  </svg>
                </span>
                <span className="date-nav-date-text">{formatDateWithDay(targetDate)}</span>
                {isTargetToday ? (
                  <span className="date-nav-today-tag">오늘</span>
                ) : (
                  <span className="date-nav-diff-tag">{getTargetDateDiffText(targetDate)}</span>
                )}
              </div>
            )}
          />
          <button
            type="button"
            className="date-nav-arrow-btn"
            onClick={onNextDay}
            title="다음 날로 이동"
          >
            ›
          </button>
          {!isTargetToday && (
            <button
              type="button"
              className="date-nav-return-today-btn"
              onClick={onResetToday}
              title="오늘 날짜로 복귀"
            >
              오늘로 복귀
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
