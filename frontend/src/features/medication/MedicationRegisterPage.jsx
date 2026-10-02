import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './MedicationRegisterPage.css';

export default function MedicationRegisterPage({ user }) {
  const navigate = useNavigate();
  const location = useLocation();
  const currentUserId = user?.userId || user?.id;

  // URL query parameter ?tab=prescription | cabinet | supplement
  const queryTab = new URLSearchParams(location.search).get('tab');
  const [activeTab, setActiveTab] = useState(
    ['prescription', 'cabinet', 'supplement'].includes(queryTab) ? queryTab : 'prescription'
  );

  useEffect(() => {
    if (queryTab && ['prescription', 'cabinet', 'supplement'].includes(queryTab)) {
      setActiveTab(queryTab);
    }
  }, [queryTab]);

  // ==========================================
  // [1] 처방전 / 약봉투 (OCR) 상태
  // ==========================================
  const [rxFile, setRxFile] = useState(null);
  const [rxPreview, setRxPreview] = useState(null);
  const [rotation, setRotation] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [userPrescriptions, setUserPrescriptions] = useState([]);
  const [isLoadingRxList, setIsLoadingRxList] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  // 처방전 수정/상세 모달 상태
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
  const [editAlert, setEditAlert] = useState(null);
  const [expandedRxId, setExpandedRxId] = useState(null);

  // ==========================================
  // [2] 상비약 & 영양제 검색 및 등록 상태
  // ==========================================
  const [medSearchText, setMedSearchText] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const searchBoxRef = useRef(null);
  const [everydayMeds, setEverydayMeds] = useState([]);
  const [isLoadingEverydayMeds, setIsLoadingEverydayMeds] = useState(false);

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 영양제 직접 입력 전용 상태
  const [customSupplementName, setCustomSupplementName] = useState('');
  const [customSupplementSlot, setCustomSupplementSlot] = useState('morning');
  const [customSupplementTime, setCustomSupplementTime] = useState('08:30');
  const [autoRegisterSchedule, setAutoRegisterSchedule] = useState(true);
  const [customSupplementDays, setCustomSupplementDays] = useState(30);

  // 일정 등록 모달 상태 (상비약/영양제 복용 주기 설정)
  const [scheduleModalMed, setScheduleModalMed] = useState(null);
  const [schedSlots, setSchedSlots] = useState({ morning: true, lunch: false, dinner: false, bedtime: false });
  const [schedTimes, setSchedTimes] = useState({ morning: '08:30', lunch: '12:30', dinner: '18:30', bedtime: '22:00' });
  const [schedDays, setSchedDays] = useState(30);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);

  // ==========================================
  // 데이터 불러오기 (처방전 목록 & 상비약/영양제 목록)
  // ==========================================
  const fetchPrescriptionList = useCallback(async () => {
    if (!currentUserId) {
      setUserPrescriptions([]);
      return;
    }
    setIsLoadingRxList(true);
    try {
      const res = await fetch(`/api/prescriptions/list?userId=${currentUserId}`);
      if (res.ok) {
        const data = await res.json();
        const rawList = data.prescriptions || (Array.isArray(data) ? data : []);
        setUserPrescriptions(rawList);
      } else {
        setUserPrescriptions([]);
      }
    } catch (err) {
      console.warn('처방전 목록 조회 실패:', err);
      setUserPrescriptions([]);
    } finally {
      setIsLoadingRxList(false);
    }
  }, [currentUserId]);

  const fetchEverydayMeds = useCallback(async () => {
    if (!currentUserId) return;
    setIsLoadingEverydayMeds(true);
    try {
      const res = await fetch(`/api/users/everyday-meds?userId=${currentUserId}`);
      if (res.ok) {
        const data = await res.json();
        setEverydayMeds(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.warn('평소 복용 약 목록 조회 실패:', err);
    } finally {
      setIsLoadingEverydayMeds(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    fetchPrescriptionList();
    fetchEverydayMeds();
  }, [fetchPrescriptionList, fetchEverydayMeds]);

  // ==========================================
  // [1-1] 처방전 사진 선택 및 보정 처리
  // ==========================================
  const handleFileSelectDirect = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일(JPG, PNG, WEBP 등)만 등록 가능합니다.');
      return;
    }
    setRxFile(file);
    setRotation(0);
    setIsFlipped(false);
    const objectUrl = URL.createObjectURL(file);
    setRxPreview(objectUrl);
  };

  const handleRxFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleFileSelectDirect(file);
  };

  const rotateImage = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const flipImage = () => {
    setIsFlipped((prev) => !prev);
  };

  // 캔버스 변환 파일 생성
  const getTransformedFile = (file, rot, flip) => {
    return new Promise((resolve) => {
      if (rot === 0 && !flip) {
        resolve(file);
        return;
      }
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (rot === 90 || rot === 270) {
          canvas.width = img.height;
          canvas.height = img.width;
        } else {
          canvas.width = img.width;
          canvas.height = img.height;
        }
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((rot * Math.PI) / 180);
        if (flip) ctx.scale(-1, 1);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);

        canvas.toBlob((blob) => {
          URL.revokeObjectURL(objectUrl);
          const transformed = new File([blob], file.name, { type: file.type });
          resolve(transformed);
        }, file.type);
      };
      img.src = objectUrl;
    });
  };

  // 처방전 업로드 & OCR 요청
  const handleRxUploadSubmit = async (e) => {
    e.preventDefault();
    if (!currentUserId) {
      alert('로그인이 필요한 서비스입니다.');
      return;
    }
    if (!rxFile) {
      alert('처방전 또는 약봉투 사진을 선택해 주세요.');
      return;
    }

    setIsAnalyzing(true);
    try {
      const finalFile = await getTransformedFile(rxFile, rotation, isFlipped);
      const formData = new FormData();
      formData.append('file', finalFile);
      formData.append('userId', currentUserId);

      const res = await fetch('/api/prescriptions/upload', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.prescription) {
          alert('처방전 분석 및 등록이 성공적으로 완료되었습니다!\n복약 일정이 자동 생성되었습니다.');
          setRxFile(null);
          setRxPreview(null);
          await fetchPrescriptionList();
          window.dispatchEvent(new CustomEvent('jette-intake-updated', {
            detail: { userId: currentUserId }
          }));
          return;
        }
        throw new Error(data.message || '처방전 처리 응답 오류');
      }
      throw new Error('처방전 업로드 실패');
    } catch (err) {
      console.error('처방전 등록 오류:', err);
      alert('처방전 분석에 실패했습니다. 사진이 선명한지 확인 후 다시 시도해 주세요.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ==========================================
  // [1-2] 처방전 수정 및 삭제 핸들러
  // ==========================================
  const startEditPrescription = (rx) => {
    setEditAlert(null);
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
      nickname: rx.nickname || '',
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

  const closeEditModal = () => {
    setEditingPrescription(null);
    setEditAlert(null);
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
    setEditAlert(null);

    try {
      const res = await fetch(`/api/prescriptions/${editForm.prescriptionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });

      if (res.ok) {
        setEditAlert({ type: 'success', message: '처방전 정보가 성공적으로 수정되었습니다.' });
        await fetchPrescriptionList();

        window.dispatchEvent(new CustomEvent('jette-intake-updated', {
          detail: { userId: currentUserId }
        }));

        setTimeout(() => {
          setEditingPrescription(null);
          setEditAlert(null);
        }, 1000);
      } else {
        const errData = await res.json().catch(() => ({}));
        setEditAlert({ type: 'error', message: errData.message || '처방전 수정에 실패했습니다.' });
      }
    } catch (err) {
      console.error('처방전 수정 오류:', err);
      setEditAlert({ type: 'error', message: '서버 통신 중 오류가 발생했습니다.' });
    } finally {
      setIsSavingEdit(false);
    }
  };

  // 처방전 삭제
  const handleDeleteRx = async (prescriptionId) => {
    if (!currentUserId) {
      alert('로그인이 필요한 기능입니다.');
      return;
    }
    if (!window.confirm('정말 이 처방전을 삭제하시겠습니까?\n포함된 처방 약품 및 오늘의 복약 루틴이 함께 삭제됩니다.')) {
      return;
    }
    try {
      const res = await fetch(`/api/prescriptions/${prescriptionId}?userId=${currentUserId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        alert('처방전이 삭제되었습니다.');
        await fetchPrescriptionList();
        window.dispatchEvent(new CustomEvent('jette-intake-updated', {
          detail: { userId: currentUserId }
        }));
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.message || '처방전 삭제에 실패했습니다.');
      }
    } catch (err) {
      console.error('처방전 삭제 오류:', err);
      alert('삭제 처리 중 오류가 발생했습니다.');
    }
  };

  // ==========================================
  // [2-1] 의약품 검색 (상비약 및 영양제)
  // ==========================================
  useEffect(() => {
    const keyword = medSearchText.trim();
    if (!keyword) {
      setSearchResults([]);
      setIsDropdownOpen(false);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/calendar/search-medications?keyword=${encodeURIComponent(keyword)}`);
        if (res.ok) {
          const list = await res.json();
          setSearchResults(Array.isArray(list) ? list : []);
          setHighlightIndex(0);
          setIsDropdownOpen(true);
        } else {
          setSearchResults([]);
          setHighlightIndex(0);
        }
      } catch (err) {
        console.warn('약품 검색 오류:', err);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [medSearchText]);

  // 상비약 등록 (CABINET)
  const handleAddCabinetMed = async (item) => {
    const medId = item?.medicationId || item?.itemSeq;
    if (!medId) return;

    if (!currentUserId) {
      alert('로그인이 필요한 기능입니다.');
      return;
    }

    try {
      const res = await fetch('/api/users/everyday-meds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          username: user?.username,
          type: 'CABINET',
          medicationId: String(medId),
        }),
      });

      if (res.ok) {
        alert(`'${item.itemName}' 이(가) 상비약으로 등록되었습니다.`);
        setMedSearchText('');
        setIsDropdownOpen(false);
        await fetchEverydayMeds();
        window.dispatchEvent(new CustomEvent('jette-intake-updated', {
          detail: { userId: currentUserId }
        }));
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.message || '상비약 등록에 실패했습니다.');
      }
    } catch (err) {
      console.error('상비약 등록 오류:', err);
      alert('상비약 등록 처리 중 오류가 발생했습니다.');
    }
  };

  // 영양제 직접 등록 (ROUTINE)
  const handleAddCustomSupplement = async (e) => {
    if (e) e.preventDefault();
    const name = customSupplementName.trim();
    if (!name) {
      alert('영양제 또는 건강기능식품 이름을 입력해 주세요.');
      return;
    }

    if (!currentUserId) {
      alert('로그인이 필요한 기능입니다.');
      return;
    }

    try {
      // 1. 평소 복용 영양제 (ROUTINE) 보관함 등록
      const res = await fetch('/api/users/everyday-meds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          username: user?.username,
          type: 'ROUTINE',
          name: name,
          takeTime: customSupplementTime,
          notes: `${(customSupplementSlot === 'morning' ? '아침' : (customSupplementSlot === 'lunch' ? '점심' : (customSupplementSlot === 'dinner' || customSupplementSlot === 'evening' ? '저녁' : '취침전')))} 식후`,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.message || '영양제 등록에 실패했습니다.');
        return;
      }

      // 2. 캘린더 복약 일정 동시 등록 (autoRegisterSchedule 체크 시)
      let scheduleCreated = false;
      if (autoRegisterSchedule) {
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const calRes = await fetch('/api/calendar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: currentUserId,
            name: name,
            type: 'supplement',
            medicationId: null,
            scheduledDate: todayStr,
            scheduledTime: customSupplementTime,
            repeatDays: Number(customSupplementDays) || 30,
            alarmEnabled: 1,
          }),
        });
        if (calRes.ok) {
          scheduleCreated = true;
        }
      }

      alert(
        scheduleCreated
          ? `'${name}' 영양제 및 ${customSupplementDays}일간의 복약 일정이 캘린더에 성공적으로 등록되었습니다!`
          : `'${name}' 영양제가 성공적으로 등록되었습니다.`
      );
      setCustomSupplementName('');
      await fetchEverydayMeds();
      window.dispatchEvent(new CustomEvent('jette-intake-updated', {
        detail: { userId: currentUserId }
      }));
    } catch (err) {
      console.error('영양제 등록 오류:', err);
      alert('영양제 등록 처리 중 오류가 발생했습니다.');
    }
  };

  // 평소 복용 약 삭제
  const handleRemoveEverydayMed = async (med) => {
    if (!currentUserId) {
      alert('로그인이 필요한 기능입니다.');
      return;
    }
    if (!window.confirm(`'${med.name}' 을(를) 목록에서 삭제하시겠습니까?`)) return;
    try {
      const source = med.source ? med.source.toLowerCase() : 'cabinet';
      const rawId = med.rawId || (med.id ? String(med.id).replace(/^[A-Za-z]:/, '') : '');
      const res = await fetch(`/api/users/everyday-meds/${source}/${rawId}?userId=${currentUserId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await fetchEverydayMeds();
        window.dispatchEvent(new CustomEvent('jette-intake-updated', {
          detail: { userId: currentUserId }
        }));
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.message || '삭제에 실패했습니다.');
      }
    } catch (err) {
      console.error('삭제 오류:', err);
      alert('삭제 중 오류가 발생했습니다.');
    }
  };

  // ==========================================
  // [3] 상비약/영양제 캘린더 일정 등록 모달
  // ==========================================
  const handleOpenScheduleModal = (med) => {
    setScheduleModalMed(med);

    // 복용 시간(takeTime)이 있으면 해당 시간대 슬롯 자동 체크
    let initSlot = 'morning';
    const timeVal = med.takeTime || '08:30';
    if (med.takeTime && med.takeTime.includes(':')) {
      const hour = parseInt(med.takeTime.split(':')[0], 10);
      if (hour < 11) initSlot = 'morning';
      else if (hour < 16) initSlot = 'lunch';
      else if (hour < 21) initSlot = 'dinner';
      else initSlot = 'bedtime';
    }

    setSchedSlots({
      morning: initSlot === 'morning',
      lunch: initSlot === 'lunch',
      dinner: initSlot === 'dinner',
      bedtime: initSlot === 'bedtime',
    });
    setSchedTimes((prev) => ({
      ...prev,
      [initSlot]: timeVal,
    }));
    setSchedDays(30);
  };

  const handleSaveSchedule = async (e) => {
    e.preventDefault();
    if (!scheduleModalMed) return;

    const selectedSlots = Object.keys(schedSlots).filter((k) => schedSlots[k]);
    if (selectedSlots.length === 0) {
      alert('최소 1개 이상의 복용 시간대를 선택해 주세요.');
      return;
    }

    if (!currentUserId) {
      alert('로그인이 필요한 기능입니다.');
      return;
    }

    setIsSavingSchedule(true);
    try {
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      let allSuccess = true;
      let lastErrMsg = '';

      const isCabinet = scheduleModalMed.source === 'CABINET';
      const rawNumericId = scheduleModalMed.rawId ? Number(scheduleModalMed.rawId) : null;

      for (const slot of selectedSlots) {
        const time = schedTimes[slot] || (slot === 'morning' ? '08:30' : slot === 'lunch' ? '12:30' : slot === 'dinner' ? '18:30' : '22:00');
        const payload = {
          userId: currentUserId,
          name: scheduleModalMed.name,
          type: isCabinet ? 'regular' : 'supplement',
          medicationId: scheduleModalMed.medicationId ? String(scheduleModalMed.medicationId) : null,
          cabinetId: isCabinet ? rawNumericId : null,
          routineId: !isCabinet ? rawNumericId : null,
          scheduledDate: todayStr,
          scheduledTime: time,
          repeatDays: Number(schedDays) || 30,
          alarmEnabled: 1,
        };

        const res = await fetch('/api/calendar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          allSuccess = false;
          const errData = await res.json().catch(() => ({}));
          lastErrMsg = errData.message || '';
        }
      }

      if (allSuccess) {
        alert(`${scheduleModalMed.name}의 ${schedDays}일 복약 일정이 캘린더에 성공적으로 등록되었습니다!`);
        setScheduleModalMed(null);
        await fetchEverydayMeds();
        window.dispatchEvent(new CustomEvent('jette-intake-updated', {
          detail: { userId: currentUserId }
        }));
      } else {
        alert('일정 등록에 실패했습니다.' + (lastErrMsg ? ` (${lastErrMsg})` : ''));
      }
    } catch (err) {
      console.error('일정 저장 오류:', err);
      alert('일정 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSavingSchedule(false);
    }
  };

  return (
    <div className="med-register-page">
      {/* 1. 상단 타이틀 & 탭 네비게이션 */}
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
            ← 메인 홈으로 가기
          </button>
        </div>

        {/* 3대 등록 탭 */}
        <div className="med-register-tabs">
          <button
            type="button"
            className={`med-tab-btn ${activeTab === 'prescription' ? 'active' : ''}`}
            onClick={() => setActiveTab('prescription')}
          >
            <svg className="tab-svg-icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
            </svg>
            처방전 · 약봉투 (AI 분석)
          </button>
          <button
            type="button"
            className={`med-tab-btn ${activeTab === 'cabinet' ? 'active' : ''}`}
            onClick={() => setActiveTab('cabinet')}
          >
            <svg className="tab-svg-icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
              <path fillRule="evenodd" d="M7 2a1 1 0 00-.707.293l-4 4a1 1 0 000 1.414l8 8a1 1 0 001.414 0l4-4a1 1 0 000-1.414l-8-8A1 1 0 007 2zm4.707 9.293L8 7.586 9.414 6.172l3.707 3.707-1.414 1.414z" clipRule="evenodd" />
            </svg>
            상비약 · 일반의약품 검색
          </button>
          <button
            type="button"
            className={`med-tab-btn ${activeTab === 'supplement' ? 'active' : ''}`}
            onClick={() => setActiveTab('supplement')}
          >
            <svg className="tab-svg-icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
              <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.508.79-.83 1.83-.984 3.033-1.042.06-2.07.41-2.915 1.05C4.945 8.167 4 9.873 4 12c0 2.227 1.082 4.14 2.75 5.226C8.423 18.314 10.667 19 13 19c2.81 0 5.244-.98 6.472-2.58.536-.697.77-1.52.684-2.33-.086-.807-.487-1.554-1.084-2.126-1.196-1.144-2.986-1.804-5.074-1.928.09-.768.272-1.436.544-1.954.276-.525.64-.897 1.077-1.127a1 1 0 00.38-1.4z" clipRule="evenodd" />
            </svg>
            영양제 · 건강기능식품 등록
          </button>
        </div>
      </header>

      {/* 2. 탭별 컨텐츠 본문 */}
      <main className="med-register-content">
        {/* =========================================================
            [탭 1] 처방전 / 약봉투 사진 OCR 등록
           ========================================================= */}
        {activeTab === 'prescription' && (
          <section className="tab-section prescription-section">
            <div className="section-intro-card">
              <div className="intro-badge">AI 스마트 광학인식 (OCR)</div>
              <h2>처방전 또는 약봉투 사진을 등록하세요</h2>
              <p>
                병원에서 받은 <strong>처방전</strong>이나 약국 <strong>약봉투</strong>를 사진으로 찍어 올리시면,
                AI가 자동으로 병원명, 조제일자, 복용 일수 및 처방 약품 목록을 추출하여 복약 일정을 생성해 드립니다.
              </p>
            </div>

            <div className="rx-upload-layout">
              {/* 좌측: 파일 업로드 & 미리보기 */}
              <div className="rx-upload-card">
                <div className="rx-card-header">
                  <span className="rx-card-step-badge">STEP 1</span>
                  <h3 className="rx-card-title">처방전 · 약봉투 사진 등록</h3>
                  <p className="rx-card-desc">
                    병원 처방전이나 약국 약봉투를 카메라로 촬영하거나 사진을 업로드해 주세요.
                  </p>
                </div>

                {/* 촬영 안내 팁 */}
                <div className="rx-guide-box">
                  <div className="rx-guide-item">
                    <svg className="guide-check-icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span><strong>병원 처방전</strong>과 약국 <strong>조제 약봉투</strong> 모두 지원합니다.</span>
                  </div>
                  <div className="rx-guide-item">
                    <svg className="guide-check-icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span>글자가 수평으로 보이도록 평평하게 촬영하면 AI가 정확히 인식합니다.</span>
                  </div>
                </div>

                <form onSubmit={handleRxUploadSubmit} className="rx-upload-form">
                  {!rxPreview ? (
                    <div
                      className={`rx-dropzone ${isDragging ? 'drag-over' : ''}`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragging(true);
                      }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDragging(false);
                        if (e.dataTransfer.files?.[0]) {
                          handleFileSelectDirect(e.dataTransfer.files[0]);
                        }
                      }}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept="image/*"
                        capture="environment"
                        style={{ display: 'none' }}
                        onChange={handleRxFileSelect}
                      />
                      <div className="dropzone-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="48" height="48">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                      </div>
                      <strong className="dropzone-main-title">사진을 여기에 끌어다 놓거나 클릭하세요</strong>
                      <span className="dropzone-sub-info">스마트폰 촬영본, JPG, PNG, WEBP, PDF 지원 (최대 15MB)</span>
                      <button type="button" className="dropzone-browse-btn">
                        사진 파일 선택 / 직접 촬영
                      </button>
                    </div>
                  ) : (
                    <div className="rx-preview-wrapper">
                      <div className="preview-top-actions">
                        <span className="preview-file-name">{rxFile?.name}</span>
                        <div className="preview-tools">
                          <button type="button" onClick={rotateImage} title="90도 회전">
                            90° 회전
                          </button>
                          <button type="button" onClick={flipImage} title="좌우 반전">
                            좌우 반전
                          </button>
                          <button
                            type="button"
                            className="preview-reset-btn"
                            onClick={() => {
                              setRxFile(null);
                              setRxPreview(null);
                            }}
                          >
                            × 다른 사진 선택
                          </button>
                        </div>
                      </div>

                      <div className="preview-canvas-box">
                        <img
                          src={rxPreview}
                          alt="처방전 미리보기"
                          style={{
                            transform: `rotate(${rotation}deg) scaleX(${isFlipped ? -1 : 1})`,
                            maxWidth: '100%',
                            maxHeight: '380px',
                            objectFit: 'contain',
                            borderRadius: '8px',
                          }}
                        />
                      </div>

                      <button
                        type="submit"
                        className="rx-submit-btn"
                        disabled={isAnalyzing}
                      >
                        {isAnalyzing ? (
                          <>
                            <span className="analyzing-spinner" />
                            AI가 처방전을 정밀 분석 중입니다...
                          </>
                        ) : (
                          'AI 분석 및 복약 일정 등록 완료하기 →'
                        )}
                      </button>
                    </div>
                  )}
                </form>
              </div>

              {/* 우측: 내 등록 처방전 목록 */}
              <div className="rx-history-card">
                <div className="rx-history-head">
                  <div>
                    <h3 className="rx-history-title">등록된 처방전 내역 ({userPrescriptions.length}건)</h3>
                    <p className="rx-history-desc">등록된 처방전과 처방 약품 목록 및 복약 일정을 확인하세요.</p>
                  </div>
                  <button type="button" className="refresh-btn" onClick={fetchPrescriptionList}>
                    새로고침
                  </button>
                </div>

                {isLoadingRxList ? (
                  <div className="rx-list-empty">처방전 내역을 불러오는 중...</div>
                ) : userPrescriptions.length === 0 ? (
                  <div className="rx-list-empty">
                    <p className="empty-title">아직 등록된 처방전이 없습니다.</p>
                    <span className="empty-desc">왼쪽에서 처방전이나 약봉투 사진을 등록해 보세요!</span>
                  </div>
                ) : (
                  <div className="rx-cards-list">
                    {userPrescriptions.map((rx, index) => {
                      const isLatest = index === 0;
                      const dateStr = rx.dispensedDate
                        ? (typeof rx.dispensedDate === 'string' ? rx.dispensedDate.slice(0, 10).replace(/-/g, '.') : '')
                        : '날짜 미상';
                      let purpose = rx.aiGuide?.purpose;
                      if (!purpose && rx.aiSummaryJson) {
                        try {
                          const parsed = JSON.parse(rx.aiSummaryJson);
                          if (parsed.aiGuide?.purpose) purpose = parsed.aiGuide.purpose;
                        } catch {}
                      }

                      return (
                        <div key={rx.prescriptionId} className={`rx-item-card ${isLatest ? 'is-active-rx' : ''}`}>
                          {/* 상단 헤더: 의료기관명, 조제 정보, 액션 버튼 */}
                          <div className="rx-card-top-bar">
                            <div className="rx-hospital-meta">
                              <div className="rx-hospital-header-line">
                                <h4 className="rx-hospital-name">
                                  {rx.nickname && <span className="rx-nickname-badge">[{rx.nickname}] </span>}
                                  {rx.hospitalName || '의료기관'}
                                </h4>
                                {isLatest ? (
                                  <span className="rx-tag-current">현재 복용</span>
                                ) : (
                                  <span className="rx-tag-past">복용 완료</span>
                                )}
                                {rx.hasDiscontinuedDrug === 1 && (
                                  <span className="rx-tag-discontinued">판매중단 포함</span>
                                )}
                              </div>
                              <div className="rx-meta-sub-line">
                                {rx.doctorName && <span>담당: {rx.doctorName}</span>}
                                {rx.doctorName && <span className="meta-sep">·</span>}
                                <span>조제일: {dateStr}</span>
                                <span className="meta-sep">·</span>
                                <span className="rx-days-badge">{rx.totalDays || 0}일분 처방</span>
                              </div>
                            </div>

                            <div className="rx-card-actions">
                              <button
                                type="button"
                                className="rx-action-edit"
                                onClick={() => startEditPrescription(rx)}
                                title="처방전 정보 및 약품 수정"
                              >
                                수정
                              </button>
                              <button
                                type="button"
                                className="rx-action-delete"
                                onClick={() => handleDeleteRx(rx.prescriptionId)}
                                title="처방전 삭제"
                              >
                                삭제
                              </button>
                            </div>
                          </div>

                          {/* AI 처방 이유 (있을 때만) */}
                          {purpose && (
                            <div className="rx-purpose-box">
                              <span className="purpose-label">AI 처방 이유</span>
                              <span className="purpose-text">{purpose}</span>
                            </div>
                          )}

                          {/* 처방 약품 목록 (캡슐 디자인 제거 -> 깔끔한 리스트 행 구조) */}
                          <div className="rx-meds-container">
                            <div className="rx-meds-header-row">
                              <span className="rx-meds-header-title">처방 의약품 ({rx.items?.length || 0}종)</span>
                              <span className="rx-meds-header-guide">복용 용법 및 투약량</span>
                            </div>

                            <div className="rx-meds-list-rows">
                              {rx.items && rx.items.length > 0 ? (
                                rx.items.map((it, itIdx) => (
                                  <div key={itIdx} className={`rx-med-item-row ${it.isDiscontinued ? 'discontinued' : ''}`}>
                                    <div className="med-row-info">
                                      <span className="med-index-num">{itIdx + 1}</span>
                                      <div className="med-title-block">
                                        <span className="med-title-text">{it.itemName}</span>
                                        {it.className && (
                                          <span className="med-category-text">{it.className}</span>
                                        )}
                                        {it.isDiscontinued && (
                                          <span className="med-danger-text">[판매중단]</span>
                                        )}
                                      </div>
                                    </div>

                                    <div className="med-row-dosage">
                                      <span className="med-freq-dose">1일 {it.dailyFrequency}회 · 1회 {it.dailyDose}정</span>
                                      <span className="med-timing-text">{it.usageTiming || '식후 30분'}</span>
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className="rx-meds-empty-text">등록된 약품 정보가 없습니다.</div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* =========================================================
            [탭 2] 상비약 / 일반의약품 검색 등록
           ========================================================= */}
        {activeTab === 'cabinet' && (
          <section className="tab-section cabinet-section">
            <div className="section-intro-card">
              <div className="intro-badge">식약처 공공 의약품 DB 연동</div>
              <h2>가정 상비약 및 일반의약품 검색 등록</h2>
              <p>
                타이레놀, 소화제, 지사제 등 집에 상비해 둔 약이나 약국에서 구입한 일반의약품을 검색하여 등록하세요.
                원하는 경우 매일/주기적인 복약 일정을 캘린더에 바로 추가할 수 있습니다.
              </p>
            </div>

            <div className="cabinet-search-box" ref={searchBoxRef}>
              <div className="search-input-wrapper">
                <div className="search-input-row">
                  <svg className="search-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 19l-4-4m0-7A7 7 0 1 1 1 8a7 7 0 0 1 14 0Z" />
                  </svg>
                  <input
                    type="text"
                    className="cabinet-search-input"
                    placeholder="식약처 등록 상비약 검색 (예: 타이레놀, 게보린, 훼스탈, 베아제, 이부프로펜...)"
                    value={medSearchText}
                    onChange={(e) => {
                      const val = e.target.value;
                      setMedSearchText(val);
                      if (!val.trim()) {
                        setSearchResults([]);
                        setIsDropdownOpen(false);
                      }
                    }}
                    onFocus={() => {
                      if (medSearchText.trim()) setIsDropdownOpen(true);
                    }}
                    onKeyDown={(e) => {
                      if (!isDropdownOpen || searchResults.length === 0) return;
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setHighlightIndex((prev) => (prev + 1 < searchResults.length ? prev + 1 : prev));
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setHighlightIndex((prev) => (prev - 1 >= 0 ? prev - 1 : 0));
                      } else if (e.key === 'Enter') {
                        e.preventDefault();
                        const target = searchResults[highlightIndex] || searchResults[0];
                        if (target) {
                          handleAddCabinetMed(target);
                        }
                      } else if (e.key === 'Escape') {
                        setIsDropdownOpen(false);
                      }
                    }}
                    autoFocus
                  />
                  {isSearching && <span className="searching-spinner" />}
                </div>

                {/* 검색 자동완성 드롭다운 (식약처 DB 약품 등록) */}
                {isDropdownOpen && medSearchText.trim() && (
                  <div className="search-autocomplete-dropdown">
                    {searchResults.length > 0 ? (
                      <div className="dropdown-section">
                        <div className="dropdown-header">식약처 의약품 DB 검색 결과 ({searchResults.length}건) · 클릭 또는 Enter로 바로 등록</div>
                        <div className="dropdown-med-list">
                          {searchResults.map((item, idx) => (
                            <div
                              key={item.medicationId || item.itemSeq || idx}
                              className={`dropdown-med-item ${highlightIndex === idx ? 'highlighted' : ''}`}
                              onClick={() => handleAddCabinetMed(item)}
                              onMouseEnter={() => setHighlightIndex(idx)}
                              role="button"
                              tabIndex={0}
                            >
                              <div className="med-info">
                                <strong className="med-title">{item.itemName}</strong>
                                {item.entpName && <span className="med-corp">{item.entpName}</span>}
                              </div>
                              <div className="med-add-actions">
                                <span className="med-add-badge badge-cabinet">
                                  + 상비약 등록
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : !isSearching ? (
                      <div className="dropdown-empty-hint">
                        검색된 의약품이 없습니다. 정확한 약품명을 입력해 주세요.
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              {/* 검색 추천 태그 */}
              <div className="popular-tags">
                <span className="tags-label">자주 찾는 상비약:</span>
                {['타이레놀', '판피린', '훼스탈', '이지엔6', '후시딘', '까스활명수'].map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className="tag-chip"
                    onClick={() => {
                      setMedSearchText(tag);
                      setIsDropdownOpen(true);
                    }}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* 현재 등록된 상비약 목록 */}
            <div className="registered-sub-section">
              <h3>현재 등록된 상비약 목록 ({everydayMeds.filter((m) => m.source === 'CABINET').length}건)</h3>
              <div className="everyday-grid">
                {everydayMeds.filter((m) => m.source === 'CABINET').length === 0 ? (
                  <p className="empty-hint">등록된 상비약이 없습니다. 위 검색창에서 약을 검색해 보세요!</p>
                ) : (
                  everydayMeds
                    .filter((m) => m.source === 'CABINET')
                    .map((med) => (
                      <div key={med.id} className="everyday-card cabinet">
                        <div className="card-header">
                          <span className="type-badge cabinet">상비약</span>
                          <button
                            type="button"
                            className="del-icon-btn"
                            onClick={() => handleRemoveEverydayMed(med)}
                            title="삭제"
                          >
                            ×
                          </button>
                        </div>
                        <strong className="med-name">{med.name}</strong>
                        {med.entpName && <span className="entp-name">{med.entpName}</span>}
                        <button
                          type="button"
                          className="schedule-add-btn"
                          onClick={() => handleOpenScheduleModal(med)}
                        >
                          일정 등록
                        </button>
                      </div>
                    ))
                )}
              </div>
            </div>
          </section>
        )}

        {/* =========================================================
            [탭 3] 영양제 / 건강기능식품 등록
           ========================================================= */}
        {activeTab === 'supplement' && (
          <section className="tab-section supplement-section">
            <div className="section-intro-card">
              <div className="intro-badge">데일리 헬스케어 루틴</div>
              <h2>영양제 및 건강기능식품 등록</h2>
              <p>
                매일 챙겨 먹는 비타민, 오메가3, 유산균, 루테인 등을 등록해 보세요.
                식사 시간대에 맞춰 제때 복용할 수 있도록 메인 체크리스트에 반영해 드립니다.
              </p>
            </div>

            <div className="supplement-form-layout">
              {/* 직접 등록 카드 */}
              <div className="supplement-input-card">
                <h3>새 영양제 등록하기</h3>
                <form onSubmit={handleAddCustomSupplement}>
                  <div className="form-group">
                    <label>영양제 제품명 또는 성분 <span className="required">*</span></label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="예: 고려은단 비타민C 1000, 락토핏 유산균, rTG 오메가3..."
                      value={customSupplementName}
                      onChange={(e) => setCustomSupplementName(e.target.value)}
                      required
                    />
                  </div>

                  {/* 빠른 추천 키워드 */}
                  <div className="quick-supplement-tags">
                    <span className="tags-label">추천 키워드:</span>
                    {['종합비타민', '오메가3', '유산균', '루테인', '밀크씨슬', '마그네슘', '비타민D'].map((name) => (
                      <button
                        key={name}
                        type="button"
                        className="tag-chip"
                        onClick={() => setCustomSupplementName(name)}
                      >
                        + {name}
                      </button>
                    ))}
                  </div>

                  <div className="form-row-grid">
                    <div className="form-group">
                      <label>권장 복용 시간대</label>
                      <select
                        className="form-select"
                        value={customSupplementSlot}
                        onChange={(e) => {
                          const slot = e.target.value;
                          setCustomSupplementSlot(slot);
                          if (slot === 'morning') setCustomSupplementTime('08:30');
                          if (slot === 'lunch') setCustomSupplementTime('12:30');
                          if (slot === 'dinner' || slot === 'evening') setCustomSupplementTime('18:30');
                          if (slot === 'bedtime') setCustomSupplementTime('22:00');
                        }}
                      >
                        <option value="morning">아침 식후 (권장 08:30)</option>
                        <option value="lunch">점심 식후 (권장 12:30)</option>
                        <option value="dinner">저녁 식후 (권장 18:30)</option>
                        <option value="bedtime">취침 전 (권장 22:00)</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label>알림 시각</label>
                      <input
                        type="time"
                        className="form-input"
                        value={customSupplementTime}
                        onChange={(e) => setCustomSupplementTime(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* 복약 일정 동시 등록 옵션 */}
                  <div className="schedule-sync-options">
                    <label className="sync-checkbox-label">
                      <input
                        type="checkbox"
                        checked={autoRegisterSchedule}
                        onChange={(e) => setAutoRegisterSchedule(e.target.checked)}
                      />
                      <span className="sync-title">캘린더 복약 일정에 함께 등록</span>
                    </label>

                    {autoRegisterSchedule && (
                      <div className="days-picker-inline">
                        <span className="days-label">반복 기간:</span>
                        {[7, 14, 30, 90].map((d) => (
                          <button
                            key={d}
                            type="button"
                            className={`day-btn-mini ${customSupplementDays === d ? 'active' : ''}`}
                            onClick={() => setCustomSupplementDays(d)}
                          >
                            {d}일
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <button type="submit" className="supplement-submit-btn">
                    + 영양제 {autoRegisterSchedule ? '및 복약 일정 ' : ''}등록하기
                  </button>
                </form>
              </div>

              {/* 현재 등록된 영양제 목록 */}
              <div className="supplement-list-card">
                <h3>현재 등록된 영양제 목록 ({everydayMeds.filter((m) => m.source === 'ROUTINE').length}건)</h3>
                <div className="everyday-grid">
                  {everydayMeds.filter((m) => m.source === 'ROUTINE').length === 0 ? (
                    <p className="empty-hint">등록된 영양제가 없습니다. 왼쪽 폼에서 챙겨 먹는 영양제를 등록해 보세요!</p>
                  ) : (
                    everydayMeds
                      .filter((m) => m.source === 'ROUTINE')
                      .map((med) => (
                        <div key={med.id} className="everyday-card supplement">
                          <div className="card-header">
                            <span className="type-badge supplement">영양제</span>
                            <button
                              type="button"
                              className="del-icon-btn"
                              onClick={() => handleRemoveEverydayMed(med)}
                              title="삭제"
                            >
                              ×
                            </button>
                          </div>
                          <strong className="med-name">{med.name}</strong>
                          {med.takeTime && <span className="time-tag">매일 {med.takeTime}</span>}
                          <button
                            type="button"
                            className="schedule-add-btn"
                            onClick={() => handleOpenScheduleModal(med)}
                          >
                            일정 등록
                          </button>
                        </div>
                      ))
                  )}
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* =========================================================
          [공통] 상비약/영양제 캘린더 일정 생성 모달
         ========================================================= */}
      {scheduleModalMed && (
        <div className="modal-overlay" onClick={() => !isSavingSchedule && setScheduleModalMed(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{scheduleModalMed.name} 복약 일정 등록</h2>
              <button
                type="button"
                className="close-btn"
                onClick={() => setScheduleModalMed(null)}
                disabled={isSavingSchedule}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSaveSchedule}>
              <p className="modal-desc">
                캘린더와 메인 화면에 매일 복약 체크를 진행할 시간대와 일수를 설정하세요.
              </p>

              <div className="slots-picker">
                <label className="picker-title">복용 시간대 선택 및 알림 시간 설정 (복수 선택 가능)</label>
                <div className="slots-grid">
                  {[
                    { key: 'morning', label: '아침', defaultTime: '08:30' },
                    { key: 'lunch', label: '점심', defaultTime: '12:30' },
                    { key: 'dinner', label: '저녁', defaultTime: '18:30' },
                    { key: 'bedtime', label: '취침전', defaultTime: '22:00' },
                  ].map((s) => (
                    <div
                      key={s.key}
                      className={`slot-checkbox-label ${schedSlots[s.key] ? 'checked' : ''}`}
                      onClick={() => setSchedSlots((prev) => ({ ...prev, [s.key]: !prev[s.key] }))}
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(schedSlots[s.key])}
                        onChange={(e) => setSchedSlots((prev) => ({ ...prev, [s.key]: e.target.checked }))}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span>{s.label}</span>
                      <input
                        type="time"
                        className="slot-time-input"
                        value={schedTimes[s.key] || s.defaultTime}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSchedTimes((prev) => ({ ...prev, [s.key]: val }));
                        }}
                        onClick={(e) => e.stopPropagation()}
                        title={`${s.label} 알림 시간 설정`}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="days-picker">
                <label className="picker-title">복용 예정 기간</label>
                <div className="days-options">
                  {[7, 14, 30, 60, 90].map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={`days-pill ${schedDays === d ? 'active' : ''}`}
                      onClick={() => setSchedDays(d)}
                    >
                      {d}일분
                    </button>
                  ))}
                </div>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setScheduleModalMed(null)}
                  disabled={isSavingSchedule}
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="btn-submit"
                  disabled={isSavingSchedule}
                >
                  {isSavingSchedule ? '일정 생성 중...' : `${schedDays}일 복약 일정 등록 완료`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =============================================================
          [모달 2] 처방전 정보 및 처방 약품 수정 모달
          ============================================================= */}
      {editingPrescription && (
        <div className="modal-overlay" onClick={closeEditModal}>
          <div className="modal-box rx-edit-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="rx-edit-kicker">PRESCRIPTION EDIT</span>
                <h2>처방전 정보 및 약품 수정</h2>
              </div>
              <button
                type="button"
                className="close-btn"
                onClick={closeEditModal}
                disabled={isSavingEdit}
              >
                ✕
              </button>
            </div>

            {editAlert && (
              <div className={`rx-edit-alert-banner ${editAlert.type}`}>
                {editAlert.type === 'success' ? '[완료] ' : '[주의] '}
                {editAlert.message}
              </div>
            )}

            <div className="rx-edit-modal-body">
              {/* 기본 정보 */}
              <div className="edit-form-section">
                <h4 className="edit-section-title">기본 정보</h4>
                <div className="edit-fields-grid">
                  <div className="edit-field-group">
                    <label>처방전 별칭 (예: 감기약, 비염약)</label>
                    <input
                      type="text"
                      value={editForm.nickname || ''}
                      onChange={(e) => setEditForm({ ...editForm, nickname: e.target.value })}
                      placeholder="예: 감기약 (비어있으면 처방 목적 자동 적용)"
                    />
                  </div>
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

              {/* 약품 목록 테이블 */}
              <div className="edit-form-section">
                <div className="edit-items-header">
                  <h4 className="edit-section-title">처방 약품 및 용법 ({editForm.items.length}종)</h4>
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
                        <th style={{ width: '32%' }}>약품명</th>
                        <th style={{ width: '18%' }}>1일 복용 횟수</th>
                        <th style={{ width: '16%' }}>1회 투약량</th>
                        <th style={{ width: '26%' }}>복용 시점 / 용법</th>
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
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-cancel"
                onClick={closeEditModal}
                disabled={isSavingEdit}
              >
                취소
              </button>
              <button
                type="button"
                className="btn-submit"
                onClick={handleSaveEdit}
                disabled={isSavingEdit}
              >
                {isSavingEdit ? '저장 중...' : '저장 완료'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
