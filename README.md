# Ganpati CHS — Member & Admin Portal

Document and communication portal for members of **Ganpati Co-operative Housing
Society Ltd.**, Sector 19, Nerul, Navi Mumbai, during redevelopment. Project
management by **Sankalp Project Management Consultants Pvt. Ltd.**

Members sign in with Google, accept the Terms & Conditions, and are approved
individually by the managing committee. Once approved they can read and download
project documents and the full notice board. Administrators approve members,
upload documents, post notices, and review an audit trail of everything that
happens.

---

## Stack

| Concern         | Choice                                                     |
| --------------- | ---------------------------------------------------------- |
| Framework       | Next.js 15 (App Router), TypeScript                        |
| Styling         | Tailwind CSS v4                                            |
| Member auth     | Auth.js (NextAuth v5) — Google OAuth                       |
| Admin auth      | Auth.js Credentials provider, bcrypt hash in the database  |
| Database        | Amazon RDS PostgreSQL (`ganpati-chs-db`, ap-south-1)       |
| DB credentials  | AWS Secrets Manager, fetched at runtime                    |
| ORM             | Prisma 6                                                   |
| File storage    | Amazon S3, private bucket, presigned URLs only             |
| Email           | Amazon SES (SESv2)                                         |
| Hosting         | Vercel                                                     |

---

## How the security model works

A few decisions are load-bearing; changing them will quietly break guarantees.

**Approval is never cached in the token.** Sessions are JWT-based and short
(30 minutes), but role and approval status are re-read from the database in the
Auth.js `session` callback *and* again in `src/lib/guards.ts` at the point of
use. That is what lets an admin approval unlock the portal within seconds, and a
revocation lock it just as fast, without anyone signing out.

**Middleware is not the security boundary.** `src/middleware.ts` only sets
security headers and rejects cross-origin state-changing requests. It performs no
authorization — Prisma cannot run on the edge runtime, and Next.js middleware is
not a reliable place to make access decisions. Every page and API route guards
itself.

**No file is ever public.** The S3 bucket blocks all public access. Downloads go
through `/api/documents/[id]/download`, which re-checks the caller's approved
status and then issues a 5-minute presigned GET. Raw S3 URLs are never sent to a
browser.

**Uploads are verified server-side after the fact.** The browser uploads straight
to S3 with a presigned PUT (so a 300 MB site video never has to pass through a
serverless function), but the server then calls `HeadObject` to read the file's
*real* size and type before writing a database row. A client that lies about its
size gets rejected and the object deleted.

**Admin login is rate limited in the database.** In-memory counters are useless
on Vercel — each invocation can be a fresh process. Failed attempts are recorded
in the `LoginAttempt` table and counted per username *and* per IP.

---

## First-time setup

### 1. Install dependencies

```bash
npm install
```

Requires Node.js 20+ (developed against 24.19.0).

### 2. Create `.env.local`

Copy `.env.example` to `.env.local` and fill in the real values. **Never commit
`.env.local`.** See the variable list in that file — every name is documented
there.

Note that `DATABASE_URL` is deliberately *not* set. The connection string is
built at runtime from the RDS secret named by `DB_SECRET_ARN`
(see `src/lib/getDatabaseUrl.ts`).

Generate the session secret with:

```bash
openssl rand -base64 32
```

### 3. Push the schema and seed

```bash
npm run db:push     # or: npm run db:migrate  (creates a migration)
npm run db:seed     # 21 document categories + Terms & Conditions v1
```

Both go through `scripts/prisma-cli.ts`, which fetches the connection string
from Secrets Manager and passes it to the Prisma CLI as an environment variable
for that process only.

> Your IP must be allowed inbound on the `ganpati-chs-db-sg` security group for
> these to connect.

### 4. Create an administrator

There is no self-signup for admins.

```bash
npm run seed:admin
```

It prompts for a username, email and password (hidden input), enforces a minimum
of 12 characters with letters and digits, and stores a bcrypt hash at cost 12.
Re-running with an existing username offers a password reset.

### 5. Run it

```bash
npm run dev
```

- Public homepage — <http://localhost:3000>
- Member login — <http://localhost:3000/login>
- Admin login — <http://localhost:3000/admin/login>

---

## AWS configuration checklist

### S3 bucket CORS — **required, or uploads fail**

The admin's browser PUTs directly to S3, so the bucket needs a CORS rule. Without
it every upload fails with an opaque network error. Apply
[`docs/s3-cors.json`](docs/s3-cors.json) (replace the placeholder origin):

```
S3 → ganpati-chs-nerul-documents-… → Permissions → CORS → Edit
```

### RDS security group

`ganpati-chs-db-sg` currently allows inbound PostgreSQL (5432) from **one
developer IP only**. Before the Vercel deployment can reach the database you must
either:

- add Vercel's outbound IP ranges to the security group, or
- put the database behind RDS Proxy / connect over a VPC configuration.

The second is the better long-term answer; the first is enough to get a
deployment working. Nothing in the app can work around this.

### SES

`SES_FROM_ADDRESS` must be a **verified identity** in SES. While the account is
in the SES sandbox, every *recipient* must also be verified — request production
access before onboarding real members, or approval emails will silently fail.
Send failures are logged and swallowed by design: a member being approved must
not fail because SES is unhappy.

### IAM

The dedicated `ganpati-chs-app` user needs exactly two customer-managed policies:

- `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on this one bucket
- `secretsmanager:GetSecretValue` on this one secret ARN

Do not widen these. If SES notifications are in use, add `ses:SendEmail` scoped
to the verified identity.

### Backups

Automated backups are currently retained for **1 day** (free tier). Raise this to
7+ days on the RDS *Modify* page once the account is upgraded — no need to
recreate the instance.

---

## Google OAuth

The `Ganpati CHS Portal` project already has an OAuth client with localhost
redirect URIs. Before the first production deploy:

1. Add the production origin `https://<your-vercel-domain>` to **Authorized
   JavaScript origins**.
2. Add `https://<your-vercel-domain>/api/auth/callback/google` to **Authorized
   redirect URIs**. The localhost entries alone will not work once deployed.
3. **Rotate the client secret.** It was briefly shown in a chat during setup.
   Google Cloud Console → Google Auth Platform → Clients → this client → reset
   secret. No redirect URI changes are needed to do this.
4. The consent screen is in **Testing** mode, limited to manually added test
   users. Submit for verification before opening the portal to all society
   members — review can take days to weeks.

---

## Deploying to Vercel

1. Set every variable from `.env.example` in the Vercel project settings.
   `NEXTAUTH_URL` must be the deployed URL.
2. Widen the RDS security group (above) — this is the most common cause of a
   deployment that builds but cannot load any page.
3. Add the production origin to the S3 CORS rule.
4. Run `npm run db:deploy` against production to apply migrations.
5. Create the production administrator with `npm run seed:admin`.

The build runs `prisma generate` before `next build`. Every page and API route is
dynamic, so no database access happens at build time.

---

## Testing the upload pipeline

Category 21, **Test Folder — Automated**, is seeded with
`visibleToMembers: false`. Anything uploaded there is invisible to members and to
the member-facing API, so the full upload → verify → record → download path can
be exercised against production without publishing anything to the society.

---

## Project layout

```
prisma/
  schema.prisma        Data model
  seed.ts              Categories + Terms & Conditions v1
scripts/
  prisma-cli.ts        Prisma CLI wrapper that injects the Secrets Manager URL
  seed-admin.ts        Creates/resets an administrator account
  load-env.ts          .env loading for scripts run outside Next.js
src/
  app/
    page.tsx           Public homepage (hero, notice preview, login buttons)
    login/ terms/ pending/
    portal/            Member area — gated by requireApprovedMemberPage()
    admin/
      login/           Outside the guard
      (protected)/     Route group — everything here requires an admin session
    api/               Route handlers; each guards itself
  components/          UI, all colocated
  lib/
    getDatabaseUrl.ts  Secrets Manager → Postgres connection string
    prisma.ts          Lazy Prisma client with rotation retry
    auth.ts            Auth.js config (Google + admin credentials)
    guards.ts          Authorization — the real security boundary
    s3.ts ses.ts audit.ts rateLimit.ts terms.ts
  middleware.ts        Security headers + CSRF origin check only
```

---

## Not built yet

Deliberate gaps, each left with a `TODO` at the relevant place in the code:

- **PDF watermarking** for sensitive categories (Development Agreement, PMC
  Agreement, Consent Letters, PAAA). The `DocumentCategory.sensitive` flag and
  the hook point in `api/documents/[id]/download` are in place; the stamping
  itself is not implemented.
- **Marathi / Hindi language toggle.** No i18n framework is wired up; all copy is
  currently inline English.
- **Meeting calendar view** tied to Minutes of Meeting uploads.
- **Member query / complaint form** routed to the admin.
- **Weekly email digests** of new documents and notices.
- **S3 lifecycle policy** moving Images and Video Recordings older than 12 months
  to a cheaper storage class — configure in the S3 console, no app change needed.
- **Real-time sync.** The portal polls every 15 seconds (`src/lib/fetcher.ts`),
  which the brief accepts for v1. WebSockets / AppSync subscriptions / Pusher
  would replace `LIVE_SWR_OPTIONS` if that ever feels slow.
- **Committee tier UI.** The `COMMITTEE` role exists and unlocks contact details
  in the member directory, but there is no admin screen to assign it yet — set it
  via `PATCH /api/admin/members/[id]` with `{"role":"COMMITTEE"}` or in Prisma
  Studio.
