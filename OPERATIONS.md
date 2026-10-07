# Credence operations

## Before regular use

1. Workspace → Edit institution details. Verify the institution name and authorised signatory.
2. Workspace → Manage account security → Generate recovery codes. Confirm your password, save all ten codes in a password manager, and keep them private. Codes are single-use; a new set replaces the old set.
3. Issue a test certificate, inspect its downloaded PDF and scan the verification QR code. Revoke the test certificate after checking. Do not put recipient details in a public GitHub issue.
4. Keep owner access to Vercel, GitHub and Neon protected with two-factor authentication. The application currently supports one administrator and password/recovery-code authentication, not application MFA or staff roles.

## Backups and restore rehearsal

The backup script exports a consistent application snapshot, including certificate signatures, audit history, institution settings, hashed administrator credentials, and hashed recovery codes. It excludes sessions and rate limits. AES-256-GCM encrypts the complete payload with a key derived by scrypt. A backup does not contain SIGNING_SECRET. Keep that signing key and the backup encryption key separately in a password manager. Loss of either key prevents recovery.

A local encryption key and an initial encrypted backup are created during this release. They are ignored by Git and deployment uploads. Local backups alone do not survive loss of this computer. Choose an offsite storage destination and a schedule before relying on this service for critical records.

Create a backup (does not overwrite an existing file):

```sh
node --env-file=.env.production.local scripts/backup.js create backups/credence-backup.enc .backup-encryption-key
```

To restore, prepare a **new empty database**, supply its DATABASE_URL in a separate private environment file, and supply the **original SIGNING_SECRET**. Never point recovery at the current production database. The script refuses a nonempty target and checks every restored signature transactionally.

```sh
node --env-file=.env.restore.local scripts/backup.js restore backups/credence-backup.enc .backup-encryption-key
```

Only switch Vercel DATABASE_URL after checking record counts, verification and administrator access on the restored database. Restored sessions are empty: sign in again. Neon also offers database restore facilities; check the account's actual retention and plan before relying on them.

## Monitoring and incidents

- GET /api/health confirms the API can query PostgreSQL. An external monitor must be configured with this URL and a destination for alerts; this release does not silently create a subscription.
- API errors receive X-Request-ID. Use that identifier to locate a failed request in Vercel logs. Logs omit request bodies, passwords and connection strings.
- Sign out all devices after suspected session theft. Change password if credentials are exposed; generate a new set of recovery codes if those are exposed.
- If SIGNING_SECRET is exposed, stop issuing credentials and plan an explicit re-signing migration. Replacing it without a migration invalidates old certificates.
- Keep dependencies updated; CI audits production and development dependencies and runs build/API/browser checks.

## Deployment and rollback

Production uses Node 24, same-origin API requests and TLS-verified PostgreSQL connections. PUBLIC_ORIGIN fixes the origin encoded into verification QR codes. Additive migrations preserve certificates and administrator settings. Run migrations before deployment; run them a second time to check repeatability.

Vercel deployment rollback changes application code, not database records. If a deployment fails, use Vercel to restore the previous known-good deployment and investigate request IDs. Never restore a database just to roll back a frontend change. Remove the expired ADMIN_SETUP_TOKEN and ADMIN_SETUP_EXPIRES_AT after enrollment.

## Capacity and scope

Bulk import is limited to 100 rows and 100 KB. Issue dates and duplicates are checked again during the committing transaction. Saved batch request keys make network retries return the original batch. Certificate and activity lists are intended for a small institution; introduce server pagination before a large registry. Public verification reveals recipient name, achievement and revocation reason to holders of the certificate ID.

Downloaded PDFs contain a status snapshot; the QR code resolves the current state. PDF downloads currently support the embedded Noto Sans, Devanagari and Gujarati character sets. If a name uses an unsupported script, use the browser's Print / save PDF action, which uses system font fallback. Invalid records cannot be downloaded as PDFs.

Email delivery, multiple staff roles, independently verifiable public-key signatures, and managed external monitoring/backups require a subsequent configured release. No claim of guaranteed uptime or complete absence of security defects is made.
