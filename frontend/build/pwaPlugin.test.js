import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import vm from 'node:vm'
import pwaPlugin from './pwaPlugin.js'

const ORIGIN = 'https://jette-yak.test'
const RESOURCE_PATHS = [
  '/offline.html',
  '/pwa/icon-192.png',
  '/pwa/icon-512.png',
  '/pwa/maskable-512.png',
]

async function fixture(t, { appleIcon = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'jette-yak-pwa-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const publicDir = join(root, 'public')
  await mkdir(join(publicDir, 'pwa'), { recursive: true })
  for (const path of RESOURCE_PATHS) {
    await writeFile(join(publicDir, path.slice(1)), path === '/offline.html' ? '<h1>오프라인</h1>' : 'public icon')
  }
  if (appleIcon) await writeFile(join(publicDir, 'pwa/apple-touch-icon.png'), 'apple icon')

  return {
    publicDir,
    async build(bundle = {
      'index.html': { type: 'asset', source: '<div id="root"></div>' },
      'assets/app.js': { type: 'chunk', code: 'console.log("app")' },
    }) {
      const plugin = pwaPlugin()
      plugin.configResolved({ root, publicDir, base: '/' })
      const emitted = []
      await plugin.generateBundle.call({
        emitFile(asset) { emitted.push(asset) },
        error(message) { throw new Error(message) },
      }, {}, bundle)
      assert.equal(emitted.length, 1)
      assert.equal(emitted[0].fileName, 'sw.js')
      return emitted[0].source
    },
  }
}

function workerHarness(source, { network, existingCaches = [], windowUrls = [] } = {}) {
  const listeners = new Map()
  const stores = new Map(existingCaches.map((name) => [name, new Map()]))
  const fetched = []
  const deleted = []
  const focused = []
  const navigated = []
  const opened = []
  const clientMatches = []
  const windowClients = windowUrls.map((url) => ({
    url,
    async focus() { focused.push(this.url); return this },
    async navigate(target) { navigated.push({ from: this.url, to: target }); this.url = target; return this },
  }))
  let claimed = 0
  let skipped = 0
  const key = (request) => new URL(typeof request === 'string' ? request : request.url, ORIGIN).href
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map())
      return {
        async put(request, response) { stores.get(name).set(key(request), response.clone()) },
        async match(request) { return stores.get(name).get(key(request))?.clone() },
      }
    },
    async keys() { return [...stores.keys()] },
    async delete(name) { deleted.push(name); return stores.delete(name) },
  }
  vm.runInNewContext(source, {
    URL,
    Request,
    Response,
    caches,
    async fetch(request) {
      fetched.push(request)
      if (network) return network(request)
      return new Response(new URL(request.url).pathname === '/offline.html' ? 'offline notice' : 'public icon')
    },
    self: {
      location: { origin: ORIGIN },
      addEventListener(type, listener) { listeners.set(type, listener) },
      clients: {
        async claim() { claimed += 1 },
        async matchAll(options) { clientMatches.push(options); return windowClients },
        async openWindow(url) { opened.push(url) },
      },
      async skipWaiting() { skipped += 1 },
    },
  })

  return {
    stores, fetched, deleted, focused, navigated, opened, clientMatches,
    get claimed() { return claimed },
    get skipped() { return skipped },
    async dispatch(type, attributes = {}) {
      const promises = []
      let response
      let intercepted = false
      listeners.get(type)({
        ...attributes,
        waitUntil(promise) { promises.push(promise) },
        respondWith(promise) { intercepted = true; response = promise },
      })
      await Promise.all(promises)
      return { intercepted, extended: promises.length, response: intercepted ? await response : undefined }
    },
  }
}

function navigation(path, attributes = {}) {
  return { url: new URL(path, ORIGIN).href, method: 'GET', mode: 'navigate', ...attributes }
}

test('plugin only runs for production builds', () => {
  assert.equal(pwaPlugin().apply, 'build')
})

test('identical builds produce identical workers regardless of bundle insertion order', async (t) => {
  const files = await fixture(t)
  const first = await files.build()
  const second = await files.build({
    'assets/app.js': { type: 'chunk', code: 'console.log("app")' },
    'index.html': { type: 'asset', source: '<div id="root"></div>' },
  })
  assert.equal(first, second)
})

test('worker version changes with application, offline page, or icon content', async (t) => {
  const files = await fixture(t)
  const initial = await files.build()
  const appChanged = await files.build({ 'assets/app.js': { type: 'chunk', code: 'changed app' } })
  assert.notEqual(initial, appChanged)
  await writeFile(join(files.publicDir, 'offline.html'), 'updated offline page')
  const pageChanged = await files.build()
  assert.notEqual(initial, pageChanged)
  await writeFile(join(files.publicDir, 'pwa/icon-192.png'), 'updated icon')
  assert.notEqual(pageChanged, await files.build())
})

