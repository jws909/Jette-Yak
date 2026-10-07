/**
 * 역할: 커뮤니티 작성·수정 입력과 첨부 선택 화면
 * 입력 규칙: 초과한 글은 임의로 자르지 않고 글자 수 표시. 실제 제출 검증과 요청은 상위 화면에서 처리
 */
import { useEffect } from 'react'
import CommunityFieldCount from './CommunityFieldCount'
import { POST_FIELD_LIMITS } from './communityValidation'

const experienceFields=[['experienceDuration','복용 기간','예: 2주'],['purpose','복용 목적','예: 처방받은 약을 먹은 경험'],['occurrenceTiming','발생 시점','예: 복용 3일 후']]

export default function CommunityPostComposer({editingId,form,onFormChange,categories,medQuery,onMedQueryChange,meds,onSelectMedication,medSearching,medSearchError,imageFiles,documentFiles,existingAttachmentCounts,onChooseFiles,submitting,progress,onClose,onSubmit,formRef}){
  useEffect(()=>{
    const previous=document.activeElement
    formRef.current?.focus()
    return()=>{if(previous?.isConnected)previous.focus?.()}
  },[formRef])
  const update=(field,value)=>onFormChange(previous=>({...previous,[field]:value}))
  const overLimit=field=>String(form[field]||'').trim().length>POST_FIELD_LIMITS[field]
  function handleKeyDown(event){
    if(event.key==='Escape'&&!submitting){event.preventDefault();onClose()}
    if(event.key!=='Tab')return
    // 키보드 이동은 작성창 안에서 유지. 오류 모달이 열리면 공용 모달이 그 안의 포커스를 관리
    const controls=[...event.currentTarget.querySelectorAll('button:not([disabled]),input:not(:disabled),textarea:not(:disabled),select:not(:disabled)')].filter(element=>element.getClientRects().length>0)
    if(!controls.length){event.preventDefault();return}
    const first=controls[0],last=controls[controls.length-1]
    if(event.shiftKey&&(document.activeElement===first||document.activeElement===formRef.current)){event.preventDefault();last.focus()}
    else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===formRef.current)){event.preventDefault();first.focus()}
  }
  return <div className="community-modal" onMouseDown={()=>{if(!submitting)onClose()}}>
    <form ref={formRef} className="community-compose" role="dialog" aria-modal="true" aria-labelledby="community-compose-title" aria-busy={submitting} tabIndex="-1" noValidate onSubmit={onSubmit} onKeyDown={handleKeyDown} onMouseDown={event=>event.stopPropagation()}>
      <header><div><span className="section-meta-tag">약 경험 나누기</span><h2 id="community-compose-title">{editingId?'약 이야기 수정':'약 이야기 작성'}</h2></div><button type="button" aria-label="작성창 닫기" disabled={submitting} onClick={onClose}>×</button></header>
      {/* 저장하는 동안 입력 전체를 잠가 화면 내용과 서버에 전달한 내용이 달라지지 않게 처리 */}
      <fieldset className="community-compose-fields" disabled={submitting}>
        <label>글 유형<select name="category" value={form.category} onChange={event=>update('category',event.target.value)}>{Object.entries(categories).filter(([key])=>key!=='ALL').map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
        <label>약 연결<span className="community-optional">선택</span><input name="medicationName" value={medQuery} onChange={event=>onMedQueryChange(event.target.value)} placeholder="제품명을 검색하세요" aria-describedby="community-medication-help" aria-invalid={overLimit('medicationName')}/></label>
        {medQuery&&<p id="community-medication-help" className={'community-medication-link-state '+(form.medicationId?'linked':'')}>{form.medicationId?'챗봇의 해당 약 화면과 연결됩니다.':'검색 결과에서 제품을 선택해야 챗봇과 연결됩니다.'}</p>}
        {medSearching&&<p className="community-medication-search-status" role="status"><span className="community-spinner" aria-hidden="true"/>약을 찾고 있어요…</p>}
        {medQuery.trim().length>80&&!form.medicationId&&<p className="community-medication-search-status">약 검색은 80자 이내로 적어주세요.</p>}
        {medSearchError&&<p className="community-medication-search-status" role="alert">{medSearchError}</p>}
        {meds.length>0&&<ul className="community-med-results">{meds.map(medication=><li key={medication.medicationId}><button type="button" onClick={()=>onSelectMedication(medication)}><strong>{medication.itemName}</strong><span>{medication.entpName}</span></button></li>)}</ul>}
        <div className="community-form-grid">
          {experienceFields.map(([field,label,placeholder])=><label key={field}>{label}<input name={field} value={form[field]} onChange={event=>update(field,event.target.value)} placeholder={placeholder} aria-invalid={overLimit(field)} aria-describedby={'community-'+field+'-count'}/><CommunityFieldCount id={'community-'+field+'-count'} value={form[field]} limit={POST_FIELD_LIMITS[field]}/></label>)}
          <label>연령대<select name="ageGroup" value={form.ageGroup} onChange={event=>update('ageGroup',event.target.value)}><option value="">선택 안 함</option>{['10대 이하','20대','30대','40대','50대','60대 이상'].map(age=><option key={age}>{age}</option>)}</select></label>
        </div>
        <label>제목<input required name="title" value={form.title} onChange={event=>update('title',event.target.value)} aria-invalid={overLimit('title')} aria-describedby="community-title-count"/><CommunityFieldCount id="community-title-count" value={form.title} limit={POST_FIELD_LIMITS.title}/></label>
        <label>내용<textarea required name="content" rows="8" value={form.content} onChange={event=>update('content',event.target.value)} aria-invalid={overLimit('content')} aria-describedby="community-content-count" placeholder="복용량을 임의로 권하지 말고, 직접 경험한 사실을 구체적으로 적어주세요."/><CommunityFieldCount id="community-content-count" value={form.content} limit={POST_FIELD_LIMITS.content}/></label>
        <div className="community-attachment-inputs">
          <label><strong>이미지 업로드</strong><span>JPG, PNG, GIF, WEBP · 파일당 5MB · 최대 5개</span><input name="imageFiles" type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple onChange={event=>onChooseFiles(event,'IMAGE')}/>{existingAttachmentCounts.IMAGE>0&&<small>기존 이미지 {existingAttachmentCounts.IMAGE}개 포함 최대 5개</small>}{imageFiles.length>0&&<small>선택한 이미지 {imageFiles.length}개: {imageFiles.map(file=>file.name).join(' · ')}</small>}</label>
          <label><strong>일반 파일 업로드</strong><span>문서·PDF·압축파일 등 · 파일당 10MB · 최대 5개</span><input name="documentFiles" type="file" multiple onChange={event=>onChooseFiles(event,'FILE')}/>{existingAttachmentCounts.FILE>0&&<small>기존 파일 {existingAttachmentCounts.FILE}개 포함 최대 5개</small>}{documentFiles.length>0&&<small>선택한 파일 {documentFiles.length}개: {documentFiles.map(file=>file.name).join(' · ')}</small>}</label>
        </div>
        <label className="community-check"><input type="checkbox" checked={form.currentlyTaking} onChange={event=>update('currentlyTaking',event.target.checked)}/>현재 복용 중입니다</label>
      </fieldset>
      <footer className="community-compose-footer">
        {submitting&&<p className="community-submit-status" role="status"><span className="community-spinner" aria-hidden="true"/>{progress}</p>}
        <button type="submit" className="community-primary" disabled={submitting} aria-busy={submitting}>{submitting?'저장 중…':editingId?'수정 완료':'등록하기'}</button>
      </footer>
    </form>
  </div>
}
