package com.app.community.dto;

public record CommunityAttachmentFile(byte[] bytes, String originalName, String contentType, boolean image) {}
