import { useNavigate } from 'react-router-dom';

/**
 * 처방전 미등록 시 표시되는 프로모션/안내 배너 컴포넌트
 */
export default function PrescriptionPromoBanner() {
  const navigate = useNavigate();

  return (
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
  );
}
