-- 앱 종료 후 알림용 기기 구독과 전송 기록. SQL Developer에서 스크립트 실행(F5)
-- 이미 생성된 객체는 유지. 사용자 삭제·구독 해제 시 연결된 전송 기록도 정리
BEGIN
  EXECUTE IMMEDIATE 'CREATE SEQUENCE push_subscription_seq START WITH 1 INCREMENT BY 1 NOCACHE';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
END;
/
BEGIN
  EXECUTE IMMEDIATE 'CREATE SEQUENCE push_delivery_seq START WITH 1 INCREMENT BY 1 NOCACHE';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
END;
/
BEGIN
  EXECUTE IMMEDIATE '
    CREATE TABLE user_push_subscriptions (
      subscription_id NUMBER(19) PRIMARY KEY,
      user_id NUMBER NOT NULL,
      endpoint VARCHAR2(2048 BYTE) NOT NULL,
      endpoint_hash VARCHAR2(64 BYTE) NOT NULL,
      public_key VARCHAR2(100 BYTE) NOT NULL,
      auth_secret VARCHAR2(30 BYTE) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
      CONSTRAINT uq_push_endpoint UNIQUE(endpoint_hash),
      CONSTRAINT fk_push_user FOREIGN KEY(user_id) REFERENCES users(user_id) ON DELETE CASCADE
    )';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
END;
/
BEGIN
  EXECUTE IMMEDIATE '
    CREATE TABLE push_deliveries (
      delivery_id NUMBER(19) PRIMARY KEY,
      subscription_id NUMBER(19) NOT NULL,
      dose_date VARCHAR2(10 BYTE) NOT NULL,
      dose_time VARCHAR2(5 BYTE) NOT NULL,
      reminder_kind VARCHAR2(3 BYTE) NOT NULL,
      status VARCHAR2(8 BYTE) NOT NULL,
      attempts NUMBER(1) DEFAULT 0 NOT NULL,
      next_attempt_at TIMESTAMP NOT NULL,
      lease_until TIMESTAMP,
      claim_token VARCHAR2(36 BYTE),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
      delivered_at TIMESTAMP,
      CONSTRAINT uq_push_delivery UNIQUE(subscription_id,dose_date,dose_time,reminder_kind),
      CONSTRAINT fk_push_delivery_sub FOREIGN KEY(subscription_id) REFERENCES user_push_subscriptions(subscription_id) ON DELETE CASCADE,
      CONSTRAINT ck_push_delivery_kind CHECK(reminder_kind IN (''PRE'',''DUE'')),
      CONSTRAINT ck_push_delivery_status CHECK(status IN (''PENDING'',''SENDING'',''RETRY'',''SENT'',''FAILED'')),
      CONSTRAINT ck_push_delivery_attempt CHECK(attempts BETWEEN 0 AND 3)
    )';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
END;
/
BEGIN
  EXECUTE IMMEDIATE 'CREATE INDEX ix_push_user ON user_push_subscriptions(user_id)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
END;
/
BEGIN
  EXECUTE IMMEDIATE 'CREATE INDEX ix_push_delivery_created ON push_deliveries(created_at)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
END;
/
COMMIT;