test('missing required public resources fail the build', async (t) => {
  const files = await fixture(t)
  await rm(join(files.publicDir, 'pwa/icon-192.png'))
  await assert.rejects(files.build(), /public\/pwa\/icon-192\.png/)
})

test('install caches only offline notice and branded icons without credentials or redirects', async (t) => {
  const files = await fixture(t, { appleIcon: true })
  const worker = workerHarness(await files.build())
  await worker.dispatch('install')
  assert.equal(worker.stores.size, 1)
  assert.deepEqual([...worker.stores.values()][0].keys().toArray().map((url) => new URL(url).pathname), [
    ...RESOURCE_PATHS, '/pwa/apple-touch-icon.png',
  ])
  assert.equal(worker.fetched.length, 5)
  for (const request of worker.fetched) {
    assert.equal(request.method, 'GET')
    assert.equal(request.cache, 'reload')
    assert.equal(request.credentials, 'omit')
    assert.equal(request.redirect, 'error')
    assert.equal(request.body, null)
  }
  assert.equal(worker.skipped, 0)
})

test('failed or third-party offline resources reject installation before writing a cache', async (t) => {
  const files = await fixture(t)
  for (const response of [
    new Response('missing', { status: 404 }),
    { ok: true, type: 'opaque', url: `${ORIGIN}/offline.html` },
    { ok: true, type: 'basic', url: 'https://third-party.test/offline.html' },
  ]) {
    const worker = workerHarness(await files.build(), { network: () => response })
    await assert.rejects(worker.dispatch('install'), /Offline resource could not be loaded/)
    assert.equal(worker.stores.size, 0)
  }
})

test('navigation uses the network and never caches returned user information', async (t) => {
  const files = await fixture(t)
  const privateResponse = new Response('private medical information')
  const worker = workerHarness(await files.build(), { network: () => privateResponse })
  const request = navigation('/medication?patient=123')
  const result = await worker.dispatch('fetch', { request })
  assert.equal(result.intercepted, true)
  assert.equal(result.response, privateResponse)
  assert.equal(worker.fetched[0], request)
  assert.equal(worker.stores.size, 0)
})

test('true navigation network failures return only the cached offline notice', async (t) => {
  const files = await fixture(t)
  const worker = workerHarness(await files.build(), {
    network(request) {
      if (request.mode === 'navigate') throw new TypeError('Failed to fetch')
      return new Response(new URL(request.url).pathname === '/offline.html' ? 'offline notice' : 'public icon')
    },
  })
  await worker.dispatch('install')
  const result = await worker.dispatch('fetch', { request: navigation('/community/private-post') })
  assert.equal(result.intercepted, true)
  assert.equal(await result.response.text(), 'offline notice')
  assert.equal([...worker.stores.values()][0].size, RESOURCE_PATHS.length)
})

test('HTTP errors pass through instead of appearing as an offline page', async (t) => {
  const files = await fixture(t)
  for (const status of [401, 404, 500, 503]) {
    const worker = workerHarness(await files.build(), { network: () => new Response('server response', { status }) })
    const result = await worker.dispatch('fetch', { request: navigation('/family') })
    assert.equal(result.response.status, status)
    assert.equal(await result.response.text(), 'server response')
    assert.equal(worker.stores.size, 0)
  }
})

test('API, uploaded files, static files, third-party requests, and mutations bypass respondWith', async (t) => {
  const files = await fixture(t)
  const worker = workerHarness(await files.build())
  const requests = [
    ...['/api', '/api/medications?patient=1', '/%61pi/profile', '/api%2Fprescriptions', '/API/profile',
      '/uploads', '/uploads/prescription', '/resources/profile', '/assets/app', '/pwa/icon-192.png',
      '/index.html', '/favicon.svg', '/private/report.pdf', '/logo.png'].map((path) => navigation(path)),
    navigation('https://third-party.test/home'),
    navigation('/medication', { method: 'POST', body: 'sensitive mutation' }),
    navigation('/medication', { method: 'PUT' }),
    navigation('/medication', { method: 'DELETE' }),
    navigation('/medication', { mode: 'cors' }),
    navigation('/api/session', { mode: 'same-origin' }),
    navigation('/%invalid'),
  ]
  for (const request of requests) {
    const result = await worker.dispatch('fetch', { request })
    assert.equal(result.intercepted, false, request.url)
  }
  assert.equal(worker.fetched.length, 0)
  assert.equal(worker.stores.size, 0)
})

test('activation removes only older Jette-Yak caches and claims clients', async (t) => {
  const files = await fixture(t)
  const worker = workerHarness(await files.build(), {
    existingCaches: ['jette-yak-pwa-old', 'unrelated-site-cache', 'workbox-precache-other-app'],
  })
  await worker.dispatch('install')
  const current = [...worker.stores.keys()].find((name) => name.startsWith('jette-yak-pwa-') && name !== 'jette-yak-pwa-old')
  await worker.dispatch('activate')
  assert.deepEqual(worker.deleted, ['jette-yak-pwa-old'])
  assert.equal(worker.stores.has(current), true)
  assert.equal(worker.stores.has('unrelated-site-cache'), true)
  assert.equal(worker.stores.has('workbox-precache-other-app'), true)
  assert.equal(worker.claimed, 1)
})

