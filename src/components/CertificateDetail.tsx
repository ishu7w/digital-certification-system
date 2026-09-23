import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Award, Copy, Printer, ShieldCheck, Ban, Check } from "lucide-react";
import type { Certificate } from "../types";
import { api, dateLabel } from "../api";
import { Badge, Modal } from "./ui";
export function CertificateDetail({
  certificate: c,
  admin,
  onClose,
  onChanged,
  notify,
}: {
  certificate: Certificate;
  admin: boolean;
  onClose: () => void;
  onChanged: () => void;
  notify: (message: string) => void;
}) {
  const [qr, setQr] = useState("");
  const [revoking, setRevoking] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const url = `${window.location.origin}/?verify=${encodeURIComponent(c.id)}`;
  useEffect(() => {
    let mounted = true;
    QRCode.toDataURL(url, {
      width: 144,
      margin: 1,
      color: { dark: "#214b3d", light: "#ffffff" },
    })
      .then((value) => {
        if (mounted) setQr(value);
      })
      .catch(() =>
        setError("Unable to generate QR code. Use the verification link."),
      );
    return () => {
      mounted = false;
    };
  }, [url]);
  async function revoke(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/certificates/${c.id}/revoke`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      onChanged();
      onClose();
      notify("Certificate revoked. The verification record is updated.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Certificate details" subtitle={c.id} onClose={onClose} wide>
      <div className="certificate-paper" id="print-certificate">
        <div className="paper-top">
          <span className="paper-brand">
            <ShieldCheck size={18} /> CREDENCE
          </span>
          <span>DIGITAL CREDENTIAL</span>
        </div>
        <div className="paper-emblem">
          <Award size={44} strokeWidth={1.2} />
        </div>
        <p className="eyebrow">{c.category}</p>
        <h2>
          Certificate of{" "}
          {c.category === "Achievement"
            ? "Achievement"
            : c.category === "Participation"
              ? "Participation"
              : "Completion"}
        </h2>
        <p className="paper-intro">This is proudly presented to</p>
        <h3>{c.recipient}</h3>
        <p>For successfully completing</p>
        <h4>{c.course}</h4>
        <div className="paper-bottom">
          <div>
            <span className="signature">Credence Academy</span>
            <small>Issuing institution</small>
            <p>Issued {dateLabel(c.issuedAt)}</p>
            {c.expiresAt && <p>Expires {dateLabel(c.expiresAt)}</p>}
          </div>
          <div className="paper-qr">
            {qr && (
              <img src={qr} alt="QR code linking to certificate verification" />
            )}
            <small>{c.id}</small>
          </div>
        </div>
        <div className="paper-footer">
          <Check size={12} /> Digitally signed · Verify the current status
          online <span>{c.status}</span>
        </div>
      </div>
      <div className="detail-meta">
        <Badge status={c.status} />
        <span>Verify this credential using its unique ID or QR code.</span>
      </div>
      {c.reason && (
        <div className="notice error">Revocation reason: {c.reason}</div>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <button
          className="button secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              notify("Verification link copied.");
            } catch {
              setError("Clipboard access was denied. Copy this link: " + url);
            }
          }}
        >
          <Copy size={16} />
          Copy link
        </button>
        <button className="button primary" onClick={() => window.print()}>
          <Printer size={16} />
          Print / save PDF
        </button>
        {admin && !c.revokedAt && (
          <button
            className="button danger quiet"
            onClick={() => setRevoking(!revoking)}
          >
            <Ban size={15} />
            Revoke
          </button>
        )}
      </div>
      {revoking && (
        <form className="revoke-form" onSubmit={revoke}>
          <h3>Revoke this certificate?</h3>
          <p>
            This action is permanent. The certificate will remain in the
            registry and display as revoked.
          </p>
          <label>
            Reason
            <textarea
              required
              minLength={5}
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this credential is being revoked"
            />
          </label>
          <button className="button danger" disabled={busy}>
            {busy ? "Revoking…" : "Confirm revocation"}
          </button>
        </form>
      )}
    </Modal>
  );
}
