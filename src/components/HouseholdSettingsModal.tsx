import { useState, type FormEvent } from "react";
import { Home, X } from "lucide-react";
import { ApiError } from "../lib/api";

interface HouseholdSettingsModalProps {
  currentName: string;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}

export function HouseholdSettingsModal({
  currentName,
  onClose,
  onSave,
}: HouseholdSettingsModalProps) {
  const [name, setName] = useState(currentName);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldError(null);
    setMessage(null);
    setRequestId(null);
    setPending(true);

    try {
      await onSave(name);
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        setFieldError(error.details?.name ?? null);
        setMessage(error.message);
        setRequestId(error.requestId ?? null);
      } else {
        setMessage("We could not save the household name. Please try again.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="household-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="household-settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div className="household-settings-modal__heading">
            <span><Home /></span>
            <div>
              <small>HOUSEHOLD SETTINGS</small>
              <h2 id="household-settings-title">Change household name</h2>
            </div>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close settings">
            <X />
          </button>
        </header>

        <form onSubmit={handleSubmit}>
          <label>
            <span>Household name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              minLength={2}
              maxLength={64}
              required
              autoFocus
            />
            {fieldError && <small className="field-error">{fieldError}</small>}
          </label>

          <p className="household-settings-modal__note">
            This changes the name everyone sees. Your household data and links stay connected.
          </p>

          {message && (
            <div className="form-message form-message--error" role="alert">
              <span>{message}</span>
              {requestId && <small className="form-message__reference">Reference: {requestId}</small>}
            </div>
          )}

          <div className="household-settings-modal__actions">
            <button className="button button--secondary" type="button" onClick={onClose} disabled={pending}>
              Cancel
            </button>
            <button className="button button--primary" type="submit" disabled={pending || name.trim() === currentName}>
              {pending ? "Saving…" : "Save name"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
