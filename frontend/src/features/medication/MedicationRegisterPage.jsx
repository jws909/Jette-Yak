import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useDialog } from '../../contexts/DialogContext';
import { getTransformedFile } from '../../utils/imageTransform';
import { useMedicationSearch } from '../../hooks/useMedicationSearch';
import * as medicationApi from './medicationApi';
import PrescriptionTab from './components/PrescriptionTab';
import CabinetTab from './components/CabinetTab';
import SupplementTab from './components/SupplementTab';
import EditPrescriptionModal from './components/EditPrescriptionModal';
import ScheduleModal from './components/ScheduleModal';
import './MedicationRegisterPage.css';

export default function MedicationRegisterPage({ user }) {
  const navigate = useNavigate();
  const location = useLocation();
  const currentUserId = user?.userId || user?.id;

  // 전역 다이얼로그 및 로딩 훅
  const { showAlert, showConfirm, showLoading, hideLoading } = useDialog();

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

  // ==========================================
  // [2] 상비약 & 영양제 검색/보관함 상태
  // ==========================================
  const searchProps = useMedicationSearch({ debounceMs: 250 });
  const [everydayMeds, setEverydayMeds] = useState([]);
  const [isLoadingEverydayMeds, setIsLoadingEverydayMeds] = useState(false);

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
      const list = await medicationApi.fetchPrescriptions(currentUserId);
      setUserPrescriptions(list);
    } catch (err) {
      console.warn('처방전 목록 조회 실패:', err);
      setUserPrescriptions([]);
    } finally {
      setIsLoadingRxList(false);
    }
  }, [currentUserId]);

  const fetchEverydayMedsList = useCallback(async () => {
    if (!currentUserId) return;
    setIsLoadingEverydayMeds(true);
    try {
      const list = await medicationApi.fetchEverydayMeds(currentUserId);
      setEverydayMeds(list);
    } catch (err) {
      console.warn('평소 복용 약 목록 조회 실패:', err);
    } finally {
      setIsLoadingEverydayMeds(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    fetchPrescriptionList();
    fetchEverydayMedsList();
  }, [fetchPrescriptionList, fetchEverydayMedsList]);

  // ==========================================
  // [1-1] 처방전 사진 선택 및 보정 처리
  // ==========================================
  const handleFileSelectDirect = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showAlert('이미지 파일(JPG, PNG, WEBP 등)만 등록 가능합니다.', '파일 형식 안내');
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

  // 처방전 업로드 & OCR 요청
  const handleRxUploadSubmit = async (e) => {
    e.preventDefault();
    if (!currentUserId) {
      showAlert('로그인이 필요한 서비스입니다.');
      return;
    }
    if (!rxFile) {
      showAlert('처방전 또는 약봉투 사진을 선택해 주세요.');
      return;
    }

    setIsAnalyzing(true);
    showLoading({
      title: 'AI 처방전 자동 분석 및 등록 중',
      description: '처방전 이미지의 약품명, 용법, 일수를 AI로 분석하고 복약 일정을 생성하고 있습니다. 잠시만 기다려 주세요.',
    });

    try {
      const finalFile = await getTransformedFile(rxFile, rotation, isFlipped);
      const formData = new FormData();
      formData.append('file', finalFile);
      formData.append('userId', currentUserId);

      const data = await medicationApi.uploadPrescription(formData);
      if (data.success && data.prescription) {
        setRxFile(null);
        setRxPreview(null);
        await fetchPrescriptionList();
        window.dispatchEvent(new CustomEvent('jette-intake-updated', {
          detail: { userId: currentUserId }
        }));
        showAlert('처방전 분석 및 등록이 성공적으로 완료되었습니다!\n복약 일정이 자동 생성되었습니다.', '등록 완료');
        return;
      }
      throw new Error(data.message || '처방전 처리 응답 오류');
    } catch (err) {
      console.error('처방전 등록 오류:', err);
      showAlert('처방전 분석에 실패했습니다. 사진이 선명한지 확인 후 다시 시도해 주세요.', '분석 실패');
    } finally {
      setIsAnalyzing(false);
      hideLoading();
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
      })),
    });
    setEditingPrescription(rx);
  };

  const closeEditModal = () => {
    if (isSavingEdit) return;
    setEditingPrescription(null);
    setEditAlert(null);
  };

  const handleAddMedicineToEdit = () => {
    setEditForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          medicationId: null,
          itemName: '',
          dailyDose: 1,
          dailyFrequency: 3,
          usageTiming: '1일 3회 식후 30분',
          totalDays: prev.totalDays || 3,
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
    setEditForm((prev) => ({
      ...prev,
      items: prev.items.map((it, i) => (i === idx ? { ...it, [field]: value } : it)),
    }));
  };

  const handleSaveEdit = async () => {
    if (!editForm.hospitalName.trim()) {
      showAlert('의료기관(병원명)을 입력해주세요.');
      return;
    }
    if (editForm.items.length === 0) {
      showAlert('최소 1개 이상의 처방 약품이 포함되어야 합니다.');
      return;
    }
    for (let i = 0; i < editForm.items.length; i++) {
      if (!editForm.items[i].itemName.trim()) {
        showAlert(`${i + 1}번째 약품의 이름을 입력해주세요.`);
        return;
      }
    }

    setIsSavingEdit(true);
    showLoading({
      title: '처방전 정보 수정 중',
      description: '수정된 처방전과 관련 복약 일정을 안전하게 반영하고 있습니다. 잠시만 기다려 주세요.',
    });
    setEditAlert(null);

    try {
      await medicationApi.updatePrescription(editForm.prescriptionId, editForm);
      setEditAlert({ type: 'success', message: '처방전 정보가 성공적으로 수정되었습니다.' });
      await fetchPrescriptionList();

      window.dispatchEvent(new CustomEvent('jette-intake-updated', {
        detail: { userId: currentUserId }
      }));

      setTimeout(() => {
        setEditingPrescription(null);
        setEditAlert(null);
        showAlert('처방전 정보가 성공적으로 수정되었습니다.', '수정 완료');
      }, 600);
    } catch (err) {
      console.error('처방전 수정 오류:', err);
      setEditAlert({ type: 'error', message: err.message || '서버 통신 중 오류가 발생했습니다.' });
      showAlert(err.message || '서버 통신 중 오류가 발생했습니다.', '수정 오류');
    } finally {
      setIsSavingEdit(false);
      hideLoading();
    }
  };

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
          await medicationApi.deletePrescription(prescriptionId, currentUserId);
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

  // ==========================================
  // [2-1] 상비약 등록 (CABINET)
  // ==========================================
  const handleAddCabinetMed = async (item) => {
    const medId = item?.medicationId || item?.itemSeq;
    if (!medId) return;

    if (!currentUserId) {
      showAlert('로그인이 필요한 기능입니다.');
      return;
    }

    try {
      await medicationApi.addEverydayMed({
        userId: currentUserId,
        username: user?.username,
        type: 'CABINET',
        medicationId: String(medId),
      });

      showAlert(`'${item.itemName}' 이(가) 상비약으로 등록되었습니다.`, '등록 완료');
      searchProps.clearSearch();
      await fetchEverydayMedsList();
      window.dispatchEvent(new CustomEvent('jette-intake-updated', {
        detail: { userId: currentUserId }
      }));
    } catch (err) {
      console.error('상비약 등록 오류:', err);
      showAlert(err.message || '상비약 등록 처리 중 오류가 발생했습니다.', '등록 오류');
    }
  };

  // ==========================================
  // [2-2] 영양제 직접 등록 (ROUTINE)
  // ==========================================
  const handleAddCustomSupplement = async (e) => {
    if (e) e.preventDefault();
    const name = customSupplementName.trim();
    if (!name) {
      showAlert('영양제 또는 건강기능식품 이름을 입력해 주세요.');
      return;
    }

    if (!currentUserId) {
      showAlert('로그인이 필요한 기능입니다.');
      return;
    }

    try {
      // 1. 평소 복용 영양제 (ROUTINE) 보관함 등록
      await medicationApi.addEverydayMed({
        userId: currentUserId,
        username: user?.username,
        type: 'ROUTINE',
        name: name,
        takeTime: customSupplementTime,
        notes: `${(customSupplementSlot === 'morning' ? '아침' : (customSupplementSlot === 'lunch' ? '점심' : (customSupplementSlot === 'dinner' || customSupplementSlot === 'evening' ? '저녁' : '취침전')))} 식후`,
      });

      // 2. 캘린더 복약 일정 동시 등록 (autoRegisterSchedule 체크 시)
      let scheduleCreated = false;
      if (autoRegisterSchedule) {
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        try {
          await medicationApi.saveCalendarSchedule({
            userId: currentUserId,
            name: name,
            type: 'supplement',
            medicationId: null,
            scheduledDate: todayStr,
            scheduledTime: customSupplementTime,
            repeatDays: Number(customSupplementDays) || 30,
            alarmEnabled: 1,
          });
          scheduleCreated = true;
        } catch (calErr) {
          console.warn('캘린더 복약 일정 생성 실패:', calErr);
        }
      }

      showAlert(
        scheduleCreated
          ? `'${name}' 영양제 및 ${customSupplementDays}일간의 복약 일정이 캘린더에 성공적으로 등록되었습니다!`
          : `'${name}' 영양제가 성공적으로 등록되었습니다.`,
        '등록 완료'
      );
      setCustomSupplementName('');
      await fetchEverydayMedsList();
      window.dispatchEvent(new CustomEvent('jette-intake-updated', {
        detail: { userId: currentUserId }
      }));
    } catch (err) {
      console.error('영양제 등록 오류:', err);
      showAlert(err.message || '영양제 등록 처리 중 오류가 발생했습니다.', '등록 오류');
    }
  };

  // 평소 복용 약 삭제
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
          await medicationApi.deleteEverydayMed(med.source, rawId, currentUserId);
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

  // ==========================================
  // [3] 상비약/영양제 캘린더 일정 등록 모달
  // ==========================================
  const handleOpenScheduleModal = (med) => {
    setScheduleModalMed(med);

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
      showAlert('최소 1개 이상의 복용 시간대를 선택해 주세요.');
      return;
    }

    if (!currentUserId) {
      showAlert('로그인이 필요한 기능입니다.');
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

        try {
          await medicationApi.saveCalendarSchedule(payload);
        } catch (schedErr) {
          allSuccess = false;
          lastErrMsg = schedErr.message || '';
        }
      }

      if (allSuccess) {
        showAlert(`${scheduleModalMed.name}의 ${schedDays}일 복약 일정이 캘린더에 성공적으로 등록되었습니다!`, '등록 완료');
        setScheduleModalMed(null);
        await fetchEverydayMedsList();
        window.dispatchEvent(new CustomEvent('jette-intake-updated', {
          detail: { userId: currentUserId }
        }));
      } else {
        showAlert('일정 등록에 실패했습니다.' + (lastErrMsg ? ` (${lastErrMsg})` : ''), '등록 실패');
      }
    } catch (err) {
      console.error('일정 저장 오류:', err);
      showAlert('일정 저장 중 오류가 발생했습니다.', '오류');
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

        {/* 3대 등록 탭 버튼 */}
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
        {activeTab === 'prescription' && (
          <PrescriptionTab
            rxFile={rxFile}
            setRxFile={setRxFile}
            rxPreview={rxPreview}
            setRxPreview={setRxPreview}
            rotation={rotation}
            isFlipped={isFlipped}
            rotateImage={rotateImage}
            flipImage={flipImage}
            isAnalyzing={isAnalyzing}
            isDragging={isDragging}
            setIsDragging={setIsDragging}
            fileInputRef={fileInputRef}
            handleRxFileSelect={handleRxFileSelect}
            handleFileSelectDirect={handleFileSelectDirect}
            handleRxUploadSubmit={handleRxUploadSubmit}
            userPrescriptions={userPrescriptions}
            isLoadingRxList={isLoadingRxList}
            fetchPrescriptionList={fetchPrescriptionList}
            startEditPrescription={startEditPrescription}
            handleDeleteRx={handleDeleteRx}
          />
        )}

        {activeTab === 'cabinet' && (
          <CabinetTab
            searchProps={searchProps}
            onAddCabinetMed={handleAddCabinetMed}
            everydayMeds={everydayMeds}
            onRemoveMed={handleRemoveEverydayMed}
            onOpenScheduleModal={handleOpenScheduleModal}
          />
        )}

        {activeTab === 'supplement' && (
          <SupplementTab
            customSupplementName={customSupplementName}
            setCustomSupplementName={setCustomSupplementName}
            customSupplementSlot={customSupplementSlot}
            setCustomSupplementSlot={setCustomSupplementSlot}
            customSupplementTime={customSupplementTime}
            setCustomSupplementTime={setCustomSupplementTime}
            autoRegisterSchedule={autoRegisterSchedule}
            setAutoRegisterSchedule={setAutoRegisterSchedule}
            customSupplementDays={customSupplementDays}
            setCustomSupplementDays={setCustomSupplementDays}
            onAddCustomSupplement={handleAddCustomSupplement}
            everydayMeds={everydayMeds}
            onRemoveMed={handleRemoveEverydayMed}
            onOpenScheduleModal={handleOpenScheduleModal}
          />
        )}
      </main>

      {/* 3. 모달 레이어 */}
      <ScheduleModal
        isOpen={Boolean(scheduleModalMed)}
        med={scheduleModalMed}
        slots={schedSlots}
        setSlots={setSchedSlots}
        times={schedTimes}
        setTimes={setSchedTimes}
        days={schedDays}
        setDays={setSchedDays}
        isSaving={isSavingSchedule}
        onClose={() => setScheduleModalMed(null)}
        onSave={handleSaveSchedule}
      />

      <EditPrescriptionModal
        isOpen={Boolean(editingPrescription)}
        editForm={editForm}
        setEditForm={setEditForm}
        isSaving={isSavingEdit}
        editAlert={editAlert}
        onClose={closeEditModal}
        onSave={handleSaveEdit}
        onAddItem={handleAddMedicineToEdit}
        onRemoveItem={handleRemoveMedicineFromEdit}
        onItemChange={handleEditItemChange}
      />
    </div>
  );
}
