/* 가족 리포트는 같은 이름의 약도 소유자·처방전별로 구분하고 누락된 의료정보를 만들지 않음. */
const dayMilliseconds = 24 * 60 * 60 * 1000
const present = value => typeof value === 'string' && value.trim() ? value.trim() : null
const ownerId = item => String(item.userId ?? item.user_id ?? '')
const prescriptionId = item => String(item.prescriptionId ?? item.prescription_id ?? '')

function dateValue(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/u.exec(String(value ?? ''))
  if (!match) return null
  const [, year, month, day] = match
  const stamp = Date.UTC(Number(year), Number(month) - 1, Number(day))
  const date = new Date(stamp)
  return date.getUTCFullYear() === Number(year) && date.getUTCMonth() === Number(month) - 1
    && date.getUTCDate() === Number(day) ? stamp : null
}
const formattedDate = stamp => stamp == null ? null : new Date(stamp).toISOString().slice(0, 10).replaceAll('-', '.')

export function buildFamilyMedicationReport({ schedules, prescriptions, targetDate, familyMembers = [], includeOwner = false, slotFromTime }) {
  const groups = new Map()
  for (const item of schedules) {
    const key = [ownerId(item), item.type, prescriptionId(item), item.medicationId || item.name].join('|')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  }
  const result = { prescriptions: [], regulars: [], supplements: [] }
  for (const doses of groups.values()) {
    const item = doses[0]
    const member = familyMembers.find(member => String(member.userId) === ownerId(item))
    const name = includeOwner && member?.name ? `${item.name} (${member.name})` : item.name
    const todayDoses = doses.map(dose => ({
      time: String(dose.time || '').substring(0, 5),
      slot: dose.slotLabel || slotFromTime(dose.time).slotLabel,
      taken: Boolean(dose.takenAt),
    }))
    if (item.type === 'prescription') {
      const id = prescriptionId(item)
      const ownPrescriptions = prescriptions.filter(p => !ownerId(item) || ownerId(p) === ownerId(item))
      const nameMatches = id ? [] : ownPrescriptions.filter(p =>
        (p.items || p.medications || []).some(med => med.name === item.name || med.itemName === item.name))
      const data = id ? ownPrescriptions.find(p => prescriptionId(p) === id)
        : nameMatches.length === 1 ? nameMatches[0] : null
      const start = dateValue(data?.dispensedDate || data?.startDate || data?.start_date || data?.prescribedDate)
      const rawDays = Number(data?.totalDays ?? data?.total_days)
      const totalDays = Number.isInteger(rawDays) && rawDays > 0 ? rawDays : null
      const selected = dateValue(targetDate)
      const elapsedDays = start != null && selected != null
        ? Math.max(0, Math.min(totalDays ?? Infinity, Math.floor((selected - start) / dayMilliseconds) + 1)) : null
      result.prescriptions.push({
        name,
        hospital: [present(data?.hospitalName || data?.hospital_name), present(data?.doctorName || data?.doctor_name)].filter(Boolean).join(' · ') || '의료기관 정보 없음',
        startDate: formattedDate(start),
        endDate: formattedDate(start != null && totalDays != null ? start + (totalDays - 1) * dayMilliseconds : null),
        totalDays, elapsedDays, todayDoses,
      })
    } else if (item.type === 'regular') {
      result.regulars.push({ name, memo: item.memo || '정기 상시 복용', todayDoses })
    } else if (item.type === 'supplement') {
      result.supplements.push({ name, memo: item.memo || '건강기능식품 보충', todayDoses })
    }
  }
  return result
}
