import { useEffect, useSyncExternalStore } from 'react'
import UiDialog from '../../components/ui/UiDialog'
import { pwaController } from './pwaController.js'
import './PwaControls.css'

function usePwaState() {
  return useSyncExternalStore(pwaController.subscribe, pwaController.getSnapshot, pwaController.getSnapshot)
}

const reminderNote = '앱을 닫아도 알림을 받으려면 설치 후 마이페이지에서 알림 설정과 이 기기 알림을 켜 주세요. 기기마다 따로 연결해야 하며, 서버와 인터넷 연결이 유지되어야 합니다.'

function installDescription(state) {
  if (state.installResult === 'accepted') {
    return '설치를 요청했습니다. 브라우저의 설치 진행 상태를 확인해 주세요.'
  }
  if (state.installResult === 'dismissed') {
    return '설치를 취소했습니다. 나중에 브라우저 메뉴에서 설치 또는 홈 화면 추가 항목이 있는지 확인할 수 있습니다.'
  }
  if (state.installResult === 'failed') {
    return '설치창을 열지 못했습니다. 브라우저 메뉴의 설치 또는 홈 화면 추가 항목을 확인해 주세요. 브라우저에 따라 지원하지 않을 수 있습니다.'
  }
  if (state.helpKind === 'insecure') {
    return '지금은 보안 연결이 아니어서 앱 설치 기능을 사용할 수 없습니다. 휴대폰에서 PC의 내부 IP 주소로 접속했다면 HTTPS로 제공되는 주소를 이용해 주세요.'
  }
  if (state.canInstall) {
    return '제때약을 설치하면 홈 화면이나 바탕 화면에서 앱처럼 바로 열 수 있습니다. 아래 설치 버튼을 누르면 브라우저의 설치창이 열립니다.'
  }
  if (state.helpKind === 'ios-safari') {
    return 'iPhone·iPad의 Safari에서 공유 버튼을 누른 뒤 ‘홈 화면에 추가’를 선택해 주세요. 보이지 않으면 공유 메뉴의 항목을 아래로 내려 확인해 주세요.'
  }
  if (state.helpKind === 'ios-other') {
    return '이 브라우저의 공유 메뉴에서 ‘홈 화면에 추가’가 있는지 확인해 주세요. 항목이 없다면 Safari에서 이 주소를 열고 공유 → 홈 화면에 추가를 선택해 주세요.'
  }
  if (state.helpKind === 'android-brave') {
    return 'Brave의 ⋮ 메뉴에서 ‘앱 설치’ 또는 ‘홈 화면에 추가’를 선택해 주세요. 이미 설치했다면 ‘앱 열기’로 보일 수 있어요. 항목이 없으면 최신 Brave의 일반 탭에서 HTTPS 주소를 다시 열거나 Chrome에서 설치해 주세요.'
  }
  return '브라우저의 주소창 설치 아이콘 또는 메뉴에서 ‘앱 설치’, ‘제때약 설치’, ‘홈 화면에 추가’ 항목이 있는지 확인해 주세요. 표시 이름과 지원 여부는 브라우저·기기에 따라 다릅니다. 항목이 없으면 현재 브라우저에서 그대로 이용할 수 있습니다.'
}

// 로그인과 메뉴에서 같은 상태·안내창을 사용하고 설치 완료 후 진입 버튼을 감춘다.
export function PwaInstallButton({ className = '' }) {
  const state = usePwaState()
  if (state.installed) return null
  return <button
    type="button"
    className={`pwa-install-entry ${className}`.trim()}
    onClick={pwaController.openInstallHelp}
    aria-haspopup="dialog"
  >
    <span aria-hidden="true">＋</span>
    <span>{state.canInstall ? '제때약 앱 설치' : '앱 설치 안내'}</span>
  </button>
}

export default function PwaControls() {
  const state = usePwaState()
  const installOpen = state.dialog === 'install' && !state.installed
  const updateOpen = state.dialog === 'update'
  const updateVisible = state.updateAvailable && !state.updateDismissed && !state.updateApplying

  useEffect(() => {
    if (!state.reconnected) return undefined
    const timeout = window.setTimeout(pwaController.dismissConnectionNotice, 6_000)
    return () => window.clearTimeout(timeout)
  }, [state.reconnected])

  return <>
    {/* 하단 입력·저장 버튼을 가리지 않도록 알림은 상단에 모아 둔다. */}
    <div className="pwa-status-area" aria-label="앱 및 연결 상태">
      <div className="pwa-connection-status" role="status" aria-live="polite" aria-atomic="true">
        {!state.online && <p className="pwa-status-notice pwa-status-offline">
          <span aria-hidden="true">○</span>
          오프라인입니다. 조회·저장은 연결 후 다시 시도해 주세요.
        </p>}
        {state.online && state.reconnected && <p className="pwa-status-notice pwa-status-online">
          <span aria-hidden="true">●</span>
          다시 연결되었습니다. 필요한 작업을 다시 시도해 주세요.
        </p>}
      </div>
      {updateVisible && <div className="pwa-update-notice">
        <span role="status">새 버전이 준비되었습니다.</span>
        <div className="pwa-update-actions">
          <button type="button" onClick={pwaController.openUpdateHelp} aria-haspopup="dialog">업데이트</button>
          <button type="button" className="pwa-update-later" onClick={pwaController.dismissUpdate}>나중에</button>
        </div>
      </div>}
    </div>

    <UiDialog
      open={installOpen}
      title="제때약 앱 설치"
      description={installDescription(state)}
      confirmLabel={state.canInstall ? '설치' : '닫기'}
      cancelLabel={state.canInstall ? '나중에' : ''}
      busy={state.installBusy}
      onCancel={pwaController.closeDialog}
      onConfirm={state.canInstall ? pwaController.requestInstall : pwaController.closeDialog}
    >
      <p className="pwa-reminder-note">{reminderNote}</p>
    </UiDialog>

    <UiDialog
      open={updateOpen}
      title="새 버전으로 업데이트할까요?"
      description="업데이트하면 이 화면이 새로고침됩니다. 작성 중인 글, 상담 내용, 저장하지 않은 입력이 사라질 수 있으니 먼저 저장해 주세요."
      confirmLabel="업데이트 후 새로고침"
      cancelLabel="나중에"
      busy={state.updateApplying}
      onCancel={pwaController.dismissUpdate}
      onConfirm={pwaController.confirmUpdate}
    >
      {state.updateApplying && <p className="pwa-dialog-status" role="status">업데이트를 적용하고 있습니다. 완료되면 화면이 새로고침됩니다.</p>}
      {state.updateError && <p className="pwa-dialog-error" role="status">지금 업데이트를 적용하지 못했습니다. 잠시 후 다시 시도해 주세요.</p>}
    </UiDialog>
  </>
}
