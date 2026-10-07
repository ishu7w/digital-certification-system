import { useEffect, useState } from "react";
import { api } from "../api";
import { Modal } from "./ui";
import type { Session } from "../types";
type Staff = {
  id: string;
  name: string;
  email: string;
  role: "issuer" | "reviewer";
  active: number;
};
export function StaffTools({ onClose }: { onClose: () => void }) {
  const [staff, setStaff] = useState<Staff[]>([]),
    [link, setLink] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = () =>
    api<Staff[]>("/staff")
      .then(setStaff)
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  return (
    <Modal
      title="Staff access"
      subtitle="Give each staff member their own account and permissions."
      onClose={onClose}
      wide
    >
      <div className="form">
        <div className="bulk-preview">
          <table>
            <thead>
              <tr>
                <th>Staff member</th>
                <th>Role</th>
                <th>Access</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id}>
                  <td>
                    {s.name}
                    <small>{s.email}</small>
                  </td>
                  <td>
                    <select
                      aria-label={`Role for ${s.name}`}
                      value={s.role}
                      disabled={busy}
                      onChange={async (e) => {
                        setBusy(true);
                        try {
                          await api(`/staff/${s.id}`, {
                            method: "PATCH",
                            body: JSON.stringify({
                              active: !!s.active,
                              role: e.target.value,
                            }),
                          });
                          await load();
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <option value="issuer">Issuer</option>
                      <option value="reviewer">Reviewer</option>
                    </select>
                  </td>
                  <td>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await api(`/staff/${s.id}`, {
                            method: "PATCH",
                            body: JSON.stringify({
                              active: !s.active,
                              role: s.role,
                            }),
                          });
                          await load();
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {s.active ? "Suspend" : "Restore access"}
                    </button>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        setError("");
                        try {
                          const result = await api<{ invitation: string }>(
                            `/staff/${s.id}/invitation`,
                            { method: "POST" },
                          );
                          setLink(result.invitation);
                          await load();
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Reset access
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form
          className="form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const form = e.currentTarget;
            try {
              const x = await api<{ invitation: string }>("/staff", {
                method: "POST",
                body: JSON.stringify(Object.fromEntries(new FormData(form))),
              });
              setLink(x.invitation);
              form.reset();
              await load();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Full name
            <input name="name" required minLength={2} maxLength={100} />
          </label>
          <label>
            Email address
            <input name="email" type="email" required maxLength={254} />
          </label>
          <label>
            Role
            <select name="role">
              <option value="issuer">
                Issuer — submit certificates for review
              </option>
              <option value="reviewer">
                Reviewer — approve or reject requests
              </option>
            </select>
          </label>
          <button className="button primary" disabled={busy}>
            Create invitation
          </button>
        </form>
        {link && (
          <label>
            Private invitation — share with this staff member; expires in 24
            hours
            <input readOnly value={link} onFocus={(e) => e.target.select()} />
          </label>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
export function StaffInvitation({
  token,
  onClose,
  onSuccess,
}: {
  token: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title="Join your institution"
      subtitle="Choose a password for your personal staff account."
      onClose={onClose}
    >
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          if (data.get("password") !== data.get("confirm")) {
            setError("Passwords do not match.");
            return;
          }
          setBusy(true);
          try {
            await api("/staff/accept", {
              method: "POST",
              body: JSON.stringify({ token, password: data.get("password") }),
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
          Password
          <input
            name="password"
            type="password"
            required
            minLength={12}
            maxLength={72}
            autoComplete="new-password"
          />
        </label>
        <label>
          Confirm password
          <input
            name="confirm"
            type="password"
            required
            minLength={12}
            maxLength={72}
            autoComplete="new-password"
          />
        </label>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button className="button primary" disabled={busy}>
          Accept invitation
        </button>
      </form>
    </Modal>
  );
}
type Request = {
  id: string;
  state: string;
  submitter: string;
  note: string | null;
  certificate: string | null;
  replaces: string | null;
  payload: {
    recipient: string;
    course: string;
    email: string;
    category: string;
    issuedAt: string;
    expiresAt?: string | null;
  };
};
export function ReviewTools({
  session,
  onClose,
  onChanged,
}: {
  session: Session;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<Request[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [note, setNote] = useState("");
  const load = () =>
    api<Request[]>("/requests")
      .then(setRows)
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  return (
    <Modal
      title="Certificate review"
      subtitle="A different staff member reviews each request. Corrections retain the original certificate’s history."
      onClose={onClose}
      wide
    >
      <div className="form">
        {(session.role === "admin" || session.role === "issuer") && (
          <form
            className="form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const form = e.currentTarget,
                data = Object.fromEntries(new FormData(form));
              const { replaces, note, ...certificate } = data;
              try {
                await api("/requests", {
                  method: "POST",
                  body: JSON.stringify({
                    certificate,
                    ...(replaces ? { replaces, note } : {}),
                  }),
                });
                form.reset();
                await load();
                onChanged();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="form-columns">
              <label>
                Recipient
                <input
                  name="recipient"
                  required
                  minLength={2}
                  maxLength={100}
                />
              </label>
              <label>
                Email address
                <input name="email" type="email" required maxLength={254} />
              </label>
            </div>
            <label>
              Achievement
              <input name="course" required minLength={3} maxLength={140} />
            </label>
            <label>
              Type
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
                  name="issuedAt"
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  max={new Date().toISOString().slice(0, 10)}
                  required
                />
              </label>
              <label>
                Expiry date
                <input name="expiresAt" type="date" />
              </label>
            </div>
            <label>
              Original certificate ID{" "}
              <span className="optional">For corrections</span>
              <input name="replaces" maxLength={40} />
            </label>
            <label>
              Correction reason
              <input name="note" maxLength={300} />
            </label>
            <button className="button primary" disabled={busy}>
              Submit for review
            </button>
          </form>
        )}
        {session.role !== "issuer" && (
          <label>
            Review note
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              minLength={5}
              maxLength={300}
              placeholder="Required when approving or rejecting"
            />
          </label>
        )}
        {rows.length === 0 && <p>No review requests yet.</p>}
        <div className="bulk-preview">
          <table>
            <thead>
              <tr>
                <th>Recipient / achievement</th>
                <th>Status</th>
                <th>Review</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.payload.recipient}
                    <small>{r.payload.course}</small>
                    <small>{r.payload.email}</small>
                    <small>
                      {r.payload.category} · Issued {r.payload.issuedAt}
                      {r.payload.expiresAt
                        ? ` · Expires ${r.payload.expiresAt}`
                        : " · No expiry"}
                    </small>
                    {r.replaces && <small>Corrects {r.replaces}</small>}
                    {r.certificate && <small>Issued: {r.certificate}</small>}
                    {r.note && <small>{r.note}</small>}
                  </td>
                  <td>{r.state}</td>
                  <td>
                    {r.state === "pending" &&
                      session.role !== "issuer" &&
                      ["approve", "reject"].map((decision) => (
                        <button
                          key={decision}
                          className="text-button"
                          disabled={busy || note.trim().length < 5}
                          onClick={async () => {
                            setBusy(true);
                            setError("");
                            try {
                              await api(`/requests/${r.id}/review`, {
                                method: "POST",
                                body: JSON.stringify({ decision, note }),
                              });
                              await load();
                              onChanged();
                            } catch (e) {
                              setError((e as Error).message);
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          {decision === "approve" ? "Approve" : "Reject"}
                        </button>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
