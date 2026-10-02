export function hasInteractionWarnings(data){
  return Boolean(data?.pairs?.length||data?.duplicates?.length)
}
