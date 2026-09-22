import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './MainPage.css';

const FALLBACK_SEARCH_LIST = [
  { itemName: '타이레놀정 500mg', entpName: '한국존슨앤드존슨', efficacy: '해열 및 감기로 인한 통증 완화', desc: '해열 진통제' },
  { itemName: '아스피린프로텍트정 100mg', entpName: '바이엘코리아', efficacy: '혈전 생성 억제', desc: '혈전 예방' },
  { itemName: '비타민D 1000IU', entpName: '종근당', efficacy: '뼈의 형성과 유지', desc: '면역력 및 뼈 건강' },
];

function fallbackSearch(keyword) {
  return FALLBACK_SEARCH_LIST.filter(i => i.itemName.includes(keyword));
}

const DOT_COLORS = ['#c04b4b', '#e09f3e', '#5c9e76', '#4a69bd', '#8b3e4b', '#2e86de'];

function mapPrescriptionToState(prescription) {
  if (!prescription) return null;

  let dateStr = '';
  if (prescription.dispensedDate) {
    if (typeof prescription.dispensedDate === 'string' && prescription.dispensedDate.length >= 10) {
      dateStr = prescription.dispensedDate.slice(0, 10).replace(/-/g, '.');
    } else {
      const d = new Date(prescription.dispensedDate);
      if (!isNaN(d.getTime())) {
        dateStr = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
      }
    }
  }

  let hospital = prescription.hospitalName || '의료기관';
  let doctor = prescription.doctorName || '처방의';
  if (prescription.aiSummaryJson) {
    try {
      const parsed = JSON.parse(prescription.aiSummaryJson);
      if (parsed.hospitalName && hospital === '의료기관') hospital = parsed.hospitalName;
      if (parsed.doctorName && doctor === '처방의') doctor = parsed.doctorName;
    } catch {
      // ignore
    }
  }

  const items = (prescription.items && prescription.items.length > 0)
    ? prescription.items.map((item, idx) => {
        const freq = Number(item.dailyFrequency) || 1;
        const dose = item.dailyDose != null ? item.dailyDose : 1;
        const timing = item.usageTiming || '식후 복용';
        const className = item.className || '';
        const materialName = item.materialName || '';
        const efficacy = item.efficacy || className || '전문의 처방 의약품';
        const usageDosage = item.usageDosage || `1일 ${freq}회 · 1회 ${dose}정 (${timing})`;
        const isDiscontinued = Boolean(item.isDiscontinued);

        return {
          id: item.itemId ? `rx-${item.itemId}` : `rx-${idx}`,
          name: item.itemName || '처방 의약품',
          desc: className ? `${className} · ${timing}` : (timing || '식후 30분 복용'),
          badge: '처방',
          dotColor: DOT_COLORS[idx % DOT_COLORS.length],
          dosage: usageDosage,
          dailyFrequency: freq,
          dailyDose: dose,
          totalDays: item.totalDays || prescription.totalDays || 14,
          usageTiming: timing,
          efficacy: efficacy,
          usageDosage: usageDosage,
          materialName: materialName,
          className: className,
          caution: getMedicineCaution({
            isDiscontinued,
            className,
            name: item.itemName,
            materialName
          }),
          timing: timing,
          isDiscontinued: isDiscontinued
        };
      })
    : [];

  return {
    prescriptionId: prescription.prescriptionId,
    dispensedDate: dateStr,
    hospitalName: hospital,
    doctorName: doctor,
    totalDays: prescription.totalDays || 14,
    hasDiscontinuedDrug: prescription.hasDiscontinuedDrug,
    items: items
  };
}

// 효능군 및 약품명 기반 스마트 복약 주의사항 룰 매칭 (DB null 대응 및 Fallback)
function getMedicineCaution(item) {
  if (item.isDiscontinued) {
    return '[주의] 판매중단 또는 재검토 대상 의약품입니다. 복용 전 의료진과 다시 확인하세요.';
  }

  const keyword = `${item.className || ''} ${item.name || item.itemName || ''} ${item.materialName || ''}`;

  if (keyword.includes('혈압') || keyword.includes('암로디핀') || keyword.includes('아모잘탄') || keyword.includes('발사르탄')) {
    return '매일 일정한 시간에 복용하세요. 복용 초기 기립성 저혈압(어지러움)이 나타날 수 있으니 천천히 일어나세요.';
  }
  if (keyword.includes('진통') || keyword.includes('소염') || keyword.includes('해열') || keyword.includes('아세트아미노펜') || keyword.includes('이부프로펜')) {
    return '위장 장애를 예방하기 위해 공복을 피하고 식후에 충분한 물과 함께 복용하세요. 복용 기간 중 음주는 절대 금지됩니다.';
  }
  if (keyword.includes('항생') || keyword.includes('항균') || keyword.includes('세파') || keyword.includes('아목시')) {
    return '증상이 나아지더라도 균의 내성을 방지하기 위해 처방받은 기간 동안 끝까지 복용을 완료해야 합니다.';
  }
  if (keyword.includes('알레르기') || keyword.includes('항히스타민') || keyword.includes('비염') || keyword.includes('감기')) {
    return '졸음이나 나른함이 나타날 수 있으므로 운전이나 위험한 기계 조작 시 각별한 주의가 필요합니다.';
  }
  if (keyword.includes('소화') || keyword.includes('위장') || keyword.includes('궤양') || keyword.includes('제산')) {
    return '위 점막 보호를 위해 카페인, 탄산음료, 자극적인 매운 음식의 섭취를 삼가고 지정된 복용법을 따르세요.';
  }
  if (keyword.includes('탈모') || keyword.includes('피나') || keyword.includes('두타')) {
    return '가임기 여성의 정제 파편 접촉을 금하며, 매일 일정한 시간에 꾸준히 지속적으로 복용하세요.';
  }
  if (keyword.includes('당뇨') || keyword.includes('혈당') || keyword.includes('메트포르민')) {
    return '식사를 거르지 마시고, 저혈당 증상(식은땀, 손떨림, 어지러움) 발생에 대비해 사탕 등 당분을 휴대하세요.';
  }
  if (keyword.includes('취침') || keyword.includes('수면') || keyword.includes('진정')) {
    return '취침 직전에 복용하시고, 복용 후에는 알코올 섭취를 절대 피하세요.';
  }

  return '정해진 용법과 용량을 준수하여 충분한 물과 함께 복용하세요. 임의로 복용을 중단하지 마세요.';
}

