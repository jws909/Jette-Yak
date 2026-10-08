const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../../frontend');
const stage = process.env.JETTE_QA_STAGE;
const sourcePath = file => stage && fs.existsSync(path.join(stage, file)) ? path.join(stage, file) : path.join(root, file);
const { parse } = require(require.resolve('@babel/parser', { paths: [root] }));
const functionCache = new Map();

// 실제 JSX 함수만 추출해 상태·요청을 연결합니다. 컴포넌트 로직을 복제하지 않습니다.
function functionSource(file, name) {
  if (!functionCache.has(file)) {
    const source = fs.readFileSync(sourcePath(file), 'utf8');
    const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
    const functions = new Map();
    const visit = node => {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'FunctionDeclaration') functions.set(node.id.name, source.slice(node.start, node.end));
      if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.init?.type === 'ArrowFunctionExpression') {
        functions.set(node.id.name, source.slice(node.init.start, node.init.end));
      }
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === 'object') visit(value);
      }
    };
    visit(ast);
    functionCache.set(file, functions);
  }
  const source = functionCache.get(file).get(name);
  assert.ok(source, `${file}: ${name} 함수가 존재합니다.`);
  return source;
}

const pages = [
  { label: '캘린더', file: 'src/calendarpage/CalendarPage.jsx', open: 'openAlarmModal', save: 'saveAlarmSetting' },
  { label: '가족', file: 'src/features/family/FamilyPage.jsx', open: 'handleOpenAlarmModal', save: 'handleSaveAlarm' },
];

test('공용 날짜 선택기: 모바일은 모달 배치, 데스크톱은 화면 경계에 맞춘 팝오버 위치 유지', () => {
  const position = vm.runInNewContext(`(${functionSource('src/components/ui/DatePicker.jsx', 'pickerPosition')})`);
  const rect = { top: 500, bottom: 540, left: 900, width: 240 };
  const mobile = position(rect, { innerWidth: 390, innerHeight: 844, scrollX: 0, scrollY: 0 });
  assert.deepEqual(JSON.parse(JSON.stringify(mobile)), { isMobile: true, top: 0, left: 0, width: 320 });
  const desktop = position(rect, { innerWidth: 1100, innerHeight: 700, scrollX: 0, scrollY: 20 });
  assert.deepEqual(JSON.parse(JSON.stringify(desktop)), { isMobile: false, top: 154, left: 764, width: 320 });
});

async function fixture(page) {
  const { formatTime24 } = await import(pathToFileURL(sourcePath('src/utils/dateTime.js')));
  const state = { hour: '08', minute: '00', newHour: '09', newMinute: '00', isAutoTimeApplied: false, schedules: [{ scheduleId: 3, time: '08:00' }] };
  const requests = [];
  const dailyLoads = [];
  const events = [];
  const alerts = [];
  const scope = vm.createContext({
    ...state, formatTime24, console: { error() {} }, currentUserId: 7,
    selectedDate: '2026-10-07', selectedMemberId: 19, selectedShelfMedId: null,
    activeItem: { scheduleId: 3 }, targetScheduleForAlarm: { scheduleId: 3 }, alarmEnabled: true,
    newMedType: 'regular', selectedMed: { id: 9, name: '등록할 약' }, newMedName: '', repeatDays: 7,
    fetch: async (url, options) => { requests.push({ url, options }); return { ok: true }; },
    fetchDailySchedules: (...args) => { dailyLoads.push(args); }, fetchMonthSummary() {}, fetchEverydayMeds() {},
    showAlert: (message, title) => alerts.push({ message, title }), setTimeout() {},
    window: { dispatchEvent: event => events.push(event) },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
  });
  const setters = {
    setHour: 'hour', setMinute: 'minute', setNewHour: 'newHour', setNewMinute: 'newMinute',
    setIsAutoTimeApplied: 'isAutoTimeApplied', setActiveItem: 'activeItem', setIsAlarmModalOpen: 'alarmModalOpen',
    setTargetScheduleForAlarm: 'targetScheduleForAlarm', setAlarmModalOpen: 'alarmModalOpen', setAlarmEnabled: 'alarmEnabled',
    setSchedules: 'schedules', setSelectedShelfMedId: 'selectedShelfMedId', setSelectedMed: 'selectedMed',
    setNewMedName: 'newMedName', setSearchResults: 'searchResults', setAddedSuccessMsg: 'addedSuccessMsg',
    setRepeatDays: 'repeatDays', setIsAddModalOpen: 'addModalOpen',
  };
  for (const [setter, key] of Object.entries(setters)) {
    scope[setter] = value => {
      state[key] = typeof value === 'function' ? value(state[key]) : value;
      scope[key] = state[key];
    };
  }
  const names = ['normalizeTimePart', 'preventPickerScroll', 'stepHour', 'stepMinute', 'stepPicker', 'handleWheel', 'handleTimeKeyDown', page.open, page.save];
  if (page === pages[0]) names.push('handleSelectShelfMed', 'handleAddMedication');
  for (const name of names) vm.runInContext(`globalThis.${name} = (${functionSource(page.file, name)});`, scope);
  return { scope, state, requests, dailyLoads, events, alerts };
}

