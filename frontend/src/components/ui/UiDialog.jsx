/**
 * 역할: 확인, 경고, 입력 모달에서 공통으로 쓰는 대화상자
 * 포커스 규칙: 열릴 때 한 번만 내부로 이동하고, 닫힐 때 원래 요소로 복귀
 */
import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import './UiDialog.css'

// 여러 경고창이 함께 열려도 마지막 창이 닫힐 때만 배경 스크롤 복원
let openDialogCount = 0
let savedBodyOverflow = ''

// 긴 설명을 문장과 명시적 줄바꿈 단위로 나눠 경고 내용이 한 덩어리로 붙지 않게 표시한다.
function DialogDescription({value,id}){
  const paragraphs=String(value||'').split(/(?<=[.!?])\s+|\n+/).map(text=>text.trim()).filter(Boolean)
  return <div id={id} className="ui-dialog-description">{paragraphs.map((paragraph,index)=><p key={`${index}-${paragraph}`}>{paragraph}</p>)}</div>
}

export default function UiDialog({open,title,description,confirmLabel='확인',cancelLabel='취소',tone='default',busy=false,onConfirm,onCancel,children}){
  const panelRef=useRef(null)
  const titleId=useId()
  const descriptionId=useId()
  // 부모가 다시 렌더링돼 콜백 함수가 바뀌어도 포커스 효과를 재실행하지 않도록 최신 값만 ref에 보관
  const cancelRef=useRef(onCancel)
  const busyRef=useRef(busy)
  useEffect(()=>{cancelRef.current=onCancel},[onCancel])
  useEffect(()=>{busyRef.current=busy},[busy])

  useEffect(()=>{
    if(!open)return undefined
    const previous=document.activeElement
    if(openDialogCount===0){savedBodyOverflow=document.body.style.overflow;document.body.style.overflow='hidden'}
    openDialogCount+=1
    const onKeyDown=event=>{
      const panel=panelRef.current
      // 다른 경고창에 포커스가 있으면 그 창의 키보드 처리를 존중
      if(!panel?.contains(document.activeElement))return
      if(event.key==='Escape'&&!busyRef.current){event.preventDefault();cancelRef.current?.()}
      if(event.key!=='Tab')return
      const controls=[...panel.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled]),select:not([disabled]),summary,[tabindex="0"]')]
        .filter(element=>element.getClientRects().length>0)
      if(!controls.length){event.preventDefault();panel.focus();return}
      const first=controls[0],last=controls[controls.length-1]
      if(event.shiftKey&&(document.activeElement===first||document.activeElement===panel)){event.preventDefault();last.focus()}
      else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===panel)){event.preventDefault();first.focus()}
    }
    document.addEventListener('keydown',onKeyDown)
    // 입력 모달은 지정된 입력칸으로, 일반 확인 모달은 패널로 최초 포커스 이동
    const initialFocus=panelRef.current?.querySelector('[data-dialog-initial-focus]')
    if(initialFocus instanceof HTMLElement)initialFocus.focus()
    else panelRef.current?.focus()
    return()=>{
      document.removeEventListener('keydown',onKeyDown)
      openDialogCount=Math.max(0,openDialogCount-1)
      if(openDialogCount===0)document.body.style.overflow=savedBodyOverflow
      if(previous?.isConnected)previous.focus?.()
    }
  },[open])

  if(!open||typeof document==='undefined')return null
  // 페이지 내부 overflow·transform의 영향을 피해서 모바일에서도 화면 전체를 덮음
  return createPortal(<div className="ui-dialog-backdrop" onMouseDown={()=>!busy&&onCancel?.()}>
    <section className={'ui-dialog ui-dialog-'+tone} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description?descriptionId:undefined} tabIndex="-1" ref={panelRef} onMouseDown={event=>event.stopPropagation()}>
      <div className="ui-dialog-mark" aria-hidden="true">{tone==='danger'?'!':'✦'}</div>
      <div className="ui-dialog-copy"><h2 id={titleId}>{title}</h2>{description&&<DialogDescription id={descriptionId} value={description}/>}{children}</div>
      <div className="ui-dialog-actions">
        {cancelLabel&&<button type="button" className="ui-dialog-cancel" disabled={busy} onClick={onCancel}>{cancelLabel}</button>}
        <button type="button" className="ui-dialog-confirm" disabled={busy} onClick={onConfirm}>{busy?'처리 중…':confirmLabel}</button>
      </div>
    </section>
  </div>,document.body)
}
