export type Certificate = {
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
};
export type Page =
  | "Overview"
  | "Certificates"
  | "Verify a certificate"
  | "Activity"
  | "Workspace";