for (const page of pages) {
  test(`${page.label}: 자정·정오·13시·23시 저장값을 그대로 불러옴`, async () => {
    const { scope, state } = await fixture(page);
    for (const [stored, expected] of [['00:05', '00:05'], ['12:00', '12:00'], ['13:15', '13:15'], ['23:59', '23:59'], ['08:00:00', '08:00']]) {
      scope[page.open]({ scheduleId: 3, time: stored });
      assert.equal(`${state.hour}:${state.minute}`, expected, stored);
      assert.equal(state.alarmModalOpen, true);
    }
  });

  test(`${page.label}: 시는 23↔00으로 순환하며 정오를 넘어 계속 증가`, async () => {
    const { scope } = await fixture(page);
    assert.equal(scope.stepHour('23', 1), '00');
    assert.equal(scope.stepHour('00', -1), '23');
    assert.equal(scope.stepHour('11', 1), '12');
    assert.equal(scope.stepHour('12', 1), '13');
    assert.equal(scope.stepMinute('59', 1), '00');
    assert.equal(scope.stepMinute('00', -1), '59');
  });

  test(`${page.label}: 버튼·휠·화살표 키가 같은 시간 증감 규칙을 사용`, async () => {
    const { scope, state } = await fixture(page);
    scope.setHour('23');
    scope.stepPicker('hour', 1);
    assert.equal(state.hour, '00');
    scope.handleWheel({ deltaY: 1 }, 'hour');
    assert.equal(state.hour, '23');
    scope.handleWheel({ deltaY: 0 }, 'hour');
    assert.equal(state.hour, '23', '수평 휠은 시간을 바꾸지 않습니다.');
    let prevented = 0;
    const event = { key: 'ArrowUp', preventDefault() { prevented++; } };
    scope.handleTimeKeyDown(event, 'hour');
    assert.equal(state.hour, '00');
    event.key = 'ArrowDown';
    scope.handleTimeKeyDown(event, 'hour');
    assert.equal(state.hour, '23');
    event.key = 'Enter';
    scope.handleTimeKeyDown(event, 'hour');
    assert.equal(state.hour, '23');
    assert.equal(prevented, 2);
  });

  test(`${page.label}: 입력·저장 범위 보정은 자정을 유지하고 빈칸과 범위 초과를 처리`, async () => {
    const { scope, requests } = await fixture(page);
    for (const [value, max, fallback, expected] of [['00', 23, 8, '00'], ['', 23, 0, '00'], ['x', 23, 8, '08'], ['99', 23, 0, '23'], ['99', 59, 0, '59'], ['-1', 23, 0, '00']]) {
      assert.equal(scope.normalizeTimePart(value, max, fallback), expected);
    }
    scope.setHour('99');
    scope.setMinute('99');
    await scope[page.save]();
    assert.equal(new URL(requests[0].url, 'http://localhost').searchParams.get('newTime'), '23:59');
  });

  test(`${page.label}: 알람 저장은 HH:mm과 원래 복약 날짜·구성원 선택을 보존`, async () => {
    for (const time of ['00:05', '12:00', '13:15', '23:59']) {
      const { scope, state, requests, dailyLoads } = await fixture(page);
      scope[page.open]({ scheduleId: 3, time, alarmEnabled: false });
      await scope[page.save]();
      assert.equal(requests.length, 1);
      const url = new URL(requests[0].url, 'http://localhost');
      assert.equal(url.pathname, '/api/calendar/3/alarm');
      assert.equal(url.searchParams.get('newTime'), time);
      assert.equal(url.searchParams.get('date'), '2026-10-07');
      assert.equal(requests[0].options.method, 'POST');
      assert.equal(state.alarmModalOpen, false);
      if (page === pages[1]) {
        assert.equal(url.searchParams.get('alarmEnabled'), 'false');
        assert.deepEqual(dailyLoads, [['2026-10-07', 19]]);
      } else {
        assert.equal(url.searchParams.get('alarmEnabled'), 'true');
        assert.equal(state.schedules[0].time, time);
      }
    }
  });

  test(`${page.label}: 휠 조절 중 배경 스크롤을 막고 모달 종료 시 리스너를 제거`, async () => {
    const { scope } = await fixture(page);
    let listener;
    let prevented = 0;
    let removed = false;
    const node = {
      addEventListener(type, handler, options) { assert.equal(type, 'wheel'); assert.equal(options.passive, false); listener = handler; },
      removeEventListener(type, handler) { assert.equal(type, 'wheel'); removed = handler === listener; },
    };
    const cleanup = scope.preventPickerScroll(node);
    listener({ deltaY: 1, preventDefault() { prevented++; } });
    listener({ deltaY: 0, preventDefault() { prevented++; } });
    assert.equal(prevented, 1);
    cleanup();
    assert.equal(removed, true);
    assert.equal(scope.preventPickerScroll(null), undefined);
  });
}

