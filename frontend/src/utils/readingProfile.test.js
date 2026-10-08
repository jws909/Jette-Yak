import test from 'node:test'
import assert from 'node:assert/strict'
import { deriveReadingProfile } from './readingProfile.js'

const today = new Date(2026, 9, 6, 12)

test('어린이 보기의 만 13세 경계는 생일 당일부터 기본 보기로 변경', () => {
  assert.equal(deriveReadingProfile('2013-10-07', today).mode, 'child')
  assert.equal(deriveReadingProfile('2013-10-06', today).mode, 'standard')
  assert.equal(deriveReadingProfile('2013-10-06', today).age, 13)
})

test('어르신 보기의 만 65세 경계는 생일 당일부터 변경', () => {
  assert.equal(deriveReadingProfile('1961-10-07', today).mode, 'standard')
  assert.equal(deriveReadingProfile('1961-10-06', today).mode, 'senior')
  assert.equal(deriveReadingProfile('1961-10-06', today).age, 65)
})

test('누락·잘못된 날짜·미래 날짜는 나이를 추측하지 않음', () => {
  for (const value of [null, undefined, '', '2026-99-99', '2025-02-29', '2026-04-31', '2026-10-07', '0000-01-01', '2012-2-1', '2012-02-01T00:00:00Z']) {
    const profile = deriveReadingProfile(value, today)
    assert.equal(profile.mode, 'standard', String(value))
    assert.equal(profile.age, null, String(value))
    assert.equal(profile.isEasyRead, false, String(value))
  }
  assert.equal(deriveReadingProfile('2012-02-01', new Date('invalid')).age, null)
})

test('윤년을 검증하고 2월 29일 생일은 실제 날짜로 만 나이 계산', () => {
  assert.equal(deriveReadingProfile('2012-02-29', new Date(2025, 1, 28)).age, 12)
  assert.equal(deriveReadingProfile('2012-02-29', new Date(2025, 2, 1)).age, 13)
  assert.equal(deriveReadingProfile('1900-02-29', today).age, null)
  assert.equal(deriveReadingProfile('2000-02-29', today).age, 26)
})

test('연도가 바뀌어도 생일 전까지 같은 만 나이 유지', () => {
  assert.equal(deriveReadingProfile('1961-12-31', new Date(2026, 0, 1)).age, 64)
  const profile = deriveReadingProfile('2026-10-06', today)
  assert.equal(profile.age, 0)
  assert.equal(profile.isChild, true)
})
