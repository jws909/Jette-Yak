import test from 'node:test'
import assert from 'node:assert/strict'
import { formatDateTime24, formatTime24 } from './dateTime.js'

test('자정·정오·오후·하루 마지막 시각을 24시간제로 구분', () => {
  for (const time of ['00:00', '01:05', '12:00', '13:05', '23:59']) {
    assert.equal(formatTime24(`${time}:42`), time)
    assert.equal(formatDateTime24(`2026-10-07 ${time}:42`), `2026-10-07 ${time}`)
  }
  assert.equal(formatTime24('1:05'), '01:05')
})

test('시간대 없는 서버 응답은 이미 변환된 시각으로 취급해 중복 보정 방지', () => {
  assert.equal(formatDateTime24('2026-10-07 13:05:30'), '2026-10-07 13:05')
  assert.equal(formatDateTime24('2026-10-07T13:05:30'), '2026-10-07 13:05')
  assert.equal(formatDateTime24(formatDateTime24('2026-10-07 13:05:30')), '2026-10-07 13:05')
})

test('UTC·오프셋 시각은 브라우저 지역과 무관하게 한국 시각으로 변환', () => {
  assert.equal(formatDateTime24('2026-10-07T04:05:30Z'), '2026-10-07 13:05')
  assert.equal(formatTime24('2026-10-07T04:05:30+00:00'), '13:05')
  assert.equal(formatDateTime24('2026-10-07T13:05:30+09:00'), '2026-10-07 13:05')
  assert.equal(formatDateTime24(new Date('2026-10-07T04:05:30Z')), '2026-10-07 13:05')
})

test('한국 시각으로 날짜가 바뀌는 자정을 24시 대신 00시로 표시', () => {
  assert.equal(formatDateTime24('2026-10-07T15:00:00Z'), '2026-10-08 00:00')
  assert.equal(formatDateTime24('2026-10-07T14:59:59Z', { includeSeconds: true }), '2026-10-07 23:59:59')
})

test('날짜만 있는 자료에 임의 시각을 붙이지 않고 기존 날짜 구분자 지원', () => {
  assert.equal(formatDateTime24('2026-10-07'), '2026-10-07')
  assert.equal(formatTime24('2026-10-07'), '')
  assert.equal(formatDateTime24('2026-10-07 13:05', { dateSeparator: '.' }), '2026.10.07 13:05')
})

test('빈 값·잘못된 날짜·범위를 벗어난 시각을 정상 시간처럼 표시하지 않음', () => {
  for (const value of [null, undefined, '', 'invalid', '24:00', '13:60', '23:59:60',
    '2026-02-30 13:00', '2026-10-07 25:00', '2026-13-01 00:00', new Date(NaN)]) {
    assert.equal(formatDateTime24(value), '')
    assert.equal(formatTime24(value), '')
  }
})
