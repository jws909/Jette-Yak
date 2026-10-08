# Gemini API 연결 안내

## 변경 내용
- OllamaService를 GeminiService로 교체했습니다.
- 기존 POST /api/chat, 약 이름 검색, DB sources 응답 형식은 유지합니다.
- 기본 모델: gemini-3.1-flash-lite. GEMINI_MODEL 환경변수로 변경 가능합니다.
- GEMINI_API_KEY는 서버 환경변수에서만 읽습니다. React/VITE 변수에 키를 넣지 마세요.
- SDK나 Maven 의존성 추가 없이 기존 Spring RestTemplate으로 HTTPS REST 호출합니다.
- AI에 전송하는 데이터는 사용자 질문과 조회한 약품 DTO입니다.
- 웹 검색 도구는 사용하지 않고 DB 근거만 답하도록 지시합니다. 프롬프트만으로 정확성을 완전히 보장하지는 않습니다.
- 429 한도 초과 시 자동 재시도/유료 모델 전환 없이 사용자에게 안내합니다.
- 로컬 모델의 기존 긴 자료 제한(2,500자 초과 시 원문 표시)은 유지했습니다.
- 이름 검색/제품 선택만으로 응답하는 경우는 AI를 호출하지 않습니다.

## API 키 설정 (Eclipse Tomcat)
1. https://aistudio.google.com/apikey 에서 본인의 Gemini API 키를 만듭니다.
2. 무료 이용하려는 Google 프로젝트의 티어와 할당량을 AI Studio에서 확인합니다.
3. Eclipse > Servers > Tomcat 더블 클릭 > Open launch configuration > Environment.
4. New로 다음 변수를 등록합니다.
   - GEMINI_API_KEY: 본인의 키
   - GEMINI_MODEL: gemini-3.1-flash-lite (생략 가능)
5. Apply 후 Tomcat을 정지합니다.
6. Project > Clean으로 backend를 다시 빌드하고, Servers에서 Clean/Publish한 뒤 시작합니다.
   삭제한 OllamaService의 오래된 class도 제거되도록 반드시 새 빌드를 배포합니다.
7. 기존 React 화면에서 약을 검색하고 효능을 질문합니다.
키를 바꾸면 Tomcat을 재시작해야 합니다. .env 파일은 자동으로 읽지 않습니다.
키를 대화창에 보낼 필요는 없습니다.

## 무료 티어 조건
무료 티어는 API 요청 옵션이 아니라 Google 프로젝트의 과금/할당량 상태입니다.
코드 자체가 무료 상태나 비용 0원을 보장하지는 않습니다.
유료 프로젝트의 키를 사용하면 해당 프로젝트의 요금 정책이 적용될 수 있습니다.
무료 티어 입력/출력은 Google 제품 개선에 사용될 수 있으므로 실제 개인 의료정보를 전송하는 운영 서비스 적용은 별도로 검토해야 합니다.
정확한 가용 모델과 현재 할당량은 AI Studio에서 확인합니다.

## 오류 응답
- 503: 키 미설정, 키/권한 오류, 모델 설정 오류
- 429: 요청 한도 초과
- 504: 연결/읽기 실패 또는 지연
- 502: API 처리 실패, 차단, 빈 답변, 미완료 답변
외부 오류 원문이나 API 키는 앱 오류 응답/로그에 넣지 않습니다.

## 검증
- 변경한 4개 Java 클래스: javac --release 21 컴파일 성공
- src/test/java/com/app/chatbot/client/GeminiServiceCheck.java: 로컬 HTTP 모의 API 19개 검사 통과
- 실제 Gemini 호출: 키 미설정으로 아직 미검증
- 수동 배포 class 복사는 하지 않았습니다. Eclipse Clean/Publish 후 새 코드가 적용됩니다.

## 공식 문서
- 가격/무료 티어: https://ai.google.dev/gemini-api/docs/pricing
- REST API: https://ai.google.dev/api/generate-content
- API 키: https://ai.google.dev/gemini-api/docs/generate-content/api-key