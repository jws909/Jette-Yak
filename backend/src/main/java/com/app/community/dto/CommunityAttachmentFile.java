/**
 * 역할: 다운로드할 첨부파일의 실제 데이터와 응답 헤더 정보 묶음
 * image: true면 브라우저에서 바로 표시, false면 다운로드 응답
 */
package com.app.community.dto;

public record CommunityAttachmentFile(byte[] bytes, String originalName, String contentType, boolean image) {}
