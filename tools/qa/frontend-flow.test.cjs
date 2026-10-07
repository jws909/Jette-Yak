const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { pathToFileURL } = require('node:url')
const root = path.resolve(__dirname, '../../frontend')

// 실제 컴포넌트의 이벤트 함수를 실행하되 요청·상태·다이얼로그·이벤트는 가짜로 연결.
function handler(file, name, scope) {
  const source = fs.readFileSync(path.join(root, file), 'utf8')
  const declaration = new RegExp(`^( +)const ${name} = `, 'm').exec(source)
  const start = declaration?.index ?? -1
  const endToken = `\n${declaration?.[1]}};`
  const end = source.indexOf(endToken, start)
  assert.ok(start >= 0 && end > start, `${name} source exists`)
  return vm.runInNewContext(`(function () { ${source.slice(start, end + endToken.length)}; return ${name}; })()`, scope)
}

function fixture(overrides = {}) {
  const state = { rows: [{ id: 1, scheduleId: 1, taken: false, takenAt: null }], globalAlertItem: { scheduleIds: [1], date: '2026-10-06' }, notifications: [{ id: 'saved-1', saved: true, notificationId: 1, read: false }] }
  const events = []
  const alerts = []
  const update = key => value => { state[key] = typeof value === 'function' ? value(state[key]) : value }
  const scope = {
    currentUserId: 1, alertSession: {}, serverPushActiveRef: { current: false }, user: { userId: 1 }, selectedDate: '2026-10-07', targetDate: new Date(2026, 9, 7),
    routineItems: state.rows, intakeLock: { current: false }, readLock: { current: false }, confirmedRead: { current: new Set() },
    intakeGate: { active: false, acquire() { if (this.active) return false; this.active = true; return true }, release() { this.active = false } },
    notifications: state.notifications, globalAlertItem: state.globalAlertItem,
    setSchedules: update('rows'), setRoutineItems: update('rows'), setGlobalAlertItem: update('globalAlertItem'),
    setGlobalAlertSaving: update('saving'), setGlobalAlertError: update('error'), setAppFeedback: update('feedback'),
    setNotifications: update('notifications'), setNotificationDialog: update('dialog'), setShowNotification: update('notificationOpen'),
    fetchDailySchedules() {}, fetchMonthSummary() {}, syncRoutinesWithServer() {},
    showAlert: (message, title) => alerts.push({ message, title }), alert: message => alerts.push({ message }),
    window: { dispatchEvent: event => events.push(event) }, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail } },
    formatDateToHyphen: () => '2026-10-07', getFormattedDate: () => '2026-10-07',
    ...overrides,
  }
  return { scope, state, events, alerts }
}

const actions = [
  ['캘린더 개별', 'src/calendarpage/CalendarPage.jsx', 'toggleTaken', { scheduleId: 1, takenAt: null }],
  ['캘린더 봉지', 'src/calendarpage/CalendarPage.jsx', 'togglePouchTaken', { items: [{ scheduleId: 1, takenAt: null }, { scheduleId: 2, takenAt: null }] }],
  ['가족 개별', 'src/features/family/FamilyPage.jsx', 'toggleTaken', { scheduleId: 1, takenAt: null }],
  ['메인 개별', 'src/features/main/hooks/useMainPageData.js', 'toggleRoutine', 1],
  ['메인 봉지', 'src/features/main/hooks/useMainPageData.js', 'togglePouch', { items: [{ id: 1, scheduleId: 1, taken: false }] }],
]
for (const [label, file, name, argument] of actions) {
  test(`${label}: HTTP 실패 때 기존 복용 표시를 보존하고 다이얼로그만 표시`, async () => {
    const { saveIntakeStatus } = await import(pathToFileURL(path.join(root, 'src/utils/intakeApi.js')))
    const context = fixture({ saveIntakeStatus: values => saveIntakeStatus({ ...values, fetchImpl: async () => ({ ok: false, json: async () => ({ message: '저장 실패' }) }) }) })
    const before = JSON.stringify(context.state.rows)
    await handler(file, name, context.scope)(argument)
    assert.equal(JSON.stringify(context.state.rows), before)
    assert.equal(context.alerts[0].message, '저장 실패')
    assert.equal(context.events.length, 0)
    assert.equal(context.scope.intakeLock.current, false)
  })
  test(`${label}: 성공하면 복용 표시·변경 이벤트를 반영하고 중복 실행을 방지`, async () => {
    let finish
    let calls = 0
    const context = fixture({ saveIntakeStatus: async () => { calls++; await new Promise(resolve => { finish = resolve }) } })
    const action = handler(file, name, context.scope)
    const saving = action(argument)
    await action(argument)
    assert.equal(calls, 1)
    assert.equal(context.events.length, 0)
    finish()
    await saving
    assert.ok(context.state.rows[0].takenAt)
    assert.equal(context.events[0].type, 'jette-intake-updated')
    assert.equal(context.events[0].detail.date, '2026-10-07')
    assert.equal(context.scope.intakeLock.current, false)
  })
}

