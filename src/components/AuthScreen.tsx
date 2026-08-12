import { useMemo, useState, type FormEvent } from "react";
import { ArrowRight, CalendarDays, Check, Eye, EyeOff, LockKeyhole, ShoppingBasket } from "lucide-react";
import { assessPassword } from "../../shared/password";
import { authClient } from "../lib/auth-client";
import { Brand } from "./Brand";

type Mode = "sign-in" | "sign-up";

interface AuthScreenProps {
  onAuthenticated: () => Promise<unknown>;
}

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const passwordStrength = useMemo(() => assessPassword(password), [password]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (mode === "sign-up" && password !== confirmPassword) {
      setError("The passwords do not match yet.");
      return;
    }

    if (mode === "sign-up" && !passwordStrength.acceptable) {
      setError(passwordStrength.guidance);
      return;
    }

    setPending(true);
    try {
      const result =
        mode === "sign-in"
          ? await authClient.signIn.email({ email, password })
          : await authClient.signUp.email({ name, email, password });

      if (result.error) {
        setError(result.error.message ?? "We could not complete that request.");
        return;
      }

      const authData = result.data as { twoFactorRedirect?: boolean } | null;
      if (mode === "sign-in" && authData?.twoFactorRedirect) {
        const code = prompt("Enter the 6-digit code from your authenticator app.");
        if (!code) {
          setError("Two-factor verification is required to finish signing in.");
          return;
        }
        const verified = await authClient.twoFactor.verifyTotp({ code: code.trim(), trustDevice: true });
        if (verified.error) {
          setError(verified.error.message ?? "That two-factor code could not be verified.");
          return;
        }
      }

      await onAuthenticated();
    } catch {
      setError("We could not reach Kit Hub. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  function changeMode(nextMode: Mode) {
    setMode(nextMode);
    setError(null);
  }

  return (
    <main className="auth-page">
      <section className="auth-story" aria-label="Welcome to Kit Hub">
        <Brand />
        <div className="auth-story__copy">
          <span className="eyebrow">YOUR FAMILY&apos;S DIGITAL HOME</span>
          <h1>Life together,<br />beautifully organized.</h1>
          <p>
            One warm, private place for the plans, lists and little things that keep your home moving.
          </p>
          <div className="auth-benefits">
            <span><CalendarDays /> Shared plans</span>
            <span><Check /> Clear tasks</span>
            <span><ShoppingBasket /> Smarter shopping</span>
          </div>
        </div>
        <div className="mini-home" aria-hidden="true">
          <div className="mini-home__cloud mini-home__cloud--one" />
          <div className="mini-home__cloud mini-home__cloud--two" />
          <div className="mini-home__sun" />
          <div className="mini-home__hill mini-home__hill--back" />
          <div className="mini-home__hill mini-home__hill--front" />
          <div className="mini-home__house">
            <span className="mini-home__roof" />
            <span className="mini-home__window mini-home__window--left" />
            <span className="mini-home__window mini-home__window--right" />
            <span className="mini-home__door" />
          </div>
          <div className="mini-home__tree mini-home__tree--left" />
          <div className="mini-home__tree mini-home__tree--right" />
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-panel__mobile-brand"><Brand compact /></div>
        <div className="auth-card">
          <div className="auth-tabs" role="tablist" aria-label="Account access">
            <button
              type="button"
              className={mode === "sign-in" ? "is-active" : ""}
              onClick={() => changeMode("sign-in")}
              role="tab"
              aria-selected={mode === "sign-in"}
            >
              Sign in
            </button>
            <button
              type="button"
              className={mode === "sign-up" ? "is-active" : ""}
              onClick={() => changeMode("sign-up")}
              role="tab"
              aria-selected={mode === "sign-up"}
            >
              Create account
            </button>
          </div>

          <header className="auth-card__header">
            <span className="auth-card__icon"><LockKeyhole /></span>
            <div>
              <h2>{mode === "sign-in" ? "Welcome home" : "Start your home"}</h2>
              <p>
                {mode === "sign-in"
                  ? "Pick up where your household left off."
                  : "Create your account first; we will set up your household next."}
              </p>
            </div>
          </header>

          <form onSubmit={handleSubmit} className="auth-form">
            {mode === "sign-up" && (
              <label>
                <span>Your name</span>
                <input
                  name="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                  placeholder="How your household sees you"
                  required
                  minLength={2}
                  maxLength={80}
                />
              </label>
            )}
            <label>
              <span>Email address</span>
              <input
                name="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                placeholder="you@example.com"
                required
              />
            </label>
            <label>
              <span>Password</span>
              <span className="password-field">
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                  placeholder={mode === "sign-up" ? "At least 10 characters" : "Your password"}
                  required
                  minLength={10}
                  maxLength={128}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </button>
              </span>
            </label>
            {mode === "sign-up" && password.length > 0 && (
              <div className={`password-strength password-strength--${passwordStrength.score}`} aria-live="polite">
                <div className="password-strength__heading">
                  <span>Password strength</span>
                  <strong>{passwordStrength.label}</strong>
                </div>
                <div className="password-strength__meter" aria-hidden="true">
                  {[1, 2, 3, 4].map((step) => <i key={step} className={step <= passwordStrength.score ? "is-filled" : ""} />)}
                </div>
                <small>{passwordStrength.guidance}</small>
              </div>
            )}
            {mode === "sign-up" && (
              <label>
                <span>Confirm password</span>
                <span className="password-field">
                  <input
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    placeholder="Type it once more"
                    required
                    minLength={10}
                    maxLength={128}
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowConfirmPassword((visible) => !visible)}
                    aria-label={showConfirmPassword ? "Hide confirmed password" : "Show confirmed password"}
                  >
                    {showConfirmPassword ? <EyeOff /> : <Eye />}
                  </button>
                </span>
              </label>
            )}

            {error && <div className="form-message form-message--error" role="alert">{error}</div>}

            <button className="button button--primary button--wide" type="submit" disabled={pending}>
              {pending ? "Opening Kit Hub…" : mode === "sign-in" ? "Enter Kit Hub" : "Create my account"}
              {!pending && <ArrowRight />}
            </button>
          </form>

          <p className="auth-card__privacy">
            Private by design. A House Owner manages the household, but never automatically gains access to another adult&apos;s private content.
          </p>
        </div>
      </section>
    </main>
  );
}