// '복용 전, 잠깐만요 (MEDICATION NOTE)' 맞춤형 체크포인트 생성 엔진 (API 비용 0원, 0ms 실시간 분석)
function generateMedicationNotes(prescriptionData) {
  if (!prescriptionData || !prescriptionData.items || prescriptionData.items.length === 0) {
    return {
      hasDiscontinued: false,
      badgeText: '기본 수칙',
      badgeType: 'safe',
      points: [
        {
          icon: '💡',
          category: '복약 수칙 안내',
          text: '등록된 처방 의약품이 없습니다. 처방전을 등록하시면 약품별 맞춤 복용 주의사항이 자동으로 계산되어 안내됩니다.'
        }
      ]
    };
  }

  const items = prescriptionData.items;
  const hasDiscontinued = prescriptionData.hasDiscontinuedDrug === 1 || items.some((i) => i.isDiscontinued);
  const discontinuedItem = items.find((i) => i.isDiscontinued);

  const points = [];

  // 1. 판매중단 또는 주의 약품이 포함된 경우 (최우선 배치)
  if (hasDiscontinued) {
    points.push({
      icon: '🚨',
      category: '의약품 안전 주의',
      highlight: true,
      text: `[주의] ${discontinuedItem?.name || '처방 약품'} 등 판매중단 또는 허가 재검토 대상 의약품이 포함되어 있습니다. 복용 전 의료진과 다시 확인하세요.`
    });
  }

  // 2. 식사 및 복용 타이밍 분석 (Usage Timing)
  const timingTexts = items.map((i) => i.usageTiming || '').join(' ');
  if (timingTexts.includes('식전')) {
    points.push({
      icon: '🍽️',
      category: '식사 및 복용 시점',
      text: '식전 복용 약품 포함: 흡수율을 높이고 약효를 발휘하기 위해 식사 30분 전 공복에 복용하세요.'
    });
  } else if (timingTexts.includes('취침')) {
    points.push({
      icon: '🌙',
      category: '식사 및 복용 시점',
      text: '취침 전 복용 약품 포함: 잠들기 직전에 미온수와 함께 편안한 상태에서 복용하세요.'
    });
  } else {
    points.push({
      icon: '🍚',
      category: '식사 및 복용 시점',
      text: '식후 30분 복용: 위장 자극을 줄이고 흡수를 돕기 위해 식사 후 미온수와 함께 복용하세요.'
    });
  }

  // 3. 약품 효능군(className) 및 주성분(materialName) 기반 스마트 룰 매칭 (Gemini API 대체)
  const classNames = items.map((i) => `${i.className || ''} ${i.name || ''} ${i.materialName || ''}`).join(' ');

  if (classNames.includes('혈압') || classNames.includes('암로디핀') || classNames.includes('아모잘탄') || classNames.includes('발사르탄')) {
    points.push({
      icon: '🩺',
      category: '혈압약 복용 주의',
      text: '혈압강하제 포함: 갑자기 일어설 때 어지러움이 생길 수 있으니 천천히 일어나시고, 매일 일정한 시간에 꾸준히 복용하세요.'
    });
  } else if (classNames.includes('진통') || classNames.includes('소염') || classNames.includes('해열') || classNames.includes('아세트아미노펜') || classNames.includes('NSAID')) {
    points.push({
      icon: '🚫',
      category: '음주 및 위장 주의',
      text: '해열·소염진통제 포함: 간 및 위장 점막 손상을 막기 위해 복용 기간 중 음주는 절대 삼가시고, 공복 복용을 피하세요.'
    });
  } else if (classNames.includes('항생') || classNames.includes('항균') || classNames.includes('세파') || classNames.includes('아목시')) {
    points.push({
      icon: '💊',
      category: '항생제 내성 예방',
      text: '항생제 포함: 증상이 호전되더라도 균의 내성 발생을 방지하기 위해 처방된 일수 동안 끝까지 복용하세요.'
    });
  } else if (classNames.includes('알레르기') || classNames.includes('항히스타민') || classNames.includes('비염') || classNames.includes('감기')) {
    points.push({
      icon: '🚗',
      category: '졸음 유발 주의',
      text: '항히스타민 성분 포함: 졸음이나 나른함이 발생할 수 있으므로 운전이나 위험한 기계 조작 시 각별히 주의하세요.'
    });
  } else if (classNames.includes('소화') || classNames.includes('위장') || classNames.includes('궤양') || classNames.includes('제산')) {
    points.push({
      icon: '☕',
      category: '위장 보호 수칙',
      text: '위장약 포함: 위 점막 보호와 빠른 회복을 위해 카페인, 탄산음료, 자극적인 매운 음식 섭취를 줄이세요.'
    });
  } else if (classNames.includes('탈모') || classNames.includes('피나') || classNames.includes('두타')) {
    points.push({
      icon: '⚠️',
      category: '탈모치료제 주의',
      text: '피나스테리드 계열 포함: 가임기 여성의 정제 파편 접촉을 금하며, 매일 일정한 시간에 지속적으로 복용하세요.'
    });
  } else if (classNames.includes('당뇨') || classNames.includes('메트포르민') || classNames.includes('혈당')) {
    points.push({
      icon: '🍬',
      category: '저혈당 대비 안내',
      text: '당뇨병용제 포함: 식사를 거르지 마시고, 식은땀이나 떨림 등 저혈당 증상에 대비해 사탕이나 당분을 휴대하세요.'
    });
  } else {
    points.push({
      icon: '⚠️',
      category: '복약 준수 수칙',
      text: '정해진 1회 투약량과 복용 횟수를 준수하시고, 다른 약물이나 건강기능식품과 병용 시 전문가와 상담하세요.'
    });
  }

  // 4. 총 투약일수 안내
  const totalDays = prescriptionData.totalDays || 14;
  points.push({
    icon: '⏱️',
    category: '처방 기간 준수',
    text: `총 ${totalDays}일 처방: 증상이 일시적으로 완화되더라도 임의로 복용을 중단하지 마시고 처방 기간을 완료하세요.`
  });

  return {
    hasDiscontinued,
    badgeText: hasDiscontinued ? '주의 대상 포함' : `${points.length}가지 핵심 체크`,
    badgeType: hasDiscontinued ? 'danger' : 'safe',
    points
  };
}

// 사용자별 식사 및 취침 기준 시간 기본값
const DEFAULT_MEAL_TIMES = {
  breakfast: '07:30',
  lunch: '12:00',
  dinner: '18:30',
  bedtime: '22:00',
};

// 시간 문자열(HH:mm)에 minutes(양수 또는 음수)를 가감하여 반환 (24시간 순환 보정)
function addMinutes(timeStr, minutes) {
  if (!timeStr || !timeStr.includes(':')) return timeStr || '08:00';
  const [hStr, mStr] = timeStr.split(':');
  let h = parseInt(hStr, 10);
  let m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m)) return timeStr;

  let totalMinutes = h * 60 + m + minutes;
  totalMinutes = (totalMinutes % 1440 + 1440) % 1440;

  const newH = Math.floor(totalMinutes / 60);
  const newM = totalMinutes % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

// 처방전 용법 문구에서 오프셋 분(기본 +30분, 식사 직후 0분, 식전 -30분 등) 추출
function parseTimingOffset(usageTiming) {
  const str = (usageTiming || '').toLowerCase();

  // "10분", "30분", "60분" 등 분 단위 명시된 숫자 추출
  const minuteMatch = str.match(/(\d+)\s*분/);
  const explicitMinutes = minuteMatch ? parseInt(minuteMatch[1], 10) : 30;

  if (str.includes('직후') || str.includes('식사 직후') || str.includes('식사직후')) {
    return 0;
  }
  if (str.includes('식전') || str.includes('식사전') || str.includes('식사 전')) {
    return -explicitMinutes;
  }
  if (str.includes('식간') || str.includes('공복')) {
    return -60;
  }
  // "식후 30분", "식후", "매 식후" 등 일반 식후는 기본 +30분
  return explicitMinutes;
}

// 1일 복용 횟수(dailyFrequency), 복약 시점 문구, 사용자 맞춤 식사 시간에 따른 실제 알림 시간대 슬롯 객체 생성
function getIntakeSlots(dailyFrequency, usageTiming = '', mealTimes = DEFAULT_MEAL_TIMES) {
  const freq = Number(dailyFrequency) || 0;
  const timing = (usageTiming || '').toLowerCase();
  const offset = parseTimingOffset(usageTiming);

  const bTime = addMinutes(mealTimes.breakfast || '07:30', offset);
  const lTime = addMinutes(mealTimes.lunch || '12:00', offset);
  const dTime = addMinutes(mealTimes.dinner || '18:30', offset);
  const bedTime = mealTimes.bedtime || '22:00';

  const breakfastSlot = { slot: 'breakfast', slotLabel: '아침', time: bTime };
  const lunchSlot = { slot: 'lunch', slotLabel: '점심', time: lTime };
  const dinnerSlot = { slot: 'dinner', slotLabel: '저녁', time: dTime };
  const bedtimeSlot = { slot: 'bedtime', slotLabel: '취침전', time: bedTime };

  // 1) 횟수가 명시적으로 지정된 경우
  if (freq === 1) {
    if (timing.includes('취침') || timing.includes('자기전') || timing.includes('취침전')) return [bedtimeSlot];
    if (timing.includes('저녁')) return [dinnerSlot];
    if (timing.includes('점심')) return [lunchSlot];
    return [breakfastSlot];
  }
  if (freq === 2) {
    if (timing.includes('점심') && timing.includes('저녁')) return [lunchSlot, dinnerSlot];
    if (timing.includes('아침') && timing.includes('점심')) return [breakfastSlot, lunchSlot];
    if (timing.includes('취침') || timing.includes('자기전')) return [breakfastSlot, bedtimeSlot];
    return [breakfastSlot, dinnerSlot];
  }
  if (freq === 3) {
    return [breakfastSlot, lunchSlot, dinnerSlot];
  }
  if (freq >= 4) {
    return [breakfastSlot, lunchSlot, dinnerSlot, bedtimeSlot];
  }

  // 2) 횟수가 누락된 경우 용법 텍스트에서 유추
  if (timing.includes('3회') || (timing.includes('아침') && timing.includes('점심') && timing.includes('저녁')) || timing.includes('매 식후') || timing.includes('매식후')) {
    return [breakfastSlot, lunchSlot, dinnerSlot];
  }
  if (timing.includes('2회') || (timing.includes('아침') && timing.includes('저녁'))) {
    return [breakfastSlot, dinnerSlot];
  }
  if (timing.includes('취침') || timing.includes('자기전')) {
    return [bedtimeSlot];
  }

  // 기본값: 3회 복용 (아침, 점심, 저녁)
  return [breakfastSlot, lunchSlot, dinnerSlot];
}

