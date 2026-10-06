/**
 * 역할: 확인, 경고, 입력 모달에서 공통으로 쓰는 대화상자
 * 포커스 규칙: 열릴 때 한 번만 내부로 이동하고, 닫힐 때 원래 요소로 복귀
 */
import { useEffect, useRef } from 'react'
import './UiDialog.css'

// 긴 설명을 문장과 명시적 줄바꿈 단위로 나눠 경고 내용이 한 덩어리로 붙지 않게 표시한다.
function DialogDescription({value}){
  const paragraphs=String(value||'').split(/(?<=[.!?])\s+|\n+/).map(text=>text.trim()).filter(Boolean)
  return <div className="ui-dialog-description">{paragraphs.map((paragraph,index)=><p key={`${index}-${paragraph}`}>{paragraph}</p>)}</div>
}

export default function UiDialog({open,title,description,confirmLabel='확인',cancelLabel='취소',tone='default',busy=false,onConfirm,onCancel,children}){
  const panelRef=useRef(null)
  // 부모가 다시 렌더링돼 콜백 함수가 바뀌어도 포커스 효과를 재실행하지 않도록 최신 값만 ref에 보관
  const cancelRef=useRef(onCancel)
  const busyRef=useRef(busy)
  useEffect(()=>{cancelRef.current=onCancel},[onCancel])
  useEffect(()=>{busyRef.current=busy},[busy])

  useEffect(()=>{
    if(!open)return undefined
    const previous=document.activeElement
    const onKeyDown=event=>{
      if(event.key==='Escape'&&!busyRef.current)cancelRef.current?.()
    }
    document.addEventListener('keydown',onKeyDown)
    // 입력 모달은 지정된 입력칸으로, 일반 확인 모달은 패널로 최초 포커스 이동
    const initialFocus=panelRef.current?.querySelector('[data-dialog-initial-focus]')
    if(initialFocus instanceof HTMLElement)initialFocus.focus()
    else panelRef.current?.focus()
    return()=>{document.removeEventListener('keydown',onKeyDown);previous?.focus?.()}
  },[open])

  if(!open)return null
  return <div className="ui-dialog-backdrop" onMouseDown={()=>!busy&&onCancel?.()}>
    <section className={'ui-dialog ui-dialog-'+tone} role="dialog" aria-modal="true" aria-labelledby="ui-dialog-title" tabIndex="-1" ref={panelRef} onMouseDown={event=>event.stopPropagation()}>
      <div className="ui-dialog-mark" aria-hidden="true">{tone==='danger'?'!':'✦'}</div>
      <div className="ui-dialog-copy"><h2 id="ui-dialog-title">{title}</h2>{description&&<DialogDescription value={description}/>}{children}</div>
      <div className="ui-dialog-actions">
        {cancelLabel&&<button type="button" className="ui-dialog-cancel" disabled={busy} onClick={onCancel}>{cancelLabel}</button>}
        <button type="button" className="ui-dialog-confirm" disabled={busy} onClick={onConfirm}>{busy?'처리 중…':confirmLabel}</button>
      </div>
    </section>
  </div>
}
