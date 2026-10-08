const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { pathToFileURL } = require('node:url')
const root = path.resolve(__dirname, '../../frontend')

function callback(file, name, scope) {
  const source = fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')
  const declaration = new RegExp(`^( *)const ${name} = useCallback\\(`, 'm').exec(source)
  assert.ok(declaration)
  const start = declaration.index + declaration[0].length
  const end = source.indexOf(`\n${declaration[1]}}, [`, start)
  assert.ok(end > start)
  return vm.runInNewContext(`(${source.slice(start, end + declaration[1].length + 2)})`, scope)
}

// 실제 등록 이벤트 함수에 가짜 API·화면 상태를 주입. 실사용자 데이터에는 접근하지 않음.
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
  const state = { busy: false, name: '비타민C', cleared: false, refreshed: 0 }
  const events = [], alerts = [], calls = []
  const scope = {
    currentUserId: 7, username: '로그인ID와 다른 표시이름',
    customSupplementName: '비타민C', registrationLock: { current: false },
    setIsRegistering: value => { state.busy = value },
    setCustomSupplementName: value => { state.name = value },
    clearSearch: () => { state.cleared = true },
    onSuccess: async () => { state.refreshed++ },
    addEverydayMed: async payload => { calls.push(payload); return { success: true } },
    showAlert: (message, title) => alerts.push({ message, title }),
    window: { dispatchEvent: event => events.push(event) },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail } },
    console: { error() {} },
    ...overrides,
  }
  return { scope, state, events, alerts, calls }
}

const actions = [
  ['상비약', 'src/features/medication/components/CabinetTab.jsx', 'handleAddCabinetMed', { medicationId: '123', itemName: '검사용 상비약' }, 'CABINET'],
  ['영양제', 'src/features/medication/components/SupplementTab.jsx', 'handleAddCustomSupplement', undefined, 'ROUTINE'],
]
for (const [label, file, name, argument, type] of actions) {
  test(`${label}: 표시 이름 대신 대상자 번호만 전송하고 저장 뒤 목록 갱신`, async () => {
    const context = fixture({ currentUserId: 12 })
    await handler(file, name, context.scope)(argument)
    assert.equal(context.calls.length, 1)
    assert.equal(context.calls[0].userId, 12)
    assert.equal(context.calls[0].type, type)
    assert.equal(Object.hasOwn(context.calls[0], 'username'), false)
    assert.equal(context.state.refreshed, 1)
    assert.equal(context.events[0].type, 'jette-intake-updated')
    assert.equal(context.events[0].detail.userId, 12)
    assert.equal(context.state.busy, false)
  })

  test(`${label}: 등록 응답 대기 중 중복 클릭·Enter를 차단하고 목록 갱신까지 대기`, async () => {
    let finish, refresh
    let count = 0
    const context = fixture({
      addEverydayMed: async () => { count++; await new Promise(resolve => { finish = resolve }) },
      onSuccess: async () => { await new Promise(resolve => { refresh = resolve }) },
    })
    const action = handler(file, name, context.scope)
    const pending = action(argument)
    assert.equal(context.state.busy, true)
    await action(argument)
    assert.equal(count, 1)
    finish()
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(context.state.busy, true)
    assert.equal(context.events.length, 0)
    refresh()
    await pending
    assert.equal(context.state.busy, false)
    assert.equal(context.scope.registrationLock.current, false)
    assert.equal(context.events.length, 1)
  })

  test(`${label}: 실패 시 입력·목록을 보존하고 오류 안내 후 재시도 가능`, async () => {
    const context = fixture({ addEverydayMed: async () => { throw new Error('권한을 확인해 주세요.') } })
    const action = handler(file, name, context.scope)
    await action(argument)
    assert.equal(context.alerts[0].message, '권한을 확인해 주세요.')
    assert.equal(context.state.name, '비타민C')
    assert.equal(context.state.cleared, false)
    assert.equal(context.state.refreshed, 0)
    assert.equal(context.events.length, 0)
    assert.equal(context.state.busy, false)
    context.scope.addEverydayMed = async () => ({ success: true })
    await action(argument)
    assert.equal(context.events.length, 1)
  })

  test(`${label}: 비로그인 시 API 요청을 보내지 않음`, async () => {
    const context = fixture({ currentUserId: null })
    await handler(file, name, context.scope)(argument)
    assert.equal(context.calls.length, 0)
    assert.match(context.alerts[0].message, /로그인/)
  })
}

