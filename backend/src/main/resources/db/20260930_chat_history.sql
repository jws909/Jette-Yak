-- 사용자별 챗봇 대화 기록. SQL Developer에서 스크립트 실행(F5)한다.
BEGIN
  EXECUTE IMMEDIATE 'CREATE SEQUENCE chat_conversation_seq START WITH 1 INCREMENT BY 1 NOCACHE';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
END;
/
BEGIN
  EXECUTE IMMEDIATE 'CREATE SEQUENCE chat_message_seq START WITH 1 INCREMENT BY 1 NOCACHE';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE '
    CREATE TABLE chat_conversations (
      conversation_id NUMBER(19) PRIMARY KEY,
      user_id NUMBER NOT NULL,
      title VARCHAR2(100 CHAR) NOT NULL,
      medication_id VARCHAR2(20 BYTE),
      created_at DATE DEFAULT SYSDATE NOT NULL,
      updated_at DATE DEFAULT SYSDATE NOT NULL,
      CONSTRAINT fk_chat_conversation_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
      CONSTRAINT fk_chat_conversation_med FOREIGN KEY (medication_id) REFERENCES medications(medication_id) ON DELETE SET NULL
    )';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE '
    CREATE TABLE chat_messages (
      message_id NUMBER(19) PRIMARY KEY,
      conversation_id NUMBER(19) NOT NULL,
      role VARCHAR2(10 BYTE) NOT NULL,
      content CLOB NOT NULL,
      payload_json CLOB,
      created_at DATE DEFAULT SYSDATE NOT NULL,
      CONSTRAINT fk_chat_message_conversation FOREIGN KEY (conversation_id)
        REFERENCES chat_conversations(conversation_id) ON DELETE CASCADE,
      CONSTRAINT ck_chat_message_role CHECK (role IN (''USER'', ''ASSISTANT''))
    )';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'CREATE INDEX ix_chat_conversation_user ON chat_conversations(user_id, updated_at)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
END;
/
BEGIN
  EXECUTE IMMEDIATE 'CREATE INDEX ix_chat_message_conversation ON chat_messages(conversation_id, message_id)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

COMMIT;
