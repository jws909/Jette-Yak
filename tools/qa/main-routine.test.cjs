const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const frontend = process.env.JETTE_QA_FRONTEND_ROOT || path.resolve(__dirname, '../../frontend');
const hookPath = process.env.JETTE_QA_MAIN_HOOK || path.join(frontend, 'src/features/main/hooks/useMainPageData.js');

// 실제 훅과 순수 유틸을 실행하되 React 렌더, 요청, 브라우저 이벤트만 메모리에서 대신합니다.
async function fixture(options = {}) {
  const utils = await import(pathToFileURL(path.join(frontend, 'src/features/main/utils/mainPageUtils.js')));
  const slots = [];
  const calendarRequests = [];
  const listeners = new Map();
  const events = [];
  const alerts = [];
  const saves = [];
  const mealSaves = [];
  const cacheWrites = [];
  let index = 0;
  let dirty = false;
  let runningEffect = false;
  let synchronousEffectUpdates = 0;
  let effects = [];
  let output;
  let props = { user: { userId: 1 }, date: new Date(2026, 9, 7), selectedRxId: 'all', ...options.props };
  const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, idx) => Object.is(value, b[idx]));
  const slot = () => slots[index++] ||= {};
  const hooks = {
    useState(initial) {
      const state = slot();
      if (!state.initialized) {
        state.initialized = true;
        state.value = typeof initial === 'function' ? initial() : initial;
        state.set = (update) => {
          if (runningEffect) synchronousEffectUpdates++;
          const next = typeof update === 'function' ? update(state.value) : update;
          if (!Object.is(next, state.value)) { state.value = next; dirty = true; }
        };
      }
      return [state.value, state.set];
    },
    useRef(initial) {
      const state = slot();
      if (!state.value) state.value = { current: initial };
      return state.value;
    },
    useMemo(compute, dependencies) {
      const state = slot();
      if (!sameDeps(state.dependencies, dependencies)) {
        state.dependencies = dependencies;
        state.value = compute();
      }
      return state.value;
    },
    useCallback(callback, dependencies) { return hooks.useMemo(() => callback, dependencies); },
    useEffect(callback, dependencies) {
      const state = slot();
      if (!sameDeps(state.dependencies, dependencies)) {
        state.dependencies = dependencies;
        effects.push(() => {
          state.cleanup?.();
          state.cleanup = callback();
        });
      }
    },
  };
  const prescriptions = options.prescriptions || [prescription(10, 100), prescription(20, 200)];
  const source = fs.readFileSync(hookPath, 'utf8')
    .replace(/^import[\s\S]*?;\r?\n/gm, '')
    .replace('export function useMainPageData', 'function useMainPageData');
  const useMainPageData = vm.runInNewContext(`${source}\nuseMainPageData`, {
    ...utils,
    ...hooks,
    Date,
    console: { warn() {} },
    localStorage: { getItem() { return null; }, setItem(key, value) { cacheWrites.push({ key, value }); } },
    useDialog: () => ({ showAlert: (message, title) => alerts.push({ message, title }) }),
    alert: (message) => alerts.push({ message }),
    saveIntakeStatus: async (values) => { saves.push(values); await options.save?.(values); },
    fetch: async (url, init = {}) => {
      if (url.startsWith('/api/users/meal-times')) {
        if (init.method !== 'POST') return { ok: false };
        mealSaves.push(init);
        return options.mealSave ? options.mealSave(init) : { ok: true, json: async () => ({ success: true }) };
      }
      if (url.startsWith('/api/prescriptions/list')) return { ok: true, json: async () => ({ prescriptions }) };
      if (!url.startsWith('/api/calendar?')) throw new Error(`Unexpected request ${url}`);
      return new Promise((resolve) => calendarRequests.push({ url, resolve, settled: false }));
    },
    CustomEvent: class { constructor(type, details) { this.type = type; this.detail = details.detail; } },
    window: {
      addEventListener: (name, callback) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(callback); },
      removeEventListener: (name, callback) => listeners.get(name)?.delete(callback),
      dispatchEvent: (event) => { events.push(event); for (const callback of listeners.get(event.type) || []) callback(event); },
    },
  });
  const render = (nextProps = {}) => {
    props = { ...props, ...nextProps };
    index = 0;
    dirty = false;
    effects = [];
    output = useMainPageData(props.user, props.date, props.selectedRxId);
    runningEffect = true;
    try { for (const effect of effects) effect(); } finally { runningEffect = false; }
    return output;
  };
  const flush = async () => {
    for (let count = 0; count < 15; count++) {
      await Promise.resolve();
      if (dirty) render();
    }
  };
  const respond = async (request, schedules) => {
    assert.ok(request, 'calendar request exists');
    request.settled = true;
    request.resolve({ ok: true, json: async () => schedules });
    await flush();
  };
  const latest = (date) => calendarRequests.findLast((request) => !request.settled && (!date || request.url.includes(`date=${date}`)));
  const externalChange = () => {
    for (const listener of listeners.get('jette-intake-updated') || []) listener({ detail: { userId: 1 } });
  };
  render();
  await flush();
  return {
    get output() { return output; },
    get synchronousEffectUpdates() { return synchronousEffectUpdates; },
    calendarRequests, events, alerts, saves, mealSaves, cacheWrites, render, flush, respond, latest, externalChange,
  };
}