test('영양제: 공백 이름은 API 요청 없이 안내', async () => {
  const context = fixture({ customSupplementName: '  ' })
  await handler(actions[1][1], actions[1][2], context.scope)()
  assert.equal(context.calls.length, 0)
  assert.match(context.alerts[0].message, /이름/)
})

// HTTP 200만 보고 성공 처리하지 않고 서버가 등록을 확인했는지 함께 검사.
for (const [status, data, message] of [
  [401, null, /로그인이 만료/],
  [403, null, /권한/],
  [500, null, /등록을 확인하지 못/],
  [400, { message: '의약품을 선택해주세요.' }, /의약품을 선택/],
  [200, { success: false, message: '저장하지 못했어요.' }, /저장하지 못/],
  [200, null, /등록을 확인하지 못/],
]) {
  test(`등록 API: ${status} 응답과 잘못된 JSON에서 성공 안내를 차단`, async () => {
    const { addEverydayMed } = await import(pathToFileURL(path.join(root, 'src/features/medication/medicationApi.js')))
    const originalFetch = global.fetch
    global.fetch = async () => ({ status, ok: status < 400, json: async () => { if (data === null) throw new SyntaxError('HTML response'); return data } })
    try { await assert.rejects(addEverydayMed({ userId: 7, type: 'ROUTINE', name: '비타민C' }), message) }
    finally { global.fetch = originalFetch }
  })
}

test('등록 API: 서버의 등록 성공 응답을 반환', async () => {
  const { addEverydayMed } = await import(pathToFileURL(path.join(root, 'src/features/medication/medicationApi.js')))
  const originalFetch = global.fetch
  const body = { userId: 7, type: 'CABINET', medicationId: '123' }
  global.fetch = async (url, request) => {
    assert.equal(url, '/api/users/everyday-meds')
    assert.deepEqual(JSON.parse(request.body), body)
    return { status: 200, ok: true, json: async () => ({ success: true }) }
  }
  try { assert.equal((await addEverydayMed(body)).success, true) }
  finally { global.fetch = originalFetch }
})

for (const [label, name, requestName, apiName, setterName] of [
  ['처방전', 'fetchPrescriptionList', 'prescriptionRequests', 'fetchPrescriptions', 'setPrescriptionSnapshot'],
  ['상비약·영양제', 'fetchEverydayMedsList', 'everydayRequests', 'fetchEverydayMeds', 'setEverydayMeds'],
]) {
  test(`${label}: 늦은 이전 응답과 화면 종료 뒤 응답이 현재 목록을 덮지 않음`, async () => {
    const { createLatestRequest } = await import(pathToFileURL(path.join(root, 'src/utils/latestRequest.js')))
    const requests = [], updates = []
    const gate = createLatestRequest()
    const load = callback('src/features/medication/MedicationRegisterPage.jsx', name, {
      effectiveUserId: 7, [requestName]: gate,
      [apiName]: async userId => {
        assert.equal(userId, 7)
        return new Promise(resolve => requests.push(resolve))
      },
      [setterName]: value => updates.push(JSON.parse(JSON.stringify(value))),
      console: { warn() {} },
    })
    const first = load(), second = load()
    requests[1]([{ id: 2 }])
    await second
    requests[0]([{ id: 1 }])
    await first
    assert.equal(updates.length, 1)
    assert.equal((updates[0].items || updates[0])[0].id, 2)
    const third = load()
    gate.cancel()
    requests[2]([{ id: 3 }])
    await third
    assert.equal(updates.length, 1)
  })
}
