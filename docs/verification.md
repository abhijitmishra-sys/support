# Verification — 6 October 2026

## Local password login update

- PostgreSQL `support` was backed up before the additive password/session migration; existing users, memberships, and tickets were retained.
- Customer `/login`, staff `/admin/login`, and customer `/register` added. The local password mode ignores the old mock identity cookie.
- Backend unit suite: 11 passed. API integration suite: 49 checks passed using isolated PGlite, including registration role restrictions, invalid credentials, wrong-portal rejection, customer/admin access, expired and revoked sessions, and membership changes.
- Native PostgreSQL + headless Edge browser: customer and staff sign-in, customer ticket creation, staff reply, live customer delivery, private-note isolation, cookie flags, logout, and rejection of the revoked cookie passed without JavaScript errors. Verification tickets were resolved and archived.
- TypeScript, production build, and targeted lint of the new authentication files passed. Existing unrelated lint findings in `support-app.tsx` remain outside this change.
- Password reset, email verification, external email delivery, and production deployment were not added or tested.

## Original implementation checks

- Frontend TypeScript: passed (`node node_modules/typescript/bin/tsc --noEmit`).
- Frontend production build: passed with the Sites build helper.
- Backend unit suite: 10 passed, 0 failed. Covers exact tier clocks, holidays/weekends, DST, invalid calendars, token validity, tenant access, CSV formula protection and queue aging.
- Backend API integration suite: 30 API assertions passed using migrated PostgreSQL engine through PGlite TCP, with Prisma as the real ORM. Covers persisted creation, idempotency, own/other-tenant authorization, private notes, immediate dispatch, human response, optimistic conflicts, resolution summary, feedback/reopen, safe upload, merge, breach dedup, reports, paging, article visibility, mention authorization and socket token creation.
- Initial Prisma migration generated and applied in the integration engine.

PGlite is a development PostgreSQL engine with one connection; this does **not** verify production PostgreSQL multi-connection races. Production PostgreSQL, Redis, native container builds, SMTP/malware providers, browser E2E, load and hosted backend HTTPS/WSS were not available or not exercised. The published Site’s successful deployment does not make the unconfigured backend live. No “production-ready” claim is made.
