/** 역할: DUR 병용 기록이나 중복 성분 조합이 하나라도 있는지 판별 */
export function hasInteractionWarnings(data){
  return Boolean(data?.pairs?.length||data?.duplicates?.length)
}
