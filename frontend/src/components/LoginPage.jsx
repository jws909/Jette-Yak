import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./LoginPage.css";

/**
 * 로그인 페이지 컴포넌트
 *
 * Spring 백엔드의 POST /api/auth/login 엔드포인트를 호출합니다.
 * 요청 바디: { username, password }
 * 응답 예상: { token: "..." }
 *
 * 화면 이동은 컴포넌트 내부에서 useNavigate로 직접 처리합니다.
 *
 * 사용 예시:
 *   <LoginPage onLoginSuccess={(token) => { ... }} />
 */
export default function LoginPage({ onLoginSuccess }) {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFindIdOpen, setIsFindIdOpen] = useState(false);
  const [findIdEmail, setFindIdEmail] = useState("");
  const [findIdCode, setFindIdCode] = useState("");
  const [findIdMessage, setFindIdMessage] = useState("");
  const [foundUsername, setFoundUsername] = useState("");
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isResetPasswordOpen, setIsResetPasswordOpen] = useState(false);
  const [resetUsername, setResetUsername] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [isResetVerified, setIsResetVerified] = useState(false);
  const [isResetSending, setIsResetSending] = useState(false);

  const closeFindId = () => {
    setIsFindIdOpen(false);
    setFindIdEmail("");
    setFindIdCode("");
    setFindIdMessage("");
    setFoundUsername("");
  };

  const sendFindIdCode = async (e) => {
    e.preventDefault();
    const email = findIdEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFindIdMessage("올바른 이메일 형식을 입력해 주세요.");
      return;
    }
    setIsSendingCode(true);
    setFindIdMessage("");
    setFoundUsername("");
    try {
      const response = await fetch("/api/auth/find-id/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json().catch(() => ({}));
      setFindIdMessage(data.message || "인증번호 발송에 실패했습니다.");
    } catch {
      setFindIdMessage("서버에 연결할 수 없습니다.");
    } finally {
      setIsSendingCode(false);
    }
  };

  const verifyFindIdCode = async (e) => {
    e.preventDefault();
    setFindIdMessage("");
    try {
      const response = await fetch("/api/auth/find-id/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: findIdEmail.trim(), code: findIdCode.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFindIdMessage(data.message || "인증번호 확인에 실패했습니다.");
        return;
      }
      setFoundUsername(data.username);
    } catch {
      setFindIdMessage("서버에 연결할 수 없습니다.");
    }
  };

  const closePasswordReset = () => {
    setIsResetPasswordOpen(false);
    setResetUsername("");
    setResetEmail("");
    setResetCode("");
    setNewPassword("");
    setConfirmNewPassword("");
    setResetMessage("");
    setIsResetVerified(false);
  };

  const sendPasswordResetCode = async (e) => {
    e.preventDefault();
    if (!resetUsername.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resetEmail.trim())) {
      setResetMessage("아이디와 올바른 이메일을 입력해 주세요.");
      return;
    }
    setIsResetSending(true);
    setResetMessage("");
    setIsResetVerified(false);
    try {
      const response = await fetch("/api/auth/reset-password/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: resetUsername.trim(), email: resetEmail.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      setResetMessage(data.message || "인증번호 발송에 실패했습니다.");
    } catch {
      setResetMessage("서버에 연결할 수 없습니다.");
    } finally {
      setIsResetSending(false);
    }
  };

  const verifyPasswordResetCode = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch("/api/auth/reset-password/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: resetUsername.trim(), email: resetEmail.trim(), code: resetCode.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setResetMessage(data.message || "인증번호 확인에 실패했습니다.");
        return;
      }
      setIsResetVerified(true);
      setResetMessage(data.message || "이메일 인증이 완료되었습니다.");
    } catch {
      setResetMessage("서버에 연결할 수 없습니다.");
    }
  };

  const submitPasswordReset = async (e) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setResetMessage("새 비밀번호는 8자 이상으로 입력해 주세요.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setResetMessage("새 비밀번호와 확인 값이 일치하지 않습니다.");
      return;
    }
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: resetUsername.trim(), email: resetEmail.trim(), newPassword }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setResetMessage(data.message || "비밀번호 재설정에 실패했습니다.");
        return;
      }
      setPassword("");
      setResetMessage(data.message || "비밀번호가 재설정되었습니다.");
      setTimeout(closePasswordReset, 1200);
    } catch {
      setResetMessage("서버에 연결할 수 없습니다.");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!username.trim() || !password) {
      setError("아이디와 비밀번호를 모두 입력해 주세요.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          setError("아이디 또는 비밀번호가 올바르지 않습니다.");
        } else {
          setError("로그인 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.");
        }
        setIsSubmitting(false);
        return;
      }

      const data = await response.json();
      setIsSubmitting(false);
      onLoginSuccess?.(data);
    } catch {
      setError("서버에 연결할 수 없습니다. 네트워크 상태를 확인해 주세요.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-screen">
      <main className="login-panel">
        <div className="brand-logo">
          <span className="brand-logo__icon" aria-hidden="true">
            <svg viewBox="0 0 32 16" width="24" height="12">
              <defs>
                <clipPath id="capsuleClip">
                  <rect x="1" y="1" width="30" height="14" rx="7" ry="7" />
                </clipPath>
              </defs>
              <rect
                x="1"
                y="1"
                width="30"
                height="14"
                rx="7"
                ry="7"
                fill="#fff"
                stroke="currentColor"
                strokeWidth="2"
              />
              <g clipPath="url(#capsuleClip)">
                <rect x="1" y="1" width="15" height="14" fill="currentColor" />
              </g>
            </svg>
          </span>
          <span className="brand-logo__text">제때약</span>
        </div>

        <p className="login-breadcrumb">나만의 복약 기록장</p>

        <h1 className="login-headline">
          오늘의 건강을
          <br />
          <span className="login-headline__accent">정성껏 기록하세요.</span>
        </h1>
        <p className="login-subtitle">
          처방전부터 매일의 복용 알림까지,
          <br />
          나에게 꼭 맞는 건강 루틴을 만들어요.
        </p>

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <label className="login-field" htmlFor="username">
            아이디
            <input
              id="username"
              name="username"
              type="text"
              placeholder="아이디를 입력하세요"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isSubmitting}
            />
          </label>

          <label className="login-field" htmlFor="password">
            비밀번호
            <input
              id="password"
              name="password"
              type="password"
              placeholder="비밀번호를 입력하세요"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isSubmitting}
            />
          </label>

          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="login-submit" disabled={isSubmitting}>
            {isSubmitting ? "로그인 중..." : "로그인"}{" "}
            <span aria-hidden="true">←</span>
          </button>

          <div
            className="login-links"
            onClick={(e) => {
              const buttons = e.currentTarget.querySelectorAll("button");
              if (e.target.closest("button") === buttons[0]) {
                setIsFindIdOpen(true);
              }
              if (e.target.closest("button") === buttons[1]) {
                setIsResetPasswordOpen(true);
              }
            }}
          >
            <button type="button" className="login-links__item">
              아이디 찾기
            </button>
            <span className="login-links__divider">|</span>
            <button type="button" className="login-links__item">
              비밀번호 찾기
            </button>
            <span className="login-links__divider">|</span>
            <button
              type="button"
              className="login-links__item"
              onClick={() => navigate("/signup")}
            >
              회원가입
            </button>
          </div>
        </form>

        {isFindIdOpen && (
          <div className="find-id-backdrop" role="presentation" onMouseDown={closeFindId}>
            <section className="find-id-dialog" role="dialog" aria-modal="true" aria-labelledby="find-id-title" onMouseDown={(e) => e.stopPropagation()}>
              <button type="button" className="find-id-close" onClick={closeFindId} aria-label="닫기">×</button>
              <h2 id="find-id-title">아이디 찾기</h2>
              <p>가입할 때 사용한 이메일로 인증번호를 보내드립니다.</p>
              {!foundUsername ? (
                <>
                  <form onSubmit={sendFindIdCode} className="find-id-form">
                    <label htmlFor="find-id-email">이메일</label>
                    <div className="find-id-row">
                      <input id="find-id-email" type="email" value={findIdEmail} onChange={(e) => setFindIdEmail(e.target.value)} placeholder="name@example.com" disabled={isSendingCode} />
                      <button type="submit" disabled={isSendingCode}>{isSendingCode ? "발송 중" : "인증번호 받기"}</button>
                    </div>
                  </form>
                  <form onSubmit={verifyFindIdCode} className="find-id-form">
                    <label htmlFor="find-id-code">인증번호</label>
                    <div className="find-id-row">
                      <input id="find-id-code" inputMode="numeric" maxLength="6" value={findIdCode} onChange={(e) => setFindIdCode(e.target.value)} placeholder="6자리 인증번호" />
                      <button type="submit">확인</button>
                    </div>
                  </form>
                  {findIdMessage && <p className="find-id-message" role="alert">{findIdMessage}</p>}
                </>
              ) : (
                <div className="find-id-result">
                  <p>회원님의 아이디입니다.</p>
                  <strong>{foundUsername}</strong>
                  <button type="button" onClick={closeFindId}>로그인하기</button>
                </div>
              )}
            </section>
          </div>
        )}

        {isResetPasswordOpen && (
          <div className="find-id-backdrop" role="presentation" onMouseDown={closePasswordReset}>
            <section className="find-id-dialog" role="dialog" aria-modal="true" aria-labelledby="reset-password-title" onMouseDown={(e) => e.stopPropagation()}>
              <button type="button" className="find-id-close" onClick={closePasswordReset} aria-label="닫기">×</button>
              <h2 id="reset-password-title">비밀번호 재설정</h2>
              <p>아이디와 가입 이메일을 확인한 뒤 새 비밀번호를 설정할 수 있습니다.</p>
              {!isResetVerified ? (
                <>
                  <form onSubmit={sendPasswordResetCode} className="find-id-form">
                    <label htmlFor="reset-username">아이디</label>
                    <input className="find-id-full-input" id="reset-username" value={resetUsername} onChange={(e) => setResetUsername(e.target.value)} autoComplete="username" />
                    <label htmlFor="reset-email">가입 이메일</label>
                    <div className="find-id-row">
                      <input id="reset-email" type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} placeholder="name@example.com" disabled={isResetSending} />
                      <button type="submit" disabled={isResetSending}>{isResetSending ? "발송 중" : "인증번호 받기"}</button>
                    </div>
                  </form>
                  <form onSubmit={verifyPasswordResetCode} className="find-id-form">
                    <label htmlFor="reset-code">인증번호</label>
                    <div className="find-id-row">
                      <input id="reset-code" inputMode="numeric" maxLength="6" value={resetCode} onChange={(e) => setResetCode(e.target.value)} placeholder="6자리 인증번호" />
                      <button type="submit">확인</button>
                    </div>
                  </form>
                </>
              ) : (
                <form onSubmit={submitPasswordReset} className="find-id-form">
                  <label htmlFor="new-password">새 비밀번호</label>
                  <input className="find-id-full-input" id="new-password" type="password" minLength="8" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" placeholder="8자 이상" />
                  <label htmlFor="confirm-new-password">새 비밀번호 확인</label>
                  <input className="find-id-full-input" id="confirm-new-password" type="password" minLength="8" value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} autoComplete="new-password" />
                  <button type="submit" className="find-id-submit">비밀번호 재설정</button>
                </form>
              )}
              {resetMessage && <p className="find-id-message" role="alert">{resetMessage}</p>}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
