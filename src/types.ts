export type Institution = { name: string; signatory: string };
export type Certificate = {
  issuer?: Institution | null;
  id: string;
  recipient: string;
  email?: string;
  course: string;
  category: string;
  issuedAt: string;
  expiresAt: string | null;
  createdAt: string;
  revokedAt: string | null;
  reason: string | null;
  status: "Active" | "Expired" | "Revoked" | "Invalid";
  demo?: number;
};
export type Activity = {
  id: number;
  certificateId: string;
  action: string;
  detail: string;
  createdAt: string;
};
export type Session = {
  role: "admin" | "viewer";
  email: string | null;
  demoMode: boolean;
  configured: boolean;
  setupAvailable?: boolean;
  storage?: string;
  institution?: Institution;
};
export type Page =
  | "Overview"
  | "Certificates"
  | "Verify a certificate"
  | "Activity"
  | "Workspace";
