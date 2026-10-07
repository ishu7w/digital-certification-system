import { useEffect, useState } from "react";
import { api } from "../api";
import { Modal } from "./ui";
export function TwoFactor({
  onClose,
  onSignedOut,
}: {
  onClose: () => void;
  onSignedOut: () => void;
}) {
  const [enabled, setEnabled] = useState<boolean | null>(null),
    [enrollment, setEnrollment] = useState<{
      secret: string;
      qr: string;
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ enabled: boolean }>("/mfa")
      .then((x) => setEnabled(x.enabled))
      .catch((e) => setError(e.message));
  }, []);
  return (
    <Modal
      title="Two-factor authentication"
      subtitle="Use an authenticator app to protect your account."
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
            if (enabled) {
              await api("/mfa/disable", {
                method: "POST",
                body: JSON.stringify(data),
              });
              onSignedOut();
            } else if (enrollment) {
              await api("/mfa/confirm", {
                method: "POST",
                body: JSON.stringify(data),
              });
              onSignedOut();
            } else {
              setEnrollment(
                await api("/mfa/enroll", {
                  method: "POST",
                  body: JSON.stringify(data),
                }),
              );
            }
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {enabled === false && !enrollment && (
          <p>
            First save recovery codes using Recovery and sessions. Then scan a
            QR code with your authenticator app. Enrollment expires after ten
            minutes.
          </p>
        )}
        {enabled && (
          <p>
            Two-factor authentication is enabled. To remove it, confirm your
            password and a fresh authenticator code. All devices will be signed
            out.
          </p>
        )}
        {enrollment && (
          <>
            <img
              src={enrollment.qr}
              alt="Authenticator enrollment QR code"
              width={220}
              height={220}
              style={{ alignSelf: "center" }}
            />
            <label>
              Manual setup key
              <input readOnly value={enrollment.secret} autoComplete="off" />
            </label>
            <p>
              Save this key in your authenticator app. Never share it. Enter a
              code from the app to finish.
            </p>
          </>
        )}
        <label>
          Current password
          <input
            type="password"
            name="currentPassword"
            required
            autoComplete="current-password"
            maxLength={72}
          />
        </label>
        {(enabled || enrollment) && (
          <label>
            Authenticator code
            <input
              name="code"
              required
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
            />
          </label>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button
          className="button primary full"
          disabled={busy || enabled === null}
        >
          {busy
            ? "Updating…"
            : enabled
              ? "Disable two-factor authentication"
              : enrollment
                ? "Enable and sign out"
                : "Set up authenticator"}
        </button>
      </form>
    </Modal>
  );
}