function prescription(prescriptionId, medicationId) {
  return {
    prescriptionId, dispensedDate: '2026-10-01', totalDays: 30,
    items: [{ itemId: medicationId, medicationId, itemName: '동일한 약 이름', dailyFrequency: 1, usageTiming: '아침 식후' }],
  };
}
function schedule(prescriptionId, medicationId, takenAt = null) {
  return { prescriptionId, medicationId, scheduleId: medicationId + 1000, name: '동일한 약 이름', slot: 'breakfast', time: '07:30', takenAt };
}

test('익명 초기 렌더: 기본값과 빈 루틴을 effect의 동기 상태 변경 없이 제공', async () => {
  const view = await fixture({ props: { user: null } });
  assert.equal(view.output.hasPrescription, false);
  assert.equal(view.output.activeRoutineList.length, 0);
  assert.equal(view.output.mealTimes.breakfast, '07:30');
  assert.equal(view.calendarRequests.length, 0);
  assert.equal(view.synchronousEffectUpdates, 0);
});

test('날짜 전환: 이전 날짜의 복용 표시와 일정 ID를 새 날짜에 섞지 않음', async () => {
  const view = await fixture();
  await view.respond(view.latest('2026-10-07'), [schedule(10, 100, '2026-10-07T08:00:00'), schedule(20, 200)]);
  assert.equal(view.output.activeRoutineList[0].taken, true);
  view.render({ date: new Date(2026, 9, 8) });
  assert.equal(view.output.activeRoutineList[0].taken, false);
  assert.equal(view.output.activeRoutineList[0].scheduleId, undefined);
  await view.respond(view.latest('2026-10-08'), [schedule(10, 100), schedule(20, 200)]);
  assert.equal(view.output.activeRoutineList[0].taken, false);
  assert.equal(view.synchronousEffectUpdates, 0);
});

test('같은 약 이름의 다른 처방전: 각각의 일정 ID와 복용 표시를 매칭', async () => {
  const view = await fixture();
  await view.respond(view.latest(), [schedule(10, 100, '2026-10-07T08:00:00'), schedule(20, 200)]);
  const first = view.output.activeRoutineList.find((item) => item.prescriptionId === 10);
  const second = view.output.activeRoutineList.find((item) => item.prescriptionId === 20);
  assert.equal(first.scheduleId, 1100);
  assert.equal(first.taken, true);
  assert.equal(second.scheduleId, 1200);
  assert.equal(second.taken, false);
  view.render({ selectedRxId: 20 });
  assert.equal(view.output.activeRoutineList.length, 1);
  assert.equal(view.output.activeRoutineList[0].taken, false);
  assert.equal(view.output.activeRoutineList[0].scheduleId, undefined);
  await view.respond(view.latest(), [schedule(10, 100, '2026-10-07T08:00:00'), schedule(20, 200)]);
  assert.equal(view.output.activeRoutineList[0].scheduleId, 1200);
  assert.equal(view.output.activeRoutineList[0].taken, false);
});

