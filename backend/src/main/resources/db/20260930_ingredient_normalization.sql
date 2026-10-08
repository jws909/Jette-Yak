-- DUR 정확도 개선용 1회 마이그레이션 (Oracle)
-- 1) 제품/DUR 원문 성분을 표준 성분 ID로 연결한다.
-- 2) 검증된 별칭만 DUR 비교에 사용한다.
-- 3) 기존 영양제 중 제품명이 정확히 하나의 의약품과 일치하는 기록만 제품에 연결한다.

BEGIN
  EXECUTE IMMEDIATE 'CREATE SEQUENCE ingredient_master_seq START WITH 1 INCREMENT BY 1 NOCACHE';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE '
    CREATE TABLE ingredient_master (
      ingredient_id NUMBER(19) PRIMARY KEY,
      canonical_name VARCHAR2(500 BYTE) NOT NULL,
      normalized_name VARCHAR2(500 BYTE) NOT NULL,
      created_at DATE DEFAULT SYSDATE NOT NULL,
      updated_at DATE DEFAULT SYSDATE NOT NULL,
      CONSTRAINT uq_ingredient_master_normalized UNIQUE (normalized_name)
    )';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE '
    CREATE TABLE ingredient_aliases (
      normalized_alias VARCHAR2(500 BYTE) PRIMARY KEY,
      ingredient_id NUMBER(19) NOT NULL,
      alias_name VARCHAR2(500 BYTE) NOT NULL,
      source VARCHAR2(20 BYTE) DEFAULT ''AUTO_EXACT'' NOT NULL,
      verified NUMBER(1) DEFAULT 1 NOT NULL,
      created_at DATE DEFAULT SYSDATE NOT NULL,
      CONSTRAINT fk_ingredient_alias_master FOREIGN KEY (ingredient_id)
        REFERENCES ingredient_master(ingredient_id),
      CONSTRAINT ck_ingredient_alias_verified CHECK (verified IN (0, 1))
    )';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE '
    CREATE TABLE medication_ingredients (
      medication_id VARCHAR2(20 BYTE) NOT NULL,
      normalized_raw_name VARCHAR2(500 BYTE) NOT NULL,
      raw_name VARCHAR2(500 BYTE) NOT NULL,
      ingredient_id NUMBER(19),
      match_status VARCHAR2(20 BYTE) DEFAULT ''EXACT'' NOT NULL,
      updated_at DATE DEFAULT SYSDATE NOT NULL,
      CONSTRAINT pk_medication_ingredients PRIMARY KEY (medication_id, normalized_raw_name),
      CONSTRAINT fk_med_ing_medication FOREIGN KEY (medication_id) REFERENCES medications(medication_id),
      CONSTRAINT fk_med_ing_ingredient FOREIGN KEY (ingredient_id) REFERENCES ingredient_master(ingredient_id),
      CONSTRAINT ck_med_ing_status CHECK (match_status IN (''EXACT'', ''ALIAS'', ''UNMATCHED''))
    )';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'ALTER TABLE routine_medications ADD (medication_id VARCHAR2(20 BYTE))';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -1430 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'ALTER TABLE routine_medications ADD CONSTRAINT fk_routine_medication FOREIGN KEY (medication_id) REFERENCES medications(medication_id)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE NOT IN (-2264, -2275) THEN RAISE; END IF;
END;
/

-- 제품과 DUR 양쪽에 등장하는 원문을 우선 각자의 표준 성분으로 등록한다.
-- 한글/영문, 무수물/수화물처럼 의미 판단이 필요한 값은 자동 병합하지 않는다.
DECLARE
  v_id NUMBER;
