export function groupMedications(items) {
  const groups = new Map()
  for (const item of items) {
    const key = item.medicationId ? 'med:' + item.medicationId : 'registration:' + item.registrationId
    if (!groups.has(key)) groups.set(key, { ...item, key, registrations: [] })
    groups.get(key).registrations.push(item)
  }
  return [...groups.values()]
}
