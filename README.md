# Credence

**Digital Certification Verification & Management System**

A complete single-institution project with a React interface, an Express API, and persistent PostgreSQL storage on Vercel and SQLite for local development. The interface uses Geist typography, a dark workspace, a 3D scroll experience, responsive layouts, keyboard-accessible dialogs, and reduced-motion support.

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

Enter your email and a unique password when prompted. The script stores a bcrypt hash, never the password, in the ignored `.env` file. It preserves the signing key used by existing local certificates. Restart the development server, click **Issue certificate** or the sign-in arrow beside **Guest workspace**, and sign in. Use **Workspace → Change password** to update credentials and invalidate all active sessions.

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

Production requires a persistent `SIGNING_SECRET` and either configured administrator credentials or the one-time administrator setup flow; session cookies require **HTTPS**. Place the server behind a same-origin TLS reverse proxy preserving the request `Host`. It binds to `127.0.0.1` by default. Set `DEMO_MODE=false` to hide sample records from guests. Keep the database on a persistent volume and back up both the database and signing key. Changing the signing key invalidates existing signatures; key rotation would require an explicit migration.

The application is a complete local/small-server project, not a multi-tenant certification authority. The issuer name is currently **Credence Academy**. Public verification discloses the recipient name and achievement to anyone with the certificate ID; do not issue private data that should not be shared this way. Revocation reasons are public. HMAC integrity is not a public-key digital signature, a blockchain proof, or independent evidence of accreditation. A user who obtains both the database and secret can forge records. The hosted system stores records, audit events, sessions, and rate limits in PostgreSQL. Keep backups of both the database and signing key. This system has one institution administrator; multi-institution accounts and independent accreditation are outside its scope.

SQLite API reference: https://nodejs.org/api/sqlite.html. Vite setup reference: https://vite.dev/guide/.

## Immersive visual experience

The homepage now opens with an original Three.js credential-vault scene inspired by Active Theory's spatial visual direction. It includes bloom lighting, metallic rings, orbit trails, particles, pointer parallax, three color environments, and a full-screen navigation menu. The management workspace uses a matching dark theme.

- `/` opens the immersive entrance.
- `/?workspace` opens the management overview directly.
- `/?verify=CERTIFICATE_ID` still opens public verification directly.
- The motion control freezes the scene; system reduced-motion preferences default to a static view.
- Rendering follows the display refresh rate with a capped 1.25 device pixel ratio, skips hidden/offscreen frames, and disposes GPU resources on exit. Without WebGL, a CSS scene fallback preserves the navigation and content.
- The 3D code is lazy-loaded separately; direct management and verification pages do not download Three.js. The visual module is approximately 142 KB gzip and causes a Vite large-chunk advisory, not a build error.

The original backend, signing model, authentication, data privacy, and certificate lifecycle are unchanged.

The entrance includes a native-scroll 3D journey across two chapters. The scene stays pinned as scroll position drives camera depth, credential rotation, lateral movement, and lighting. A critically damped spring retains motion continuity when scrolling reverses. The persistent motion control freezes the scene; reduced-motion mode keeps all chapter content accessible without camera travel. Camera motion guidance was reviewed against CloudAI-X's `threejs-animation` skill (https://github.com/CloudAI-X/threejs-skills/tree/main/skills/threejs-animation).

## Vercel with PostgreSQL

`vercel.json` serves the Vite frontend and routes `/api/*` to `api/index.js`.
With `DATABASE_URL`, the API uses TLS-verified PostgreSQL connections. The
production workspace is private; only verification and administrator login are
public. The database stores certificates, activity, hashed sessions, administrator
password hashes, and shared rate limits. No browser code receives database credentials.

1. Connect a Neon or other PostgreSQL database to the Vercel project.
2. Configure server-only `DATABASE_URL` with `sslmode=require` and a persistent
   `SIGNING_SECRET` (32+ random characters). Never rotate the signing key casually.
