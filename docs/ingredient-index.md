# 기존 제품의 성분 연결 복구

## 원인과 영향

성분 사전과 별칭이 있어도 `medication_ingredients` 연결 행이 없으면 챗봇의 임부·노인·연령·병용 조건 제품 검색이 0건으로 보일 수 있다. 기존 적재 구문은 원문까지 `DISTINCT`에 포함해, 같은 제품의 공백·기호만 다른 성분이 동일한 정규화 PK로 두 번 들어갈 수 있었다.

## 이미 성분 테이블을 준비한 DB

`backend/src/main/resources/db/20261007_ingredient_index_backfill.sql`을 실행하고 확인 후 커밋한다. 오류가 나면 롤백한다. 이 파일은 `medication_ingredients`에만 MERGE하며 사용자 약 등록·처방전·성분 사전·별칭은 수정하지 않는다.

```sql
-- 복구 파일 실행 후 확인
SELECT COUNT(*) AS product_ingredient_count FROM medication_ingredients;

SELECT COUNT(DISTINCT mi.medication_id) AS pregnancy_product_count
FROM medication_ingredients mi
JOIN ingredient_aliases a ON a.ingredient_id = mi.ingredient_id AND a.verified = 1
JOIN medication_interactions d
  ON a.normalized_alias = LOWER(REGEXP_REPLACE(TRIM(d.ingr_a_name), '[[:space:][:punct:]]', ''))
WHERE d.taboo_type = 1;
```

같은 파일을 다시 실행해도 중복되지 않고, 원문·성분 연결·상태가 같은 행의 수정 시각은 바뀌지 않는다. 새로 검증된 별칭이 있으면 기존 제품 연결에 반영한다. 수화물·염·언어 차이는 의미를 추정해 합치지 않고 검증된 별칭만 사용한다.

대량 적재를 커밋한 다음 `20261007_ingredient_index_statistics.sql`도 실행한다. 이 파일은 성분 연결 테이블과 인덱스의 Oracle 통계만 갱신한다. `no_invalidate => FALSE`로 0건일 때의 이전 실행계획을 즉시 폐기해, 9만 건 연결을 조회하면서 비효율적인 계획을 재사용하지 않게 한다. 사용자 기록은 변경하지 않는다.

처음 환경을 만드는 경우에는 `20260930_ingredient_normalization.sql`로 전체 스키마를 준비한다. 이 이전 파일은 사용자 영양제 제품 연결 복구도 포함하므로 기존 DB의 성분 연결만 복구할 때 전체 실행하지 않는다.

## API 동기화

변경되거나 새로 추가된 제품은 `IngredientIndexService`에서 같은 정규화 기준으로 다시 연결한다. 부모 트랜잭션이 있으면 같은 JDBC 연결의 저장점(`NESTED`)을 사용한다. 아직 커밋되지 않은 신규 제품의 FK를 확인할 수 있고, 인덱스 오류는 저장점까지 되돌려 기존 연결과 부모 작업을 보존한다. 특정 품목의 일시적인 충돌로 이후 모든 인덱싱을 중단하지 않는다.

## 회귀 검사

- `tools/qa/IngredientIndexDatabaseCheck.java`: 임시 제품·별칭으로 중복 정규화, 빈 성분, 수화물 분리, 미검증 별칭 차단, 검증 후 연결 갱신, 재실행을 확인하고 모두 롤백
- `tools/qa/IngredientIndexTransactionCheck.java`: 실제 Spring 트랜잭션 프록시와 Oracle로 신규 제품 연결, 인덱스 실패 시 저장점 복원, 이후 재시도, 부모 전체 롤백 확인
- `CatalogCheck`, `ExpandedChatCheck`: 실제 DB에서 임부 조건의 제품과 DUR 근거가 함께 조회되는지 확인

테스트는 기존 사용자·처방전·게시글을 변경하지 않는다. DB 설정은 git에서 제외된 `config/db.properties`를 읽으며 연결 정보는 결과에 출력하지 않는다.
