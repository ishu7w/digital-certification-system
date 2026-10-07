import { useState } from "react";
import { parse } from "csv-parse/browser/esm/sync";
import { api } from "../api";
import type { Certificate, Institution } from "../types";
import { Modal } from "./ui";

export function InstitutionForm({
  current,
  onClose,
  onSuccess,
}: {
  current: Institution;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title="Institution details"
      subtitle="Changes apply to newly issued certificates."
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
            await api("/institution", {
              method: "PUT",
              body: JSON.stringify(data),
            });
            onSuccess();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Institution name
          <input
            name="name"
            defaultValue={current.name}
            required
            minLength={2}
            maxLength={100}
          />
        </label>
        <label>
          Authorised signatory
          <input
            name="signatory"
            defaultValue={current.signatory}
            required
            minLength={2}
            maxLength={100}
          />
        </label>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button className="button primary full" disabled={busy}>
          {busy ? "Saving…" : "Save institution details"}
        </button>
      </form>
    </Modal>
  );
}

export function RecoveryForm({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title="Recover your account"
      subtitle="Use one of the recovery codes you saved from Workspace settings."
      onClose={onClose}
    >
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          if (data.get("newPassword") !== data.get("confirm")) {
            setError("Passwords do not match.");
            return;
          }
          setBusy(true);
          setError("");
          try {
            await api("/recover", {
              method: "POST",
              body: JSON.stringify({
                email: data.get("email"),
                code: data.get("code"),
                newPassword: data.get("newPassword"),
              }),
            });
            onSuccess();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Email address
          <input
            name="email"
            type="email"
            autoComplete="username"
            required
            maxLength={254}
          />
        </label>
        <label>
          Recovery code
          <input
            name="code"
            required
            autoComplete="off"
            maxLength={80}
            spellCheck={false}
          />
        </label>
        <label>
          New password
          <input
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={72}
            required
          />
        </label>
        <label>
          Confirm new password
          <input
            name="confirm"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={72}
            required
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary full" disabled={busy}>
          {busy ? "Recovering…" : "Reset password"}
        </button>
      </form>
    </Modal>
  );
}

export function SecurityTools({
  onClose,
  onSignedOut,
}: {
  onClose: () => void;
  onSignedOut: () => void;
}) {
  const [codes, setCodes] = useState<string[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [action, setAction] = useState("codes");
  return (
    <Modal
      title="Recovery and sessions"
      subtitle="Confirm your password to change account security."
      onClose={onClose}
    >
      {codes.length ? (
        <div className="form">
          <p>
            Save these ten codes in your password manager. Each works once.
            Generating another set invalidates these codes.
          </p>
          <pre className="recovery-code-list">{codes.join("\n")}</pre>
          <p className="notice">
            These codes will disappear when you close this window. Keep them
            private.
          </p>
          <button className="button primary" onClick={onClose}>
            I have saved my codes
          </button>
        </div>
      ) : (
        <form
          className="form"
          onSubmit={async (e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            setBusy(true);
            setError("");
            try {
              const result = await api<{ codes: string[] }>(
                action === "codes" ? "/recovery-codes" : "/sessions/revoke",
                {
                  method: "POST",
                  body: JSON.stringify({
                    currentPassword: data.get("currentPassword"),
                  }),
                },
              );
              if (action === "codes") setCodes(result.codes);
              else onSignedOut();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Action
            <select value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="codes">Generate recovery codes</option>
              <option value="sessions">Sign out all devices</option>
            </select>
          </label>
          <p>
            {action === "codes"
              ? "Generate ten single-use codes to recover access if you forget your password."
              : "This signs out every active session, including this one."}
          </p>
          <label>
            Current password
            <input
              type="password"
              name="currentPassword"
              autoComplete="current-password"
              required
              maxLength={72}
            />
          </label>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <button className="button primary full" disabled={busy}>
            {busy
              ? "Updating…"
              : action === "codes"
                ? "Generate recovery codes"
                : "Sign out all devices"}
          </button>
        </form>
      )}
    </Modal>
  );
}

export function BulkForm({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (count: number) => void;
}) {
  const [rows, setRows] = useState<Record<string, string>[]>([]),
    [errors, setErrors] = useState<{ row: number; message: string }[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [key, setKey] = useState(() => crypto.randomUUID()),
    [reviewed, setReviewed] = useState(false);
  const template =
    "recipient,email,course,category,issuedAt,expiresAt\nExample Recipient,recipient@example.com,Example course,Course completion," +
    new Date().toISOString().slice(0, 10) +
    ",\n";
  return (
    <Modal
      title="Issue a batch"
      subtitle="Upload up to 100 recipients, review the preview, then issue the entire batch."
      onClose={onClose}
      wide
    >
      <div className="form">
        <a
          className="text-button"
          href={"data:text/csv;charset=utf-8," + encodeURIComponent(template)}
          download="certificate-template.csv"
        >
          Download CSV template
        </a>
        <label>
          Certificate CSV
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={async (e) => {
              setError("");
              setRows([]);
              setErrors([]);
              setReviewed(false);
              setKey(crypto.randomUUID());
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 100000) {
                setError("Choose a CSV smaller than 100 KB.");
                return;
              }
              setBusy(true);
              try {
                const parsed = parse(await file.text(), {
                  columns: true,
                  bom: true,
                  skip_empty_lines: true,
                  trim: true,
                }) as Record<string, string>[];
                const result = await api<{
                  rows: Record<string, string>[];
                  errors: { row: number; message: string }[];
                }>("/certificates/bulk/preview", {
                  method: "POST",
                  body: JSON.stringify({ rows: parsed }),
                });
                setRows(parsed);
                setErrors(result.errors);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
        {errors.length > 0 && (
          <div className="notice error" role="alert">
            {errors.map((e, i) => (
              <p key={i}>
                Row {e.row}: {e.message}
              </p>
            ))}
          </div>
        )}
        {rows.length > 0 && (
          <>
            <div className="bulk-preview">
              <table>
                <thead>
                  <tr>
                    <th>Recipient</th>
                    <th>Achievement</th>
                    <th>Issue date</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i}>
                      <td>
                        {row.recipient}
                        <small>{row.email}</small>
                      </td>
                      <td>{row.course}</td>
                      <td>{row.issuedAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <label className="bulk-confirm">
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(e) => setReviewed(e.target.checked)}
              />{" "}
              I reviewed all {rows.length} recipients and the certificate
              details.
            </label>
          </>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="button primary full"
          disabled={busy || !rows.length || !!errors.length || !reviewed}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const result = await api<Certificate[]>("/certificates/bulk", {
                method: "POST",
                body: JSON.stringify({ rows, key }),
              });
              onSuccess(result.length);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Processing…" : `Issue ${rows.length || ""} certificates`}
        </button>
      </div>
    </Modal>
  );
}
