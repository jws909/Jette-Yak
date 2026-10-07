import test from 'node:test'
import assert from 'node:assert/strict'
import { buildFamilyMedicationReport } from './familyReport.js'

const build = values => buildFamilyMedicationReport({ targetDate: '2026-10-07', prescriptions: [], slotFromTime: () => ({ slotLabel: '아침' }), ...values })

test('가족의 같은 이름 약은 소유자와 처방전을 구분하고 복용 표시를 섞지 않음', () => {
  const result = build({
    includeOwner: true, familyMembers: [{ userId: 1, name: '가족 A' }, { userId: 2, name: '가족 B' }],
    schedules: [
      { userId: 1, prescriptionId: 10, type: 'prescription', name: '동일한 약', time: '08:00', takenAt: '2026-10-07' },
      { userId: 2, prescriptionId: 20, type: 'prescription', name: '동일한 약', time: '10:00', takenAt: null },
    ],
    prescriptions: [{ userId: 1, prescriptionId: 10, hospitalName: '의료기관 A', dispensedDate: '2026-10-01', totalDays: 10 }, { userId: 2, prescriptionId: 20, hospitalName: '의료기관 B', dispensedDate: '2026-10-07', totalDays: 3 }],
  })
  assert.equal(result.prescriptions.length, 2)
  assert.equal(result.prescriptions[0].name, '동일한 약 (가족 A)')
  assert.equal(result.prescriptions[0].hospital, '의료기관 A')
  assert.deepEqual(result.prescriptions.map(p => p.todayDoses.map(d => d.taken)), [[true], [false]])
  assert.deepEqual(result.prescriptions.map(p => p.elapsedDays), [7, 1])
})

test('연결할 처방전이 없으면 다른 처방전이나 임의의 의료정보로 대체하지 않음', () => {
  const [result] = build({ schedules: [{ userId: 1, prescriptionId: 99, type: 'prescription', name: '약' }], prescriptions: [{ userId: 1, prescriptionId: 10, hospitalName: '관계없는 병원', totalDays: 180 }] }).prescriptions
  assert.equal(result.hospital, '의료기관 정보 없음')
  assert.equal(result.totalDays, null)
  assert.equal(result.startDate, null)
  assert.equal(result.endDate, null)
  assert.equal(result.elapsedDays, null)
})

test('서버의 dispensedDate를 사용하고 투약일수 및 달 경계를 정확하게 계산', () => {
  const [result] = build({ schedules: [{ prescriptionId: 10, type: 'prescription', name: '약' }], prescriptions: [{ prescriptionId: 10, dispensedDate: '2026-09-30', totalDays: 8 }] }).prescriptions
  assert.equal(result.startDate, '2026.09.30')
  assert.equal(result.endDate, '2026.10.07')
  assert.equal(result.elapsedDays, 8)
})

test('잘못된 날짜와 투약일수를 정상적인 복용기간으로 표시하지 않음', () => {
  const [result] = build({ schedules: [{ prescriptionId: 10, type: 'prescription', name: '약' }], prescriptions: [{ prescriptionId: 10, dispensedDate: '2026-02-30', totalDays: -1 }] }).prescriptions
  assert.equal(result.startDate, null)
  assert.equal(result.endDate, null)
  assert.equal(result.totalDays, null)
})

test('상시약과 영양제의 동명 제품도 서로 합치지 않음', () => {
  const result = build({ schedules: [{ userId: 1, type: 'regular', name: '같은 이름', time: '08:00' }, { userId: 1, type: 'supplement', name: '같은 이름', time: '09:00' }] })
  assert.equal(result.regulars.length, 1)
  assert.equal(result.supplements.length, 1)
  assert.equal(result.regulars[0].todayDoses[0].time, '08:00')
  assert.equal(result.supplements[0].todayDoses[0].time, '09:00')
})

test('같은 약을 포함한 여러 처방전이 있어도 정확한 처방전 ID로 연결', () => {
  const [result] = build({
    schedules: [{ userId: 1, prescriptionId: 20, type: 'prescription', name: '같은 약' }],
    prescriptions: [
      { userId: 1, prescriptionId: 10, hospitalName: '의료기관 A', items: [{ name: '같은 약' }] },
      { userId: 1, prescriptionId: 20, hospitalName: '의료기관 B', items: [{ name: '같은 약' }] },
    ],
  }).prescriptions
  assert.equal(result.hospital, '의료기관 B')
})

test('처방전 ID가 없고 동명 약 후보가 여러 개거나 없으면 의료정보를 붙이지 않음', () => {
  const schedules = [{ userId: 1, type: 'prescription', name: '같은 약' }]
  const prescriptions = [
    { userId: 1, prescriptionId: 10, hospitalName: '의료기관 A', dispensedDate: '2026-10-01', totalDays: 10, items: [{ name: '같은 약' }] },
    { userId: 1, prescriptionId: 20, hospitalName: '의료기관 B', dispensedDate: '2026-10-02', totalDays: 20, items: [{ name: '같은 약' }] },
  ]
  for (const candidates of [prescriptions, []]) {
    const [result] = build({ schedules, prescriptions: candidates }).prescriptions
    assert.equal(result.hospital, '의료기관 정보 없음')
    assert.equal(result.startDate, null)
    assert.equal(result.totalDays, null)
  }
})

test('처방전 ID가 없을 때는 같은 소유자의 유일한 약 이름 후보만 연결', () => {
  const [result] = build({
    schedules: [{ userId: 1, type: 'prescription', name: '같은 약' }],
    prescriptions: [
      { userId: 2, prescriptionId: 20, hospitalName: '다른 가족 의료기관', items: [{ name: '같은 약' }] },
      { userId: 1, prescriptionId: 10, hospitalName: '대상 가족 의료기관', items: [{ name: '같은 약' }] },
    ],
  }).prescriptions
  assert.equal(result.hospital, '대상 가족 의료기관')
})
