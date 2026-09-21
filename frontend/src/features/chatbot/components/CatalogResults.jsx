const types = { 1: '임부금기', 2: '노인금기', 3: '특정연령대금기', 4: '병용금기' }
const fields = [['materialName','성분'],['efficacy','효능·효과'],['usageDosage','용법·용량'],['className','분류'],['etcOtcCode','전문·일반'],['ediCode','EDI 코드'],['updatedAt','자료 수정일']]
export function DurRecord({ record }) {
  return <article className="chat-dur-record"><strong>{types[record.tabooType] || 'DUR'} · {record.ingrAName}{Number(record.tabooType) === 4 && record.ingrBName ? ' + ' + record.ingrBName : ''}</strong>
    {Number(record.tabooType) === 1 && <p>등급: {record.grade || '등록 정보 없음'}</p>}
    {Number(record.tabooType) === 3 && <p>연령 기준: {record.ageBase || '등록 정보 없음'}</p>}
    <p>{record.tabooEffect || '금기 설명이 등록되지 않았습니다.'}</p>
    {record.updatedAt && <small>자료 수정일: {record.updatedAt}</small>}
  </article>
}
export function DurReports({ reports, notice }) {
  if (!reports?.length) return null
  return <section className="chat-dur-reports"><p className="scope-note">{notice}</p>{reports.map((report,index) =>
    <details key={index} open><summary>{report.label} · {report.total}건</summary>
      {!report.total && <p>해당 조건으로 연결된 DUR 기록이 없습니다.</p>}
      {report.items.map((record,i) => <DurRecord key={i} record={record} />)}
      {report.total > report.items.length && <p>총 {report.total}건 중 {report.items.length}건을 표시합니다. 조건 검색으로 범위를 좁혀주세요.</p>}
      {report.unmatchedIngredients?.length > 0 && <p className="scope-note">DUR 기록 미연결 성분: {report.unmatchedIngredients.join(', ')}</p>}
    </details>)}</section>
}
export default function CatalogResults({ data, onMore, onSelect, busy }) {
  if (!data) return null
  return <section className="chat-catalog-results" aria-label="DB 조건 검색 결과">
    <p className="scope-note">{data.query.filters.map(f => f.value).join(' · ') || '전체'}{data.query.tabooType ? ' · ' + types[data.query.tabooType] : ''}{data.query.grade ? ' · ' + data.query.grade : ''}{data.query.ageBase ? ' · ' + data.query.ageBase : ''}</p>
    <p><strong>총 {data.total}건</strong> · {data.items.length}건 표시</p><p className="scope-note">{data.notice}</p>
    {!data.items.length && <p>일치하는 기록이 없습니다. 영문 성분명 또는 더 짧은 검색어로 다시 조회해보세요.</p>}
    {data.kind === 'DUR' ? data.items.map((record,i) => <DurRecord key={i} record={record} />)
      : data.items.map(item => <article key={item.itemSeq} className="chat-catalog-product">
        <strong>{item.itemName}</strong><p>{item.entpName || '업체 정보 없음'} · 품목코드 {item.itemSeq}</p>
        <p>저장된 허가 상태: {Number(item.isDiscontinued) === 1 ? '중단·취소로 분류' : item.isDiscontinued == null ? '등록 정보 없음' : '정상으로 분류'}</p>
        <button type="button" className="load-more" disabled={busy} onClick={() => onSelect(item)}>이 약으로 질문하기</button>
        <details><summary>약 정보 원문</summary><dl>{fields.map(([key,label]) => <div key={key}><dt>{label}</dt><dd>{item[key] || '등록 정보 없음'}</dd></div>)}</dl></details>
        {item.durEvidence?.map((record,i) => <DurRecord key={i} record={record} />)}
        {item.durEvidenceTotal > item.durEvidence?.length && <p>금기 {item.durEvidenceTotal}건 중 {item.durEvidence.length}건 표시 · 이 약을 선택해 DUR을 질문하면 더 확인할 수 있어요.</p>}
      </article>)}
    {data.hasMore && <button type="button" className="load-more" disabled={busy} onClick={onMore}>결과 더 보기 ({data.items.length}/{data.total})</button>}
  </section>
}
