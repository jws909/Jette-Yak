import React from 'react';
import './LoadingOverlay.css';

/**
 * 전역 또는 작업 중 긴 딜레이를 사용자에게 명확히 전달하는 공통 전체 화면 로딩 오버레이
 */
export default function LoadingOverlay({
  visible = false,
  title = '처리 중입니다...',
  description = '잠시만 기다려 주세요.',
  icon = '💊',
}) {
  if (!visible) return null;

  return (
    <div className="rx-loading-overlay" role="alert" aria-busy="true">
      <div className="rx-loading-modal">
        <div className="rx-loading-spinner-wrap">
          <div className="rx-loading-spinner" />
          {icon && (
            <span className="rx-loading-pill-icon" aria-hidden="true">
              {icon}
            </span>
          )}
        </div>
        <h3 className="rx-loading-title">{title}</h3>
        {description && <p className="rx-loading-desc">{description}</p>}
        <div className="rx-loading-progress-bar">
          <div className="rx-loading-progress-fill" />
        </div>
      </div>
    </div>
  );
}
