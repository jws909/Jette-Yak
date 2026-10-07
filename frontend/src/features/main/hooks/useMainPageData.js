import { useState, useEffect, useCallback, useMemo } from 'react';
import { useDialog } from '../../../contexts/DialogContext';
import {
  DEFAULT_MEAL_TIMES,
  parseDateOnly,
  formatDateToHyphen,
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

  // 처방전 데이터 및 등록 여부 상태 (DB 조회 결과에 따라 실시간 반영)
  const [hasPrescription, setHasPrescription] = useState(false);
  const [allPrescriptions, setAllPrescriptions] = useState([]);
  const [routineItems, setRoutineItems] = useState([]);

  // 사용자별 식사 및 취침 기준 시간 상태 (기본값: 아침 07:30, 점심 12:00, 저녁 18:30, 취침 22:00)
  const FALLBACK_WEEKEND_MEAL_TIMES = useMemo(() => ({
    breakfast: '09:00',
    lunch: '13:00',
    dinner: '19:00',
    bedtime: '23:00',
  }), []);

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
    } catch {}
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
    if (!currentUserId) {
      setMealSchedule({
        weekday: DEFAULT_MEAL_TIMES,
        weekend: { breakfast: '09:00', lunch: '13:00', dinner: '19:00', bedtime: '23:00' },
      });
      return;
    }
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
          } catch {}
        }
      })
      .catch((err) => console.warn('식사 시간 로드 대기:', err));
  }, [currentUserId]);

  // 식사 시간 저장 핸들러 (평일 / 주말 지원)
  const handleSaveMealTimes = async (newTimes) => {
    if (!currentUserId) {
      showAlert('로그인 후 식사 시간을 설정할 수 있습니다.', '안내');
      return;
    }

    try {
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

      const sched = { weekday: wk, weekend: we };
      setMealSchedule(sched);
      try {
        localStorage.setItem(`jette_meal_schedule_${currentUserId}`, JSON.stringify(sched));
        localStorage.setItem(`jette_meal_times_${currentUserId}`, JSON.stringify(wk));
      } catch {}

      await fetch('/api/users/meal-times', {
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
      });
    } catch (err) {
      console.warn('식사 시간 저장 요청 실패:', err);
    }
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

  // 사용자의 등록 처방전 전체 목록 및 복약 루틴 새로고침
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

  // 서버 DB의 당일 캘린더 스케줄과 복약 루틴 동기화
  const syncRoutinesWithServer = useCallback(
    async (dateStr) => {
      if (!currentUserId) return;
      try {
        const res = await fetch(`/api/calendar?userId=${currentUserId}&date=${dateStr}`);
        if (!res.ok) return;
        const schedules = await res.json();
        if (!Array.isArray(schedules)) return;

        const targetDateObj = parseDateOnly(dateStr) || new Date();
        const activeRxIdSet = new Set(
          allPrescriptions
            .filter((rx) => getPrescriptionStatus(rx.dispensedDate, rx.totalDays, targetDateObj).status === 'taking')
            .map((rx) => String(rx.prescriptionId))
        );

        setRoutineItems((currentItems) => {
          let hasChanges = false;
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
                  taken: scheduleTaken,
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

            if (s.prescriptionId) {
              if (selectedRxId !== 'all' && String(s.prescriptionId) !== String(selectedRxId)) {
                return false;
              }
              if (!activeRxIdSet.has(String(s.prescriptionId))) {
                return false;
              }
            } else {
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
                slotLabel =
                  slot === 'breakfast' || slot === 'morning'
                    ? '아침'
                    : slot === 'lunch'
                    ? '점심'
                    : slot === 'dinner' || slot === 'evening'
                    ? '저녁'
                    : '취침 전';
              }
              return {
                id: `sched-${s.scheduleId || idx}`,
                scheduleId: s.scheduleId,
                slot,
                slotLabel,
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

          return hasChanges ? updated : currentItems;
        });
      } catch (err) {
        console.warn('스케줄 DB 동기화 실패:', err);
      }
    },
    [currentUserId, allPrescriptions, selectedRxId]
  );

  // 식사 시간이나 기준 일자별 유효 복약 약품 변경 시 루틴 재계산
  useEffect(() => {
    if (!currentUserId) {
      setRoutineItems([]);
      return;
    }

    const dateStr = formatDateToHyphen(targetDate);
    if (activeMedsForTargetDate && activeMedsForTargetDate.length > 0) {
      const baseList = buildRoutineItems(activeMedsForTargetDate, mealTimes);
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
      if (selectedRxId === 'all') {
        syncRoutinesWithServer(dateStr);
      }
    }
  }, [mealTimes, activeMedsForTargetDate, targetDate, currentUserId, syncRoutinesWithServer, selectedRxId]);

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

    setRoutineItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, taken: nextTaken, takenAt: nextTaken ? nowIso : null } : item
      )
    );

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

    window.dispatchEvent(
      new CustomEvent('jette-intake-updated', {
        detail: { userId: currentUserId, date: dateStr, origin: 'main' },
      })
    );

    syncRoutinesWithServer(dateStr);
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

    setRoutineItems((prev) =>
      prev.map((item) =>
        pouchItemIds.has(item.id) ? { ...item, taken: nextTaken, takenAt: nextTaken ? nowIso : null } : item
      )
    );

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

    window.dispatchEvent(
      new CustomEvent('jette-intake-updated', {
        detail: { userId: currentUserId, date: dateStr, origin: 'main' },
      })
    );

    syncRoutinesWithServer(dateStr);
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
