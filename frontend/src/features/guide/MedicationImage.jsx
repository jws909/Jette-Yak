export default function MedicationImage({ url, name }) {
  return url && /^https?:\/\//i.test(url) ? <img className="medication-thumbnail" src={url} alt={name+' 제품 사진'} loading="lazy" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true }} /> : <span className="medication-image-empty">제품 사진 미등록</span>
}
