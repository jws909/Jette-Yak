import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { showForegroundNotification } from './foregroundNotifications.js';

const origin = 'https://jette-yak.example';

function browserFixture({ permission = 'granted', mobile = false, serviceWorker } = {}) {
  const notifications = [];
  let permissionRequests = 0;
  class NotificationApi {
    static permission = permission;
    static requestPermission() { permissionRequests++; throw new Error('권한 요청 금지'); }
    constructor(title, options) {
      if (mobile) throw new TypeError('Illegal constructor');
      notifications.push({ title, options });
    }
  }
  return {
    browser: { Notification: NotificationApi, navigator: { serviceWorker }, location: { origin } },
    notifications,
    get permissionRequests() { return permissionRequests; },
  };
}

test('알림 미지원 환경은 실패로 끝나고 서비스 워커도 조회하지 않음', async () => {
  const result = await showForegroundNotification('복약 알림', {}, {
    navigator: { serviceWorker: { getRegistration() { throw new Error('조회 금지'); } } },
  });
  assert.equal(result, false);
});

for (const permission of ['denied', 'default']) {
  test(`${permission} 권한에서는 알림을 만들거나 권한을 요청하지 않음`, async () => {
    const fixture = browserFixture({ permission, serviceWorker: { getRegistration() { throw new Error('조회 금지'); } } });
    assert.equal(await showForegroundNotification('복약 알림', {}, fixture.browser), false);
    assert.equal(fixture.notifications.length, 0);
    assert.equal(fixture.permissionRequests, 0);
  });
}

test('모바일에서는 활성 제때약 서비스 워커로 표시하고 아이콘과 데이터를 전달', async () => {
  const calls = [];
  const registration = {
    active: { scriptURL: `${origin}/sw.js` },
    showNotification: async (title, options) => { calls.push({ title, options }); },
  };
  const requestedPaths = [];
  const fixture = browserFixture({ mobile: true, serviceWorker: {
    getRegistration: async path => { requestedPaths.push(path); return registration; },
    get ready() { throw new Error('ready 접근 금지'); },
  } });
  const data = { type: 'medication-reminder', url: '/', date: '2026-10-08', time: '00:15', isPreAlarm: true };
  assert.equal(await showForegroundNotification('복약 알림', { body: '약 복용 시간', tag: 'pre-dose', data }, fixture.browser), true);
  assert.deepEqual(requestedPaths, ['/']);
  assert.deepEqual(calls, [{ title: '복약 알림', options: { body: '약 복용 시간', tag: 'pre-dose', data, icon: '/pwa/icon-192.png' } }]);
  assert.equal(fixture.notifications.length, 0);
  assert.equal(fixture.permissionRequests, 0);
});

for (const [label, registration] of [
  ['등록 없음', undefined],
  ['활성 워커 없음', { active: null }],
  ['다른 스크립트', { active: { scriptURL: `${origin}/other-worker.js` }, showNotification() { assert.fail('다른 워커 사용 금지'); } }],
  ['다른 출처', { active: { scriptURL: 'https://other.example/sw.js' }, showNotification() { assert.fail('다른 출처 사용 금지'); } }],
]) {
  test(`활성 자체 등록이 없으면 ready를 기다리지 않고 데스크톱 생성자로 표시: ${label}`, async () => {
    const fixture = browserFixture({ serviceWorker: {
      getRegistration: async () => registration,
      get ready() { throw new Error('ready 접근 금지'); },
    } });
    assert.equal(await showForegroundNotification('복약 알림', { tag: 'main-dose' }, fixture.browser), true);
    assert.deepEqual(fixture.notifications, [{ title: '복약 알림', options: { tag: 'main-dose', icon: '/pwa/icon-192.png' } }]);
  });
}

test('서비스 워커 미지원 데스크톱도 알림을 표시', async () => {
  const fixture = browserFixture();
  assert.equal(await showForegroundNotification('복약 알림', {}, fixture.browser), true);
  assert.equal(fixture.notifications.length, 1);
});

