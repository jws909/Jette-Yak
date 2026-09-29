export function groupMedications(items) {
  const groups = new Map()
  for (const item of items) {
    const key = item.medicationId ? 'med:' + item.medicationId : 'registration:' + item.registrationId
    if (!groups.has(key)) groups.set(key, { ...item, key, registrations: [] })
    groups.get(key).registrations.push(item)
  }
  return [...groups.values()]
}

export function activeMedicationRegistrations(items) {
  return items.filter(item => item.useStatus === 'ACTIVE'
    && item.periodState !== 'ENDED'
    && item.periodState !== 'UPCOMING')
}
