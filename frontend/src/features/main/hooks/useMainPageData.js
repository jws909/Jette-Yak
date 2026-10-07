import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useDialog } from '../../../contexts/DialogContext';
import { saveIntakeStatus } from '../../../utils/intakeApi';
import {
  DEFAULT_MEAL_TIMES,
  parseDateOnly,
  formatDateToHyphen,
  formatTimeOnly,
  getPrescriptionStatus,
  mapPrescriptionToState,
  buildRoutineItems,
  isSameSlot,
} from '../utils/mainPageUtils';

/**
 * 메인 페이지 복약 및 처방전 데이터 관리/서버 동기화 커스텀 훅
 */
export function useMainPageData(user, targetDate, selectedRxId) {
  const { showAlert } = useDialog();
  const currentUserId = user?.userId || user?.id;
  const intakeLock = useRef(false);

  // 처방전 데이터 및 등록 여부 상태 (DB 조회 결과에 따라 실시간 반영)
  const [hasPrescription, setHasPrescription] = useState(false);
  const [allPrescriptions, setAllPrescriptions] = useState([]);
  // 화면의 루틴은 계산하고 서버 결과와 저장한 복용 표시만 기준별로 보관합니다.
  const [routineSnapshots, setRoutineSnapshots] = useState({});
  const routineRequests = useRef(new Map());
  const routineChangeVersions = useRef(new Map());
  const routineDate = formatDateToHyphen(targetDate);
  const routineScopeKey = JSON.stringify([currentUserId, routineDate, selectedRxId]);

  // 사용자별 식사 및 취침 기준 시간 상태 (기본값: 아침 07:30, 점심 12:00, 저녁 18:30, 취침 22:00)
  // 평일 및 주말 식사 기준 스케줄 상태
  const [mealSchedule, setMealSchedule] = useState(() => {
    try {
      if (currentUserId) {
        const cachedSched = localStorage.getItem(`jette_meal_schedule_${currentUserId}`);
        if (cachedSched) return JSON.parse(cachedSched);
        const cachedLegacy = localStorage.getItem(`jette_meal_times_${currentUserId}`);
        if (cachedLegacy) {
          const parsed = JSON.parse(cachedLegacy);
          return {
            weekday: parsed,
            weekend: { breakfast: '09:00', lunch: '13:00', dinner: '19:00', bedtime: '23:00' },
          };
        }
      }
    } catch { /* 로컬 캐시 오류는 기본 설정으로 대체 */ }
    return {
      weekday: DEFAULT_MEAL_TIMES,
      weekend: { breakfast: '09:00', lunch: '13:00', dinner: '19:00', bedtime: '23:00' },
    };
  });

  // targetDate 기준으로 평일/주말 맞춤 식사 시간 결정
  const mealTimes = useMemo(() => {
    if (!targetDate) return mealSchedule.weekday || DEFAULT_MEAL_TIMES;
    const d = targetDate instanceof Date ? targetDate : new Date(targetDate);
    const dow = d.getDay();
    const isWeekend = (dow === 0 || dow === 6);
    return isWeekend ? (mealSchedule.weekend || DEFAULT_MEAL_TIMES) : (mealSchedule.weekday || DEFAULT_MEAL_TIMES);
  }, [mealSchedule, targetDate]);

  // 컴포넌트 마운트 시 사용자별 식사 기준 시간 DB 조회
  useEffect(() => {
    // 사용자 전환 시 페이지가 새로 생성되어 초기값을 사용합니다.
    if (!currentUserId) return;
    fetch(`/api/users/meal-times?userId=${currentUserId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.success) {
          const wk = data.weekday ? {
            breakfast: data.weekday.breakfastTime || '07:30',
            lunch: data.weekday.lunchTime || '12:00',
            dinner: data.weekday.dinnerTime || '18:30',
            bedtime: data.weekday.bedtime || '22:00',
          } : {
            breakfast: data.breakfastTime || '07:30',
            lunch: data.lunchTime || '12:00',
            dinner: data.dinnerTime || '18:30',
            bedtime: data.bedtime || '22:00',
          };

          const we = data.weekend ? {
            breakfast: data.weekend.breakfastTime || '09:00',
            lunch: data.weekend.lunchTime || '13:00',
            dinner: data.weekend.dinnerTime || '19:00',
            bedtime: data.weekend.bedtime || '23:00',
          } : {
            breakfast: '09:00',
            lunch: '13:00',
            dinner: '19:00',
            bedtime: '23:00',
          };

          const sched = { weekday: wk, weekend: we };
          setMealSchedule(sched);
          try {
            localStorage.setItem(`jette_meal_schedule_${currentUserId}`, JSON.stringify(sched));
            localStorage.setItem(`jette_meal_times_${currentUserId}`, JSON.stringify(wk));
          } catch { /* 로컬 캐시 오류는 기본 설정으로 대체 */ }
        }
      })
      .catch((err) => console.warn('식사 시간 로드 대기:', err));
  }, [currentUserId]);

  // 식사 시간 저장 핸들러 (평일 / 주말 지원)
  const handleSaveMealTimes = async (newTimes) => {
    if (!currentUserId) {
      showAlert?.('로그인 후 식사 시간을 설정할 수 있습니다.', '안내');
      throw new Error('로그인 후 식사 시간을 설정할 수 있습니다.');
    }

    const wk = newTimes.weekday ? {
      breakfast: newTimes.weekday.breakfast || '07:30',
      lunch: newTimes.weekday.lunch || '12:00',
      dinner: newTimes.weekday.dinner || '18:30',
      bedtime: newTimes.weekday.bedtime || '22:00',
    } : {
      breakfast: newTimes.breakfast || '07:30',
      lunch: newTimes.lunch || '12:00',
      dinner: newTimes.dinner || '18:30',
      bedtime: newTimes.bedtime || '22:00',
    };

    const we = newTimes.weekend ? {
      breakfast: newTimes.weekend.breakfast || '09:00',
      lunch: newTimes.weekend.lunch || '13:00',
      dinner: newTimes.weekend.dinner || '19:00',
      bedtime: newTimes.weekend.bedtime || '23:00',
    } : wk;

    const response = await fetch('/api/users/meal-times', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUserId,
        username: user?.username,
        weekday: {
          breakfastTime: wk.breakfast,
          lunchTime: wk.lunch,
          dinnerTime: wk.dinner,
          bedtime: wk.bedtime,
        },
        weekend: {
          breakfastTime: we.breakfast,
          lunchTime: we.lunch,
          dinnerTime: we.dinner,
          bedtime: we.bedtime,
        },
      }),
    }).catch((error) => {
      throw new Error('서버에 연결하지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해주세요.', { cause: error });
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.success !== true) {
      throw new Error(result?.message || '식사 시간을 저장하지 못했습니다. 다시 시도해 주세요.');
    }

    // 저장이 확인된 뒤 부모 상태를 변경하여 저장 중 폼이 다시 생성되지 않게 합니다.
    const sched = { weekday: wk, weekend: we };
    setMealSchedule(sched);
    try {
      localStorage.setItem(`jette_meal_schedule_${currentUserId}`, JSON.stringify(sched));
      localStorage.setItem(`jette_meal_times_${currentUserId}`, JSON.stringify(wk));
    } catch { /* 로컬 캐시 오류는 서버에 저장한 설정에 영향을 주지 않습니다. */ }
  };

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
      const hospitalDisplay =
        hospitalNames.length > 0 ? hospitalNames.join(', ') : `${allPrescriptions.length}개 의료기관`;

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
          summary: '복용 중인 처방전들의 약품을 통합하여 중복 성분 및 상호작용을 확인하고 일정을 관리합니다.',
        },
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

  // 처방전 상세 및 처방 약품 카드에 표시할 약품 목록
  const displayedMedList = useMemo(() => {
    if (!prescriptionData) return [];

    if (selectedRxId === 'all') {
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

  // 요청은 목록을 반환하고 응답이 도착했을 때 화면 상태에 반영합니다.
  const fetchPrescriptionList = useCallback(async () => {
    if (!currentUserId) return null;
    try {
      const res = await fetch(`/api/prescriptions/list?userId=${currentUserId}`);
      if (res.ok) {
        const data = await res.json();
        return (data.prescriptions || []).map(mapPrescriptionToState);
      }
    } catch (err) {
      console.warn('처방전 목록 로드 실패:', err);
    }
    return [];
  }, [currentUserId]);

  const applyPrescriptionList = useCallback((prescriptions) => {
    if (!prescriptions) return;
    setAllPrescriptions(prescriptions);
    setHasPrescription(prescriptions.length > 0);
  }, []);

  // 사용자의 등록 처방전 전체 목록 새로고침
  const reloadPrescriptionAndRoutine = useCallback(async () => {
    applyPrescriptionList(await fetchPrescriptionList());
  }, [fetchPrescriptionList, applyPrescriptionList]);

  // 컴포넌트 마운트 및 currentUserId 변경 시 최신 처방전 DB 조회
  useEffect(() => {
    let active = true;
    fetchPrescriptionList().then((prescriptions) => {
      if (active) applyPrescriptionList(prescriptions);
    });
    return () => { active = false; };
  }, [fetchPrescriptionList, applyPrescriptionList]);

  // 날짜나 처방전이 바뀌면 해당 기준의 서버 결과만 사용합니다.
  const routineItems = useMemo(() => {
    if (!currentUserId) return [];
    const baseList = buildRoutineItems(activeMedsForTargetDate, mealTimes);
    const snapshot = routineSnapshots[routineScopeKey];
    const schedules = snapshot?.schedules || [];
    const targetDateObj = parseDateOnly(routineDate) || new Date();
    const activeRxIdSet = new Set(
      allPrescriptions
        .filter((rx) => getPrescriptionStatus(rx.dispensedDate, rx.totalDays, targetDateObj).status === 'taking')
        .map((rx) => String(rx.prescriptionId))
    );
    const matchesSchedule = (item, schedule) => {
      // 약 이름이 같아도 다른 처방전의 복용 표시를 섞지 않습니다.
      if (String(item.prescriptionId || '') !== String(schedule.prescriptionId || '')) return false;
      const sameMed =
        (schedule.medicationId && item.medicationId && String(schedule.medicationId) === String(item.medicationId)) ||
        (schedule.name && item.name && (schedule.name.includes(item.name) || item.name.includes(schedule.name)));
      if (!sameMed) return false;
      if (schedule.slot && item.slot) return isSameSlot(schedule.slot, item.slot);
      if (schedule.time && item.time) return schedule.time === item.time;
      return true;
    };
    const updated = baseList.map((item) => {
      const schedule = schedules.find((candidate) => matchesSchedule(item, candidate));
      if (!schedule) return item;
      return {
        ...item,
        scheduleId: schedule.scheduleId,
        taken: Boolean(schedule.takenAt),
        takenAt: schedule.takenAt || null,
        originHospital: schedule.hospitalName || item.originHospital,
        originDispensedDate: schedule.dispensedDate || item.originDispensedDate,
        prescriptionNickname: schedule.prescriptionNickname || item.prescriptionNickname,
        prescriptionPurpose: schedule.prescriptionPurpose || item.prescriptionPurpose,
      };
    });
    const extraItems = schedules
      .filter((schedule) => {
        if (updated.some((item) => matchesSchedule(item, schedule))) return false;
        if (!schedule.prescriptionId) return selectedRxId === 'all';
        return (selectedRxId === 'all' || String(schedule.prescriptionId) === String(selectedRxId)) &&
          activeRxIdSet.has(String(schedule.prescriptionId));
      })
      .map((schedule, idx) => {
        const timeStr = formatTimeOnly(schedule.time || schedule.scheduledTime) || '09:00';
        let slot = schedule.slot;
        if (!slot) {
          const hour = parseInt(timeStr.slice(0, 2), 10);
          slot = hour < 11 ? 'breakfast' : hour < 16 ? 'lunch' : hour < 21 ? 'dinner' : 'bedtime';
        }
        const slotLabel = slot === 'breakfast' || slot === 'morning' ? '아침' :
          slot === 'lunch' ? '점심' : slot === 'dinner' || slot === 'evening' ? '저녁' : '취침 전';
        return {
          id: `sched-${schedule.scheduleId || idx}`,
          scheduleId: schedule.scheduleId,
          slot,
          slotLabel,
          time: timeStr,
          name: schedule.name || '복용약',
          dotColor: schedule.type === 'supplement' ? '#e09f3e' : '#5c9e76',
          taken: Boolean(schedule.takenAt),
          takenAt: schedule.takenAt || null,
          type: schedule.type === 'supplement' ? '영양제' : schedule.type === 'regular' ? '상비약' : '일반',
          rawType: schedule.type,
          notes: schedule.notes || schedule.memo,
          orderIndex: 100 + idx,
          medicationId: schedule.medicationId || '',
          prescriptionId: schedule.prescriptionId,
          originHospital: schedule.hospitalName,
          originDispensedDate: schedule.dispensedDate,
          prescriptionNickname: schedule.prescriptionNickname,
          prescriptionPurpose: schedule.prescriptionPurpose,
        };
      });
    const slotOrder = { breakfast: 1, lunch: 2, dinner: 3, bedtime: 4 };
    const merged = extraItems.length ? [...updated, ...extraItems].sort((a, b) => {
      const orderDiff = (slotOrder[a.slot] || 99) - (slotOrder[b.slot] || 99);
      return orderDiff || (a.time || '').localeCompare(b.time || '');
    }) : updated;
    return merged.map((item) => snapshot?.checks?.[item.id] ? { ...item, ...snapshot.checks[item.id] } : item);
  }, [currentUserId, activeMedsForTargetDate, mealTimes, routineSnapshots, routineScopeKey, routineDate, allPrescriptions, selectedRxId]);

  // 저장 성공 후의 복용 표시를 해당 날짜와 선택 처방전에만 반영합니다.
  const setRoutineItems = useCallback((update) => {
    routineChangeVersions.current.set(routineScopeKey, (routineChangeVersions.current.get(routineScopeKey) || 0) + 1);
    setRoutineSnapshots((previous) => {
      const snapshot = previous[routineScopeKey] || {};
      const currentItems = routineItems.map((item) => ({ ...item, ...snapshot.checks?.[item.id] }));
      const nextItems = typeof update === 'function' ? update(currentItems) : update;
      const checks = Object.fromEntries(nextItems.map((item) => [item.id, { taken: item.taken, takenAt: item.takenAt || null }]));
      return { ...previous, [routineScopeKey]: { ...snapshot, checks } };
    });
  }, [routineItems, routineScopeKey]);

  // 서버 DB의 당일 캘린더 스케줄과 복약 루틴 동기화
  const syncRoutinesWithServer = useCallback(async (dateStr) => {
    if (!currentUserId) return;
    const scopeKey = JSON.stringify([currentUserId, dateStr, selectedRxId]);
    const requestVersion = (routineRequests.current.get(scopeKey) || 0) + 1;
    const changeVersion = routineChangeVersions.current.get(scopeKey) || 0;
    routineRequests.current.set(scopeKey, requestVersion);
    try {
      const res = await fetch(`/api/calendar?userId=${currentUserId}&date=${dateStr}`);
      if (!res.ok) return;
      const schedules = await res.json();
      if (!Array.isArray(schedules) || routineRequests.current.get(scopeKey) !== requestVersion) return;
      const preserveChecks = (routineChangeVersions.current.get(scopeKey) || 0) !== changeVersion;
      setRoutineSnapshots((previous) => ({
        ...previous,
        [scopeKey]: { schedules, checks: preserveChecks ? previous[scopeKey]?.checks : undefined },
      }));
    } catch (err) {
      console.warn('스케줄 DB 동기화 실패:', err);
    }
  }, [currentUserId, selectedRxId]);

  // 루틴 재계산은 렌더링에서 하고 effect는 서버 조회만 수행합니다.
  useEffect(() => {
    if (!currentUserId) return;
    if (activeMedsForTargetDate.length > 0 || selectedRxId === 'all') {
      syncRoutinesWithServer(routineDate);
    }
  }, [mealTimes, activeMedsForTargetDate, routineDate, currentUserId, syncRoutinesWithServer, selectedRxId]);

  // 전역 복약 변경 이벤트 수신
  useEffect(() => {
    const handleIntakeSync = (e) => {
      if (e?.detail?.origin === 'main') return;

      const eventUserId = e?.detail?.userId;
      const eventDate = e?.detail?.date;
      const curDateStr = formatDateToHyphen(targetDate);

      if (!eventUserId || String(eventUserId) === String(currentUserId)) {
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

  // 단일 약 복용 체크 토글
  const toggleRoutine = async (id) => {
    if (!currentUserId) {
      showAlert('로그인 후 복약 체크를 이용하실 수 있습니다.', '안내');
      return;
    }
    const dateStr = formatDateToHyphen(targetDate);
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const nowIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(
      now.getHours()
    )}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    const targetItem = routineItems.find((i) => i.id === id);
    if (!targetItem) return;

    const nextTaken = !targetItem.taken;

    if (intakeLock.current) return;
    intakeLock.current = true;
    try {
      await saveIntakeStatus({ scheduleIds: [targetItem.scheduleId], taken: nextTaken, date: dateStr });
      setRoutineItems(prev => prev.map(item => item.id === id ? { ...item, taken: nextTaken, takenAt: nextTaken ? nowIso : null } : item));
      window.dispatchEvent(new CustomEvent('jette-intake-updated', { detail: { userId: currentUserId, date: dateStr, origin: 'main' } }));
      syncRoutinesWithServer(dateStr);
    } catch (error) {
      showAlert(error.message || '복약 체크를 저장하지 못했습니다.', '복약 체크 실패');
    } finally {
      intakeLock.current = false;
    }
  };

  // 처방약 봉지 전체 일괄 복용 체크/해제
  const togglePouch = async (pouch, e) => {
    if (e) e.stopPropagation();
    if (!currentUserId) {
      showAlert('로그인 후 복약 체크를 이용하실 수 있습니다.', '안내');
      return;
    }
    const dateStr = formatDateToHyphen(targetDate);
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const nowIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(
      now.getHours()
    )}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    const allTaken = pouch.items.every((i) => i.taken);
    const nextTaken = !allTaken;
    const pouchItemIds = new Set(pouch.items.map((i) => i.id));
    const scheduleIds = pouch.items.map((i) => i.scheduleId).filter(Boolean);

    if (intakeLock.current) return;
    intakeLock.current = true;
    try {
      await saveIntakeStatus({ scheduleIds, taken: nextTaken, date: dateStr });
      setRoutineItems(prev => prev.map(item => pouchItemIds.has(item.id) ? { ...item, taken: nextTaken, takenAt: nextTaken ? nowIso : null } : item));
      window.dispatchEvent(new CustomEvent('jette-intake-updated', { detail: { userId: currentUserId, date: dateStr, origin: 'main' } }));
      syncRoutinesWithServer(dateStr);
    } catch (error) {
      showAlert(error.message || '봉지 복약 체크를 저장하지 못했습니다.', '복약 체크 실패');
    } finally {
      intakeLock.current = false;
    }
  };

  // DB에 등록된 활성 복약 루틴 리스트
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

  return {
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
    mealSchedule,
    handleSaveMealTimes,
    toggleRoutine,
    togglePouch,
    reloadPrescriptionAndRoutine,
  };
}
