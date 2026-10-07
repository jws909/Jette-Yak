# 제때약 모바일 웹 + PWA

## 추가한 동작

- 로그인 화면과 서비스 메뉴의 ‘앱 설치 안내’에서 설치 방법 확인
- 설치창을 지원하는 브라우저에서는 ‘제때약 앱 설치’ 버튼으로 설치 요청
- 기존 제때약 로고를 홈 화면 아이콘으로 사용하고 별도 앱 창으로 실행
- iPhone·iPad에서는 공유 메뉴 → 홈 화면에 추가 안내
- 연결이 끊긴 상태로 페이지를 열면 공용 오프라인 안내 표시
- 연결 복구 후 ‘다시 시도’로 원래 주소 다시 열기
- 새 버전이 준비되면 업데이트 안내; 입력 손실을 확인한 뒤에만 새로고침
- 설치 모드의 노치·하단 홈 표시줄 안전 영역 반영

PWA는 홈페이지를 운영체제에 설치해서 앱처럼 여는 방식이다. Android WebView APK나 앱스토어 등록 파일은 이번 범위에 포함하지 않는다.

## PC에서 확인하는 순서

1. Eclipse의 Spring/Tomcat을 기존처럼 `8080` 포트에서 실행한다.
2. PowerShell에서 다음 명령을 실행한다.

```powershell
cd 'C:\study-8\teamProject\3rdProject\Jette-Yak\frontend'
npm.cmd run build
npm.cmd run preview -- --host 127.0.0.1 --port 4173 --strictPort
```

3. Chrome 또는 Edge에서 `http://127.0.0.1:4173`을 연다.
4. 로그인 화면 또는 서비스 메뉴의 설치 버튼을 누른다. 브라우저가 설치창을 제공하지 않으면 브라우저 메뉴의 설치 항목을 확인한다.

`npm run dev`는 화면 개발용이다. 서비스 워커를 등록하지 않아 개발 중 캐시·HMR이 섞이지 않는다. PWA 검증에는 반드시 **빌드 + preview**를 사용한다. 새로 수정한 코드는 `npm run build`를 다시 실행해야 preview에 반영된다.

preview에서도 `/api` 요청은 `http://localhost:8080`으로 전달된다. 프런트 포트만 열고 Tomcat을 끄면 로그인과 DB 기능은 동작하지 않는다.

## 휴대폰에서 확인하는 순서

휴대폰에서 접속하는 `http://192.168.…` 주소는 보안 연결이 아니므로 설치와 알림에 필요한 조건을 충족하지 못한다. 로컬 PC의 loopback 주소는 개발용 예외지만 휴대폰의 `localhost`는 휴대폰 자신을 가리킨다.

기존 Cloudflare 테스트 방식을 사용할 경우:

1. Tomcat 실행과 `npm run build`를 먼저 마친다.
2. 별도 PowerShell에서 터널을 실행하고 출력된 HTTPS 주소를 확인한다.

```powershell
& 'C:\Program Files (x86)\cloudflared\cloudflared.exe' tunnel --url http://127.0.0.1:4173
```

3. 프런트 PowerShell에서 **이번에 발급된 호스트 이름만** 허용하고 preview를 실행한다. 아래 호스트는 예시이므로 실제 주소의 `https://` 뒤 부분으로 바꾼다.

```powershell
cd 'C:\study-8\teamProject\3rdProject\Jette-Yak\frontend'
$env:__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS = '발급된-호스트.trycloudflare.com'
npm.cmd run preview -- --host 127.0.0.1 --port 4173 --strictPort
```

이미 preview가 실행 중이면 해당 터미널에서 Ctrl+C로 종료한 뒤 환경변수를 설정하고 다시 실행한다. `allowedHosts: true`로 전체 호스트를 허용하지 않는다. 터널 주소를 전달받은 사람은 실행 중인 사이트에 접속할 수 있으므로 테스트할 사람에게만 공유한다.

