/**
 * 파일 역할: 저장된 첨부파일의 이름, 경로, MIME 유형, 크기를 전달하는 DTO입니다.
 * 핵심 규칙: IMAGE와 FILE 구분은 화면의 미리보기와 다운로드 표시 방식에 사용됩니다.
 */
package com.app.community.dto;

public record CommunityAttachmentFile(byte[] bytes, String originalName, String contentType, boolean image) {}
