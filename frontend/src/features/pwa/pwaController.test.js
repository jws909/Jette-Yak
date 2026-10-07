import test from 'node:test'
import assert from 'node:assert/strict'
import { createPwaController } from './pwaController.js'

class FakeTarget {
  events = new Map()

  addEventListener(type, callback) {
    if (!this.events.has(type)) this.events.set(type, new Set())
    this.events.get(type).add(callback)
  }

  removeEventListener(type, callback) {
    this.events.get(type)?.delete(callback)
  }

  emit(type, details = {}) {
    const event = { preventDefault() { this.defaultPrevented = true }, ...details }
    this.events.get(type)?.forEach(callback => callback(event))
    return event
  }

  listenerCount() {
    return [...this.events.values()].reduce((count, callbacks) => count + callbacks.size, 0)
  }
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((onResolve, onReject) => { resolve = onResolve; reject = onReject })
  return { promise, resolve, reject }
}

function fakeWorker() {
  const worker = new FakeTarget()
  worker.messages = []
  worker.postMessage = message => worker.messages.push(message)
  return worker
}

function fakeTimers() {
  let nextId = 0
  const pending = new Map()
  return {
    pending,
    setTimeout(callback, delay) {
      const id = ++nextId
      pending.set(id, { callback, delay })
      return id
    },
    clearTimeout(id) { pending.delete(id) },
    expire() {
      const scheduled = [...pending.values()]
      pending.clear()
      scheduled.forEach(({ callback }) => callback())
    },
  }
}

function createEnvironment(overrides = {}) {
  const media = new FakeTarget()
  media.matches = false
  const window = new FakeTarget()
  window.isSecureContext = true
  window.matchMedia = () => media
  let reloads = 0
  window.location = { reload() { reloads += 1 } }
  const document = new FakeTarget()
  document.visibilityState = 'visible'
  const registration = new FakeTarget()
  registration.waiting = null
  registration.installing = null
  let updates = 0
  registration.update = async () => { updates += 1 }
  const serviceWorker = new FakeTarget()
  serviceWorker.controller = fakeWorker()
  const registrations = []
  serviceWorker.register = async (...args) => { registrations.push(args); return registration }
  const navigator = { onLine: true, userAgent: 'Chrome', serviceWorker }
  const logs = []
  let time = 100_000
  const controller = createPwaController({
    window,
    navigator,
    document,
    production: true,
    logger: { warn: message => logs.push(message) },
    now: () => time,
    ...overrides,
  })
  return {
    controller, window, navigator, document, media, registration, serviceWorker, registrations, logs,
    get reloads() { return reloads },
    get updates() { return updates },
    advanceTime: milliseconds => { time += milliseconds },
  }
}

async function settle() {
  await new Promise(resolve => setTimeout(resolve, 0))
}

test('initialization registers once and subscribes before asynchronous registration', async () => {
  const env = createEnvironment()
  const firstStart = env.controller.start()
  const secondStart = env.controller.start()
  assert.equal(firstStart, secondStart)
  const event = env.window.emit('beforeinstallprompt', { prompt: async () => ({ outcome: 'dismissed' }) })
  assert.equal(event.defaultPrevented, true)
  assert.equal(env.controller.getSnapshot().canInstall, true)
  await firstStart
  assert.deepEqual(env.registrations, [['/sw.js', { scope: '/' }]])
  env.controller.destroy()
})

test('dev, insecure, and unsupported environments do not register a service worker', async () => {
  const dev = createEnvironment({ production: false })
  await dev.controller.start()
  assert.equal(dev.registrations.length, 0)
  assert.ok(dev.window.listenerCount() > 0)
  dev.controller.destroy()

  const insecureWindow = new FakeTarget()
  insecureWindow.isSecureContext = false
  const insecure = createEnvironment({ window: insecureWindow })
  await insecure.controller.start()
  assert.equal(insecure.registrations.length, 0)
  assert.equal(insecure.controller.getSnapshot().helpKind, 'insecure')
  const event = insecureWindow.emit('beforeinstallprompt', { prompt: async () => ({ outcome: 'accepted' }) })
  assert.equal(event.defaultPrevented, undefined)
  assert.equal(insecure.controller.getSnapshot().canInstall, false)
  insecure.controller.destroy()

  const unsupported = createEnvironment({ navigator: { onLine: true, userAgent: 'Firefox' } })
  await unsupported.controller.start()
  assert.equal(unsupported.registrations.length, 0)
  assert.equal(unsupported.controller.getSnapshot().helpKind, 'browser')
  unsupported.controller.destroy()
})

