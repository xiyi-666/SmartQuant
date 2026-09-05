import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  BrainCircuit,
  Gauge,
  Home,
  LineChart,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import {
  firstAccessiblePath,
  getAuthUser,
  getToken,
  setAuthUser,
  setToken,
  type AuthUser,
} from "../shared/auth";
import { LANGUAGE_SELECT_OPTIONS, useLanguage, type LanguageMode } from "../shared/language";
import { COMMUNITY_EDITION } from "../shared/edition";

type LocalizedText = {
  zh: string;
  en: string;
};

type Stat = {
  Icon: LucideIcon;
  label: LocalizedText;
};

type MarketTile = {
  code: LocalizedText;
  name: LocalizedText;
  value: string;
  tone: "up" | "steady";
};

type PublicAuthConfig = {
  basic_auth?: { enabled?: boolean; registration_enabled?: boolean; allowed_email_domains?: string[] };
  oauth?: {
    enabled?: boolean;
    providers?: Array<{ key: string; label: string; enabled: boolean; bot_username?: string }>;
  };
  bot_protection?: {
    enabled?: boolean;
    provider?: string;
    site_key?: string;
    apply_login?: boolean;
    apply_register?: boolean;
  };
  smtp?: { enabled?: boolean; require_email_verification?: boolean };
  passkey?: { enabled?: boolean; rp_id?: string; rp_name?: string };
};

declare global {
  interface Window {
    quartsysTurnstileCallback?: (token: string) => void;
    quartsysTelegramAuth?: (user: any) => void;
  }
}

const BRAND_NAME: LocalizedText = {
  zh: "QaurtSmart",
  en: "QaurtSmart",
};

const STATS: Stat[] = [
  { Icon: BarChart3, label: { zh: "数据驱动", en: "Data driven" } },
  { Icon: BrainCircuit, label: { zh: "AI 投研", en: "AI research" } },
  { Icon: ShieldCheck, label: { zh: "实时风控", en: "Live risk" } },
  { Icon: LineChart, label: { zh: "5000+ 股票", en: "5000+ equities" } },
  { Icon: Activity, label: { zh: "7x24 监控", en: "24/7 monitor" } },
  { Icon: Gauge, label: { zh: "<50ms 延迟", en: "<50ms latency" } },
];

const MARKET_TILES: MarketTile[] = [
  {
    code: { zh: "沪深300", en: "CSI 300" },
    name: { zh: "核心宽基", en: "Core index" },
    value: "+5.15%",
    tone: "up",
  },
  {
    code: { zh: "量化多头", en: "Quant Long" },
    name: { zh: "策略组合", en: "Strategy book" },
    value: "+72.8%",
    tone: "up",
  },
  {
    code: { zh: "风控阈值", en: "Risk Guard" },
    name: { zh: "实时约束", en: "Live control" },
    value: "0.74",
    tone: "steady",
  },
];

type AuthMode = "login" | "register" | "reset";

