import test from 'node:test'
import assert from 'node:assert/strict'
import { createIntakeGate, saveIntakeStatus } from './intakeApi.js'

test('요청 잠금은 완료 전 두 번째 실행을 막고 완료 뒤 다시 허용', () => {
  const gate = createIntakeGate()
  assert.equal(gate.acquire(), true)
  assert.equal(gate.acquire(), false)
  gate.release()
  assert.equal(gate.acquire(), true)
})

test('HTTP 실패를 저장 완료로 처리하지 않고 서버 메시지를 전달', async () => {
  await assert.rejects(saveIntakeStatus({ scheduleIds: [1], taken: true, date: '2026-10-07', fetchImpl: async () => ({ ok: false, json: async () => ({ message: '저장 실패' }) }) }), /저장 실패/)
})
test('복약 저장 네트워크 실패를 호출한 화면에 전달', async () => {
  await assert.rejects(saveIntakeStatus({ scheduleIds: [1], taken: true, date: '2026-10-07', fetchImpl: async () => { throw new Error('연결 실패') } }), /연결 실패/)
})
test('빈 일정은 저장 완료로 처리하지 않고 요청도 보내지 않음', async () => {
  let requested = false
  await assert.rejects(saveIntakeStatus({ scheduleIds: [], taken: true, fetchImpl: async () => { requested = true } }), /다시 불러온/)
  assert.equal(requested, false)
})
test('여러 일정은 중복을 제거하고 선택한 복약 날짜를 함께 저장', async () => {
  const calls = []
  await saveIntakeStatus({ scheduleIds: [1, 1, 2], taken: false, date: '2026-10-06', fetchImpl: async (url, options) => { calls.push({ url, ...options }); return { ok: true } } })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, '/api/calendar/toggle-batch')
  assert.deepEqual(JSON.parse(calls[0].body), { scheduleIds: [1, 2], taken: false, date: '2026-10-06' })
})
