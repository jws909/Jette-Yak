import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// 빌드 결과로 작업자 버전을 만들고, 개인 정보 없는 공용 파일만 오프라인 저장
const REQUIRED_RESOURCES = [
  'offline.html',
  'pwa/icon-192.png',
  'pwa/icon-512.png',
  'pwa/maskable-512.png',
]
const OPTIONAL_RESOURCES = ['pwa/apple-touch-icon.png']

function workerSource(version, resourcePaths) {
  return `// 제때약 빌드에서 생성. 오프라인 안내와 공용 아이콘만 캐시에 저장.
const CACHE_PREFIX = 'jette-yak-pwa-';
const CACHE_NAME = CACHE_PREFIX + ${JSON.stringify(version)};
const OFFLINE_URL = '/offline.html';
const PRECACHE_URLS = ${JSON.stringify(resourcePaths)};
const NOTIFICATION_TYPES = ['medication-reminder', 'notification-permission', 'notification-test', 'community-notification'];
const DEFAULT_NOTIFICATION_TITLE = '제때약 복약 알림';
const DEFAULT_NOTIFICATION_BODY = '확인할 복약 알림이 있어요. 앱에서 오늘의 복약 일정을 확인해주세요.';

// 서버가 보낸 문자열도 그대로 이동하지 않음. 승인한 화면과 숫자 게시글 번호만 허용
function notificationPath(type, path) {
  if (path === '/') return '/';
  if (type !== 'community-notification' || typeof path !== 'string') return null;
  if (path === '/admin') return path;
  return /^\\/community\\?postId=[1-9]\\d{0,17}$/.test(path) ? path : null;
}

// 푸시 본문만 읽고, 이동 주소·아이콘·동작은 앱에서 정한 값만 사용
function notificationText(value, fallback, limit) {
  if (typeof value !== 'string') return fallback;
  const clean = value.replace(/[\\u0000-\\u001f\\u007f-\\u009f\\u202a-\\u202e\\u2066-\\u2069]/g, ' ')
    .replace(/\\s+/g, ' ').trim();
  return clean ? Array.from(clean).slice(0, limit).join('') : fallback;
}

function readPushNotification(event) {
  let payload;
  try {
    const raw = event.data && event.data.text();
    if (typeof raw === 'string' && raw.length <= 8192) payload = JSON.parse(raw);
  } catch {
    // 비어 있거나 잘못된 본문도 알림 자체는 일반 안내로 표시
  }
  const valid = payload && !Array.isArray(payload) && typeof payload === 'object'
    && NOTIFICATION_TYPES.includes(payload.type);
  if (!valid) payload = {};

  const data = {
    type: valid ? payload.type : 'medication-reminder',
    url: notificationPath(payload.type, payload.url) || '/',
  };
  // 식별자만 보관. 댓글·게시글 본문은 인증된 화면에서 다시 조회
  if (data.type === 'community-notification' && Number.isSafeInteger(payload.notificationId)
      && payload.notificationId > 0) data.notificationId = payload.notificationId;
  if (typeof payload.date === 'string' && /^\\d{4}-\\d{2}-\\d{2}$/.test(payload.date)) {
    const date = new Date(payload.date + 'T00:00:00Z');
    if (Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === payload.date) data.date = payload.date;
  }
  if (typeof payload.time === 'string' && /^(?:[01]\\d|2[0-3]):[0-5]\\d$/.test(payload.time)) data.time = payload.time;
  if (typeof payload.isPreAlarm === 'boolean') data.isPreAlarm = payload.isPreAlarm;

  const tag = typeof payload.tag === 'string' && /^[A-Za-z0-9._:-]{1,120}$/.test(payload.tag)
    ? 'jette-yak-' + payload.tag : 'jette-yak-push';
  return {
    title: notificationText(payload.title, data.type === 'community-notification' ? '제때약 새 알림' : DEFAULT_NOTIFICATION_TITLE, 60),
    options: {
      body: notificationText(payload.body, data.type === 'community-notification'
        ? '새로운 커뮤니티 알림이 있어요. 제때약에서 확인해 주세요.' : DEFAULT_NOTIFICATION_BODY, 240),
      icon: '/pwa/icon-192.png',
      badge: '/pwa/icon-192.png',
      tag,
      data,
    },
  };
}

// 앱 화면이 닫혀 있어도 서버 푸시를 받으면 운영체제 알림으로 표시
self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    const notification = readPushNotification(event);
    try {
      await self.registration.showNotification(notification.title, notification.options);
    } catch {
      // 기기에서 일부 옵션을 거부하면 최소한의 일반 알림으로 한 번 더 시도
      try {
        const community = notification.options.data.type === 'community-notification';
        await self.registration.showNotification(community ? '제때약 새 알림' : DEFAULT_NOTIFICATION_TITLE, {
          body: community ? '새로운 커뮤니티 알림이 있어요. 제때약에서 확인해 주세요.' : DEFAULT_NOTIFICATION_BODY,
          data: community ? notification.options.data : { type: 'medication-reminder', url: '/' },
        });
      } catch {
        // OS 권한 취소·종료 상태에서 발생한 거부가 작업자 전체 오류로 이어지지 않도록 마무리
      }
    }
  })());
});

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const resources = await Promise.all(PRECACHE_URLS.map(async (path) => {
      const url = new URL(path, self.location.origin).href;
      const response = await fetch(new Request(url, {
        cache: 'reload',
        credentials: 'omit',
        redirect: 'error',
      }));
      if (!response.ok || response.type === 'opaque' || response.type === 'opaqueredirect'
          || new URL(response.url || url).origin !== self.location.origin) {
        throw new Error('Offline resource could not be loaded: ' + path);
      }
      return [path, response];
    }));
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(resources.map(([path, response]) => cache.put(path, response)));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

// 사용자가 업데이트를 확인한 뒤에만 대기 중인 새 버전을 활성화
self.addEventListener('message', (event) => {
  // 이전 버전 작업자는 푸시를 표시할 수 없으므로 구독 전 지원 여부를 확인
  if (event.data && event.data.type === 'GET_PUSH_CAPABILITIES') {
    event.ports?.[0]?.postMessage({ push: true, community: true, version: 2 });
    return;
  }
  if (event.data && event.data.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
  }
});

// 알림을 누르면 같은 사이트의 승인한 화면으로 이동. 로그인·관리자 권한은 화면 API에서 재확인
self.addEventListener('notificationclick', (event) => {
  const data = event.notification.data;
  if (!data || !NOTIFICATION_TYPES.includes(data.type)) return;
  const path = notificationPath(data.type, data.url);
  if (!path) return;

  event.notification.close();
  event.waitUntil((async () => {
    const target = new URL(path, self.location.origin).href;
    try {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const ownWindows = windows.filter((client) => {
        try {
          return new URL(client.url).origin === self.location.origin;
        } catch {
          return false;
        }
      });
      const client = ownWindows.find((window) => window.url === target) || ownWindows[0];
      if (client) {
        await client.focus();
        if (client.url !== target) await client.navigate(target);
        return;
      }
    } catch {
      // 이미 닫힌 창은 같은 사이트의 대상 화면으로 다시 열기
    }
    try {
      await self.clients.openWindow(target);
    } catch {
      // 운영체제가 창 열기를 거부해도 외부 주소로 우회하지 않음
    }
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.mode !== 'navigate') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  let path;
  try {
    path = decodeURIComponent(url.pathname).replace(/\\\\/g, '/');
  } catch {
    return;
  }
  // API·첨부·정적 파일 요청은 가로채거나 캐시에 저장하지 않음
  if (/(?:^|\\/)(?:api|uploads|resources|assets|pwa)(?:\\/|$)/i.test(path)
      || /(?:^|\\/)[^/]*\\.[^/]+(?:\\/|$)/.test(path)) return;

  event.respondWith((async () => {
    try {
      return await fetch(request);
    } catch {
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match(OFFLINE_URL)) || Response.error();
    }
  })());
});
`
}

