-- 성분 연결 대량 backfill을 성공적으로 COMMIT한 다음 실행
-- 사용자 기록을 변경하지 않고 파생 테이블과 해당 인덱스의 조회 통계만 갱신
-- 0건 기준의 이전 실행계획을 즉시 무효화해 정상 규모에 맞는 조인 계획을 사용
BEGIN
  DBMS_STATS.GATHER_TABLE_STATS(
    ownname => USER,
    tabname => 'MEDICATION_INGREDIENTS',
    estimate_percent => DBMS_STATS.AUTO_SAMPLE_SIZE,
    method_opt => 'FOR ALL COLUMNS SIZE 1',
    cascade => TRUE,
    no_invalidate => FALSE
  );
END;
/
