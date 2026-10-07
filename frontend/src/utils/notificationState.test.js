import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeNotificationItems } from './notificationState.js'

test('30초 조회가 실시간 복약 알림을 지우지 않음', () => {
  const realtime = { id: 'realtime-dose-main-08:00', read: false }
  assert.deepEqual(mergeNotificationItems([realtime], [{ id: 'saved-1', saved: true, read: false }]).map(item => item.id), [realtime.id, 'saved-1'])
})
test('성공한 읽음 처리는 이미 진행 중이던 오래된 조회 응답에도 유지', () => {
  const [item] = mergeNotificationItems([], [{ id: 'saved-1', saved: true, read: false }], new Set(['saved-1']))
  assert.equal(item.read, true)
})
test('사라진 초대를 이전 목록에서 복구하지 않고 일반 알림의 읽음은 유지', () => {
  const items = mergeNotificationItems([{ id: 'invitation-1', read: false }, { id: 'today', read: true }], [{ id: 'today', read: false }])
  assert.deepEqual(items, [{ id: 'today', read: true }])
})

test('사용자가 바뀌면 이전 사용자의 실시간 알림을 남기지 않음', () => {
  const previous = [{ id: 'realtime-dose-main-08:00', userId: 1, read: false }]
  assert.deepEqual(mergeNotificationItems(previous, [], new Set(), 2), [])
})
