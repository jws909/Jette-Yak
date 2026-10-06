import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import MedicationDetailModal from './components/MedicationDetailModal';
import CautionInfoModal from './components/CautionInfoModal';
import MealTimeSettingModal from './components/MealTimeSettingModal';
import TodayRoutineSection from './components/TodayRoutineSection';
import RxDropdownSelector from './components/RxDropdownSelector';
import PrescriptionSummaryCard from './components/PrescriptionSummaryCard';
import PrescribedMedsCard from './components/PrescribedMedsCard';
import MedicationNoteCard from './components/MedicationNoteCard';
import PrescriptionPromoBanner from './components/PrescriptionPromoBanner';
import MainGreetingHeader from './components/MainGreetingHeader';
import MainSearchBar from './components/MainSearchBar';
import { useMainPageData } from './hooks/useMainPageData';
import { DEFAULT_MEAL_TIMES, parseDateOnly } from './utils/mainPageUtils';
import './MainPage.css';

/**
 * 메인 대시보드 페이지 (메인 홈)
 */
export default function MainPage({ user }) {
  const navigate = useNavigate();

  // 1. 기준 일자 및 처방전 선택 상태
  const [targetDate, setTargetDate] = useState(() => new Date());
  const [selectedRxId, setSelectedRxId] = useState('all'); // 'all' 또는 개별 prescriptionId

  // 2. 모달 열림/닫힘 UI 상태
  const [selectedMedDetail, setSelectedMedDetail] = useState(null);
  const [isCautionModalOpen, setIsCautionModalOpen] = useState(false);
  const [isMealModalOpen, setIsMealModalOpen] = useState(false);

  // 3. 복약 데이터 및 서버 양방향 동기화 커스텀 훅
  const {
    hasPrescription,
    allPrescriptions,
    prescriptionData,
    currentPrescriptionView,
    currentRxStatus,
    activeMedsForTargetDate,
    displayedMedList,
    groupedPrescriptionMeds,
    activeRoutineList,
    mealTimes,
    handleSaveMealTimes,
    toggleRoutine,
    togglePouch,
  } = useMainPageData(user, targetDate, selectedRxId);

  // 타겟 날짜가 오늘인지 여부
  const isTargetToday = useMemo(() => {
    const today = new Date();
    return (
      targetDate.getFullYear() === today.getFullYear() &&
      targetDate.getMonth() === today.getMonth() &&
      targetDate.getDate() === today.getDate()
    );
  }, [targetDate]);

  // 날짜 네비게이터 핸들러
  const handlePrevDay = () => {
    setTargetDate((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() - 1));
  };

  const handleNextDay = () => {
    setTargetDate((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 1));
  };

  const handleResetToday = () => {
    setTargetDate(new Date());
  };

  const handleJumpToDate = (dateStr) => {
    const parsed = parseDateOnly(dateStr);
    if (parsed) {
      setTargetDate(parsed);
    }
  };

  // 처방전 등록 파라미터 감지 시 약 등록 전용 페이지로 즉시 안내
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('register') === 'prescription') {
      navigate('/medication/register?tab=prescription', { replace: true });
    }
  }, [navigate]);

  return (
    <div className="main-page-wrapper">
      {/* 1. 상단 인사말 및 복약 날짜 네비게이터 영역 */}
      <MainGreetingHeader
        user={user}
        targetDate={targetDate}
        isTargetToday={isTargetToday}
        onPrevDay={handlePrevDay}
        onNextDay={handleNextDay}
        onResetToday={handleResetToday}
        onSetTargetDate={setTargetDate}
      />

      {/* 2. 약 검색창 (메인.png 검색 바) */}
      <MainSearchBar />

      {/* 3. 상단 핵심: 오늘의 복약 루틴 (TODAY'S ROUTINE) */}
      <TodayRoutineSection
        targetDate={targetDate}
        isTargetToday={isTargetToday}
        currentRxStatus={currentRxStatus}
        hasPrescription={hasPrescription}
        prescriptionData={prescriptionData}
        activeRoutineList={activeRoutineList}
        mealTimes={mealTimes}
        selectedRxId={selectedRxId}
        onResetToday={handleResetToday}
        onOpenMealModal={() => setIsMealModalOpen(true)}
        onJumpToDate={handleJumpToDate}
        onTogglePouch={togglePouch}
        onToggleRoutine={toggleRoutine}
        onSelectMedDetail={setSelectedMedDetail}
      />

      {/* 4. 처방전 정보 & 주의사항 (처방전 등록 시 상세 표시) */}
      {hasPrescription ? (
        <>
          {/* 처방전 선택 드롭다운 셀렉터 */}
          <RxDropdownSelector
            allPrescriptions={allPrescriptions}
            selectedRxId={selectedRxId}
            onSelectRxId={setSelectedRxId}
            currentPrescriptionView={currentPrescriptionView}
            currentRxStatus={currentRxStatus}
            targetDate={targetDate}
            onSetTargetDate={setTargetDate}
          />

          {/* 처방전 요약 카드 (PRESCRIPTION SUMMARY) */}
          <PrescriptionSummaryCard
            selectedRxId={selectedRxId}
            allPrescriptions={allPrescriptions}
            prescriptionData={prescriptionData}
            currentRxStatus={currentRxStatus}
            displayedMedList={displayedMedList}
            onJumpToDate={handleJumpToDate}
          />

          {/* 2단 그리드: 처방 약품 목록 (좌) + 복용 주의점 (우) */}
          <section className="main-two-column-grid">
            <PrescribedMedsCard
              displayedMedList={displayedMedList}
              currentRxStatus={currentRxStatus}
              selectedRxId={selectedRxId}
              prescriptionData={prescriptionData}
              groupedPrescriptionMeds={groupedPrescriptionMeds}
              onSelectMedDetail={setSelectedMedDetail}
              onJumpToDate={handleJumpToDate}
            />

            <MedicationNoteCard
              prescriptionData={prescriptionData}
              currentRxStatus={currentRxStatus}
              activeMedsForTargetDate={activeMedsForTargetDate}
              onOpenCautionModal={() => setIsCautionModalOpen(true)}
            />
          </section>
        </>
      ) : (
        <PrescriptionPromoBanner />
      )}

      {/* 약품 상세 정보 모달 */}
      <MedicationDetailModal
        isOpen={Boolean(selectedMedDetail)}
        medDetail={selectedMedDetail}
        onClose={() => setSelectedMedDetail(null)}
        onNavigateGuide={() => {
          setSelectedMedDetail(null);
          navigate('/guide');
        }}
      />

      {/* 복용 주의점 자세히 보기 모달 */}
      <CautionInfoModal
        isOpen={isCautionModalOpen}
        onClose={() => setIsCautionModalOpen(false)}
        targetDate={targetDate}
        selectedRxId={selectedRxId}
        prescriptionData={prescriptionData}
        currentRxStatus={currentRxStatus}
        activeMedList={activeMedsForTargetDate}
        onJumpToDate={(dateStr) => handleJumpToDate(dateStr)}
        onNavigateGuide={() => navigate('/guide')}
      />

      {/* 사용자 맞춤 식사 시간 설정 모달 */}
      <MealTimeSettingModal
        isOpen={isMealModalOpen}
        onClose={() => setIsMealModalOpen(false)}
        mealTimes={mealTimes}
        defaultMealTimes={DEFAULT_MEAL_TIMES}
        onSave={handleSaveMealTimes}
      />
    </div>
  );
}
