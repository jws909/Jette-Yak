import { useState } from 'react';
import { useDialog } from '../../contexts/DialogContext';
import './PushSettings.css';

/** 계정 전체 알림 설정과 구분해 현재 휴대폰·브라우저의 수신 상태를 표시 */
export default function PushSettings({ push, accountEnabled, accountSaving = false }) {
  const { showAlert } = useDialog();
  const [feedback, setFeedback] = useState('');
  if (!push) return null;
  const unavailable = !push.environment.supported || !push.config?.enabled;
  const disabled = Boolean(push.busy || push.checking || accountSaving);
  const run = async action => {
    setFeedback('');
    try {
      if (!await push[action]()) return;
      setFeedback(action === 'enable' ? '이 기기에서 앱을 닫아도 복약 알림을 받을 수 있어요.'
        : action === 'disable' ? '이 기기의 알림을 껐어요. 다른 기기의 설정은 유지돼요.'
          : '테스트 알림을 요청했어요. 휴대폰 알림함을 확인해 주세요.');
    } catch (error) { await showAlert(error.message, '알림 설정 안내'); }
  };
  const status = push.checking ? '설정 확인 중…' : !accountEnabled ? '전체 알림 꺼짐'
    : push.active ? '이 기기 알림 켜짐' : '이 기기 알림 꺼짐';
  return <section className="device-push-settings" aria-labelledby="device-push-heading" aria-busy={disabled}>
    <div className="device-push-heading"><h3 id="device-push-heading">앱을 닫아도 알림 받기</h3><span className={`device-push-status${push.active ? ' is-active' : ''}`} role="status">{status}</span></div>
    <p>이 기기에 복약 시간 30분 전과 정시 알림을 보내요.<br />잠금 화면에는 약 이름을 표시하지 않아요.</p>
    {push.environment.supported && !push.active && push.environment.isBrave && !push.environment.isIOS && <p className="device-push-help">Brave를 사용한다면 설정 → 개인정보 및 보안의 “푸시 메시징에 Google 서비스 사용”을 확인해 주세요. 설정을 바꾼 뒤에는 브라우저와 앱을 다시 열어 주세요.</p>}
    {!push.environment.supported ? <p className="device-push-help">{push.environment.message}</p>
      : push.config && !push.config.enabled ? <p className="device-push-help">서버 알림 기능을 준비 중이에요. 준비가 끝나면 이곳에서 켤 수 있어요.</p>
        : push.error ? <p className="device-push-help" role="alert">{push.error}</p> : null}
    {!accountEnabled && <p className="device-push-help">위의 복약 알림 전체 설정을 켜면 이 기기에서도 알림을 받을 수 있어요.</p>}
    <div className="device-push-actions">
      {push.subscribed ? <button type="button" onClick={() => run('disable')} disabled={disabled}>{push.busy === 'disable' ? '해제 중…' : '이 기기 알림 끄기'}</button>
        : <button type="button" className="device-push-primary" onClick={() => run('enable')} disabled={disabled || unavailable || !accountEnabled}>{push.busy === 'enable' ? '알림 연결 중…' : '이 기기 알림 켜기'}</button>}
      <button type="button" onClick={() => run('test')} disabled={disabled || !push.active}>{push.busy === 'test' ? '알림 보내는 중…' : '테스트 알림 보내기'}</button>
      {(push.error || (push.config && !push.config.enabled)) && <button type="button" onClick={push.refresh} disabled={disabled}>설정 다시 확인</button>}
    </div>
    {feedback && <p className="device-push-feedback" role="status">{feedback}</p>}
    <p className="device-push-note">서버가 켜져 있고 인터넷에 연결되어 있어야 해요. 방해 금지·절전 설정에 따라 표시가 늦어질 수 있어요. 로그아웃하면 이 기기의 알림도 꺼져요.</p>
  </section>;
}
