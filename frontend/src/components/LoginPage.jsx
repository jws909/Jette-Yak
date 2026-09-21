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
          <span className="brand-logo__text">mediary</span>
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

          <div className="login-links">
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
      </main>
    </div>
  );
}
