import { useEffect, useState } from "react";
import { api } from "../api";
import type { Session } from "../types";

export default function AdminSetup() {
  const [token] = useState(
    () => new URLSearchParams(location.hash.slice(1)).get("token") || "",
  );
  const [session, setSession] = useState<Session | null>(null);
  const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    history.replaceState({}, "", "/?setup");
    void api<Session>("/session")
      .then(setSession)
      .catch((error) => setError(error.message));
  }, []);
  return (
    <div className="cinematic-workspace admin-setup">
      <main className="settings-card">
        <a href="/" className="experience-logo">
          credence
        </a>
        <h1>{complete ? "Administrator ready" : "Set up your workspace"}</h1>
        {complete ? (
          <>
            <p>
              Your account is ready. Sign in to issue and manage certificates.
            </p>
            <a href="/?workspace" className="button primary">
              Open workspace
            </a>
          </>
        ) : session?.configured ? (
          <>
            <p>An administrator is already configured for this workspace.</p>
            <a href="/?workspace" className="button primary">
              Sign in
            </a>
          </>
        ) : (
          <form
            className="form"
            onSubmit={async (event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const password = String(data.get("password"));
              if (password !== data.get("confirm")) {
                setError("Passwords do not match.");
                return;
              }
              setBusy(true);
              setError("");
              try {
                await api("/setup", {
                  method: "POST",
                  body: JSON.stringify({
                    token,
                    email: data.get("email"),
                    password,
                  }),
                });
                setComplete(true);
              } catch (error) {
                setError((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <p>
              Choose the email and password you’ll use to manage this
              institution’s certificates.
            </p>
            {session && (!session.setupAvailable || !token) && (
              <p className="notice">
                Open the private setup link provided by the workspace owner. The
                link expires after 24 hours.
              </p>
            )}
            <label>
              Email address
              <input
                name="email"
                type="email"
                maxLength={254}
                autoComplete="username"
                required
              />
            </label>
            <label>
              Password
              <input
                name="password"
                aria-label="Password"
                aria-describedby="setup-password-help"
                type="password"
                minLength={12}
                maxLength={72}
                autoComplete="new-password"
                required
              />
              <small id="setup-password-help">
                Use at least 12 characters. A password manager can generate and
                save one.
              </small>
            </label>
            <label>
              Confirm password
              <input
                name="confirm"
                type="password"
                minLength={12}
                maxLength={72}
                autoComplete="new-password"
                required
              />
            </label>
            <button
              className="button primary full"
              disabled={busy || !token || !session?.setupAvailable}
            >
              {busy ? "Creating account…" : "Create administrator account"}
            </button>
          </form>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </main>
    </div>
  );
}
