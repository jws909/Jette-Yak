# 앱을 닫아도 받는 복약 알림

제때약 서버가 복약 시간을 확인해 iPhone·Android의 Web Push 서비스로 알림을 보낸다. 휴대폰에서 제때약 화면을 계속 열어 둘 필요가 없다. **서버와 인터넷 연결은 계속 유지해야 한다.**

## 휴대폰에서 켜는 순서

1. HTTPS 주소로 접속한다. iPhone·iPad는 **iOS/iPadOS 16.4 이상**에서 Safari의 공유 → 홈 화면에 추가 후, 홈 화면의 제때약 아이콘으로 실행한다. Android는 최신 Chrome을 권장하며 홈 화면에 설치한 앱에서도 설정할 수 있다.
2. 로그인한다. 앱 업데이트 안내가 보이면 적용한다. 이전 서비스 워커에는 푸시 수신 기능이 없을 수 있다.
3. **마이페이지 → 복약 알림 전체 설정**을 켠다. 이 설정은 계정 전체의 복약 알림 수신 여부다.
4. **앱을 닫아도 알림 받기 → 이 기기 알림 켜기**를 누른다. 운영체제의 알림 허용 창에서 허용한다. 기기 연결은 사용자가 버튼을 누를 때만 진행한다.
5. **테스트 알림 보내기**를 눌러 휴대폰 알림함에 도착하는지 확인한다. 테스트 알림은 현재 기기로만 전송하며 30초 간격으로 요청할 수 있다.
6. 캘린더에 알림이 켜진 복약 일정을 준비하고 앱을 닫는다. 해당 시각에 알림이 도착하는지 확인한다. 테스트 버튼 성공과 실제 앱 종료 상태의 예약 알림 수신은 각각 확인한다.

마이페이지의 전체 알림을 끄면 모든 기기의 서버 발송을 중단한다. **이 기기 알림 끄기**는 현재 기기만 해제한다. 로그아웃하거나 다른 계정으로 로그인할 때도 현재 세션에 연결한 기기 구독을 해제하며, 다른 기기의 구독은 유지한다.

기기에서 이미 알림을 차단했다면 허용 창을 반복해서 띄우지 않는다. iPhone은 기기 설정 → 알림 → 제때약, Android는 브라우저의 제때약 사이트 설정과 운영체제 앱 알림 설정을 확인한 뒤 다시 켠다.

## PC에 설치한 앱에서 연결이 실패할 때

PC에서 쓰는 `http://127.0.0.1:4173`은 로컬 개발용 보안 컨텍스트로 인정된다. 같은 PC에서는 이 주소로 푸시를 검증할 수 있다. 휴대폰에서 여는 사설 IP의 HTTP 주소에는 이 예외가 적용되지 않는다.

Brave에는 사이트의 **알림 허용**과 별도로 브라우저 전체의 **푸시 메시징에 Google 서비스 사용(Use Google services for push messaging)** 설정이 있다. 사이트 권한이 허용돼 있어도 이 설정이 꺼져 있으면 기기 구독이 실패할 수 있다. 설치한 웹앱도 설치에 사용한 Brave의 설정을 따른다.

1. 일반 Brave 창의 주소창에 `brave://settings/privacy`를 입력한다.
2. **푸시 메시징에 Google 서비스 사용** 항목을 확인한다. 푸시 수신을 원하면 켠다. 이 설정은 Google의 푸시 전달 서비스를 사용하도록 허용하는 선택이다.
3. 브라우저가 재시작을 안내하면 작성 중인 내용을 저장한 뒤 재시작한다. 제때약 앱도 닫았다가 다시 연다.
4. 마이페이지에서 **이 기기 알림 켜기 → 테스트 알림 보내기** 순서로 확인한다.

설정이 켜져 있는데도 실패하면 표시된 안내와 개발자 콘솔의 안전한 진단 코드를 확인한다. `subscribe` 단계의 `AbortError`는 푸시 전달 서비스 등록 실패로, 인터넷 연결 문제만을 뜻하지 않는다. 브라우저 정책·VPN·네트워크의 푸시 서비스 연결 제한도 원인이 될 수 있다. 사이트에서 브라우저 전체의 설정을 임의로 켜거나 우회하지 않는다.

