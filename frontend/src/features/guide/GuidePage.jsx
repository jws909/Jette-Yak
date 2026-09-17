import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import './GuidePage.css';

const GUIDE_DATA = {
  '아모잘탄정 5/50mg': {
    tag: '처방',
    type: 'rx',
    restrictions: [
      { label: '음주', text: '약효에 영향을 줄 수 있어 가급적 피해 주세요.' },
      { label: '카페인', text: '과다 섭취 시 두근거림이나 혈압 변동이 나타날 수 있어요.' },
      { label: '활동', text: '처음 복용하는 날은 기립성 저혈압 위험이 있으므로 운전에 주의하세요.' }
    ],
    sideEffects: '가벼운 속쓰림이나 메스꺼움, 어지러움은 식후 복용으로 완화될 수 있어요.',
    warningBox: '증상이 3일 이상 지속되거나 발진, 부종이 나타나면 즉시 복용을 중단하고 의료진과 상담하세요.',
    foodGood: '물과 함께',
    foodCaution: '자몽 · 술',
    foodAdvice: '충분한 물과 함께, 매일 같은 시간에 복용하면 좋아요.'
  },
  '오메가-3': {
    tag: '영양제',
    type: 'supp',
    restrictions: [
      { label: '복용 타이밍', text: '지용성 성분으로 식사 직후 복용 시 흡수율이 가장 높습니다.' },
      { label: '수술/치과', text: '출혈 위험이 있으므로 수술 1~2주 전에는 복용을 중단하세요.' },
      { label: '보관', text: '산패되기 쉬우므로 직사광선을 피해 서늘한 곳이나 냉장 보관하세요.' }
    ],
    sideEffects: '트림 시 비린내가 올라오거나 가벼운 묽은 변이 발생할 수 있습니다.',
    warningBox: '아스피린, 와파린 등 항혈전제와 동시 복용 시 출혈 위험이 상승하므로 주의가 필요합니다.',
    foodGood: '기름기 있는 식사 후',
    foodCaution: '공복 복용',
    foodAdvice: '식사 중 또는 식사 직후 미온수와 함께 섭취하세요.'
  },
  '듀오락 골드': {
    tag: '상시약',
    type: 'reg',
    restrictions: [
      { label: '항생제', text: '항생제 복용 시 유익균이 사멸될 수 있으므로 최소 2시간 이상 간격을 두세요.' },
      { label: '온도', text: '뜨거운 물과 함께 드시면 유산균이 파괴될 수 있습니다.' },
      { label: '꾸준함', text: '장내 균총 안정을 위해 매일 정해진 시간에 지속 복용을 권장합니다.' }
    ],
    sideEffects: '복용 초기 일시적으로 가스나 복부 팽만감이 생길 수 있으나 며칠 내 호전됩니다.',
    warningBox: '면역억제제 투여 환자나 중증 질환자는 균혈증 위험이 있으므로 전문의와 상의하세요.',
    foodGood: '미온수',
    foodCaution: '뜨거운 차 · 알코올',
    foodAdvice: '아침 기상 직후 공복 물 한 잔 후 복용하거나 취침 전 복용을 권장합니다.'
  }
};

export default function GuidePage() {
  const [searchParams] = useSearchParams();
  const medParam = searchParams.get('med');

  const [selectedMed, setSelectedMed] = useState(null);
  const [searchWord, setSearchWord] = useState('');

  const activeMed = selectedMed || (medParam && GUIDE_DATA[medParam] ? medParam : '아모잘탄정 5/50mg');
  const current = GUIDE_DATA[activeMed] || GUIDE_DATA['아모잘탄정 5/50mg'];

  return (
    <div className="guide-page-wrapper">
      <header className="guide-page-header">
        <div className="header-left">
          <span className="section-meta-tag">PERSONAL HEALTH GUIDE</span>
          <h1 className="section-title">맞춤 생활 가이드</h1>
        </div>

        <div className="header-search">
          <div className="guide-search-input">
            <svg className="guide-search-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 19l-4-4m0-7A7 7 0 1 1 1 8a7 7 0 0 1 14 0Z" />
            </svg>
            <input
              type="text"
              placeholder="다른 약 이름 검색"
              value={searchWord}
              onChange={(e) => setSearchWord(e.target.value)}
            />
          </div>
        </div>
      </header>

      {/* 약 선택 탭 (와이어프레임 4.png) */}
      <div className="med-pills-row">
        {Object.keys(GUIDE_DATA).map((medName) => (
          <button
            key={medName}
            type="button"
            className={`med-pill-tab ${activeMed === medName ? 'active' : ''}`}
            onClick={() => setSelectedMed(medName)}
          >
            <span className={`pill-dot ${GUIDE_DATA[medName].type}`} />
            {medName}
          </button>
        ))}
      </div>

      {/* 메인 가이드 카드 (와이어프레임 4.png 3단 구조) */}
      <div className="guide-detail-card">
        {/* 좌측 사이드: 약 이름 및 기본정보 */}
        <div className="guide-med-intro">
          <span className="meta-kicker">GUIDE FOR</span>
          <h2 className="intro-med-name">{activeMed}</h2>
          <span className={`intro-tag ${current.type}`}>{current.tag}</span>
        </div>

        {/* 01: 일상 제약 */}
        <div className="guide-col col-01">
          <span className="col-num">01</span>
          <h3 className="col-title">일상 제약</h3>

          <div className="restrictions-list">
            {current.restrictions.map((item, idx) => (
              <div key={idx} className="restriction-item">
                <strong className="restriction-label">{item.label}</strong>
                <p className="restriction-text">{item.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 02: 부작용 & 대처 */}
        <div className="guide-col col-02">
          <span className="col-num">02</span>
          <h3 className="col-title">부작용 &amp; 대처</h3>
          <p className="side-effect-text">{current.sideEffects}</p>

          <div className="side-effect-alert-box">
            {current.warningBox}
          </div>
        </div>

        {/* 03: 음식 궁합 */}
        <div className="guide-col col-03">
          <span className="col-num">03</span>
          <h3 className="col-title">음식 궁합</h3>

          <div className="food-match-boxes">
            <div className="food-box good">
              <span className="food-status">GOOD</span>
              <strong>{current.foodGood}</strong>
            </div>
            <div className="food-box caution">
              <span className="food-status">CAUTION</span>
              <strong>{current.foodCaution}</strong>
            </div>
          </div>

          <p className="food-advice-text">
            {current.foodAdvice}
          </p>
        </div>
      </div>
    </div>
  );
}
