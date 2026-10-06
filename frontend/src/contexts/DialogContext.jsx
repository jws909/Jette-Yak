import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import UiDialog from '../components/ui/UiDialog';
import LoadingOverlay from '../components/ui/LoadingOverlay';

const DialogContext = createContext(null);

/**
 * 전역 다이얼로그 및 로딩 오버레이 제공자 (DialogProvider)
 * 
 * 애플리케이션 어디서나 useDialog() 훅을 통해
 * - showAlert(message, title)
 * - showConfirm({ title, description, ... })
 * - showLoading({ title, description })
 * - hideLoading()
 * 을 브라우저 alert/confirm 대신 일관된 디자인으로 호출할 수 있습니다.
 */
export function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const [loading, setLoading] = useState(null);
  const resolveRef = useRef(null);

  /**
   * 알림 모달 표시 (확인 버튼 클릭 시 resolve되는 Promise 반환)
   */
  const showAlert = useCallback((message, title = '안내') => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setDialog({
        title,
        description: message,
        confirmLabel: '확인',
        cancelLabel: '',
        tone: 'default',
        onConfirm: () => {
          setDialog(null);
          resolve(true);
        },
      });
    });
  }, []);

  /**
   * 확인/취소 모달 표시 (Promise 및 onConfirm/onCancel 콜백 동시 지원)
   */
  const showConfirm = useCallback((options) => {
    const opts = typeof options === 'string' ? { description: options } : (options || {});
    const {
      title = '확인',
      description = '',
      confirmLabel = '확인',
      cancelLabel = '취소',
      tone = 'danger',
      onConfirm,
      onCancel,
    } = opts;

    return new Promise((resolve) => {
      setDialog({
        title,
        description,
        confirmLabel,
        cancelLabel,
        tone,
        onConfirm: () => {
          setDialog(null);
          onConfirm?.();
          resolve(true);
        },
        onCancel: () => {
          setDialog(null);
          onCancel?.();
          resolve(false);
        },
      });
    });
  }, []);

  /**
   * 전체 화면 로딩 오버레이 띄우기
   */
  const showLoading = useCallback((loadingConfig) => {
    if (typeof loadingConfig === 'string') {
      setLoading({ title: loadingConfig, description: '잠시만 기다려 주세요.' });
    } else {
      setLoading(loadingConfig || { title: '처리 중입니다...', description: '잠시만 기다려 주세요.' });
    }
  }, []);

  /**
   * 전체 화면 로딩 오버레이 닫기
   */
  const hideLoading = useCallback(() => {
    setLoading(null);
  }, []);

  return (
    <DialogContext.Provider value={{ showAlert, showConfirm, showLoading, hideLoading }}>
      {children}

      {/* 전역 로딩 오버레이 */}
      <LoadingOverlay
        visible={Boolean(loading)}
        title={loading?.title}
        description={loading?.description}
        icon={loading?.icon || '💊'}
      />

      {/* 디자인 통일 공통 모달 (UiDialog) */}
      <UiDialog
        open={Boolean(dialog)}
        title={dialog?.title}
        description={dialog?.description}
        confirmLabel={dialog?.confirmLabel || '확인'}
        cancelLabel={dialog?.cancelLabel}
        tone={dialog?.tone || 'default'}
        onCancel={() => {
          dialog?.onCancel?.();
          setDialog(null);
        }}
        onConfirm={() => {
          if (dialog?.onConfirm) {
            dialog.onConfirm();
          } else {
            setDialog(null);
          }
        }}
      />
    </DialogContext.Provider>
  );
}

/**
 * useDialog 훅
 * @returns {{ showAlert, showConfirm, showLoading, hideLoading }}
 */
export function useDialog() {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error('useDialog는 반드시 DialogProvider 내부에서 사용해야 합니다.');
  }
  return context;
}