test('늦은 이전 날짜 응답: 현재 날짜 화면을 덮지 않음', async () => {
  const view = await fixture();
  const previousDay = view.latest();
  view.render({ date: new Date(2026, 9, 8) });
  const currentDay = view.latest();
  await view.respond(currentDay, [schedule(10, 100), schedule(20, 200)]);
  await view.respond(previousDay, [schedule(10, 100, '2026-10-07T08:00:00'), schedule(20, 200)]);
  assert.equal(view.output.activeRoutineList[0].taken, false);
});

test('늦은 이전 선택 처방전 응답: 새 선택의 복용 표시를 덮지 않음', async () => {
  const view = await fixture({ props: { selectedRxId: 10 } });
  const previousSelection = view.latest();
  view.render({ selectedRxId: 20 });
  await view.respond(view.latest(), [schedule(10, 100, '2026-10-07T08:00:00'), schedule(20, 200)]);
  await view.respond(previousSelection, [schedule(10, 100, '2026-10-07T08:00:00'), schedule(20, 200, '2026-10-07T08:01:00')]);
  assert.equal(view.output.activeRoutineList.length, 1);
  assert.equal(view.output.activeRoutineList[0].prescriptionId, 20);
  assert.equal(view.output.activeRoutineList[0].taken, false);
});

test('같은 날짜의 응답 역전: 나중에 요청한 최신 결과를 유지', async () => {
  const view = await fixture();
  const oldRequest = view.latest();
  view.externalChange();
  const newRequest = view.latest();
  assert.notEqual(oldRequest, newRequest);
  await view.respond(newRequest, [schedule(10, 100, '2026-10-07T08:00:00'), schedule(20, 200)]);
  await view.respond(oldRequest, [schedule(10, 100), schedule(20, 200)]);
  assert.equal(view.output.activeRoutineList[0].taken, true);
});

test('저장 중 날짜 변경: 완료한 체크와 후속 조회가 원래 날짜에만 반영', async () => {
  let finish;
  const view = await fixture({ save: () => new Promise((resolve) => { finish = resolve; }) });
  await view.respond(view.latest(), [schedule(10, 100), schedule(20, 200)]);
  const saving = view.output.toggleRoutine(view.output.activeRoutineList[0].id);
  view.render({ date: new Date(2026, 9, 8) });
  finish();
  await saving;
  await view.flush();
  assert.equal(view.saves[0].date, '2026-10-07');
  assert.equal(view.output.activeRoutineList[0].taken, false);
  assert.equal(view.events[0].detail.date, '2026-10-07');
  await view.respond(view.latest('2026-10-07'), [schedule(10, 100, '2026-10-07T08:00:00'), schedule(20, 200)]);
  assert.equal(view.output.activeRoutineList[0].taken, false);
  view.render({ date: new Date(2026, 9, 7) });
  assert.equal(view.output.activeRoutineList[0].taken, true);
});

test('복용 저장 실패: 기존 복용 표시를 유지하고 오류 안내', async () => {
  const view = await fixture({ save: async () => { throw new Error('저장 실패'); } });
  await view.respond(view.latest(), [schedule(10, 100), schedule(20, 200)]);
  await view.output.toggleRoutine(view.output.activeRoutineList[0].id);
  await view.flush();
  assert.equal(view.output.activeRoutineList[0].taken, false);
  assert.equal(view.alerts[0].message, '저장 실패');
  assert.equal(view.events.length, 0);
});

test('봉지 체크 성공: 해당 봉지의 약만 변경하고 원래 날짜로 재조회', async () => {
  const view = await fixture();
  await view.respond(view.latest(), [schedule(10, 100), schedule(20, 200)]);
  const items = view.output.activeRoutineList.filter((item) => item.prescriptionId === 10);
  await view.output.togglePouch({ items });
  await view.flush();
  assert.equal(view.saves[0].scheduleIds.length, 1);
  assert.equal(view.saves[0].scheduleIds[0], 1100);
  assert.equal(view.saves[0].date, '2026-10-07');
  assert.equal(view.output.activeRoutineList.find((item) => item.prescriptionId === 10).taken, true);
  assert.equal(view.output.activeRoutineList.find((item) => item.prescriptionId === 20).taken, false);
  assert.equal(view.events[0].detail.origin, 'main');
  assert.ok(view.latest('2026-10-07'));
});

