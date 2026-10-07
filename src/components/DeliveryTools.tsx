import { useEffect, useState } from "react";
import { api } from "../api";
import { Modal } from "./ui";
import type { Certificate } from "../types";
type Delivery = {
  id: string;
  certificate: string;
  state: string;
  attempts: number;
  error: string | null;
};
export function DeliveryTools({
  certificates,
  onClose,
}: {
  certificates: Certificate[];
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Delivery[]>([]),
    [configured, setConfigured] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const load = () =>
    api<{ configured: boolean; rows: Delivery[] }>("/deliveries")
      .then((x) => {
        setRows(x.rows);
        setConfigured(x.configured);
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  const run = async (path: string) => {
    setBusy(true);
    setError("");
    try {
      await api(path, { method: "POST" });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Certificate delivery"
      subtitle="Send the PDF and verification link, then track the provider’s delivery status."
      onClose={onClose}
      wide
    >
      <div className="form">
        {!configured && (
          <p className="notice">
            Email sending is awaiting a verified sender domain and provider
            setup. Certificate downloads and verification links remain
            available.
          </p>
        )}
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            const id = new FormData(e.currentTarget).get("id");
            void run(`/certificates/${id}/email`);
          }}
        >
          <label>
            Certificate
            <select name="id" required disabled={!configured || busy}>
              <option value="">Choose an active certificate</option>
              {certificates
                .filter((c) => c.status === "Active")
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.recipient} — {c.course}
                  </option>
                ))}
            </select>
          </label>
          <button className="button primary" disabled={!configured || busy}>
            Queue email
          </button>
        </form>
        <button
          className="button secondary"
          disabled={!configured || busy}
          onClick={() => void run("/deliveries/process")}
        >
          Send next queued email
        </button>
        <button
          className="text-button"
          disabled={busy}
          onClick={() => void load()}
        >
          Refresh delivery status
        </button>
        <div className="bulk-preview">
          <table>
            <thead>
              <tr>
                <th>Certificate</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.certificate}
                    {r.error && <small>{r.error}</small>}
                  </td>
                  <td>{r.state}</td>
                  <td>{r.attempts}</td>
                  <td>
                    {r.state === "failed" && r.attempts < 5 && (
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => void run(`/deliveries/${r.id}/retry`)}
                      >
                        Retry
                      </button>
                    )}
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
