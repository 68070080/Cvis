# Cvis

A Thai, mobile-first app for money, food and health, workouts and daily
planning. Every record lives in IndexedDB in the browser — there is no user
database on the server. The app is opened by signing in to an account created
in this browser; the password is checked locally and the e-mail is confirmed
once with a one-time code.

## Run locally

```sh
npm install
node scripts/dev-api.mjs   # auth endpoints on http://127.0.0.1:3001
npm run dev                # Vite on http://127.0.0.1:5173 (proxies /api)
```

`npm run typecheck` and `npm run build` (output in `dist/`) are the checks.
`scripts/dev-api.mjs` sets `CVIS_DEV_OTP=1`, so the OTP is printed on the sign-up
screen instead of being mailed; Vercel never sets that variable.

## Accounts

Creating an account asks for an e-mail and a password (8+ characters), then
mails a six-digit code to that address. The account — e-mail, salt and a
PBKDF2-SHA256 verifier — is stored in IndexedDB beside the data it protects, and
is deliberately left out of the JSON backup. Signing in checks the password in
the browser. "ลืมรหัสผ่าน?" verifies the address again with a new code and then
sets a new password.

Nothing about the account is stored on the server: the functions only mail the
code and confirm it. Required environment variables (see `.env.example`):

| Variable | Where it comes from |
| --- | --- |
| `RESEND_API_KEY`, `RESEND_FROM` | resend.com API key, and a sender address/domain verified there |
| `AUTH_SECRET` | Random 32+ character secret used to sign the OTP cookie |

## Sender domain (Resend)

Until a domain is verified in Resend, the account may only mail its own address.
The Resend account behind this project was created with
**68070080@kmitl.ac.th**, and `RESEND_FROM` is still the shared test sender
`Cvis <onboarding@resend.dev>`. Resend therefore accepts a code only when it is
sent to `68070080@kmitl.ac.th`; every other address fails with
`403` ("You can only send testing emails to your own email address …"), which
`/api/auth/otp/send` reports as `502`. In practice only that one address can
create an account today.

To mail real users, verify a domain and send from it:

1. Open resend.com → **Domains** → **Add Domain** and enter a domain you own.
2. Add the DNS records Resend shows (SPF `TXT`/`MX`, `DKIM` `TXT`, and the
   `DMARC` record) at your DNS provider.
3. Wait for the domain to show **Verified** in Resend.
4. In the Vercel project `cvis-68070080` → **Settings → Environment Variables**,
   change `RESEND_FROM` to an address on that domain, e.g.
   `Cvis <noreply@yourdomain.com>`, for Production, Preview and Development.
5. Redeploy so the functions pick up the new value — an empty commit pushed to
   `main` is enough:
   ```sh
   git commit --allow-empty -m "Send OTP mail from the verified domain"
   git push origin main
   ```
6. Check with a real address:
   ```sh
   curl -i -X POST https://cvis-68070080.vercel.app/api/auth/otp/send \
     -H 'Content-Type: application/json' -d '{"email":"you@example.com"}'
   ```
   A `200 {"ok":true,…}` and an entry in resend.com → **Emails** means the sender
   domain is accepted. Resend still rejects a `422` for placeholder domains such
   as `example.com`, so test with a mailbox that exists.

`RESEND_API_KEY` itself needs nothing beyond **Sending access**; a restricted key
that is scoped to one domain also stops working if `RESEND_FROM` uses another.

## Deploy

The Vercel project `cvis-68070080` is connected to this repository, so a push
to `main` builds and deploys production automatically. Vite produces the static
site in `dist/`, and the functions in `api/` serve `/api/auth/*`; both are
deployed from the same commit.

## Layout

- `src/client/` — React UI and the IndexedDB layer (`localstore.ts`,
  `localapi.ts`, `account.ts`, `backup.ts`, `auth.ts`, `LoginView.tsx`).
- `src/shared/types.ts` — types shared by the UI.
- `api/` — Vercel functions: OTP send/verify for account verification.
- `src/worker/`, `wrangler.jsonc`, `deploy.json` — an earlier Cloudflare Worker
  version kept for reference; the app no longer uses them.