4. Android는 Chrome, iPhone은 Safari에서 해당 HTTPS 주소를 연다.
5. 설치 안내를 따라 홈 화면에 추가하고, 홈 화면 아이콘으로 실행한다.
6. 로그인·뒤로 가기·회전·키보드·사진 선택·다운로드·알림을 확인한다.

임시 터널 주소가 바뀌면 설치한 앱의 주소도 달라진다. 최종 포트폴리오에는 고정 HTTPS 배포 주소를 사용한다. Vite preview는 로컬 검증용이며 최종 운영 서버가 아니다.

## 복약 알림의 범위

앱 종료 후 복약 알림을 받는 **서버 Web Push**를 지원한다. 마이페이지에서 복약 알림 전체 설정을 켜고, ‘앱을 닫아도 알림 받기 → 이 기기 알림 켜기’로 권한과 기기 구독을 연결한다. 서버는 캘린더와 같은 규칙으로 복약 30분 전·복약 시각을 확인하며, 잠금 화면에는 약 이름을 표시하지 않는다.

화면이 열린 동안의 기존 복약 모달·이벤트도 유지한다. 기기 푸시가 연결되면 화면 쪽에서 같은 OS 알림을 다시 띄우지 않는다. 표시 실패가 앱 내부 복약 모달·이벤트를 중단하지 않으며, 알림 권한은 사용자가 버튼을 누를 때만 요청한다.

iPhone·iPad는 **iOS/iPadOS 16.4 이상에서 홈 화면에 설치한 앱**을 사용한다. Android는 최신 Chrome과 HTTPS 주소를 권장한다. 서버와 인터넷 연결은 계속 필요하며, 운영체제의 방해 금지·절전 설정에 따라 표시가 늦어지거나 제한될 수 있다. 설치만으로 정시 수신을 보장하지 않는다. **실제 앱 종료 후 수신은 iPhone·Android 각각 확인이 남아 있다.**

DB 준비·VAPID 키·마이페이지 설정·기기별 테스트는 [앱 종료 후 복약 알림 안내](web-push.md)를 참고한다.

## 캐시 정책

서비스 워커의 Cache Storage에는 아래 공용 파일만 저장한다.

- `/offline.html`
- `/pwa/icon-192.png`, `/pwa/icon-512.png`, `/pwa/maskable-512.png`
- `/pwa/apple-touch-icon.png`가 있는 경우 해당 아이콘

API 응답, 처방전·프로필·첨부 파일, HTML 앱 화면, JavaScript 앱 번들, 제3자 응답은 서비스 워커가 캐시하지 않는다. 로그인 정보의 기존 localStorage 사용과 일반 HTTP 캐시는 별개다. 이번 PWA 기능이 이를 새로 저장하거나 제거하지 않는다.

GET 화면 이동의 **네트워크 실패**에만 공용 안내로 대체한다. API·업로드·정적 파일 요청은 가로채지 않고, 서버의 401·403·404·500도 오프라인 안내로 바꾸지 않는다. 오프라인 입력을 나중에 자동 전송하는 기능은 없다.

## 업데이트 정책

빌드 결과와 공용 오프라인 파일이 바뀌면 서비스 워커 버전도 변경된다. 화면 복귀·재연결 시 업데이트를 확인하되 반복 요청은 제한한다. 대기 중인 새 버전은 ‘업데이트 후 새로고침’을 선택해야 즉시 활성화된다. 다른 탭의 업데이트나 첫 설치만으로 현재 화면을 자동 새로고침하지 않는다. 적용이 15초 이상 완료되지 않으면 오류 안내와 함께 버튼을 다시 사용할 수 있다.

모든 사이트 창을 닫았다가 다시 열면 브라우저의 기본 서비스 워커 수명 주기에 따라 대기 버전이 적용될 수 있다. 업데이트 안내는 저장하지 않은 내용을 자동 저장하지 않는다.

## 관련 코드

