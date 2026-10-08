/**
 * 역할: 커뮤니티 목록·상세·작성·댓글·첨부·신고 화면 관리
 * 권한 흐름: 화면은 버튼 노출만 결정하고 실제 작성자·관리자 검사는 서버에서 다시 수행
 */
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import './CommunityPage.css'
import defaultProfileImg from '../../assets/Default_profile.png'
import AdminPage from '../admin/AdminPage'
import UiDialog from '../../components/ui/UiDialog'
import { useReadingProfile } from '../../contexts/ReadingContext'
import { validatePost, validateAttachments } from './communityValidation'
import CommunityPostComposer from './CommunityPostComposer'
import CommunityFieldCount from './CommunityFieldCount'
import CommunityPostSearch from './CommunityPostSearch'
import { communityApi as api } from './communityApi'
import { formatDateTime24 } from '../../utils/dateTime.js'

const categories={ALL:'전체',EXPERIENCE:'복용 경험',QUESTION:'질문',SIDE_EFFECT:'부작용 경험',INFO_REPORT:'정보 제보'}
const emptyForm={category:'EXPERIENCE',title:'',content:'',medicationId:'',medicationName:'',experienceDuration:'',ageGroup:'',purpose:'',occurrenceTiming:'',currentlyTaking:false}

function UserAvatar({name,imageUrl,size='small'}){
  const [imageFailed,setImageFailed]=useState(false)
  const avatarSrc = imageUrl && !imageFailed ? imageUrl : defaultProfileImg
  return <span className={'community-avatar '+size} aria-label={(name||'사용자')+' 프로필'}><img src={avatarSrc} alt="" onError={()=>setImageFailed(true)}/></span>
}

// 서버의 평면 댓글 목록을 parentCommentId 기준으로 재귀 표시해 답글 관계를 유지한다.
function CommentThread({comments,parentId=null,userId,canWrite,busy,onReply,onHelpful,onReport,onDelete}){
  const children=comments.filter(comment=>parentId===null?!comment.parentCommentId:Number(comment.parentCommentId)===Number(parentId))
  return children.map(comment=><div className={'community-comment '+(parentId!==null?'is-reply':'')} key={comment.commentId}>
    <div className="community-comment-author"><UserAvatar name={comment.authorName} imageUrl={comment.authorProfileImageUrl}/><div><strong>{comment.authorName}</strong><time>{formatDateTime24(comment.createdAt)}</time></div></div>
    <p>{comment.content}</p>
    <div className="community-comment-actions">
      <button disabled={busy} className={Number(comment.helpfulByMe)===1?'active':''} onClick={()=>onHelpful(comment)}>도움됐어요 {comment.helpfulCount||0}</button>
      {canWrite&&<button disabled={busy} onClick={()=>onReply(comment)}>답글</button>}
      <button disabled={busy} onClick={()=>onReport('COMMENT',comment.commentId)}>신고</button>
      {Number(comment.authorId)===Number(userId)&&<button disabled={busy} onClick={()=>onDelete(comment.commentId)}>삭제</button>}
    </div>
    <CommentThread comments={comments} parentId={comment.commentId} userId={userId} canWrite={canWrite} busy={busy} onReply={onReply} onHelpful={onHelpful} onReport={onReport} onDelete={onDelete}/>
  </div>)
}

