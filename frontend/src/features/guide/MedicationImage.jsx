/**
 * 파일 역할: 의약품 이미지 URL이 있을 때만 접근 가능한 대체 텍스트와 함께 이미지를 표시합니다.
 * 핵심 규칙: 이미지가 없는 제품은 빈 이미지 영역을 만들지 않습니다.
 */
export default function MedicationImage({ url, name }) {
  return url && /^https?:\/\//i.test(url) ? <img className="medication-thumbnail" src={url} alt={name+' 제품 사진'} loading="lazy" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true }} /> : null
}