test('only an explicit SKIP_WAITING message activates a waiting update', async (t) => {
  const files = await fixture(t)
  const worker = workerHarness(await files.build())
  await worker.dispatch('install')
  assert.equal(worker.skipped, 0)
  await worker.dispatch('message', { data: null })
  await worker.dispatch('message', { data: 'SKIP_WAITING' })
  await worker.dispatch('message', { data: { type: 'OTHER' } })
  assert.equal(worker.skipped, 0)
  await worker.dispatch('message', { data: { type: 'SKIP_WAITING' } })
  assert.equal(worker.skipped, 1)
})

test('owned reminder clicks focus an existing home window without navigating again', async (t) => {
  const files = await fixture(t)
  for (const type of ['medication-reminder', 'notification-permission']) {
    const worker = workerHarness(await files.build(), {
      windowUrls: [`${ORIGIN}/medication`, `${ORIGIN}/`],
    })
    let closed = 0
    const result = await worker.dispatch('notificationclick', {
      notification: { data: { type, url: '/' }, close() { closed += 1 } },
    })
    assert.equal(closed, 1)
    assert.equal(result.extended, 1)
    assert.deepEqual(worker.focused, [`${ORIGIN}/`])
    assert.deepEqual(worker.navigated, [])
    assert.deepEqual(worker.opened, [])
    assert.equal(worker.clientMatches[0].type, 'window')
    assert.equal(worker.clientMatches[0].includeUncontrolled, true)
  }
})

test('owned reminder clicks navigate an existing same-origin window to the home page', async (t) => {
  const files = await fixture(t)
  const worker = workerHarness(await files.build(), {
    windowUrls: ['https://third-party.test/', `${ORIGIN}/medication?patient=123`],
  })
  let closed = 0
  await worker.dispatch('notificationclick', {
    notification: { data: { type: 'medication-reminder', url: '/' }, close() { closed += 1 } },
  })
  assert.equal(closed, 1)
  assert.deepEqual(worker.focused, [`${ORIGIN}/medication?patient=123`])
  assert.deepEqual(worker.navigated, [{ from: `${ORIGIN}/medication?patient=123`, to: `${ORIGIN}/` }])
  assert.deepEqual(worker.opened, [])
})

test('owned reminder clicks open only the own home page when no same-origin window exists', async (t) => {
  const files = await fixture(t)
  const worker = workerHarness(await files.build(), {
    windowUrls: ['https://third-party.test/', 'invalid-client-url'],
  })
  let closed = 0
  await worker.dispatch('notificationclick', {
    notification: { data: { type: 'notification-permission', url: '/' }, close() { closed += 1 } },
  })
  assert.equal(closed, 1)
  assert.deepEqual(worker.opened, [`${ORIGIN}/`])
  assert.deepEqual(worker.focused, [])
  assert.deepEqual(worker.navigated, [])
})

test('notification clicks ignore unknown types and every destination other than the literal home path', async (t) => {
  const files = await fixture(t)
  const worker = workerHarness(await files.build(), { windowUrls: [`${ORIGIN}/`] })
  let closed = 0
  for (const data of [
    null,
    { type: 'unknown', url: '/' },
    { type: 'medication-reminder' },
    ...['https://third-party.test/', '//third-party.test/', 'javascript:alert(1)',
      'data:text/html,example', '/medication', '/?next=https://third-party.test/', `${ORIGIN}/`]
      .map((url) => ({ type: 'medication-reminder', url })),
  ]) {
    const result = await worker.dispatch('notificationclick', {
      notification: { data, close() { closed += 1 } },
    })
    assert.equal(result.extended, 0)
  }
  assert.equal(closed, 0)
  assert.deepEqual(worker.clientMatches, [])
  assert.deepEqual(worker.opened, [])
  assert.deepEqual(worker.focused, [])
  assert.deepEqual(worker.navigated, [])
})

test('offline retry reloads the current URL without interpreting query input', async () => {
  const html = await readFile(new URL('../public/offline.html', import.meta.url), 'utf8')
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1]
  let retry
  let reloads = 0
  vm.runInNewContext(script, {
    document: { getElementById(id) { assert.equal(id, 'retry'); return { addEventListener(event, listener) { assert.equal(event, 'click'); retry = listener } } } },
    window: { location: { reload() { reloads += 1 } } },
  })
  retry()
  assert.equal(reloads, 1)
  assert.match(html, /<html lang="ko">/)
  assert.doesNotMatch(html, /(?:src|href)=["']https?:/)
})
