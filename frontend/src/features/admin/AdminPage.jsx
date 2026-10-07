/**
 * 역할: 신고 처리, 정보 제보 검토, 숨김 콘텐츠 복구를 한 화면에서 관리
 * 권한 기준: 화면 진입 제한과 별개로 모든 관리자 API가 서버 세션을 다시 검사
 */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import UiDialog from '../../components/ui/UiDialog'
import { formatDateTime24 } from '../../utils/dateTime.js'
import './AdminPage.css'

const targetLabels={POST:'게시글',COMMENT:'댓글'}
const reviewLabels={PENDING:'검토 대기',APPROVED:'승인',REJECTED:'반려'}

async function api(url,options){
  const response=await fetch(url,options)
  const text=await response.text()
  let data={}
  if(text){try{data=JSON.parse(text)}catch{data={message:text}}}
  if(!response.ok)throw new Error(data.message||'관리자 요청을 처리하지 못했습니다.')
  return data
}

export default function AdminPage({modal=false,onClose}){
  const [reports,setReports]=useState([])
  const [infoReports,setInfoReports]=useState([])
  const [moderated,setModerated]=useState([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [busy,setBusy]=useState('')
  const [section,setSection]=useState('reports')
  const [dialog,setDialog]=useState(null)
  const [moderationReason,setModerationReason]=useState('')
  const [reasonError,setReasonError]=useState('')

  const pendingReports=useMemo(()=>reports.filter(item=>item.status==='PENDING'),[reports])
  const processedReports=useMemo(()=>reports.filter(item=>item.status!=='PENDING'),[reports])
  const pendingInfo=useMemo(()=>infoReports.filter(item=>item.reviewStatus==='PENDING'),[infoReports])
  const reviewedInfo=useMemo(()=>infoReports.filter(item=>item.reviewStatus!=='PENDING'),[infoReports])

  async function load(){
    setLoading(true);setError('')
    try{
      const [reportData,infoData,moderatedData]=await Promise.all([
        api('/api/community/admin/reports'),api('/api/community/admin/info-reports'),api('/api/community/admin/moderated-content'),
      ])
      setReports(Array.isArray(reportData)?reportData:[])
      setInfoReports(Array.isArray(infoData)?infoData:[])
      setModerated(Array.isArray(moderatedData)?moderatedData:[])
    }catch(e){setError(e.message)}finally{setLoading(false)}
  }

  useEffect(()=>{
    let active=true
    Promise.all([api('/api/community/admin/reports'),api('/api/community/admin/info-reports'),api('/api/community/admin/moderated-content')])
      .then(([reportData,infoData,moderatedData])=>{if(active){setReports(Array.isArray(reportData)?reportData:[]);setInfoReports(Array.isArray(infoData)?infoData:[]);setModerated(Array.isArray(moderatedData)?moderatedData:[])}})
      .catch(cause=>{if(active)setError(cause.message)})
      .finally(()=>{if(active)setLoading(false)})
    return()=>{active=false}
  },[])

  async function action(key,work,message){
    if(busy)return
    setBusy(key);setError('');setNotice('')
    try{await work();setNotice(message);await load()}catch(e){setError(e.message)}finally{setBusy('');setDialog(null)}
  }

  function patchStatus(type,id,status){
    const path=type==='COMMENT'?'comments':'posts'
    return api(`/api/community/admin/${path}/${id}/status`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})})
  }

  function hideAndResolve(item){
    setModerationReason('');setReasonError('')
    setDialog({
      tone:'danger',title:`${targetLabels[item.targetType]}을 숨기고 신고를 처리할까요?`,confirmLabel:'숨김 후 처리 완료',
      description:`해당 ${targetLabels[item.targetType]}은 일반 사용자 화면에서 보이지 않게 됩니다. 신고는 처리 완료 상태로 기록되며, 숨긴 내용은 “숨김 콘텐츠”에서 언제든 복구할 수 있습니다.`,
      requireReason:true,
      run:reason=>action('hide-'+item.reportId,async()=>{await patchStatus(item.targetType,item.targetId,'HIDDEN');await api('/api/community/admin/reports/'+item.reportId,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'RESOLVED',resolutionNote:reason})})},`${targetLabels[item.targetType]}을 숨기고 신고를 처리했습니다.`),
    })
  }

  function resolveOnly(item,status){
    setModerationReason('');setReasonError('')
    setDialog({
      title:'신고를 기각할까요?',confirmLabel:'신고 기각',requireReason:true,
      description:'게시글이나 댓글은 그대로 유지됩니다. 신고자에게 전달할 기각 사유를 구체적으로 작성해주세요.',
      run:reason=>action('report-'+item.reportId,()=>api('/api/community/admin/reports/'+item.reportId,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status,resolutionNote:reason})}),'신고를 기각하고 신고자에게 결과를 알렸습니다.'),
    })
  }

  function restoreContent(item){
    setDialog({title:`숨긴 ${targetLabels[item.targetType]}을 복구할까요?`,confirmLabel:'다시 공개',description:'복구하면 일반 사용자도 해당 내용을 다시 볼 수 있습니다.',run:()=>action('restore-'+item.targetType+'-'+item.targetId,()=>patchStatus(item.targetType,item.targetId,'VISIBLE'),`${targetLabels[item.targetType]}을 다시 공개했습니다.`)})
  }

  function reviewInfo(item,status){
    const approved=status==='APPROVED'
    setModerationReason('');setReasonError('')
    setDialog({
      title:approved?'정보 제보를 승인할까요?':'정보 제보를 반려할까요?',confirmLabel:approved?'검토 승인':'반려',
      description:approved?'승인은 제보의 검토 상태만 변경합니다. 의약품 공식 DB에는 자동 반영되지 않으며, 근거 확인 후 별도의 데이터 수정이나 공공데이터 동기화가 필요합니다.':'반려하면 검토 상태가 반려로 기록됩니다. 원문 게시글은 삭제되지 않습니다.',
      requireReason:true,
      run:reason=>action('review-'+item.postId,()=>api('/api/community/admin/posts/'+item.postId+'/review',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status,resolutionNote:reason})}),approved?'정보 제보를 승인하고 작성자에게 결과를 알렸습니다.':'정보 제보를 반려하고 작성자에게 결과를 알렸습니다.'),
    })
  }

  // 처리 사유는 감사 기록이자 사용자에게 전달되는 안내이므로 빈 값으로 제출하지 않는다.
  function confirmDialog(){
    if(dialog?.requireReason){const value=moderationReason.trim();if(!value){setReasonError('처리 사유를 입력해주세요.');return}dialog.run(value);return}
    dialog?.run?.()
  }

  function synchronize(type,scope){
    const label=type==='permit'?'식약처 허가정보':'e약은요'
    const execute=()=>action('sync-'+type+'-'+scope,async()=>{setNotice(label+' 동기화를 진행하고 있습니다.');return api('/api/admin/data/'+type+'/'+scope,{method:'POST'})},label+' 동기화를 완료했습니다.')
    if(scope==='all')setDialog({title:`${label} 전체 동기화를 실행할까요?`,confirmLabel:'전체 동기화 시작',description:'외부 API와 전체 DB를 확인하므로 시간이 오래 걸릴 수 있습니다. 작업 중에는 이 창을 유지해주세요.',run:execute})
    else execute()
  }

  const content=<div className={'admin-page'+(modal?' admin-page-in-modal':'')}>
    <header className="admin-heading"><div><span className="section-meta-tag">ADMIN CONTROL CENTER</span><h1 className="section-title">관리자 센터</h1><p>신고 검토, 숨김 콘텐츠 복구, 정보 제보와 의약품 데이터를 관리합니다.</p></div><div className="admin-heading-actions"><button type="button" onClick={load} disabled={loading||Boolean(busy)}>현황 새로고침</button>{modal&&<button type="button" className="admin-close" onClick={onClose} aria-label="관리자 센터 닫기">닫기</button>}</div></header>
    <section className="admin-summary" aria-label="관리 현황"><article><span>처리 대기 신고</span><strong>{pendingReports.length}</strong><small>게시글·댓글 신고</small></article><article><span>검토 대기 제보</span><strong>{pendingInfo.length}</strong><small>의약품 정보 제보</small></article><article><span>숨김 콘텐츠</span><strong>{moderated.length}</strong><small>관리자가 복구 가능</small></article></section>
    <nav className="admin-tabs" aria-label="관리자 업무"><button aria-pressed={section==='reports'} onClick={()=>setSection('reports')}>신고 처리 <em>{pendingReports.length}</em></button><button aria-pressed={section==='info'} onClick={()=>setSection('info')}>정보 제보 <em>{pendingInfo.length}</em></button><button aria-pressed={section==='hidden'} onClick={()=>setSection('hidden')}>숨김 콘텐츠 <em>{moderated.length}</em></button><button aria-pressed={section==='history'} onClick={()=>setSection('history')}>처리 기록</button><button aria-pressed={section==='data'} onClick={()=>setSection('data')}>데이터 관리</button></nav>
    {notice&&<p className="admin-notice" role="status">{notice}</p>}{error&&<p className="admin-error" role="alert">{error}</p>}{loading&&<p className="admin-loading" role="status">관리 현황을 불러오고 있습니다…</p>}

    {section==='reports'&&<section className="admin-section"><div className="admin-section-title"><div><span>REPORT QUEUE</span><h2>신고 처리</h2></div><Link to="/community" onClick={modal?onClose:undefined}>커뮤니티 보기 →</Link></div><p className="admin-description">신고 내용을 확인한 뒤 콘텐츠를 숨기거나 신고를 기각하세요. 처리 사유는 신고자에게 알림으로 전달됩니다.</p><div className="admin-list">{!loading&&!pendingReports.length&&<p className="admin-empty">처리할 신고가 없습니다.</p>}{pendingReports.map(item=><article className="admin-item" key={item.reportId}><div className="admin-item-meta"><span>{targetLabels[item.targetType]} #{item.targetId}</span><time>{formatDateTime24(item.createdAt)}</time></div><h4>{item.detail||'신고 사유 없음'}</h4><p>{item.targetSummary||'신고 대상 내용을 확인할 수 없습니다.'}</p><small>신고자 {item.reporterName} · 현재 상태 {item.targetStatus==='HIDDEN'?'숨김':'공개'}</small><div className="admin-actions">{item.targetPostId&&<Link to={'/community?postId='+item.targetPostId} onClick={modal?onClose:undefined}>관련 게시글 보기</Link>}<button className="danger" onClick={()=>hideAndResolve(item)} disabled={Boolean(busy)}>콘텐츠 숨김</button><button className="subtle" onClick={()=>resolveOnly(item,'DISMISSED')} disabled={Boolean(busy)}>신고 기각</button></div></article>)}</div></section>}

    {section==='info'&&<section className="admin-section"><div className="admin-section-title"><div><span>INFORMATION REVIEW</span><h2>의약품 정보 제보</h2></div></div><div className="admin-explain"><strong>승인 후에도 공식 약 정보는 자동 수정되지 않습니다.</strong><p>사용자 게시글은 참고 자료입니다. 승인 상태를 기록한 뒤 근거를 확인하고, 식약처 데이터 동기화 또는 별도의 검증된 수정 절차로 반영해야 합니다.</p></div><div className="admin-list">{!loading&&!pendingInfo.length&&<p className="admin-empty">검토할 정보 제보가 없습니다.</p>}{pendingInfo.map(item=><article className="admin-item" key={item.postId}><div className="admin-item-meta"><span>{item.medicationName||'약 미지정'}</span><time>{formatDateTime24(item.createdAt)}</time></div><h4>{item.title}</h4><p>{item.content}</p><small>작성자 {item.authorName}</small><div className="admin-actions"><Link to={'/community?postId='+item.postId} onClick={modal?onClose:undefined}>원문 보기</Link><button onClick={()=>reviewInfo(item,'APPROVED')} disabled={Boolean(busy)}>검토 승인</button><button className="subtle" onClick={()=>reviewInfo(item,'REJECTED')} disabled={Boolean(busy)}>반려</button></div></article>)}</div></section>}

    {section==='hidden'&&<section className="admin-section"><div className="admin-section-title"><div><span>MODERATED CONTENT</span><h2>숨김 콘텐츠</h2></div></div><p className="admin-description">관리자가 숨긴 게시글과 댓글을 한곳에서 확인하고 다시 공개할 수 있습니다.</p><div className="admin-list">{!loading&&!moderated.length&&<p className="admin-empty">현재 숨긴 콘텐츠가 없습니다.</p>}{moderated.map(item=><article className="admin-item" key={item.targetType+'-'+item.targetId}><div className="admin-item-meta"><span>{targetLabels[item.targetType]} #{item.targetId}</span><time>{formatDateTime24(item.moderatedAt)}</time></div><h4>{item.title}</h4><p>{item.content}</p><small>작성자 {item.authorName}</small><div className="admin-actions"><Link to={'/community?postId='+item.postId} onClick={modal?onClose:undefined}>관련 게시글 보기</Link><button onClick={()=>restoreContent(item)} disabled={Boolean(busy)}>다시 공개</button></div></article>)}</div></section>}

    {section==='history'&&<section className="admin-section"><div className="admin-section-title"><div><span>AUDIT HISTORY</span><h2>처리 기록</h2></div></div><div className="admin-columns"><div className="admin-panel"><h3>처리한 신고 <em>{processedReports.length}</em></h3>{!processedReports.length&&<p className="admin-empty">처리 기록이 없습니다.</p>}{processedReports.map(item=><article className="admin-item" key={item.reportId}><div className="admin-item-meta"><span>{targetLabels[item.targetType]} #{item.targetId}</span><span className={'admin-status '+item.status}>{item.status==='RESOLVED'?'처리 완료':'기각'}</span></div><h4>{item.detail||'신고 사유 없음'}</h4><p>{item.targetSummary}</p>{item.resolutionNote&&<small>처리 사유 · {item.resolutionNote}</small>}</article>)}</div><div className="admin-panel"><h3>검토한 정보 제보 <em>{reviewedInfo.length}</em></h3>{!reviewedInfo.length&&<p className="admin-empty">검토 기록이 없습니다.</p>}{reviewedInfo.map(item=><article className="admin-item" key={item.postId}><div className="admin-item-meta"><span>{item.medicationName||'약 미지정'}</span><span className={'admin-status '+item.reviewStatus}>{reviewLabels[item.reviewStatus]}</span></div><h4>{item.title}</h4><p>{item.content}</p>{item.reviewNote&&<small>검토 사유 · {item.reviewNote}</small>}</article>)}</div></div></section>}

    {section==='data'&&<section className="admin-section"><div className="admin-section-title"><div><span>MEDICATION DATA</span><h2>의약품 공공데이터 관리</h2></div></div><p className="admin-description">시험 동기화로 연결 상태를 먼저 확인한 뒤 전체 동기화를 실행하세요. 실제 값이 변경된 제품만 DB에서 갱신됩니다.</p><div className="admin-sync-grid"><article><span>PRODUCT PERMIT</span><h3>식약처 의약품 허가정보</h3><p>제품명, 제조사, 성분, 분류, EDI 코드와 허가 상태를 동기화합니다.</p><div className="admin-actions"><button onClick={()=>synchronize('permit','test')} disabled={Boolean(busy)}>100건 시험 동기화</button><button className="subtle" onClick={()=>synchronize('permit','all')} disabled={Boolean(busy)}>전체 동기화</button></div></article><article><span>EASY DRUG</span><h3>e약은요 상세정보</h3><p>기존 의약품에 효능·효과, 용법·용량과 제품 이미지를 보강합니다.</p><div className="admin-actions"><button onClick={()=>synchronize('easy','test')} disabled={Boolean(busy)}>100건 시험 동기화</button><button className="subtle" onClick={()=>synchronize('easy','all')} disabled={Boolean(busy)}>전체 동기화</button></div></article></div></section>}

    <UiDialog open={Boolean(dialog)} title={dialog?.title} description={dialog?.description} confirmLabel={dialog?.confirmLabel} tone={dialog?.tone} busy={Boolean(busy)} onCancel={()=>setDialog(null)} onConfirm={confirmDialog}>
      {dialog?.requireReason&&<><label className="admin-reason-label">처리 사유<textarea data-dialog-initial-focus maxLength="500" value={moderationReason} onChange={event=>{setModerationReason(event.target.value);setReasonError('')}} placeholder="사용자에게 전달할 처리 근거를 입력해주세요."/></label><div className="ui-dialog-field-meta"><span className="ui-dialog-field-error">{reasonError}</span><span>{moderationReason.length}/500</span></div></>}
    </UiDialog>
  </div>

  if(!modal)return content
  return <div className="admin-modal-backdrop" onMouseDown={onClose}><section className="admin-modal-shell" role="dialog" aria-modal="true" aria-label="관리자 센터" onMouseDown={event=>event.stopPropagation()}>{content}</section></div>
}

