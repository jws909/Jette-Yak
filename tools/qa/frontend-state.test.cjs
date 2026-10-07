const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '../../frontend');
const stage = process.env.JETTE_QA_STAGE;
const sourcePath = file => stage && fs.existsSync(path.join(stage, file)) ? path.join(stage, file) : path.join(root, file);
const source = file => fs.readFileSync(sourcePath(file), 'utf8').replace(/\r\n/g, '\n');
const quietConsole = { warn() {}, error() {} };

// 네트워크 완료 전/후를 직접 제어하며 실제 조회 콜백을 실행합니다.
function callback(file, name, scope) {
  const text = source(file);
  const declaration = new RegExp(`^( *)const ${name} = useCallback\\(`, 'm').exec(text);
  assert.ok(declaration, `${name} 조회 함수가 존재합니다.`);
  const start = declaration.index + declaration[0].length;
  const end = text.indexOf(`\n${declaration[1]}}, [`, start);
  assert.ok(end > start);
  return vm.runInNewContext(`(${text.slice(start, end + declaration[1].length + 2)})`, scope);
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

const dailyPages = [
  ['캘린더', 'src/calendarpage/CalendarPage.jsx', '7|2026-10-08'],
  ['가족', 'src/features/family/FamilyPage.jsx', '7|all|2026-10-08'],
];

for (const [label, file, expectedKey] of dailyPages) {
  test(`${label}: 늦은 이전 날짜 응답이 최근 목록과 로딩 완료 키를 덮지 않음`, async () => {
    const { createLatestRequest } = await import(pathToFileURL(sourcePath('src/utils/latestRequest.js')));
    const requests = [];
    const state = { rows: [{ scheduleId: 0 }], key: null, writes: 0 };
    const load = callback(file, 'fetchDailySchedules', {
      currentUserId: 7, selectedMemberId: 'all', selectedDate: '2026-10-07',
      dailyRequests: createLatestRequest(), getTypeStorageMap: () => ({}), console: quietConsole,
      fetch: () => { const pending = deferred(); requests.push(pending); return pending.promise; },
      setSchedules: value => { state.rows = typeof value === 'function' ? value(state.rows) : value; state.writes++; },
      setDailyLoadedKey: key => { state.key = key; state.writes++; },
    });
    const first = load('2026-10-07');
    const second = load('2026-10-08');
    assert.equal(state.writes, 0, '응답을 기다리는 동안 기존 상태를 바꾸지 않습니다.');
    requests[1].resolve({ ok: true, json: async () => [{ scheduleId: 2, name: '최신 약', time: '09:00' }] });
    await second;
    requests[0].resolve({ ok: true, json: async () => [{ scheduleId: 1, name: '이전 약', time: '09:00' }] });
    await first;
    assert.equal(state.rows[0].scheduleId, 2);
    assert.equal(state.key, expectedKey);
  });

  test(`${label}: 조회 실패도 현재 날짜 로딩을 끝냄`, async () => {
    const { createLatestRequest } = await import(pathToFileURL(sourcePath('src/utils/latestRequest.js')));
    const state = { rows: [{ scheduleId: 1 }], key: null };
    const load = callback(file, 'fetchDailySchedules', {
      currentUserId: 7, selectedMemberId: 'all', selectedDate: '2026-10-08',
      dailyRequests: createLatestRequest(), getTypeStorageMap: () => ({}), console: quietConsole,
      fetch: async () => { throw new Error('오프라인'); },
      setSchedules: rows => { state.rows = rows; }, setDailyLoadedKey: key => { state.key = key; },
    });
    await load('2026-10-08');
    assert.equal(state.rows.length, 0);
    assert.equal(state.key, expectedKey);
  });
}

test('캘린더: 같은 날짜의 백그라운드 조회 실패는 표시 중인 복약 상태를 보존', async () => {
  const { createLatestRequest } = await import(pathToFileURL(sourcePath('src/utils/latestRequest.js')));
  const state = { rows: [{ scheduleId: 1, takenAt: '2026-10-08T09:00' }], key: null };
  const load = callback('src/calendarpage/CalendarPage.jsx', 'fetchDailySchedules', {
    currentUserId: 7, dailyRequests: createLatestRequest(), console: quietConsole,
    fetch: async () => ({ ok: false }), setSchedules: rows => { state.rows = rows; },
    setDailyLoadedKey: key => { state.key = key; },
  });
  await load('2026-10-08', true);
  assert.ok(state.rows[0].takenAt);
  assert.equal(state.key, '7|2026-10-08');
});

test('마이페이지: 미설정 알림값과 부모에서 바뀐 설정을 안전하게 표시', () => {
  const text = source('src/features/mypage/MyPage.jsx');
  const start = text.indexOf('  const pushEnabled = ');
  const end = text.indexOf(';', start) + 1;
  const display = (user, pushOverride) => vm.runInNewContext(`(() => { ${text.slice(start, end)} return pushEnabled; })()`, { user, pushOverride });
  assert.equal(display({}, null), true);
  assert.equal(display({ pushEnabled: false }, { source: true, value: true }), false);
  assert.equal(display({ pushEnabled: true }, { source: true, value: false }), false);
});

test('전역 알람: 다른 사용자와 알림 비활성화 상태에서는 이전 알람이 표시되지 않음', () => {
  const text = source('src/App.jsx');
  const start = text.indexOf('  const globalAlertItem = ');
  const end = text.indexOf(';', start) + 1;
  const originalSession = {};
  const pendingGlobalAlertItem = { userId: 1, scheduleIds: [10], session: originalSession };
  const display = (alertSession, medicationAlertsEnabled, isLoggedIn = true) => vm.runInNewContext(`(() => { ${text.slice(start, end)} return globalAlertItem; })()`, { alertSession, medicationAlertsEnabled, isLoggedIn, pendingGlobalAlertItem });
  assert.equal(display({}, true), null, '사용자나 알림 설정을 바꾼 뒤에는 이전 알람을 다시 열지 않습니다.');
  assert.equal(display(originalSession, false), null);
  assert.equal(display(originalSession, true, false), null);
  assert.equal(display(originalSession, true), pendingGlobalAlertItem);
});

test('식사 시간 폼: 열릴 때 평일/주말 값과 빈 시간의 기본값을 준비', () => {
  const text = source('src/features/main/components/MealTimeSettingModal.jsx');
  const prefix = text.slice(text.indexOf('const FALLBACK_DEFAULT_WEEKDAY'), text.indexOf('export default function'));
  const start = text.indexOf('function MealTimeForm(');
  const end = text.indexOf('  const currentTimes = ', start);
  const setup = text.slice(start, end) + '  return { weekdayTimes, weekendTimes, sameAsWeekday, activeTab }; }';
  const form = vm.runInNewContext(`(() => { ${prefix} ${setup} return MealTimeForm; })()`, { useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}], useRef: initial => ({ current: initial }) });
  const state = form({ mealSchedule: { weekday: { breakfast: '' }, weekend: { breakfast: '10:00' } } });
  assert.equal(state.weekdayTimes.breakfast, '07:30');
  assert.equal(state.weekendTimes.breakfast, '10:00');
  assert.equal(state.sameAsWeekday, false);
  assert.equal(state.activeTab, 'WEEKDAY');
});

