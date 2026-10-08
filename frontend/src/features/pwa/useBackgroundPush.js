import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPushClient, getPushEnvironment, PushClientError, retainPushConfirmation, normalizePushError } from './pushClient.js';

/** 로그인 계정과 이 기기의 구독 상태를 묶고, 창 복귀 시 서버 상태를 다시 확인 */
export function useBackgroundPush({ userId, enabled }) {
  const client = useMemo(() => createPushClient(), []);
  const environment = getPushEnvironment();
  const [snapshot, setSnapshot] = useState({ owner: null, config: null, subscribed: false, checking: false, error: '', busy: '' });
  const [refreshTick, setRefreshTick] = useState(0);
  const operationLock = useRef(false);
  const pendingOperation = useRef(null);
  const generation = useRef(0);
  const inspectionVersion = useRef(0);
  const current = snapshot.owner === userId ? snapshot : { config: null, subscribed: false, checking: Boolean(userId), error: '', busy: '' };

  useEffect(() => {
    let active = true;
    const epoch = ++generation.current;
    let checking = false;
    const refresh = async () => {
      if (!userId || !active || checking || operationLock.current) return;
      checking = true;
      const inspection = ++inspectionVersion.current;
      setSnapshot(previous => ({ ...(previous.owner === userId ? previous : { config: null, subscribed: false }), owner: userId, busy: '', checking: true, error: '' }));
      try {
        const config = await client.getConfig();
        const status = await client.inspect(config);
        if (active && epoch === generation.current && inspection === inspectionVersion.current) setSnapshot(previous => ({ ...previous, owner: userId, config, subscribed: status.subscribed, checking: false, error: '' }));
      } catch (error) {
        if (active && epoch === generation.current && inspection === inspectionVersion.current) setSnapshot(previous => ({ ...previous, owner: userId,
          subscribed: retainPushConfirmation(previous, userId, error, window.Notification?.permission), checking: false, error: error.message }));
      } finally { checking = false; }
    };
    const onVisibility = () => { if (document.visibilityState === 'visible') void refresh(); };
    void refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisibility);
    return () => { active = false; generation.current = epoch + 1; window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', onVisibility); };
  }, [client, userId, enabled, refreshTick]);

  const run = useCallback(async (action) => {
    if (operationLock.current) return false;
    if (!userId) throw new PushClientError('로그인한 뒤 다시 시도해 주세요.');
    if (action === 'enable' && !enabled) throw new PushClientError('복약·커뮤니티 알림 설정을 먼저 켜 주세요.');
    operationLock.current = true;
    inspectionVersion.current++;
    const epoch = generation.current;
    setSnapshot(previous => ({ ...previous, owner: userId, busy: action, checking: false, error: '' }));
    try {
      const promise = client[action](current.config);
      pendingOperation.current = promise;
      const result = await promise;
      if (epoch !== generation.current) return false;
      setSnapshot(previous => ({ ...previous, subscribed: action === 'test' ? previous.subscribed : result.subscribed, busy: '' }));
      return true;
    } catch (error) {
      const displayError = normalizePushError(error);
      if (epoch === generation.current) setSnapshot(previous => ({ ...previous, busy: '', error: displayError.message }));
      throw displayError;
    } finally {
      operationLock.current = false;
      pendingOperation.current = null;
      // 설정 변경 중 계정·전체 설정이 바뀌었으면 새 사용자 상태를 즉시 다시 조회
      if (epoch !== generation.current) setRefreshTick(value => value + 1);
    }
  }, [client, userId, enabled, current.config]);

  return {
    ...current, environment,
    // 계정 전체 알림을 끄면 구독은 유지하되 서버 발송과 화면 중복 억제도 중단
    active: Boolean(userId && enabled && current.subscribed && current.config?.enabled),
    enable: () => run('enable'), disable: () => run('disable'), test: () => run('test'),
    refresh: () => setRefreshTick(value => value + 1),
    prepareLogout: async () => {
      // 켜기 요청이 늦게 완료돼 로그아웃 뒤 구독이 남지 않도록 먼저 완료를 기다림
      await pendingOperation.current?.catch(() => {});
      const result = await client.prepareLogout(current.config);
      if (result.subscribed === false) setSnapshot(previous => previous.owner === userId ? { ...previous, subscribed: false } : previous);
    },
  };
}
