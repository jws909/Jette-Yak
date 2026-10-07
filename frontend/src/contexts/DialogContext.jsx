import { useContext } from 'react';
import { DialogContext } from './dialogStore';

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