function meetsPasswordPolicy(value: string) {
  return value.length >= 8
    && value.length <= 20
    && /[a-z]/.test(value)
    && /[A-Z]/.test(value)
    && /\d/.test(value);
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { lang, languageMode, setLanguageMode } = useLanguage();
  const lt = (text: LocalizedText) => text[lang];
  const requestedMode = searchParams.get("mode");
  const [mode, setMode] = useState<AuthMode>(
    requestedMode === "register" || requestedMode === "reset" ? requestedMode : "login",
  );

  // Login fields
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // Register-only fields
  const [email, setEmail] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [authConfig, setAuthConfig] = useState<PublicAuthConfig | null>(null);
  const [emailSending, setEmailSending] = useState(false);
  const telegramWidgetRef = useRef<HTMLDivElement | null>(null);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (getToken() && getAuthUser()) {
      navigate(firstAccessiblePath(), { replace: true });
      return;
    }
    api
      .getAuthSecurityPublic()
      .then((data: any) => setAuthConfig(data || {}))
      .catch(() => setAuthConfig({}));
  }, [navigate]);

  useEffect(() => {
    const nextMode: AuthMode =
      requestedMode === "register" || requestedMode === "reset" ? requestedMode : "login";
    setMode(nextMode);
  }, [requestedMode]);

  useEffect(() => {
    const bot = authConfig?.bot_protection;
    if (!bot?.enabled || bot.provider !== "turnstile" || !bot.site_key) return;
    window.quartsysTurnstileCallback = (token: string) => setCaptchaToken(token);
    if (document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]')) return;
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }, [authConfig]);

  useEffect(() => {
    const provider = authConfig?.oauth?.providers?.find(
      (item) => item.key === "telegram" && item.enabled && item.bot_username,
    );
    const host = telegramWidgetRef.current;
    if (!provider || !host) return;
    host.innerHTML = "";
    window.quartsysTelegramAuth = async (telegramUser: any) => {
      resetMessages();
      setLoading(true);
      try {
        const res = (await api.authTelegram(telegramUser)) as { token: string; user: AuthUser };
        setToken(res.token);
        setAuthUser(res.user);
        navigate(firstAccessiblePath());
      } catch (err: any) {
        setError(err?.message || (lang === "zh" ? "Telegram 登录失败。" : "Telegram sign-in failed."));
      } finally {
        setLoading(false);
      }
    };
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", provider.bot_username);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "8");
    script.setAttribute("data-onauth", "quartsysTelegramAuth(user)");
    script.setAttribute("data-request-access", "write");
    host.appendChild(script);
    return () => {
      host.innerHTML = "";
    };
  }, [authConfig, lang, navigate]);

  function resetMessages() {
    setError("");
    setSuccess("");
  }

  function switchMode(next: AuthMode) {
    resetMessages();
    setCaptchaToken("");
    setEmailCode("");
    setConfirmPassword("");
    if (next !== "login") {
      setPassword("");
    }
    setMode(next);
    const nextParams = new URLSearchParams(searchParams);
    if (next === "login") nextParams.delete("mode");
    else nextParams.set("mode", next);
    setSearchParams(nextParams, { replace: true });
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    resetMessages();

    if (!username.trim() || !password) {
      setError(lang === "zh" ? "用户名/邮箱和密码不能为空。" : "Username/email and password are required.");
      return;
    }
    setLoading(true);
    try {
      const res = (await api.login({
        username: username.trim(),
        password,
        captcha_token: captchaToken || undefined,
      })) as { token: string; user: AuthUser };

      setToken(res.token);
      setAuthUser(res.user);
      navigate(firstAccessiblePath());
    } catch (err: any) {
      setError(
        err?.message ||
          (lang === "zh"
            ? "登录失败，请检查用户名/邮箱和密码。"
            : "Sign in failed. Check your username/email and password."),
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    resetMessages();

    if (!username.trim() || !password) {
      setError(lang === "zh" ? "用户名和密码不能为空。" : "Username and password are required.");
      return;
    }
    if (!meetsPasswordPolicy(password)) {
      setError(lang === "zh" ? "密码须为 8-20 位，并包含大写字母、小写字母和数字。" : "Password must be 8-20 characters and include uppercase, lowercase and a number.");
      return;
    }
    if ((needEmailCode || allowedEmailDomains.length > 0) && !email.trim()) {
      setError(lang === "zh" ? "当前注册需要填写允许的邮箱地址。" : "An allowed email address is required for registration.");
      return;
    }
    if (needEmailCode && !emailCode.trim()) {
      setError(lang === "zh" ? "请填写邮箱验证码。" : "Enter the email verification code.");
      return;
    }

    setLoading(true);
    try {
      const res = (await api.register({
        username: username.trim(),
        password,
        email: email.trim() || undefined,
        email_code: emailCode.trim() || undefined,
        captcha_token: captchaToken || undefined,
      })) as { message: string };

      setSuccess(res.message || (lang === "zh" ? "注册成功，请登录。" : "Registration complete. Please sign in."));
      setMode("login");
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("mode");
      setSearchParams(nextParams, { replace: true });
      setEmail("");
      setEmailCode("");
    } catch (err: any) {
      setError(err?.message || (lang === "zh" ? "注册失败，请重试。" : "Registration failed. Please try again."));
    } finally {
      setLoading(false);
    }
  }

  async function sendEmailCode() {
    resetMessages();
    if (!email.trim()) {
      setError(lang === "zh" ? "请先填写邮箱。" : "Enter your email first.");
      return;
    }
    setEmailSending(true);
    try {
      const res = (await api.sendAuthEmailCode({
        email: email.trim(),
        purpose: "register",
        captcha_token: captchaToken || undefined,
      })) as { message?: string };
      setSuccess(res.message || (lang === "zh" ? "验证码已发送。" : "Verification code sent."));
    } catch (err: any) {
      setError(err?.message || (lang === "zh" ? "验证码发送失败。" : "Failed to send code."));
    } finally {
      setEmailSending(false);
    }
  }

  async function sendResetEmailCode() {
    resetMessages();
    if (!authConfig?.smtp?.enabled) {
      setError(lang === "zh" ? "当前未开启 SMTP 邮箱服务，请联系管理员重设密码。" : "SMTP email service is not enabled. Contact an administrator.");
      return;
    }
    if (!username.trim() || !email.trim()) {
      setError(lang === "zh" ? "请填写用户名和绑定邮箱。" : "Enter username and bound email.");
      return;
    }
    setEmailSending(true);
    try {
      const res = (await api.sendAuthEmailCode({
        username: username.trim(),
        email: email.trim(),
        purpose: "reset_password",
        captcha_token: captchaToken || undefined,
      })) as { message?: string };
      setSuccess(res.message || (lang === "zh" ? "验证码已发送。" : "Verification code sent."));
    } catch (err: any) {
      setError(err?.message || (lang === "zh" ? "验证码发送失败。" : "Failed to send code."));
    } finally {
      setEmailSending(false);
    }
  }

  async function handleResetPassword(e: FormEvent) {
    e.preventDefault();
    resetMessages();
    if (!authConfig?.smtp?.enabled) {
      setError(lang === "zh" ? "当前未开启 SMTP 邮箱找回密码，请联系管理员处理。" : "SMTP password reset is not enabled. Contact an administrator.");
      return;
    }
    if (!username.trim() || !email.trim() || !emailCode.trim()) {
      setError(lang === "zh" ? "请填写用户名、绑定邮箱和邮箱验证码。" : "Enter username, bound email and email code.");
      return;
    }
    if (!meetsPasswordPolicy(password)) {
      setError(lang === "zh" ? "新密码须为 8-20 位，并包含大写字母、小写字母和数字。" : "New password must be 8-20 characters and include uppercase, lowercase and a number.");
      return;
    }
    if (password !== confirmPassword) {
      setError(lang === "zh" ? "两次输入的新密码不一致。" : "The two new passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const res = (await api.resetPassword({
        username: username.trim(),
        email: email.trim(),
        email_code: emailCode.trim(),
        new_password: password,
        captcha_token: captchaToken || undefined,
      })) as { message?: string };
      setSuccess(res.message || (lang === "zh" ? "密码已重设，请使用新密码登录。" : "Password reset. Sign in with the new password."));
      setPassword("");
      setConfirmPassword("");
      setEmailCode("");
      setMode("login");
    } catch (err: any) {
      setError(err?.message || (lang === "zh" ? "密码重设失败，请检查验证码。" : "Password reset failed. Check the code."));
    } finally {
      setLoading(false);
    }
  }

  function startOAuth(provider: string) {
    const redirect = `${window.location.origin}/login`;
    window.location.href = `${api.getApiBase()}/auth/oauth/${encodeURIComponent(provider)}/start?redirect=${encodeURIComponent(redirect)}`;
  }

  const bot = authConfig?.bot_protection;
  const needCaptcha =
    Boolean(bot?.enabled) &&
    (((mode === "login" || mode === "reset") && bot?.apply_login !== false) ||
      (mode === "register" && bot?.apply_register !== false));
  const needEmailCode =
    mode === "register" &&
    Boolean(authConfig?.smtp?.enabled && authConfig.smtp.require_email_verification);
  const allowedEmailDomains = Array.isArray(authConfig?.basic_auth?.allowed_email_domains)
    ? authConfig.basic_auth.allowed_email_domains
    : [];
  const resetPasswordEnabled = Boolean(authConfig?.smtp?.enabled);
  const oauthProviders = authConfig?.oauth?.enabled
    ? (authConfig.oauth.providers || []).filter((item) => item.enabled)
    : [];

  return (
    <div className={COMMUNITY_EDITION ? "login-page community-login-page" : "login-page"}>
      <div className="login-left">
        <div className="glow" />
        <div className="login-brand">
          <div className="login-brand-lockup">
            <p className="label">{lang === "zh" ? "量化投研工作台" : "Quant Research Workspace"}</p>
          </div>
          <h1>{lt(BRAND_NAME)}</h1>
          <p className="subtitle">
            {lang === "zh"
              ? "把行情、策略、风控和交易信号放在一个稳定入口。"
              : "Market data, strategy research, risk control and trading signals in one focused console."}
          </p>
        </div>

        <div className="login-market-panel" aria-hidden="true">
          <div className="market-panel-top">
            <span>{lang === "zh" ? "实时市场脉冲" : "Market Pulse"}</span>
            <strong>
              <ArrowUpRight size={18} strokeWidth={2.5} />
              +128.6%
            </strong>
          </div>
          <div className="market-chart">
            <div className="market-gridline" />
            <svg viewBox="0 0 520 180" role="img" focusable="false">
              <defs>
                <linearGradient id="loginMarketFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="rgba(37, 99, 235, 0.38)" />
                  <stop offset="100%" stopColor="rgba(37, 99, 235, 0)" />
                </linearGradient>
                <marker id="loginMarketArrow" viewBox="0 0 12 12" refX="9" refY="6" markerWidth="7" markerHeight="7" orient="auto">
                  <path className="market-arrowhead" d="M1 1 L11 6 L1 11 Z" />
                </marker>
              </defs>
              <path
                className="market-area"
                d="M0 142 C40 130 52 104 92 112 C132 120 150 72 190 78 C230 84 246 38 286 48 C326 58 336 116 380 90 C424 64 434 28 474 36 C498 40 510 30 520 22 L520 180 L0 180 Z"
              />
              <path
                className="market-line"
                markerEnd="url(#loginMarketArrow)"
                d="M0 142 C40 130 52 104 92 112 C132 120 150 72 190 78 C230 84 246 38 286 48 C326 58 336 116 380 90 C424 64 434 28 474 36 C498 40 510 30 520 22"
              />
              <circle className="market-dot" cx="474" cy="36" r="5" />
            </svg>
          </div>
          <div className="market-tile-row">
            {MARKET_TILES.map((tile) => (
              <div key={tile.code.en} className={`market-tile ${tile.tone}`}>
                <span>{lt(tile.code)}</span>
                <small>{lt(tile.name)}</small>
                <strong>
                  {tile.tone === "up" && <ArrowUpRight size={15} strokeWidth={2.6} />}
                  {tile.value}
                </strong>
              </div>
            ))}
          </div>
        </div>

        <div className="login-stats">
          {STATS.map(({ Icon, label }) => (
            <div key={label.en} className="login-stat">
              <Icon aria-hidden="true" size={16} strokeWidth={2} />
              <span>{lt(label)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="login-right">
        <div className="login-form-container">
          <div className="login-form-header">
            <div>
              <p>{lang === "zh" ? "安全访问" : "Secure Access"}</p>
              <h2>
                {mode === "login"
                  ? lang === "zh"
                    ? "登录"
                    : "Sign in"
                  : mode === "register"
                    ? lang === "zh"
                      ? "注册"
                      : "Register"
                    : lang === "zh"
                      ? "重设密码"
                      : "Reset password"}
              </h2>
            </div>
            <div className="login-header-actions">
              <button type="button" className="login-home-btn" onClick={() => navigate("/")} aria-label={lang === "zh" ? "返回QaurtSmart主页" : "Back to QaurtSmart home"} title={lang === "zh" ? "返回主页" : "Back to home"}>
                <Home size={16} aria-hidden="true" />
              </button>
              <select
                className="login-lang-btn login-lang-select"
                value={languageMode}
                onChange={(event) => setLanguageMode(event.target.value as LanguageMode)}
                aria-label={lang === "zh" ? "切换语言" : "Switch language"}
              >
                {LANGUAGE_SELECT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <div className="login-message error" role="alert">
              <p>{error}</p>
            </div>
          )}
          {success && (
            <div className="login-message success" role="status">
              <p>{success}</p>
            </div>
          )}

          {mode !== "reset" && (
            <div className="login-mode-toggle" role="tablist" aria-label={lang === "zh" ? "登录注册切换" : "Authentication mode"}>
              <button
                type="button"
                onClick={() => switchMode("login")}
                className={mode === "login" ? "active" : ""}
                role="tab"
                aria-selected={mode === "login"}
              >
                {lang === "zh" ? "登录" : "Sign in"}
              </button>
              {authConfig?.basic_auth?.registration_enabled !== false && (
                <button
                  type="button"
                  onClick={() => switchMode("register")}
                  className={mode === "register" ? "active" : ""}
                  role="tab"
                  aria-selected={mode === "register"}
                >
                  {lang === "zh" ? "注册" : "Register"}
                </button>
              )}
            </div>
          )}

          {mode !== "reset" && oauthProviders.length > 0 && (
            <div className="login-oauth-panel">
              <div className="login-oauth-title">{lang === "zh" ? "第三方登录" : "Continue with"}</div>
              <div className="login-oauth-grid">
                {oauthProviders.map((provider) => (
                  provider.key === "telegram" ? (
                    <div key={provider.key} className="login-telegram-widget" ref={telegramWidgetRef}>
                      {!provider.bot_username && (
                        <button
                          type="button"
                          onClick={() =>
                            setError(
                              lang === "zh"
                                ? "Telegram 需要先配置 Bot Username。"
                                : "Telegram requires Bot Username first.",
                            )
                          }
                        >
                          {provider.label}
                        </button>
                      )}
                    </div>
                  ) : (
                    <button key={provider.key} type="button" onClick={() => startOAuth(provider.key)}>
                      {provider.label}
                    </button>
                  )
                ))}
              </div>
            </div>
          )}

          {mode === "login" && authConfig?.basic_auth?.enabled !== false && (
            <form onSubmit={handleLogin}>
              <div className="field">
                <label htmlFor="login-username">{lang === "zh" ? "用户名或邮箱" : "Username or email"}</label>
                <input
                  id="login-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  spellCheck={false}
                  placeholder={lang === "zh" ? "输入用户名或邮箱" : "Enter username or email"}
                />
              </div>

              <div className="field">
                <label htmlFor="login-password">{lang === "zh" ? "密码" : "Password"}</label>
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder={lang === "zh" ? "输入密码" : "Enter password"}
                />
              </div>

              <div className="login-form-options">
                <span />
                <button type="button" onClick={() => switchMode("reset")}>
                  {lang === "zh" ? "忘记密码？" : "Forgot password?"}
                </button>
              </div>

              {needCaptcha && (
                <div className="login-captcha-panel">
                  {bot?.provider === "turnstile" && bot.site_key ? (
                    <div
                      className="cf-turnstile"
                      data-sitekey={bot.site_key}
                      data-callback="quartsysTurnstileCallback"
                    />
                  ) : (
                    <div className="field">
                      <label>{lang === "zh" ? "人机校验 Token" : "Bot check token"}</label>
                      <input
                        value={captchaToken}
                        onChange={(e) => setCaptchaToken(e.target.value)}
                        placeholder={lang === "zh" ? "输入校验 token" : "Enter challenge token"}
                      />
                    </div>
                  )}
                </div>
              )}

              <button type="submit" className="submit-btn" disabled={loading}>
                {loading
                  ? lang === "zh"
                    ? "登录中..."
                    : "Signing in..."
                  : lang === "zh"
                    ? "登录并进入面板"
                    : "Sign in to console"}
              </button>

              <p className="hint">
                {lang === "zh" ? "还没有账号？" : "No account yet?"}{" "}
                {authConfig?.basic_auth?.registration_enabled !== false ? (
                  <button type="button" onClick={() => switchMode("register")}>
                    {lang === "zh" ? "注册" : "Register"}
                  </button>
                ) : (
                  <span>{lang === "zh" ? "请联系管理员开通。" : "Contact admin for access."}</span>
                )}
              </p>
            </form>
          )}

          {mode === "register" && authConfig?.basic_auth?.registration_enabled !== false && (
            <form onSubmit={handleRegister}>
              <div className="field">
                <label htmlFor="register-username">{lang === "zh" ? "用户名" : "Username"}</label>
                <input
                  id="register-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  spellCheck={false}
                  placeholder={lang === "zh" ? "设置用户名" : "Create username"}
                />
              </div>

              <div className="field">
                <label htmlFor="register-email">
                  {needEmailCode || allowedEmailDomains.length > 0
                    ? lang === "zh"
                      ? "邮箱（必填）"
                      : "Email (required)"
                    : lang === "zh"
                      ? "邮箱（可选）"
                      : "Email (optional)"}
                </label>
                <input
                  id="register-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  spellCheck={false}
                  placeholder={
                    needEmailCode
                      ? lang === "zh"
                        ? "接收注册验证码"
                        : "Receive registration code"
                      : lang === "zh"
                        ? "用于账号通知"
                        : "For account notices"
                  }
                />
                {needEmailCode && (
                  <p className="login-field-note">
                    {lang === "zh"
                      ? "当前站点已开启 SMTP 邮箱验证，注册前需要先获取并填写验证码。"
                      : "SMTP verification is enabled. Get and enter the email code before registering."}
                  </p>
                )}
                {allowedEmailDomains.length > 0 && (
                  <p className="login-field-note">
                    {lang === "zh"
                      ? `仅支持：${allowedEmailDomains.join("、")}`
                      : `Allowed domains: ${allowedEmailDomains.join(", ")}`}
                  </p>
                )}
              </div>

              {needEmailCode && (
                <div className="field login-code-row">
                  <div>
                    <label htmlFor="register-email-code">{lang === "zh" ? "邮箱验证码" : "Email code"}</label>
                    <input
                      id="register-email-code"
                      value={emailCode}
                      onChange={(e) => setEmailCode(e.target.value)}
                      inputMode="numeric"
                      placeholder={lang === "zh" ? "6 位验证码" : "6-digit code"}
                    />
                  </div>
                  <button type="button" onClick={sendEmailCode} disabled={emailSending}>
                    {emailSending ? (lang === "zh" ? "发送中" : "Sending") : lang === "zh" ? "发送验证码" : "Send code"}
                  </button>
                </div>
              )}

              <div className="field">
                <label htmlFor="register-password">{lang === "zh" ? "密码" : "Password"}</label>
                <input
                  id="register-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder={lang === "zh" ? "设置密码" : "Create password"}
                />
                <p className="login-field-note">
                  {lang === "zh" ? "8-20 位，须包含大写字母、小写字母和数字。" : "8-20 characters with uppercase, lowercase and a number."}
                </p>
              </div>

              {needCaptcha && (
                <div className="login-captcha-panel">
                  {bot?.provider === "turnstile" && bot.site_key ? (
                    <div
                      className="cf-turnstile"
                      data-sitekey={bot.site_key}
                      data-callback="quartsysTurnstileCallback"
                    />
                  ) : (
                    <div className="field">
                      <label>{lang === "zh" ? "人机校验 Token" : "Bot check token"}</label>
                      <input
                        value={captchaToken}
                        onChange={(e) => setCaptchaToken(e.target.value)}
                        placeholder={lang === "zh" ? "输入校验 token" : "Enter challenge token"}
                      />
                    </div>
                  )}
                </div>
              )}

              <button type="submit" className="submit-btn" disabled={loading}>
                {loading
                  ? lang === "zh"
                    ? "注册中..."
                    : "Registering..."
                  : lang === "zh"
                    ? "创建账号"
                    : "Create account"}
              </button>

              <p className="hint">
                {lang === "zh" ? "已有账号？" : "Already registered?"}{" "}
                <button type="button" onClick={() => switchMode("login")}>
                  {lang === "zh" ? "登录" : "Sign in"}
                </button>
              </p>
            </form>
          )}

          {mode === "reset" && (
            <form onSubmit={handleResetPassword}>
              <div className="login-reset-intro">
                {resetPasswordEnabled ? (
                  <p>
                    {lang === "zh"
                      ? "填写账号绑定邮箱，获取验证码后即可重设密码。"
                      : "Enter the email bound to your account, get the code, then reset your password."}
                  </p>
                ) : (
                  <p>
                    {lang === "zh"
                      ? "当前未开启 SMTP 邮箱服务，暂不支持自助找回密码，请联系管理员处理。"
                      : "SMTP email is not enabled, so self-service password reset is unavailable. Contact an administrator."}
                  </p>
                )}
              </div>

              <div className="field">
                <label htmlFor="reset-username">{lang === "zh" ? "用户名" : "Username"}</label>
                <input
                  id="reset-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  spellCheck={false}
                  placeholder={lang === "zh" ? "输入用户名" : "Enter username"}
                />
              </div>

              <div className="field">
                <label htmlFor="reset-email">{lang === "zh" ? "绑定邮箱" : "Bound email"}</label>
                <input
                  id="reset-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  spellCheck={false}
                  placeholder={lang === "zh" ? "输入账号绑定邮箱" : "Enter bound email"}
                />
              </div>

              <div className="field login-code-row">
                <div>
                  <label htmlFor="reset-email-code">{lang === "zh" ? "邮箱验证码" : "Email code"}</label>
                  <input
                    id="reset-email-code"
                    value={emailCode}
                    onChange={(e) => setEmailCode(e.target.value)}
                    inputMode="numeric"
                    placeholder={lang === "zh" ? "6 位验证码" : "6-digit code"}
                    disabled={!resetPasswordEnabled}
                  />
                </div>
                <button
                  type="button"
                  onClick={sendResetEmailCode}
                  disabled={emailSending || !resetPasswordEnabled}
                >
                  {emailSending ? (lang === "zh" ? "发送中" : "Sending") : lang === "zh" ? "发送验证码" : "Send code"}
                </button>
              </div>

              <div className="field">
                <label htmlFor="reset-password">{lang === "zh" ? "新密码" : "New password"}</label>
                <input
                  id="reset-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder={lang === "zh" ? "设置新密码" : "Create new password"}
                  disabled={!resetPasswordEnabled}
                />
                <p className="login-field-note">
                  {lang === "zh" ? "8-20 位，须包含大写字母、小写字母和数字。" : "8-20 characters with uppercase, lowercase and a number."}
                </p>
              </div>

              <div className="field">
                <label htmlFor="reset-password-confirm">{lang === "zh" ? "确认新密码" : "Confirm password"}</label>
                <input
                  id="reset-password-confirm"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder={lang === "zh" ? "再次输入新密码" : "Enter new password again"}
                  disabled={!resetPasswordEnabled}
                />
              </div>

              {needCaptcha && (
                <div className="login-captcha-panel">
                  {bot?.provider === "turnstile" && bot.site_key ? (
                    <div
                      className="cf-turnstile"
                      data-sitekey={bot.site_key}
                      data-callback="quartsysTurnstileCallback"
                    />
                  ) : (
                    <div className="field">
                      <label>{lang === "zh" ? "人机校验 Token" : "Bot check token"}</label>
                      <input
                        value={captchaToken}
                        onChange={(e) => setCaptchaToken(e.target.value)}
                        placeholder={lang === "zh" ? "输入校验 token" : "Enter challenge token"}
                      />
                    </div>
                  )}
                </div>
              )}

              <button type="submit" className="submit-btn" disabled={loading || !resetPasswordEnabled}>
                {loading
                  ? lang === "zh"
                    ? "重设中..."
                    : "Resetting..."
                  : lang === "zh"
                    ? "重设密码"
                    : "Reset password"}
              </button>

              <p className="hint">
                {lang === "zh" ? "想起密码？" : "Remembered it?"}{" "}
                <button type="button" onClick={() => switchMode("login")}>
                  {lang === "zh" ? "返回登录" : "Back to sign in"}
                </button>
              </p>
            </form>
          )}
          <div className="login-legal-links" aria-label={lang === "zh" ? "法律条款" : "Legal links"}>
            <Link to="/legal/terms">{lang === "zh" ? "用户协议" : "Terms"}</Link>
            <Link to="/legal/privacy">{lang === "zh" ? "隐私条款" : "Privacy"}</Link>
            <Link to="/legal/risk">{lang === "zh" ? "风险提示" : "Risk Disclosure"}</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
