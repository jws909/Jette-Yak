-- 커뮤니티 답글·댓글 좋아요와 사용자 알림 기능을 추가한다.
-- 기존 데이터가 있는 운영 DB에서도 다시 실행할 수 있도록 ORA-00955, ORA-01430을 무시한다.

BEGIN
  EXECUTE IMMEDIATE 'ALTER TABLE community_comments ADD parent_comment_id NUMBER(19)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -1430 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'ALTER TABLE community_comments ADD CONSTRAINT fk_community_comment_parent FOREIGN KEY (parent_comment_id) REFERENCES community_comments(comment_id)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -2261 AND SQLCODE != -2264 AND SQLCODE != -2275 AND SQLCODE != -955 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'ALTER TABLE community_posts ADD review_note VARCHAR2(500 CHAR)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -1430 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'CREATE TABLE community_comment_helpful (
    comment_id NUMBER(19) NOT NULL,
    user_id NUMBER NOT NULL,
    created_at DATE DEFAULT SYSDATE NOT NULL,
    CONSTRAINT pk_community_comment_helpful PRIMARY KEY (comment_id,user_id),
    CONSTRAINT fk_comment_helpful_comment FOREIGN KEY (comment_id) REFERENCES community_comments(comment_id) ON DELETE CASCADE,
    CONSTRAINT fk_comment_helpful_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
  )';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'CREATE SEQUENCE user_notifications_seq START WITH 1 INCREMENT BY 1 NOCACHE';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'CREATE TABLE user_notifications (
    notification_id NUMBER(19) PRIMARY KEY,
    user_id NUMBER NOT NULL,
    actor_id NUMBER,
    notification_type VARCHAR2(40 BYTE) NOT NULL,
    title VARCHAR2(150 CHAR) NOT NULL,
    content VARCHAR2(1000 CHAR) NOT NULL,
    target_type VARCHAR2(30 BYTE),
    target_id NUMBER(19),
    post_id NUMBER(19),
    read_at DATE,
    created_at DATE DEFAULT SYSDATE NOT NULL,
    CONSTRAINT fk_user_notification_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_user_notification_actor FOREIGN KEY (actor_id) REFERENCES users(user_id) ON DELETE SET NULL
  )';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'CREATE INDEX ix_community_comment_parent ON community_comments(post_id,parent_comment_id,status)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'CREATE INDEX ix_user_notification_user ON user_notifications(user_id,read_at,created_at)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

COMMIT;