test('약품 검색: 검색어를 비운 뒤 늦게 도착한 응답이 결과를 다시 열지 않음', async () => {
  const text = source('src/hooks/useMedicationSearch.js').replace(/^import .*;\n/gm, '').replace('export function useMedicationSearch', 'function useMedicationSearch');
  const slots = [];
  const effects = [];
  const timers = [];
  const pending = deferred();
  let index = 0;
  let signal;
  const hooks = {
    useState(initial) {
      const slot = slots[index++] ||= { value: typeof initial === 'function' ? initial() : initial };
      return [slot.value, value => { slot.value = typeof value === 'function' ? value(slot.value) : value; }];
    },
    useRef(initial) { return (slots[index++] ||= { value: { current: initial } }).value; },
    useCallback(callback) { index++; return callback; },
    useEffect(effect, dependencies) {
      const slot = slots[index++] ||= {};
      if (!slot.dependencies || !dependencies.every((value, i) => Object.is(value, slot.dependencies[i]))) {
        effects.push(() => { slot.cleanup?.(); slot.cleanup = effect(); });
        slot.dependencies = dependencies;
      }
    },
  };
  const hook = vm.runInNewContext(`(() => { ${text} return useMedicationSearch; })()`, {
    ...hooks, AbortController, console: quietConsole,
    document: { addEventListener() {}, removeEventListener() {} },
    setTimeout: action => { timers.push(action); return timers.length; }, clearTimeout() {},
    fetch: (_url, options) => { signal = options.signal; return pending.promise; },
  });
  const render = () => { index = 0; const result = hook(); while (effects.length) effects.shift()(); return result; };
  let state = render();
  state.handleInputChange('테스트약');
  state = render();
  const request = timers.shift()();
  state.clearSearch();
  state = render();
  assert.equal(signal.aborted, true);
  pending.resolve({ ok: true, json: async () => [{ medicationId: 1, itemName: '테스트약' }] });
  await request;
  state = render();
  assert.equal(state.searchText, '');
  assert.equal(state.searchResults.length, 0);
  assert.equal(state.isDropdownOpen, false);
  assert.equal(state.isSearching, false);
});

test('식사 시간 저장: 실패하면 입력을 보존하고 잠금을 해제하며 성공한 뒤 닫음', async () => {
  const text = source('src/features/main/components/MealTimeSettingModal.jsx');
  const start = text.indexOf('  const handleSubmit = ');
  const end = text.indexOf('\n  };', start) + '\n  };'.length;
  const pending = deferred();
  const weekdayTimes = { breakfast: '08:00', lunch: '13:00', dinner: '19:00', bedtime: '23:00' };
  const state = { saving: false, error: '', closed: 0, calls: 0, submitted: null };
  const saveLock = { current: false };
  let succeeds = false;
  const scope = {
    weekdayTimes, weekendTimes: weekdayTimes, sameAsWeekday: true, saveLock,
    setIsSaving: value => { state.saving = value; }, setSaveError: error => { state.error = error; },
    onClose: () => { state.closed++; },
    onSave: async value => { state.calls++; state.submitted = value; if (!succeeds) await pending.promise; },
  };
  const submit = vm.runInNewContext(`(() => { ${text.slice(start, end)} return handleSubmit; })()`, scope);
  const event = { preventDefault() {} };
  const first = submit(event);
  await submit(event);
  assert.equal(state.calls, 1);
  assert.equal(state.saving, true);
  assert.equal(state.closed, 0);
  pending.reject(new Error('서버 저장 실패'));
  await first;
  assert.equal(state.error, '서버 저장 실패');
  assert.equal(state.closed, 0);
  assert.equal(state.saving, false);
  assert.equal(saveLock.current, false);
  assert.equal(weekdayTimes.breakfast, '08:00');
  succeeds = true;
  await submit(event);
  assert.equal(state.calls, 2);
  assert.equal(state.error, '');
  assert.equal(state.closed, 1);
  assert.equal(state.saving, false);
  assert.equal(saveLock.current, false);
});
