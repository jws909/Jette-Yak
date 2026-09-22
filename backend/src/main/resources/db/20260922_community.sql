-- 제때약 커뮤니티 스키마 (Oracle)
CREATE SEQUENCE community_posts_seq START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE community_comments_seq START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE community_reports_seq START WITH 1 INCREMENT BY 1 NOCACHE;

CREATE TABLE community_posts (
    post_id NUMBER PRIMARY KEY,
    user_id NUMBER NOT NULL REFERENCES users(user_id),
    medication_id VARCHAR2(20),
    medication_name VARCHAR2(150),
    category VARCHAR2(20) NOT NULL CHECK (category IN ('EXPERIENCE','QUESTION','SIDE_EFFECT','INFO_REPORT')),
    title VARCHAR2(150) NOT NULL,
    content CLOB NOT NULL,
    experience_duration VARCHAR2(50),
    age_group VARCHAR2(30),
    purpose VARCHAR2(100),
    occurrence_timing VARCHAR2(80),
    currently_taking NUMBER(1) DEFAULT 0 NOT NULL CHECK (currently_taking IN (0,1)),
    review_status VARCHAR2(20) DEFAULT 'NOT_REQUIRED' NOT NULL CHECK (review_status IN ('NOT_REQUIRED','PENDING','APPROVED','REJECTED')),
    status VARCHAR2(20) DEFAULT 'VISIBLE' NOT NULL CHECK (status IN ('VISIBLE','HIDDEN','DELETED')),
    moderated_by NUMBER REFERENCES users(user_id),
    moderated_at DATE,
    created_at DATE DEFAULT SYSDATE NOT NULL,
    updated_at DATE DEFAULT SYSDATE NOT NULL,
    CONSTRAINT fk_community_post_med FOREIGN KEY (medication_id) REFERENCES medications(medication_id)
);

CREATE TABLE community_comments (
    comment_id NUMBER PRIMARY KEY,
    post_id NUMBER NOT NULL REFERENCES community_posts(post_id),
    user_id NUMBER NOT NULL REFERENCES users(user_id),
    content CLOB NOT NULL,
    status VARCHAR2(20) DEFAULT 'VISIBLE' NOT NULL CHECK (status IN ('VISIBLE','HIDDEN','DELETED')),
    created_at DATE DEFAULT SYSDATE NOT NULL,
    updated_at DATE DEFAULT SYSDATE NOT NULL
);

CREATE TABLE community_post_helpful (
    post_id NUMBER NOT NULL REFERENCES community_posts(post_id),
    user_id NUMBER NOT NULL REFERENCES users(user_id),
    created_at DATE DEFAULT SYSDATE NOT NULL,
    CONSTRAINT pk_community_helpful PRIMARY KEY (post_id,user_id)
);

CREATE TABLE community_reports (
    report_id NUMBER PRIMARY KEY,
    reporter_id NUMBER NOT NULL REFERENCES users(user_id),
    target_type VARCHAR2(10) NOT NULL CHECK (target_type IN ('POST','COMMENT')),
    target_id NUMBER NOT NULL,
    reason VARCHAR2(30) NOT NULL CHECK (reason IN ('MISINFORMATION','DANGEROUS_ADVICE','DRUG_SALE','ADVERTISEMENT','ABUSE','PRIVACY','OTHER')),
    detail VARCHAR2(500),
    status VARCHAR2(20) DEFAULT 'PENDING' NOT NULL CHECK (status IN ('PENDING','RESOLVED','DISMISSED')),
    resolution_note VARCHAR2(500),
    resolved_by NUMBER REFERENCES users(user_id),
    resolved_at DATE,
    created_at DATE DEFAULT SYSDATE NOT NULL
);

CREATE INDEX ix_community_posts_created ON community_posts(status,created_at DESC);
CREATE INDEX ix_community_posts_med ON community_posts(medication_id,status);
CREATE INDEX ix_community_comments_post ON community_comments(post_id,status,created_at);
CREATE INDEX ix_community_reports_status ON community_reports(status,created_at);

-- 관리자 계정을 지정할 때 사용한다.
-- UPDATE users SET role='ADMIN' WHERE login_id='관리자아이디';
COMMIT;