BEGIN
  FOR r IN (
    SELECT normalized_name, MIN(raw_name) KEEP (DENSE_RANK FIRST ORDER BY raw_name) raw_name
    FROM (
      SELECT TRIM(REGEXP_SUBSTR(m.material_name, '[^/;|]+', 1, LEVEL)) raw_name,
             LOWER(REGEXP_REPLACE(TRIM(REGEXP_SUBSTR(m.material_name, '[^/;|]+', 1, LEVEL)), '[[:space:][:punct:]]', '')) normalized_name
      FROM medications m
      WHERE m.material_name IS NOT NULL
      CONNECT BY LEVEL <= REGEXP_COUNT(m.material_name, '[/;|]') + 1
             AND PRIOR m.medication_id = m.medication_id
             AND PRIOR SYS_GUID() IS NOT NULL
      UNION ALL
      SELECT TRIM(ingr_a_name), LOWER(REGEXP_REPLACE(TRIM(ingr_a_name), '[[:space:][:punct:]]', ''))
      FROM medication_interactions WHERE ingr_a_name IS NOT NULL
      UNION ALL
      SELECT TRIM(ingr_b_name), LOWER(REGEXP_REPLACE(TRIM(ingr_b_name), '[[:space:][:punct:]]', ''))
      FROM medication_interactions WHERE ingr_b_name IS NOT NULL
    )
    WHERE normalized_name IS NOT NULL AND LENGTH(normalized_name) > 0
    GROUP BY normalized_name
  ) LOOP
    BEGIN
      SELECT ingredient_id INTO v_id FROM ingredient_aliases WHERE normalized_alias = r.normalized_name;
    EXCEPTION WHEN NO_DATA_FOUND THEN
      v_id := ingredient_master_seq.NEXTVAL;
      INSERT INTO ingredient_master (ingredient_id, canonical_name, normalized_name)
      VALUES (v_id, r.raw_name, r.normalized_name);
      INSERT INTO ingredient_aliases (normalized_alias, ingredient_id, alias_name, source, verified)
      VALUES (r.normalized_name, v_id, r.raw_name, 'AUTO_EXACT', 1);
    END;
  END LOOP;
END;
/

-- 단일 성분 제품의 제품명 괄호 표기가 실제 DUR 성분과 정확히 일치하면
-- 영문 원료명과 한글 DUR명을 같은 표준 성분으로 연결한다.
-- 하나의 한글 표기에 서로 다른 원료 후보가 생기면 자동 연결 대상에서 제외한다.
MERGE INTO ingredient_aliases target
USING (
  SELECT label_normalized, MIN(material_ingredient_id) material_ingredient_id
  FROM (
    SELECT LOWER(REGEXP_REPLACE(TRIM(REGEXP_SUBSTR(m.item_name, '\(([^()]*)\)', 1, 1, NULL, 1)),
                                '[[:space:][:punct:]]', '')) label_normalized,
           material_alias.ingredient_id material_ingredient_id
    FROM medications m
    JOIN ingredient_aliases material_alias
      ON material_alias.verified = 1
     AND material_alias.normalized_alias =
         LOWER(REGEXP_REPLACE(TRIM(m.material_name), '[[:space:][:punct:]]', ''))
    WHERE REGEXP_COUNT(m.material_name, '[/;|]') = 0
      AND REGEXP_SUBSTR(m.item_name, '\(([^()]*)\)', 1, 1, NULL, 1) IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM medication_interactions d
        WHERE LOWER(REGEXP_REPLACE(TRIM(d.ingr_a_name), '[[:space:][:punct:]]', '')) =
              LOWER(REGEXP_REPLACE(TRIM(REGEXP_SUBSTR(m.item_name, '\(([^()]*)\)', 1, 1, NULL, 1)), '[[:space:][:punct:]]', ''))
           OR (d.taboo_type = 4 AND LOWER(REGEXP_REPLACE(TRIM(d.ingr_b_name), '[[:space:][:punct:]]', '')) =
              LOWER(REGEXP_REPLACE(TRIM(REGEXP_SUBSTR(m.item_name, '\(([^()]*)\)', 1, 1, NULL, 1)), '[[:space:][:punct:]]', '')))
      )
  )
  WHERE label_normalized IS NOT NULL AND LENGTH(label_normalized) > 0
  GROUP BY label_normalized
  HAVING COUNT(DISTINCT material_ingredient_id) = 1
) link
ON (target.normalized_alias = link.label_normalized)
WHEN MATCHED THEN UPDATE SET
  target.ingredient_id = link.material_ingredient_id,
  target.source = 'PRODUCT_LABEL',
  target.verified = 1;

-- 기존 성분 연결 복구 전용 (20260930 성분 테이블을 준비한 Oracle 환경)
-- 사용자·처방전·상비약·영양제 기록과 성분 사전/검증 별칭은 변경하지 않음
-- 같은 제품에서 공백·기호만 다른 원문 성분은 정규화 키로 먼저 묶어 PK 충돌 방지
-- 기존 연결을 전체 삭제하지 않는 MERGE라 실패 시 현재 데이터가 유지됨
-- 검증된 별칭만 연결. 번역, 수화물/염/제형 차이의 자동 병합은 수행하지 않음
-- 실행 도구는 전체 작업 성공 후 COMMIT, 실패하면 ROLLBACK 필요

