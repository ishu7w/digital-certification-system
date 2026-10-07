# Complete production roadmap

Preserve the current design, animation, owner account and signed certificates. Extend the existing React / Express / PostgreSQL application rather than replace it.

1. Account security: authenticator TOTP enrollment, password confirmation, encrypted secrets, replay prevention, login verification, safe removal and recovery. Test invalid, expired and reused codes.
2. Staff: individual accounts, administrator / issuer / reviewer permissions, one-time invitation acceptance, account suspension, session revocation, attribution. Preserve the owner as administrator.
3. Review: validated drafts, reviewer approval/rejection, separation of duties, transactional issuance and immutable linked correction history. Existing issued records remain valid.
4. Branding: validated logo uploads and a small set of PDF templates. Snapshot branding at issuance and keep existing certificate signatures compatible.
5. Delivery: durable email outbox, idempotent sending, delivery history, bounded retries and signed provider callbacks. Live sending requires a verified sender domain and provider credentials.
6. Operations: extend encrypted backups to new data; test old backup compatibility, hosted migrations, authorization boundaries, browser flows, dependency audit and deployment health.

Architecture: workspace components → same-origin API → authorization and workflow services → hosted PostgreSQL. Existing private Vercel Blob and restricted scheduled jobs remain available for operational tasks.

UI: Workspace gains staff and account security tools; Certificates gains review requests and correction actions. All forms provide validation, clear success/error states, keyboard access and responsive layouts.

Release acceptance: each feature must have a usable UI and API, enforce authorization on the server, survive restart and backup restore, and pass meaningful tests. Never report sender setup or owner MFA enrollment as complete until the owner has completed the required personal steps.

## Implemented release

- Administrator authenticator MFA, enrollment QR/manual key, encrypted secret, replay prevention, password and authenticator confirmation for security changes, single-use recovery codes.
- Staff issuer/reviewer accounts, 24-hour single-use invitations, suspension, role changes, owner-assisted reset access and personal password changes. Staff account recovery is through the owner. MFA currently protects the administrator account.
- Review requests, separation of duties, atomic approval, concurrent approval protection, rejection notes, replacement links and retained originals. Administrator direct issuance and CSV issuance remain available.
- Institution PNG logos and classic/modern PDF styles. Logo assets are deduplicated, immutable by hash and included in encrypted backups; old issuer snapshots remain unchanged.
- Email queue, stable PDF attachments, provider idempotency, bounded backoff, signed callback validation, delivery/bounce/complaint states and retry controls. Scheduled processing is prepared but awaits provider credentials and a verified sending domain. No live recipient email has been sent or claimed delivered.
- Backups include staff, review, audit, delivery and branding records. Older backups remain restorable. Restored pending emails are held to prevent unintended resends.

## Owner activation

Enable administrator MFA yourself in Workspace after saving recovery codes. Add real staff through invitations. Email delivery requires a domain you control, a Resend account/API key, verified EMAIL_FROM address and webhook signing secret. Activate EMAIL_JOB_TOKEN in both Vercel and GitHub only after the provider is configured. The live Vercel subdomain cannot be used as a verified sending domain.