function buildRoutineItems(prescribedMeds, mealTimes = DEFAULT_MEAL_TIMES) {
  if (!prescribedMeds || prescribedMeds.length === 0) {
    return [];
  }

  const rxRoutines = [];
  prescribedMeds.forEach((med, medIdx) => {
    const slots = getIntakeSlots(med.dailyFrequency, med.usageTiming || med.dosage || med.desc, mealTimes);
    slots.forEach((s, timeIdx) => {
      rxRoutines.push({
        id: `rt-${med.id || medIdx}-${s.slot}-${timeIdx}`,
        slot: s.slot,
        slotLabel: s.slotLabel,
        time: s.time,
        name: med.name,
        dotColor: med.dotColor || DOT_COLORS[medIdx % DOT_COLORS.length],
        taken: false,
        type: med.badge || '처방',
        orderIndex: medIdx,
      });
    });
  });

  const slotOrder = { breakfast: 1, lunch: 2, dinner: 3, bedtime: 4 };
  rxRoutines.sort((a, b) => {
    const orderDiff = (slotOrder[a.slot] || 99) - (slotOrder[b.slot] || 99);
    if (orderDiff !== 0) return orderDiff;
    const cmp = (a.time || '').localeCompare(b.time || '');
    if (cmp !== 0) return cmp;
    return (a.orderIndex ?? 99) - (b.orderIndex ?? 99);
  });

  return rxRoutines;
}

