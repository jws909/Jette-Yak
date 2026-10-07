import test from 'node:test'
import assert from 'node:assert/strict'
import { POST_FIELD_LIMITS, validatePost, validateAttachments } from './communityValidation.js'

const validPost = { category: 'EXPERIENCE', title: '복용 경험', content: '먹은 경험을 나눕니다.' }
const file = (name = '안내.pdf', size = 1, type = 'application/pdf') => ({ name, size, type })

test('모든 작성 필드의 정확한 글자 한도는 통과하고 한 글자 초과는 구체적으로 안내', () => {
  assert.deepEqual(POST_FIELD_LIMITS, { title: 150, content: 4000, medicationName: 150, experienceDuration: 50, ageGroup: 30, purpose: 100, occurrenceTiming: 80, medicationId: 30 })
  for (const [field, max] of Object.entries(POST_FIELD_LIMITS)) {
    assert.equal(validatePost({ ...validPost, [field]: '가'.repeat(max) }), null, field)
    const error = validatePost({ ...validPost, [field]: '가'.repeat(max + 1) })
    assert.equal(error.field, field)
    assert.match(error.message, /1자를 줄여 주세요/)
    assert.ok(error.message.includes(String(max)), field)
  }
})

test('필수 입력은 공백만 있으면 거절하고 선택 입력의 빈 값은 허용', () => {
  assert.equal(validatePost({ ...validPost, title: ' \n\t ' }).field, 'title')
  assert.equal(validatePost({ ...validPost, content: ' \n\t ' }).field, 'content')
  assert.equal(validatePost({ ...validPost, purpose: '   ', experienceDuration: null }), null)
  assert.equal(validatePost({ ...validPost, title: ` ${'가'.repeat(150)} ` }), null)
})

test('서버와 같이 UTF-16 길이를 사용하며 허용된 유형만 통과', () => {
  assert.equal(validatePost({ ...validPost, title: '💊'.repeat(75) }), null)
  assert.equal(validatePost({ ...validPost, title: '💊'.repeat(76) }).field, 'title')
  for (const category of ['EXPERIENCE', 'QUESTION', 'SIDE_EFFECT', 'INFO_REPORT']) {
    assert.equal(validatePost({ ...validPost, category }), null)
  }
  assert.equal(validatePost({ ...validPost, category: 'ALL' }).field, 'category')
  assert.equal(validatePost(null).field, 'category')
})

test('첨부가 없으면 기존 5개가 있어도 통과하고 기존 첨부와 새 파일 수를 합산', () => {
  assert.equal(validateAttachments('IMAGE', [], 5), null)
  assert.equal(validateAttachments('FILE', null, 5), null)
  assert.equal(validateAttachments('IMAGE', [file('사진.png', 1, 'image/png')], 4), null)
  assert.equal(validateAttachments('IMAGE', [file('사진.png', 1, 'image/png')], 5).field, 'imageFiles')
  assert.equal(validateAttachments('FILE', Array.from({ length: 6 }, () => file())).field, 'documentFiles')
  assert.match(validateAttachments('FILE', [file(), file()], 4).message, /1개를 줄여 주세요/)
})

test('이미지와 일반 파일은 각각 정확한 5MB와 10MB까지만 허용', () => {
  assert.equal(validateAttachments('IMAGE', [file('사진.png', 5 * 1024 * 1024, 'image/png')]), null)
  assert.equal(validateAttachments('IMAGE', [file('사진.png', 5 * 1024 * 1024 + 1, 'image/png')]).field, 'imageFiles')
  assert.equal(validateAttachments('FILE', [file('문서.pdf', 10 * 1024 * 1024)]), null)
  assert.equal(validateAttachments('FILE', [file('문서.pdf', 10 * 1024 * 1024 + 1)]).field, 'documentFiles')
})

test('빈 파일과 잘못된 파일 정보 또는 첨부 유형은 거절', () => {
  assert.match(validateAttachments('FILE', [file('빈 문서.pdf', 0)]).message, /비어/)
  assert.equal(validateAttachments('FILE', [null]).field, 'documentFiles')
  assert.equal(validateAttachments('OTHER', [file()]).field, 'documentFiles')
})

test('이미지는 MIME과 확장자를 함께 확인하고 지원 형식·대문자 파일명을 허용', () => {
  for (const [extension, mime] of [['jpg', 'image/jpeg'], ['jpeg', 'image/jpeg'], ['png', 'image/png'], ['gif', 'image/gif'], ['webp', 'image/webp']]) {
    assert.equal(validateAttachments('IMAGE', [file(`사진.${extension.toUpperCase()}`, 1, mime)]), null)
  }
  assert.equal(validateAttachments('IMAGE', [file('사진.png', 1, 'application/pdf')]).field, 'imageFiles')
  assert.equal(validateAttachments('IMAGE', [file('사진.svg', 1, 'image/png')]).field, 'imageFiles')
  assert.equal(validateAttachments('IMAGE', [file('사진', 1, 'image/png')]).field, 'imageFiles')
})

test('일반 파일은 서버와 동일한 실행 확장자를 차단하고 문서·압축파일은 허용', () => {
  for (const extension of ['exe', 'com', 'bat', 'cmd', 'msi', 'scr', 'js', 'jar', 'ps1', 'vbs', 'sh', 'dll']) {
    assert.equal(validateAttachments('FILE', [file(`파일.${extension.toUpperCase()}`)]).field, 'documentFiles', extension)
  }
  for (const name of ['문서.pdf', '문서.docx', '자료.zip', '설명.txt']) {
    assert.equal(validateAttachments('FILE', [file(name)]), null)
  }
})