export default function CommunityPage({user}){
  const reading=useReadingProfile()
  // 주소의 medicationId가 있으면 챗봇에서 선택한 약과 연결된 글만 표시
  const location=useLocation()
  const initialParams=useMemo(()=>new URLSearchParams(location.search),[location.search])
  const linkedMedicationId=initialParams.get('medicationId')||''
  const linkedMedicationName=initialParams.get('medicationName')||''
  // 목록 검색 조건과 서버에서 받은 페이지 결과
  const [filters,setFilters]=useState({q:'',category:'ALL',sort:'LATEST',page:1})
  const [searchText,setSearchText]=useState('')
  const [result,setResult]=useState({items:[],total:0,page:1,pageSize:5,totalPages:1,hasMore:false})
  const [loadedQuery,setLoadedQuery]=useState(null)
  const [refreshing,setRefreshing]=useState(false)
  const listRequestId=useRef(0)

  // 상세 모달, 작성 모달, 댓글 입력 상태
  const [selected,setSelected]=useState(null)
  const [error,setError]=useState('')
  const [compose,setCompose]=useState(false)
  const [editingId,setEditingId]=useState(null)
  const [form,setForm]=useState(emptyForm)
  const [medQuery,setMedQuery]=useState('')
  const [medSearchResult,setMedSearchResult]=useState({query:'',items:[],error:''})
  const [comment,setComment]=useState('')
  const [replyTarget,setReplyTarget]=useState(null)
  const [notice,setNotice]=useState('')
  // 오류는 현재 작성·상세 화면 위에 표시. 닫아도 초안과 선택한 파일은 그대로 유지
  const [feedback,setFeedback]=useState(null)
  const composeRef=useRef(null)
  const commentRef=useRef(null)
  // 모든 사용자 요청에 동기 잠금과 진행 문구를 함께 적용해 중복 등록·토글 방지
  const actionLock=useRef(false)
  const [pendingLabel,setPendingLabel]=useState('')

  // 관리자 화면과 공용 확인·신고 모달 상태
  const [adminOpen,setAdminOpen]=useState(false)
  const [dialog,setDialog]=useState(null)
  const [dialogBusy,setDialogBusy]=useState(false)
  // 삭제·신고 확인을 연속으로 눌러도 하나의 요청만 진행
  const dialogLock=useRef(false)
  const [reportDraft,setReportDraft]=useState('')
  const [reportError,setReportError]=useState('')

  // 새로 선택한 파일만 보관하며 기존 첨부파일은 상세 조회 결과에서 관리
  const [imageFiles,setImageFiles]=useState([])
  const [documentFiles,setDocumentFiles]=useState([])
  const [existingAttachmentCounts,setExistingAttachmentCounts]=useState({IMAGE:0,FILE:0})
  const [submitting,setSubmitting]=useState(false)
  const busy=Boolean(pendingLabel)||submitting||dialogBusy
  const isAdmin=user?.isAdmin===true||Number(user?.isAdmin)===1
  const canWrite=Boolean(user?.userId)&&user?.username!=='demo'
  const selectedIsMine=Boolean(user?.userId)&&Number(selected?.authorId)===Number(user.userId)
  const query=useMemo(()=>new URLSearchParams({q:filters.q,category:filters.category==='ALL'?'':filters.category,sort:filters.sort,page:String(filters.page),medicationId:linkedMedicationId}).toString(),[filters,linkedMedicationId])
  const loading=loadedQuery!==query||refreshing
  const pageGroupStart=Math.floor((result.page-1)/5)*5+1
  const pageNumbers=Array.from({length:Math.min(5,result.totalPages-pageGroupStart+1)},(_,index)=>pageGroupStart+index)
  const medKeyword=medQuery.trim()
  const needsMedSearch=compose&&Boolean(medKeyword)&&!form.medicationId&&medKeyword.length<=80
  const medSearching=needsMedSearch&&medSearchResult.query!==medKeyword
  const meds=needsMedSearch&&medSearchResult.query===medKeyword?medSearchResult.items:[]
  const medSearchError=needsMedSearch&&medSearchResult.query===medKeyword?medSearchResult.error:''

  function showFeedback(title,message,field,scope='compose'){setFeedback({title,message,field,scope})}
  function searchPosts(keyword){setFilters(previous=>({...previous,q:keyword,page:1}))}
  function changeSearchText(value){
    setSearchText(value)
    // 검색어를 모두 지우면 남아 있는 목록 검색도 해제
    if(!value.trim())searchPosts('')
  }
  function closeFeedback(){
    const target=feedback
    setFeedback(null)
    // 공용 모달의 포커스 복원 뒤 문제가 있는 입력칸으로 이동
    if(target?.field)requestAnimationFrame(()=>{
      if(target.scope==='comment')commentRef.current?.focus()
      else composeRef.current?.elements.namedItem(target.field)?.focus()
    })
  }
  async function runAction(label,work,errorTitle='요청을 완료하지 못했어요'){
    if(actionLock.current)return
    actionLock.current=true;setPendingLabel(label)
    try{await work()}
    catch(error){showFeedback(errorTitle,error.message)}
    finally{actionLock.current=false;setPendingLabel('')}
  }

  // 현재 검색 조건으로 목록을 다시 불러오는 수동 새로고침 함수
  async function load(){const requestId=++listRequestId.current;setRefreshing(true);setError('');try{const data=await api('/api/community/posts?'+query);if(requestId===listRequestId.current)setResult(data)}catch(e){if(requestId===listRequestId.current)setError(e.message)}finally{if(requestId===listRequestId.current){setLoadedQuery(query);setRefreshing(false)}}}
  // 검색·페이지 변경 시 로딩 상태를 표시하고, 이전 요청이 새 목록을 덮어쓰지 않도록 요청 번호도 확인
  useEffect(()=>{let active=true;const requestId=++listRequestId.current;api('/api/community/posts?'+query).then(data=>{if(active&&requestId===listRequestId.current){setResult(data);setError('')}}).catch(e=>{if(active&&requestId===listRequestId.current)setError(e.message)}).finally(()=>{if(active&&requestId===listRequestId.current){setLoadedQuery(query);setRefreshing(false)}});return()=>{active=false}},[query])
  // 공유 주소에 postId가 포함되면 해당 게시글 상세를 바로 표시
  const openLinkedPost=useEffectEvent(id=>openPost(id))
  useEffect(()=>{const postId=initialParams.get('postId');if(postId)openLinkedPost(postId)},[initialParams])
  // 입력이 멈추면 검색. 지난 검색은 취소하고 응답도 무시해 새 검색 결과를 덮어쓰지 않게 처리
  useEffect(()=>{
    if(!needsMedSearch)return undefined
    let active=true
    const controller=new AbortController()
    const timer=setTimeout(()=>api('/api/community/medications?q='+encodeURIComponent(medKeyword),{signal:controller.signal})
      .then(items=>{if(active)setMedSearchResult({query:medKeyword,items,error:''})})
      .catch(error=>{if(active&&error.name!=='AbortError')setMedSearchResult({query:medKeyword,items:[],error:error.message})}),250)
    return()=>{active=false;clearTimeout(timer);controller.abort()}
  },[medKeyword,needsMedSearch])
  async function refreshPost(id){setSelected(await api('/api/community/posts/'+id));setNotice('')}
  async function openPost(id){await runAction('글을 불러오고 있어요…',()=>refreshPost(id),'글을 열지 못했어요')}
  // 본문을 먼저 저장해 postId를 받은 다음 첨부파일을 연결한다.
  // 첨부만 실패하면 이미 저장된 글을 유지하고 사용자에게 부분 성공 사실을 알린다.
  async function submitPost(event){
    event.preventDefault()
    if(actionLock.current)return
    // 글을 저장하기 전에 전체 입력·첨부를 검사해, 잘못된 첨부 때문에 글만 생성되는 상황 줄이기
    const issue=validatePost(form)||validateAttachments('IMAGE',imageFiles,existingAttachmentCounts.IMAGE)||validateAttachments('FILE',documentFiles,existingAttachmentCounts.FILE)
    if(issue){showFeedback('작성 내용을 확인해주세요',issue.message,issue.field);return}
    await runAction(editingId?'글을 수정하고 있어요…':'글을 저장하고 있어요…',async()=>{
      setSubmitting(true)
      let savedPost=null
      let stage='save'
      try{
        savedPost=await api(editingId?'/api/community/posts/'+editingId:'/api/community/posts',{method:editingId?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)})
        stage='attachments'
        if(imageFiles.length)await uploadAttachments(savedPost.postId,'IMAGE',imageFiles)
        if(documentFiles.length)await uploadAttachments(savedPost.postId,'FILE',documentFiles)
        stage='refresh'
        setPendingLabel('저장한 글을 확인하고 있어요…')
        const detail=await api('/api/community/posts/'+savedPost.postId)
        setCompose(false);setEditingId(null);setForm(emptyForm);setMedQuery('');setImageFiles([]);setDocumentFiles([])
        await load();setSelected(detail);setNotice(editingId?'글을 수정했습니다.':'글을 등록했습니다.')
      }catch(error){
        if(!savedPost)throw error
        // 이미 저장한 글을 다시 등록하지 않도록 작성창은 닫고 부분 완료 사실을 별도 안내
        setCompose(false);setEditingId(null);setImageFiles([]);setDocumentFiles([])
        await load()
        try{await refreshPost(savedPost.postId)}catch{ /* 상세 조회가 실패해도 저장 사실은 유지 */ }
        showFeedback('글은 저장했어요',stage==='attachments'
          ?`첨부파일을 모두 올리지는 못했어요.\n${error.message}\n저장된 글을 확인한 뒤 수정 화면에서 파일을 다시 첨부해주세요.`
          :`저장한 글을 다시 불러오지 못했어요.\n${error.message}\n같은 글을 다시 등록하지 말고 게시글 목록에서 확인해주세요.`)
      }finally{setSubmitting(false)}
    },'글을 저장하지 못했어요')
  }
  // 서버의 한 요청 용량 제한을 넘지 않도록 파일별 업로드 유지. 현재 단계와 파일 순서를 표시
  async function uploadAttachments(postId,type,files){
    for(const [index,file] of files.entries()){
      setPendingLabel(`${type==='IMAGE'?'이미지':'첨부파일'}를 올리고 있어요… (${index+1}/${files.length})`)
      const body=new FormData();body.append('type',type);body.append('files',file)
      await api('/api/community/posts/'+postId+'/attachments',{method:'POST',body})
    }
  }
  function chooseFiles(event,type){
    const files=Array.from(event.target.files||[])
    const issue=validateAttachments(type,files,existingAttachmentCounts[type])
    if(issue){
      event.target.value=''
      const keptFiles=type==='IMAGE'?imageFiles:documentFiles
      showFeedback('첨부파일을 확인해주세요',issue.message+(keptFiles.length?'\n이전에 선택한 파일은 그대로 유지했어요.':''),issue.field)
      return
    }
    if(type==='IMAGE')setImageFiles(files);else setDocumentFiles(files)
  }
  async function toggleHelpful(){
    await runAction('도움 표시를 반영하고 있어요…',async()=>{
      const id=selected.postId
      const data=await api('/api/community/posts/'+id+'/helpful',{method:'POST'})
      setSelected(value=>({...value,helpfulByMe:data.active?1:0,helpfulCount:data.count}))
      setResult(value=>({...value,items:value.items.map(item=>item.postId===id?{...item,helpfulByMe:data.active?1:0,helpfulCount:data.count}:item)}))
    })
  }
  async function submitComment(event){
    event.preventDefault()
    if(actionLock.current)return
    const content=comment.trim()
    if(!content||content.length>1000){showFeedback('댓글을 확인해주세요',content?'댓글은 1,000자 이내로 작성해주세요.':'댓글 내용을 입력해주세요.','comment','comment');return}
    await runAction(replyTarget?'답글을 등록하고 있어요…':'댓글을 등록하고 있어요…',async()=>{
      const id=selected.postId
      await api('/api/community/posts/'+id+'/comments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content,parentCommentId:replyTarget?.commentId||null})})
      setComment('');setReplyTarget(null);setPendingLabel('등록한 댓글을 확인하고 있어요…')
      try{await refreshPost(id)}catch(error){showFeedback('댓글은 등록했어요',`댓글 목록을 다시 불러오지 못했어요.\n${error.message}\n게시글을 다시 열어 확인해주세요.`)}
    },'댓글을 등록하지 못했어요')
  }
  async function toggleCommentHelpful(target){
    await runAction('댓글 도움 표시를 반영하고 있어요…',async()=>{
      const data=await api('/api/community/comments/'+target.commentId+'/helpful',{method:'POST'})
      setSelected(value=>({...value,comments:value.comments.map(comment=>comment.commentId===target.commentId?{...comment,helpfulByMe:data.active?1:0,helpfulCount:data.count}:comment)}))
    })
  }
  // 사용자가 작성한 신고 사유는 관리자에게 그대로 전달한다. 화면에서 빈 값과 길이를 먼저 확인하지만
  // 권한, 대상 유형, 최대 길이는 조작 방지를 위해 서버에서도 다시 검증한다.
  function report(targetType,targetId){if(!canWrite){showFeedback('로그인이 필요해요','로그인 후 신고할 수 있습니다.');return}setReportDraft('');setReportError('');setDialog({type:'report',targetType,targetId,title:targetType==='COMMENT'?'댓글 신고':'게시글 신고'})}
  // 신고 입력값은 화면과 서버에서 각각 검증하고 성공한 경우에만 모달을 닫음
  async function submitReport(){const detail=reportDraft.trim();if(!detail){setReportError('신고 사유를 입력해주세요.');return}if(detail.length>500){setReportError('신고 사유는 500자 이내로 입력해주세요.');return}await api('/api/community/reports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({targetType:dialog.targetType,targetId:dialog.targetId,reason:'OTHER',detail})});setDialog(null);setReportDraft('');setNotice('신고가 접수되었습니다. 관리자 확인 후 처리됩니다.')}
  function editPost(){setEditingId(selected.postId);setForm({category:selected.category,title:selected.title,content:selected.content,medicationId:selected.medicationId||'',medicationName:selected.medicationName||'',experienceDuration:selected.experienceDuration||'',ageGroup:selected.ageGroup||'',purpose:selected.purpose||'',occurrenceTiming:selected.occurrenceTiming||'',currentlyTaking:Number(selected.currentlyTaking)===1});setMedQuery(selected.medicationName||'');setImageFiles([]);setDocumentFiles([]);setExistingAttachmentCounts({IMAGE:selected.attachments?.filter(file=>file.attachmentType==='IMAGE').length||0,FILE:selected.attachments?.filter(file=>file.attachmentType==='FILE').length||0});setSelected(null);setCompose(true)}
  function confirmAction(title,description,confirmLabel,run){setDialog({type:'confirm',title,description,confirmLabel,run})}
  // 다른 사람의 글 삭제는 관리자에게만 표시. 실제 권한은 서버가 현재 DB 정보로 다시 확인
  function deletePost(){
    const post=selected
    const byAdmin=isAdmin&&!selectedIsMine
    const description=byAdmin
      ?'다른 사용자가 쓴 게시글을 관리자 권한으로 삭제합니다.\n삭제한 글과 댓글은 다른 사용자에게 보이지 않으며 이 화면에서 되돌릴 수 없습니다.'
      :'삭제한 글과 댓글은 다른 사용자에게 보이지 않습니다.\n삭제하면 이 화면에서 되돌릴 수 없습니다.'
    confirmAction(byAdmin?'이 글을 관리자로 삭제할까요?':'게시글을 삭제할까요?',description,'게시글 삭제',async()=>{
      await api('/api/community/posts/'+post.postId,{method:'DELETE'});setDialog(null);setSelected(null);setReplyTarget(null);await load();setNotice('게시글을 삭제했습니다.')
    })
  }
  // 확인창을 포함한 요청도 완료까지 잠금. 실패하면 입력·확인창을 유지한 채 위에 오류 모달 표시
  async function runDialogAction(){
    if(dialogLock.current||actionLock.current)return
    dialogLock.current=true;actionLock.current=true;setDialogBusy(true);setPendingLabel(dialog?.type==='report'?'신고를 접수하고 있어요…':'요청을 처리하고 있어요…')
    try{if(dialog?.type==='report')await submitReport();else await dialog?.run?.()}
    catch(error){showFeedback('요청을 완료하지 못했어요',error.message)}
    finally{dialogLock.current=false;actionLock.current=false;setDialogBusy(false);setPendingLabel('')}
  }
  function deleteComment(id){confirmAction('댓글을 삭제할까요?','삭제한 댓글은 게시글에서 더 이상 보이지 않습니다.','댓글 삭제',async()=>{
    await api('/api/community/comments/'+id,{method:'DELETE'});setDialog(null);setPendingLabel('삭제한 댓글을 반영하고 있어요…')
    try{await refreshPost(selected.postId)}catch(error){showFeedback('댓글은 삭제했어요',`댓글 목록을 다시 불러오지 못했어요.\n${error.message}\n게시글을 다시 열어 확인해주세요.`)}
  })}
  function deleteAttachment(id){confirmAction('첨부파일을 삭제할까요?','삭제한 첨부파일은 다시 복구할 수 없습니다.','파일 삭제',async()=>{
    await api('/api/community/attachments/'+id,{method:'DELETE'});setDialog(null);setPendingLabel('첨부파일 목록을 새로 불러오고 있어요…')
    try{await refreshPost(selected.postId);setNotice('첨부파일을 삭제했습니다.')}
    catch(error){showFeedback('첨부파일은 삭제했어요',`첨부파일 목록을 다시 불러오지 못했어요.\n${error.message}\n게시글을 다시 열어 확인해주세요.`)}
  })}
  return <div className="community-page">
    <header className="community-header"><div><span className="section-meta-tag">약 경험 나누기</span><h1 className="section-title">약 이야기</h1><p>{reading.isChild?'궁금한 약이나 약을 먹은 경험을 나눠요. 다른 사람의 글은 보호자와 함께 읽어주세요.':'약을 먹은 경험이나 궁금한 점을 나눠보세요. 같은 약을 먹는 사람들의 이야기를 볼 수 있어요.'}</p>{linkedMedicationId&&<p className="community-linked-filter">챗봇에서 선택한 {linkedMedicationName||'약'}의 글을 보고 있어요. <Link to="/community">전체 글 보기</Link></p>}</div><button className="community-primary" disabled={busy} onClick={()=>{if(!canWrite){showFeedback('로그인이 필요해요','로그인 후 글을 작성할 수 있습니다.');return}setEditingId(null);setForm({...emptyForm,medicationId:linkedMedicationId,medicationName:linkedMedicationName});setMedQuery(linkedMedicationName);setMedSearchResult({query:'',items:[],error:''});setImageFiles([]);setDocumentFiles([]);setExistingAttachmentCounts({IMAGE:0,FILE:0});setCompose(true)}}>경험·질문 작성</button></header>
    <section className="community-safety"><strong>다른 사람의 경험을 내 약에 그대로 적용하지 마세요.</strong><div className="community-safety-copy"><p>글은 개인의 경험이에요.</p><p>약을 바꾸거나 먹는 양을 정할 때는 의사·약사와 확인해주세요.</p><p>약을 먹고 생긴 부작용은 공식 신고할 수 있어요.</p></div><a href="https://kaers.drugsafe.or.kr/kaers/report/EgovPubReportReg.do" target="_blank" rel="noreferrer">부작용 공식 신고 ↗</a></section>
    {notice&&<div className="community-notice" role="status"><span>{notice}</span><button type="button" onClick={()=>setNotice('')} aria-label="알림 닫기">×</button></div>}
    <div className="community-toolbar">
      <CommunityPostSearch value={searchText} onChange={changeSearchText} onSearch={searchPosts} onSelect={openPost}
        category={filters.category} sort={filters.sort} medicationId={linkedMedicationId} categories={categories} busy={busy}/>
      <select aria-label="게시글 정렬" value={filters.sort} onChange={event=>{const sort=event.target.value;setFilters(previous=>({...previous,sort,page:1}))}}><option value="LATEST">최신순</option><option value="HELPFUL">도움순</option><option value="COMMENTS">댓글순</option></select>
    </div>
    <div className="community-tabs">{Object.entries(categories).map(([key,label])=><button key={key} aria-pressed={filters.category===key} onClick={()=>setFilters(v=>({...v,category:key,page:1}))}>{label}</button>)}</div>
    <div className="community-layout"><main className="community-feed" aria-busy={loading}>
      {filters.q&&<div className="community-applied-search"><p><strong>“{filters.q}”</strong> 검색 결과</p><button type="button" onClick={()=>changeSearchText('')}>검색 해제</button></div>}
      <div className="community-count">게시글 <strong>{result.total}</strong>건 <span>· 한 페이지에 5개씩</span></div>{loading&&<p className="community-submit-status" role="status"><span className="community-spinner" aria-hidden="true"/>글을 불러오고 있어요…</p>}{!loading&&error&&<p className="community-error" role="alert">{error}</p>}
      {!loading&&!error&&!result.items.length&&<div className="community-empty">{filters.q?'일치하는 글을 찾지 못했어요. 약 이름을 더 짧게 입력하거나 다른 검색어로 찾아보세요.':'아직 등록된 이야기가 없습니다. 첫 경험을 공유해보세요.'}</div>}
      {!loading&&result.items.map(post=><article key={post.postId} className="community-card" role="button" tabIndex={busy?-1:0} aria-disabled={busy} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openPost(post.postId)}}} onClick={()=>openPost(post.postId)}><div className="community-card-top"><span className={'community-type '+post.category}>{categories[post.category]}</span>{post.reviewStatus==='PENDING'&&<span className="community-review">관리자 검토 중</span>}<time>{formatDateTime24(post.createdAt)}</time></div><h2>{post.title}</h2>{post.medicationName&&<button className="community-med" type="button">{post.medicationName}</button>}<p>{post.summary}</p><footer><span className="community-author"><UserAvatar name={post.authorName} imageUrl={post.authorProfileImageUrl}/><span>{post.authorName}</span></span><span>도움 {post.helpfulCount||0}</span><span>댓글 {post.commentCount||0}</span></footer></article>)}
      <nav className="community-pagination" aria-label="게시글 페이지"><button type="button" disabled={loading||result.page<=1} onClick={()=>setFilters(v=>({...v,page:result.page-1}))}>이전</button><div className="community-page-numbers">{pageNumbers.map(pageNumber=><button key={pageNumber} type="button" aria-label={`${pageNumber} 페이지`} aria-current={pageNumber===result.page?'page':undefined} disabled={loading} onClick={()=>setFilters(v=>({...v,page:pageNumber}))}>{pageNumber}</button>)}</div><button type="button" disabled={loading||!result.hasMore} onClick={()=>setFilters(v=>({...v,page:result.page+1}))}>다음</button><span className="community-pagination-status" aria-live="polite" aria-atomic="true">{loading?'불러오는 중…':`${result.page} / ${result.totalPages} 페이지`}</span></nav>
    </main><aside className="community-side"><h3>안전한 약 이야기</h3><ul><li>효과와 부작용은 개인마다 달라요.</li><li>약을 먹는 양을 바꾸기 전에 의사·약사에게 물어보세요.</li><li>약을 팔거나 다른 사람에게 주고받으면 안 돼요.</li><li>처방전 사진의 이름·전화번호 같은 개인정보는 가려주세요.</li></ul><Link to="/chat">약 정보 물어보기 →</Link>{isAdmin&&<button className="community-admin-open" onClick={()=>setAdminOpen(true)}>관리자 신고함 열기</button>}</aside></div>

    {compose&&<CommunityPostComposer editingId={editingId} form={form} onFormChange={setForm} categories={categories}
      medQuery={medQuery} onMedQueryChange={value=>{setMedQuery(value);setForm(previous=>({...previous,medicationId:'',medicationName:value}))}}
      meds={meds} medSearching={medSearching} medSearchError={medSearchError}
      onSelectMedication={medication=>{setForm(previous=>({...previous,medicationId:medication.medicationId,medicationName:medication.itemName}));setMedQuery(medication.itemName)}}
      imageFiles={imageFiles} documentFiles={documentFiles} existingAttachmentCounts={existingAttachmentCounts} onChooseFiles={chooseFiles}
      submitting={submitting} progress={pendingLabel} onClose={()=>{if(!busy){setCompose(false);setEditingId(null)}}} onSubmit={submitPost} formRef={composeRef}/>}

    {selected&&<div className="community-modal" onMouseDown={()=>{if(!busy){setSelected(null);setReplyTarget(null)}}}><article className="community-detail" aria-busy={busy} onMouseDown={e=>e.stopPropagation()}><button className="community-close" aria-label="게시글 닫기" disabled={busy} onClick={()=>{setSelected(null);setReplyTarget(null)}}>×</button><div className="community-card-top"><span className={'community-type '+selected.category}>{categories[selected.category]}</span><time>{formatDateTime24(selected.createdAt)}</time></div><h2>{selected.title}</h2>{selected.medicationName&&<div className="community-official"><strong>연결된 공식 제품</strong><span>{selected.medicationName}</span><Link to={'/chat?medicationId='+encodeURIComponent(selected.medicationId||'')}>약 정보 물어보기 →</Link></div>}<div className="community-detail-author"><UserAvatar name={selected.authorName} imageUrl={selected.authorProfileImageUrl} size="large"/><div><strong>{selected.authorName}</strong><span>{selected.ageGroup&&<>{selected.ageGroup}</>}{selected.ageGroup&&selected.experienceDuration&&<> · </>}{selected.experienceDuration&&<>복용 {selected.experienceDuration}</>}</span></div></div><p className="community-content">{selected.content}</p>{selected.attachments?.some(a=>a.attachmentType==='IMAGE')&&<div className="community-image-gallery">{selected.attachments.filter(a=>a.attachmentType==='IMAGE').map(a=><figure key={a.attachmentId}><a href={a.url} target="_blank" rel="noreferrer"><img src={a.url} alt={a.originalName}/></a>{(Number(selected.authorId)===Number(user?.userId)||isAdmin)&&<button disabled={busy} onClick={()=>deleteAttachment(a.attachmentId)}>이미지 삭제</button>}</figure>)}</div>}{selected.attachments?.some(a=>a.attachmentType==='FILE')&&<div className="community-files"><strong>첨부파일</strong>{selected.attachments.filter(a=>a.attachmentType==='FILE').map(a=><div key={a.attachmentId}><a href={a.url}>{a.originalName} <small>{(Number(a.fileSize)/1024).toFixed(1)}KB</small></a>{(Number(selected.authorId)===Number(user?.userId)||isAdmin)&&<button disabled={busy} onClick={()=>deleteAttachment(a.attachmentId)}>삭제</button>}</div>)}</div>}<div className="community-detail-actions"><button disabled={busy} aria-busy={pendingLabel==='도움 표시를 반영하고 있어요…'} className={selected.helpfulByMe?'active':''} onClick={toggleHelpful}>도움됐어요 {selected.helpfulCount||0}</button><button disabled={busy} onClick={()=>report('POST',selected.postId)}>신고</button>{selectedIsMine&&<button disabled={busy} onClick={editPost}>수정</button>}{(selectedIsMine||isAdmin)&&<button disabled={busy} className="community-delete-action" onClick={deletePost}>{isAdmin&&!selectedIsMine?'관리자로 삭제':'삭제'}</button>}{isAdmin&&<button disabled={busy} onClick={()=>{setSelected(null);setAdminOpen(true)}}>관리자 센터에서 관리</button>}</div><section className="community-comments"><h3>댓글 {selected.comments?.length||0}</h3><CommentThread comments={selected.comments||[]} userId={user?.userId} canWrite={canWrite} busy={busy} onReply={target=>{setReplyTarget(target);setComment('')}} onHelpful={toggleCommentHelpful} onReport={report} onDelete={deleteComment}/>{canWrite?<form noValidate onSubmit={submitComment} aria-busy={busy}>{replyTarget&&<div className="community-reply-target"><span><strong>{replyTarget.authorName}</strong>님에게 답글 작성 중</span><button type="button" disabled={busy} onClick={()=>setReplyTarget(null)}>취소</button></div>}<textarea ref={commentRef} disabled={busy} aria-label={replyTarget?'답글 내용':'댓글 내용'} aria-invalid={comment.trim().length>1000} aria-describedby="community-comment-count" required value={comment} onChange={e=>setComment(e.target.value)} placeholder={replyTarget?replyTarget.authorName+'님에게 답글을 남겨주세요.':'개인의 경험을 존중하며 답변해주세요.'}/><CommunityFieldCount id="community-comment-count" value={comment} limit={1000}/><button disabled={busy} aria-busy={Boolean(pendingLabel)&&!dialogBusy}>{busy?'처리 중…':replyTarget?'답글 등록':'댓글 등록'}</button></form>:<p><Link to="/login?next=/community">로그인</Link> 후 댓글을 작성할 수 있습니다.</p>}</section></article></div>}

    {pendingLabel&&!submitting&&(!dialogBusy||!dialog)&&<div className="community-progress" role="status" aria-live="polite"><span className="community-spinner" aria-hidden="true"/>{pendingLabel}</div>}
    {isAdmin&&adminOpen&&<AdminPage modal onClose={()=>setAdminOpen(false)}/>}
    <UiDialog open={Boolean(dialog)} title={dialog?.title} description={dialog?.type==='report'?'신고 사유를 구체적으로 적어주세요. 작성한 내용은 관리자에게 전달됩니다.':dialog?.description} confirmLabel={dialog?.type==='report'?'신고 접수':dialog?.confirmLabel} tone={dialog?.type==='confirm'?'danger':'default'} busy={dialogBusy} onCancel={()=>{if(!dialogBusy)setDialog(null)}} onConfirm={runDialogAction}>
      {dialog?.type==='report'&&<><textarea disabled={dialogBusy} data-dialog-initial-focus maxLength="500" value={reportDraft} onChange={event=>{setReportDraft(event.target.value);setReportError('')}} placeholder="예: 사실과 다른 복용 정보를 안내하고 있습니다."/><div className="ui-dialog-field-meta"><span className="ui-dialog-field-error">{reportError}</span><span>{reportDraft.length}/500</span></div></>}
    </UiDialog>
    <UiDialog open={Boolean(feedback)} title={feedback?.title} description={feedback?.message} confirmLabel="확인" cancelLabel="" tone="danger" onConfirm={closeFeedback} onCancel={closeFeedback}/>
  </div>
}


