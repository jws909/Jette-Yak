import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./SignupPage.css";

const SUPPLEMENTS = ["오메가-3", "유산균", "비타민D", "마그네슘", "철분", "루테인"];

// 형식 검증 규칙
const USERNAME_REGEX = /^[A-Za-z0-9]{6,20}$/; // 영문, 숫자 6~20자
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getFormatError(field, value) {
  if (field === "username") {
    if (!USERNAME_REGEX.test(value)) {
      return "아이디는 영문, 숫자 조합 6자 이상이어야 합니다.";
    }
  }
  if (field === "email") {
    if (!EMAIL_REGEX.test(value)) {
      return "올바른 이메일 형식이 아닙니다.";
    }
  }
  if (field === "nickname") {
    if (value.length < 2 || value.length > 6) {
      return "닉네임은 2~6자로 입력해 주세요.";
    }
  }
  return null;
}

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
 * step 1: 계정 정보
 * step 2: 상시 복약 설정 (선택 사항)
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
    sex: "",
    birthdate: "",
    isPregnant: false,
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
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 이메일 인증 관련 상태
  const [emailCodeSent, setEmailCodeSent] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [emailCode, setEmailCode] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [emailVerifyError, setEmailVerifyError] = useState("");
  const [emailSendSuccessMsg, setEmailSendSuccessMsg] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);

  // 5분 카운트다운
  useEffect(() => {
    if (!emailCodeSent || emailVerified || secondsLeft <= 0) {
      return;
    }
    const timer = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [emailCodeSent, emailVerified, secondsLeft]);

  const formatTime = (totalSeconds) => {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const handleSendEmailCode = async () => {
    const trimmedEmail = form.email.trim();
    if (!trimmedEmail) {
      setEmailVerifyError("이메일을 입력해 주세요.");
      setEmailSendSuccessMsg("");
      return;
    }

    const formatError = getFormatError("email", trimmedEmail);
    if (formatError) {
      setEmailVerifyError(formatError);
      setEmailSendSuccessMsg("");
      return;
    }

    setEmailVerifyError("");
    setEmailSendSuccessMsg("");
    setSendingCode(true);
    try {
      const response = await fetch("/api/users/email/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 409 || data?.message?.includes("가입")) {
          setEmailVerifyError("이미 가입된 이메일입니다.");
        } else {
          setEmailVerifyError(data?.message || "인증번호 발송에 실패했습니다.");
        }
        setEmailSendSuccessMsg("");
        setSendingCode(false);
        return;
      }
      setEmailCodeSent(true);
      setEmailVerified(false);
      setEmailCode("");
      setEmailSendSuccessMsg(data?.message || "인증번호가 발송되었습니다.");
      setEmailVerifyError("");
      setSecondsLeft(5 * 60); // 5분
      setSendingCode(false);
    } catch (err) {
      setEmailVerifyError("서버에 연결할 수 없습니다.");
      setEmailSendSuccessMsg("");
      setSendingCode(false);
    }
  };

  const handleVerifyEmailCode = async () => {
    if (!emailCode.trim()) {
      setEmailVerifyError("인증번호를 입력해 주세요.");
      return;
    }
    setEmailVerifyError("");
    setVerifyingCode(true);
    try {
      const response = await fetch("/api/users/email/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email, code: emailCode }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.verified) {
        setEmailVerifyError(data?.message || "인증번호가 올바르지 않습니다.");
        setVerifyingCode(false);
        return;
      }
      setEmailVerified(true);
      setEmailVerifyError("");
      setEmailSendSuccessMsg("");
      setVerifyingCode(false);
    } catch (err) {
      setEmailVerifyError("서버에 연결할 수 없습니다.");
      setVerifyingCode(false);
    }
  };
  const [showPolicy, setShowPolicy] = useState(false);
  const [selectedSupplements, setSelectedSupplements] = useState([]);

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    // 값이 바뀌면 이전 중복확인 결과는 무효화
    if (field === "username" || field === "email" || field === "nickname") {
      setAvailability((prev) => ({ ...prev, [field]: null }));
      setCheckError((prev) => ({ ...prev, [field]: "" }));
    }
    if (field === "email") {
      setEmailCodeSent(false);
      setEmailVerified(false);
      setEmailCode("");
      setEmailVerifyError("");
      setEmailSendSuccessMsg("");
      setSecondsLeft(0);
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

    const formatError = getFormatError(field, value);
    if (formatError) {
      setCheckError((prev) => ({ ...prev, [field]: formatError }));
      setAvailability((prev) => ({ ...prev, [field]: null }));
      return;
    }

    setChecking((prev) => ({ ...prev, [field]: true }));
    try {
      const available = await checkDuplicate(field, value);
      setAvailability((prev) => ({ ...prev, [field]: available }));
    } catch (err) {
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

    const formatError = getFormatError(field, value);
    if (formatError) {
      setCheckError((prev) => ({ ...prev, [field]: formatError }));
      setAvailability((prev) => ({ ...prev, [field]: null }));
      return;
    }

    setChecking((prev) => ({ ...prev, [field]: true }));
    try {
      const available = await checkDuplicate(field, value);
      setAvailability((prev) => ({ ...prev, [field]: available }));
    } catch (err) {
      setCheckError((prev) => ({
        ...prev,
        [field]: "중복확인 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
      }));
    } finally {
      setChecking((prev) => ({ ...prev, [field]: false }));
    }
  };

  const validateStep1 = () => {
    if (
      !form.username.trim() ||
      !form.password ||
      !form.confirmPassword ||
      !form.email.trim() ||
      !form.nickname.trim() ||
      !form.sex ||
      !form.birthdate
    ) {
      setFormError("모든 항목을 입력해 주세요.");
      return false;
    }
    if (form.nickname.trim().length > 6) {
      setFormError("닉네임은 6자 이내로 입력해 주세요.");
      return false;
    }
    if (!emailVerified) {
      setFormError("이메일 인증을 완료해 주세요.");
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

  const handleNextFromStep1 = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!validateStep1()) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/users/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loginId: form.username,
          password: form.password,
          email: form.email,
          nickname: form.nickname,
          sex: form.sex,
          birthdate: form.birthdate, // "yyyy-MM-dd" (input type="date" 형식과 동일)
          isPregnant: form.sex === "F" && form.isPregnant ? 1 : 0,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setFormError(data?.message || "회원가입 처리 중 오류가 발생했습니다.");
        setIsSubmitting(false);
        return;
      }

      setIsSubmitting(false);
      setStep(2);
    } catch (err) {
      setFormError("서버에 연결할 수 없습니다. 네트워크 상태를 확인해 주세요.");
      setIsSubmitting(false);
    }
  };

  const toggleSupplement = (name) => {
    setSelectedSupplements((prev) =>
      prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]
    );
  };

  const removeSupplement = (name) => {
    setSelectedSupplements((prev) => prev.filter((item) => item !== name));
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

  // step 1, 2에서 공통으로 쓰는 상단 영역 (뒤로가기 + 브레드크럼 + 타이틀 + 단계 표시줄)
  const renderHeader = (stepNumber) => (
    <>
      <button type="button" className="signup-back" onClick={() => navigate(-1)}>
        <span aria-hidden="true">←</span> 돌아가기
      </button>
      <p className="signup-breadcrumb">새로운 건강 기록</p>
      <h1 className="signup-title">
        회원가입 <span className="signup-title__num">{String(stepNumber).padStart(2, "0")}</span>
      </h1>
      <div className="signup-steps">
        <span className={`signup-steps__item ${stepNumber === 1 ? "is-active" : ""}`}>
          01 계정 정보
        </span>
        <span className="signup-steps__line" />
        <span className={`signup-steps__item ${stepNumber === 2 ? "is-active" : ""}`}>
          02 상시 복약 설정
        </span>
      </div>
    </>
  );

  return (
    <div className="signup-screen">
      {step === 1 && (
        <main className="signup-panel">
          {renderHeader(1)}

          <form className="signup-form" onSubmit={handleNextFromStep1} noValidate>
            <div className="signup-field-row">
              <label className="signup-field" htmlFor="username">
                아이디
                <input
                  id="username"
                  type="text"
                  placeholder="영문, 숫자 6자 이상"
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
                중복 확인
              </button>
            </div>
            {renderAvailabilityHint("username")}

            <label className="signup-field" htmlFor="password">
              비밀번호
              <input
                id="password"
                type="password"
                placeholder="8자 이상 입력"
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
                placeholder="비밀번호를 다시 입력"
                autoComplete="new-password"
                value={form.confirmPassword}
                onChange={(e) => updateField("confirmPassword", e.target.value)}
              />
            </label>

            <div className="signup-field-row">
              <label className="signup-field" htmlFor="email">
                이메일
                <input
                  id="email"
                  type="email"
                  placeholder="hello@example.com"
                  value={form.email}
                  onChange={(e) => updateField("email", e.target.value)}
                  disabled={emailVerified}
                />
              </label>
              <button
                type="button"
                className="signup-check-btn"
                onClick={handleSendEmailCode}
                disabled={sendingCode || emailVerified}
              >
                {emailVerified ? "인증완료" : sendingCode ? "발송 중..." : emailCodeSent ? "재발송" : "인증번호 받기"}
              </button>
            </div>
            {emailSendSuccessMsg && !emailVerified && (
              <p className="signup-hint signup-hint--ok">{emailSendSuccessMsg}</p>
            )}
            {emailVerifyError && (
              <p className="signup-hint signup-hint--error">{emailVerifyError}</p>
            )}

            {emailCodeSent && !emailVerified && (
              <div className="signup-field-row signup-verify-row">
                <label className="signup-field" htmlFor="emailCode">
                  인증번호
                  <input
                    id="emailCode"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="6자리 숫자"
                    value={emailCode}
                    onChange={(e) => setEmailCode(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="signup-check-btn"
                  onClick={handleVerifyEmailCode}
                  disabled={verifyingCode || secondsLeft <= 0}
                >
                  {verifyingCode ? "확인 중..." : "인증하기"}
                </button>
              </div>
            )}
            {emailCodeSent && !emailVerified && (
              <p className={`signup-hint ${secondsLeft <= 0 ? "signup-hint--error" : "signup-hint--pending"}`}>
                {secondsLeft > 0
                  ? `남은 시간 ${formatTime(secondsLeft)}`
                  : "인증번호가 만료되었습니다. 다시 받아주세요."}
              </p>
            )}
            {emailVerified && (
              <p className="signup-hint signup-hint--ok">이메일 인증이 완료되었습니다</p>
            )}

            <label className="signup-field" htmlFor="nickname">
              닉네임
              <input
                id="nickname"
                type="text"
                placeholder="앱에서 사용할 이름 (6자 이내)"
                maxLength={6}
                value={form.nickname}
                onChange={(e) => updateField("nickname", e.target.value)}
                onBlur={() => handleAutoCheckDuplicate("nickname")}
              />
            </label>
            {renderAvailabilityHint("nickname")}

            <label className="signup-field" htmlFor="birthdate">
              생년월일
              <input
                id="birthdate"
                type="date"
                value={form.birthdate}
                onChange={(e) => updateField("birthdate", e.target.value)}
              />
            </label>

            <div className="signup-field">
              성별
              <div className="signup-radio-row">
                <label className="signup-radio">
                  <input
                    type="radio"
                    name="sex"
                    value="M"
                    checked={form.sex === "M"}
                    onChange={(e) => updateField("sex", e.target.value)}
                  />
                  남성
                </label>
                <label className="signup-radio">
                  <input
                    type="radio"
                    name="sex"
                    value="F"
                    checked={form.sex === "F"}
                    onChange={(e) => updateField("sex", e.target.value)}
                  />
                  여성
                </label>
              </div>
            </div>

            {form.sex === "F" && (
              <label className="signup-policy">
                <input
                  type="checkbox"
                  checked={form.isPregnant}
                  onChange={(e) => updateField("isPregnant", e.target.checked)}
                />
                <span>현재 임신 중이에요</span>
              </label>
            )}

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
                  에 동의합니다 (필수)
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

            <button type="submit" className="signup-submit" disabled={isSubmitting}>
              {isSubmitting ? "처리 중..." : "다음 단계"} <span aria-hidden="true">›</span>
            </button>
          </form>
        </main>
      )}

      {step === 2 && (
        <main className="signup-panel">
          {renderHeader(2)}

          <div className="signup-form">
            <h2 className="signup-form__question">평소 챙겨 드시는 것이 있나요?</h2>
            <p className="signup-form__subtitle">
              처방약과 함께 확인해 드릴게요. 나중에 마이페이지에서 수정할 수 있어요.
            </p>

            <div className="supplement-grid">
              {SUPPLEMENTS.map((name) => {
                const selected = selectedSupplements.includes(name);
                return (
                  <button
                    key={name}
                    type="button"
                    className={`supplement-chip ${selected ? "is-selected" : ""}`}
                    onClick={() => toggleSupplement(name)}
                  >
                    {selected && <span aria-hidden="true">✓ </span>}
                    {name}
                  </button>
                );
              })}
            </div>

            {selectedSupplements.length > 0 && (
              <div className="supplement-tags">
                {selectedSupplements.map((name) => (
                  <span key={name} className="supplement-tag">
                    {name}
                    <button
                      type="button"
                      aria-label={`${name} 선택 해제`}
                      onClick={() => removeSupplement(name)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="signup-step2-actions">
              <button type="button" className="signup-skip" onClick={goToStep3}>
                건너뛰기
              </button>
              <button type="button" className="signup-submit" onClick={goToStep3}>
                시작하기 <span aria-hidden="true">←</span>
              </button>
            </div>
          </div>
        </main>
      )}

      {step === 3 && (
        <main className="signup-panel">
          <div className="signup-form signup-complete">
            <h1 className="signup-title">가입이 완료되었어요</h1>
            <p className="signup-form__subtitle">
              {selectedSupplements.length > 0
                ? `선택하신 ${selectedSupplements.join(", ")} 정보를 반영했어요.`
                : "이제 로그인하고 서비스를 시작해 보세요."}
            </p>
            <button type="button" className="signup-submit" onClick={() => navigate("/login")}>
              로그인하러 가기 <span aria-hidden="true">›</span>
            </button>
          </div>
        </main>
      )}
    </div>
  );
}
