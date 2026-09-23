import { useEffect, useState } from "react";
import {
  ArrowRight,
  ShieldCheck,
  Fingerprint,
  Link2,
  Search,
  CircleX,
  CalendarDays,
} from "lucide-react";
import { api, dateLabel } from "../api";
import type { Certificate } from "../types";
import { Badge } from "./ui";
export function Verification({
  initialId = "",
  onDetail,
}: {
  initialId?: string;
  onDetail: (c: Certificate) => void;
}) {
  const [id, setId] = useState(initialId);
  const [result, setResult] = useState<Certificate | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function verify(value: string) {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      setResult(
        await api<Certificate>(
          `/verify/${encodeURIComponent(value.trim().toUpperCase())}`,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (initialId) void verify(initialId);
  }, [initialId]);
  return (
    <div className="verification-page">
      <div className="verify-symbol">
        <ShieldCheck size={34} strokeWidth={1.5} />
      </div>
      <span className="eyebrow">TRUST, MADE SIMPLE</span>
      <h1>
        Every achievement.
        <br />
        Authentically verified.
      </h1>
      <p className="verify-intro">
        Check the authenticity and current status of a digital
        <br className="desktop-break" /> certificate. No account needed.
      </p>
      <form
        className="verify-form"
        onSubmit={(e) => {
          e.preventDefault();
          void verify(id);
        }}
      >
        <label htmlFor="certificate-id">Certificate ID</label>
        <div>
          <Search size={19} />
          <input
            id="certificate-id"
            value={id}
            onChange={(e) => setId(e.target.value)}
            required
            maxLength={30}
            placeholder="Enter ID, e.g. CRD-2026-1001"
          />
          <button className="button primary" disabled={busy}>
            {busy ? "Checking…" : "Verify"}
            <ArrowRight size={16} />
          </button>
        </div>
        <small>You’ll find the ID at the bottom of your certificate.</small>
      </form>
      {error && (
        <div className="verification-result failed" role="alert">
          <CircleX size={25} />
          <div>
            <h3>We couldn’t verify this certificate</h3>
            <p>{error}</p>
          </div>
        </div>
      )}
      {result && (
        <div
          className={`verification-result ${result.status === "Active" ? "success" : "failed"}`}
          role="status"
        >
          <div className="result-heading">
            <ShieldCheck size={26} />
            <div>
              <h3>
                {result.status === "Active"
                  ? "This certificate is authentic."
                  : `This certificate is ${result.status.toLowerCase()}.`}
              </h3>
              <p>
                {result.status === "Active"
                  ? "The record is valid and its integrity signature matches."
                  : "This credential is not currently valid."}
              </p>
            </div>
            <Badge status={result.status} />
          </div>
          <dl>
            <div>
              <dt>Recipient</dt>
              <dd>{result.recipient}</dd>
            </div>
            <div>
              <dt>Achievement</dt>
              <dd>{result.course}</dd>
            </div>
            <div>
              <dt>Issued</dt>
              <dd>{dateLabel(result.issuedAt)}</dd>
            </div>
            <div>
              <dt>Expires</dt>
              <dd>
                {result.expiresAt
                  ? dateLabel(result.expiresAt)
                  : "No expiration"}
              </dd>
            </div>
          </dl>
          {result.reason && <p>Revocation reason: {result.reason}</p>}
          <button className="text-button" onClick={() => onDetail(result)}>
            View certificate
            <ArrowRight size={15} />
          </button>
        </div>
      )}
      <div className="verify-features">
        <div>
          <Fingerprint size={23} />
          <h3>Integrity checked</h3>
          <p>
            Every record is checked
            <br />
            against its digital signature.
          </p>
        </div>
        <div>
          <CalendarDays size={23} />
          <h3>Always up to date</h3>
          <p>
            See current validity,
            <br />
            expiration, and revocation.
          </p>
        </div>
        <div>
          <Link2 size={23} />
          <h3>Easy to share</h3>
          <p>
            One unique link.
            <br />
            Confidence for everyone.
          </p>
        </div>
      </div>
      <p className="verify-footer">
        <LockIcon /> Powered by Credence · Digital credential verification
      </p>
    </div>
  );
}
function LockIcon() {
  return <ShieldCheck size={14} />;
}
