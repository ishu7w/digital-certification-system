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
