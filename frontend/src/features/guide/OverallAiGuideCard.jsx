import React, { useState, useEffect, useCallback } from 'react';
import './OverallAiGuideCard.css';

export default function OverallAiGuideCard({ revision }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchGuide = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const url = isRefresh ? '/api/guides/overall/refresh' : '/api/guides/overall';
      const method = isRefresh ? 'POST' : 'GET';
      const res = await fetch(url, { method, headers: { 'Cache-Control': 'no-store' } });
      if (!res.ok) {
        if (res.status === 401) {
          setData(null);
          return;
        }
        throw new Error('통합 복약 가이드를 불러오지 못했습니다.');
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchGuide();
  }, [fetchGuide, revision]);

  if (loading) {
    return (
      <div className="overall-guide-loading-box">
        <span className="pulse-sparkle">✨</span>
        <p>AI가 현재 복용 중인 모든 약과 DUR 상호작용을 종합 분석하고 있습니다...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="overall-guide-error-box">
        <p>⚠️ {error}</p>
        <button type="button" className="btn-retry-guide" onClick={() => fetchGuide(false)}>
          다시 시도
        </button>
      </div>
    );
  }

  if (!data || !data.hasActiveMeds) {
    return null;
  }

  let guide = null;
  if (data.aiGuide) {
    try {
      guide = typeof data.aiGuide === 'string' ? JSON.parse(data.aiGuide) : data.aiGuide;
    } catch {
      guide = {
        headline: '복약 가이드 요약',
        overallSummary: data.aiGuide,
        scheduleTips: [],
        durAlerts: [],
        foodAndLifestyle: [],
        consultationAdvice: ''
      };
    }
  }

  if (!guide) return null;

  return (
    <section className="overall-ai-guide-card" aria-label="AI 통합 복약 가이드">
      <div className="overall-guide-header">
        <div className="overall-header-left">
          <span className="overall-badge">✨ AI 종합 복약 가이드</span>
          <span className="overall-sub-meta">
            현재 복용 중인 약 {data.activeCount || 0}종 분석
            {data.medUpdatedAt && ` · 최근 분석: ${data.medUpdatedAt}`}
          </span>
        </div>
        <button
          type="button"
          className="btn-refresh-guide"
          disabled={refreshing}
          onClick={() => fetchGuide(true)}
          title="최신 복약 목록으로 AI 가이드 재분석"
        >
          {refreshing ? '분석 중...' : '🔄 AI 다시 분석'}
        </button>
      </div>

      {guide.headline && (
        <div className="overall-headline-banner">
          <strong className="headline-text">{guide.headline}</strong>
          {guide.overallSummary && <p className="summary-desc">{guide.overallSummary}</p>}
        </div>
      )}

      <div className="overall-advice-grid">
        {/* 1. 시간대별 복약 요령 */}
        {guide.scheduleTips && guide.scheduleTips.length > 0 && (
          <div className="advice-column schedule-col">
            <h4 className="advice-col-title">
              <span className="advice-col-icon">⏰</span> 시간대별 복용 요령
            </h4>
            <ul className="advice-list">
              {guide.scheduleTips.map((tip, idx) => (
                <li key={idx} className="advice-item">{tip}</li>
              ))}
            </ul>
          </div>
        )}

        {/* 2. DUR 상호작용 및 금기 주의 */}
        {guide.durAlerts && guide.durAlerts.length > 0 && (
          <div className="advice-column dur-col">
            <h4 className="advice-col-title">
              <span className="advice-col-icon">⚠️</span> 상호작용 &amp; 금기 주의
            </h4>
            <ul className="advice-list">
              {guide.durAlerts.map((alert, idx) => (
                <li key={idx} className="advice-item alert-item">{alert}</li>
              ))}
            </ul>
          </div>
        )}

        {/* 3. 음식 및 일상 생활 가이드 */}
        {guide.foodAndLifestyle && guide.foodAndLifestyle.length > 0 && (
          <div className="advice-column lifestyle-col">
            <h4 className="advice-col-title">
              <span className="advice-col-icon">🍽️</span> 음식 &amp; 일상 주의
            </h4>
            <ul className="advice-list">
              {guide.foodAndLifestyle.map((item, idx) => (
                <li key={idx} className="advice-item">{item}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {guide.consultationAdvice && (
        <div className="overall-consultation-footer">
          <span className="consultation-icon">💡</span>
          <p className="consultation-text">{guide.consultationAdvice}</p>
        </div>
      )}
    </section>
  );
}
