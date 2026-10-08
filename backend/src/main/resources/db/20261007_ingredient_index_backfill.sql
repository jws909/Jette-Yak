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