| 파일 | 역할 |
|---|---|
| `frontend/public/manifest.webmanifest` | 설치 이름·시작 주소·아이콘·표시 방식 |
| `tools/generate_pwa_icons.py` | 기존 로고에서 아이콘 재생성, Python/Pillow 필요 |
| `frontend/build/pwaPlugin.js` | 빌드 시 서비스 워커 생성·버전·캐시 허용 목록 |
| `frontend/public/offline.html` | 개인 정보 없는 공용 연결 안내 |
| `frontend/src/features/pwa/pwaController.js` | 설치 이벤트·등록·업데이트 상태 |
| `frontend/src/features/pwa/PwaControls.jsx` | 설치 버튼·공용 안내 모달·연결 및 업데이트 안내 |
| `frontend/src/features/pwa/foregroundNotifications.js` | 모바일을 고려한 열린 앱의 알림 표시 |
| `frontend/src/main.jsx` | 렌더링 전 설치 이벤트 연결·전역 UI 배치 |
| `frontend/vite.config.js` | PWA 빌드 플러그인·개발/preview API proxy |

## 2026-10-07 초기 PWA 검증 결과

- `npm test`: **88/88 통과**. 기존 38개와 신규 PWA 50개
- `npm run test:flows`: **56/56 통과**
- `npm run build`: 통과. 기존 큰 청크 경고는 남아 있음
- PWA·연결 코드 대상 ESLint 및 `git diff --check`: 통과
- 전체 ESLint: 기존 **오류 22개·경고 4개**가 남아 있어 전체 정리 필요
- 아이콘 실제 크기 192×192·512×512, 마스커블 불투명 배경 확인
- preview의 manifest·worker·아이콘·favicon·React 직접 경로·약 검색 API 모두 HTTP 200 확인
- 실제 브라우저에서 설치 안내 360×640, 320×360 확인: 가로 넘침 없음, 짧은 화면은 본문만 스크롤, 닫기 버튼 유지
- 모바일 메뉴 390×844에서 설치 진입점 확인
- 실제 빌드 교체 → 업데이트 안내 → 보류 → 확인 후 새로고침 확인
- 검증용 preview 서버 종료 → 원래 URL에서 오프라인 화면 → 서버 복구 후 ‘다시 시도’로 복귀 확인

- 모바일 Safari에서 홈 화면에 추가: **2026-10-07 사용자 확인 완료**
- 홈 화면 아이콘 실행·로그인 유지·약 등록·복약 체크·챗봇·커뮤니티·키보드 입력 영역: **2026-10-07 사용자 정상 동작 확인**

위 실제 기기 결과는 사용자의 확인 보고 기준이다. 뒤로 가기·파일 선택·다운로드·회전·OS 권한·알림 등 별도 확인하지 않은 항목은 남아 있다. 홈 화면 추가와 주요 흐름의 성공을 전체 모바일 기능 검증 완료로 확대하지 않는다.

위 숫자는 Web Push 추가 전의 초기 PWA 점검 기록이다. 이후 추가한 서버 푸시와 기기 구독 검증은 [Web Push 검증 상태](web-push.md#2026-10-07-준비검증-상태)에 별도로 정리한다.

## 최종 배포 시

같은 HTTPS origin에서 프런트와 `/api`를 제공하고, React 화면 경로의 새로고침에는 `index.html`을 반환하도록 구성한다. `/sw.js`, manifest, 아이콘, 업로드 및 API 경로는 SPA fallback과 구분한다. `sw.js`와 `index.html`은 새 버전을 재검증하도록 캐시 헤더를 설정한다. 현재 설치 범위는 사이트 루트 `/` 기준이며 하위 경로 배포는 별도 경로 조정이 필요하다.

참고: [MDN PWA 설치 조건](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable), [MDN 모바일 알림 표시](https://developer.mozilla.org/en-US/docs/Web/API/Notification/Notification), [Vite preview 설정](https://vite.dev/config/preview-options).
