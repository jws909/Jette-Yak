/**
 * 이 기기의 Web Push 구독만 관리하는 경계
 * 계정 식별은 서버 세션에 맡기고 구독 주소·암호키는 저장소나 로그에 남기지 않음
 */
export class PushClientError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'PushClientError';
    this.status = status;
  }
}

export function getPushEnvironment(browser = globalThis.window) {
  const nav = browser?.navigator;
  // Brave 여부는 안내용 힌트. 브라우저 내부 Google 서비스 설정값은 읽을 수 없음
  const isBrave = Boolean(nav?.brave);
  const isIOS = /iPad|iPhone|iPod/.test(nav?.userAgent || '')
    || (nav?.platform === 'MacIntel' && nav?.maxTouchPoints > 1);
  const standalone = browser?.matchMedia?.('(display-mode: standalone)').matches === true
    || nav?.standalone === true;
  if (!browser?.isSecureContext) return { supported: false, isIOS, isBrave, reason: 'https', message: '알림을 받으려면 HTTPS 주소로 접속해 주세요.' };
  if (isIOS && !standalone) return { supported: false, isIOS, isBrave, reason: 'install', message: 'iPhone·iPad에서는 Safari의 공유 → 홈 화면에 추가 후, 홈 화면의 제때약 앱에서 알림을 켜 주세요. iOS 16.4 이상이 필요해요.' };
  if (!nav?.serviceWorker || !browser?.PushManager || !browser?.Notification) {
    return { supported: false, isIOS, isBrave, reason: 'unsupported', message: isIOS ? 'iOS 16.4 이상으로 업데이트하고 홈 화면에 설치한 제때약 앱에서 다시 확인해 주세요.' : '이 브라우저는 앱 종료 후 알림을 지원하지 않아요. 최신 Chrome 등 알림을 지원하는 브라우저에서 열어 주세요.' };
  }
  return { supported: true, isIOS, isBrave, reason: '', message: '' };
}

