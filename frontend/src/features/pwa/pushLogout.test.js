import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../../App.jsx', import.meta.url), 'utf8');
const start = source.indexOf('  const handleLogout = async () => {');
const end = source.indexOf('\n  const handleUserUpdated', start);
assert.ok(start >= 0 && end > start);

function fixture({ detach, response = { ok: true } } = {}) {
  const events = [], state = { loggedIn: true, user: { userId: 7 } };
  const scope = {
    logoutLock: { current: false },
    showLoading: () => events.push('loading'), hideLoading: () => events.push('hide-loading'),
    showAlert: async message => events.push({ alert: message }),
    backgroundPush: {
      async prepareLogout() { events.push('detach'); if (detach) await detach; },
      refresh: () => events.push('refresh-push'),
    },
    fetch: async () => { events.push('logout-request'); return response; },
    setIsLoggedIn: value => { state.loggedIn = value; }, setUser: value => { state.user = value; },
    localStorage: { removeItem: value => events.push(`remove:${value}`) },
    sessionStorage: { removeItem: value => events.push(`remove:${value}`) },
    setPermissionDismissed() {}, setGlobalAlertItem() {}, navigate: path => events.push(`navigate:${path}`),
  };
  return { scope, events, state, logout: vm.runInNewContext(`${source.slice(start, end)}\nhandleLogout`, scope) };
}

test('기기 구독 정리가 끝난 뒤 로그아웃하며 중복 클릭은 하나의 요청으로 처리', async () => {
  let release;
  const f = fixture({ detach: new Promise(resolve => { release = resolve; }) });
  const pending = f.logout();
  await f.logout();
  assert.deepEqual(f.events, ['loading', 'detach']);
  assert.equal(f.state.loggedIn, true);
  release();
  await pending;
  assert.equal(f.events.filter(event => event === 'logout-request').length, 1);
  assert.equal(f.state.loggedIn, false);
  assert.equal(f.state.user, null);
  assert.equal(f.scope.logoutLock.current, false);
  assert.equal(f.events.at(-1), 'navigate:/');
});

test('서버 로그아웃 실패 시 로그인 상태를 보존하고 기기 알림을 다시 확인', async () => {
  const f = fixture({ response: { ok: false } });
  await f.logout();
  assert.equal(f.state.loggedIn, true);
  assert.ok(f.state.user);
  assert.equal(f.events.includes('refresh-push'), true);
  assert.equal(f.events.some(event => typeof event === 'string' && event.startsWith('remove:')), false);
  assert.match(f.events.find(event => event.alert)?.alert, /마이페이지에서 다시/);
  assert.equal(f.scope.logoutLock.current, false);
});
