/** 역할: 서버와 같은 기준으로 입력 글자 수와 줄여야 할 분량 표시 */
export default function CommunityFieldCount({value,limit,id}){
  const count=String(value||'').trim().length
  return <span id={id} className={'community-field-meta'+(count>limit?' is-invalid':'')}>
    <span>{count>limit?`${count-limit}자 줄여주세요`:`최대 ${limit.toLocaleString()}자`}</span>
    <span>{count.toLocaleString()} / {limit.toLocaleString()}자</span>
  </span>
}