function updateHash(hash, name, content) {
  const byteLength = typeof content === 'string'
    ? new TextEncoder().encode(content).byteLength
    : content.byteLength
  hash.update(`${name.length}:${name}:${byteLength}:`)
  hash.update(content)
}

export default function pwaPlugin() {
  let publicDir

  return {
    name: 'jette-yak-pwa',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      publicDir = config.publicDir && resolve(config.root, config.publicDir)
    },
    async generateBundle(_options, bundle) {
      if (!publicDir) this.error('Jette-Yak PWA requires a public directory.')

      const resources = []
      for (const fileName of [...REQUIRED_RESOURCES, ...OPTIONAL_RESOURCES]) {
        try {
          resources.push([fileName, await readFile(resolve(publicDir, fileName))])
        } catch (error) {
          if (OPTIONAL_RESOURCES.includes(fileName) && error.code === 'ENOENT') continue
          this.error(`Jette-Yak PWA could not read public/${fileName}: ${error.message}`)
        }
      }

      const paths = resources.map(([fileName]) => `/${fileName}`)
      const hash = createHash('sha256')
      updateHash(hash, 'worker-policy', workerSource('BUILD_VERSION', paths))
      for (const fileName of Object.keys(bundle).sort()) {
        const entry = bundle[fileName]
        updateHash(hash, fileName, entry.type === 'chunk' ? entry.code : entry.source)
      }
      for (const [fileName, content] of resources) updateHash(hash, fileName, content)

      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: workerSource(hash.digest('hex').slice(0, 20), paths),
      })
    },
  }
}
