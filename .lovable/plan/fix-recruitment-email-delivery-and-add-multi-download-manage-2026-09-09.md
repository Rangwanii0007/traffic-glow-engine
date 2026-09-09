# Fix recruitment email delivery and add multi-download management

## Recruitment email fix
- Keep recruitment email delivery in the existing secure server-only flow and preserve the outbox/history.
- Treat `RESEND_API_KEY` as the only required secret and use the fixed verified sender `AD4YOU Team <team@ad4you.click>` instead of requiring `EMAIL_FROM`.
- Keep new outbox rows `queued` when configuration is missing; mark them `sent` only after Resend accepts the request, or `failed` with Resend's exact safe response when delivery is rejected.
- Add an authenticated owner-only “Send test email” action in Recruitment → Emails, using the same Resend sender and outbox delivery path.
- Keep retry support for queued and failed messages.

## Multiple download options
- Extend the existing bot version records with an admin-defined title, active state, and display order while preserving version, platform, URL, notes, and latest/old indicators.
- Update the admin Versions page so admins can create, edit, order, activate, and delete multiple Windows/iOS/other download links.
- Replace the single global download button on the public Download page and Location section with active download options from the existing versions data.
- Subscribe those public views to version changes so admin additions and edits appear immediately.

## Validation
- Verify the email configuration through the server path without exposing the API key, and confirm queued/sent/failed transitions.
- Verify admin changes appear on both public download surfaces and that each enabled link works.

## Technical details
- Add an idempotent database migration for the new `bot_versions` metadata and realtime publication membership; preserve existing RLS and admin-only writes.
- No fake delivery, browser-side API key, sample records, or unrelated changes.
