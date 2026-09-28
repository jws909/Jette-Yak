# 공공데이터 API 키 설정

식약처 허가정보와 e약은요 동기화는 `DATA_GO_KR_SERVICE_KEY` 환경변수를 함께 사용합니다.
인증키를 Java, XML, properties 파일 또는 Git 커밋에 기록하지 않습니다.

## Eclipse에서 Tomcat을 실행하는 경우

1. `Run > Run Configurations`를 엽니다.
2. 현재 Tomcat 실행 구성을 선택합니다.
3. `Environment` 탭에서 새 변수를 추가합니다.
4. 이름은 `DATA_GO_KR_SERVICE_KEY`, 값은 공공데이터포털의 Decoding 인증키로 설정합니다.
5. Eclipse와 Tomcat을 다시 시작합니다.

JVM 인수로 설정해야 한다면 다음 형식도 지원합니다.

```text
-DDATA_GO_KR_SERVICE_KEY=발급받은키
```

기존 키가 Git에 커밋된 적이 있다면 공공데이터포털에서 키를 재발급한 뒤 새 키만 환경변수에 설정합니다.