test('전역 알람: 실패하면 모달을 유지하고 로딩을 해제하며 성공하면 원래 복약 날짜로 갱신', async () => {
  const context = fixture({ saveIntakeStatus: async () => { throw new Error('저장 실패') } })
  await handler('src/App.jsx', 'handleConfirmTakeFromGlobalAlert', context.scope)()
  assert.ok(context.state.globalAlertItem)
  assert.equal(context.state.error, '저장 실패')
  assert.equal(context.state.saving, false)
  assert.equal(context.events.length, 0)
  context.scope.saveIntakeStatus = async values => assert.equal(values.date, '2026-10-06')
  await handler('src/App.jsx', 'handleConfirmTakeFromGlobalAlert', context.scope)()
  assert.equal(context.state.globalAlertItem, null)
  assert.equal(context.events[0].detail.date, '2026-10-06')
  assert.equal(context.state.saving, false)
})

test('체험 로그인 실패: 사용자 상태를 만들지 않고 커스텀 오류 안내', async () => {
  let loggedIn = false
  const context = fixture({ fetch: async () => ({ ok: false, json: async () => ({ message: '체험 로그인 실패' }) }), handleLoginSuccess: () => { loggedIn = true } })
  await handler('src/App.jsx', 'handleLoginDemoToggle', context.scope)()
  assert.equal(loggedIn, false)
  assert.equal(context.state.feedback, '체험 로그인 실패')
})

test('알림 전체 읽음 실패: 읽지 않음 상태를 보존하고 오류 다이얼로그', async () => {
  const context = fixture({ fetch: async () => ({ ok: false }) })
  await handler('src/components/layout/Navbar.jsx', 'markAllAsRead', context.scope)()
  assert.equal(context.state.notifications[0].read, false)
  assert.ok(context.state.dialog.text.includes('저장하지 못했습니다'))
  assert.equal(context.scope.readLock.current, false)
})

test('알림 개별 읽음 성공: DB 저장 뒤 읽음 표시·모달 표시·재조회 보호', async () => {
  const context = fixture({ fetch: async () => ({ ok: true }) })
  await handler('src/components/layout/Navbar.jsx', 'markAsRead', context.scope)(context.state.notifications[0])
  assert.equal(context.state.notifications[0].read, true)
  assert.equal(context.state.dialog.id, 'saved-1')
  assert.ok(context.scope.confirmedRead.current.has('saved-1'))
})

test('실시간 복약 알림: 날짜가 없는 이벤트도 오늘 날짜로 표시하고 중복 알림은 추가하지 않음', async () => {
  const { localNotificationDate, parseDateToMs } = await import(pathToFileURL(path.join(root, 'src/utils/notificationTime.js')))
  const context = fixture({ localNotificationDate, parseDateToMs, setNotificationNow() {} })
  const receive = handler('src/components/layout/Navbar.jsx', 'handleNewDoseAlarm', context.scope)
  const event = { detail: { name: '확인용 약', time: '13:00', isPreAlarm: false } }
  receive(event)
  receive(event)
  const expectedDate = localNotificationDate()
  const notifications = context.state.notifications.filter(item => item.id.startsWith('realtime-dose-'))
  assert.equal(notifications.length, 1)
  assert.equal(notifications[0].id, `realtime-dose-main-${expectedDate}-13:00`)
  assert.equal(notifications[0].timestamp, parseDateToMs(`${expectedDate}T13:00:00`))
  assert.equal(notifications[0].userId, 1)
})

test('실시간 복약 알림: 전달된 복약 날짜와 30분 전 구분을 그대로 유지', async () => {
  const { localNotificationDate, parseDateToMs } = await import(pathToFileURL(path.join(root, 'src/utils/notificationTime.js')))
  const context = fixture({ localNotificationDate, parseDateToMs, setNotificationNow() {} })
  handler('src/components/layout/Navbar.jsx', 'handleNewDoseAlarm', context.scope)({ detail: {
    date: '2026-10-08', name: '확인용 약', time: '00:10', isPreAlarm: true,
  } })
  assert.equal(context.state.notifications[0].id, 'realtime-dose-pre-2026-10-08-00:10')
  assert.match(context.state.notifications[0].title, /30분 전/)
  assert.equal(context.state.notifications[0].timestamp, parseDateToMs('2026-10-08T00:10:00'))
})