test('식사 시간 변경: 루틴 시간을 즉시 계산하고 해당 날짜의 복용 표시를 유지', async () => {
  const view = await fixture();
  await view.respond(view.latest(), [schedule(10, 100, '2026-10-07T08:00:00'), schedule(20, 200)]);
  await view.output.handleSaveMealTimes({ breakfast: '08:15', lunch: '12:00', dinner: '18:30', bedtime: '22:00' });
  await view.flush();
  assert.equal(view.output.mealTimes.breakfast, '08:15');
  assert.equal(view.output.activeRoutineList[0].time, '08:45');
  assert.equal(view.output.activeRoutineList[0].taken, true);
  assert.equal(view.synchronousEffectUpdates, 0);
});

test('식사 시간 HTTP 실패: 부모 상태와 캐시를 보존하고 서버 오류 전달', async () => {
  const view = await fixture({ mealSave: async () => ({ ok: false, json: async () => ({ success: false, message: '저장 권한이 없습니다.' }) }) });
  const before = view.output.mealSchedule;
  await assert.rejects(view.output.handleSaveMealTimes({ breakfast: '08:15' }), /저장 권한이 없습니다/);
  await view.flush();
  assert.equal(view.output.mealSchedule, before);
  assert.equal(view.output.mealTimes.breakfast, '07:30');
  assert.equal(view.cacheWrites.length, 0);
  assert.equal(view.alerts.length, 0);
});

test('식사 시간 네트워크 실패: 부모 상태와 캐시를 보존하고 호출자에게 오류 전달', async () => {
  const view = await fixture({ mealSave: async () => { throw new TypeError('Failed to fetch'); } });
  const before = view.output.mealSchedule;
  await assert.rejects(view.output.handleSaveMealTimes({ breakfast: '08:15' }), /서버에 연결하지 못했습니다/);
  await view.flush();
  assert.equal(view.output.mealSchedule, before);
  assert.equal(view.cacheWrites.length, 0);
  assert.equal(view.alerts.length, 0);
});

test('식사 시간 success=false 응답: HTTP 성공이어도 상태와 캐시를 보존', async () => {
  const view = await fixture({ mealSave: async () => ({ ok: true, json: async () => ({ success: false }) }) });
  const before = view.output.mealSchedule;
  await assert.rejects(view.output.handleSaveMealTimes({ breakfast: '08:15' }), /식사 시간을 저장하지 못했습니다/);
  await view.flush();
  assert.equal(view.output.mealSchedule, before);
  assert.equal(view.cacheWrites.length, 0);
});

test('식사 시간 저장 성공: 응답 확인 전에는 상태를 보존하고 확인 후 평일·주말과 캐시 갱신', async () => {
  let finish;
  const view = await fixture({ mealSave: () => new Promise((resolve) => { finish = resolve; }) });
  const before = view.output.mealSchedule;
  const weekday = { breakfast: '08:15', lunch: '12:15', dinner: '18:45', bedtime: '22:30' };
  const weekend = { breakfast: '09:15', lunch: '13:15', dinner: '19:15', bedtime: '23:30' };
  const saving = view.output.handleSaveMealTimes({ weekday, weekend });
  await view.flush();
  assert.equal(view.output.mealSchedule, before);
  assert.equal(view.cacheWrites.length, 0);
  finish({ ok: true, json: async () => ({ success: true }) });
  await saving;
  await view.flush();
  assert.equal(view.output.mealSchedule.weekday.breakfast, weekday.breakfast);
  assert.equal(view.output.mealSchedule.weekend.bedtime, weekend.bedtime);
  assert.equal(view.cacheWrites.length, 2);
  assert.equal(JSON.parse(view.cacheWrites.find((entry) => entry.key === 'jette_meal_schedule_1').value).weekend.bedtime, weekend.bedtime);
  assert.equal(JSON.parse(view.cacheWrites.find((entry) => entry.key === 'jette_meal_times_1').value).breakfast, weekday.breakfast);
  assert.equal(JSON.parse(view.mealSaves[0].body).weekday.breakfastTime, weekday.breakfast);
});