test('install prompt requires an explicit action and is consumed before awaiting the user', async () => {
  const env = createEnvironment()
  await env.controller.start()
  const choice = deferred()
  let prompts = 0
  env.window.emit('beforeinstallprompt', {
    prompt() { prompts += 1; return Promise.resolve() },
    userChoice: choice.promise,
  })
  assert.equal(prompts, 0)
  env.controller.openInstallHelp()
  assert.equal(prompts, 0)
  assert.equal(env.controller.getSnapshot().dialog, 'install')
  const first = env.controller.requestInstall()
  assert.equal(prompts, 1)
  assert.equal(env.controller.getSnapshot().canInstall, false)
  assert.equal(env.controller.getSnapshot().installBusy, true)
  assert.equal(await env.controller.requestInstall(), null)
  choice.resolve({ outcome: 'dismissed' })
  assert.equal(await first, 'dismissed')
  assert.equal(await env.controller.requestInstall(), null)
  assert.equal(env.controller.getSnapshot().installResult, 'dismissed')
  env.controller.destroy()
})

test('a newly supplied install event survives the completion of an older prompt', async () => {
  const env = createEnvironment()
  await env.controller.start()
  const firstChoice = deferred()
  env.window.emit('beforeinstallprompt', { prompt: () => firstChoice.promise })
  const first = env.controller.requestInstall()
  let newPrompts = 0
  env.window.emit('beforeinstallprompt', {
    prompt: async () => { newPrompts += 1; return { outcome: 'accepted' } },
  })
  firstChoice.resolve({ outcome: 'dismissed' })
  await first
  assert.equal(env.controller.getSnapshot().canInstall, true)
  assert.equal(await env.controller.requestInstall(), 'accepted')
  assert.equal(newPrompts, 1)
  env.controller.destroy()
})

test('prompt rejection clears the consumed event and stays recoverable', async () => {
  const env = createEnvironment()
  await env.controller.start()
  env.window.emit('beforeinstallprompt', {
    prompt() { throw new Error('private error details') },
  })
  assert.equal(await env.controller.requestInstall(), 'failed')
  assert.equal(env.controller.getSnapshot().canInstall, false)
  assert.equal(env.controller.getSnapshot().installBusy, false)
  assert.equal(env.controller.getSnapshot().installResult, 'failed')
  assert.equal(env.logs.length, 1)
  assert.ok(!env.logs[0].includes('private error details'))
  env.controller.destroy()
})

test('appinstalled and standalone mode clear installation UI, including late prompt completion', async () => {
  const env = createEnvironment()
  await env.controller.start()
  const choice = deferred()
  env.window.emit('beforeinstallprompt', { prompt: () => choice.promise })
  env.controller.openInstallHelp()
  const installation = env.controller.requestInstall()
  env.window.emit('appinstalled')
  choice.resolve({ outcome: 'accepted' })
  await installation
  assert.equal(env.controller.getSnapshot().installed, true)
  assert.equal(env.controller.getSnapshot().canInstall, false)
  assert.equal(env.controller.getSnapshot().dialog, null)
  assert.equal(env.controller.getSnapshot().installResult, null)
  env.controller.openInstallHelp()
  assert.equal(env.controller.getSnapshot().dialog, null)
  const installedEvent = env.window.emit('beforeinstallprompt', { prompt: async () => ({ outcome: 'accepted' }) })
  assert.equal(installedEvent.defaultPrevented, undefined)
  env.controller.destroy()

  const standalone = createEnvironment()
  await standalone.controller.start()
  standalone.media.matches = true
  standalone.media.emit('change')
  assert.equal(standalone.controller.getSnapshot().installed, true)
  standalone.controller.destroy()
})

test('manual help recognizes iOS Safari, other iOS browsers, and iPad desktop user agents', () => {
  const create = navigator => createEnvironment({ navigator }).controller
  const safari = create({ userAgent: 'iPhone Version/18.0 Mobile Safari/604.1' })
  assert.equal(safari.getSnapshot().helpKind, 'ios-safari')
  const chrome = create({ userAgent: 'iPhone CriOS/130.0 Mobile Safari/604.1' })
  assert.equal(chrome.getSnapshot().helpKind, 'ios-other')
  const ipad = create({ userAgent: 'Macintosh Version/18.0 Safari/605.1', maxTouchPoints: 5, standalone: true })
  assert.equal(ipad.getSnapshot().helpKind, 'ios-safari')
  assert.equal(ipad.getSnapshot().installed, true)
})

