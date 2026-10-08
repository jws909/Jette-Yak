-- 사용자 확인 복용 상태. 기존 처방/상비약/상시약 데이터를 변경하지 않는다.
CREATE TABLE medication_use_states (
 user_id NUMBER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
 registration_id VARCHAR2(50 BYTE) NOT NULL,
 use_status VARCHAR2(16 BYTE) NOT NULL,
 updated_at DATE DEFAULT SYSDATE NOT NULL,
 CONSTRAINT pk_medication_use_states PRIMARY KEY (user_id, registration_id),
 CONSTRAINT ck_medication_use_status CHECK (use_status IN ('ACTIVE','PAUSED','ENDED','STORED'))
);
