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
  if (event.data && event.data.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
  }
});

// 복약 알림을 누르면 같은 사이트의 홈으로만 이동
self.addEventListener('notificationclick', (event) => {
  const data = event.notification.data;
  if (!data || !['medication-reminder', 'notification-permission'].includes(data.type)
      || data.url !== '/') return;

  event.notification.close();
  event.waitUntil((async () => {
    const target = new URL('/', self.location.origin).href;
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
    await self.clients.openWindow(target);
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
