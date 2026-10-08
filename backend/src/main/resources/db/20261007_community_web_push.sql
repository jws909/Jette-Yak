-- 댓글·도움 표시·관리자 처리 알림의 기기별 발송 상태. 기존 두 푸시 테이블과 user_notifications 생성 후 실행
-- 재실행 시 기존 알림·구독·발송 결과 유지. 사용자 본문과 개인정보를 이 테이블에 복사하지 않음
-- 예전 created_at은 JDBC 세션 시간대의 영향을 받았으므로 재해석하지 않고 커뮤니티 참여 기준만 UTC로 별도 기록
-- 기존 기기는 이 기능을 적용한 시각부터, 새 기기는 구독을 만든 시각부터 새 커뮤니티 알림 수신
BEGIN
  EXECUTE IMMEDIATE 'ALTER TABLE user_push_subscriptions ADD community_started_at TIMESTAMP DEFAULT SYS_EXTRACT_UTC(SYSTIMESTAMP) NOT NULL';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -1430 THEN RAISE; END IF;
END;
/
BEGIN
  EXECUTE IMMEDIATE '
    CREATE TABLE community_push_deliveries (
      notification_id NUMBER NOT NULL,
      subscription_id NUMBER(19) NOT NULL,
      status VARCHAR2(8 BYTE) NOT NULL,
      attempts NUMBER(1) DEFAULT 0 NOT NULL,
      next_attempt_at TIMESTAMP NOT NULL,
      lease_until TIMESTAMP,
      claim_token VARCHAR2(36 BYTE),
      created_at TIMESTAMP NOT NULL,
      delivered_at TIMESTAMP,
      CONSTRAINT pk_community_push PRIMARY KEY(notification_id,subscription_id),
      CONSTRAINT fk_comm_push_notification FOREIGN KEY(notification_id) REFERENCES user_notifications(notification_id) ON DELETE CASCADE,
      CONSTRAINT fk_comm_push_subscription FOREIGN KEY(subscription_id) REFERENCES user_push_subscriptions(subscription_id) ON DELETE CASCADE,
      CONSTRAINT ck_comm_push_status CHECK(status IN (''PENDING'',''SENDING'',''RETRY'',''SENT'',''FAILED'')),
      CONSTRAINT ck_comm_push_attempt CHECK(attempts BETWEEN 0 AND 3)
    )';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
END;
/
BEGIN
  EXECUTE IMMEDIATE 'CREATE INDEX ix_comm_push_subscription ON community_push_deliveries(subscription_id)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
END;
/
BEGIN
  EXECUTE IMMEDIATE 'CREATE INDEX ix_comm_push_created ON community_push_deliveries(created_at)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
END;
/
COMMIT;