MERGE INTO medication_ingredients target
USING (
  WITH part_numbers AS (
    -- 제품별 계층 쿼리 대신 최대 성분 수만큼 번호를 한 번 생성
    SELECT LEVEL part_no FROM dual
    CONNECT BY LEVEL <= (
      SELECT NVL(MAX(REGEXP_COUNT(material_name, '[/;|]')), 0) + 1
      FROM medications
    )
  ), parsed AS (
    SELECT m.medication_id,
           TRIM(REGEXP_SUBSTR(m.material_name, '[^/;|]+', 1, n.part_no)) raw_name
    FROM medications m
    JOIN part_numbers n ON n.part_no <= REGEXP_COUNT(m.material_name, '[/;|]') + 1
    WHERE m.material_name IS NOT NULL
  ), grouped AS (
    SELECT medication_id,
           LOWER(REGEXP_REPLACE(raw_name, '[[:space:][:punct:]]', '')) normalized_name,
           MIN(raw_name) raw_name
    FROM parsed
    WHERE raw_name IS NOT NULL
    GROUP BY medication_id,
             LOWER(REGEXP_REPLACE(raw_name, '[[:space:][:punct:]]', ''))
  )
  SELECT p.medication_id, p.normalized_name, p.raw_name, a.ingredient_id,
         CASE
           WHEN a.ingredient_id IS NULL THEN 'UNMATCHED'
           WHEN a.source = 'AUTO_EXACT' THEN 'EXACT'
           ELSE 'ALIAS'
         END match_status
  FROM grouped p
  LEFT JOIN ingredient_aliases a
    ON a.normalized_alias = p.normalized_name AND a.verified = 1
  WHERE p.normalized_name IS NOT NULL
) source
ON (target.medication_id = source.medication_id
    AND target.normalized_raw_name = source.normalized_name)
WHEN MATCHED THEN UPDATE SET
  target.raw_name = source.raw_name,
  target.ingredient_id = source.ingredient_id,
  target.match_status = source.match_status,
  target.updated_at = SYSDATE
  WHERE target.raw_name <> source.raw_name
     OR DECODE(target.ingredient_id, source.ingredient_id, 0, 1) = 1
     OR target.match_status <> source.match_status
WHEN NOT MATCHED THEN INSERT (
  medication_id, normalized_raw_name, raw_name, ingredient_id, match_status, updated_at
) VALUES (
  source.medication_id, source.normalized_name, source.raw_name,
  source.ingredient_id, source.match_status, SYSDATE
);


-- 과거 코드가 제품 ID를 버린 영양제 기록을 복구한다.
-- 공백/기호를 제외한 제품명이 정확히 일치하고 후보가 하나뿐인 경우만 연결한다.
MERGE INTO routine_medications r
USING (
  SELECT normalized_item_name, MIN(medication_id) medication_id
  FROM (
    SELECT medication_id,
           LOWER(REGEXP_REPLACE(TRIM(item_name), '[[:space:][:punct:]]', '')) normalized_item_name,
           COUNT(*) OVER (PARTITION BY LOWER(REGEXP_REPLACE(TRIM(item_name), '[[:space:][:punct:]]', ''))) candidate_count
    FROM medications
  )
  WHERE candidate_count = 1
  GROUP BY normalized_item_name
) m
ON (r.medication_id IS NULL
    AND LOWER(REGEXP_REPLACE(TRIM(r.supplement_name), '[[:space:][:punct:]]', '')) = m.normalized_item_name)
WHEN MATCHED THEN UPDATE SET r.medication_id = m.medication_id;

BEGIN
  EXECUTE IMMEDIATE 'CREATE INDEX ix_medication_ingredients_ing ON medication_ingredients(ingredient_id)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
END;
/
BEGIN
  EXECUTE IMMEDIATE 'CREATE INDEX ix_ingredient_alias_ing ON ingredient_aliases(ingredient_id)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
END;
/
BEGIN
  EXECUTE IMMEDIATE 'CREATE INDEX ix_routine_medication_id ON routine_medications(medication_id)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

COMMIT;

-- 사람이 검증한 별칭을 추가할 때 사용하는 예시:
-- INSERT INTO ingredient_aliases(normalized_alias, ingredient_id, alias_name, source, verified)
-- SELECT '검증한정규화별칭', ingredient_id, '화면에 표시할 별칭', 'MANUAL', 1
-- FROM ingredient_master WHERE normalized_name = '연결할표준성분';
-- 별칭을 추가한 뒤 20261007_ingredient_index_backfill.sql의 MERGE를 다시 실행하면 기존 제품에도 적용된다.
