import test from 'node:test';
import assert from 'node:assert/strict';
import { createPushClient, decodeApplicationServerKey, getPushEnvironment, retainPushConfirmation, normalizePushError, PushClientError } from './pushClient.js';

const origin = 'https://jette-yak.example';
const publicKey = btoa(String.fromCharCode(4, ...Array(64).fill(1))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const config = { enabled: true, publicKey, csrfToken: 'session-csrf' };

function fixture({ permission = 'granted', existing = false, response } = {}) {
  const calls = [], subscriptions = [], warnings = [];
  let permissionRequests = 0;
  let current;
  const makeSubscription = () => {
    const subscription = {
      endpoint: `https://fcm.googleapis.com/send/device-${subscriptions.length}`,
      options: {},
      toJSON: () => ({ endpoint: subscription.endpoint, keys: { p256dh: 'public', auth: 'private' } }),
      async unsubscribe() { calls.push('unsubscribe'); if (current === subscription) current = null; return true; },
    };
    subscriptions.push(subscription);
    return subscription;
  };
  if (existing) current = makeSubscription();
  const registration = {
    scope: `${origin}/`, active: { scriptURL: `${origin}/sw.js`, postMessage(message, ports) {
      assert.deepEqual(message, { type: 'GET_PUSH_CAPABILITIES' });
      ports[0].postMessage({ push: true, version: 1 });
    } },
    pushManager: {
      async getSubscription() { return current; },
      async subscribe(options) { calls.push({ subscribe: options }); current = makeSubscription(); return current; },
    },
  };
  class NotificationApi {
    static permission = permission;
    static requestPermission() { permissionRequests++; calls.push('permission'); NotificationApi.permission = 'granted'; return Promise.resolve('granted'); }
  }
  const browser = {
    console: { warn: (...args) => warnings.push(args) },
    isSecureContext: true, location: { origin }, Notification: NotificationApi, PushManager: class {}, atob,
    matchMedia: () => ({ matches: false }),
    MessageChannel: class {
      constructor() {
        this.port1 = { close() {}, onmessage: null };
        this.port2 = { close() {}, postMessage: data => queueMicrotask(() => this.port1.onmessage?.({ data })) };
      }
    },
    navigator: { userAgent: 'Android Chrome', serviceWorker: {
      async getRegistration(path) { calls.push({ registration: path }); return registration; },
      get ready() { return assert.fail('무한 대기할 수 있는 ready 사용 금지'); },
    } },
    async fetch(url, options) {
      calls.push({ url, options });
      if (response) return response(url, options, calls);
      return { ok: true, status: 200, json: async () => url.endsWith('/config') ? config : { subscribed: true } };
    },
  };
  return { browser, calls, subscriptions, warnings, registration, client: createPushClient(browser), get permissionRequests() { return permissionRequests; } };
}

test('HTTPS·Web Push 지원을 확인하고 Android 브라우저는 설치 전에도 지원', () => {
  const f = fixture();
  assert.equal(getPushEnvironment(f.browser).supported, true);
  f.browser.isSecureContext = false;
  assert.equal(getPushEnvironment(f.browser).reason, 'https');
});

for (const [userAgent, platform, maxTouchPoints] of [['iPhone Safari', '', 0], ['Safari', 'MacIntel', 5]]) {
  test(`iPhone/iPad는 홈 화면 앱에서만 켜기 가능: ${userAgent}/${platform}`, () => {
    const f = fixture();
    Object.assign(f.browser.navigator, { userAgent, platform, maxTouchPoints });
    assert.equal(getPushEnvironment(f.browser).reason, 'install');
    f.browser.navigator.standalone = true;
    assert.equal(getPushEnvironment(f.browser).supported, true);
  });
}

test('설정 조회와 구독 상태 확인은 알림 권한을 요청하지 않음', async () => {
  const f = fixture({ existing: true });
  await f.client.getConfig();
  assert.deepEqual(await f.client.inspect(config), { subscribed: true });
  assert.equal(f.permissionRequests, 0);
  const request = f.calls.find(call => call.url?.endsWith('/status'));
  assert.equal(request.options.credentials, 'same-origin');
  assert.equal(request.options.cache, 'no-store');
  assert.equal(request.options.headers['X-Push-CSRF'], config.csrfToken);
  assert.deepEqual(JSON.parse(request.options.body), { endpoint: f.subscriptions[0].endpoint });
});

test('서버 미설정이면 브라우저 구독 조회·권한 요청 없이 종료', async () => {
  const f = fixture({ permission: 'default' });
  assert.deepEqual(await f.client.inspect({ enabled: false }), { subscribed: false });
  await assert.rejects(f.client.enable({ enabled: false }), /서버 알림/);
  assert.deepEqual(f.calls, []);
});

test('클릭에서 즉시 권한을 요청한 다음 활성 워커·서버에 구독 등록', async () => {
  const f = fixture({ permission: 'default' });
  const pending = f.client.enable(config);
  assert.equal(f.permissionRequests, 1);
  assert.deepEqual(f.calls, ['permission']);
  assert.deepEqual(await pending, { subscribed: true });
  const subscribe = f.calls.find(call => call.subscribe)?.subscribe;
  assert.equal(subscribe.userVisibleOnly, true);
  assert.equal(subscribe.applicationServerKey.length, 65);
  const request = f.calls.find(call => call.url?.endsWith('/subscriptions'));
  assert.deepEqual(JSON.parse(request.options.body), f.subscriptions[0].toJSON());
});

test('권한 거절 시 구독이나 서버 등록을 시도하지 않음', async () => {
  const f = fixture({ permission: 'default' });
  f.browser.Notification.requestPermission = () => Promise.resolve('denied');
  await assert.rejects(f.client.enable(config), /허용되지/);
  assert.deepEqual(f.calls, []);
});

test('이미 차단된 알림은 재요청하지 않고 설정 변경 방법 안내', async () => {
  const f = fixture({ permission: 'denied' });
  await assert.rejects(f.client.enable(config), /사이트 설정/);
  assert.equal(f.permissionRequests, 0);
});

for (const scriptURL of [`${origin}/other.js`, 'https://other.example/sw.js', '']) {
  test(`소유한 활성 sw.js만 구독: ${scriptURL || '워커 없음'}`, async () => {
    const f = fixture();
    f.registration.active = scriptURL ? { scriptURL } : null;
    await assert.rejects(f.client.enable(config), /앱 준비/);
    assert.equal(f.subscriptions.length, 0);
  });
}

test('유효한 P-256 공개키만 PushManager에 전달', () => {
  assert.equal(decodeApplicationServerKey(publicKey).length, 65);
  for (const value of ['bad!', 'abcd', '', null]) assert.throws(() => decodeApplicationServerKey(value));
});

test('기존 sw.js가 푸시 지원을 확인해주지 않으면 구독하지 않고 업데이트 안내', async () => {
  const f = fixture();
  f.registration.active.postMessage = (_, ports) => ports[0].postMessage({ push: false });
  await assert.rejects(f.client.enable(config), /업데이트/);
  assert.equal(f.subscriptions.length, 0);
});

test('오래된 워커라도 로그아웃·해제는 기능 응답을 기다리지 않음', async () => {
  const f = fixture({ existing: true });
  f.registration.active.postMessage = () => assert.fail('해제에 기능 확인 불필요');
  await f.client.prepareLogout(config);
  assert.equal(f.calls.includes('unsubscribe'), true);
});

test('기존 구독은 재사용하고 서버 소유권 확인 후에만 활성 반환', async () => {
  const f = fixture({ existing: true });
  assert.deepEqual(await f.client.enable(config), { subscribed: true });
  assert.equal(f.subscriptions.length, 1);
  assert.equal(f.calls.some(call => call.subscribe), false);
});

test('다른 계정이 소유한 주소는 덮어쓰지 않고 새 구독으로 재시도', async () => {
  let registerCount = 0;
  const f = fixture({ existing: true, response: url => {
    const conflict = url.endsWith('/subscriptions') && registerCount++ === 0;
    return { ok: !conflict, status: conflict ? 409 : 200, json: async () => ({}) };
  } });
  assert.deepEqual(await f.client.enable(config), { subscribed: true });
  assert.equal(f.subscriptions.length, 2);
  assert.equal(f.calls.filter(call => call === 'unsubscribe').length, 1);
  assert.equal(registerCount, 2);
});

test('새 구독 등록이 실패하면 브라우저 구독도 회수하고 성공으로 표시하지 않음', async () => {
  const f = fixture({ response: () => ({ ok: false, status: 500, json: async () => ({}) }) });
  await assert.rejects(f.client.enable(config));
  assert.equal(f.calls.filter(call => call === 'unsubscribe').length, 1);
});

test('기존 구독 서버 통신 실패는 다른 기기나 기존 구독을 지우지 않음', async () => {
  const f = fixture({ existing: true, response: () => ({ ok: false, status: 500, json: async () => ({}) }) });
  await assert.rejects(f.client.enable(config));
  assert.equal(f.calls.includes('unsubscribe'), false);
});

test('VAPID 키가 바뀌면 이전 브라우저 구독 해제 후 새 키로 등록', async () => {
  const f = fixture({ existing: true });
  f.subscriptions[0].options.applicationServerKey = new Uint8Array(65).buffer;
  await f.client.enable(config);
  assert.equal(f.subscriptions.length, 2);
  assert.equal(f.calls.includes('unsubscribe'), true);
});

test('변경된 VAPID 키는 자동 재구독하지 않고 기기 알림 켜기 요청을 기다림', async () => {
  const f = fixture({ existing: true });
  f.subscriptions[0].options.applicationServerKey = new Uint8Array(65).buffer;
  assert.deepEqual(await f.client.inspect(config), { subscribed: false });
  assert.equal(f.calls.some(call => call.subscribe || call.url), false);
});

test('일시적인 조회 장애는 같은 계정의 기존 확인 상태를 보존해 중복 OS 알림 방지', () => {
  const previous = { owner: 7, subscribed: true };
  assert.equal(retainPushConfirmation(previous, 7, new Error('offline'), 'granted'), true);
  assert.equal(retainPushConfirmation(previous, 7, { status: 500 }, 'granted'), true);
  for (const status of [401, 403]) assert.equal(retainPushConfirmation(previous, 7, { status }, 'granted'), false);
  assert.equal(retainPushConfirmation(previous, 8, {}, 'granted'), false);
  assert.equal(retainPushConfirmation({ owner: 7, subscribed: false }, 7, {}, 'granted'), false);
  assert.equal(retainPushConfirmation(previous, 7, {}, 'denied'), false);
});

test('이 기기 끄기는 서버 해제 후 브라우저도 해제', async () => {
  const f = fixture({ existing: true });
  assert.deepEqual(await f.client.disable(config), { subscribed: false });
  assert.equal(f.calls.at(-1), 'unsubscribe');
  assert.deepEqual(await f.client.inspect(config), { subscribed: false });
});

test('서버 장애 때도 브라우저 구독을 해제해 이 기기 수신 중단', async () => {
  const f = fixture({ existing: true, response: () => { throw new Error('offline'); } });
  assert.deepEqual(await f.client.disable(config), { subscribed: false });
  assert.equal(f.calls.includes('unsubscribe'), true);
});

test('테스트 발송은 현재 기기 주소만 전달하고 자동 실행하지 않음', async () => {
  const f = fixture({ existing: true });
  await f.client.test(config);
  const request = f.calls.find(call => call.url?.endsWith('/test'));
  assert.deepEqual(JSON.parse(request.options.body), { endpoint: f.subscriptions[0].endpoint });
  assert.equal(f.permissionRequests, 0);
});

test('구독 없는 기기에 테스트 알림 발송하지 않음', async () => {
  const f = fixture();
  await assert.rejects(f.client.test(config), /먼저/);
  assert.equal(f.calls.some(call => call.url), false);
});

test('세션 만료는 성공 상태로 처리하지 않으며 권한을 재요청하지 않음', async () => {
  const f = fixture({ existing: true, response: () => ({ ok: false, status: 401, json: async () => ({}) }) });
  await assert.rejects(f.client.inspect(config), error => error.status === 401 && /로그인/.test(error.message));
  assert.equal(f.permissionRequests, 0);
});

test('로그아웃은 서버 오류가 있어도 로컬 구독 해제를 시도', async () => {
  const f = fixture({ existing: true, response: () => { throw new Error('offline'); } });
  await f.client.prepareLogout(config);
  assert.equal(f.calls.includes('unsubscribe'), true);
});

function nativeError(name) {
  const error = new Error('https://secret.example/endpoint?auth=secret-key');
  error.name = name;
  return error;
}

test('Brave 구독 AbortError는 Google 서비스 설정 확인 안내, 서버 등록 없이 종료', async () => {
  const f = fixture();
  f.browser.navigator.brave = {};
  f.registration.pushManager.subscribe = async () => { throw nativeError('AbortError'); };
  await assert.rejects(f.client.enable(config), error => error instanceof PushClientError
    && error.stage === 'subscription-create' && /Google 서비스 사용/.test(error.message)
    && /켜져 있는지 확인/.test(error.message) && !/꺼져 있/.test(error.message));
  assert.equal(f.calls.some(call => call.url?.endsWith('/subscriptions')), false);
  assert.deepEqual(f.warnings, [['제때약 알림 진단', { code: 'PUSH_SUBSCRIPTION_CREATE_ABORT', stage: 'subscription-create', errorName: 'AbortError' }]]);
  assert.doesNotMatch(JSON.stringify(f.warnings), /secret|https:|endpoint|auth|publicKey/);
});

test('Brave 힌트는 일반 브라우저·다른 실패 단계·iOS에 Google 설정 안내를 섞지 않음', () => {
  const f = fixture();
  assert.equal(getPushEnvironment(f.browser).isBrave, false);
  assert.doesNotMatch(normalizePushError(nativeError('AbortError'), 'subscription-create', f.browser).message, /Google/);
  f.browser.navigator.brave = {};
  assert.equal(getPushEnvironment(f.browser).isBrave, true);
  assert.doesNotMatch(normalizePushError(nativeError('AbortError'), 'subscription-read', f.browser).message, /Google/);
  f.browser.navigator.userAgent = 'iPhone Safari';
  f.browser.navigator.standalone = true;
  assert.doesNotMatch(normalizePushError(nativeError('AbortError'), 'subscription-create', f.browser).message, /Google/);
});

for (const [name, expected] of [['NotAllowedError', /알림을 허용/], ['InvalidStateError', /앱 업데이트/], ['InvalidAccessError', /공개키/], ['SecurityError', /보안 설정/]]) {
  test(`구독 native ${name}는 구체적 안내로 변환하고 서버에 등록하지 않음`, async () => {
    const f = fixture();
    f.registration.pushManager.subscribe = async () => { throw nativeError(name); };
    await assert.rejects(f.client.enable(config), error => error instanceof PushClientError && error.stage === 'subscription-create' && expected.test(error.message));
    assert.equal(f.calls.some(call => call.url?.endsWith('/subscriptions')), false);
    assert.equal(f.warnings.length, 1);
  });
}

for (const synchronous of [false, true]) {
  test(`권한 요청 ${synchronous ? '동기' : '비동기'} 실패도 permission 단계로 처리`, async () => {
    const f = fixture({ permission: 'default' });
    let requested = false;
    f.browser.Notification.requestPermission = () => {
      requested = true;
      if (synchronous) throw nativeError('NotAllowedError');
      return Promise.reject(nativeError('NotAllowedError'));
    };
    const pending = f.client.enable(config);
    assert.equal(requested, true);
    await assert.rejects(pending, error => error.stage === 'permission' && /알림을 허용/.test(error.message));
    assert.equal(f.calls.length, 0);
  });
}

for (const stage of ['worker-registration', 'worker-capability', 'subscription-read', 'subscription-remove', 'server-key']) {
  test(`${stage} native 실패는 정확한 단계로 안내하고 예외 원문은 노출하지 않음`, async () => {
    const f = fixture({ existing: stage === 'subscription-remove' });
    if (stage === 'worker-registration') f.browser.navigator.serviceWorker.getRegistration = async () => { throw nativeError('InvalidStateError'); };
    if (stage === 'worker-capability') f.registration.active.postMessage = () => { throw nativeError('SecurityError'); };
    if (stage === 'subscription-read') f.registration.pushManager.getSubscription = async () => { throw nativeError('AbortError'); };
    if (stage === 'server-key') f.browser.atob = () => { throw nativeError('InvalidCharacterError'); };
    if (stage === 'subscription-remove') {
      f.subscriptions[0].options.applicationServerKey = new Uint8Array(65).buffer;
      f.subscriptions[0].unsubscribe = async () => { throw nativeError('AbortError'); };
    }
    await assert.rejects(f.client.enable(config), error => error.stage === stage && !/secret|https:/.test(error.message));
    assert.equal(f.calls.some(call => call.url?.endsWith('/subscriptions')), false);
    assert.equal(f.warnings.length, 1);
  });
}

test('이미 정리된 PushClientError는 상태·안내를 그대로 보존하고 중복 진단하지 않음', () => {
  const f = fixture();
  const original = new PushClientError('로그인 안내', 401);
  assert.equal(normalizePushError(original, 'operation', f.browser), original);
  assert.equal(f.warnings.length, 0);
  const unknown = normalizePushError({ name: 'https://secret.example/error', message: 'secret' }, 'secret-stage', f.browser);
  assert.equal(unknown.code, 'PUSH_OPERATION_UNKNOWN');
  assert.doesNotMatch(JSON.stringify(f.warnings), /secret|https:/);
});
