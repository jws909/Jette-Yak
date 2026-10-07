import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useDialog } from '../../contexts/DialogContext';
import {
  fetchPrescriptions,
  fetchEverydayMeds,
  deletePrescription,
  deleteEverydayMed,
} from './medicationApi';
import { DEFAULT_MEAL_TIMES } from '../main/utils/mainPageUtils';
import PrescriptionTab from './components/PrescriptionTab';
import CabinetTab from './components/CabinetTab';
import SupplementTab from './components/SupplementTab';
import EditPrescriptionModal from './components/EditPrescriptionModal';
import ScheduleModal from './components/ScheduleModal';
import './MedicationRegisterPage.css';

/**
 * 약 등록 메인 페이지 (Orchestrator)
 * - 탭 전환 및 메인 데이터(처방전 목록, 상비약/영양제 목록) 조회/삭제 관리
 * - 세부 폼 상태 및 입력은 각 탭과 모달 내부에서 자율 관리
 */
export default function MedicationRegisterPage(props) {
  return <MedicationRegisterContent key={props.user?.userId || props.user?.id || props.user?.username || 'guest'} {...props} />;
}

function MedicationRegisterContent({ user }) {
  const navigate = useNavigate();
  const location = useLocation();
  const currentUserId = user?.userId || user?.id;

  const { showAlert, showConfirm, showLoading, hideLoading } = useDialog();

  // 탭 네비게이션 상태 (prescription | cabinet | supplement)
  const queryTab = new URLSearchParams(location.search).get('tab');
  const activeTab = ['prescription', 'cabinet', 'supplement'].includes(queryTab) ? queryTab : 'prescription';
  const setActiveTab = (tab) => {
    const params = new URLSearchParams(location.search);
    params.set('tab', tab);
    navigate({ pathname: location.pathname, search: params.toString() }, { replace: true });
  };

  // 유저 식사 시간 설정 로드 (스케줄 모달 연동용: 평일/주말 구분)
  const [mealSchedule, setMealSchedule] = useState(() => {
    const defaultSched = {
      weekday: { ...DEFAULT_MEAL_TIMES },
      weekend: { breakfast: '09:00', lunch: '13:00', dinner: '19:00', bedtime: '23:00' },
    };
    if (!currentUserId) return defaultSched;
    try {
      const cachedSched = localStorage.getItem(`jette_meal_schedule_${currentUserId}`);
      if (cachedSched) return JSON.parse(cachedSched);
    } catch { /* 로컬 캐시 오류는 기본 설정으로 대체 */ }
    return defaultSched;
  });

  const [mealTimes, setMealTimes] = useState(() => {
    if (!currentUserId) return DEFAULT_MEAL_TIMES;
    try {
      const cached = localStorage.getItem(`jette_meal_times_${currentUserId}`);
      if (cached) return JSON.parse(cached);
    } catch { /* 로컬 캐시 오류는 기본 설정으로 대체 */ }
    return DEFAULT_MEAL_TIMES;
  });

  useEffect(() => {
    if (!currentUserId) return;
    fetch(`/api/users/meal-times?userId=${currentUserId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.success) {
          const loadedWeekday = {
            breakfast: data.weekday?.breakfastTime || data.breakfastTime || DEFAULT_MEAL_TIMES.breakfast,
            lunch: data.weekday?.lunchTime || data.lunchTime || DEFAULT_MEAL_TIMES.lunch,
            dinner: data.weekday?.dinnerTime || data.dinnerTime || DEFAULT_MEAL_TIMES.dinner,
            bedtime: data.weekday?.bedtime || data.bedtime || DEFAULT_MEAL_TIMES.bedtime,
          };
          const loadedWeekend = {
            breakfast: data.weekend?.breakfastTime || '09:00',
            lunch: data.weekend?.lunchTime || '13:00',
            dinner: data.weekend?.dinnerTime || '19:00',
            bedtime: data.weekend?.bedtime || '23:00',
          };
          const sched = { weekday: loadedWeekday, weekend: loadedWeekend };
          setMealSchedule(sched);
          setMealTimes(data.isWeekend ? loadedWeekend : loadedWeekday);
          try {
            localStorage.setItem(`jette_meal_schedule_${currentUserId}`, JSON.stringify(sched));
            localStorage.setItem(`jette_meal_times_${currentUserId}`, JSON.stringify(data.isWeekend ? loadedWeekend : loadedWeekday));
          } catch { /* 로컬 캐시 오류는 기본 설정으로 대체 */ }
        }
      })
      .catch((err) => console.warn('식사 시간 로드 대기:', err));
  }, [currentUserId]);

  // 메인 데이터 상태 (서버 데이터)
  const [userPrescriptions, setUserPrescriptions] = useState([]);
  const [isLoadingRxList, setIsLoadingRxList] = useState(Boolean(currentUserId));
  const [everydayMeds, setEverydayMeds] = useState([]);

  // 모달 제어 상태 (선택된 객체가 있으면 모달 표시)
  const [editingPrescription, setEditingPrescription] = useState(null);
  const [scheduleModalMed, setScheduleModalMed] = useState(null);

  // 처방전 목록 불러오기
  const fetchPrescriptionList = useCallback(() => {
    if (!currentUserId) return;
    return fetchPrescriptions(currentUserId)
      .then(list => setUserPrescriptions(list))
      .catch((err) => {
        console.warn('처방전 목록 조회 실패:', err);
        setUserPrescriptions([]);
      })
      .finally(() => setIsLoadingRxList(false));
  }, [currentUserId]);

  // 상비약 & 영양제 목록 불러오기
  const fetchEverydayMedsList = useCallback(() => {
    if (!currentUserId) return;
    return fetchEverydayMeds(currentUserId)
      .then(list => setEverydayMeds(list))
      .catch(err => console.warn('평소 복용 약 목록 조회 실패:', err));
  }, [currentUserId]);

  useEffect(() => {
    fetchPrescriptionList();
    fetchEverydayMedsList();
  }, [fetchPrescriptionList, fetchEverydayMedsList]);

  // 처방전 삭제
  const handleDeleteRx = (prescriptionId) => {
    if (!currentUserId) {
      showAlert('로그인이 필요한 기능입니다.');
      return;
    }

    showConfirm({
      title: '처방전 삭제 확인',
      description: '정말 이 처방전을 삭제하시겠습니까?\n포함된 처방 약품 및 오늘의 복약 루틴이 함께 삭제됩니다.',
      confirmLabel: '삭제',
      cancelLabel: '취소',
      tone: 'danger',
      onConfirm: async () => {
        showLoading({
          title: '처방전 삭제 처리 중',
          description: '선택하신 처방전 및 관련 복약 기록을 삭제하고 있습니다. 잠시만 기다려 주세요.',
        });
        try {
          await deletePrescription(prescriptionId, currentUserId);
          await fetchPrescriptionList();
          window.dispatchEvent(new CustomEvent('jette-intake-updated', {
            detail: { userId: currentUserId }
          }));
          showAlert('처방전이 삭제되었습니다.', '삭제 완료');
        } catch (err) {
          console.error('처방전 삭제 오류:', err);
          showAlert(err.message || '삭제 처리 중 오류가 발생했습니다.', '삭제 오류');
        } finally {
          hideLoading();
        }
      },
    });
  };

  // 평소 복용 약(상비약/영양제) 삭제
  const handleRemoveEverydayMed = (med) => {
    if (!currentUserId) {
      showAlert('로그인이 필요한 기능입니다.');
      return;
    }
    showConfirm({
      title: '삭제 확인',
      description: `'${med.name}' 을(를) 목록에서 삭제하시겠습니까?`,
      confirmLabel: '삭제',
      cancelLabel: '취소',
      tone: 'danger',
      onConfirm: async () => {
        try {
          const rawId = med.rawId || (med.id ? String(med.id).replace(/^[A-Za-z]:/, '') : '');
          await deleteEverydayMed(med.source, rawId, currentUserId);
          await fetchEverydayMedsList();
          window.dispatchEvent(new CustomEvent('jette-intake-updated', {
            detail: { userId: currentUserId }
          }));
        } catch (err) {
          console.error('삭제 오류:', err);
          showAlert(err.message || '삭제 중 오류가 발생했습니다.', '삭제 오류');
        }
      },
    });
  };

  return (
    <div className="med-register-page">
      {/* 1. 헤더 & 탭 네비게이션 */}
      <header className="med-register-header">
        <div className="med-register-title-row">
          <div>
            <span className="med-register-kicker">MEDICATION ONBOARDING</span>
            <h1 className="med-register-title">약 등록</h1>
            <p className="med-register-desc">
              처방전 사진부터 상비약, 매일 먹는 영양제까지 한곳에서 스마트하게 등록하세요.
            </p>
          </div>
          <button
            type="button"
            className="med-register-back-btn"
            onClick={() => navigate('/')}
          >
            메인 홈으로 가기 →
          </button>
        </div>

        <div className="med-register-tabs">
          <button
            type="button"
            className={`med-tab-btn tab-prescription ${activeTab === 'prescription' ? 'active' : ''}`}
            onClick={() => setActiveTab('prescription')}
          >
            <svg className="tab-svg-icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
            </svg>
            <span className="tab-text-full">처방전 · 약봉투 (AI 분석)</span>
            <span className="tab-text-short">처방전</span>
          </button>
          <button
            type="button"
            className={`med-tab-btn tab-cabinet ${activeTab === 'cabinet' ? 'active' : ''}`}
            onClick={() => setActiveTab('cabinet')}
          >
            <svg className="tab-svg-icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
              <path fillRule="evenodd" d="M7 2a1 1 0 00-.707.293l-4 4a1 1 0 000 1.414l8 8a1 1 0 001.414 0l4-4a1 1 0 000-1.414l-8-8A1 1 0 007 2zm4.707 9.293L8 7.586 9.414 6.172l3.707 3.707-1.414 1.414z" clipRule="evenodd" />
            </svg>
            <span className="tab-text-full">상비약 · 일반의약품 검색</span>
            <span className="tab-text-short">상비약</span>
          </button>
          <button
            type="button"
            className={`med-tab-btn tab-supplement ${activeTab === 'supplement' ? 'active' : ''}`}
            onClick={() => setActiveTab('supplement')}
          >
            <svg className="tab-svg-icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
              <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.508.79-.83 1.83-.984 3.033-1.042.06-2.07.41-2.915 1.05C4.945 8.167 4 9.873 4 12c0 2.227 1.082 4.14 2.75 5.226C8.423 18.314 10.667 19 13 19c2.81 0 5.244-.98 6.472-2.58.536-.697.77-1.52.684-2.33-.086-.807-.487-1.554-1.084-2.126-1.196-1.144-2.986-1.804-5.074-1.928.09-.768.272-1.436.544-1.954.276-.525.64-.897 1.077-1.127a1 1 0 00.38-1.4z" clipRule="evenodd" />
            </svg>
            <span className="tab-text-full">영양제 · 건강기능식품 등록</span>
            <span className="tab-text-short">영양제</span>
          </button>
        </div>
      </header>

      {/* 2. 탭별 컨텐츠 본문 */}
      <main className="med-register-content">
        {activeTab === 'prescription' && (
          <PrescriptionTab
            currentUserId={currentUserId}
            userPrescriptions={userPrescriptions}
            isLoadingRxList={isLoadingRxList}
            fetchPrescriptionList={fetchPrescriptionList}
            startEditPrescription={(rx) => setEditingPrescription(rx)}
            handleDeleteRx={handleDeleteRx}
          />
        )}

        {activeTab === 'cabinet' && (
          <CabinetTab
            currentUserId={currentUserId}
            username={user?.username}
            everydayMeds={everydayMeds}
            onSuccess={fetchEverydayMedsList}
            onRemoveMed={handleRemoveEverydayMed}
            onOpenScheduleModal={(med) => setScheduleModalMed(med)}
          />
        )}

        {activeTab === 'supplement' && (
          <SupplementTab
            currentUserId={currentUserId}
            username={user?.username}
            everydayMeds={everydayMeds}
            onSuccess={fetchEverydayMedsList}
            onRemoveMed={handleRemoveEverydayMed}
            onOpenScheduleModal={(med) => setScheduleModalMed(med)}
          />
        )}
      </main>

      {/* 3. 모달 레이어 */}
      <ScheduleModal
        isOpen={Boolean(scheduleModalMed)}
        med={scheduleModalMed}
        currentUserId={currentUserId}
        mealTimes={mealTimes}
        mealSchedule={mealSchedule}
        onClose={() => setScheduleModalMed(null)}
        onSuccess={() => {
          setScheduleModalMed(null);
          fetchEverydayMedsList();
        }}
      />

      <EditPrescriptionModal
        isOpen={Boolean(editingPrescription)}
        prescription={editingPrescription}
        currentUserId={currentUserId}
        onClose={() => setEditingPrescription(null)}
        onSuccess={() => {
          setEditingPrescription(null);
          fetchPrescriptionList();
        }}
      />
    </div>
  );
}
