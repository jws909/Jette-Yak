/**
 * 커뮤니티 작성 화면의 사전 검증
 * 서버와 동일하게 양끝 공백을 뺀 문자열의 UTF-16 길이를 사용하고 입력값 자체는 변경하지 않음
 */
export const POST_FIELD_LIMITS = {
  title: 150,
  content: 4000,
  medicationName: 150,
  experienceDuration: 50,
  ageGroup: 30,
  purpose: 100,
  occurrenceTiming: 80,
  medicationId: 30,
}

const fieldNames = {
  title: '제목',
  content: '내용',
  medicationName: '약 이름',
  experienceDuration: '복용 기간',
  ageGroup: '연령대',
  purpose: '복용 목적',
  occurrenceTiming: '발생 시점',
  medicationId: '연결한 약의 코드',
}
const categories = new Set(['EXPERIENCE', 'QUESTION', 'SIDE_EFFECT', 'INFO_REPORT'])
const imageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
const imageExtensions = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp'])
const blockedExtensions = new Set(['exe', 'com', 'bat', 'cmd', 'msi', 'scr', 'js', 'jar', 'ps1', 'vbs', 'sh', 'dll'])
const trimValue = value => String(value ?? '').trim()

/** 처음 발견한 입력 오류만 반환해 사용자가 한 항목씩 바로 고칠 수 있게 안내 */
export function validatePost(form) {
  if (!categories.has(trimValue(form?.category))) {
    return { field: 'category', message: '글 유형을 선택해 주세요.' }
  }
  for (const [field, limit] of Object.entries(POST_FIELD_LIMITS)) {
    const value = trimValue(form?.[field])
    if ((field === 'title' || field === 'content') && !value) {
      return { field, message: `${fieldNames[field]}을 입력해 주세요.` }
    }
    if (value.length > limit) {
      return {
        field,
        message: `${fieldNames[field]}${field === 'ageGroup' ? '는' : '은'} ${limit}자까지 입력할 수 있어요.\n현재 ${value.length}자로, ${value.length - limit}자를 줄여 주세요.`,
      }
    }
  }
  return null
}

/**
 * 파일을 글 저장 전에 검사해 첨부 오류 때문에 본문만 먼저 저장되는 상황 방지
 * 기존 파일 수까지 합산. 이미지 실제 내용 검사와 최종 권한 검증은 서버가 다시 수행
 */
export function validateAttachments(type, files, existingCount = 0) {
  const selectedFiles = Array.from(files ?? [])
  if (!selectedFiles.length) return null
  const normalizedType = trimValue(type).toUpperCase()
  const isImage = normalizedType === 'IMAGE'
  const field = isImage ? 'imageFiles' : 'documentFiles'
  const topic = isImage ? '이미지는' : '일반 파일은'
  if (normalizedType !== 'IMAGE' && normalizedType !== 'FILE') {
    return { field, message: '첨부파일 종류를 확인해 주세요.' }
  }
  const count = Math.max(0, Math.floor(Number(existingCount) || 0)) + selectedFiles.length
  if (count > 5) {
    return { field, message: `${topic} 기존 첨부파일을 포함해 5개까지 등록할 수 있어요.\n현재 ${count}개로, ${count - 5}개를 줄여 주세요.` }
  }
  const maxMegabytes = isImage ? 5 : 10
  const maxSize = maxMegabytes * 1024 * 1024
  for (const file of selectedFiles) {
    const fileName = trimValue(file?.name) || '이름 없는 파일'
    if (!Number.isFinite(file?.size) || file.size <= 0) {
      return { field, message: `“${fileName}” 파일이 비어 있거나 파일 정보를 확인할 수 없어요.\n다른 파일을 선택해 주세요.` }
    }
    if (file.size > maxSize) {
      return { field, message: `“${fileName}” 파일이 너무 커요.\n${topic} 파일 하나당 ${maxMegabytes}MB까지 등록할 수 있어요.` }
    }
    const dot = fileName.lastIndexOf('.')
    const extension = dot < 0 ? '' : fileName.slice(dot + 1).toLowerCase()
    if (isImage && (!imageMimeTypes.has(String(file.type ?? '').toLowerCase()) || !imageExtensions.has(extension))) {
      return { field, message: `“${fileName}”은 올릴 수 있는 이미지 형식이 아니에요.\nJPG, PNG, GIF, WEBP 이미지를 선택해 주세요.` }
    }
    if (!isImage && blockedExtensions.has(extension)) {
      return { field, message: `“${fileName}”은 실행 가능한 파일이어서 첨부할 수 없어요.\n문서, PDF, 압축파일 등을 선택해 주세요.` }
    }
  }
  return null
}
