# Credence production release

Scope: one institution, one administrator, Vercel + Neon PostgreSQL. Preserve the current visual design and 360-degree scroll animation. Existing credentials and certificates remain valid. No email provider or sender domain is currently connected.

## Release sequence and acceptance criteria

1. Certificate delivery: download a real landscape PDF with embedded Unicode fonts, a verification QR code, certificate ID, expiry, and current status. Refuse downloads of invalid records. Snapshot issuer details on issuance so later settings changes cannot rewrite old certificates.
2. Institution settings: editable institution name and authorised signatory. Validate all inputs, expose only public branding, and require administrator access for changes.
3. Bulk issuance: upload CSV (maximum 100 records), preview row errors, detect duplicates, and issue all rows atomically. Persist idempotency keys so a network retry cannot issue the same batch twice. Require explicit review before issuing.
4. Account recovery: administrator generates ten single-use recovery codes after confirming their password. Store only hashes. Recovery changes the password and invalidates every session. Add explicit sign-out-all and preserve the one-time setup lock. Password entry remains the owner's responsibility.
5. Operations: pinned runtime, automated build/API/browser checks, dependency audit, request identifiers, database readiness check, documented rollback, and an encrypted consistent application backup with restore into an empty database. Test restoring records and signatures before shipping. Exclude active sessions and rate limits from backups.
6. Validation: migration twice, existing API/browser suite, dedicated production-feature tests, hosted PostgreSQL concurrency/restore checks in an isolated schema, PDF rendering, and production guest access checks.
7. Release: migrate live schema additively, commit using the owner's identity, push and deploy, verify deployed version and database health. Never change the owner's password or recovery settings while testing.

## Architecture

React workspace → same-origin Express routes → certificate, institution, recovery, and PDF services → PostgreSQL (production) / SQLite (development).

Keep opaque HTTP-only cookie sessions. Recovery material never appears in URLs, logs, or browser storage. Keep signing and backup encryption secrets outside the database. Keep new workflows in small components rather than enlarging the main workspace.

## API and data changes

- GET /api/institution; PUT /api/institution (administrator): name and signatory.
- POST /api/certificates/bulk/preview; POST /api/certificates/bulk (administrator): rows, idempotency key, atomic issuance.
- GET /api/certificates/:id/pdf (administrator): attachment generated from verified record.
- POST /api/recovery-codes (administrator + current password); POST /api/recover (public, rate limited): email, recovery code, new password.
- POST /api/sessions/revoke (administrator + current password): sign out all devices.
- Add issuer snapshot to certificates; add durable issuance_batches. Store public institution and hashed recovery codes in settings.

## UI flow

Workspace settings → edit institution / generate recovery codes / sign out devices.
Certificates → bulk upload → review → issue → open certificate → download PDF.
Sign in → recover account → enter a saved recovery code → choose new password → sign in.

## Operational limits and owner decisions

- No automatic email delivery until a verified sending domain and provider are configured.
- One administrator: staff roles and multi-institution tenancy are a separate release.
- HMAC certificates are server-verified; independent public-key verification is a separate protocol migration.
- Offsite backups and health monitoring now use private Vercel Blob storage and GitHub Actions. See OPERATIONS.md for schedules, retention, notifications and best-effort scheduling limits.
- Restore targets must be empty, never overwrite the live database. Preserve signing key separately and rehearse recovery.