/** 브라우저 원문 대신 실패 단계와 고정 오류명만 남기고, 사용자에게 다음 행동 안내 */
export function normalizePushError(error, stage = 'operation', browser = globalThis.window) {
  if (error instanceof PushClientError) return error;
  const stages = ['permission', 'worker-registration', 'worker-capability', 'subscription-read', 'subscription-create', 'subscription-remove', 'server-key', 'operation'];
  const names = ['AbortError', 'NotAllowedError', 'InvalidStateError', 'InvalidAccessError', 'InvalidCharacterError', 'SecurityError', 'NotSupportedError', 'TypeError', 'NetworkError'];
  const safeStage = stages.includes(stage) ? stage : 'operation';
  const safeName = names.includes(error?.name) ? error.name : 'UnknownError';
  const environment = getPushEnvironment(browser);
  const code = `PUSH_${safeStage.replace(/-/g, '_').toUpperCase()}_${safeName.replace(/Error$/, '').toUpperCase()}`;
  // endpoint·키·서버 URL·예외 원문은 브라우저 진단에도 출력하지 않음
  browser?.console?.warn?.('제때약 알림 진단', { code, stage: safeStage, errorName: safeName });
  let message;
  if (safeName === 'NotAllowedError') {
    message = environment.isIOS ? '기기 설정 → 알림 → 제때약에서 알림을 허용한 뒤 다시 켜 주세요.'
      : '브라우저에서 알림을 허용하지 않았어요. 제때약 사이트 설정에서 알림을 허용한 뒤 다시 켜 주세요.';
  } else if (safeName === 'InvalidStateError') {
    message = '앱의 알림 준비 상태를 확인하지 못했어요. 앱 업데이트를 적용하고 모든 제때약 창을 닫았다가 다시 열어 주세요.';
  } else if (['InvalidAccessError', 'InvalidCharacterError'].includes(safeName) || safeStage === 'server-key') {
    message = '서버의 알림 공개키 설정을 확인해야 해요. 관리자에게 알림 설정 확인을 요청해 주세요.';
  } else if (safeName === 'SecurityError') {
    message = '브라우저 보안 설정 때문에 알림을 연결하지 못했어요. 제때약의 HTTPS 주소나 설치한 앱에서 다시 열고 사이트 알림 설정을 확인해 주세요.';
  } else if (safeName === 'AbortError' && safeStage === 'subscription-create') {
    message = environment.isBrave && !environment.isIOS
      ? 'Brave가 푸시 서비스에 연결하지 못했어요.\nBrave 설정 → 개인정보 및 보안에서 “푸시 메시징에 Google 서비스 사용”이 켜져 있는지 확인해 주세요.\n설정을 바꿨다면 Brave와 설치 앱을 완전히 종료한 뒤 다시 열어 알림을 켜 주세요.'
      : '브라우저가 푸시 알림 서비스에 연결하지 못했어요.\n인터넷 연결과 VPN·방화벽 설정을 확인하고 브라우저와 설치 앱을 완전히 종료한 뒤 다시 열어 주세요.\nChrome·Edge를 사용한다면 최신 버전인지도 확인해 주세요.';
  } else {
    const messages = {
      permission: '알림 권한 확인을 완료하지 못했어요. 브라우저 알림 설정을 확인한 뒤 다시 시도해 주세요.',
      'worker-registration': '앱 준비 상태를 확인하지 못했어요. 페이지를 새로고침하고 앱 업데이트가 있다면 적용해 주세요.',
      'worker-capability': '앱의 알림 기능을 확인하지 못했어요. 앱 업데이트를 적용하고 다시 열어 주세요.',
      'subscription-read': '이 기기의 기존 알림 연결을 확인하지 못했어요. 브라우저와 앱을 다시 열어 주세요.',
      'subscription-create': '이 기기를 푸시 알림 서비스에 연결하지 못했어요. 인터넷 연결과 브라우저 알림 설정을 확인해 주세요.',
      'subscription-remove': '이 기기의 알림 연결을 해제하지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.',
      operation: '기기의 알림 작업을 완료하지 못했어요. 브라우저와 앱을 다시 열고 알림 설정을 확인해 주세요.',
    };
    message = messages[safeStage] || messages.operation;
  }
  const normalized = new PushClientError(message);
  normalized.code = code;
  normalized.stage = safeStage;
  return normalized;
}

export function decodeApplicationServerKey(value, decode = globalThis.atob) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw new PushClientError('서버 알림 설정을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const raw = decode(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  const bytes = Uint8Array.from(raw, char => char.charCodeAt(0));
  if (bytes.length !== 65 || bytes[0] !== 4) throw new PushClientError('서버 알림 설정이 올바르지 않아요. 관리자에게 알려 주세요.');
  return bytes;
}

function sameKey(current, expected) {
  if (!current) return true;
  const bytes = new Uint8Array(current);
  return bytes.length === expected.length && bytes.every((value, index) => value === expected[index]);
}

// 일시적 통신 실패를 '구독 해제'로 오해하면 정시 OS 알림이 두 번 울릴 수 있음
export function retainPushConfirmation(previous, owner, error, permission) {
  return previous.owner === owner && previous.subscribed === true
    && permission === 'granted' && ![401, 403].includes(error?.status);
}

