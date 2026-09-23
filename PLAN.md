# Credence — implementation plan

## 1. Understanding

A digital certification verification and management system for a single issuing institution. Administrators issue and revoke credentials; visitors verify them without an account. Local sample data provides an immediately usable, read-only demonstration. No email delivery, blockchain, multi-tenant billing, or external storage is assumed.

## 2. Features and flows

1. Overview with accurate counts and recent activity.
2. Searchable certificate registry with status filters and CSV export.
3. Validated issuance form, unique ID, HMAC integrity signature, expiration.
4. Certificate detail, printable document, QR verification link, revocation with reason.
5. Public verification: active, expired, revoked, invalid, and missing states.
6. Audit history and administrator session authentication.

Admin: overview → sign in → issue → inspect/share → manage/revoke.
Visitor: verification URL or ID → public result, without private email.

## 3. Stack and architecture

React + TypeScript + Vite for a compact typed client; plain CSS for an intentional visual system; Lucide for consistent icons. Express and Zod provide a small validated API. Built-in SQLite removes installation of a separate database, while parameterized SQL and indexes support a relational model. bcrypt hashes administrator passwords; opaque, hashed, database-backed sessions live in HTTP-only cookies.

Browser → React → Express routes/controllers → certificate service → SQLite
↘ session authentication

## 4. UI design

Persistent quiet sidebar, translucent header, generous page spacing. Overview combines statistics, a sage feature panel, and a precise certificate table. Registry, verification, activity, and workspace information share components. Accessible native dialogs, visible focus states, reduced motion, system typography, and responsive navigation at 375/768/1280px.

## 5. API and storage

All responses use `{success,data}` or `{success:false,error,code}`.

- GET /api/session: current role and configuration status.
- POST /api/login {email,password}: create administrator session.
- POST /api/logout: invalidate session.
- GET /api/certificates: admin or read-only demo records.
- POST /api/certificates {recipient,email,course,category,issuedAt,expiresAt}: admin issuance.
- POST /api/certificates/:id/revoke {reason}: admin revocation.
- GET /api/verify/:id: public, email-free integrity/status check.
- GET /api/activity: admin or read-only demo activity.

certificates: id TEXT PK, recipient/email/course/category TEXT, issuedAt/expiresAt TEXT, createdAt TEXT, revokedAt/reason nullable TEXT, signature TEXT, demo INTEGER.
activity: id INTEGER PK, certificateId TEXT indexed FK, action/detail/createdAt TEXT, demo INTEGER.
sessions: tokenHash TEXT PK, expiresAt INTEGER.
settings: key TEXT PK, value TEXT (local generated signing secret).

## 6. Implementation and safeguards

Keep modules small. Validate calendar dates and input lengths. Derive expiration at read time. Sign immutable certificate fields. Update certificate and audit entry in one transaction. Rate-limit login and verification. Reject cross-origin writes; use same-site HTTP-only cookies. Sample records never expose real records to unauthenticated visitors.

## 7. Verification

Automated API tests cover anonymous write denial, login/logout, issuance, validation, public privacy, tampering, revocation, expiry, missing IDs, and demo isolation. Browser tests cover navigation, filtering, verification, responsive overflow, and dialog behavior. Build/type checks verify imports and contracts.

## 8. Limits and next steps

SQLite is suitable for a local project or small single-server deployment. Large multi-instance installations should migrate to PostgreSQL, introduce issuer roles, external key management, backups, and a durable audit storage strategy. HMAC protects record integrity against accidental/out-of-band edits but is not a third-party public-key signature or proof of educational accreditation.
