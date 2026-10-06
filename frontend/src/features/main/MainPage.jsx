import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import {
  DEFAULT_MEAL_TIMES,
  DOT_COLORS,
  parseDateOnly,
  formatDateToHyphen,
  formatDateToDot,
  getPrescriptionStatus,
  getMedicineCaution,
  mapPrescriptionToState,
  getIntakeSlots,
  buildRoutineItems,
  isSameSlot,
} from './utils/mainPageUtils';
import './MainPage.css';

export default function MainPage({ user }) {
  const navigate = useNavigate();
  const currentUserId = user?.userId || user?.id;

  // 처방전 데이터 및 등록 여부 상태 (DB 조회 결과에 따라 실시간 반영)
  const [hasPrescription, setHasPrescription] = useState(false);
  const [allPrescriptions, setAllPrescriptions] = useState([]);
  const [selectedRxId, setSelectedRxId] = useState('all'); // 'all' 또는 개별 prescriptionId
  const [targetDate, setTargetDate] = useState(() => new Date());

  // 타겟 날짜가 오늘인지 여부
  const isTargetToday = useMemo(() => {
    const today = new Date();
    return (
      targetDate.getFullYear() === today.getFullYear() &&
      targetDate.getMonth() === today.getMonth() &&
      targetDate.getDate() === today.getDate()
    );
  }, [targetDate]);

  // 현재 선택된 처방전 또는 전체 통합 뷰 계산
  const currentPrescriptionView = useMemo(() => {
    if (!allPrescriptions || allPrescriptions.length === 0) return null;

    if (selectedRxId === 'all') {
      const combinedItems = [];
      let hasDiscontinued = 0;
      const hospitalSet = new Set();
      let maxTotalDays = 0;

      allPrescriptions.forEach((rx) => {
        if (rx.hasDiscontinuedDrug === 1) hasDiscontinued = 1;
        if (rx.hospitalName && rx.hospitalName !== '의료기관') hospitalSet.add(rx.hospitalName);
        if ((rx.totalDays || 0) > maxTotalDays) maxTotalDays = rx.totalDays;

        (rx.items || []).forEach((item) => {
          combinedItems.push({
            ...item,
            originHospital: rx.hospitalName || '의료기관',
            originDispensedDate: rx.dispensedDate || '',
            prescriptionId: rx.prescriptionId,
          });
        });
      });

      const hospitalNames = Array.from(hospitalSet);
      const hospitalDisplay = hospitalNames.length > 0
        ? hospitalNames.join(', ')
        : `${allPrescriptions.length}개 의료기관`;

      return {
        isAll: true,
        prescriptionId: 'all',
        dispensedDate: allPrescriptions[0]?.dispensedDate || '',
        hospitalName: hospitalDisplay,
        doctorName: `처방전 ${allPrescriptions.length}건 통합`,
        totalDays: maxTotalDays || 14,
        hasDiscontinuedDrug: hasDiscontinued,
        items: combinedItems,
        allCount: allPrescriptions.length,
        aiGuide: {
          purpose: '등록된 모든 처방 약품을 한눈에 모아 복약 일정을 안내합니다.',
          summary: '복용 중인 처방전들의 약품을 통합하여 중복 성분 및 상호작용을 확인하고 일정을 관리합니다.'
        }
      };
    } else {
      const found = allPrescriptions.find((rx) => String(rx.prescriptionId) === String(selectedRxId));
      return found || allPrescriptions[0];
    }
  }, [allPrescriptions, selectedRxId]);

  const prescriptionData = currentPrescriptionView;

  // 현재 처방전의 기준일자(targetDate) 대비 복약 진행 상태
  const currentRxStatus = useMemo(() => {
    if (!prescriptionData) return null;
    if (prescriptionData.isAll) {
      const takingList = allPrescriptions.filter((rx) => {
        const st = getPrescriptionStatus(rx.dispensedDate, rx.totalDays, targetDate);
        return st.status === 'taking';
      });
      const completedList = allPrescriptions.filter((rx) => {
        const st = getPrescriptionStatus(rx.dispensedDate, rx.totalDays, targetDate);
        return st.status === 'completed';
      });

      let status = 'taking';
      let badgeText = `복용 중 (${takingList.length}건)`;
      if (allPrescriptions.length > 0 && completedList.length === allPrescriptions.length) {
        status = 'completed';
        badgeText = '전체 복용 완료';
      } else if (takingList.length === 0) {
        status = 'upcoming';
        badgeText = '복용 예정';
      }

      return {
        status,
        badgeText,
        badgeDetail: `등록 처방전 ${allPrescriptions.length}건 중 ${takingList.length}건 복용 중`,
        isTaking: takingList.length > 0,
        takingCount: takingList.length,
        startDateStr: '',
        endDateStr: '',
        dayNum: 1,
        totalDays: prescriptionData.totalDays || 14,
      };
    }
    return getPrescriptionStatus(prescriptionData.dispensedDate, prescriptionData.totalDays, targetDate);
  }, [prescriptionData, targetDate, allPrescriptions]);

  // 기준 일자(targetDate)에 실제로 복약해야 하는 처방 약품 목록 (복용 완료/예정 상태 처방전은 제외)
  const activeMedsForTargetDate = useMemo(() => {
    if (!allPrescriptions || allPrescriptions.length === 0) return [];

    if (selectedRxId === 'all') {
      const meds = [];
      allPrescriptions.forEach((rx) => {
        const st = getPrescriptionStatus(rx.dispensedDate, rx.totalDays, targetDate);
        if (st.status === 'taking') {
          (rx.items || []).forEach((item) => {
            meds.push({
              ...item,
              originHospital: rx.hospitalName || '의료기관',
              originDispensedDate: rx.dispensedDate || '',
              prescriptionId: rx.prescriptionId,
              prescriptionNickname: rx.nickname,
              prescriptionPurpose: rx.aiGuide?.purpose,
            });
          });
        }
      });
      return meds;
    } else {
      const rx = allPrescriptions.find((r) => String(r.prescriptionId) === String(selectedRxId));
      if (!rx) return [];
      const st = getPrescriptionStatus(rx.dispensedDate, rx.totalDays, targetDate);
      if (st.status === 'taking') {
        return (rx.items || []).map((item) => ({
          ...item,
          originHospital: rx.hospitalName || '의료기관',
          originDispensedDate: rx.dispensedDate || '',
          prescriptionId: rx.prescriptionId,
          prescriptionNickname: rx.nickname,
          prescriptionPurpose: rx.aiGuide?.purpose,
        }));
      }
      return [];
    }
  }, [allPrescriptions, selectedRxId, targetDate]);

  // 기준 일자(targetDate)에 실제로 복약해야 하는 처방 약품 목록 (복약 루틴 생성용)
  const activeMedList = activeMedsForTargetDate;

  // 처방전 상세 및 처방 약품 카드에 표시할 약품 목록
  // 과거 처방전(복용 완료)이라도 해당 처방전에 포함된 약품들을 언제든 바로 확인할 수 있도록 보존
  const displayedMedList = useMemo(() => {
    if (!prescriptionData) return [];

    if (selectedRxId === 'all') {
      // 전체 통합: 오늘 복용할 약품이 있으면 해당 목록 우선,
      // 오늘 복용 일정이 없더라도 등록된 모든 처방전의 약품 목록을 보여줌
      if (activeMedsForTargetDate && activeMedsForTargetDate.length > 0) {
        return activeMedsForTargetDate;
      }
      return (prescriptionData.items || []).map((item) => ({
        ...item,
        originHospital: item.originHospital || prescriptionData.hospitalName || '의료기관',
        originDispensedDate: item.originDispensedDate || prescriptionData.dispensedDate || '',
        prescriptionId: item.prescriptionId || prescriptionData.prescriptionId,
      }));
    }

    // 개별 처방전 선택: 오늘 날짜와 무관하게 해당 처방전에 포함된 모든 약품을 온전히 표시
    return (prescriptionData.items || []).map((item) => ({
      ...item,
      originHospital: prescriptionData.hospitalName || '의료기관',
      originDispensedDate: prescriptionData.dispensedDate || '',
      prescriptionId: prescriptionData.prescriptionId,
      prescriptionNickname: prescriptionData.nickname,
      prescriptionPurpose: prescriptionData.aiGuide?.purpose,
    }));
  }, [prescriptionData, selectedRxId, activeMedsForTargetDate]);

  // 처방전별로 그룹핑된 처방 약품 목록 (selectedRxId === 'all' 모드 전용)
  const groupedPrescriptionMeds = useMemo(() => {
    if (selectedRxId !== 'all') return [];
    if (!displayedMedList || displayedMedList.length === 0) return [];

    const map = new Map();
    displayedMedList.forEach((med) => {
      const rxId = med.prescriptionId ? String(med.prescriptionId) : 'unknown';
      if (!map.has(rxId)) {
        const rx = (allPrescriptions || []).find((r) => String(r.prescriptionId) === rxId);
        const status = rx ? getPrescriptionStatus(rx.dispensedDate, rx.totalDays, targetDate) : null;
        map.set(rxId, {
          prescriptionId: rxId,
          hospitalName: rx?.hospitalName || med.originHospital || '의료기관',
          dispensedDate: rx?.dispensedDate || med.originDispensedDate || '',
          nickname: rx?.nickname || med.prescriptionNickname || '',
          purpose: rx?.aiGuide?.purpose || med.prescriptionPurpose || '',
          status: status?.status,
          dayNum: status?.dayNum,
          totalDays: rx?.totalDays,
          items: [],
        });
      }
      map.get(rxId).items.push(med);
    });

    return Array.from(map.values());
  }, [selectedRxId, displayedMedList, allPrescriptions, targetDate]);

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

  // 약품 상세 모달 상태
  const [selectedMedDetail, setSelectedMedDetail] = useState(null);
  const [isCautionModalOpen, setIsCautionModalOpen] = useState(false);

  // 오늘의 복약 루틴 리스트 (DB 처방 데이터 기반 생성)
  const [routineItems, setRoutineItems] = useState([]);

  // 사용자별 식사 및 취침 기준 시간 상태 (기본값: 아침 07:30, 점심 12:00, 저녁 18:30, 취침 22:00)
  const [mealTimes, setMealTimes] = useState(() => {
    try {
      if (currentUserId) {
        const cached = localStorage.getItem(`jette_meal_times_${currentUserId}`);
        if (cached) return JSON.parse(cached);
      }
    } catch {}
    return DEFAULT_MEAL_TIMES;
  });

  // 식사 시간 설정 모달 상태
  const [isMealModalOpen, setIsMealModalOpen] = useState(false);

  // 컴포넌트 마운트 시 사용자별 식사 기준 시간 DB 조회
  useEffect(() => {
    if (!currentUserId) {
      setMealTimes(DEFAULT_MEAL_TIMES);
      return;
    }
    fetch(`/api/users/meal-times?userId=${currentUserId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.success) {
          const loaded = {
            breakfast: data.breakfastTime || '07:30',
            lunch: data.lunchTime || '12:00',
            dinner: data.dinnerTime || '18:30',
            bedtime: data.bedtime || '22:00',
          };
          setMealTimes(loaded);
          try {
            localStorage.setItem(`jette_meal_times_${currentUserId}`, JSON.stringify(loaded));
          } catch {}
        }
      })
      .catch((err) => console.warn('식사 시간 로드 대기:', err));
  }, [currentUserId]);

  // 사용자의 등록 처방전 전체 목록 및 복약 루틴 새로고침 (비로그인 시 일체 조회하지 않고 초기화)
  const reloadPrescriptionAndRoutine = useCallback(async () => {
    if (!currentUserId) {
      setAllPrescriptions([]);
      setHasPrescription(false);
      setRoutineItems([]);
      return;
    }
    try {
      const res = await fetch(`/api/prescriptions/list?userId=${currentUserId}`);
      if (res.ok) {
        const data = await res.json();
        const rawList = data.prescriptions || [];
        if (rawList.length > 0) {
          const mappedList = rawList.map(mapPrescriptionToState);
          setAllPrescriptions(mappedList);
          setHasPrescription(true);
        } else {
          setAllPrescriptions([]);
          setHasPrescription(false);
          setRoutineItems([]);
        }
      } else {
        setAllPrescriptions([]);
        setHasPrescription(false);
        setRoutineItems([]);
      }
    } catch (err) {
      console.warn('처방전 목록 로드 실패:', err);
      setAllPrescriptions([]);
      setHasPrescription(false);
      setRoutineItems([]);
    }
  }, [currentUserId]);

  // 컴포넌트 마운트 및 currentUserId 변경 시 최신 처방전 DB 조회
  useEffect(() => {
    reloadPrescriptionAndRoutine();
  }, [reloadPrescriptionAndRoutine]);

  // 서버 DB의 당일 캘린더 스케줄과 복약 루틴(scheduleId 및 takenAt)을 100% 동기화하는 함수
  const syncRoutinesWithServer = useCallback(async (dateStr) => {
    if (!currentUserId) return;
    try {
      const res = await fetch(`/api/calendar?userId=${currentUserId}&date=${dateStr}`);
      if (!res.ok) return;
      const schedules = await res.json();
      if (!Array.isArray(schedules)) return;

      // dateStr 날짜 기준 복용 중('taking')인 처방전 ID Set
      const targetDateObj = parseDateOnly(dateStr) || new Date();
      const activeRxIdSet = new Set(
        allPrescriptions
          .filter((rx) => getPrescriptionStatus(rx.dispensedDate, rx.totalDays, targetDateObj).status === 'taking')
          .map((rx) => String(rx.prescriptionId))
      );

      setRoutineItems((currentItems) => {
        let hasChanges = false;
        // 1. 기존 루틴 항목에 매칭되는 서버 스케줄 상태 반영
        const updated = currentItems.map((item) => {
          const matchedSchedule = schedules.find((s) => {
            const sameMed =
              (s.medicationId && item.medicationId && String(s.medicationId) === String(item.medicationId)) ||
              (s.name && item.name && (s.name.includes(item.name) || item.name.includes(s.name)));
            if (!sameMed) return false;
            if (s.slot && item.slot) return isSameSlot(s.slot, item.slot);
            if (s.time && item.time) return s.time === item.time;
            return true;
          });

          if (matchedSchedule) {
            const scheduleTaken = Boolean(matchedSchedule.takenAt);
            if (
              item.scheduleId !== matchedSchedule.scheduleId ||
              item.taken !== scheduleTaken ||
              item.takenAt !== (matchedSchedule.takenAt || null) ||
              item.originHospital !== (matchedSchedule.hospitalName || item.originHospital) ||
              item.originDispensedDate !== (matchedSchedule.dispensedDate || item.originDispensedDate)
            ) {
              hasChanges = true;
              return {
                ...item,
                scheduleId: matchedSchedule.scheduleId,
                taken: scheduleTaken, // DB 기준 단일 진실 공급원
                takenAt: matchedSchedule.takenAt || null,
                originHospital: matchedSchedule.hospitalName || item.originHospital,
                originDispensedDate: matchedSchedule.dispensedDate || item.originDispensedDate,
                prescriptionNickname: matchedSchedule.prescriptionNickname || item.prescriptionNickname,
                prescriptionPurpose: matchedSchedule.prescriptionPurpose || item.prescriptionPurpose,
              };
            }
          }
          return item;
        });

        // 2. 처방전 외에 캘린더/상비약/영양제에서 등록된 단독 스케줄 항목 병합
        const unmatchedSchedules = schedules.filter((s) => {
          const alreadyInRoutine = updated.some((item) => {
            const sameMed =
              (s.medicationId && item.medicationId && String(s.medicationId) === String(item.medicationId)) ||
              (s.name && item.name && (s.name.includes(item.name) || item.name.includes(s.name)));
            if (!sameMed) return false;
            if (s.slot && item.slot) return isSameSlot(s.slot, item.slot);
            if (s.time && item.time) return s.time === item.time;
            return true;
          });
          if (alreadyInRoutine) return false;

          // 처방약 스케줄인 경우:
          if (s.prescriptionId) {
            // 특정 처방전 선택 모드일 때 해당 처방전이 아니면 제외
            if (selectedRxId !== 'all' && String(s.prescriptionId) !== String(selectedRxId)) {
              return false;
            }
            // dateStr 기준 해당 처방전이 복용 중('taking')이 아니라면 제외 (과거 처방약 스케줄 유입 차단)
            if (!activeRxIdSet.has(String(s.prescriptionId))) {
              return false;
            }
          } else {
            // 특정 처방전 선택 모드일 때는 단독 영양제/상비약 스케줄 제외
            if (selectedRxId !== 'all') {
              return false;
            }
          }

          return true;
        });

        if (unmatchedSchedules.length > 0) {
          hasChanges = true;
          const extraItems = unmatchedSchedules.map((s, idx) => {
            const timeStr = s.time || s.scheduledTime || '09:00';
            let slot = s.slot;
            let slotLabel = '아침';
            if (!slot) {
              const hour = parseInt(timeStr.slice(0, 2), 10);
              if (hour < 11) { slot = 'breakfast'; slotLabel = '아침'; }
              else if (hour < 16) { slot = 'lunch'; slotLabel = '점심'; }
              else if (hour < 21) { slot = 'dinner'; slotLabel = '저녁'; }
              else { slot = 'bedtime'; slotLabel = '취침 전'; }
            } else {
              slotLabel = (slot === 'breakfast' || slot === 'morning') ? '아침' : slot === 'lunch' ? '점심' : (slot === 'dinner' || slot === 'evening') ? '저녁' : '취침 전';
            }
            return {
              id: `sched-${s.scheduleId || idx}`,
              scheduleId: s.scheduleId,
              slot: slot,
              slotLabel: slotLabel,
              time: timeStr.length >= 5 ? timeStr.slice(0, 5) : timeStr,
              name: s.name || '복용약',
              dotColor: s.type === 'supplement' ? '#e09f3e' : '#5c9e76',
              taken: Boolean(s.takenAt),
              takenAt: s.takenAt || null,
              type: s.type === 'supplement' ? '영양제' : s.type === 'regular' ? '상비약' : '일반',
              rawType: s.type,
              notes: s.notes || s.memo,
              orderIndex: 100 + idx,
              medicationId: s.medicationId || '',
              prescriptionId: s.prescriptionId,
              originHospital: s.hospitalName,
              originDispensedDate: s.dispensedDate,
              prescriptionNickname: s.prescriptionNickname,
              prescriptionPurpose: s.prescriptionPurpose,
            };
          });
          const slotOrder = { breakfast: 1, lunch: 2, dinner: 3, bedtime: 4 };
          return [...updated, ...extraItems].sort((a, b) => {
            const orderDiff = (slotOrder[a.slot] || 99) - (slotOrder[b.slot] || 99);
            if (orderDiff !== 0) return orderDiff;
            return (a.time || '').localeCompare(b.time || '');
          });
        }

        // 실질적인 변경점이 없는 경우 기존 배열을 그대로 반환하여 불필요한 깜빡임 렌더링 방지
        return hasChanges ? updated : currentItems;
      });
    } catch (err) {
      console.warn('스케줄 DB 동기화 실패:', err);
    }
  }, [currentUserId, allPrescriptions, selectedRxId]);

  // 식사 시간이나 기준 일자별 유효 복약 약품 변경 시 복약 루틴 알림 시간 재계산 및 DB 스케줄 동기화
  useEffect(() => {
    if (!currentUserId) {
      setRoutineItems([]);
      return;
    }

    const dateStr = formatDateToHyphen(targetDate);
    if (activeMedsForTargetDate && activeMedsForTargetDate.length > 0) {
      const baseList = buildRoutineItems(activeMedsForTargetDate, mealTimes);
      // 기존에 체크되어 있던 상태(taken, takenAt, scheduleId)를 보존하여 화면 깜빡임(체크 해제 후 재체크) 원천 차단
      setRoutineItems((prev) => {
        if (!prev || prev.length === 0) return baseList;
        const prevMap = new Map();
        prev.forEach((p) => {
          if (p.id) prevMap.set(p.id, p);
          if (p.scheduleId) prevMap.set(`sid_${p.scheduleId}`, p);
          if (p.medicationId && p.slot) prevMap.set(`${p.medicationId}_${p.slot}`, p);
        });

        return baseList.map((item) => {
          const existing =
            prevMap.get(item.id) ||
            (item.scheduleId ? prevMap.get(`sid_${item.scheduleId}`) : null) ||
            prevMap.get(`${item.medicationId}_${item.slot}`);
          if (existing) {
            return {
              ...item,
              scheduleId: existing.scheduleId || item.scheduleId,
              taken: existing.taken ?? false,
              takenAt: existing.takenAt ?? null,
              originHospital: existing.originHospital || item.originHospital,
              originDispensedDate: existing.originDispensedDate || item.originDispensedDate,
              prescriptionNickname: existing.prescriptionNickname || item.prescriptionNickname,
              prescriptionPurpose: existing.prescriptionPurpose || item.prescriptionPurpose,
            };
          }
          return item;
        });
      });
      syncRoutinesWithServer(dateStr);
    } else {
      setRoutineItems([]);
      // 특정 처방전을 선택했을 때 해당 처방전이 복용 중이 아니면(과거/예정 처방전),
      // 서버에서 무관한 스케줄을 가져와 빈 루틴에 채우지 않도록 방지
      if (selectedRxId === 'all') {
        syncRoutinesWithServer(dateStr);
      }
    }
  }, [mealTimes, activeMedsForTargetDate, targetDate, currentUserId, syncRoutinesWithServer, selectedRxId]);

  // 캘린더 및 약등록 등 외부에서 복약 및 처방전 변경 시 메인 홈 실시간 동기화
  useEffect(() => {
    const handleIntakeSync = (e) => {
      // 1. 메인 홈 화면 자체에서 발생시킨 복약 토글은 재로드 스킵 (깜빡임 방지)
      if (e?.detail?.origin === 'main') return;

      const eventUserId = e?.detail?.userId;
      const eventDate = e?.detail?.date;
      const curDateStr = formatDateToHyphen(targetDate);

      // eventUserId가 없거나 현재 사용자 ID와 일치할 때 동기화
      if (!eventUserId || String(eventUserId) === String(currentUserId)) {
        // 처방전/약품 목록 및 복약 일정 실시간 최신화
        reloadPrescriptionAndRoutine();
        if (!eventDate || eventDate === curDateStr) {
          syncRoutinesWithServer(curDateStr);
        }
      }
    };
    window.addEventListener('jette-intake-updated', handleIntakeSync);
    return () => {
      window.removeEventListener('jette-intake-updated', handleIntakeSync);
    };
  }, [currentUserId, targetDate, syncRoutinesWithServer, reloadPrescriptionAndRoutine]);

  // 식사 시간 저장 핸들러
  const handleSaveMealTimes = async (newTimes) => {
    if (!currentUserId) {
      alert('로그인 후 식사 시간을 설정할 수 있습니다.');
      setIsMealModalOpen(false);
      return;
    }

    try {
      setMealTimes(newTimes);
      try {
        localStorage.setItem(`jette_meal_times_${currentUserId}`, JSON.stringify(newTimes));
      } catch {}

      await fetch('/api/users/meal-times', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          username: user?.username,
          breakfastTime: newTimes.breakfast,
          lunchTime: newTimes.lunch,
          dinnerTime: newTimes.dinner,
          bedtime: newTimes.bedtime,
        }),
      });
    } catch (err) {
      console.warn('식사 시간 저장 요청 실패:', err);
    } finally {
      setIsMealModalOpen(false);
    }
  };

  // 오늘의 복용 체크박스 토글 (서버 스케줄 DB 동기화)
  const toggleRoutine = async (id) => {
    if (!currentUserId) {
      alert('로그인 후 복약 체크를 이용하실 수 있습니다.');
      return;
    }
    const dateStr = formatDateToHyphen(targetDate);
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const nowIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    const targetItem = routineItems.find((i) => i.id === id);
    if (!targetItem) return;

    const nextTaken = !targetItem.taken;

    // 1. UI 즉시 낙관적 업데이트
    setRoutineItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, taken: nextTaken, takenAt: nextTaken ? nowIso : null }
          : item
      )
    );

    // 2. 서버 DB 반영
    if (targetItem.scheduleId) {
      try {
        await fetch(`/api/calendar/${targetItem.scheduleId}/toggle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taken: nextTaken, date: dateStr }),
        });
      } catch (err) {
        console.warn('스케줄 서버 동기화 실패:', err);
      }
    }

    // 3. 사이드바 및 캘린더 등 전역 UI에 복약 진척도 즉시 갱신 알림
    window.dispatchEvent(new CustomEvent('jette-intake-updated', {
      detail: { userId: currentUserId, date: dateStr, origin: 'main' }
    }));

    // 4. DB 최신 상태 재조회
    syncRoutinesWithServer(dateStr);
  };

  // 처방약 봉지 전체 일괄 복용 체크/해제
  const togglePouch = async (pouch, e) => {
    if (e) e.stopPropagation();
    if (!currentUserId) {
      alert('로그인 후 복약 체크를 이용하실 수 있습니다.');
      return;
    }
    const dateStr = formatDateToHyphen(targetDate);
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const nowIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    const allTaken = pouch.items.every((i) => i.taken);
    const nextTaken = !allTaken;
    const pouchItemIds = new Set(pouch.items.map((i) => i.id));
    const scheduleIds = pouch.items.map((i) => i.scheduleId).filter(Boolean);

    // 1. UI 즉시 낙관적 업데이트
    setRoutineItems((prev) =>
      prev.map((item) =>
        pouchItemIds.has(item.id)
          ? { ...item, taken: nextTaken, takenAt: nextTaken ? nowIso : null }
          : item
      )
    );

    // 2. 서버 DB 반영
    if (scheduleIds.length > 0) {
      try {
        const res = await fetch('/api/calendar/toggle-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scheduleIds, taken: nextTaken, date: dateStr }),
        });
        if (!res.ok) {
          await Promise.all(
            scheduleIds.map((sid) =>
              fetch(`/api/calendar/${sid}/toggle`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taken: nextTaken, date: dateStr }),
              })
            )
          );
        }
      } catch (err) {
        console.warn('봉지 복약 서버 동기화 실패:', err);
      }
    }

    // 3. 전역 UI 이벤트 발송
    window.dispatchEvent(
      new CustomEvent('jette-intake-updated', {
        detail: { userId: currentUserId, date: dateStr, origin: 'main' },
      })
    );

    // 4. DB 최신 상태 재조회
    syncRoutinesWithServer(dateStr);
  };

  // DB에 등록된 활성 복약 루틴 리스트
  // 1) 특정 처방전 선택 시:
  //    - 선택된 처방전이 targetDate 기준 복용 중('taking')이 아니라면 (과거 'completed' 또는 예정 'upcoming'),
  //      오늘의 복약 루틴 목록은 무조건 빈 배열 [] (오늘 복약 대상 아님)
  //    - 선택된 처방전이 targetDate 기준 복용 중('taking')이라면, 오직 해당 처방전(prescriptionId === selectedRxId) 소속 약품만 표시
  // 2) 전체 처방전 통합 선택 시(selectedRxId === 'all'):
  //    - targetDate에 실제로 복용 중('taking')인 처방전의 약품 및 해당 일자의 일반/상비약/영양제 스케줄만 표시
  //    - 이미 복용이 완료된 과거 처방전(또는 복용 전 처방전)의 처방약은 오늘의 복용 목록에 절대 노출되지 않음
  const activeRoutineList = useMemo(() => {
    if (!routineItems || routineItems.length === 0) return [];

    if (selectedRxId !== 'all') {
      const rx = allPrescriptions.find((r) => String(r.prescriptionId) === String(selectedRxId));
      if (!rx) return [];
      const st = getPrescriptionStatus(rx.dispensedDate, rx.totalDays, targetDate);
      if (st.status !== 'taking') {
        return [];
      }
      return routineItems.filter((item) => String(item.prescriptionId) === String(selectedRxId));
    }

    const activeRxIdSet = new Set(
      allPrescriptions
        .filter((rx) => getPrescriptionStatus(rx.dispensedDate, rx.totalDays, targetDate).status === 'taking')
        .map((rx) => String(rx.prescriptionId))
    );

    return routineItems.filter((item) => {
      if (item.prescriptionId) {
        return activeRxIdSet.has(String(item.prescriptionId));
      }
      return true;
    });
  }, [routineItems, selectedRxId, allPrescriptions, targetDate]);

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
        activeMedList={activeMedList}
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
