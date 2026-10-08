-- 커뮤니티 게시글 이미지·일반 파일 첨부 기능 추가 (Oracle)
CREATE SEQUENCE community_attachments_seq START WITH 1 INCREMENT BY 1 NOCACHE;

CREATE TABLE community_attachments (
    attachment_id NUMBER PRIMARY KEY,
    post_id NUMBER NOT NULL REFERENCES community_posts(post_id),
    uploader_id NUMBER NOT NULL REFERENCES users(user_id),
    attachment_type VARCHAR2(10) NOT NULL CHECK (attachment_type IN ('IMAGE','FILE')),
    original_name VARCHAR2(255) NOT NULL,
    stored_name VARCHAR2(100) NOT NULL UNIQUE,
    content_type VARCHAR2(100) NOT NULL,
    file_size NUMBER NOT NULL CHECK (file_size >= 0),
    created_at DATE DEFAULT SYSDATE NOT NULL
);

CREATE INDEX ix_community_attachments_post ON community_attachments(post_id,attachment_type,created_at);
COMMIT;
