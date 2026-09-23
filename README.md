# Credence

**Digital Certification Verification & Management System**

A complete single-institution project with a React interface, an Express API, and persistent SQLite storage. The interface uses system typography, quiet sage tones, generous spacing, responsive layouts, keyboard-accessible dialogs, and reduced-motion support.

## Run locally

Requires **Node.js 22.13+** (Node 24 LTS recommended).

```sh
npm install
npm run dev
```

Open **http://127.0.0.1:5173**. The API runs on port 3001. The first run creates a local database and 12 fictional sample certificates. The workspace is read-only until you configure an administrator.

## Enable issuing and revocation

```sh
npm run setup:admin
```

Enter your email and a unique password when prompted. The script stores a bcrypt hash, never the password, in the ignored `.env` file. It preserves the signing key used by existing local certificates. Restart the development server, click **Issue certificate** or the sign-in arrow beside **Guest workspace**, and sign in. Run the setup command again to change credentials; existing sessions should be cleared from the local database if access must be revoked immediately.

You can instead copy `.env.example` to `.env` and supply your own values. Use a bcrypt hash with cost 12 or greater and a signing secret of at least 32 characters. Avoid putting passwords directly in shell commands or shell history.

## Features

- Overview with database-derived certificate totals and status counts.
- Search by recipient, email, course, or certificate ID; status filters and pagination.
- Issue signed certificates with recipient details, category, dates, and optional expiration.
- Public verification by ID or QR link, without exposing recipient email.
- Active, expired, revoked, invalid-signature, and not-found verification states.
- Certificate preview, shareable verification links, and print / save as PDF.
- Permanent revocation with a reason and audit history.
- CSV export of the current filtered registry with spreadsheet formula escaping.
- Administrator authentication using hashed opaque sessions and HTTP-only cookies.
- A safe demonstration: guests see only fictional sample records, even after an administrator issues real records.

**PDF:** open a certificate and click **Print / save PDF**. Choose your browser’s PDF destination. A dedicated landscape print stylesheet excludes navigation and action buttons.

**QR sharing:** QR codes use the current website origin. A localhost QR code works only on the same computer. For other devices, deploy to a reachable HTTPS domain first.

## Simple structure

```text
src/
  App.tsx                 Navigation, overview, registry, activity, workspace
  api.ts                  API client, dates, CSV export
  types.ts                Shared frontend types
  styles.css              Responsive visual system and print layout
  components/             Dialogs, forms, tables, verification, certificate preview
server/
  index.js                Environment checks, startup, production static hosting
  app.js                  API routes, session middleware, authorization, validation
  certificates.js         Certificate service, signatures, lifecycle, sample data
  db.js                   SQLite schema and local signing-key persistence
scripts/setup-admin.js    Interactive administrator setup
tests/                   API integration and browser tests
PLAN.md                   Requirements, architecture, API and implementation plan
```

## Data and algorithms

- Certificate IDs use cryptographically random bytes and a database primary key.
- HMAC-SHA256 signs canonical immutable certificate fields; constant-time comparison checks integrity.
- SQLite indexes support primary-key lookup, date ordering, recipient email queries, and certificate activity lookup.
- Status is calculated from integrity, revocation, and the current UTC date. A certificate is valid through its expiration date.
- Issuance and revocation use transactions so the record and audit event commit together.
- The current small-project interface searches and filters a fetched array in O(n); migrate to server pagination and indexed search for a large registry.

## API

All responses use `{ "success": true, "data": ... }` or `{ "success": false, "error": "...", "code": 400 }`.

| Method | Route                          | Access                    | Purpose                                |
| ------ | ------------------------------ | ------------------------- | -------------------------------------- |
| GET    | `/api/session`                 | Public                    | Role and workspace configuration       |
| POST   | `/api/login`                   | Public, rate limited      | `{ email, password }` → session cookie |
| POST   | `/api/logout`                  | Public                    | Invalidate session                     |
| GET    | `/api/certificates`            | Admin / sample-only guest | Certificate registry                   |
| POST   | `/api/certificates`            | Admin                     | Issue certificate                      |
| POST   | `/api/certificates/:id/revoke` | Admin                     | `{ reason }` → revoke                  |
| GET    | `/api/verify/:id`              | Public, rate limited      | Current status and public fields       |
| GET    | `/api/activity`                | Admin / sample-only guest | Most recent 100 audit events           |

Issue payload:

```json
{
  "recipient": "Alex Taylor",
  "email": "alex@example.com",
  "course": "Data Structures & Algorithms",
  "category": "Course completion",
  "issuedAt": "2026-09-01",
  "expiresAt": "2027-09-01"
}
```

## Validate

```sh
npm test
npm run build
npx playwright install chromium
npm run test:ui
```

API tests use isolated in-memory databases and randomly generated test credentials. Browser tests cover the sample workspace at 375, 768, and 1280 pixels, certificate dialogs, filtering, pagination, CSV export, direct links, and verification results.

## Deployment and limits

```sh
npm run build
npm start
```

Production requires `SIGNING_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD_HASH`; session cookies require **HTTPS**. Place the server behind a same-origin TLS reverse proxy preserving the request `Host`. It binds to `127.0.0.1` by default. Set `DEMO_MODE=false` to hide sample records from guests. Keep the database on a persistent volume and back up both the database and signing key. Changing the signing key invalidates existing signatures; key rotation would require an explicit migration.

The application is a complete local/small-server project, not a multi-tenant certification authority. The issuer name is currently **Credence Academy**. Public verification discloses the recipient name and achievement to anyone with the certificate ID; do not issue private data that should not be shared this way. Revocation reasons are public. HMAC integrity is not a public-key digital signature, a blockchain proof, or independent evidence of accreditation. A user who obtains both the database and secret can forge records. Production at scale needs managed secrets, database backups, issuer account management, durable audit storage, and migration to PostgreSQL for multiple application instances.

SQLite API reference: https://nodejs.org/api/sqlite.html. Vite setup reference: https://vite.dev/guide/.
