import { useMemo, useState, type FormEvent } from "react";
import { ArrowRight, Check, Globe2, Home, Sparkles, UsersRound } from "lucide-react";
import type { BootstrapResponse, CreateHouseholdInput, HouseholdSummary } from "../../shared/contracts";
import { ApiError, api } from "../lib/api";
import { Brand } from "./Brand";

interface HouseholdOnboardingProps {
  bootstrap: BootstrapResponse;
  onCreated: (household: HouseholdSummary) => void;
  onSignOut: () => Promise<void>;
}

const languages = [
  { value: "en", label: "English" },
  { value: "nl", label: "Nederlands" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "es", label: "Español" },
];

export function HouseholdOnboarding({ bootstrap, onCreated, onSignOut }: HouseholdOnboardingProps) {
  const guessedTimezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Brussels",
    [],
  );
  const [form, setForm] = useState<CreateHouseholdInput>({
    name: "",
    timezone: guessedTimezone,
    defaultLanguage: "en",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setMessage(null);
    setPending(true);
    try {
      const household = await api.createHousehold(form);
      onCreated(household);
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.details ?? {});
        setMessage(error.message);
      } else {
        setMessage("We could not create the household. Please try again.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="onboarding-page">
      <header className="onboarding-topbar">
        <Brand compact />
        <button className="text-button" type="button" onClick={() => void onSignOut()}>
          Sign out
        </button>
      </header>

      <div className="onboarding-layout">
        <section className="onboarding-intro">
          <span className="eyebrow">HELLO, {bootstrap.user.name.toUpperCase()}</span>
          <h1>Let&apos;s give your household a front door.</h1>
          <p>
            This creates the private space where your people, shared plans and future digital house will live.
          </p>
          <div className="setup-steps" aria-label="Setup progress">
            <div className="setup-step setup-step--done"><span><Check /></span><div><strong>Account</strong><small>You are signed in</small></div></div>
            <div className="setup-step setup-step--active"><span>2</span><div><strong>Household</strong><small>Name your shared home</small></div></div>
            <div className="setup-step"><span>3</span><div><strong>Invite</strong><small>Add people when you are ready</small></div></div>
          </div>
        </section>

        <section className="setup-card">
          <header>
            <span className="setup-card__icon"><Home /></span>
            <div>
              <h2>Create your household</h2>
              <p>You can change all of this later.</p>
            </div>
          </header>

          <form className="setup-form" onSubmit={handleSubmit}>
            <label>
              <span>Household name</span>
              <span className="input-with-icon"><UsersRound /><input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="e.g. The Fox Den"
                minLength={2}
                maxLength={64}
                required
                autoFocus
              /></span>
              {errors.name && <small className="field-error">{errors.name}</small>}
            </label>

            <div className="setup-form__row">
              <label>
                <span>Default language</span>
                <span className="input-with-icon"><Globe2 /><select
                  value={form.defaultLanguage}
                  onChange={(event) => setForm({ ...form, defaultLanguage: event.target.value })}
                >
                  {languages.map((language) => (
                    <option key={language.value} value={language.value}>{language.label}</option>
                  ))}
                </select></span>
                {errors.defaultLanguage && <small className="field-error">{errors.defaultLanguage}</small>}
              </label>
              <label>
                <span>Home time zone</span>
                <input
                  value={form.timezone}
                  onChange={(event) => setForm({ ...form, timezone: event.target.value })}
                  placeholder="Europe/Brussels"
                  maxLength={64}
                  required
                />
                {errors.timezone && <small className="field-error">{errors.timezone}</small>}
              </label>
            </div>

            {message && <div className="form-message form-message--error" role="alert">{message}</div>}

            <button className="button button--primary button--wide" type="submit" disabled={pending}>
              {pending ? "Building your home…" : "Create household"}
              {!pending && <ArrowRight />}
            </button>
          </form>

          <div className="setup-note">
            <Sparkles />
            <p><strong>Start simple.</strong> Kit Hub will open on your Today page. Rooms, themes and the interactive house grow from the same household later.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