for (const fail of [() => { throw new Error('동기 실패'); }, () => Promise.reject(new Error('비동기 실패'))]) {
  test(`서비스 워커 표시 ${fail.toString().includes('reject') ? '거부' : '예외'} 후 데스크톱 알림으로 복구`, async () => {
    const fixture = browserFixture({ serviceWorker: {
      getRegistration: async () => ({ active: { scriptURL: `${origin}/sw.js` }, showNotification: fail }),
    } });
    assert.equal(await showForegroundNotification('복약 알림', {}, fixture.browser), true);
    assert.equal(fixture.notifications.length, 1);
  });
}

test('등록 조회가 거부되어도 데스크톱 알림으로 복구', async () => {
  const fixture = browserFixture({ serviceWorker: { getRegistration: async () => { throw new Error('조회 실패'); } } });
  assert.equal(await showForegroundNotification('복약 알림', {}, fixture.browser), true);
  assert.equal(fixture.notifications.length, 1);
});

test('서비스 워커가 없는 모바일 생성자 TypeError는 false로 끝남', async () => {
  const fixture = browserFixture({ mobile: true, serviceWorker: {
    getRegistration: async () => undefined,
    get ready() { throw new Error('ready 접근 금지'); },
  } });
  assert.equal(await showForegroundNotification('복약 알림', {}, fixture.browser), false);
});

test('서비스 워커 표시 거부와 모바일 생성자 오류가 겹쳐도 Promise는 거부되지 않음', async () => {
  const fixture = browserFixture({ mobile: true, serviceWorker: {
    getRegistration: async () => ({ active: { scriptURL: `${origin}/sw.js` }, showNotification: async () => { throw new Error('표시 실패'); } }),
  } });
  assert.equal(await showForegroundNotification('복약 알림', {}, fixture.browser), false);
});

test('브라우저 API 속성 접근 오류도 false로 끝남', async () => {
  assert.equal(await showForegroundNotification('복약 알림', {}, {
    get Notification() { throw new Error('API 접근 불가'); },
  }), false);
});

for (const serverPushActive of [false, true]) {
test(`실제 복약 검사에서 정시 모달·앱 내부 알림 유지, 서버 푸시 ${serverPushActive ? '연결 시 OS 알림 중복 방지' : '미연결 시 모바일 오류도 처리'}`, async () => {
  const source = await readFile(new URL('../../App.jsx', import.meta.url), 'utf8');
  const start = source.indexOf('    const triggerCheck = async () => {');
  const end = source.indexOf('\n    triggerCheck();', start);
  assert.ok(start >= 0 && end > start);
  const fixture = browserFixture({ mobile: true });
  const events = [];
  const notifications = [];
  const osPayloads = [];
  let modal;
  const scope = {
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : ['2026-10-07T08:00:00'])); } },
    getFormattedDate: () => '2026-10-07',
    currentUserId: 7, isActive: true, alertSession: {}, alertedTags: new Set(), serverPushActiveRef: { current: serverPushActive },
    fetch: async () => ({ ok: true, json: async () => [
      { scheduleId: 1, name: '정시 약', time: '08:00', takenAt: null, alarmEnabled: true },
      { scheduleId: 2, name: '예비 약', time: '08:30', takenAt: null, alarmEnabled: true },
    ] }),
    Notification: fixture.browser.Notification,
    window: { Notification: fixture.browser.Notification, dispatchEvent: event => events.push(event) },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    setGlobalAlertError() {}, setGlobalAlertItem: item => { modal = item; },
    showForegroundNotification: (...args) => {
      osPayloads.push(args);
      const result = showForegroundNotification(...args, fixture.browser);
      notifications.push(result);
      return result;
    },
    console: { error: error => assert.fail(String(error)) },
  };
  const check = vm.runInNewContext(`${source.slice(start, end)}\ntriggerCheck`, scope);
  await check();
  assert.equal(modal.name, '정시 약');
  assert.equal(modal.date, '2026-10-07');
  assert.deepEqual(events.map(event => event.detail.isPreAlarm), [true, false]);
  assert.deepEqual(await Promise.all(notifications), serverPushActive ? [] : [false, false]);
  assert.ok(osPayloads.every(([title, options]) => !`${title} ${options.body}`.includes('정시 약') && !`${title} ${options.body}`.includes('예비 약')));
});
}
