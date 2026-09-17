import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./SignupPage.css";

const SUPPLEMENTS = ["오메가-3", "유산균", "비타민D", "마그네슘", "철분", "루테인"];

// 아이디/이메일/닉네임 중복확인 공용 함수
// 실제 백엔드가 준비되면 각 endpoint만 맞춰주면 됩니다.
async function checkDuplicate(type, value) {
  const endpointMap = {
    username: "/api/users/check-username",
    email: "/api/users/check-email",
    nickname: "/api/users/check-nickname",
  };

  const response = await fetch(
    `${endpointMap[type]}?value=${encodeURIComponent(value)}`
  );

  if (!response.ok) {
    throw new Error("중복확인 요청에 실패했습니다.");
  }

  const data = await response.json();
  return data.available; // true: 사용 가능, false: 이미 사용 중
}

/**
 * 회원가입 플로우 컴포넌트
 * step 1: 기본 정보 입력
 * step 2: 평소 복용 영양제 선택 (선택 사항)
 * step 3: 완료 안내
 *
 * 화면 이동은 컴포넌트 내부에서 useNavigate로 직접 처리합니다.
 */
export default function SignupPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);

  const [form, setForm] = useState({
    username: "",
    password: "",
    confirmPassword: "",
    email: "",
    nickname: "",
    agreePolicy: false,
  });

  const [availability, setAvailability] = useState({
    username: null, // null: 미확인, true: 사용가능, false: 중복
    email: null,
    nickname: null,
  });

  const [checking, setChecking] = useState({
    username: false,
    email: false,
    nickname: false,
  });

  const [checkError, setCheckError] = useState({
    username: "",
    email: "",
    nickname: "",
  });

  const [formError, setFormError] = useState("");
  const [showPolicy, setShowPolicy] = useState(false);
  const [selectedSupplements, setSelectedSupplements] = useState([]);

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    // 값이 바뀌면 이전 중복확인 결과는 무효화
    if (field === "username" || field === "email" || field === "nickname") {
      setAvailability((prev) => ({ ...prev, [field]: null }));
      setCheckError((prev) => ({ ...prev, [field]: "" }));
    }
  };

  const handleCheckDuplicate = async (field) => {
    const value = form[field];
    if (!value.trim()) {
      setFormError(
        field === "username"
          ? "아이디를 입력해 주세요."
          : field === "email"
          ? "이메일을 입력해 주세요."
          : "닉네임을 입력해 주세요."
      );
      return;
    }

    setFormError("");
    setCheckError((prev) => ({ ...prev, [field]: "" }));
    setChecking((prev) => ({ ...prev, [field]: true }));
    try {
      const available = await checkDuplicate(field, value);
      setAvailability((prev) => ({ ...prev, [field]: available }));
    } catch {
      setCheckError((prev) => ({
        ...prev,
        [field]: "중복확인 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
      }));
    } finally {
      setChecking((prev) => ({ ...prev, [field]: false }));
    }
  };

  const handleAutoCheckDuplicate = async (field) => {
    const value = form[field];
    if (!value.trim()) {
      return; // 값이 없으면 조용히 넘어감 (자동 확인이므로 에러 표시 안 함)
    }

    setCheckError((prev) => ({ ...prev, [field]: "" }));
    setChecking((prev) => ({ ...prev, [field]: true }));
    try {
      const available = await checkDuplicate(field, value);
      setAvailability((prev) => ({ ...prev, [field]: available }));
    } catch {
      setCheckError((prev) => ({
        ...prev,
        [field]: "중복확인 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
      }));
    } finally {
      setChecking((prev) => ({ ...prev, [field]: false }));
    }
  };

  const validateStep1 = () => {
    if (!form.username.trim() || !form.password || !form.confirmPassword || !form.email.trim() || !form.nickname.trim()) {
      setFormError("모든 항목을 입력해 주세요.");
      return false;
    }
    if (form.password.length < 8) {
      setFormError("비밀번호는 8자 이상이어야 합니다.");
      return false;
    }
    if (form.password !== form.confirmPassword) {
      setFormError("비밀번호가 일치하지 않습니다.");
      return false;
    }
    if (!form.agreePolicy) {
      setFormError("개인정보 처리방침에 동의해 주세요.");
      return false;
    }
    return true;
  };

  const handleNextFromStep1 = (e) => {
    e.preventDefault();
    setFormError("");
    if (validateStep1()) {
      setStep(2);
    }
  };

  const toggleSupplement = (name) => {
    setSelectedSupplements((prev) =>
      prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]
    );
  };

  const goToStep3 = () => setStep(3);

  const DUPLICATE_MESSAGES = {
    username: { ok: "사용 가능한 아이디입니다", dup: "이미 사용 중인 아이디입니다" },
    email: { ok: "사용 가능한 이메일입니다", dup: "이미 가입중인 이메일입니다." },
    nickname: { ok: "사용 가능한 닉네임입니다", dup: "이미 사용중인 닉네임입니다" },
  };

  const renderAvailabilityHint = (field) => {
    if (checking[field]) {
      return <span className="signup-hint signup-hint--pending">확인 중...</span>;
    }
    if (checkError[field]) {
      return <span className="signup-hint signup-hint--error">{checkError[field]}</span>;
    }
    if (availability[field] === true) {
      return (
        <span className="signup-hint signup-hint--ok">
          {DUPLICATE_MESSAGES[field].ok}
        </span>
      );
    }
    if (availability[field] === false) {
      return (
        <span className="signup-hint signup-hint--error">
          {DUPLICATE_MESSAGES[field].dup}
        </span>
      );
    }
    return null;
  };

  return (
    <div className="signup-screen">
      <div className="signup-progress">
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={`signup-progress__dot ${step >= n ? "is-active" : ""}`}
          />
        ))}
      </div>

      {step === 1 && (
        <main className="signup-panel">
          <form className="signup-form" onSubmit={handleNextFromStep1} noValidate>
            <h1 className="signup-form__title">회원가입</h1>
            <p className="signup-form__subtitle">기본 정보를 입력해 주세요.</p>

            <div className="signup-field-row">
              <label className="signup-field" htmlFor="username">
                아이디
                <input
                  id="username"
                  type="text"
                  value={form.username}
                  onChange={(e) => updateField("username", e.target.value)}
                />
              </label>
              <button
                type="button"
                className="signup-check-btn"
                onClick={() => handleCheckDuplicate("username")}
                disabled={checking.username}
              >
                중복확인
              </button>
            </div>
            {renderAvailabilityHint("username")}

            <label className="signup-field" htmlFor="password">
              비밀번호
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => updateField("password", e.target.value)}
              />
            </label>

            <label className="signup-field" htmlFor="confirmPassword">
              비밀번호 확인
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={form.confirmPassword}
                onChange={(e) => updateField("confirmPassword", e.target.value)}
              />
            </label>

            <label className="signup-field" htmlFor="email">
              이메일
              <input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => updateField("email", e.target.value)}
                onBlur={() => handleAutoCheckDuplicate("email")}
              />
            </label>
            {renderAvailabilityHint("email")}

            <label className="signup-field" htmlFor="nickname">
              닉네임
              <input
                id="nickname"
                type="text"
                value={form.nickname}
                onChange={(e) => updateField("nickname", e.target.value)}
                onBlur={() => handleAutoCheckDuplicate("nickname")}
              />
            </label>
            {renderAvailabilityHint("nickname")}

            <div className="signup-policy-block">
              <label className="signup-policy">
                <input
                  type="checkbox"
                  checked={form.agreePolicy}
                  onChange={(e) => updateField("agreePolicy", e.target.checked)}
                />
                <span>
                  <button
                    type="button"
                    className="signup-policy-link"
                    onClick={() => setShowPolicy((prev) => !prev)}
                  >
                    개인정보 처리방침
                  </button>
                  에 동의합니다.
                </span>
              </label>
              {showPolicy && (
                <div className="signup-policy-text">
                  {/* 실제 서비스의 개인정보 처리방침 문구로 교체해 주세요. */}
                  <p>
                    수집 항목, 이용 목적, 보관 기간 등 실제 정책 문구를 이
                    영역에 채워 넣으시면 됩니다.
                  </p>
                </div>
              )}
            </div>

            {formError && (
              <p className="signup-error" role="alert">
                {formError}
              </p>
            )}

            <button type="submit" className="signup-submit">
              다음
            </button>
          </form>
        </main>
      )}

      {step === 2 && (
        <main className="signup-panel">
          <div className="signup-form">
            <h1 className="signup-form__title">복용 중인 영양제가 있나요?</h1>
            <p className="signup-form__subtitle">
              평소 챙겨 드시는 항목을 선택해 주세요. (복수 선택 가능)
            </p>

            <div className="supplement-grid">
              {SUPPLEMENTS.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={`supplement-toggle ${
                    selectedSupplements.includes(name) ? "is-selected" : ""
                  }`}
                  onClick={() => toggleSupplement(name)}
                >
                  {name}
                </button>
              ))}
            </div>

            <div className="signup-step2-actions">
              <button type="button" className="signup-skip" onClick={goToStep3}>
                건너뛰기
              </button>
              <button type="button" className="signup-submit" onClick={goToStep3}>
                다음
              </button>
            </div>
          </div>
        </main>
      )}

      {step === 3 && (
        <main className="signup-panel">
          <div className="signup-form signup-complete">
            <h1 className="signup-form__title">가입이 완료되었어요</h1>
            <p className="signup-form__subtitle">
              {selectedSupplements.length > 0
                ? `선택하신 ${selectedSupplements.join(", ")} 정보를 반영했어요.`
                : "이제 로그인하고 서비스를 시작해 보세요."}
            </p>
            <button type="button" className="signup-submit" onClick={() => navigate("/login")}>
              시작하기
            </button>
          </div>
        </main>
      )}
    </div>
  );
}
