/**
 * MainPage 관련 순수 유틸리티 및 헬퍼 함수 모음
 */

// 사용자별 식사 및 취침 기준 시간 기본값
export const DEFAULT_MEAL_TIMES = {
  breakfast: '07:30',
  lunch: '12:00',
  dinner: '18:30',
  bedtime: '22:00',
};

export const DOT_COLORS = ['#c04b4b', '#e09f3e', '#5c9e76', '#4a69bd', '#8b3e4b', '#2e86de'];

// YYYY-MM-DD 또는 YYYY.MM.DD 문자열을 Date 객체로 변환 (타임존 오차 방지)
export function parseDateOnly(dateInput) {
  if (!dateInput) return null;
  if (dateInput instanceof Date) {
    return new Date(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate());
  }
  const str = String(dateInput).slice(0, 10).replace(/\./g, '-');
  const parts = str.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      return new Date(y, m, d);
    }
  }
  return null;
}

export function formatDateToHyphen(date) {
  if (!date || isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDateToDot(date) {
  if (!date || isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}.${m}.${d}`;
}

export function formatDateWithDay(date) {
  if (!date || isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${y}.${m}.${d} (${days[date.getDay()]})`;
}

export function formatDateShort(date) {
  if (!date || isNaN(date.getTime())) return '';
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${m}.${d}`;
}

// 복약 체크 상태 영구 보존용 로컬 스토리지 키 생성 (사용자별 + 날짜별)
export function getRoutineStorageKey(userId, dateStr) {
  if (!userId || !dateStr) return null;
  return `jette_routine_intake_${userId}_${dateStr}`;
}

// 특정 날짜의 복약 체크 맵 불러오기
export function loadRoutineIntakeMap(userId, dateStr) {
  if (!userId || !dateStr) return {};
  try {
    const key = getRoutineStorageKey(userId, dateStr);
    if (!key) return {};
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    }
  } catch (err) {
    console.warn('복약 체크 내역 로드 실패:', err);
  }
  return {};
}

// 특정 날짜의 복약 체크 맵 영구 저장
export function saveRoutineIntakeMap(userId, dateStr, map) {
  if (!userId || !dateStr || !map) return;
  try {
    const key = getRoutineStorageKey(userId, dateStr);
    if (!key) return;
    localStorage.setItem(key, JSON.stringify(map));
  } catch (err) {
    console.warn('복약 체크 내역 저장 실패:', err);
  }
}

// 복용 시각 포맷팅 (HH:mm) - KST 로컬 문자열 및 UTC ISO 문자열 모두 완벽 지원
export function formatTimeOnly(isoOrDateStr) {
  if (!isoOrDateStr) return '';
  // 1) "YYYY-MM-DDTHH:mm:ss" 또는 "YYYY-MM-DD HH:mm:ss" 형태 (Z 없는 KST 기준 문자열)
  if (typeof isoOrDateStr === 'string' && (isoOrDateStr.includes('T') || isoOrDateStr.includes(' '))) {
    if (!isoOrDateStr.endsWith('Z')) {
      const parts = isoOrDateStr.split(/[T\s]/);
      if (parts.length >= 2 && parts[1].length >= 5) {
        return parts[1].substring(0, 5);
      }
    }
  }
  // 2) UTC ISO 문자열(Z 포함) 또는 Date 객체인 경우 로컬 시간대로 변환
  const d = new Date(isoOrDateStr);
  if (isNaN(d.getTime())) return '';
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function getTargetDateDiffText(targetDate) {
  const today = new Date();
  const target = parseDateOnly(targetDate);
  const now = parseDateOnly(today);
  if (!target || !now) return '';
  const diffDays = Math.floor((target.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return '오늘';
  if (diffDays === -1) return '어제';
  if (diffDays === 1) return '내일';
  if (diffDays < 0) return `${Math.abs(diffDays)}일 전`;
  return `${diffDays}일 후`;
}

// 조제일 기준 특정 타겟 날짜의 복약 진행 상태 판별
export function getPrescriptionStatus(dispensedDateStr, totalDays, targetDate) {
  const start = parseDateOnly(dispensedDateStr);
  const target = parseDateOnly(targetDate || new Date());
  const days = Number(totalDays) || 1;

  if (!start || !target) {
    return {
      status: 'active',
      badgeText: `총 ${days}일분`,
      badgeDetail: `총 ${days}일 처방`,
      dayNum: 1,
      totalDays: days,
      isTaking: true,
      startDateStr: dispensedDateStr || '',
      endDateStr: '',
      progressPercent: 100,
      diffFromStart: 0,
    };
  }

  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  end.setDate(end.getDate() + (days - 1));

  const oneDayMs = 24 * 60 * 60 * 1000;
  const diffFromStart = Math.floor((target.getTime() - start.getTime()) / oneDayMs);

  const startDateStr = formatDateToDot(start);
  const endDateStr = formatDateToDot(end);

  if (diffFromStart < 0) {
    const dMinus = Math.abs(diffFromStart);
    return {
      status: 'upcoming',
      badgeText: `복용 예정 (D-${dMinus})`,
      badgeDetail: `복용 시작 D-${dMinus} (총 ${days}일분)`,
      dayNum: 0,
      totalDays: days,
      isTaking: false,
      startDateStr,
      endDateStr,
      progressPercent: 0,
      diffFromStart,
      dMinus,
    };
  } else if (diffFromStart < days) {
    const dayNum = diffFromStart + 1;
    const progress = Math.min(100, Math.round((dayNum / days) * 100));
    return {
      status: 'taking',
      badgeText: `복용 ${dayNum}일차`,
      badgeDetail: `복용 ${dayNum}일차 / 총 ${days}일`,
      dayNum: dayNum,
      totalDays: days,
      isTaking: true,
      startDateStr,
      endDateStr,
      progressPercent: progress,
      diffFromStart,
    };
  } else {
    return {
      status: 'completed',
      badgeText: `복용 완료`,
      badgeDetail: `총 ${days}일 복용 완료 (완료일: ${endDateStr})`,
      dayNum: days,
      totalDays: days,
      isTaking: false,
      startDateStr,
      endDateStr,
      progressPercent: 100,
      diffFromStart,
    };
  }
}

// 식약처 의약품 분류 코드([02390] 등) 및 접두어를 정제하여 사용자 친화적인 약효명으로 변환
export function cleanCategoryName(rawName) {
  if (!rawName || typeof rawName !== 'string') return '';
  // 1. [02390] 같은 앞쪽 숫자 분류 코드 제거
  let clean = rawName.replace(/^\[\d+\]\s*/, '').trim();
  // 2. '기타의 ' 접두사 제거 (예: '기타의 소화기관용약' -> '소화기관용약')
  clean = clean.replace(/^기타의\s*/, '').trim();
  // 3. '주로 ~ 균에 작용하는 것' 등의 긴 행정 분류명 축약
  if (clean.includes('그람양성') || clean.includes('균에 작용')) {
    clean = '항생·항균제';
  } else if (clean.includes('개개의 기관계용 의약품')) {
    clean = '기관계용 의약품';
  }
  return clean;
}

// 효능군 및 약품명 기반 스마트 복약 주의사항 룰 매칭 (DB null 대응 및 Fallback)
export function getMedicineCaution(item) {
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

export function mapPrescriptionToState(prescription) {
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
  let aiGuide = prescription.aiGuide || null;
  if (prescription.aiSummaryJson) {
    try {
      const parsed = JSON.parse(prescription.aiSummaryJson);
      if (parsed.hospitalName && hospital === '의료기관') hospital = parsed.hospitalName;
      if (parsed.doctorName && doctor === '처방의') doctor = parsed.doctorName;
      if (!aiGuide && parsed.aiGuide) aiGuide = parsed.aiGuide;
    } catch {
      // ignore
    }
  }

  const items = (prescription.items && prescription.items.length > 0)
    ? prescription.items.map((item, idx) => {
        let freq = Number(item.dailyFrequency) || 1;
        const dose = item.dailyDose != null ? item.dailyDose : 1;
        const timing = item.usageTiming || '식후 복용';
        const timingLower = timing.toLowerCase();
        if (timingLower.includes('1일 1회') || timingLower.includes('1일1회') || timingLower.includes('하루 1회') || timingLower.includes('하루1회') || (timingLower.includes('1회') && !timingLower.includes('2회') && !timingLower.includes('3회') && !timingLower.includes('4회'))) {
          freq = 1;
        } else if (timingLower.includes('2회') && !timingLower.includes('3회')) {
          freq = 2;
        } else if (timingLower.includes('3회')) {
          freq = 3;
        }
        const rawClass = item.className || '';
        const className = cleanCategoryName(rawClass);
        const materialName = item.materialName || '';
        const rawEfficacy = item.efficacy || '';
        const efficacy = cleanCategoryName(rawEfficacy) || className || '전문의 처방 의약품';
        const usageDosage = item.usageDosage || `1일 ${freq}회 · 1회 ${dose}정 (${timing})`;
        const isDiscontinued = Boolean(item.isDiscontinued);

        return {
          id: item.itemId ? `rx-${item.itemId}` : `rx-${idx}`,
          itemId: item.itemId,
          medicationId: item.medicationId,
          name: item.itemName || '처방 의약품',
          itemName: item.itemName || '처방 의약품',
          desc: className ? `${className} · ${timing}` : (timing || '식후 30분 복용'),
          badge: '처방',
          dosage: usageDosage,
          dailyFrequency: freq,
          dailyDose: dose,
          totalDays: item.totalDays || prescription.totalDays || 14,
          usageTiming: timing,
          efficacy: efficacy,
          usageDosage: usageDosage,
          materialName: materialName,
          className: className,
          rawClassName: rawClass,
          caution: getMedicineCaution({
            isDiscontinued,
            className,
            name: item.itemName,
            materialName,
          }),
          timing: timing,
          isDiscontinued: isDiscontinued,
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
    aiGuide: aiGuide,
    aiSummaryJson: prescription.aiSummaryJson,
    items: items,
  };
}

// '복용 전, 잠깐만요 (MEDICATION NOTE)' 맞춤형 체크포인트 생성 엔진 (API 비용 0원, 0ms 실시간 분석)
export function generateMedicationNotes(prescriptionData, rxStatus, activeMeds) {
  if (!prescriptionData || !prescriptionData.items || prescriptionData.items.length === 0) {
    return {
      hasDiscontinued: false,
      badgeText: '기본 수칙',
      badgeType: 'safe',
      points: [
        {
          category: '복약 수칙 안내',
          text: '등록된 처방 의약품이 없습니다. 처방전을 등록하시면 약품별 맞춤 복용 주의사항이 자동으로 계산되어 안내됩니다.',
        },
      ],
    };
  }

  const isCompleted = rxStatus?.status === 'completed';
  const isUpcoming = rxStatus?.status === 'upcoming';
  const items = (activeMeds && activeMeds.length > 0) ? activeMeds : (prescriptionData.items || []);
  const hasDiscontinued = prescriptionData.hasDiscontinuedDrug === 1 || items.some((i) => i.isDiscontinued);
  const discontinuedItem = items.find((i) => i.isDiscontinued);

  const points = [];

  // 복용 완료 상태인 경우 상단 안내 배너 추가
  if (isCompleted) {
    points.push({
      category: '복용 완료 처방전',
      text: `선택하신 처방전은 정해진 복용 기간(${rxStatus?.startDateStr || ''} ~ ${rxStatus?.endDateStr || ''})이 모두 종료된 기록입니다. 당시 처방받으신 약품별 핵심 주의사항을 안내합니다.`,
    });
  } else if (isUpcoming) {
    points.push({
      category: '복용 시작 대기',
      text: `선택하신 날짜는 복용 시작 전입니다. 조제일(${prescriptionData.dispensedDate || ''})부터 지정된 용법에 맞춰 복용을 시작하세요.`,
    });
  }

  // 1. 판매중단 또는 주의 약품이 포함된 경우 (최우선 배치)
  if (hasDiscontinued) {
    points.push({
      category: '의약품 안전 주의',
      highlight: true,
      text: `[주의] ${discontinuedItem?.name || '처방 약품'} 등 판매중단 또는 허가 재검토 대상 의약품이 포함되어 있습니다. 복용 전 의료진과 다시 확인하세요.`,
    });
  }

  // 2. 식사 및 복용 타이밍 분석 (Usage Timing)
  const timingTexts = items.map((i) => i.usageTiming || '').join(' ');
  if (timingTexts.includes('식전')) {
    points.push({
      category: '식사 및 복용 시점',
      text: '식전 복용 약품 포함: 흡수율을 높이고 약효를 발휘하기 위해 식사 30분 전 공복에 복용하세요.',
    });
  } else if (timingTexts.includes('취침')) {
    points.push({
      category: '식사 및 복용 시점',
      text: '취침 전 복용 약품 포함: 잠들기 직전에 미온수와 함께 편안한 상태에서 복용하세요.',
    });
  } else {
    points.push({
      category: '식사 및 복용 시점',
      text: '식후 30분 복용: 위장 자극을 줄이고 흡수를 돕기 위해 식사 후 미온수와 함께 복용하세요.',
    });
  }

  // 3. 약품 효능군(className) 및 주성분(materialName) 기반 스마트 룰 매칭 (Gemini API 대체)
  const classNames = items.map((i) => `${i.className || ''} ${i.name || ''} ${i.materialName || ''}`).join(' ');

  if (classNames.includes('혈압') || classNames.includes('암로디핀') || classNames.includes('아모잘탄') || classNames.includes('발사르탄')) {
    points.push({
      category: '혈압약 복용 주의',
      text: '혈압강하제 포함: 갑자기 일어설 때 어지러움이 생길 수 있으니 천천히 일어나시고, 매일 일정한 시간에 꾸준히 복용하세요.',
    });
  } else if (classNames.includes('진통') || classNames.includes('소염') || classNames.includes('해열') || classNames.includes('아세트아미노펜') || classNames.includes('NSAID')) {
    points.push({
      category: '음주 및 위장 주의',
      text: '해열·소염진통제 포함: 간 및 위장 점막 손상을 막기 위해 복용 기간 중 음주는 절대 삼가시고, 공복 복용을 피하세요.',
    });
  } else if (classNames.includes('항생') || classNames.includes('항균') || classNames.includes('세파') || classNames.includes('아목시')) {
    points.push({
      category: '항생제 내성 예방',
      text: '항생제 포함: 증상이 호전되더라도 균의 내성 발생을 방지하기 위해 처방된 일수 동안 끝까지 복용하세요.',
    });
  } else if (classNames.includes('알레르기') || classNames.includes('항히스타민') || classNames.includes('비염') || classNames.includes('감기')) {
    points.push({
      category: '졸음 유발 주의',
      text: '항히스타민 성분 포함: 졸음이나 나른함이 발생할 수 있으므로 운전이나 위험한 기계 조작 시 각별히 주의하세요.',
    });
  } else if (classNames.includes('소화') || classNames.includes('위장') || classNames.includes('궤양') || classNames.includes('제산')) {
    points.push({
      category: '위장 보호 수칙',
      text: '위장약 포함: 위 점막 보호와 빠른 회복을 위해 카페인, 탄산음료, 자극적인 매운 음식 섭취를 줄이세요.',
    });
  } else if (classNames.includes('탈모') || classNames.includes('피나') || classNames.includes('두타')) {
    points.push({
      category: '탈모치료제 주의',
      text: '피나스테리드 계열 포함: 가임기 여성의 정제 파편 접촉을 금하며, 매일 일정한 시간에 지속적으로 복용하세요.',
    });
  } else if (classNames.includes('당뇨') || classNames.includes('메트포르민') || classNames.includes('혈당')) {
    points.push({
      category: '저혈당 대비 안내',
      text: '당뇨병용제 포함: 식사를 거르지 마시고, 식은땀이나 떨림 등 저혈당 증상에 대비해 사탕이나 당분을 휴대하세요.',
    });
  } else {
    points.push({
      category: '복약 준수 수칙',
      text: '정해진 1회 투약량과 복용 횟수를 준수하시고, 다른 약물이나 건강기능식품과 병용 시 전문가와 상담하세요.',
    });
  }

  // 4. 총 투약일수 안내
  const totalDays = prescriptionData.totalDays || 14;
  points.push({
    category: '처방 기간 준수',
    text: `총 ${totalDays}일 처방: 증상이 일시적으로 완화되더라도 임의로 복용을 중단하지 마시고 처방 기간을 완료하세요.`,
  });

  let badgeText = hasDiscontinued ? '주의 대상 포함' : `${points.length}가지 핵심 체크`;
  let badgeType = hasDiscontinued ? 'danger' : 'safe';
  if (isCompleted) {
    badgeText = '복용 완료 기록';
    badgeType = 'completed';
  } else if (isUpcoming) {
    badgeText = '복용 대기';
    badgeType = 'upcoming';
  }

  return {
    hasDiscontinued,
    badgeText,
    badgeType,
    points,
  };
}

// 시간 문자열(HH:mm)에 minutes(양수 또는 음수)를 가감하여 반환 (24시간 순환 보정)
export function addMinutes(timeStr, minutes) {
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
export function parseTimingOffset(usageTiming) {
  const str = (usageTiming || '').toLowerCase();

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
  return explicitMinutes;
}

// 1일 복용 횟수(dailyFrequency), 복약 시점 문구, 사용자 맞춤 식사 시간에 따른 실제 알림 시간대 슬롯 객체 생성
export function getIntakeSlots(dailyFrequency, usageTiming = '', mealTimes = DEFAULT_MEAL_TIMES) {
  let freq = Number(dailyFrequency) || 0;
  const timing = (usageTiming || '').toLowerCase();

  if (timing.includes('1일 1회') || timing.includes('1일1회') || timing.includes('하루 1회') || timing.includes('하루1회') || (timing.includes('1회') && !timing.includes('2회') && !timing.includes('3회') && !timing.includes('4회'))) {
    freq = 1;
  } else if (timing.includes('2회') && !timing.includes('3회')) {
    freq = 2;
  } else if (timing.includes('3회') || (timing.includes('아침') && timing.includes('점심') && timing.includes('저녁')) || timing.includes('매 식후') || timing.includes('매식후')) {
    freq = 3;
  }

  const offset = parseTimingOffset(usageTiming);

  const bTime = addMinutes(mealTimes.breakfast || '07:30', offset);
  const lTime = addMinutes(mealTimes.lunch || '12:00', offset);
  const dTime = addMinutes(mealTimes.dinner || '18:30', offset);
  const bedTime = mealTimes.bedtime || '22:00';

  const breakfastSlot = { slot: 'breakfast', slotLabel: '아침', time: bTime };
  const lunchSlot = { slot: 'lunch', slotLabel: '점심', time: lTime };
  const dinnerSlot = { slot: 'dinner', slotLabel: '저녁', time: dTime };
  const bedtimeSlot = { slot: 'bedtime', slotLabel: '취침전', time: bedTime };

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

  if (timing.includes('3회') || (timing.includes('아침') && timing.includes('점심') && timing.includes('저녁')) || timing.includes('매 식후') || timing.includes('매식후')) {
    return [breakfastSlot, lunchSlot, dinnerSlot];
  }
  if (timing.includes('2회') || (timing.includes('아침') && timing.includes('저녁'))) {
    return [breakfastSlot, dinnerSlot];
  }
  if (timing.includes('취침') || timing.includes('자기전')) {
    return [bedtimeSlot];
  }

  return [breakfastSlot, lunchSlot, dinnerSlot];
}

export function buildRoutineItems(prescribedMeds, mealTimes = DEFAULT_MEAL_TIMES) {
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
        medicationId: med.medicationId || (med.id ? String(med.id).replace(/^rx-/, '') : ''),
        prescriptionId: med.prescriptionId,
        originHospital: med.originHospital,
        originDispensedDate: med.originDispensedDate,
        prescriptionNickname: med.prescriptionNickname,
        prescriptionPurpose: med.prescriptionPurpose,
        className: med.className || '',
        efficacy: med.efficacy || '',
        dosage: med.dosage || med.usageDosage || '',
        caution: med.caution || '',
        rawMed: med,
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

// 처방약 봉지(Pouch) 및 단일 약품(영양제/상비약) 단위로 그룹핑하는 헬퍼 함수
export function groupRoutineItemsByPouch(items) {
  if (!items || items.length === 0) return [];
  const result = [];
  const pouchMap = new Map();

  items.forEach((item) => {
    if (item.prescriptionId) {
      const key = `${item.prescriptionId}_${item.slot || item.time || 'default'}`;
      if (!pouchMap.has(key)) {
        const pouchObj = {
          isPouch: true,
          pouchKey: key,
          id: `pouch-${key}`,
          prescriptionId: item.prescriptionId,
          slot: item.slot,
          slotLabel: item.slotLabel,
          time: item.time,
          originHospital: item.originHospital || item.hospitalName || '의료기관',
          dispensedDate: item.originDispensedDate || item.dispensedDate || '',
          nickname: item.prescriptionNickname,
          purpose: item.prescriptionPurpose,
          items: [],
        };
        pouchMap.set(key, pouchObj);
        result.push(pouchObj);
      }
      pouchMap.get(key).items.push(item);
    } else {
      result.push(item);
    }
  });

  return result;
}

export function isSameSlot(slotA, slotB) {
  if (!slotA || !slotB) return false;
  if (slotA === slotB) return true;
  if ((slotA === 'breakfast' && slotB === 'morning') || (slotA === 'morning' && slotB === 'breakfast')) return true;
  if ((slotA === 'dinner' && slotB === 'evening') || (slotA === 'evening' && slotB === 'dinner')) return true;
  return false;
}