test('캘린더: 보관함 권장 시간을 24시간으로 적용하고 직접 조절하면 자동 설정 안내를 해제', async () => {
  const { scope, state } = await fixture(pages[0]);
  for (const time of ['00:05', '12:00', '13:15', '23:59']) {
    scope.setSelectedShelfMedId(null);
    scope.handleSelectShelfMed({ id: 5, source: 'CABINET', medicationId: 9, name: '보관함 약', takeTime: time });
    assert.equal(`${state.newHour}:${state.newMinute}`, time);
    assert.equal(state.isAutoTimeApplied, true);
    scope.stepPicker('hour', 1, true);
    assert.equal(state.isAutoTimeApplied, false);
  }
});

test('캘린더: 반복 일정 등록은 HH:mm과 선택 날짜·반복 일수를 그대로 전달', async () => {
  for (const time of ['00:05', '12:00', '13:15', '23:59']) {
    const { scope, requests, dailyLoads, events, alerts } = await fixture(pages[0]);
    const [hour, minute] = time.split(':');
    scope.setNewHour(hour);
    scope.setNewMinute(minute);
    await scope.handleAddMedication({ preventDefault() {} });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, '/api/calendar');
    assert.equal(requests[0].options.method, 'POST');
    const body = JSON.parse(requests[0].options.body);
    assert.equal(body.scheduledTime, time);
    assert.equal(body.scheduledDate, '2026-10-07');
    assert.equal(body.repeatDays, 7);
    assert.equal(body.medicationId, 9);
    assert.deepEqual(dailyLoads, [['2026-10-07', true]]);
    assert.equal(events[0].detail.date, '2026-10-07');
    assert.equal(alerts.length, 0);
  }
});
