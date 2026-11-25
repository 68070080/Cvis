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
