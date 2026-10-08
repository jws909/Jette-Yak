import test from 'node:test'
import assert from 'node:assert/strict'
import { collectMedicationWarnings, warningSignature } from './medicationWarnings.js'

test('주의기록 없는 약은 제외하고, 원문과 연령·임신 기록은 모두 보존', () => {
  const records = [{ tabooType: 1, tabooEffect: '원문' }, { tabooType: 3, ageBase: '12세 미만' }]
  const items = [{ medicationId: 1, itemName: '약 A' }, { medicationId: 2 }, { medicationId: null }]
  const warnings = collectMedicationWarnings(items, { '1': { data: { dur: { items: records } } }, '2': { data: { dur: { items: [] } } } })
  assert.equal(warnings.length, 1)
  assert.equal(warnings[0].itemName, '약 A')
  assert.deepEqual(warnings[0].records, records)
})

test('자료 순서가 달라도 반복 알림 방지, 원문 변경과 약 조합 변경은 새 알림', () => {
  const warnings = [{ medicationId: 2, records: [{ tabooEffect: '주의 B' }] }, { medicationId: 1, records: [{ tabooEffect: '주의 A' }] }]
  const signature = warningSignature(warnings, {})
  assert.equal(signature, warningSignature([...warnings].reverse(), {}))
  assert.notEqual(signature, warningSignature([{ medicationId: 1, records: [{ tabooEffect: '새 주의' }] }], {}))
  assert.notEqual(signature, warningSignature(warnings, { duplicates: [{ left: '약 A', right: '약 B' }] }))
})