export function createPushClient(browser = globalThis.window) {
  async function nativeCall(stage, action) {
    // action은 즉시 실행해 클릭에서 시작한 권한 요청의 사용자 동작을 유지
    try { return await action(); } catch (error) { throw normalizePushError(error, stage, browser); }
  }
  async function request(path, { config, body } = {}) {
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 15000);
    try {
      const headers = body ? { 'Content-Type': 'application/json', 'X-Push-CSRF': config?.csrfToken || '' } : {};
      const response = await browser.fetch(`/api/push/${path}`, {
        method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
        headers, body: body ? JSON.stringify(body) : undefined, signal: abort.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const fallback = response.status === 401 ? '로그인이 만료됐어요. 다시 로그인한 뒤 알림을 켜 주세요.'
          : response.status === 429 ? '잠시 기다린 뒤 다시 시도해 주세요.'
            : response.status === 404 ? '서버 알림 기능을 준비 중이에요. 서버 업데이트 후 다시 확인해 주세요.'
              : '알림 설정을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.';
        throw new PushClientError(data.message || data.error || fallback, response.status);
      }
      return data;
    } catch (error) {
      if (error instanceof PushClientError) throw error;
      throw new PushClientError(error?.name === 'AbortError' ? '서버 응답이 늦어지고 있어요. 연결을 확인한 뒤 다시 시도해 주세요.' : '알림 서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.');
    } finally {
      clearTimeout(timeout);
    }
  }

  async function verifyPushWorker(worker) {
    if (!browser.MessageChannel) throw new PushClientError('앱 업데이트를 적용한 뒤 알림을 다시 켜 주세요.');
    let channel;
    let timeout;
    try {
      channel = new browser.MessageChannel();
      await new Promise((resolve, reject) => {
        timeout = setTimeout(() => reject(new PushClientError('알림을 지원하는 앱 업데이트가 필요해요. 앱 업데이트를 적용하거나 모든 제때약 창을 닫고 다시 열어 주세요.')), 1500);
        channel.port1.onmessage = event => {
          if (event.data?.push === true && event.data?.version === 1) resolve();
          else reject(new PushClientError('앱 업데이트를 적용한 뒤 알림을 다시 켜 주세요.'));
        };
        worker.postMessage({ type: 'GET_PUSH_CAPABILITIES' }, [channel.port2]);
      });
    } catch (error) {
      throw normalizePushError(error, 'worker-capability', browser);
    } finally {
      clearTimeout(timeout);
      channel?.port1.close(); channel?.port2.close();
    }
  }

  async function registration(requirePush = true) {
    let timeout;
    try {
      // 개발 서버에는 워커가 없을 수 있어 ready를 무한히 기다리지 않음
      const reg = await Promise.race([
        nativeCall('worker-registration', () => browser.navigator.serviceWorker.getRegistration('/')),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new PushClientError('앱 준비가 늦어지고 있어요. 페이지를 새로고침한 뒤 다시 시도해 주세요.')), 4000); }),
      ]);
      const script = reg?.active?.scriptURL ? new URL(reg.active.scriptURL, browser.location.origin) : null;
      const scope = reg?.scope ? new URL(reg.scope, browser.location.origin) : null;
      if (!script || script.origin !== browser.location.origin || script.pathname !== '/sw.js'
        || (scope && (scope.origin !== browser.location.origin || scope.pathname !== '/')) || !reg.pushManager) {
        throw new PushClientError('설치 앱 준비가 필요해요. 배포된 HTTPS 주소에서 페이지를 새로고침하고 앱 업데이트가 보이면 적용해 주세요. 개발 서버에서는 앱 종료 후 알림을 켤 수 없어요.');
      }
      // 같은 경로의 예전 워커에는 push 처리가 없을 수 있어 실제 기능 응답 확인
      if (requirePush) await verifyPushWorker(reg.active);
      return reg;
    } catch (error) {
      throw normalizePushError(error, 'worker-registration', browser);
    } finally {
      clearTimeout(timeout);
    }
  }

  async function localSubscription(requirePush = true) {
    if (!browser?.navigator?.serviceWorker) return null;
    const reg = await registration(requirePush);
    return nativeCall('subscription-read', () => reg.pushManager.getSubscription());
  }

  const client = {
    getConfig: () => request('config'),
    async inspect(config) {
      if (!config?.enabled || !getPushEnvironment(browser).supported) return { subscribed: false };
      const subscription = await localSubscription();
      if (!subscription || browser.Notification.permission !== 'granted') return { subscribed: false };
      const key = await nativeCall('server-key', () => decodeApplicationServerKey(config.publicKey, value => browser.atob(value)));
      if (!sameKey(subscription.options?.applicationServerKey, key)) return { subscribed: false };
      const data = await request('subscriptions/status', { config, body: { endpoint: subscription.endpoint } });
      return { subscribed: data.subscribed === true };
    },
    async enable(config) {
      const environment = getPushEnvironment(browser);
      if (!environment.supported) throw new PushClientError(environment.message);
      if (!config?.enabled || !config.publicKey || !config.csrfToken) throw new PushClientError('서버 알림 기능을 준비 중이에요. 잠시 후 다시 확인해 주세요.');
      if (browser.Notification.permission === 'denied') throw new PushClientError(environment.isIOS ? '기기 설정 → 알림 → 제때약에서 알림을 허용한 뒤 다시 켜 주세요.' : '브라우저의 제때약 사이트 설정에서 알림을 허용한 뒤 다시 켜 주세요.');
      // iPhone은 클릭에서 바로 권한을 요청해야 하므로 첫 await보다 앞에서 실행
      const permissionPromise = browser.Notification.permission === 'granted'
        ? Promise.resolve('granted') : nativeCall('permission', () => browser.Notification.requestPermission());
      const permission = await permissionPromise;
      if (permission !== 'granted') throw new PushClientError('알림이 허용되지 않았어요. 원할 때 마이페이지에서 다시 켤 수 있어요.');
      const key = await nativeCall('server-key', () => decodeApplicationServerKey(config.publicKey, value => browser.atob(value)));
      const reg = await registration();
      let subscription = await nativeCall('subscription-read', () => reg.pushManager.getSubscription());
      let created = false;
      if (subscription && !sameKey(subscription.options?.applicationServerKey, key)) {
        if (!await nativeCall('subscription-remove', () => subscription.unsubscribe())) throw new PushClientError('이전 알림 설정을 정리하지 못했어요. 페이지를 다시 열어 주세요.');
        subscription = null;
      }
      if (!subscription) {
        subscription = await nativeCall('subscription-create', () => reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
        created = true;
      }
      try {
        await request('subscriptions', { config, body: subscription.toJSON() });
      } catch (error) {
        // 공유 기기의 다른 계정 구독을 덮어쓰지 않고 새 주소로 명시적 등록
        if (error.status === 409) {
          if (!await nativeCall('subscription-remove', () => subscription.unsubscribe())) throw new PushClientError('이 기기의 이전 계정 알림을 정리하지 못했어요. 브라우저 사이트 설정을 확인해 주세요.');
          subscription = await nativeCall('subscription-create', () => reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
          try { await request('subscriptions', { config, body: subscription.toJSON() }); }
          catch (retryError) { await nativeCall('subscription-remove', () => subscription.unsubscribe()).catch(() => {}); throw retryError; }
        } else {
          if (created) await nativeCall('subscription-remove', () => subscription.unsubscribe()).catch(() => {});
          throw error;
        }
      }
      return { subscribed: true };
    },
    async disable(config) {
      const subscription = await localSubscription(false);
      if (!subscription) return { subscribed: false };
      let removeError;
      try { await request('subscriptions/remove', { config, body: { endpoint: subscription.endpoint } }); }
      catch (error) { removeError = error; }
      // 서버가 잠시 응답하지 않아도 브라우저 구독을 해제하면 해당 주소로 수신 불가
      if (!await nativeCall('subscription-remove', () => subscription.unsubscribe())) {
        if (removeError) throw removeError;
      }
      return { subscribed: false };
    },
    async test(config) {
      const subscription = await localSubscription();
      if (!subscription) throw new PushClientError('이 기기의 알림을 먼저 켜 주세요.');
      await request('test', { config, body: { endpoint: subscription.endpoint } });
    },
    async prepareLogout(config) {
      // 로그아웃 서버도 이 세션의 구독을 정리하므로 브라우저 정리 실패가 로그아웃을 막지 않음
      try { return await client.disable(config); } catch { return { subscribed: null }; }
    },
  };
  return client;
}
