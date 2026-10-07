import { useState } from "react";
import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { api } from "../api";
import type { Certificate, Session } from "../types";
import { Modal } from "./ui";
export function LoginForm({
  session,
  onClose,
  onSuccess,
}: {
  session: Session | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title="Welcome back."
      subtitle="Sign in to manage your institution’s credentials."
      onClose={onClose}
    >
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const data = Object.fromEntries(new FormData(e.currentTarget));
          try {
            await api("/login", { method: "POST", body: JSON.stringify(data) });
            onSuccess();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="login-symbol">
          <LockKeyhole size={27} />
        </div>
        {!session?.configured && (
          <div className="notice">
            Administrator access isn’t configured yet. Ask the workspace owner
            to complete the private setup link.
          </div>
        )}
        <label>
          Email address
          <input
            autoComplete="username"
            name="email"
            type="email"
            required
            placeholder="you@institution.edu"
          />
        </label>
        <label>
          Password
          <input
            autoComplete="current-password"
            name="password"
            type="password"
            required
            maxLength={128}
            placeholder="Your password"
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="button primary full"
          disabled={busy || !session?.configured}
        >
          {busy ? "Signing in…" : "Sign in"}
          <ArrowRight size={16} />
        </button>
        <p className="form-footnote">
          <ShieldCheck size={14} />
          Secure administrator access
        </p>
      </form>
    </Modal>
  );
}
export function IssueForm({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (c: Certificate) => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [issuedAt, setIssuedAt] = useState(
    new Date().toISOString().slice(0, 10),
  );
  return (
    <Modal
      title="Recognize an achievement."
      subtitle="Create a signed certificate with a public verification link."
      onClose={onClose}
    >
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const data = Object.fromEntries(new FormData(e.currentTarget));
          try {
            onSuccess(
              await api<Certificate>("/certificates", {
                method: "POST",
                body: JSON.stringify(data),
              }),
            );
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-section-label">
          01 <span>Recipient details</span>
        </div>
        <label>
          Full name
          <input
            name="recipient"
            required
            minLength={2}
            maxLength={100}
            placeholder="e.g. Aarav Sharma"
            autoComplete="name"
          />
        </label>
        <label>
          Email address
          <input
            aria-label="Email address"
            aria-describedby="recipient-email-help"
            name="email"
            type="email"
            required
            maxLength={254}
            placeholder="recipient@example.com"
            autoComplete="email"
          />
          <small id="recipient-email-help">
            Kept private. Not shown on the public verification page.
          </small>
        </label>
        <div className="form-section-label">
          02 <span>Certificate details</span>
        </div>
        <label>
          Course or achievement
          <input
            name="course"
            required
            minLength={3}
            maxLength={140}
            placeholder="e.g. Data Structures & Algorithms"
          />
        </label>
        <label>
          Certificate type
          <select name="category">
            <option>Course completion</option>
            <option>Professional certification</option>
            <option>Achievement</option>
            <option>Participation</option>
          </select>
        </label>
        <div className="form-columns">
          <label>
            Issue date
            <input
              type="date"
              name="issuedAt"
              required
              max={new Date().toISOString().slice(0, 10)}
              value={issuedAt}
              onChange={(e) => setIssuedAt(e.target.value)}
            />
          </label>
          <label>
            Expiry date <span className="optional">Optional</span>
            <input type="date" name="expiresAt" min={issuedAt} />
          </label>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="notice">
          <ShieldCheck size={18} />A unique certificate ID, integrity signature,
          and verification link are created automatically.
        </div>
        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Issuing…" : "Issue certificate"}
            <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function PasswordForm({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title="Change password"
      subtitle="All active sessions will be signed out."
      onClose={onClose}
    >
      <form
        className="form"
        onSubmit={async (event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          if (data.get("newPassword") !== data.get("confirm")) {
            setError("Passwords do not match.");
            return;
          }
          setBusy(true);
          setError("");
          try {
            await api("/password", {
              method: "POST",
              body: JSON.stringify({
                currentPassword: data.get("currentPassword"),
                newPassword: data.get("newPassword"),
              }),
            });
            onSuccess();
          } catch (error) {
            setError((error as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Current password
          <input
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            maxLength={72}
          />
        </label>
        <label>
          New password
          <input
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={72}
          />
        </label>
        <label>
          Confirm new password
          <input
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={72}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary full" disabled={busy}>
          {busy ? "Updating…" : "Update password"}
        </button>
      </form>
    </Modal>
  );
}
