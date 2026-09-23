import { useEffect, useRef, type ReactNode } from "react";
import { X, Check, ShieldCheck, ArrowUpRight, Search } from "lucide-react";
import type { Certificate } from "../types";
import { dateLabel, initials } from "../api";
export function Brand({ small = false }: { small?: boolean }) {
  return (
    <div className={`brand ${small ? "small" : ""}`}>
      <span className="brand-mark">
        <ShieldCheck size={23} strokeWidth={1.7} />
      </span>
      {!small && (
        <span>
          credence<span className="brand-period">.</span>
        </span>
      )}
    </div>
  );
}
export function Badge({ status }: { status: Certificate["status"] }) {
  return (
    <span className={`badge ${status.toLowerCase()}`}>
      <span />
      {status}
    </span>
  );
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = old;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
      aria-labelledby="modal-title"
    >
      <div className="modal-header">
        <div>
          <h2 id="modal-title">{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <Search size={26} />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
export function CertificateTable({
  rows,
  onSelect,
}: {
  rows: Certificate[];
  onSelect: (c: Certificate) => void;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Recipient</th>
            <th>Certificate</th>
            <th>Issue date</th>
            <th>Status</th>
            <th>
              <span className="sr-only">Details</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c, i) => (
            <tr key={c.id} onClick={() => onSelect(c)}>
              <td>
                <div className="person">
                  <span className={`avatar tone-${i % 5}`}>
                    {initials(c.recipient)}
                  </span>
                  <span>
                    <strong>{c.recipient}</strong>
                    <small>{c.email || c.id}</small>
                  </span>
                </div>
              </td>
              <td>
                <strong>{c.course}</strong>
                <small className="mono">{c.id}</small>
              </td>
              <td className="date-cell">{dateLabel(c.issuedAt)}</td>
              <td>
                <Badge status={c.status} />
              </td>
              <td>
                <button
                  className="icon-button table-open"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(c);
                  }}
                  aria-label={`View certificate for ${c.recipient}`}
                >
                  <ArrowUpRight size={17} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function TrustNote({ children }: { children: ReactNode }) {
  return (
    <span className="trust-note">
      <Check size={13} />
      {children}
    </span>
  );
}