참고: [Brave 공식 개인정보 설정 안내](https://support.brave.app/hc/en-us/articles/360017989132-How-do-I-change-my-Privacy-Settings), [MDN 보안 컨텍스트와 로컬 주소 예외](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts).

## 언제 어떤 알림을 보내는가

| 항목 | 동작 |
|---|---|
| 복약 시각 | 캘린더와 같은 `ScheduleService.getDailySchedules()`로 조회 |
| 대상 일정 | 해당 계정의 알림이 켜진 일정. 복용 완료·취소 일정 제외 |
| 알림 시점 | 복약 30분 전과 복약 시각. 서버가 약 30초 간격으로 확인 |
| 날짜 기준 | 서버 운영체제의 지역 설정과 관계없이 `Asia/Seoul` 기준 |
| 자정 경계 | 다음 날 새벽 복약의 30분 전 알림도 확인 |
| 잠금 화면 | 약 이름 없이 복약 시간 안내만 표시 |
| 알림 클릭 | 제때약 홈 화면으로 이동 |
| 중복 방지 | 기기·복약 날짜·시각·알림 종류를 DB에 기록 |
| 전송 실패 | 일시 오류는 최대 3회 시도. 만료된 구독은 제거 |
| 서버 중단 후 복구 | 예정 시각에서 2분을 넘긴 알림은 몰아서 보내지 않음 |

푸시 서비스에 전달한 알림의 보관 기한도 짧게 제한한다. 네트워크 전송과 DB 기록은 하나의 트랜잭션으로 묶을 수 없으므로, 서버가 전송 직후 비정상 종료하는 경우까지 단 한 번의 수신을 보장하는 구조는 아니다. 같은 알림의 태그를 재사용해 기기의 중복 표시도 줄인다.

앱이 열린 동안에는 기존 복약 모달과 알림함 갱신을 유지한다. 이 기기의 서버 푸시 연결이 확인되면 화면 쪽에서 같은 OS 알림을 다시 띄우지 않는다.

## 서버 준비

### 1. Oracle에 테이블 생성

SQL Developer에서 프로젝트가 사용하는 DB 계정으로 연결하고 아래 파일을 열어 **스크립트 실행(F5)** 한다.

`backend/src/main/resources/db/20261007_web_push.sql`

- `USER_PUSH_SUBSCRIPTIONS`: 사용자별 기기 주소와 암호화 키
- `PUSH_DELIVERIES`: 복약 시각별 전송 상태와 재시도 기록
- 관련 시퀀스·인덱스·유일 제약조건

스크립트는 이미 존재하는 객체를 유지하며, 기존 사용자·복약 데이터를 변경하지 않는다. 구독 또는 사용자를 삭제하면 연결된 전송 기록도 정리된다. 오래된 전송 기록은 서버에서 7일 기준으로 정리한다.

### 2. 저장소 밖에 VAPID 키 생성

저장소 루트에서 실행한다.

```powershell
cd 'C:\study-8\teamProject\3rdProject\Jette-Yak'
node tools/push/generate-vapid-keys.mjs --subject 'https://github.com/jws909/Jette-Yak'
```

기본 저장 위치는 **`%USERPROFILE%\.jette-yak\push.properties`**다. 현재 사용자 PC에서는 다음 경로를 사용한다.

`C:\Users\sudal\.jette-yak\push.properties`

다음 설정을 저장하며, 개인 키 값은 출력하지 않는다.

```properties
push.vapid.public-key=공개키
push.vapid.private-key=개인키
push.vapid.subject=https://github.com/jws909/Jette-Yak
```

`subject`에는 운영자의 `mailto:이메일주소` 또는 프로젝트의 HTTPS 주소를 사용한다. 위 파일은 Git 저장소 안에 복사하거나 게시하지 않는다. 생성기를 다시 실행해도 기존 파일을 덮어쓰지 않는다.

**키는 서버를 재시작할 때마다 새로 만들지 않는다.** 기존 기기 구독은 등록 당시의 공개키와 연결돼 있다. 서버를 이전할 때는 기존 키 파일을 안전하게 옮겨 재사용한다. 키를 새로 바꾸었다면 각 기기에서 알림을 다시 켜야 한다.

### 3. 다른 PC·운영 서버에 설정

같은 서버 키를 서버 실행 계정의 **`user.home/.jette-yak/push.properties`**에 보관한다. Windows 서비스나 별도 계정으로 Tomcat을 실행하면 개인 PC의 사용자 홈과 다를 수 있다.

파일 대신 다음 환경변수를 사용할 수도 있다. **환경변수 값이 파일보다 우선**한다.

| 환경변수 | 의미 |
|---|---|
| `WEB_PUSH_PUBLIC_KEY` | VAPID 공개키 |
| `WEB_PUSH_PRIVATE_KEY` | VAPID 개인키 |
| `WEB_PUSH_SUBJECT` | 운영자 연락처 또는 프로젝트 HTTPS 주소 |

환경변수는 Tomcat 프로세스가 시작될 때 전달해야 한다. PowerShell 창에 설정한 값이 이미 실행 중인 Eclipse·Tomcat에 자동 반영되지는 않는다. 설정 후 서버를 재시작한다.

푸시 키나 테이블이 준비되지 않아도 기존 로그인과 페이지는 유지한다. 알림 설정 화면에는 서버 준비 안내를 표시한다.

### 4. 백엔드·프런트 반영

1. Eclipse에서 프로젝트 새로고침(F5) 후 Maven 의존성·빌드를 갱신한다.
2. Tomcat에 새 백엔드 파일을 게시하고 재시작한다.
3. 프런트를 빌드한다. PowerShell에서 `npm.ps1` 실행이 차단된 경우 아래처럼 `npm.cmd`를 사용한다.

```powershell
cd 'C:\study-8\teamProject\3rdProject\Jette-Yak\frontend'
npm.cmd run build
npm.cmd run preview -- --host 127.0.0.1 --port 4173 --strictPort
```

4. [PWA HTTPS 테스트 안내](pwa.md#휴대폰에서-확인하는-순서)에 따라 터널 주소로 접속한다.
5. 휴대폰에서 새 앱 업데이트를 적용한 뒤 마이페이지의 기기 알림을 켠다.

## 서버와 주소에 따른 제한

- **PC·Tomcat을 끄면 예약 시각을 확인하고 발송할 서버가 없어진다.** 휴대폰 앱을 종료해도 서버는 켜져 있어야 한다. 운영 단계에서는 계속 실행되는 서버에 배포한다.
- 로컬 테스트에서는 프런트 preview와 Cloudflare 터널도 유지한다. API는 같은 HTTPS 사이트의 `/api` 경로로 전달한다.
- 임시 `trycloudflare.com` 주소가 바뀌면 사이트 출처(origin)가 달라진다. 이전 홈 화면 앱과 구독이 새 주소로 자동 이전되지 않는다. 새 주소에서 설치·로그인·기기 알림 설정을 다시 확인한다. 최종 배포에는 고정 HTTPS 주소를 사용한다.
- 알림은 인터넷 연결, 운영체제 알림 권한, 방해 금지 모드, 절전 정책의 영향을 받는다. Android의 강제 중지나 제조사 배터리 제한 등은 앱 창을 닫는 동작과 다르다. 시각 확인 간격과 OS 처리 때문에 정확히 해당 초에 도착하는 알람시계 기능을 보장하지 않는다.
- 이 구현은 Web Push다. 인터넷 없이 동작하는 네이티브 예약 알림·APK·앱스토어 앱은 별도 범위다.

## 인증·보안 경계

- 사용자 번호는 요청 본문에서 받지 않고 로그인 세션에서 확인
- 구독 등록·조회·해제·테스트에 세션별 CSRF 토큰 적용
- 다른 사이트의 설정 조회와 변경 요청 차단
- 다른 계정의 기기 구독 덮어쓰기·삭제 차단
- 알려진 HTTPS 푸시 서비스만 전송 대상으로 허용하고 리다이렉트 금지
- 전송 연결·응답 대기 시간 제한
- 서버 개인 키·구독 주소·기기 암호화 키를 응답이나 로그에 노출하지 않음

푸시 관련 API는 `/api/push/config`, `/api/push/subscriptions`, `/api/push/subscriptions/status`, `/api/push/subscriptions/remove`, `/api/push/test`다. 공개키는 브라우저 구독에 사용하며 개인 키는 서버 밖으로 보내지 않는다.

## 2026-10-07 준비·검증 상태

| 항목 | 결과 |
|---|---|
| 현재 Oracle의 푸시 테이블·시퀀스 준비 | 적용 완료 |
| 현재 PC의 저장소 밖 VAPID 키 파일 | 생성·설정 완료 |
| 백엔드 단위 검증 | `BackgroundPushCheck` 75개 통과 |
| 실제 Oracle·MyBatis 검증 | 구독·소유권·중복 전송 권한·재시도·삭제 연결 검증 19개 통과. 검증 데이터 롤백 |
| Spring XML 연동 | 부모·자식 컨텍스트 기동, 키 로드, 스키마 연결, 캘린더 서비스 주입, 스케줄러 1개 등록 확인 |
| 암호화 호환성 | 실제 P-256 키로 VAPID 서명·AES128GCM 본문·HTTP 요청 헤더 생성 확인. 외부 전송 없이 검증 |
| 프런트·서비스 워커 | 프런트 테스트 144개 통과. Brave 안내·실패 단계·민감 로그 차단 회귀 14개 포함. 흐름 테스트 56개·키 생성 테스트 2개는 최초 연동 검증에서 통과 |
| 실제 브라우저 설정 화면 | 새 앱 업데이트 적용 후 기기 알림 켜기 활성화 확인. 360×640·320×568에서 새 설정 영역 가로 넘침 없음, 버튼 높이 44px 확인 |
| 신규 푸시 코드 정적 검사 | 푸시 클라이언트·서비스 워커 대상 ESLint 통과 |
| 백엔드 빌드·실행 반영 | Maven `test-compile` 통과. Tomcat 재게시·재시작 완료 |
| 실제 HTTP 인증·출처 검사 | 비로그인 설정 조회 401, 로그인 후 `enabled=true`·공개키·CSRF 확인, 다른 출처 설정 조회 403, CSRF 없는 변경 요청 403 확인 |
| PC Brave 설치 앱의 기기 알림 켜기 | 2026-10-07 사용자 확인: 푸시 메시징의 Google 서비스 설정을 켠 뒤 정상 동작. 앱 코드가 브라우저 설정을 변경하지 않음 |
| 실제 휴대폰의 앱 종료 후 알림 수신 | **아직 미확인. iPhone·Android 각각 사용자 확인 필요** |

설치 성공이나 서버의 테스트 전송 응답만으로 실제 잠금 화면 수신까지 확인했다고 기록하지 않는다.

## 관련 파일

| 위치 | 역할 |
|---|---|
| `backend/src/main/java/com/app/push/PushController.java` | 로그인·출처·CSRF를 확인하는 기기 알림 API |
| `backend/src/main/java/com/app/push/PushSubscriptionService.java` | 구독 저장·해제·테스트·로그아웃 연결 |
| `backend/src/main/java/com/app/push/MedicationPushScheduler.java` | 한국 시각의 복약 일정 확인과 서버 발송 |
| `backend/src/main/java/com/app/push/WebPushSender.java` | VAPID 서명·암호화·HTTPS 전송 |
| `backend/src/main/webapp/WEB-INF/mybatis/mapper/push_mapper.xml` | 구독과 전송 기록 SQL |
| `frontend/src/features/pwa/pushClient.js` | 브라우저 지원·권한·기기 구독·API 통신 |
| `frontend/src/features/pwa/useBackgroundPush.js` | 로그인 계정과 기기 연결 상태 관리 |
| `frontend/src/features/pwa/PushSettings.jsx` | 마이페이지의 기기별 알림 설정 |
| `frontend/build/pwaPlugin.js` | 푸시 수신·OS 알림 표시·클릭 이동 |
| `tools/push/generate-vapid-keys.mjs` | 저장소 밖에 서버 키를 한 번만 생성 |

공식 참고: [WebKit iOS·iPadOS 홈 화면 Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API), [webpush-java](https://github.com/web-push-libs/webpush-java).
