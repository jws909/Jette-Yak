/**
 * 생년월일로 화면의 읽기 방식을 선택
 * 의료 판단이나 주의정보를 숨기는 필터와는 별개이며, 날짜가 불명확하면 기본 보기 유지
 */
export function deriveReadingProfile(birthdate, now = new Date()) {
  const standard = { age: null, mode: 'standard', isChild: false, isSenior: false, isEasyRead: false }
  if (typeof birthdate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(birthdate)
      || !(now instanceof Date) || !Number.isFinite(now.getTime())) return standard

  // JS Date는 2월 30일을 3월 날짜로 바꾸므로 실제 연·월·일을 직접 검증
  const [year, month, day] = birthdate.split('-').map(Number)
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const monthLengths = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > monthLengths[month - 1]) return standard

  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  const currentDay = now.getDate()
  if (year > currentYear || year === currentYear && (month > currentMonth || month === currentMonth && day > currentDay)) return standard

  // 생일이 아직 지나지 않았으면 한 살을 빼서 만 나이 계산
  const beforeBirthday = currentMonth < month || currentMonth === month && currentDay < day
  const age = currentYear - year - Number(beforeBirthday)
  const mode = age < 13 ? 'child' : age >= 65 ? 'senior' : 'standard'
  return { age, mode, isChild: mode === 'child', isSenior: mode === 'senior', isEasyRead: mode !== 'standard' }
}
