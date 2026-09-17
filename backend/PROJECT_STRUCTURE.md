# 기능별 디렉토리 안내

## 백엔드

`backend/src/main/java/com/app/`

- `medication/`: 의약품 허가정보 (controller, service/impl, dao/impl, dto)
- `easydrug/`: e약은요 (controller, service/impl, dao/impl, dto)
- `chatbot/`: 챗봇 (controller, service, client, dao/impl, dto)
- `main/controller/`: 기존 메인 페이지

GeminiService와 GeminiException은 `chatbot/client/`에 있습니다.
동기화 서비스와 DAO도 허가정보와 e약은요로 분리했습니다.

`backend/src/main/webapp/WEB-INF/mybatis/mapper/`

- `medication/medication_mapper.xml`: 허가정보 저장 및 전체 건수
- `easydrug/easydrug_mapper.xml`: e약은요 업데이트
- `chatbot/chatbot_mapper.xml`: 챗봇 상세 조회 및 이름 검색
- `main/main_mapper.xml`: 기존 메인 매퍼

테스트: `backend/src/test/java/com/app/chatbot/client/GeminiServiceCheck.java`

## 프론트엔드

`frontend/src/features/chatbot/components/`

- MedicationChat.jsx
- MedicationSearch.jsx
- MedicationChat.css

App.jsx의 import도 새 경로로 변경했습니다.

## 유지한 API

Tomcat context: `/Jette-Yak`

- POST /medications/permit-sync-test
- POST /medications/permit-sync-all
- POST /medications/easy-sync-test
- POST /medications/easy-sync-all
- GET /api/medications/search
- POST /api/chat

기존 동기화 메서드와 SQL은 유지하며 패키지/namespace/DTO 참조를 변경했습니다.
데이터를 변경하는 동기화 API는 이번 검증에서 호출하지 않았습니다.

## 키보드

- 약 이름 검색: 자동 검색 유지, Enter로 첫 페이지 즉시 재검색
- 질문 입력: Enter 전송, Shift+Enter 줄바꿈
- 한글 조합 중 Enter 전송 방지
- 전송 중 중복 질문 차단 유지

## Eclipse 적용

1. Tomcat Stop
2. 백엔드 프로젝트 선택 후 F5
3. Project > Clean으로 백엔드 재빌드
4. Servers > Tomcat 우클릭 > Clean / Publish
5. Tomcat Start

이전 패키지의 class와 main/medication_mapper.xml이 배포 디렉토리에 남지 않도록 Clean/Publish가 필요합니다.
Tomcat의 Gemini 환경변수는 변경하지 않았습니다.

## 검증

- Java 전체 컴파일 성공
- 분리한 MyBatis 매퍼 파싱 및 DAO statement 연결 성공
- Spring 기능별 컴포넌트 생성자 주입 성공
- 실제 Oracle 읽기 기반 검색/약 전환 테스트 15개 통과
- Gemini 모의 HTTP 테스트 19개 통과
- 프론트 ESLint 및 Vite 빌드 성공
- 브라우저에서 Enter 검색/전송 및 Shift+Enter 줄바꿈 확인