3. Run `node --env-file=.env.production.local scripts/migrate.js` using the production
   connection. Migrations run transactionally under a PostgreSQL advisory lock.
4. To enroll the first administrator, set a random `ADMIN_SETUP_TOKEN` (32+ characters)
   and `ADMIN_SETUP_EXPIRES_AT` (Unix milliseconds, normally 24 hours in the future).
   Alternatively, configure `ADMIN_EMAIL` and a bcrypt `ADMIN_PASSWORD_HASH` of cost 12+.
5. Deploy. Open `/?setup#token=YOUR_SETUP_TOKEN` privately to choose your email and password.
   The token stays in the URL fragment and is removed immediately from browser history.
   Enrollment is token-protected, rate-limited, transactional, expires, and works only once.
6. Sign in at `/?workspace`. Issue, verify, export, print, and revoke certificates.
   **Workspace → Change password** invalidates all active sessions.

Without `DATABASE_URL`, Vercel retains a read-only sample fallback and blocks all
writes. The local app still defaults to SQLite with fictional samples.

Security controls include parameterized SQL, validated request bodies, bcrypt
password hashing, eight-hour opaque sessions stored as hashes, HTTPS-only HTTP-only
SameSite cookies in production, same-origin mutation checks, database-backed rate
limits, private registry access, and security headers on the frontend and API.
Certificate signatures include lifecycle fields for newly issued records, so edits
to expiry, recipient details, or revocation metadata fail verification. Legacy
local signatures remain readable; revocation upgrades them to the new format.

## Verification

- `npm test`: API, enrollment, session invalidation, shared rate limiting, integrity,
  and concurrent revocation tests using isolated SQLite databases.
- `node --env-file=.env.production.local --test tests/postgres.test.js`: PostgreSQL
  integration test using a temporary isolated schema. It creates and removes only
  its own test schema. Use the unpooled URL for this schema-isolated test.
- `npm run test:ui`: responsive layouts, accessibility, certificate lifecycle,
  administrator enrollment, and password-change flows.
- `npm run build`: TypeScript and production frontend build.

A passing suite verifies these implemented workflows; it is not a guarantee that
software is free of every defect. Maintain database backups, keep dependencies
updated, and protect the Vercel and database owner accounts.

## Production release

See [PRODUCTION-PLAN.md](PRODUCTION-PLAN.md) for scope and acceptance criteria and [OPERATIONS.md](OPERATIONS.md) for recovery, backups, deployment rollback and operational limits.

- Workspace settings now support institution name and authorised signatory. Certificates snapshot those details when issued; edits do not rewrite existing credentials.
- Administrators can download verified certificate PDFs, review CSV batches of up to 100 records, generate hashed single-use recovery codes, and sign out all sessions.
- Batch issuance is atomic and retries with the same request key return the original result. Duplicate recipients, achievements and issue dates are rejected during batch review and again at commit.
- Encrypted application backups can be restored into an empty target database; sessions are excluded and signatures are checked before committing a restore.
- GitHub Actions runs build, API, browser and dependency checks on Node 24. API errors include request IDs for investigation.

New endpoints: `GET/PUT /api/institution`, `POST /api/certificates/bulk/preview`, `POST /api/certificates/bulk`, `GET /api/certificates/:id/pdf`, `POST /api/recovery-codes`, `POST /api/recover`, and `POST /api/sessions/revoke`. Institution changes, batch issuance, PDF downloads, recovery-code generation and session revocation require administrator access. Recovery is public and rate limited.

## Automated operations

Encrypted offsite backups are stored in private Vercel Blob storage with 30-day retention. GitHub Actions triggers a verified backup daily around 03:17 Asia/Kolkata and checks application/database health and backup freshness every five minutes. These schedules are best effort. GitHub email and web notifications for failed workflows are enabled in the owner's account. See OPERATIONS.md for quotas, recovery-key storage, authenticated downloads and manual job dispatch.
