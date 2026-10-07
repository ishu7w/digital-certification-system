# Credence operations

## Before regular use

1. Workspace → Edit institution details. Verify the institution name and authorised signatory.
2. Workspace → Manage account security → Generate recovery codes. Confirm your password, save all ten codes in a password manager, and keep them private. Codes are single-use; a new set replaces the old set.
3. Issue a test certificate, inspect its downloaded PDF and scan the verification QR code. Revoke the test certificate after checking. Do not put recipient details in a public GitHub issue.
4. Keep owner access to Vercel, GitHub and Neon protected with two-factor authentication. The application currently supports one administrator and password/recovery-code authentication, not application MFA or staff roles.

## Backups and restore rehearsal

The backup script exports a consistent application snapshot, including certificate signatures, audit history, institution settings, hashed administrator credentials, and hashed recovery codes. It excludes sessions and rate limits. AES-256-GCM encrypts the complete payload with a key derived by scrypt. A backup does not contain SIGNING_SECRET. Keep that signing key and the backup encryption key separately in a password manager. Loss of either key prevents recovery.

A local encryption key and an initial encrypted backup are created during this release. They are ignored by Git and deployment uploads. Local backups alone do not survive loss of this computer. Automated offsite backups now run through GitHub Actions and private Vercel Blob storage. The local copy is an additional recovery option.

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

- GitHub Actions checks GET /api/health every five minutes, retries transient failures, and fails if the API/database is unavailable or the last verified offsite backup is older than 36 hours. GitHub web and email notifications for failed workflows are enabled in the owner’s account.
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

Email delivery, multiple staff roles, independently verifiable public-key signatures, require a subsequent configured release. No claim of guaranteed uptime or complete absence of security defects is made.

## Automated offsite backups and monitoring

Selected services: private Vercel Blob storage and GitHub Actions. No additional account or paid subscription was created. The repository is public; no backups or encryption keys are committed or uploaded as workflow artifacts. The encrypted backup is stored in the private `credence-backups` Blob store in iad1. Vercel Blob Hobby quotas still apply; the backup job enforces a 10 MB maximum snapshot to keep 30 daily copies below the included 1 GB storage quota. Other Vercel usage can consume the same account quota.

- Daily backup schedule: 03:17 Asia/Kolkata (21:47 UTC the previous day).
- Health checks: every five minutes, offset by two minutes from the hour. Schedules can be delayed or dropped by GitHub; these are best-effort checks, not an uptime guarantee.
- Retention: 30 days. Old backup files are deleted only after a new upload has been read back, checked against its checksum and decrypted successfully. Unrelated files are never deleted.
- Runtime: Vercel stores BACKUP_ENCRYPTION_KEY and BACKUP_JOB_TOKEN. GitHub stores only the restricted BACKUP_JOB_TOKEN, which can trigger a backup but cannot read one or access the database. Blob access uses the connected store's server credentials.
- Alert route: GitHub Actions email and web notifications, failures only. Existing notification preferences were verified without changing them. Account-wide notification choices also apply to other repositories.

To run either job immediately, use GitHub → Actions → Credence offsite backup / Credence uptime → Run workflow. Check the job result after dispatch. A successful backup must be present in Blob storage and `lastSuccessAt` must advance in `/api/health`; a started workflow is not proof of a completed backup.

To recover, download an encrypted `.enc` file from the private Blob store through the authenticated Vercel dashboard or `vercel blob get`. Supply the original signing key and `.backup-encryption-key` and restore into an empty PostgreSQL database using the earlier instructions. A rehearsal with the actual downloaded offsite file was performed during setup. Keep the signing key and encryption key in your password manager; GitHub does not hold those recovery keys.

References: [Vercel private Blob storage](https://vercel.com/docs/vercel-blob/private-storage), [Blob usage and pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing), [GitHub scheduling limits](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows), [Actions notification preferences](https://docs.github.com/en/subscriptions-and-notifications/how-tos/managing-github-actions-notifications).

## Account security and staff

In Workspace, first generate and save recovery codes in a password manager, then select Two-factor authentication. Scan the QR code with an authenticator app and enter a fresh code to finish. Enabling or removing MFA signs out all devices. Security changes require the current password and, once enabled, a new authenticator code. Recovery consumes one saved code, changes the password, disables the lost authenticator and signs out all sessions. Enroll the replacement authenticator after recovery. Never put enrollment keys, invitation links, passwords or recovery codes in source control or chat.

The existing owner remains administrator. Staff issuers submit requests; reviewers approve or reject them; users cannot review their own submissions. Invitations expire after 24 hours and can be used only once. Suspending staff or changing their role revokes their sessions. Reset access creates a new private invitation and revokes the previous password and sessions. Staff password recovery is handled by the owner through Reset access. Administrator MFA does not currently enroll staff authenticators.

Corrections use review requests with the original certificate ID and reason. Approval creates a new signed certificate and revokes the original in one transaction. Review records retain both IDs. Administrator direct and CSV issuance remain available.

## Branding

Workspace institution settings accept PNG logos below 48 KB, at most 2048 pixels per side, and classic or modern certificate styles. New certificates snapshot the issuer and immutable logo hash. Logo data is deduplicated and retained in encrypted backups. Later branding changes cannot rewrite older certificates. A modified logo asset fails the PDF integrity check.

## Email activation and delivery

Provider: Resend. Live email is not activated until a sender domain under the owner's control is verified. Set production RESEND_API_KEY, EMAIL_FROM and RESEND_WEBHOOK_SECRET securely in Vercel. Register https://digital-certification-system-mu.vercel.app/api/email/webhook for email.delivered, email.bounced, email.complained, email.delivery_delayed and email.failed; the app validates the signed raw request and deduplicates callbacks.

Then generate a separate random EMAIL_JOB_TOKEN of at least 32 characters and set it in Vercel and GitHub Actions secrets. The delivery workflow runs every five minutes and processes one eligible email per run. It skips processing until this token is configured. GitHub scheduling is best effort. Owners can also queue and process an email from Workspace → Email delivery.

Only active certificates can be emailed. Each certificate has one durable delivery record, with a stable attached PDF and provider request key. Retries use bounded backoff, maximum five attempts, and stop before the provider's 24-hour idempotency window expires. Held jobs require provider reconciliation; do not blindly resend an ambiguous delivery. Accepted messages show Sent; only a signed delivery callback marks Delivered. Bounces and complaints take precedence over late delivery events.

Encrypted backups now include staff, reviews, audit, logo assets, delivery history and signed-event receipts. Restoring holds queued or retrying mail so disaster recovery cannot trigger old email sends. Reconcile held records with the provider before any manual resend.

### Rollback across the staff release

Version 1.3 keeps the original sessions table compatible by storing staff identities in a separate cascading session_principals table. Existing owner sessions remain valid during this additive migration. Before reverting to a release earlier than 1.3, revoke ALL sessions in the database: earlier releases treat every session as an administrator session and do not understand staff permissions or MFA. Do not roll back a configured MFA account to a version that lacks MFA without disabling sign-in or implementing the corresponding security fix first. Prefer a forward fix for authentication changes. Keep the expanded database tables and backups; never drop them to perform a code rollback.