test('닉네임 저장 네트워크 실패: 입력 모달을 유지하고 저장 버튼 잠금을 해제', async () => {
  const context = fixture()
  Object.assign(context.scope, {
    nicknameDraft: '새 닉네임', profileSaveLock: { current: false },
    setIsNicknameSaving: value => { context.state.saving = value }, setIsNicknameModalOpen: value => { context.state.modalOpen = value },
    setProfileMessage: value => { context.state.error = value }, updateProfile: async () => { throw new Error('network') },
  })
  context.state.modalOpen = true
  await handler('src/features/mypage/MyPage.jsx', 'handleNicknameSave', context.scope)({ preventDefault() {} })
  assert.equal(context.state.modalOpen, true)
  assert.equal(context.state.saving, false)
  assert.ok(context.state.error.includes('다시 시도'))
  assert.equal(context.scope.profileSaveLock.current, false)
})

test('가족 리포트: 실제 목록 경로와 객체 응답을 사용하고 가족별 처방을 모두 취합', async () => {
  const { buildFamilyMedicationReport } = await import(pathToFileURL(path.join(root, 'src/features/family/familyReport.js')))
  const urls = []
  const context = fixture()
  Object.assign(context.scope, {
    selectedMemberId: 'all', familyMembers: [{ userId: 1, name: 'A' }, { userId: 2, name: 'B' }],
    schedules: [{ userId: 1, prescriptionId: 1, type: 'prescription', name: '약A' }, { userId: 2, prescriptionId: 2, type: 'prescription', name: '약B' }],
    setIsReportOpen: value => { context.state.modalOpen = value }, setIsReportLoading: value => { context.state.loading = value },
    setReportData: value => { context.state.report = value }, setReportError: value => { context.state.error = value },
    fetch: async url => { urls.push(url); const userId = new URL(url, 'http://localhost').searchParams.get('userId'); return { ok: true, json: async () => ({ prescriptions: [{ userId, prescriptionId: userId, hospitalName: '의료기관 ' + userId, dispensedDate: '2026-10-01', totalDays: 10 }] }) } },
    buildFamilyMedicationReport, getSlotFromTime: () => ({ slotLabel: '아침' }), getRoleLabel: () => '',
  })
  await handler('src/features/family/FamilyPage.jsx', 'handleOpenReportModal', context.scope)()
  assert.equal(urls.length, 2)
  assert.ok(urls.every(url => url.startsWith('/api/prescriptions/list?')))
  assert.equal(context.state.report.prescriptions.length, 2)
  assert.equal(context.state.report.prescriptions[1].hospital, '의료기관 2')
  assert.equal(context.state.loading, false)
})

test('자정 전 30분 알림은 다음 날 일정을 읽고 다음 날 날짜를 전달', async () => {
  const FixedDate = class extends Date { constructor(...args) { super(...(args.length ? args : ['2026-10-07T23:45:00'])) } }
  const urls = []
  const context = fixture({
    Date: FixedDate, isActive: true, alertedTags: new Set(),
    getFormattedDate: date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
    fetch: async url => { urls.push(url); return { ok: true, json: async () => [{ scheduleId: 1, name: url.includes('2026-10-08') ? '내일 약' : '오늘 약', time: '00:15', takenAt: null, alarmEnabled: true }] } },
  })
  await handler('src/App.jsx', 'triggerCheck', context.scope)()
  assert.equal(urls.length, 2)
  assert.ok(urls[1].includes('date=2026-10-08'))
  assert.equal(context.events[0].detail.name, '내일 약')
  assert.equal(context.events[0].detail.date, '2026-10-08')
})

test('같은 시각의 정시 알림을 다음 날에도 다시 표시', async () => {
  let clock = '2026-10-07T08:00:00'
  const FixedDate = class extends Date { constructor(...args) { super(...(args.length ? args : [clock])) } }
  const context = fixture({
    Date: FixedDate, isActive: true, alertedTags: new Set(),
    getFormattedDate: date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
    fetch: async () => ({ ok: true, json: async () => [{ scheduleId: 1, name: '매일 약', time: '08:00', takenAt: null, alarmEnabled: true }] }),
  })
  const check = handler('src/App.jsx', 'triggerCheck', context.scope)
  await check()
  clock = '2026-10-08T08:00:00'
  await check()
  assert.deepEqual(context.events.map(event => event.detail.date), ['2026-10-07', '2026-10-08'])
})