export default function MainPage({ user }) {
  const navigate = useNavigate();

  // 처방전 데이터 및 등록 여부 상태 (DB 조회 결과에 따라 실시간 반영)
  const [hasPrescription, setHasPrescription] = useState(false);
  const [prescriptionData, setPrescriptionData] = useState(null);

  // 처방전 업로드 모달 상태
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [rotation, setRotation] = useState(0); // 0, 90, 180, 270도
  const [isFlipped, setIsFlipped] = useState(false); // 좌우 반전 여부
  const [isDragging, setIsDragging] = useState(false);

  // 약품 상세 모달 상태
  const [selectedMedDetail, setSelectedMedDetail] = useState(null);
  const [isCautionModalOpen, setIsCautionModalOpen] = useState(false);

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
      const cached = localStorage.getItem(`jette_meal_times_${user?.userId || 1}`);
      if (cached) return JSON.parse(cached);
    } catch {}
    return DEFAULT_MEAL_TIMES;
  });

  // 식사 시간 설정 모달 상태
  const [isMealModalOpen, setIsMealModalOpen] = useState(false);
  const [tempMealTimes, setTempMealTimes] = useState(DEFAULT_MEAL_TIMES);
  const [isSavingMealTimes, setIsSavingMealTimes] = useState(false);

  // 활성화된 처방약 목록 (DB 등록된 데이터만 표시)
  const activeMedList = prescriptionData?.items || [];

  // 컴포넌트 마운트 시 사용자별 식사 기준 시간 DB 조회
  useEffect(() => {
    const userId = user?.userId || 1;
    fetch(`/api/users/meal-times?userId=${userId}`)
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
          setTempMealTimes(loaded);
          try {
            localStorage.setItem(`jette_meal_times_${userId}`, JSON.stringify(loaded));
          } catch {}
        }
      })
      .catch((err) => console.warn('식사 시간 로드 대기:', err));
  }, [user?.userId]);

  // 최신 처방전 및 복약 루틴 새로고침 함수
  const reloadPrescriptionAndRoutine = useCallback(async () => {
    const userId = user?.userId;
    if (!userId) {
      setPrescriptionData(null);
      setRoutineItems([]);
      setHasPrescription(false);
      return;
    }

    try {
      const res = await fetch(`/api/prescriptions/latest?userId=${userId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.found && data.prescription) {
          const mapped = mapPrescriptionToState(data.prescription);
          setPrescriptionData(mapped);
          setRoutineItems(buildRoutineItems(mapped.items, mealTimes));
          setHasPrescription(true);
        } else {
          setPrescriptionData(null);
          setRoutineItems([]);
          setHasPrescription(false);
        }
      } else {
        setPrescriptionData(null);
        setRoutineItems([]);
        setHasPrescription(false);
      }
    } catch (err) {
      console.warn('최근 처방전 로드 실패:', err);
      setPrescriptionData(null);
      setRoutineItems([]);
      setHasPrescription(false);
    }
  }, [user?.userId, mealTimes]);

  // 처방전 목록/수정/삭제 관리 모달 상태
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [prescriptionList, setPrescriptionList] = useState([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [editingPrescription, setEditingPrescription] = useState(null);
  const [editForm, setEditForm] = useState({
    prescriptionId: null,
    hospitalName: '',
    doctorName: '',
    dispensedDate: '',
    totalDays: 3,
    items: [],
  });
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [manageAlert, setManageAlert] = useState(null);

  const fetchPrescriptionList = useCallback(async () => {
    const userId = user?.userId || 1;
    setIsLoadingList(true);
    try {
      const res = await fetch(`/api/prescriptions/list?userId=${userId}`);
      if (res.ok) {
        const data = await res.json();
        setPrescriptionList(data.prescriptions || []);
      }
    } catch (err) {
      console.warn('처방전 목록 로드 실패:', err);
    } finally {
      setIsLoadingList(false);
    }
  }, [user?.userId]);

  const openManageModal = () => {
    setEditingPrescription(null);
    setManageAlert(null);
    setIsManageModalOpen(true);
    fetchPrescriptionList();
  };

  const closeManageModal = () => {
    setIsManageModalOpen(false);
    setEditingPrescription(null);
    setManageAlert(null);
  };

  const startEditPrescription = (rx) => {
    setManageAlert(null);
    let dateStr = '';
    if (rx.dispensedDate) {
      if (typeof rx.dispensedDate === 'string') {
        dateStr = rx.dispensedDate.slice(0, 10);
      } else {
        const d = new Date(rx.dispensedDate);
        if (!isNaN(d.getTime())) {
          dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }
      }
    }
    setEditForm({
      prescriptionId: rx.prescriptionId,
      hospitalName: rx.hospitalName || '',
      doctorName: rx.doctorName || '',
      dispensedDate: dateStr,
      totalDays: rx.totalDays || 3,
      items: (rx.items || []).map((it) => ({
        itemId: it.itemId,
        medicationId: it.medicationId,
        itemName: it.itemName || '',
        dailyDose: it.dailyDose != null ? it.dailyDose : 1,
        dailyFrequency: it.dailyFrequency || 3,
        usageTiming: it.usageTiming || '1일 3회 식후 30분',
        totalDays: it.totalDays || rx.totalDays || 3,
        className: it.className || '',
        ediCode: it.ediCode || '',
        isDiscontinued: Boolean(it.isDiscontinued),
      })),
    });
    setEditingPrescription(rx);
  };

  const handleSaveEdit = async () => {
    if (!editForm.hospitalName.trim()) {
      alert('의료기관(병원명)을 입력해주세요.');
      return;
    }
    if (editForm.items.length === 0) {
      alert('최소 1개 이상의 처방 약품이 포함되어야 합니다.');
      return;
    }
    for (let i = 0; i < editForm.items.length; i++) {
      if (!editForm.items[i].itemName.trim()) {
        alert(`${i + 1}번째 약품의 이름을 입력해주세요.`);
        return;
      }
    }

    setIsSavingEdit(true);
    setManageAlert(null);

    try {
      const res = await fetch(`/api/prescriptions/${editForm.prescriptionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });

      if (res.ok) {
        setManageAlert({ type: 'success', message: '처방전 정보가 성공적으로 수정되었습니다.' });
        await fetchPrescriptionList();
        await reloadPrescriptionAndRoutine();
        setTimeout(() => {
          setEditingPrescription(null);
          setManageAlert(null);
        }, 1200);
      } else {
        const errData = await res.json().catch(() => ({}));
        setManageAlert({ type: 'error', message: errData.message || '처방전 수정에 실패했습니다.' });
      }
    } catch (err) {
      console.error('처방전 수정 오류:', err);
      setManageAlert({ type: 'error', message: '서버 통신 중 오류가 발생했습니다.' });
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeletePrescription = async (rxId) => {
    if (!window.confirm('정말 이 처방전을 삭제하시겠습니까?\n포함된 처방 약품 및 오늘의 복약 루틴이 함께 삭제됩니다.')) {
      return;
    }

    try {
      const userId = user?.userId || 1;
      const res = await fetch(`/api/prescriptions/${rxId}?userId=${userId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        await fetchPrescriptionList();
        await reloadPrescriptionAndRoutine();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.message || '처방전 삭제에 실패했습니다.');
      }
    } catch (err) {
      console.error('처방전 삭제 오류:', err);
      alert('처방전 삭제 중 오류가 발생했습니다.');
    }
  };

  const handleAddMedicineToEdit = () => {
    setEditForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          itemId: null,
          medicationId: '',
          itemName: '',
          dailyDose: 1,
          dailyFrequency: 3,
          usageTiming: '1일 3회 식후 30분',
          totalDays: prev.totalDays || 3,
          className: '',
          ediCode: '',
          isDiscontinued: false,
        },
      ],
    }));
  };

  const handleRemoveMedicineFromEdit = (idx) => {
    setEditForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== idx),
    }));
  };

  const handleEditItemChange = (idx, field, value) => {
    setEditForm((prev) => {
      const nextItems = [...prev.items];
      nextItems[idx] = { ...nextItems[idx], [field]: value };
      return { ...prev, items: nextItems };
    });
  };

  // 컴포넌트 마운트 및 user.userId 변경 시 최신 처방전 DB 조회
  useEffect(() => {
    reloadPrescriptionAndRoutine();
  }, [reloadPrescriptionAndRoutine]);

  // 식사 시간이나 처방 데이터 변경 시 복약 루틴 알림 시간 재계산
  useEffect(() => {
    if (prescriptionData?.items && prescriptionData.items.length > 0) {
      setRoutineItems(buildRoutineItems(prescriptionData.items, mealTimes));
    } else {
      setRoutineItems([]);
    }
  }, [mealTimes, prescriptionData]);

  // 식사 시간 저장 핸들러
  const handleSaveMealTimes = async (e) => {
    e.preventDefault();
    setIsSavingMealTimes(true);
    const userId = user?.userId || 1;

    try {
      setMealTimes(tempMealTimes);
      try {
        localStorage.setItem(`jette_meal_times_${userId}`, JSON.stringify(tempMealTimes));
      } catch {}

      const res = await fetch('/api/users/meal-times', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          username: user?.username,
          breakfastTime: tempMealTimes.breakfast,
          lunchTime: tempMealTimes.lunch,
          dinnerTime: tempMealTimes.dinner,
          bedtime: tempMealTimes.bedtime,
        }),
      });

      if (res.ok) {
        setIsMealModalOpen(false);
      } else {
        setIsMealModalOpen(false);
      }
    } catch (err) {
      console.warn('식사 시간 저장 요청 실패:', err);
      setIsMealModalOpen(false);
    } finally {
      setIsSavingMealTimes(false);
    }
  };

  // 오늘의 복용 체크박스 토글
  const toggleRoutine = (id) => {
    setRoutineItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, taken: !item.taken } : item
      )
    );
  };

  // DB에 등록된 활성 복약 루틴 리스트
  const activeRoutineList = routineItems;
  const takenCount = activeRoutineList.filter((i) => i.taken).length;
  const totalCount = activeRoutineList.length;

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
      const firstTime = items[0]?.time || addMinutes(meta.defaultTime, 30);
      return {
        slot: meta.key,
        label: meta.label,
        time: firstTime,
        items,
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
      taken: takenCount,
      total: totalCount,
      isAllDone: totalCount > 0 && takenCount === totalCount,
    },
    ...groupedSlots.map((g) => {
      const tCount = g.items.filter((i) => i.taken).length;
      return {
        key: g.slot,
        label: g.label,
        timeHint: g.time,
        taken: tCount,
        total: g.items.length,
        isAllDone: g.items.length > 0 && tCount === g.items.length,
      };
    }),
  ];

  const displayedRoutineList =
    activeSlotKey === 'all'
      ? activeRoutineList
      : activeRoutineList.filter((i) => i.slot === activeSlotKey);

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
          if (active) setSearchResults(fallbackSearch(trimmed));
        }
      } catch {
        if (active) setSearchResults(fallbackSearch(trimmed));
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

  // 모달 열기/닫기 및 미리보기 메모리 해제
  const openUploadModal = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setUploadFile(null);
    setRotation(0);
    setIsFlipped(false);
    setIsUploadModalOpen(true);
  };

  const closeUploadModal = () => {
    if (isAnalyzing) return;
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setUploadFile(null);
    setRotation(0);
    setIsFlipped(false);
    setIsUploadModalOpen(false);
  };

  // 파일 선택 및 드롭 시 미리보기 URL 생성
  const handleFileSelect = (file) => {
    if (!file) return;
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setUploadFile(file);
    if (file.type && file.type.startsWith('image/')) {
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      setPreviewUrl(null);
    }
    setRotation(0);
    setIsFlipped(false);
  };

  // 클라이언트 측 Canvas 이미지 회전/반전 변환 유틸리티
  const getTransformedFile = async (file, rot, flipped) => {
    if (!file || !(file instanceof File) || !file.type.startsWith('image/') || (rot === 0 && !flipped)) {
      return file;
    }

    return new Promise((resolve) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const canvas = document.createElement('canvas');
        const isSideways = rot === 90 || rot === 270;

        canvas.width = isSideways ? img.naturalHeight : img.naturalWidth;
        canvas.height = isSideways ? img.naturalWidth : img.naturalHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }

        // 캔버스 중심점으로 원점 이동 후 회전/반전 수행
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((rot * Math.PI) / 180);
        if (flipped) {
          ctx.scale(-1, 1);
        }
        ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const baseName = file.name.replace(/\.[^/.]+$/, '');
              const adjustedFile = new File([blob], `${baseName}_adjusted.jpg`, {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });
              resolve(adjustedFile);
            } else {
              resolve(file);
            }
          },
          'image/jpeg',
          0.95
        );
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(file);
      };

      img.src = objectUrl;
    });
  };

  // 처방전 업로드 및 백엔드 OCR / DB 처리
  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!uploadFile) {
      alert('처방전 사진 또는 스캔본 파일을 선택해 주세요.');
      return;
    }
    setIsAnalyzing(true);

    try {
      // 1. 회전 또는 반전 보정이 적용된 경우 Canvas 변환 파일 생성
      const finalFile = await getTransformedFile(uploadFile, rotation, isFlipped);

      const formData = new FormData();
      formData.append('file', finalFile);
      formData.append('userId', user?.userId || 1);

      const res = await fetch('/api/prescriptions/upload', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.prescription) {
          const mapped = mapPrescriptionToState(data.prescription);
          setPrescriptionData(mapped);
          setRoutineItems(buildRoutineItems(mapped.items, mealTimes));
          setHasPrescription(true);
          closeUploadModal();
          alert('처방전 분석이 성공적으로 완료되었습니다!\n처방 약품 목록과 복용 주의점이 메인에 반영되었습니다.');
          return;
        }        throw new Error(data.message || '처방전 처리 응답 오류');
      }
      throw new Error('처방전 처리 응답 오류');
    } catch (err) {
      console.warn('처방전 분석 오류:', err);
      alert('처방전 분석 및 저장에 실패했습니다. 사진 파일 상태를 확인하고 다시 시도해 주세요.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const today = new Date();
  const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const monthNames = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
  const greetingDateStr = `${dayNames[today.getDay()]}, ${today.getDate()} ${monthNames[today.getMonth()]}`;
  const routineDateBadge = `${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;

  return (
    <div className="main-page-wrapper">
      {/* 1. 상단 인사말 영역 */}
      <header className="main-greeting-header">
        <span className="greeting-date">{greetingDateStr}</span>
        <h1 className="greeting-title">
          안녕하세요, <span className="user-highlight">{user?.name || user?.username || '사용자'}</span>님.
        </h1>
        <p className="greeting-subtitle">오늘도 몸의 이야기에 귀 기울여 볼까요?</p>
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

      {/* 3. 처방전 등록 전 vs 처방전 등록 후 영역 */}
      {!hasPrescription ? (
        /* -------------------------------------------------------------
           [처방전 등록 전 화면] (와이어프레임 메인,navbar,sidebar.jpg 명세)
           ------------------------------------------------------------- */
        <section className="empty-prescription-hero">
          <div className="empty-prescription-box">
            <div className="empty-icon-circle">
              <svg viewBox="0 0 48 48" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 8h20a4 4 0 0 1 4 4v24a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4V12a4 4 0 0 1 4-4z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M24 18v12m-6-6h12" />
              </svg>
            </div>
            <h2 className="empty-title">처방전을 등록해주세요.</h2>
            <p className="empty-subtitle">처방전 등록시 복용 일정과 성분을 자동으로 분석해 드립니다.</p>
            <div className="empty-actions-row">
              <button
                type="button"
                className="prescription-upload-btn"
                onClick={openUploadModal}
              >
                처방전 등록 <span className="btn-arrow">→</span>
              </button>
              <button
                type="button"
                className="manage-prescription-empty-btn"
                onClick={openManageModal}
              >
                내 처방전 목록/관리
              </button>
              <button
                type="button"
                className="guide-register-btn"
                onClick={() => navigate('/guide')}
              >
                내 약 관리 등록 <span className="btn-arrow">→</span>
              </button>
            </div>
          </div>
        </section>
      ) : (
        /* -------------------------------------------------------------
           [처방전 등록 후 화면] (메인.png 디자인)
           ------------------------------------------------------------- */
        <>
          {/* 처방전 요약 바 (PRESCRIPTION SUMMARY) */}
          <section className="prescription-summary-card">
            <div className="summary-col-left">
              <span className="summary-meta-label">PRESCRIPTION SUMMARY</span>
              <h2 className="summary-date-title">
                {prescriptionData?.dispensedDate ? `${prescriptionData.dispensedDate} 발급 처방전` : '최신 발급 처방전'}
              </h2>
              <span className="summary-hospital-info">
                {prescriptionData?.hospitalName || '의료기관'} · {prescriptionData?.doctorName || '처방의'}
              </span>
            </div>

            <div className="summary-stats-group">
              <div className="stat-unit">
                <span className="stat-number">{prescriptionData?.totalDays || 0}</span>
                <span className="stat-label">총 복용 일수</span>
              </div>
              <div className="stat-divider" />
              <div className="stat-unit">
                <span className="stat-number">{activeMedList.length}</span>
                <span className="stat-label">처방 약품</span>
              </div>
            </div>

            <div className="summary-col-right">
              <button
                type="button"
                className="new-prescription-btn"
                onClick={openUploadModal}
              >
                새 처방전 등록
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
                    처방 약품 <span className="count-num">{String(activeMedList.length).padStart(2, '0')}</span>
                  </h3>
                </div>
                <button
                  type="button"
                  className="card-link-action"
                  onClick={openManageModal}
                  title="내 처방전 목록 및 수정/삭제 관리"
                >
                  처방전 관리 &gt;
                </button>
              </div>

              <div className="meds-list-divider" />

              <div className="meds-vertical-list">
                {activeMedList.map((med) => (
                  <div
                    key={med.id}
                    className="med-item-row"
                    onClick={() => setSelectedMedDetail(med)}
                    title="상세 정보 보기"
                  >
                    <div className="med-item-left">
                      <span className="med-color-dot" style={{ backgroundColor: med.dotColor }} />
                      <div className="med-text-group">
                        <strong className="med-item-name">{med.name}</strong>
                        <p className="med-item-desc">{med.desc}</p>
                      </div>
                    </div>

                    <div className="med-item-right">
                      <span className={`med-type-pill ${med.badge === '처방' ? 'rx' : med.badge === '영양제' ? 'supp' : 'reg'}`}>
                        {med.badge}
                      </span>
                      <button
                        type="button"
                        className="med-more-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedMedDetail(med);
                        }}
                      >
                        ···
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 우측: 복용 전, 잠깐만요. (MEDICATION NOTE) */}
            {(() => {
              const medNotes = generateMedicationNotes(prescriptionData);
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
                        <span className="note-point-icon">{pt.icon}</span>
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
      )}

      {/* 4. 하단 영역: 오늘의 복약 루틴 (TODAY'S ROUTINE) */}
      <section className="today-routine-card today-routine-dark-card">
        <div className="routine-header-row">
          <span className="routine-label">TODAY'S ROUTINE</span>
          <div className="routine-header-actions">
            <span className="routine-date-badge">{routineDateBadge}</span>
            <button
              type="button"
              className="meal-setting-btn"
              onClick={() => {
                setTempMealTimes(mealTimes);
                setIsMealModalOpen(true);
              }}
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
            오늘의 복용 <span className="taken-highlight">{takenCount}</span>/{totalCount}
          </h3>
          <span className="routine-rate-tip">
            {totalCount === 0
              ? '처방전을 등록하시면 복약 루틴이 생성됩니다'
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
                  {tab.isAllDone ? '✓' : `${tab.taken}/${tab.total}`}
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
              <p className="routine-empty-text">
                {hasPrescription
                  ? '등록된 복약 일정이 없습니다.'
                  : '처방전을 등록하시면 1일 복용 횟수와 식사 시간에 맞춰 오늘의 복약 루틴이 자동으로 계산되어 등록됩니다.'}
              </p>
              {!hasPrescription && (
                <button
                  type="button"
                  className="routine-empty-cta-btn"
                  onClick={openUploadModal}
                >
                  처방전 등록하고 시작하기 →
                </button>
              )}
            </div>
          ) : activeSlotKey === 'all' ? (
            /* 전체 보기 모드: 시간대별 섹션으로 그룹화 표시 */
            <div className="routine-grouped-container">
              {groupedSlots.map((group) => {
                const groupTaken = group.items.filter((i) => i.taken).length;
                const groupAllDone = group.items.length > 0 && groupTaken === group.items.length;
                return (
                  <div key={group.slot} className="routine-slot-section">
                    <div className="slot-section-header">
                      <div className="slot-section-info">
                        <span className="slot-section-badge">{group.label}</span>
                        <span className="slot-section-time">{group.time} 복용 예정</span>
                      </div>
                      <span className={`slot-section-counter ${groupAllDone ? 'done' : ''}`}>
                        {groupAllDone ? '✓ 복용 완료' : `${groupTaken} / ${group.items.length} 완료`}
                      </span>
                    </div>

                    <div className="slot-section-items">
                      {group.items.map((item) => (
                        <div
                          key={item.id}
                          className={`routine-item-row ${item.taken ? 'is-taken' : ''}`}
                          onClick={() => toggleRoutine(item.id)}
                        >
                          <div className="routine-item-left">
                            <div className={`custom-checkbox ${item.taken ? 'checked' : ''}`}>
                              {item.taken && (
                                <svg viewBox="0 0 14 14" fill="none" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 7l3 3 5-6" />
                                </svg>
                              )}
                            </div>
                            <span className="routine-time">{item.time}</span>
                            <span className="routine-name">{item.name}</span>
                          </div>
                          <div className="routine-item-right">
                            <span className="routine-dot" style={{ backgroundColor: item.dotColor }} />
                          </div>
                        </div>
                      ))}
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
                  {displayedRoutineList.filter((i) => i.taken).length} / {displayedRoutineList.length} 완료
                </span>
              </div>

              {displayedRoutineList.map((item) => (
                <div
                  key={item.id}
                  className={`routine-item-row ${item.taken ? 'is-taken' : ''}`}
                  onClick={() => toggleRoutine(item.id)}
                >
                  <div className="routine-item-left">
                    <div className={`custom-checkbox ${item.taken ? 'checked' : ''}`}>
                      {item.taken && (
                        <svg viewBox="0 0 14 14" fill="none" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 7l3 3 5-6" />
                        </svg>
                      )}
                    </div>
                    <span className="routine-time">{item.time}</span>
                    <span className="routine-name">{item.name}</span>
                  </div>
                  <div className="routine-item-right">
                    <span className="routine-dot" style={{ backgroundColor: item.dotColor }} />
                  </div>
                </div>
              ))}
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

      {/* -------------------------------------------------------------
         모달 1: 처방전 업로드 & 자동 분석 모달
         ------------------------------------------------------------- */}
      {isUploadModalOpen && (
        <div className="modal-backdrop" onClick={closeUploadModal}>
          <div className="modal-content-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3 className="modal-title">처방전 등록 및 AI 분석</h3>
              <button
                type="button"
                className="modal-close"
                disabled={isAnalyzing}
                onClick={closeUploadModal}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="upload-form">
              {/* 처방전 촬영 안내 배너 */}
              <div className="upload-guide-banner">
                <div className="guide-banner-header">
                  <span className="guide-icon">INFO</span>
                  <strong>처방전 촬영 및 업로드 안내</strong>
                </div>
                <p className="guide-text">
                  글자가 수평(가로)으로 똑바로 읽히도록 촬영해 주세요. 기울어지거나 좌우가 뒤집힌 사진은 아래 <strong>[회전]</strong> 및 <strong>[반전]</strong> 도구로 올바르게 교정하신 후 분석을 진행해 주세요.
                </p>
              </div>

              {/* 업로드 드롭존 */}
              <div
                className={`upload-dropzone ${isDragging ? 'dragover' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    handleFileSelect(e.dataTransfer.files[0]);
                  }
                }}
              >
                <svg className="upload-cloud-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <strong>처방전 사진 또는 스캔본 업로드</strong>
                <p>JPG, PNG, PDF 형식 지원 (최대 15MB) · 파일 드래그 & 드롭 가능</p>
                <input
                  type="file"
                  id="prescription-file-input"
                  className="file-hidden-input"
                  accept="image/*,.pdf"
                  onChange={(e) => handleFileSelect(e.target.files && e.target.files[0])}
                />
                <label htmlFor="prescription-file-input" className="file-pick-btn">
                  {uploadFile ? `선택됨: ${uploadFile.name}` : '파일 찾아보기'}
                </label>
              </div>

              {/* 실시간 이미지 미리보기 및 회전/반전 툴바 */}
              {previewUrl && (
                <div className="preview-container">
                  <div className="preview-header">
                    <span className="preview-title">처방전 방향 확인 및 교정</span>
                    {(rotation !== 0 || isFlipped) && (
                      <span className="preview-badge">
                        교정 적용: {rotation}° {isFlipped ? '(좌우반전)' : ''}
                      </span>
                    )}
                  </div>

                  <div className="preview-viewport">
                    <img
                      src={previewUrl}
                      alt="처방전 미리보기"
                      className="preview-image"
                      style={{
                        transform: `rotate(${rotation}deg) scaleX(${isFlipped ? -1 : 1})`,
                      }}
                    />
                  </div>

                  <div className="preview-toolbar">
                    <button
                      type="button"
                      className="tool-btn"
                      onClick={() => setRotation((r) => (r + 270) % 360)}
                      title="왼쪽으로 90도 회전"
                    >
                      <span className="tool-icon">↺</span> 90° 좌회전
                    </button>
                    <button
                      type="button"
                      className="tool-btn"
                      onClick={() => setRotation((r) => (r + 90) % 360)}
                      title="오른쪽으로 90도 회전"
                    >
                      <span className="tool-icon">↻</span> 90° 우회전
                    </button>
                    <button
                      type="button"
                      className={`tool-btn ${isFlipped ? 'active' : ''}`}
                      onClick={() => setIsFlipped((f) => !f)}
                      title="셀카 모드 거울상 좌우 반전"
                    >
                      <span className="tool-icon">⇄</span> 좌우 반전
                    </button>
                    <button
                      type="button"
                      className="tool-btn reset-btn"
                      onClick={() => {
                        setRotation(0);
                        setIsFlipped(false);
                      }}
                      disabled={rotation === 0 && !isFlipped}
                      title="원본 방향으로 초기화"
                    >
                      <span className="tool-icon">⟲</span> 초기화
                    </button>
                  </div>

                  <p className="preview-hint">
                    ✓ 글자가 가로 방향으로 똑바로 보이도록 조정한 후 아래 [분석 및 등록 완료]를 눌러주세요.
                  </p>
                </div>
              )}

              {isAnalyzing && (
                <div className="analyzing-progress">
                  <div className="progress-spinner" />
                  <p>처방전 OCR 및 의약품 상호작용 분석 중...</p>
                </div>
              )}

              <div className="modal-foot">
                <button
                  type="button"
                  className="btn-cancel modal-cancel-btn"
                  disabled={isAnalyzing}
                  onClick={closeUploadModal}
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="btn-confirm modal-confirm-btn"
                  disabled={isAnalyzing}
                >
                  {isAnalyzing ? '분석 중...' : '분석 및 등록 완료'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------
         모달 2: 약품 상세 정보 모달
         ------------------------------------------------------------- */}
      {selectedMedDetail && (
        <div className="modal-backdrop" onClick={() => setSelectedMedDetail(null)}>
          <div className="modal-content-box med-detail-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div className="detail-head-left">
                <span className="med-color-dot" style={{ backgroundColor: selectedMedDetail.dotColor }} />
                <h3 className="modal-title">{selectedMedDetail.name}</h3>
                <span className="med-type-pill rx">{selectedMedDetail.badge}</span>
              </div>
              <button type="button" className="modal-close" onClick={() => setSelectedMedDetail(null)}>✕</button>
            </div>

            <div className="med-detail-body">
              <div className="detail-field">
                <label>효능 · 효과</label>
                <p>{selectedMedDetail.efficacy}</p>
              </div>
              <div className="detail-field">
                <label>용법 · 용량</label>
                <p>{selectedMedDetail.dosage}</p>
              </div>
              <div className="detail-field">
                <label>복용 시 주의사항</label>
                <p className="caution-text">{selectedMedDetail.caution}</p>
              </div>
            </div>

            <div className="modal-foot">
              <button
                type="button"
                className="btn-confirm modal-confirm-btn"
                onClick={() => {
                  setSelectedMedDetail(null);
                  navigate('/guide');
                }}
              >
                내 약 관리 보기 →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------
         모달 3: 복용 주의점 자세히 보기 모달
         ------------------------------------------------------------- */}
      {isCautionModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsCautionModalOpen(false)}>
          <div className="modal-content-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3 className="modal-title">복용 전 성분 상호작용 주의사항</h3>
              <button type="button" className="modal-close" onClick={() => setIsCautionModalOpen(false)}>✕</button>
            </div>

            <div className="caution-modal-body">
              {prescriptionData?.hasDiscontinuedDrug === 1 && (
                <div className="caution-summary-card" style={{ borderColor: '#e5a7ad', background: '#fff8f8' }}>
                  <strong style={{ color: '#c04b4b' }}>[주의] 판매중단 또는 주의 대상 의약품 포함</strong>
                  <p>처방전에 판매중단 또는 재검토 대상 의약품이 포함되어 있습니다. 복용 전 반드시 처방의료진과 재확인하세요.</p>
                </div>
              )}

              <div className="caution-guidance">
                <h4>처방 약품별 주의사항 및 복용 안내:</h4>
                <ul>
                  {prescriptionData?.items && prescriptionData.items.length > 0 ? (
                    prescriptionData.items.map((item, idx) => (
                      <li key={idx}>
                        <strong>{item.name}:</strong> {item.caution || '정해진 용법과 용량을 준수하여 복용하세요.'} ({item.dosage})
                      </li>
                    ))
                  ) : (
                    <li>등록된 처방 의약품의 개별 복용 주의사항을 확인하세요.</li>
                  )}
                </ul>
              </div>
            </div>

            <div className="modal-foot">
              <button
                type="button"
                className="btn-confirm modal-confirm-btn"
                onClick={() => {
                  setIsCautionModalOpen(false);
                  navigate('/guide');
                }}
              >
                내 약 관리에서 전체 확인하기
              </button>
            </div>
          </div>
        </div>
      )}
      {/* -------------------------------------------------------------
         모달 4: 사용자 맞춤 식사 시간 설정 모달
         ------------------------------------------------------------- */}
      {isMealModalOpen && (
        <div className="modal-backdrop" onClick={() => !isSavingMealTimes && setIsMealModalOpen(false)}>
          <div className="modal-content-box meal-time-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3 className="modal-title">맞춤 식사 및 취침 시간 설정</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setIsMealModalOpen(false)}
                disabled={isSavingMealTimes}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveMealTimes} className="meal-modal-form">
              <div className="meal-modal-intro">
                <p>
                  평소 식사하시는 시간을 설정해 두시면, 처방전의 <strong>‘식후 30분’</strong>, <strong>‘식전 30분’</strong> 등의 복약 알림 시간이 자동으로 계산되어 딱 맞춰집니다.
                </p>
              </div>

              <div className="meal-inputs-grid">
                <div className="meal-input-group">
                  <label htmlFor="meal-breakfast">
                    아침 식사 시간
                  </label>
                  <input
                    id="meal-breakfast"
                    type="time"
                    className="styled-time-input"
                    value={tempMealTimes.breakfast}
                    onChange={(e) =>
                      setTempMealTimes((prev) => ({ ...prev, breakfast: e.target.value }))
                    }
                    required
                  />
                  <span className="meal-calc-hint">
                    식후 30분 복용 시 <strong>{addMinutes(tempMealTimes.breakfast, 30)}</strong>
                  </span>
                </div>

                <div className="meal-input-group">
                  <label htmlFor="meal-lunch">
                    점심 식사 시간
                  </label>
                  <input
                    id="meal-lunch"
                    type="time"
                    className="styled-time-input"
                    value={tempMealTimes.lunch}
                    onChange={(e) =>
                      setTempMealTimes((prev) => ({ ...prev, lunch: e.target.value }))
                    }
                    required
                  />
                  <span className="meal-calc-hint">
                    식후 30분 복용 시 <strong>{addMinutes(tempMealTimes.lunch, 30)}</strong>
                  </span>
                </div>

                <div className="meal-input-group">
                  <label htmlFor="meal-dinner">
                    저녁 식사 시간
                  </label>
                  <input
                    id="meal-dinner"
                    type="time"
                    className="styled-time-input"
                    value={tempMealTimes.dinner}
                    onChange={(e) =>
                      setTempMealTimes((prev) => ({ ...prev, dinner: e.target.value }))
                    }
                    required
                  />
                  <span className="meal-calc-hint">
                    식후 30분 복용 시 <strong>{addMinutes(tempMealTimes.dinner, 30)}</strong>
                  </span>
                </div>

                <div className="meal-input-group">
                  <label htmlFor="meal-bedtime">
                    취침 시간
                  </label>
                  <input
                    id="meal-bedtime"
                    type="time"
                    className="styled-time-input"
                    value={tempMealTimes.bedtime}
                    onChange={(e) =>
                      setTempMealTimes((prev) => ({ ...prev, bedtime: e.target.value }))
                    }
                    required
                  />
                  <span className="meal-calc-hint">
                    취침 전 복용 시 <strong>{tempMealTimes.bedtime}</strong>
                  </span>
                </div>
              </div>

              {/* 실시간 알림 시간대 미리보기 박스 */}
              <div className="meal-preview-box">
                <div className="preview-title">
                  <span>1일 3회 식후 30분 처방약 기준 복약 스케줄 미리보기</span>
                </div>
                <div className="preview-schedule-pills">
                  <div className="preview-pill">
                    <span className="pill-badge">아침</span>
                    <span className="pill-time">{addMinutes(tempMealTimes.breakfast, 30)}</span>
                  </div>
                  <span className="preview-arrow">→</span>
                  <div className="preview-pill">
                    <span className="pill-badge">점심</span>
                    <span className="pill-time">{addMinutes(tempMealTimes.lunch, 30)}</span>
                  </div>
                  <span className="preview-arrow">→</span>
                  <div className="preview-pill">
                    <span className="pill-badge">저녁</span>
                    <span className="pill-time">{addMinutes(tempMealTimes.dinner, 30)}</span>
                  </div>
                </div>
              </div>

              <div className="modal-foot">
                <button
                  type="button"
                  className="btn-default-reset"
                  onClick={() => setTempMealTimes(DEFAULT_MEAL_TIMES)}
                  disabled={isSavingMealTimes}
                  title="기본값(07:30, 12:00, 18:30, 22:00)으로 초기화"
                >
                  기본값 복원
                </button>
                <div className="modal-foot-right">
                  <button
                    type="button"
                    className="btn-cancel modal-cancel-btn"
                    onClick={() => setIsMealModalOpen(false)}
                    disabled={isSavingMealTimes}
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    className="btn-confirm modal-confirm-btn"
                    disabled={isSavingMealTimes}
                  >
                    {isSavingMealTimes ? '저장 중...' : '저장하기'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =============================================================
          [모달 4] 내 처방전 목록/수정/삭제 관리 모달
          ============================================================= */}
      {isManageModalOpen && (
        <div className="manage-rx-modal-overlay" onClick={closeManageModal}>
          <div className="manage-rx-modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="manage-rx-header">
              <div>
                <span className="manage-rx-kicker">PRESCRIPTION MANAGEMENT</span>
                <h3 className="manage-rx-title">
                  {editingPrescription ? '처방전 정보 수정' : '내 처방전 보관함 및 관리'}
                </h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={closeManageModal}
                aria-label="닫기"
              >
                ✕
              </button>
            </div>

            {manageAlert && (
              <div className={`manage-alert-banner ${manageAlert.type}`}>
                {manageAlert.type === 'success' ? '✓ ' : '[주의] '}
                {manageAlert.message}
              </div>
            )}

            <div className="manage-rx-body">
              {!editingPrescription ? (
                /* ----------------- 목록 뷰 ----------------- */
                <div className="manage-rx-list-view">
                  <div className="manage-rx-list-intro">
                    <p className="manage-intro-text">
                      등록된 처방전 <strong>{prescriptionList.length}</strong>건이 보관되어 있습니다.
                    </p>
                    <button
                      type="button"
                      className="manage-add-rx-btn"
                      onClick={() => {
                        closeManageModal();
                        openUploadModal();
                      }}
                    >
                      + 새 처방전 추가 등록
                    </button>
                  </div>

                  {isLoadingList ? (
                    <div className="manage-loading-box">
                      <div className="spinner" />
                      <p>처방전 목록을 불러오는 중입니다...</p>
                    </div>
                  ) : prescriptionList.length === 0 ? (
                    <div className="manage-empty-box">
                      <span className="manage-empty-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="36" height="36">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                      </span>
                      <p className="manage-empty-title">등록된 처방전이 없습니다.</p>
                      <p className="manage-empty-desc">처방전 사진을 업로드하여 복약 일정 관리를 시작해보세요.</p>
                      <button
                        type="button"
                        className="manage-empty-cta"
                        onClick={() => {
                          closeManageModal();
                          openUploadModal();
                        }}
                      >
                        처방전 등록하기 →
                      </button>
                    </div>
                  ) : (
                    <div className="manage-cards-grid">
                      {prescriptionList.map((rx, index) => {
                        const isLatest = index === 0;
                        const dateStr = rx.dispensedDate
                          ? (typeof rx.dispensedDate === 'string' ? rx.dispensedDate.slice(0, 10).replace(/-/g, '.') : '')
                          : '날짜 미상';
                        const itemCount = rx.items ? rx.items.length : 0;
                        return (
                          <div key={rx.prescriptionId} className={`manage-card ${isLatest ? 'is-active-rx' : ''}`}>
                            <div className="manage-card-top">
                              <div className="manage-card-badge-row">
                                {isLatest && <span className="rx-status-badge active">현재 복용 중 (최신)</span>}
                                <span className="rx-dispensed-date">조제일: {dateStr}</span>
                                <span className="rx-days-badge">{rx.totalDays || 0}일분</span>
                              </div>
                              <div className="manage-card-actions">
                                <button
                                  type="button"
                                  className="manage-action-edit-btn"
                                  onClick={() => startEditPrescription(rx)}
                                  title="처방전 및 약품 수정"
                                >
                                  수정
                                </button>
                                <button
                                  type="button"
                                  className="manage-action-del-btn"
                                  onClick={() => handleDeletePrescription(rx.prescriptionId)}
                                  title="처방전 삭제"
                                >
                                  삭제
                                </button>
                              </div>
                            </div>

                            <div className="manage-card-middle">
                              <h4 className="manage-hospital-name">
                                {rx.hospitalName || '의료기관'}
                                <span className="manage-doctor-name"> · {rx.doctorName || '처방의'}</span>
                              </h4>
                              {rx.hasDiscontinuedDrug === 1 && (
                                <span className="manage-discontinued-warn">[주의] 판매중단 약품 포함</span>
                              )}
                            </div>

                            <div className="manage-card-items-preview">
                              <span className="items-count-label">포함 약품 ({itemCount}종):</span>
                              <div className="meds-preview-chips">
                                {rx.items && rx.items.length > 0 ? (
                                  rx.items.map((it, itIdx) => (
                                    <span key={itIdx} className="med-preview-chip">
                                      {it.itemName} ({it.dailyFrequency}회/{it.dailyDose}정)
                                    </span>
                                  ))
                                ) : (
                                  <span className="med-preview-chip empty">등록된 약품 없음</span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                /* ----------------- 수정 뷰 ----------------- */
                <div className="manage-rx-edit-view">
                  <div className="edit-back-row">
                    <button
                      type="button"
                      className="edit-back-btn"
                      onClick={() => setEditingPrescription(null)}
                    >
                      ← 목록으로 돌아가기
                    </button>
                    <span className="edit-rx-id">처방전 ID #{editForm.prescriptionId}</span>
                  </div>

                  <div className="edit-form-section">
                    <h4 className="edit-section-title">기본 정보</h4>
                    <div className="edit-fields-grid">
                      <div className="edit-field-group">
                        <label>의료기관명 (병원/의원)</label>
                        <input
                          type="text"
                          value={editForm.hospitalName}
                          onChange={(e) => setEditForm({ ...editForm, hospitalName: e.target.value })}
                          placeholder="예: 한내과의원"
                        />
                      </div>
                      <div className="edit-field-group">
                        <label>처방의 / 담당의사</label>
                        <input
                          type="text"
                          value={editForm.doctorName}
                          onChange={(e) => setEditForm({ ...editForm, doctorName: e.target.value })}
                          placeholder="예: 김도현 원장"
                        />
                      </div>
                      <div className="edit-field-group">
                        <label>처방 / 조제 일자</label>
                        <input
                          type="date"
                          value={editForm.dispensedDate}
                          onChange={(e) => setEditForm({ ...editForm, dispensedDate: e.target.value })}
                        />
                      </div>
                      <div className="edit-field-group">
                        <label>총 투약 일수 (일)</label>
                        <input
                          type="number"
                          min="1"
                          max="365"
                          value={editForm.totalDays}
                          onChange={(e) => setEditForm({ ...editForm, totalDays: parseInt(e.target.value, 10) || 1 })}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="edit-form-section">
                    <div className="edit-items-header">
                      <h4 className="edit-section-title">처방 약품 및 복용 용법 편집 ({editForm.items.length}종)</h4>
                      <button
                        type="button"
                        className="edit-add-item-btn"
                        onClick={handleAddMedicineToEdit}
                      >
                        + 약품 추가
                      </button>
                    </div>

                    <div className="edit-items-table-wrapper">
                      <table className="edit-items-table">
                        <thead>
                          <tr>
                            <th style={{ width: '30%' }}>약품명</th>
                            <th style={{ width: '18%' }}>1일 복용 횟수</th>
                            <th style={{ width: '16%' }}>1회 투약량</th>
                            <th style={{ width: '28%' }}>복용 시점 / 용법</th>
                            <th style={{ width: '8%' }}>삭제</th>
                          </tr>
                        </thead>
                        <tbody>
                          {editForm.items.map((item, idx) => (
                            <tr key={idx}>
                              <td>
                                <input
                                  type="text"
                                  className="table-input"
                                  value={item.itemName}
                                  onChange={(e) => handleEditItemChange(idx, 'itemName', e.target.value)}
                                  placeholder="약품명 입력"
                                />
                              </td>
                              <td>
                                <select
                                  className="table-select"
                                  value={item.dailyFrequency}
                                  onChange={(e) => handleEditItemChange(idx, 'dailyFrequency', parseInt(e.target.value, 10))}
                                >
                                  <option value={1}>1일 1회</option>
                                  <option value={2}>1일 2회</option>
                                  <option value={3}>1일 3회</option>
                                  <option value={4}>1일 4회</option>
                                </select>
                              </td>
                              <td>
                                <div className="dose-input-group">
                                  <input
                                    type="number"
                                    step="0.5"
                                    min="0.5"
                                    max="10"
                                    className="table-input number-input"
                                    value={item.dailyDose}
                                    onChange={(e) => handleEditItemChange(idx, 'dailyDose', parseFloat(e.target.value) || 1)}
                                  />
                                  <span className="dose-unit">정/포</span>
                                </div>
                              </td>
                              <td>
                                <input
                                  type="text"
                                  className="table-input"
                                  value={item.usageTiming}
                                  onChange={(e) => handleEditItemChange(idx, 'usageTiming', e.target.value)}
                                  placeholder="예: 1일 3회 식후 30분"
                                />
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <button
                                  type="button"
                                  className="table-del-btn"
                                  onClick={() => handleRemoveMedicineFromEdit(idx)}
                                  title="약품 삭제"
                                >
                                  ✕
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="edit-form-footer">
                    <button
                      type="button"
                      className="edit-cancel-btn"
                      onClick={() => setEditingPrescription(null)}
                      disabled={isSavingEdit}
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      className="edit-save-btn"
                      onClick={handleSaveEdit}
                      disabled={isSavingEdit}
                    >
                      {isSavingEdit ? '저장 중...' : '저장 완료'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
