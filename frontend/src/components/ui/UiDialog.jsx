import { useEffect, useRef } from 'react'
import './UiDialog.css'

export default function UiDialog({open,title,description,confirmLabel='확인',cancelLabel='취소',tone='default',busy=false,onConfirm,onCancel,children}){
  const panelRef=useRef(null)

  useEffect(()=>{
    if(!open)return undefined
    const previous=document.activeElement
    const onKeyDown=event=>{
      if(event.key==='Escape'&&!busy)onCancel?.()
    }
    document.addEventListener('keydown',onKeyDown)
    panelRef.current?.focus()
    return()=>{document.removeEventListener('keydown',onKeyDown);previous?.focus?.()}
  },[open,busy,onCancel])

  if(!open)return null
  return <div className="ui-dialog-backdrop" onMouseDown={()=>!busy&&onCancel?.()}>
    <section className={'ui-dialog ui-dialog-'+tone} role="dialog" aria-modal="true" aria-labelledby="ui-dialog-title" tabIndex="-1" ref={panelRef} onMouseDown={event=>event.stopPropagation()}>
      <div className="ui-dialog-mark" aria-hidden="true">{tone==='danger'?'!':'✦'}</div>
      <div className="ui-dialog-copy"><h2 id="ui-dialog-title">{title}</h2>{description&&<p>{description}</p>}{children}</div>
      <div className="ui-dialog-actions">
        {cancelLabel&&<button type="button" className="ui-dialog-cancel" disabled={busy} onClick={onCancel}>{cancelLabel}</button>}
        <button type="button" className="ui-dialog-confirm" disabled={busy} onClick={onConfirm}>{busy?'처리 중…':confirmLabel}</button>
      </div>
    </section>
  </div>
}