test('waiting updates are announced and can be postponed without messaging a worker or reloading', async () => {
  const env = createEnvironment()
  const worker = fakeWorker()
  env.registration.waiting = worker
  await env.controller.start()
  assert.equal(env.controller.getSnapshot().updateAvailable, true)
  env.controller.openUpdateHelp()
  assert.equal(env.controller.getSnapshot().dialog, 'update')
  env.controller.dismissUpdate()
  assert.equal(env.controller.getSnapshot().updateDismissed, true)
  assert.equal(env.controller.getSnapshot().dialog, null)
  env.serviceWorker.emit('controllerchange')
  assert.equal(env.reloads, 0)
  assert.deepEqual(worker.messages, [])
  env.controller.destroy()
})

test('only a confirmed update sends SKIP_WAITING and reloads exactly once on controller change', async () => {
  const env = createEnvironment()
  await env.controller.start()
  env.serviceWorker.emit('controllerchange')
  assert.equal(env.reloads, 0)
  const worker = fakeWorker()
  env.registration.installing = worker
  env.registration.emit('updatefound')
  env.registration.waiting = worker
  worker.emit('statechange')
  assert.equal(env.controller.getSnapshot().updateAvailable, true)
  env.controller.openUpdateHelp()
  assert.equal(env.controller.confirmUpdate(), true)
  assert.equal(env.controller.confirmUpdate(), false)
  assert.equal(env.reloads, 0)
  assert.deepEqual(worker.messages, [{ type: 'SKIP_WAITING' }])
  env.registration.waiting = null
  env.serviceWorker.emit('controllerchange')
  env.serviceWorker.emit('controllerchange')
  assert.equal(env.reloads, 1)
  env.controller.destroy()
})

test('a newer waiting worker restores the notification after an earlier update was postponed', async () => {
  const env = createEnvironment()
  env.registration.waiting = fakeWorker()
  await env.controller.start()
  env.controller.dismissUpdate()
  const replacement = fakeWorker()
  env.registration.installing = replacement
  env.registration.emit('updatefound')
  env.registration.waiting = replacement
  replacement.emit('statechange')
  assert.equal(env.controller.getSnapshot().updateDismissed, false)
  assert.equal(env.controller.getSnapshot().updateAvailable, true)
  env.controller.destroy()
})

test('update timeout unlocks the dialog and revokes consent for a late controller change', async () => {
  const timers = fakeTimers()
  const env = createEnvironment(timers)
  env.registration.waiting = fakeWorker()
  await env.controller.start()
  env.controller.openUpdateHelp()
  assert.equal(env.controller.confirmUpdate(), true)
  assert.equal(timers.pending.size, 1)
  assert.equal([...timers.pending.values()][0].delay, 15_000)
  timers.expire()
  assert.equal(env.controller.getSnapshot().updateApplying, false)
  assert.equal(env.controller.getSnapshot().updateError, true)
  assert.equal(env.controller.getSnapshot().dialog, 'update')
  env.serviceWorker.emit('controllerchange')
  assert.equal(env.reloads, 0)
  assert.equal(env.controller.confirmUpdate(), true)
  env.serviceWorker.emit('controllerchange')
  env.serviceWorker.emit('controllerchange')
  assert.equal(env.reloads, 1)
  assert.equal(timers.pending.size, 0)
  timers.expire()
  assert.equal(env.reloads, 1)
  env.controller.destroy()
})

test('destroy clears the update timeout and late callbacks cannot change disposed state', async () => {
  const timers = fakeTimers()
  const env = createEnvironment(timers)
  env.registration.waiting = fakeWorker()
  await env.controller.start()
  env.controller.confirmUpdate()
  const callback = [...timers.pending.values()][0].callback
  env.controller.destroy()
  assert.equal(timers.pending.size, 0)
  callback()
  assert.equal(env.controller.getSnapshot().updateError, false)
  assert.equal(env.controller.getSnapshot().updateApplying, false)
  assert.equal(env.reloads, 0)
})

