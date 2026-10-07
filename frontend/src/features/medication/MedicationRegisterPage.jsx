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

function getMemberRoleName(role) {
  if (!role) return '';
  const r = String(role).trim().toUpperCase();
  if (['GUAR', 'GUARDIAN', '보호자'].includes(r)) return '보호자';
  if (['PROT', 'PROTECTED', '피보호자'].includes(r)) return '피보호자';
  if (['PARENT', 'FATHER', 'MOTHER', 'PARENTS', '부모님', 'PROT_SENIOR'].includes(r)) return '부모님';
  if (['BABY', 'CHILD', 'KID', '자녀'].includes(r)) return '자녀';
  if (['SPOUSE', '배우자'].includes(r)) return '배우자';
  return role;
}

/**
 * 약 등록 메인 페이지 (Orchestrator)
 * - 탭 전환 및 메인 데이터(처방전 목록, 상비약/영양제 목록) 조회/삭제 관리
 * - 가족 구성원(영유아, 노인 등 가상 프로필 포함) 선택 및 대리 등록 완벽 지원
 * - 세부 폼 상태 및 입력은 각 탭과 모달 내부에서 자율 관리
 */
export default function MedicationRegisterPage({ user }) {
  const navigate = useNavigate();
  const location = useLocation();
  const loggedInUserId = user?.userId || user?.id;

  const { showAlert, showConfirm, showLoading, hideLoading } = useDialog();

  // 1. 탭 네비게이션 상태 (prescription | cabinet | supplement)
  const queryTab = new URLSearchParams(location.search).get('tab');
  const [activeTab, setActiveTab] = useState(
    ['prescription', 'cabinet', 'supplement'].includes(queryTab) ? queryTab : 'prescription'
  );

  useEffect(() => {
    if (queryTab && ['prescription', 'cabinet', 'supplement'].includes(queryTab)) {
      setActiveTab(queryTab);
    }
  }, [queryTab]);

  // 2. 가족 구성원 및 복용 대상자 관리
  const [familyMembers, setFamilyMembers] = useState([]);
  const queryUserId = new URLSearchParams(location.search).get('userId');
  const [effectiveUserId, setEffectiveUserId] = useState(() => {
    return queryUserId ? Number(queryUserId) : (loggedInUserId || null);
  });

  // 가족 구성원 목록 로드
  useEffect(() => {
    if (!loggedInUserId) return;
    fetch(`/api/family/members?userId=${loggedInUserId}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((list) => {
        if (Array.isArray(list) && list.length > 0) {
          setFamilyMembers(list);
          if (queryUserId) {
            const matched = list.find((m) => Number(m.userId) === Number(queryUserId));
            if (matched) {
              setEffectiveUserId(Number(matched.userId));
            }
          }
        }
      })
      .catch((err) => console.warn('가족 구성원 목록 조회 대기:', err));
  }, [loggedInUserId, queryUserId]);

  const handleTargetUserChange = (newUid) => {
    setEffectiveUserId(newUid);
    navigate(`/medication/register?tab=${activeTab}&userId=${newUid}`, { replace: true });
  };

  const currentTargetMember = familyMembers.find((m) => Number(m.userId) === Number(effectiveUserId)) || {
    userId: effectiveUserId || loggedInUserId,
    name: user?.name || user?.nickname || '본인',
    role: 'SELF',
    isVirtual: 'N',
  };

  // 3. 유저 식사 시간 설정 로드 (스케줄 모달 연동용: 평일/주말 구분)
  const [mealSchedule, setMealSchedule] = useState(() => {
    const defaultSched = {
      weekday: { ...DEFAULT_MEAL_TIMES },
      weekend: { breakfast: '09:00', lunch: '13:00', dinner: '19:00', bedtime: '23:00' },
    };
    if (!effectiveUserId) return defaultSched;
    try {
      const cachedSched = localStorage.getItem(`jette_meal_schedule_${effectiveUserId}`);
      if (cachedSched) return JSON.parse(cachedSched);
    } catch {}
    return defaultSched;
  });

  const [mealTimes, setMealTimes] = useState(() => {
    if (!effectiveUserId) return DEFAULT_MEAL_TIMES;
    try {
      const cached = localStorage.getItem(`jette_meal_times_${effectiveUserId}`);
      if (cached) return JSON.parse(cached);
    } catch {}
    return DEFAULT_MEAL_TIMES;
  });

  useEffect(() => {
    if (!effectiveUserId) return;
    try {
      const cachedSched = localStorage.getItem(`jette_meal_schedule_${effectiveUserId}`);
      if (cachedSched) {
        setMealSchedule(JSON.parse(cachedSched));
      }
      const cached = localStorage.getItem(`jette_meal_times_${effectiveUserId}`);
      if (cached) {
        setMealTimes(JSON.parse(cached));
      }
    } catch {}
    fetch(`/api/users/meal-times?userId=${effectiveUserId}`)
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
            localStorage.setItem(`jette_meal_schedule_${effectiveUserId}`, JSON.stringify(sched));
            localStorage.setItem(`jette_meal_times_${effectiveUserId}`, JSON.stringify(data.isWeekend ? loadedWeekend : loadedWeekday));
          } catch {}
        }
      })
      .catch((err) => console.warn('식사 시간 로드 대기:', err));
  }, [effectiveUserId]);

  // 4. 메인 데이터 상태 (서버 데이터)
  const [userPrescriptions, setUserPrescriptions] = useState([]);
  const [isLoadingRxList, setIsLoadingRxList] = useState(false);
  const [everydayMeds, setEverydayMeds] = useState([]);
  const [isLoadingEverydayMeds, setIsLoadingEverydayMeds] = useState(false);

  // 모달 제어 상태 (선택된 객체가 있으면 모달 표시)
  const [editingPrescription, setEditingPrescription] = useState(null);
  const [scheduleModalMed, setScheduleModalMed] = useState(null);

  // 처방전 목록 불러오기
  const fetchPrescriptionList = useCallback(async () => {
    if (!effectiveUserId) {
      setUserPrescriptions([]);
      return;
    }
    setIsLoadingRxList(true);
    try {
      const list = await fetchPrescriptions(effectiveUserId);
      setUserPrescriptions(list);
    } catch (err) {
      console.warn('처방전 목록 조회 실패:', err);
      setUserPrescriptions([]);
    } finally {
      setIsLoadingRxList(false);
    }
  }, [effectiveUserId]);

  // 상비약 & 영양제 목록 불러오기
  const fetchEverydayMedsList = useCallback(async () => {
    if (!effectiveUserId) return;
    setIsLoadingEverydayMeds(true);
    try {
      const list = await fetchEverydayMeds(effectiveUserId);
      setEverydayMeds(list);
    } catch (err) {
      console.warn('평소 복용 약 목록 조회 실패:', err);
    } finally {
      setIsLoadingEverydayMeds(false);
    }
  }, [effectiveUserId]);

  useEffect(() => {
    fetchPrescriptionList();
    fetchEverydayMedsList();
  }, [fetchPrescriptionList, fetchEverydayMedsList]);

  // 처방전 삭제
  const handleDeleteRx = (prescriptionId) => {
    if (!effectiveUserId) {
      showAlert('로그인이 필요한 기능입니다.');
      return;
    }

    showConfirm({
      title: '처방전 삭제 확인',
      message: '이 처방전과 관련된 모든 복약 일정이 캘린더에서 함께 삭제됩니다. 정말 삭제하시겠습니까?',
      confirmText: '삭제',
      cancelText: '취소',
      isDestructive: true,
      onConfirm: async () => {
        showLoading({ title: '처방전 삭제 중...' });
        try {
          await deletePrescription(prescriptionId, effectiveUserId);
          await fetchPrescriptionList();
          window.dispatchEvent(new CustomEvent('jette-intake-updated', {
            detail: { userId: effectiveUserId }
          }));
          showAlert('처방전 및 관련 일정이 성공적으로 삭제되었습니다.', '삭제 완료');
        } catch (err) {
          console.error('처방전 삭제 오류:', err);
          showAlert(err.message || '삭제 중 오류가 발생했습니다.', '삭제 오류');
        } finally {
          hideLoading();
        }
      },
    });
  };

  // 평소 복용 약(상비약/영양제) 삭제
  const handleRemoveEverydayMed = (med) => {
    if (!effectiveUserId) {
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
          await deleteEverydayMed(med.source, rawId, effectiveUserId);
          await fetchEverydayMedsList();
          window.dispatchEvent(new CustomEvent('jette-intake-updated', {
            detail: { userId: effectiveUserId }
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

        {/* 가족 구성원 복용 대상자 선택 영역 */}
        {familyMembers.length > 1 && (
          <div className="med-target-selector-box">
            <div className="med-target-label-wrap">
              <svg className="med-target-icon" viewBox="0 0 20 20" fill="currentColor">
                <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
              </svg>
              <span className="med-target-label">복용 대상자:</span>
            </div>
            <select
              className="med-target-select"
              value={effectiveUserId || loggedInUserId}
              onChange={(e) => handleTargetUserChange(Number(e.target.value))}
            >
              {familyMembers.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name} {Number(m.userId) === Number(loggedInUserId) ? '(본인)' : `(${getMemberRoleName(m.role)})`}
                </option>
              ))}
            </select>
          </div>
        )}

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
            currentUserId={effectiveUserId}
            userPrescriptions={userPrescriptions}
            isLoadingRxList={isLoadingRxList}
            fetchPrescriptionList={fetchPrescriptionList}
            startEditPrescription={(rx) => setEditingPrescription(rx)}
            handleDeleteRx={handleDeleteRx}
          />
        )}

        {activeTab === 'cabinet' && (
          <CabinetTab
            currentUserId={effectiveUserId}
            username={currentTargetMember?.name || user?.name || user?.username}
            everydayMeds={everydayMeds}
            onSuccess={fetchEverydayMedsList}
            onRemoveMed={handleRemoveEverydayMed}
            onOpenScheduleModal={(med) => setScheduleModalMed(med)}
          />
        )}

        {activeTab === 'supplement' && (
          <SupplementTab
            currentUserId={effectiveUserId}
            username={currentTargetMember?.name || user?.name || user?.username}
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
        currentUserId={effectiveUserId}
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
        currentUserId={effectiveUserId}
        onClose={() => setEditingPrescription(null)}
        onSuccess={() => {
          setEditingPrescription(null);
          fetchPrescriptionList();
        }}
      />
    </div>
  );
}
