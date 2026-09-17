import { useState } from 'react';
import './SurveyPage.css';

export default function SurveyPage() {
  const [conditions, setConditions] = useState({
    hypertension: true,
    diabetes: false,
    liverDisease: false,
    kidneyDisease: false,
    allergy: true,
    pregnancy: false
  });

  const [allergyText, setAllergyText] = useState('페니실린 계열 항생제');
  const [currentSymptoms, setCurrentSymptoms] = useState('가벼운 두통 및 피로감');
  const [submitted, setSubmitted] = useState(false);

  const toggleCondition = (key) => {
    setConditions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
  };

  return (
    <div className="survey-page-wrapper">
      <header className="page-section-header">
        <span className="section-meta-tag">MEDICAL QUESTIONNAIRE</span>
        <h1 className="section-title">건강 문진표</h1>
        <p className="section-desc">
          작성해주신 문진표는 처방전 분석 및 AI 복약 상담 시 맞춤형 주의사항을 제공하는 데 활용됩니다.
        </p>
      </header>

      {submitted && (
        <div className="survey-success-banner">
          문진표가 최신 정보로 업데이트되었습니다.
        </div>
      )}

      <form onSubmit={handleSubmit} className="survey-card">
        {/* 1. 기저질환 체크 */}
        <div className="survey-section">
          <span className="survey-step-num">01</span>
          <h2 className="survey-question">현재 진단받았거나 치료 중인 기저질환이 있으신가요?</h2>

          <div className="survey-chips-group">
            {[
              ['hypertension', '고혈압'],
              ['diabetes', '당뇨병'],
              ['liverDisease', '간 질환'],
              ['kidneyDisease', '신장 질환'],
              ['allergy', '약물/음식 알레르기'],
              ['pregnancy', '임신 또는 수유 중']
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`survey-chip ${conditions[key] ? 'selected' : ''}`}
                onClick={() => toggleCondition(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="survey-divider" />

        {/* 2. 알레르기 상세 */}
        <div className="survey-section">
          <span className="survey-step-num">02</span>
          <h2 className="survey-question">약물 부작용이나 특이 알레르기 반응 경험이 있나요?</h2>
          <textarea
            className="survey-textarea"
            rows="3"
            placeholder="예: 페니실린 복용 시 두드러기, 아스피린 복용 시 속쓰림 등"
            value={allergyText}
            onChange={(e) => setAllergyText(e.target.value)}
          />
        </div>

        <div className="survey-divider" />

        {/* 3. 최근 불편한 증상 */}
        <div className="survey-section">
          <span className="survey-step-num">03</span>
          <h2 className="survey-question">최근 겪고 있는 불편한 증상이나 추가 메모를 남겨주세요.</h2>
          <textarea
            className="survey-textarea"
            rows="3"
            placeholder="예: 최근 소화가 잘 안 되며 어지러움이 가끔 있습니다."
            value={currentSymptoms}
            onChange={(e) => setCurrentSymptoms(e.target.value)}
          />
        </div>

        <div className="survey-actions">
          <button type="submit" className="survey-submit-btn">
            문진표 저장하기
          </button>
        </div>
      </form>
    </div>
  );
}