test('failed update message revokes reload consent and permits a later retry', async () => {
  const env = createEnvironment()
  const worker = fakeWorker()
  worker.postMessage = () => { throw new Error('private failure details') }
  env.registration.waiting = worker
  await env.controller.start()
  env.controller.openUpdateHelp()
  assert.equal(env.controller.confirmUpdate(), false)
  assert.equal(env.controller.getSnapshot().updateError, true)
  assert.equal(env.controller.getSnapshot().updateApplying, false)
  env.serviceWorker.emit('controllerchange')
  assert.equal(env.reloads, 0)
  worker.postMessage = message => worker.messages.push(message)
  assert.equal(env.controller.confirmUpdate(), true)
  env.serviceWorker.emit('controllerchange')
  assert.equal(env.reloads, 1)
  env.controller.destroy()
})

test('offline/reconnect status preserves the page and checks for updates on online/visible events only', async () => {
  const env = createEnvironment()
  await env.controller.start()
  assert.equal(env.updates, 0)
  env.window.emit('offline')
  assert.equal(env.controller.getSnapshot().online, false)
  env.document.emit('visibilitychange')
  assert.equal(env.updates, 0)
  env.window.emit('online')
  await settle()
  assert.equal(env.controller.getSnapshot().online, true)
  assert.equal(env.controller.getSnapshot().reconnected, true)
  assert.equal(env.updates, 1)
  env.document.emit('visibilitychange')
  assert.equal(env.updates, 1)
  env.advanceTime(60_001)
  env.document.visibilityState = 'hidden'
  env.document.emit('visibilitychange')
  assert.equal(env.updates, 1)
  env.document.visibilityState = 'visible'
  env.document.emit('visibilitychange')
  await settle()
  assert.equal(env.updates, 2)
  assert.equal(env.reloads, 0)
  env.controller.dismissConnectionNotice()
  assert.equal(env.controller.getSnapshot().reconnected, false)
  env.controller.destroy()
})

test('registration and update failures are handled without an unhandled rejection', async () => {
  const env = createEnvironment()
  env.serviceWorker.register = async () => { throw new TypeError('private URL') }
  assert.equal(await env.controller.start(), null)
  assert.deepEqual(env.logs, ['[PWA] 서비스 워커 등록 실패: TypeError'])
  env.controller.destroy()

  const update = createEnvironment()
  update.registration.update = async () => { throw new Error('private failure') }
  await update.controller.start()
  update.window.emit('online')
  await settle()
  assert.equal(update.logs.length, 1)
  assert.equal(update.controller.getSnapshot().online, true)
  update.controller.destroy()
})

test('React subscriptions can detach and resubscribe without losing the early installation listener', async () => {
  const env = createEnvironment()
  await env.controller.start()
  let notifications = 0
  const detach = env.controller.subscribe(() => { notifications += 1 })
  detach()
  env.window.emit('offline')
  assert.equal(notifications, 0)
  const detachAgain = env.controller.subscribe(() => { notifications += 1 })
  env.window.emit('beforeinstallprompt', { prompt: async () => ({ outcome: 'accepted' }) })
  assert.equal(notifications, 1)
  assert.equal(env.controller.getSnapshot().canInstall, true)
  detachAgain()
  env.controller.destroy()
})

test('destroy removes every listener and ignores a registration that resolves after disposal', async () => {
  const env = createEnvironment()
  env.registration.installing = fakeWorker()
  await env.controller.start()
  assert.ok(env.registration.installing.listenerCount() > 0)
  env.controller.destroy()
  for (const target of [env.window, env.document, env.media, env.serviceWorker, env.registration, env.registration.installing]) {
    assert.equal(target.listenerCount(), 0)
  }

  const late = createEnvironment()
  const registrationResult = deferred()
  late.serviceWorker.register = () => registrationResult.promise
  const start = late.controller.start()
  await Promise.resolve()
  late.controller.destroy()
  registrationResult.resolve(late.registration)
  assert.equal(await start, null)
  assert.equal(late.registration.listenerCount(), 0)
  assert.equal(late.controller.getSnapshot().updateAvailable, false)
  // 명시적 재시작은 가능하며 등록 해제나 타 작업자의 캐시는 건드리지 않는다.
  late.serviceWorker.register = async () => late.registration
  await late.controller.start()
  assert.ok(late.registration.listenerCount() > 0)
  late.controller.destroy()
})
