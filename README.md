# Cvis

A Thai, mobile-first app for money, food and health, workouts and daily
planning. Every record lives in IndexedDB in the browser — there is no user
database. Signing in with Google plus a one-time code from e-mail opens the
app; the data it shows is always the current browser's.

## Run locally

```sh
npm install
node scripts/dev-api.mjs   # auth endpoints on http://127.0.0.1:3001
npm run dev                # Vite on http://127.0.0.1:5173 (proxies /api)
```

`npm run typecheck` and `npm run build` (output in `dist/`) are the checks.
`scripts/dev-api.mjs` sets `CVIS_DEV_OTP=1`, so the OTP is printed on the login
screen instead of being mailed; Vercel never sets that variable.

## Sign-in setup

The app is behind Google sign-in followed by an e-mail OTP. Required
environment variables (see `.env.example`):

| Variable | Where it comes from |
| --- | --- |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Cloud Console → Credentials → OAuth client ID (Web application) |
| `RESEND_API_KEY`, `RESEND_FROM` | resend.com API key, and a sender address/domain verified there |
| `AUTH_SECRET` | Random 32+ character secret used to sign the session cookie |

Authorised redirect URIs for the Google client:

- `http://localhost:5173/api/auth/google/callback`
- `https://cvis-68070080.vercel.app/api/auth/google/callback`

## Deploy

The Vercel project `cvis-68070080` is connected to this repository, so a push
to `main` builds and deploys production automatically. Vite produces the static
site in `dist/`, and the functions in `api/` serve `/api/auth/*`; both are
deployed from the same commit.

## Layout

- `src/client/` — React UI and the IndexedDB layer (`localstore.ts`,
  `localapi.ts`, `backup.ts`, `auth.ts`, `LoginView.tsx`).
- `src/shared/types.ts` — types shared by the UI.
- `api/` — Vercel functions: Google OAuth, OTP send/verify, session, logout.
- `src/worker/`, `wrangler.jsonc`, `deploy.json` — an earlier Cloudflare Worker
  version kept for reference; the app no longer uses them.
