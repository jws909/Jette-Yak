// 설치 이벤트는 React 렌더링 전에 보관하고, 화면 구독과 독립적으로 한 번만 연결한다.
export function createPwaController({
  window: browserWindow = globalThis.window,
  navigator: browserNavigator = globalThis.navigator,
  document: browserDocument = globalThis.document,
  production = false,
  logger = globalThis.console,
  now = () => Date.now(),
  setTimeout: scheduleTimeout = globalThis.setTimeout,
  clearTimeout: cancelTimeout = globalThis.clearTimeout,
} = {}) {
  const standaloneQuery = browserWindow?.matchMedia?.('(display-mode: standalone)')
  const secureContext = browserWindow?.isSecureContext === true
  const userAgent = browserNavigator?.userAgent || ''
  const isIos = /iPad|iPhone|iPod/i.test(userAgent)
    || (/Macintosh/i.test(userAgent) && browserNavigator?.maxTouchPoints > 1)
  // Brave의 iOS UA에도 Safari가 포함될 수 있어 안내용 브라우저 힌트와 함께 구분
  const isBrave = Boolean(browserNavigator?.brave) || /Brave/i.test(userAgent)
  const isSafari = !isBrave && /Safari/i.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(userAgent)
  const helpKind = !secureContext ? 'insecure' : isIos ? (isSafari ? 'ios-safari' : 'ios-other')
    : /Android/i.test(userAgent) && isBrave ? 'android-brave' : 'browser'
  const subscribers = new Set()
  const listeners = []
  let registrationListeners = []
  let removeWorkerListener = () => {}
  let started = false
  let generation = 0
  let startPromise = null
  let deferredPrompt = null
  let registration = null
  let waitingWorker = null
  let confirmedWorker = null
  let updateTimeout = null
  let hasReloaded = false
  let checkInFlight = false
  let lastUpdateCheck = -Infinity
  let snapshot = {
    installed: Boolean(standaloneQuery?.matches || browserNavigator?.standalone),
    canInstall: false,
    installBusy: false,
    installResult: null,
    helpKind,
    online: browserNavigator?.onLine !== false,
    reconnected: false,
    updateAvailable: false,
    updateDismissed: false,
    updateApplying: false,
    updateError: false,
    dialog: null,
  }

  function publish(changes) {
    if (Object.entries(changes).every(([key, value]) => snapshot[key] === value)) return
    snapshot = { ...snapshot, ...changes }
    subscribers.forEach(callback => callback())
  }

  function listen(target, type, handler, cleanups = listeners) {
    if (!target?.addEventListener) return
    target.addEventListener(type, handler)
    cleanups.push(() => target.removeEventListener(type, handler))
  }

  function logFailure(action, error) {
    // 콘솔에도 개인정보나 긴 오류 본문 대신 실패 종류만 남긴다.
    logger?.warn?.(`[PWA] ${action}: ${error?.name || 'Error'}`)
  }

  function clearUpdateTimeout() {
    if (updateTimeout === null) return
    cancelTimeout(updateTimeout)
    updateTimeout = null
  }

  function markInstalled() {
    deferredPrompt = null
    publish({
      installed: true,
      canInstall: false,
      installBusy: false,
      installResult: null,
      ...(snapshot.dialog === 'install' ? { dialog: null } : {}),
    })
  }

  function syncWaitingWorker() {
    const nextWorker = registration?.waiting || null
    if (nextWorker === waitingWorker) return
    waitingWorker = nextWorker
    publish({
      updateAvailable: Boolean(nextWorker),
      updateDismissed: false,
      updateError: false,
      ...(!nextWorker && !snapshot.updateApplying && snapshot.dialog === 'update' ? { dialog: null } : {}),
    })
  }

  function watchInstallingWorker() {
    removeWorkerListener()
    removeWorkerListener = () => {}
    const worker = registration?.installing
    if (!worker?.addEventListener) return
    const onStateChange = () => syncWaitingWorker()
    worker.addEventListener('statechange', onStateChange)
    removeWorkerListener = () => worker.removeEventListener('statechange', onStateChange)
    syncWaitingWorker()
  }

  async function checkForUpdate() {
    if (!registration || !snapshot.online || checkInFlight) return
    syncWaitingWorker()
    // 복귀·재연결 시만 확인하며 빠른 화면 전환으로 반복 요청하지 않는다.
    if (now() - lastUpdateCheck < 60_000) return
    lastUpdateCheck = now()
    checkInFlight = true
    const currentGeneration = generation
    try {
      await registration.update()
      if (started && generation === currentGeneration) syncWaitingWorker()
    } catch (error) {
      logFailure('업데이트 확인 실패', error)
    } finally {
      if (generation === currentGeneration) checkInFlight = false
    }
  }

  function start() {
    if (started) return startPromise
    if (!browserWindow) return Promise.resolve(null)
    started = true
    const currentGeneration = ++generation

    listen(browserWindow, 'beforeinstallprompt', event => {
      if (snapshot.installed || !secureContext) return
      event.preventDefault()
      deferredPrompt = event
      publish({ canInstall: !snapshot.installBusy, installResult: null })
    })
    listen(browserWindow, 'appinstalled', markInstalled)
    const onDisplayModeChange = () => {
      if (standaloneQuery?.matches || browserNavigator?.standalone) markInstalled()
    }
    if (standaloneQuery?.addEventListener) listen(standaloneQuery, 'change', onDisplayModeChange)
    else if (standaloneQuery?.addListener) {
      standaloneQuery.addListener(onDisplayModeChange)
      listeners.push(() => standaloneQuery.removeListener(onDisplayModeChange))
    }
    listen(browserWindow, 'offline', () => publish({ online: false, reconnected: false }))
    listen(browserWindow, 'online', () => {
      publish({ online: true, reconnected: !snapshot.online || snapshot.reconnected })
      void checkForUpdate()
    })
    listen(browserDocument, 'visibilitychange', () => {
      if (browserDocument.visibilityState === 'visible') {
        onDisplayModeChange()
        void checkForUpdate()
      }
    })

    // 개발 서버에는 작업자를 등록하지 않아 HMR과 테스트용 캐시가 섞이지 않게 한다.
    if (!production || !secureContext || !browserNavigator?.serviceWorker) {
      startPromise = Promise.resolve(null)
      return startPromise
    }
    listen(browserNavigator.serviceWorker, 'controllerchange', () => {
      clearUpdateTimeout()
      syncWaitingWorker()
      // 다른 탭의 업데이트와 첫 설치는 입력 중인 이 화면을 새로고침하지 않는다.
      if (!confirmedWorker || hasReloaded) return
      hasReloaded = true
      browserWindow.location.reload()
    })
    startPromise = Promise.resolve()
      .then(() => {
        if (!started || generation !== currentGeneration) return null
        return browserNavigator.serviceWorker.register('/sw.js', { scope: '/' })
      })
      .then(nextRegistration => {
        if (!nextRegistration || !started || generation !== currentGeneration) return null
        registration = nextRegistration
        listen(registration, 'updatefound', watchInstallingWorker, registrationListeners)
        watchInstallingWorker()
        syncWaitingWorker()
        return registration
      })
      .catch(error => {
        logFailure('서비스 워커 등록 실패', error)
        return null
      })
    return startPromise
  }

  async function requestInstall() {
    const promptEvent = deferredPrompt
    if (!promptEvent || snapshot.installed || snapshot.installBusy) return null
    const currentGeneration = generation
    // prompt()는 한 이벤트당 한 번만 호출할 수 있어 await 전에 즉시 소비한다.
    deferredPrompt = null
    publish({ canInstall: false, installBusy: true, installResult: null })
    let result = 'failed'
    try {
      const promptResult = await promptEvent.prompt()
      const choice = promptEvent.userChoice ? await promptEvent.userChoice : promptResult
      result = choice?.outcome === 'accepted' ? 'accepted' : 'dismissed'
    } catch (error) {
      logFailure('설치 안내 실패', error)
    }
    if (started && generation === currentGeneration && !snapshot.installed) {
      publish({ installBusy: false, canInstall: Boolean(deferredPrompt), installResult: result })
    }
    return result
  }

  function confirmUpdate() {
    if (snapshot.updateApplying) return false
    syncWaitingWorker()
    if (!waitingWorker) return false
    confirmedWorker = waitingWorker
    const workerToConfirm = confirmedWorker
    const currentGeneration = generation
    publish({ updateApplying: true, updateError: false })
    // 작업자가 응답하지 않아도 화면이 잠기지 않으며 늦은 전환에는 새로고침하지 않는다.
    updateTimeout = scheduleTimeout(() => {
      updateTimeout = null
      if (!started || generation !== currentGeneration || confirmedWorker !== workerToConfirm) return
      confirmedWorker = null
      syncWaitingWorker()
      publish({ updateApplying: false, updateError: true })
    }, 15_000)
    try {
      // 이 메시지는 입력 손실 안내를 읽고 확인한 뒤에만 전송한다.
      confirmedWorker.postMessage({ type: 'SKIP_WAITING' })
      return true
    } catch (error) {
      clearUpdateTimeout()
      confirmedWorker = null
      publish({ updateApplying: false, updateError: true })
      logFailure('업데이트 적용 실패', error)
      return false
    }
  }

  function destroy() {
    started = false
    generation += 1
    clearUpdateTimeout()
    listeners.splice(0).forEach(remove => remove())
    registrationListeners.splice(0).forEach(remove => remove())
    removeWorkerListener()
    removeWorkerListener = () => {}
    registrationListeners = []
    deferredPrompt = null
    registration = null
    waitingWorker = null
    confirmedWorker = null
    startPromise = null
    checkInFlight = false
    lastUpdateCheck = -Infinity
    subscribers.clear()
    hasReloaded = false
    snapshot = {
      ...snapshot,
      canInstall: false,
      installBusy: false,
      installResult: null,
      reconnected: false,
      updateAvailable: false,
      updateDismissed: false,
      updateApplying: false,
      updateError: false,
      dialog: null,
    }
  }

  return {
    start,
    destroy,
    requestInstall,
    confirmUpdate,
    getSnapshot: () => snapshot,
    subscribe(callback) {
      subscribers.add(callback)
      // StrictMode의 화면 재구독은 전역 설치 이벤트 연결에 영향을 주지 않는다.
      return () => subscribers.delete(callback)
    },
    openInstallHelp() {
      if (!snapshot.installed) publish({ dialog: 'install', installResult: null })
    },
    openUpdateHelp() {
      syncWaitingWorker()
      if (snapshot.updateAvailable) publish({ dialog: 'update', updateError: false })
    },
    closeDialog: () => publish({ dialog: null }),
    dismissUpdate: () => publish({ updateDismissed: true, dialog: null }),
    dismissConnectionNotice: () => publish({ reconnected: false }),
  }
}

export const pwaController = createPwaController({ production: import.meta.env?.PROD === true })

// main.jsx에서 render 전에 호출해 설치 가능 이벤트를 놓치지 않는다.
export function initializePwa() {
  void pwaController.start()
  return pwaController
}

if (import.meta.hot) import.meta.hot.dispose(() => pwaController.destroy())
