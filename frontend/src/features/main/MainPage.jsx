import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import MedicationDetailModal from './components/MedicationDetailModal';
import CautionInfoModal from './components/CautionInfoModal';
import MealTimeSettingModal from './components/MealTimeSettingModal';
import {
  DEFAULT_MEAL_TIMES,
  DOT_COLORS,
  parseDateOnly,
  formatDateToHyphen,
  formatDateToDot,
  formatDateWithDay,
  formatDateShort,
  formatTimeOnly,
  getTargetDateDiffText,
  getPrescriptionStatus,
  cleanCategoryName,
  getMedicineCaution,
  mapPrescriptionToState,
  generateMedicationNotes,
  addMinutes,
  getIntakeSlots,
  buildRoutineItems,
  groupRoutineItemsByPouch,
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
  const [isRxDropdownOpen, setIsRxDropdownOpen] = useState(false);
  const rxDropdownRef = useRef(null);
  const [targetDate, setTargetDate] = useState(() => new Date());
  const dateInputRef = useRef(null);

  // 처방전 선택 드롭다운 바깥 클릭 감지하여 닫기
  useEffect(() => {
    function handleClickOutside(event) {
      if (rxDropdownRef.current && !rxDropdownRef.current.contains(event.target)) {
        setIsRxDropdownOpen(false);
      }
    }
    if (isRxDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isRxDropdownOpen]);

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
  const [medDetailExtra, setMedDetailExtra] = useState(null);
  const [isCautionModalOpen, setIsCautionModalOpen] = useState(false);

  // 약품 상세 모달 열릴 때 AI 요약 및 최신 정보 On-Demand 패치
  useEffect(() => {
    if (!selectedMedDetail?.medicationId) {
      setMedDetailExtra(null);
      return;
    }
    let isCancelled = false;
    fetch(`/api/guides/medications/${encodeURIComponent(selectedMedDetail.medicationId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isCancelled && data) {
          setMedDetailExtra(data);
        }
      })
      .catch(() => {});
    return () => {
      isCancelled = true;
    };
  }, [selectedMedDetail?.medicationId]);

  // 메인 인라인 검색 상태
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);

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

  // 처방약 봉지 펼침/접힘 상태
  const [expandedPouches, setExpandedPouches] = useState({});

  const togglePouchExpand = (pouchKey, e) => {
    if (e) e.stopPropagation();
    setExpandedPouches((prev) => ({
      ...prev,
      [pouchKey]: !prev[pouchKey],
    }));
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
  const allRoutineUnits = useMemo(() => groupRoutineItemsByPouch(activeRoutineList), [activeRoutineList]);
  const takenUnitsCount = allRoutineUnits.filter((u) => u.isPouch ? u.items.every((i) => i.taken) : u.taken).length;
  const totalUnitsCount = allRoutineUnits.length;
  const takenCount = takenUnitsCount;
  const totalCount = totalUnitsCount;

  // 복약 루틴 시간대 탭 선택 상태 ('all' | 'breakfast' | 'lunch' | 'dinner' | 'bedtime')
  const [selectedRoutineSlot, setSelectedRoutineSlot] = useState(() => {
    const h = new Date().getHours();
    if (h < 11) return 'breakfast';
    if (h < 17) return 'lunch';
    return 'dinner';
  });

  const slotMeta = [
    { key: 'breakfast', label: '아침', defaultTime: mealTimes.breakfast || '07:30' },
    { key: 'lunch', label: '점심', defaultTime: mealTimes.lunch || '12:00' },
    { key: 'dinner', label: '저녁', defaultTime: mealTimes.dinner || '18:30' },
    { key: 'bedtime', label: '취침전', defaultTime: mealTimes.bedtime || '22:00' },
  ];

  const groupedSlots = slotMeta
    .map((meta) => {
      const items = activeRoutineList.filter((i) => i.slot === meta.key);
      const units = groupRoutineItemsByPouch(items);
      const firstTime = items[0]?.time || addMinutes(meta.defaultTime, 30);
      return {
        slot: meta.key,
        label: meta.label,
        time: firstTime,
        items,
        units,
      };
    })
    .filter((g) => g.items.length > 0);

  const activeSlotKey =
    selectedRoutineSlot === 'all' || groupedSlots.some((g) => g.slot === selectedRoutineSlot)
      ? selectedRoutineSlot
      : (groupedSlots[0]?.slot || 'all');

  const routineSlotTabs = [
    {
      key: 'all',
      label: '전체',
      timeHint: '',
      taken: takenUnitsCount,
      total: totalUnitsCount,
      isAllDone: totalUnitsCount > 0 && takenUnitsCount === totalUnitsCount,
    },
    ...groupedSlots.map((g) => {
      const tCount = g.units.filter((u) => u.isPouch ? u.items.every((i) => i.taken) : u.taken).length;
      return {
        key: g.slot,
        label: g.label,
        timeHint: g.time,
        taken: tCount,
        total: g.units.length,
        isAllDone: g.units.length > 0 && tCount === g.units.length,
      };
    }),
  ];

  const displayedRoutineUnits =
    activeSlotKey === 'all'
      ? allRoutineUnits
      : groupRoutineItemsByPouch(activeRoutineList.filter((i) => i.slot === activeSlotKey));

  // 메인 검색 핸들러
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;

    let active = true;
    const timer = setTimeout(async () => {
      setIsSearching(true);
      setShowSearchResults(true);
      try {
        const res = await fetch(`/api/medications/search?q=${encodeURIComponent(trimmed)}&page=1`);
        if (res.ok) {
          const data = await res.json();
          if (active) setSearchResults(data.items || []);
        } else {
          if (active) setSearchResults([]);
        }
      } catch {
        if (active) setSearchResults([]);
      } finally {
        if (active) setIsSearching(false);
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  const handleQueryChange = (e) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (!val.trim()) {
      setSearchResults([]);
      setShowSearchResults(false);
      setIsSearching(false);
    }
  };

  const handleClearQuery = () => {
    setSearchQuery('');
    setSearchResults([]);
    setShowSearchResults(false);
    setIsSearching(false);
  };

  const renderRoutineEntry = (entry) => {
    if (entry.isPouch) {
      const allTaken = entry.items.every((i) => i.taken);
      const isExpanded = Boolean(expandedPouches[entry.pouchKey]);
      const takenCount = entry.items.filter((i) => i.taken).length;
      const latestTaken = entry.items.find((i) => i.taken && i.takenAt)?.takenAt;

      const pouchTitle = entry.nickname
        ? entry.nickname
        : entry.purpose
        ? (entry.purpose.length > 25 ? entry.purpose.slice(0, 23) + '…' : entry.purpose)
        : `${entry.originHospital || '처방'}약`;

      const hospitalDateText = `${entry.originHospital || '의료기관'}${entry.dispensedDate ? ` · ${entry.dispensedDate.slice(0, 10).replace(/-/g, '.')} 조제` : ''}`;
      const pillsSummary = `${entry.items[0]?.name || '처방약'}${entry.items.length > 1 ? ` 외 ${entry.items.length - 1}종 (총 ${entry.items.length}종류)` : ' (1종류)'}`;

      return (
        <div
          key={entry.pouchKey}
          className={`routine-pouch-card ${allTaken ? 'is-taken' : ''}`}
        >
          <div
            className="routine-pouch-header"
            onClick={(e) => togglePouch(entry, e)}
          >
            <div className="routine-item-left">
              <div
                className={`custom-checkbox ${allTaken ? 'checked' : ''}`}
                onClick={(e) => togglePouch(entry, e)}
                title={allTaken ? '복용 취소' : '봉지 전체 복용 완료'}
              >
                {allTaken && (
                  <svg viewBox="0 0 14 14" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 7l3 3 5-6" />
                  </svg>
                )}
              </div>

              <div className="pouch-icon-badge" title="약봉지 (1포 처방약)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="18" height="18" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>

              <div className="pouch-info-col">
                <div className="pouch-title-row">
                  <span className="pouch-name">
                    [{entry.slotLabel || '정시'} 1포] {pouchTitle}
                  </span>
                  <span className={`pouch-count-badge ${allTaken ? 'done' : ''}`}>
                    {allTaken ? '전체 복용 완료' : `${takenCount}/${entry.items.length}종`}
                  </span>
                </div>
                <div className="pouch-meta-row">
                  <span className="pouch-hospital-date">{hospitalDateText}</span>
                  <span className="pouch-summary-text">{pillsSummary}</span>
                </div>
              </div>
            </div>

            <div className="routine-item-right" onClick={(e) => e.stopPropagation()}>
              {allTaken && latestTaken && (
                <span className="routine-taken-time">
                  {formatTimeOnly(latestTaken)} 복용
                </span>
              )}
              <button
                type="button"
                className="btn-pouch-toggle"
                onClick={(e) => togglePouchExpand(entry.pouchKey, e)}
                title={isExpanded ? '처방약 목록 접기' : '포함된 처방약 보기'}
              >
                {isExpanded ? '접기 ▲' : `약 목록 (${entry.items.length}종) ▼`}
              </button>
            </div>
          </div>

          {/* 펼침 영역: 개별 처방약 목록 */}
          {isExpanded && (
            <div className="pouch-expanded-items">
              <div className="pouch-expanded-header">
                <span>봉지에 포함된 개별 처방약 목록 (개별 복용 체크 가능)</span>
              </div>
              {entry.items.map((subItem) => {
                const rawCategory = subItem.rawClassName || subItem.className || subItem.efficacy || '';
                const cleanCat = cleanCategoryName(rawCategory);
                const displayEfficacy = cleanCat.length > 12 ? cleanCat.slice(0, 11) + '…' : cleanCat;

                return (
                  <div
                    key={subItem.id}
                    className={`pouch-subitem-row ${subItem.taken ? 'is-taken' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleRoutine(subItem.id);
                    }}
                  >
                    <div className="routine-item-left">
                      <div className={`custom-checkbox sub-checkbox ${subItem.taken ? 'checked' : ''}`}>
                        {subItem.taken && (
                          <svg viewBox="0 0 14 14" fill="none" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 7l3 3 5-6" />
                          </svg>
                        )}
                      </div>
                      <span className="pouch-subitem-name">{subItem.name}</span>
                    </div>

                    <div className="routine-item-right" onClick={(e) => e.stopPropagation()}>
                      {displayEfficacy && (
                        <button
                          type="button"
                          className="subitem-efficacy-chip"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedMedDetail(subItem.rawMed || subItem);
                          }}
                          title={`${rawCategory ? `${rawCategory} · ` : ''}클릭 시 상세 복약 정보`}
                        >
                          <span>{displayEfficacy}</span>
                          <svg className="chip-info-icon" viewBox="0 0 20 20" fill="currentColor" width="11" height="11">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                          </svg>
                        </button>
                      )}

                      {subItem.taken && subItem.takenAt && (
                        <span className="routine-taken-time">
                          {formatTimeOnly(subItem.takenAt)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    // 단일 항목 (영양제, 상비약 등)
    const isSupplement = entry.type === '영양제' || entry.rawType === 'supplement';
    const itemCategory = isSupplement ? 'supplement' : 'regular';
    const categoryLabel = isSupplement ? '영양제' : (entry.type === '상비약' ? '상비약' : (entry.type || '상비약'));
    const isSingleTaken = Boolean(entry.taken);
    const subDescText = entry.notes || (isSupplement ? '일일 건강 영양제 · 활력 보충' : '가정 상비의약품 · 증상 완화');

    return (
      <div
        key={entry.id}
        className={`routine-single-card ${itemCategory} ${isSingleTaken ? 'is-taken' : ''}`}
        onClick={() => toggleRoutine(entry.id)}
      >
        <div className="routine-item-left">
          <div
            className={`custom-checkbox ${itemCategory}-checkbox ${isSingleTaken ? 'checked' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              toggleRoutine(entry.id);
            }}
            title={isSingleTaken ? '복용 취소' : '복용 완료 체크'}
          >
            {isSingleTaken && (
              <svg viewBox="0 0 14 14" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 7l3 3 5-6" />
              </svg>
            )}
          </div>

          <div
            className={`single-card-icon-badge ${itemCategory}`}
            title={`${categoryLabel} (${entry.name})`}
          >
            {isSupplement ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="18" height="18" strokeWidth="2">
                <circle cx="12" cy="12" r="4" strokeWidth="2" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v3m0 14v3M4.93 4.93l2.12 2.12m9.9 9.9l2.12 2.12M2 12h3m14 0h3M4.93 19.07l2.12-2.12m9.9-9.9l2.12-2.12" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="18" height="18" strokeWidth="2">
                <rect x="3" y="6" width="18" height="14" rx="3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M12 10v6m-3-3h6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>

          <div className="single-card-info-col">
            <div className="single-card-title-row">
              <span className={`single-card-time-slot ${itemCategory}`}>
                [{entry.slotLabel || '정시'}{entry.time ? ` ${entry.time}` : ''}]
              </span>
              <strong className="single-card-name" title={entry.name}>
                {entry.name}
              </strong>
              <span className={`single-card-type-badge ${itemCategory}`}>
                {categoryLabel}
              </span>
              {selectedRxId === 'all' && entry.originHospital && (
                <span className="routine-origin-hospital-chip">{entry.originHospital}</span>
              )}
            </div>
            <div className="single-card-meta-row">
              <span className="single-card-sub-desc">{subDescText}</span>
            </div>
          </div>
        </div>

        <div className="routine-item-right" onClick={(e) => e.stopPropagation()}>
          {isSingleTaken && entry.takenAt ? (
            <span className={`routine-taken-time ${itemCategory}`}>
              {formatTimeOnly(entry.takenAt)} 복용 완료
            </span>
          ) : (
            <span className={`routine-pending-badge ${itemCategory}`}>
              복용 대기
            </span>
          )}
        </div>
      </div>
    );
  };

  const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const monthNames = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
  const greetingDateStr = `${dayNames[targetDate.getDay()]}, ${targetDate.getDate()} ${monthNames[targetDate.getMonth()]}`;
  const routineDateBadge = `${String(targetDate.getMonth() + 1).padStart(2, '0')}.${String(targetDate.getDate()).padStart(2, '0')}`;

  return (
    <div className="main-page-wrapper">
      {/* 1. 상단 인사말 및 복약 날짜 네비게이터 영역 */}
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
              onClick={handlePrevDay}
              title="하루 전으로 이동"
            >
              ‹
            </button>
            <div
              className="date-nav-display-box"
              onClick={() => dateInputRef.current?.showPicker?.() || dateInputRef.current?.focus()}
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
              <input
                ref={dateInputRef}
                type="date"
                className="date-nav-hidden-picker"
                value={formatDateToHyphen(targetDate)}
                onChange={(e) => {
                  const parsed = parseDateOnly(e.target.value);
                  if (parsed) setTargetDate(parsed);
                }}
              />
            </div>
            <button
              type="button"
              className="date-nav-arrow-btn"
              onClick={handleNextDay}
              title="다음 날로 이동"
            >
              ›
            </button>
            {!isTargetToday && (
              <button
                type="button"
                className="date-nav-return-today-btn"
                onClick={handleResetToday}
                title="오늘 날짜로 복귀"
              >
                오늘로 복귀
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 2. 약 검색창 (메인.png 검색 바) */}
      <section className="main-search-section">
        <div className="main-search-bar">
          <svg className="main-search-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 19l-4-4m0-7A7 7 0 1 1 1 8a7 7 0 0 1 14 0Z" />
          </svg>
          <input
            type="text"
            className="main-search-input"
            placeholder="약 이름을 검색해 보세요"
            value={searchQuery}
            onChange={handleQueryChange}
            onFocus={() => searchQuery.trim() && setShowSearchResults(true)}
          />
          {searchQuery && (
            <button
              type="button"
              className="main-search-clear"
              onClick={handleClearQuery}
            >
              ✕
            </button>
          )}
        </div>

        {/* 검색 결과 팝업 */}
        {showSearchResults && searchQuery.trim() && (
          <div className="main-search-results-modal">
            <div className="results-inner-head">
              <span>검색된 약품 ({searchResults.length}건)</span>
              <button type="button" onClick={() => setShowSearchResults(false)}>닫기</button>
            </div>
            {isSearching ? (
              <div className="results-loading">약 정보를 찾고 있습니다...</div>
            ) : searchResults.length > 0 ? (
              <div className="results-scroll-area">
                {searchResults.map((item, idx) => (
                  <div
                    key={idx}
                    className="result-row-card"
                    onClick={() => {
                      setShowSearchResults(false);
                      navigate('/chat');
                    }}
                  >
                    <div>
                      <strong>{item.itemName}</strong>
                      <span className="entp-label">{item.entpName}</span>
                      <p className="efficacy-label">{item.efficacy || item.desc}</p>
                    </div>
                    <span className="view-link">챗봇에서 약 조회 →</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="results-none">
                검색된 약품이 없습니다. 다른 이름으로 검색해 보세요.
              </div>
            )}
          </div>
        )}
      </section>

      {/* 3. 상단 핵심: 오늘의 복약 루틴 (TODAY'S ROUTINE) */}
      <section className="today-routine-card today-routine-dark-card">
        <div className="routine-header-row">
          <div className="routine-header-left">
            <span className="routine-label">TODAY'S ROUTINE</span>
            {!isTargetToday && (
              <span className="routine-past-pill">{getTargetDateDiffText(targetDate)} 기록</span>
            )}
          </div>
          <div className="routine-header-actions">
            <button
              type="button"
              className="med-register-quick-btn"
              onClick={() => navigate('/medication/register')}
              title="처방전, 상비약, 영양제 등록 페이지로 이동"
            >
              + 약 등록
            </button>
            <span className="routine-date-badge">{routineDateBadge}</span>
            {!isTargetToday && (
              <button
                type="button"
                className="routine-today-return-btn"
                onClick={handleResetToday}
                title="오늘 날짜로 이동"
              >
                오늘로 복귀
              </button>
            )}
            <button
              type="button"
              className="meal-setting-btn"
              onClick={() => setIsMealModalOpen(true)}
              title="아침/점심/저녁 식사 및 취침 시간 설정"
            >
              <svg className="setting-btn-icon" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>
              식사 시간 설정
            </button>
          </div>
        </div>

        <div className="routine-title-row">
          <h3 className="routine-title">
            {isTargetToday ? '오늘의 복용' : `${formatDateShort(targetDate)} 복약 루틴`}{' '}
            <span className="taken-highlight">{takenCount}</span>/{totalCount}
          </h3>
          <span className="routine-rate-tip">
            {totalCount === 0
              ? currentRxStatus?.status === 'completed'
                ? '해당 일자에는 복용이 완료되어 일정이 없습니다.'
                : currentRxStatus?.status === 'upcoming'
                ? '해당 일자는 아직 복용 시작 전입니다.'
                : '등록된 복용 일정이 없습니다.'
              : !isTargetToday
              ? `${formatDateWithDay(targetDate)} 기준 복약 루틴을 확인하고 있습니다`
              : takenCount === totalCount
              ? '오늘 모든 복약을 완료했습니다!'
              : '시간대별 탭을 선택하여 간편하게 복용을 체크하세요'}
          </span>
        </div>

        {/* 복약 루틴 시간대 탭 (아침, 점심, 저녁, 전체) */}
        {activeRoutineList.length > 0 && (
          <div className="routine-slot-tabs" role="tablist">
            {routineSlotTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={activeSlotKey === tab.key}
                className={`routine-slot-tab ${activeSlotKey === tab.key ? 'active' : ''} ${tab.isAllDone ? 'is-all-done' : ''}`}
                onClick={() => setSelectedRoutineSlot(tab.key)}
              >
                <span className="slot-tab-label">{tab.label}</span>
                {tab.timeHint && <span className="slot-tab-time">{tab.timeHint}</span>}
                <span className="slot-tab-badge">
                  {tab.isAllDone ? '완료' : `${tab.taken}/${tab.total}`}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* 체크리스트 항목들 */}
        <div className="routine-items-list">
          {activeRoutineList.length === 0 ? (
            <div className="routine-empty-box">
              <div className="routine-empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>

              {hasPrescription ? (
                <>
                  <h4 className="routine-empty-title">
                    {currentRxStatus?.status === 'completed'
                      ? '복용이 완료된 처방전입니다.'
                      : currentRxStatus?.status === 'upcoming'
                      ? '복용 시작 전입니다.'
                      : '복용 일정이 없습니다.'}
                  </h4>
                  <p className="routine-empty-text">
                    {currentRxStatus?.status === 'completed'
                      ? '선택하신 날짜에는 복용할 약이 없습니다. 아래 처방 약품 목록에서 약 정보를 확인하시거나, 당시 복약 체크 기록으로 바로 이동하실 수 있습니다.'
                      : currentRxStatus?.status === 'upcoming'
                      ? `복용 시작일(${prescriptionData?.dispensedDate || ''})부터 복약 루틴이 표시됩니다.`
                      : '선택하신 날짜에는 등록된 복약 일정이 없습니다.'}
                  </p>
                  {currentRxStatus?.status === 'completed' && prescriptionData?.dispensedDate && (
                    <button
                      type="button"
                      className="routine-jump-past-btn"
                      onClick={() => handleJumpToDate(prescriptionData.dispensedDate)}
                    >
                      당시 복약 기록 확인하기 ({prescriptionData.dispensedDate}) &rarr;
                    </button>
                  )}
                </>
              ) : (
                <>
                  <h4 className="routine-empty-title">등록된 복약 일정이 없습니다.</h4>
                  <p className="routine-empty-text">
                    처방전 사진을 등록하거나 상비약, 영양제를 등록하여 매일의 복약 루틴을 편리하게 관리해 보세요.
                  </p>
                  <button
                    type="button"
                    className="routine-empty-cta-btn"
                    onClick={() => navigate('/medication/register')}
                  >
                    + 내 약 등록하러 가기 →
                  </button>
                </>
              )}
            </div>
          ) : activeSlotKey === 'all' ? (
            /* 전체 보기 모드: 시간대별 섹션으로 그룹화 표시 */
            <div className="routine-grouped-container">
              {groupedSlots.map((group) => {
                const groupTaken = group.units.filter((u) => u.isPouch ? u.items.every((i) => i.taken) : u.taken).length;
                const groupAllDone = group.units.length > 0 && groupTaken === group.units.length;
                return (
                  <div key={group.slot} className="routine-slot-section">
                    <div className="slot-section-header">
                      <div className="slot-section-info">
                        <span className="slot-section-badge">{group.label}</span>
                        <span className="slot-section-time">{group.time} 복용 예정</span>
                      </div>
                      <span className={`slot-section-counter ${groupAllDone ? 'done' : ''}`}>
                        {groupAllDone ? '복용 완료' : `${groupTaken} / ${group.units.length} 완료`}
                      </span>
                    </div>

                    <div className="slot-section-items">
                      {group.units.map((entry) => renderRoutineEntry(entry))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* 개별 시간대 탭 선택 모드: 선택된 시간대의 약품만 표시 */
            <div className="routine-single-slot-container">
              <div className="slot-single-header">
                <span className="slot-single-title">
                  {routineSlotTabs.find((t) => t.key === activeSlotKey)?.label} 복약 리스트
                </span>
                <span className="slot-single-count">
                  {displayedRoutineUnits.filter((u) => u.isPouch ? u.items.every((i) => i.taken) : u.taken).length} / {displayedRoutineUnits.length} 완료
                </span>
              </div>

              {displayedRoutineUnits.map((entry) => renderRoutineEntry(entry))}
            </div>
          )}
        </div>

        {/* 복약 기록 전체 보기 버튼 (와이어프레임 캘린더 연동) */}
        <div className="routine-footer-action">
          <button
            type="button"
            className="view-all-records-btn"
            onClick={() => navigate('/calendar')}
          >
            복약 기록 전체 보기 <span className="arrow-left">←</span>
          </button>
        </div>
      </section>

      {/* 4. 처방전 정보 & 주의사항 (처방전 등록 시 상세 표시) */}
      {hasPrescription ? (
        <>
          {/* 0. 처방전 선택 탭 바 (전체 통합 및 개별 처방전 전환) */}
          {/* 0. 처방전 선택 드롭다운 셀렉터 (가로 스크롤 제거 및 직관적 선택) */}
          <section className="rx-selector-section">
            <div className="rx-selector-header">
              <div className="rx-selector-header-left">
                <span className="rx-tabs-title-badge">등록 처방전</span>
                <span className="rx-tabs-count-title">처방전 선택 ({allPrescriptions.length}건)</span>
              </div>
              <button
                type="button"
                className="rx-manage-shortcut-btn"
                onClick={() => navigate('/medication/register?tab=prescription')}
                title="내 처방전 목록/수정/삭제 관리"
              >
                처방전 관리 &gt;
              </button>
            </div>

            <div className="rx-dropdown-container" ref={rxDropdownRef}>
              <button
                type="button"
                className={`rx-dropdown-trigger ${isRxDropdownOpen ? 'open' : ''}`}
                onClick={() => setIsRxDropdownOpen((prev) => !prev)}
                aria-expanded={isRxDropdownOpen}
                aria-haspopup="listbox"
              >
                <div className="rx-dropdown-trigger-left">
                  <span className="rx-dropdown-icon">
                    <svg viewBox="0 0 20 20" fill="currentColor">
                      <path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 011 1v10a1 1 0 01-1 1H5a1 1 0 01-1-1V7zm3 4a1 1 0 000 2h6a1 1 0 100-2H7z" />
                    </svg>
                  </span>
                  <div className="rx-dropdown-trigger-info">
                    <strong className="rx-dropdown-trigger-title">
                      {selectedRxId === 'all'
                        ? `전체 처방전 통합 (${allPrescriptions.length}건)`
                        : (currentPrescriptionView?.hospitalName || '의료기관')}
                    </strong>
                    <span className="rx-dropdown-trigger-sub">
                      {selectedRxId === 'all'
                        ? '모든 등록 처방전 약품 종합 루틴'
                        : `조제일 ${currentPrescriptionView?.dispensedDate || '미상'} · ${currentPrescriptionView?.totalDays || 0}일분 · 약품 ${currentPrescriptionView?.items?.length || 0}종`}
                    </span>
                  </div>
                </div>

                <div className="rx-dropdown-trigger-right">
                  {currentRxStatus && (
                    <span className={`rx-tab-badge-chip ${currentRxStatus.status}`}>
                      {currentRxStatus.badgeText}
                    </span>
                  )}
                  <span className={`rx-dropdown-arrow-icon ${isRxDropdownOpen ? 'rotated' : ''}`}>
                    <svg viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </span>
                </div>
              </button>

              {isRxDropdownOpen && (
                <div className="rx-dropdown-menu" role="listbox">
                  {/* 전체 처방전 통합 옵션 */}
                  <div
                    role="option"
                    aria-selected={selectedRxId === 'all'}
                    className={`rx-dropdown-option ${selectedRxId === 'all' ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedRxId('all');
                      setIsRxDropdownOpen(false);
                      setTargetDate(new Date());
                    }}
                  >
                    <div className="rx-dropdown-option-left">
                      <span className="rx-dropdown-option-icon all">
                        <svg viewBox="0 0 20 20" fill="currentColor">
                          <path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 011 1v10a1 1 0 01-1 1H5a1 1 0 01-1-1V7zm3 4a1 1 0 000 2h6a1 1 0 100-2H7z" />
                        </svg>
                      </span>
                      <div className="rx-dropdown-option-info">
                        <strong className="rx-dropdown-option-title">전체 처방전 ({allPrescriptions.length}건) 통합 조회</strong>
                        <span className="rx-dropdown-option-sub">등록된 모든 처방전의 약품을 합산하여 루틴을 확인합니다.</span>
                      </div>
                    </div>
                    <span className="rx-tab-badge-chip all">통합</span>
                  </div>

                  <div className="rx-dropdown-divider" />

                  {/* 개별 처방전 옵션 목록 */}
                  {allPrescriptions.map((rx) => {
                    const today = new Date();
                    const todayStatus = getPrescriptionStatus(rx.dispensedDate, rx.totalDays, today);
                    const rxStatus = getPrescriptionStatus(rx.dispensedDate, rx.totalDays, targetDate);
                    const isSelected = String(selectedRxId) === String(rx.prescriptionId);
                    return (
                      <div
                        key={rx.prescriptionId}
                        role="option"
                        aria-selected={isSelected}
                        className={`rx-dropdown-option ${isSelected ? 'active' : ''}`}
                        onClick={() => {
                          setSelectedRxId(rx.prescriptionId);
                          setIsRxDropdownOpen(false);
                          if (todayStatus.status === 'taking') {
                            setTargetDate(today);
                          }
                        }}
                      >
                        <div className="rx-dropdown-option-left">
                          <span className="rx-dropdown-option-icon rx">
                            <svg viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M10 2a1 1 0 011 1v6h6a1 1 0 110 2h-6v6a1 1 0 11-2 0v-6H3a1 1 0 110-2h6V3a1 1 0 011-1z" clipRule="evenodd" />
                            </svg>
                          </span>
                          <div className="rx-dropdown-option-info">
                            <div className="rx-dropdown-option-title-row">
                              <strong className="rx-dropdown-option-title">{rx.hospitalName || '의료기관'}</strong>
                              {rx.doctorName && <span className="rx-dropdown-option-doctor">{rx.doctorName}</span>}
                            </div>
                            <span className="rx-dropdown-option-sub">
                              조제일 {rx.dispensedDate || '미상'} · {rx.totalDays}일 처방 · 약품 {rx.items?.length || 0}종
                            </span>
                          </div>
                        </div>
                        <span className={`rx-tab-badge-chip ${rxStatus.status}`}>
                          {rxStatus.badgeText}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {/* 처방전 요약 바 (PRESCRIPTION SUMMARY) */}
          <section className="prescription-summary-card">
            <div className="summary-col-left">
              <div className="summary-meta-top-row">
                <span className="summary-meta-label">
                  {selectedRxId === 'all' ? 'ALL PRESCRIPTIONS SUMMARY' : 'PRESCRIPTION SUMMARY'}
                </span>
                {currentRxStatus && (
                  <span className={`summary-status-pill ${currentRxStatus.status}`}>
                    {currentRxStatus.badgeText}
                  </span>
                )}
              </div>
              <h2 className="summary-date-title">
                {selectedRxId === 'all'
                  ? `전체 처방전 (${allPrescriptions.length}건) 통합 조회`
                  : (prescriptionData?.dispensedDate ? `${prescriptionData.dispensedDate} 조제 처방전` : '처방전 상세')}
              </h2>
              <div className="summary-hospital-info-group">
                <span className="summary-hospital-name">
                  {prescriptionData?.hospitalName || '의료기관'}
                </span>
                {selectedRxId !== 'all' && prescriptionData?.doctorName && (
                  <>
                    <span className="summary-info-divider">·</span>
                    <span className="summary-doctor-name">
                      {prescriptionData.doctorName}
                    </span>
                  </>
                )}
                {selectedRxId !== 'all' && currentRxStatus?.startDateStr && (
                  <span className="summary-period-chip">
                    기간: {currentRxStatus.startDateStr} ~ {currentRxStatus.endDateStr}
                  </span>
                )}
              </div>

              {/* AI 처방전 가이드: 처방 목적 및 핵심 요약 */}
              {prescriptionData?.aiGuide?.purpose && (
                <div className="summary-ai-guide-banner">
                  <div className="ai-guide-purpose-row">
                    <span className="ai-guide-tag">
                      {selectedRxId === 'all' ? '통합 복약 안내' : '이 처방을 받은 이유 (AI)'}
                    </span>
                    <strong className="ai-guide-purpose-text">{prescriptionData.aiGuide.purpose}</strong>
                  </div>
                  {prescriptionData.aiGuide.summary && (
                    <p className="ai-guide-summary-text">{prescriptionData.aiGuide.summary}</p>
                  )}
                </div>
              )}
            </div>

            <div className="summary-stats-group">
              <div className="stat-unit">
                <span className="stat-number">
                  {selectedRxId === 'all' ? allPrescriptions.length : (prescriptionData?.totalDays || 0)}
                </span>
                <span className="stat-label">
                  {selectedRxId === 'all' ? '등록 처방전' : (currentRxStatus?.status === 'taking' ? `${currentRxStatus.dayNum}일차 / 총일수` : '총 복용 일수')}
                </span>
              </div>
              <div className="stat-divider" />
              <div className="stat-unit">
                <span className="stat-number">{displayedMedList.length}</span>
                <span className="stat-label">처방 약품</span>
              </div>
            </div>

            <div className="summary-col-right">
              {selectedRxId !== 'all' && currentRxStatus?.status === 'completed' && prescriptionData?.dispensedDate && (
                <button
                  type="button"
                  className="summary-past-jump-btn"
                  onClick={() => handleJumpToDate(prescriptionData.dispensedDate)}
                  title="당시 복약 기간으로 이동하여 체크 기록 확인"
                >
                  당시 복약 기록 보기
                </button>
              )}
              <button
                type="button"
                className="new-prescription-btn"
                onClick={() => navigate('/medication/register?tab=prescription')}
              >
                + 처방전 · 약봉투 등록
              </button>
              <button
                type="button"
                className="summary-guide-btn"
                onClick={() => navigate('/guide')}
              >
                내 약 관리 등록 →
              </button>
            </div>
          </section>

          {/* 2단 그리드: 처방 약품 목록 (좌) + 복용 주의점 (우) */}
          <section className="main-two-column-grid">
            {/* 좌측: 처방 약품 (PRESCRIBED MEDICINES) */}
            <div className="prescribed-meds-card">
              <div className="card-top-row">
                <div>
                  <span className="card-sub-label">PRESCRIBED MEDICINES</span>
                  <h3 className="card-main-title">
                    처방 약품 <span className="count-num">{String(displayedMedList.length).padStart(2, '0')}</span>
                  </h3>
                </div>
                <button
                  type="button"
                  className="card-link-action"
                  onClick={() => navigate('/medication/register?tab=prescription')}
                  title="내 처방전 목록 및 수정/삭제 관리"
                >
                  처방전 관리 &gt;
                </button>
              </div>

              {/* 과거 복용 완료 처방전인 경우 안내 배너 및 바로가기 */}
              {currentRxStatus?.status === 'completed' && selectedRxId !== 'all' && (
                <div className="past-rx-info-banner">
                  <div className="past-rx-info-left">
                    <span className="past-rx-badge">복용 완료 기록</span>
                    <span className="past-rx-desc">
                      조제일 {prescriptionData?.dispensedDate} ({prescriptionData?.totalDays}일 처방) 완료 내역입니다.
                    </span>
                  </div>
                  {prescriptionData?.dispensedDate && (
                    <button
                      type="button"
                      className="past-rx-jump-action"
                      onClick={() => handleJumpToDate(prescriptionData.dispensedDate)}
                      title="당시 복약 체크 기록 확인"
                    >
                      당시 복약 기록 &rarr;
                    </button>
                  )}
                </div>
              )}

              <div className="meds-list-divider" />

              <div className="meds-vertical-list">
                {displayedMedList.length === 0 ? (
                  <div className="meds-empty-notice">
                    <div className="meds-empty-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <strong className="meds-empty-title">
                      {currentRxStatus?.status === 'upcoming'
                        ? '복용 시작 전입니다.'
                        : '등록된 처방 약품이 없습니다.'}
                    </strong>
                    <p className="meds-empty-desc">
                      {currentRxStatus?.status === 'upcoming'
                        ? `조제일(${prescriptionData?.dispensedDate || ''})부터 처방 약품 목록이 표시됩니다.`
                        : '처방전을 등록하시거나 유효한 복약 날짜를 선택해 주세요.'}
                    </p>
                  </div>
                ) : selectedRxId === 'all' ? (
                  /* 통합 처방전 모드: 처방전별로 묶어서 그룹핑하여 표시 */
                  groupedPrescriptionMeds.map((group) => {
                    const groupTitle = group.nickname
                      ? `${group.nickname} (${group.hospitalName})`
                      : group.hospitalName;
                    const dateFormatted = group.dispensedDate
                      ? `${group.dispensedDate.slice(0, 10).replace(/-/g, '.')} 조제`
                      : '';
                    const metaText = [dateFormatted, `총 ${group.items.length}종`].filter(Boolean).join(' · ');

                    return (
                      <div key={group.prescriptionId} className="prescribed-group-box">
                        <div className="prescribed-group-header">
                          <div className="prescribed-group-header-left">
                            <span className="prescribed-group-icon" title="처방전">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="15" height="15" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                              </svg>
                            </span>
                            <strong className="prescribed-group-title" title={groupTitle}>
                              {groupTitle}
                            </strong>
                            {metaText && <span className="prescribed-group-meta">({metaText})</span>}
                          </div>

                          <div className="prescribed-group-header-right">
                            {group.status === 'taking' && (
                              <span className="prescribed-group-status-badge taking">
                                {group.dayNum ? `복용 중 (${group.dayNum}일차)` : '복용 중'}
                              </span>
                            )}
                            {group.status === 'completed' && (
                              <span className="prescribed-group-status-badge completed">복용 완료</span>
                            )}
                            {group.status === 'upcoming' && (
                              <span className="prescribed-group-status-badge upcoming">복용 예정</span>
                            )}
                          </div>
                        </div>

                        <div className="prescribed-group-items">
                          {group.items.map((med, idx) => (
                            <div
                              key={med.id || med.medicationId}
                              className="med-item-row"
                              onClick={() => setSelectedMedDetail(med)}
                              title="상세 정보 보기"
                            >
                              <div className="med-item-left">
                                <span className="med-index-num">{String(idx + 1).padStart(2, '0')}</span>
                                <div className="med-text-group">
                                  <div className="med-title-hospital-row">
                                    <strong className="med-item-name">{med.name}</strong>
                                  </div>
                                  <p className="med-item-desc">{med.desc}</p>
                                </div>
                              </div>

                              <div className="med-item-right">
                                <span className={`med-type-pill ${med.badge === '처방' ? 'rx' : med.badge === '영양제' ? 'supp' : 'reg'}`}>
                                  {med.badge || '처방'}
                                </span>
                                <button
                                  type="button"
                                  className="med-more-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedMedDetail(med);
                                  }}
                                  title="상세 복약 정보 보기"
                                >
                                  ···
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  /* 개별 처방전 선택 모드: 그룹핑 헤더 없이 해당 처방전 약품들 평면 표시 */
                  displayedMedList.map((med, idx) => (
                    <div
                      key={med.id || med.medicationId}
                      className="med-item-row"
                      onClick={() => setSelectedMedDetail(med)}
                      title="상세 정보 보기"
                    >
                      <div className="med-item-left">
                        <span className="med-index-num">{String(idx + 1).padStart(2, '0')}</span>
                        <div className="med-text-group">
                          <div className="med-title-hospital-row">
                            <strong className="med-item-name">{med.name}</strong>
                          </div>
                          <p className="med-item-desc">{med.desc}</p>
                        </div>
                      </div>

                      <div className="med-item-right">
                        <span className={`med-type-pill ${med.badge === '처방' ? 'rx' : med.badge === '영양제' ? 'supp' : 'reg'}`}>
                          {med.badge || '처방'}
                        </span>
                        <button
                          type="button"
                          className="med-more-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedMedDetail(med);
                          }}
                          title="상세 복약 정보 보기"
                        >
                          ···
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 우측: 복용 전, 잠깐만요. (MEDICATION NOTE) */}
            {(() => {
              const medNotes = generateMedicationNotes(prescriptionData, currentRxStatus, activeMedsForTargetDate);
              return (
                <div className="medication-note-card">
                  <div className="card-top-row">
                    <div>
                      <span className="card-sub-label">MEDICATION NOTE</span>
                      <h3 className="card-main-title">복용 전, 잠깐만요.</h3>
                    </div>
                    {medNotes && (
                      <span className={`note-status-badge ${medNotes.badgeType}`}>
                        {medNotes.badgeText}
                      </span>
                    )}
                  </div>

                  <div className="note-points-list">
                    {medNotes.points.map((pt, idx) => (
                      <div key={idx} className={`note-point-item ${pt.highlight ? 'highlight' : ''}`}>
                        <span className={`note-point-num ${pt.highlight ? 'highlight' : ''}`}>
                          {pt.highlight ? '!' : idx + 1}
                        </span>
                        <div className="note-point-content">
                          <strong className="note-point-category">{pt.category}</strong>
                          <p className="note-point-text">{pt.text}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="note-action-footer">
                    <button
                      type="button"
                      className="note-detail-btn"
                      onClick={() => setIsCautionModalOpen(true)}
                    >
                      주의사항 자세히 보기 &gt;
                    </button>
                  </div>
                </div>
              );
            })()}
          </section>
        </>
      ) : (
        <section className="prescription-banner-card">
          <div className="banner-card-content">
            <div className="banner-card-text">
              <span className="banner-kicker">PRESCRIPTION & OTC</span>
              <h3 className="banner-title">처방전 또는 약봉투를 등록해 보세요</h3>
              <p className="banner-desc">
                병원 처방전이나 약국 약봉투를 등록하시면 복용 일정과 약품 효능, 주의사항을 자동으로 분석해 드립니다.
              </p>
            </div>
            <div className="banner-card-actions">
              <button
                type="button"
                className="banner-primary-btn"
                onClick={() => navigate('/medication/register?tab=prescription')}
              >
                처방전 · 약봉투 등록 →
              </button>
              <button
                type="button"
                className="banner-secondary-btn"
                onClick={() => navigate('/medication/register?tab=prescription')}
              >
                내 처방전 목록/관리
              </button>
            </div>
          </div>
        </section>
      )}

      {/* 약품 상세 정보 모달 */}
      <MedicationDetailModal
        isOpen={Boolean(selectedMedDetail)}
        medDetail={selectedMedDetail}
        medDetailExtra={medDetailExtra}
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
