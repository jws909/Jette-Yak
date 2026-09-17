import { useState } from "react";
import "./LoginPage.css";

/**
 * 로그인 페이지 컴포넌트
 *
 * Spring Boot 백엔드의 POST /api/auth/login 엔드포인트를 호출합니다.
 * 요청 바디: { username, password }
 * 응답 예상: { token: "..." }  (JWT 등)
 *
 * 사용 예시:
 *   <LoginPage onLoginSuccess={(token) => { ... }} />
 */
export default function LoginPage({ onLoginSuccess }) {
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
      onLoginSuccess?.(data.token, data);
    } catch (err) {
      setError("서버에 연결할 수 없습니다. 네트워크 상태를 확인해 주세요.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-screen">
      <aside className="login-rail">
        <span className="login-rail__mark">Atelier</span>
        <p className="login-rail__note">
          매일 아침, 어제 끝내지 못한 일부터 다시 시작할 수 있도록.
        </p>
      </aside>

      <main className="login-panel">
        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <h1 className="login-form__title">로그인</h1>
          <p className="login-form__subtitle">
            계정 정보를 입력하고 계속 진행하세요.
          </p>

          <label className="login-field" htmlFor="username">
            아이디
            <input
              id="username"
              name="username"
              type="text"
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

          <button
            type="submit"
            className="login-submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "로그인 중..." : "로그인"}
          </button>

          <a className="login-forgot" href="/reset-password">
            비밀번호를 잊으셨나요?
          </a>
        </form>
      </main>
    </div>
  );
}
