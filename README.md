# Cvis

A Thai, mobile-first app for money, food and health, workouts and daily
planning. Every record lives in IndexedDB in the browser — there is no user
database on the server. The app is opened by signing in to an account created
in this browser; the e-mail and password are checked locally and nothing is sent
anywhere.

## Run locally

```sh
npm install
npm run dev                # Vite on http://127.0.0.1:5173
```

`npm run typecheck` and `npm run build` (output in `dist/`) are the checks. The
build is fully static and needs no environment variables and no API.

## Accounts

Creating an account asks for an e-mail and a password (8+ characters). The
account — e-mail, salt and a PBKDF2-SHA256 verifier — is stored in IndexedDB
beside the data it protects, and is deliberately left out of the JSON backup.
Signing in checks the password in the browser, on every load of the app.
"ลืมรหัสผ่าน?" sets a new password for the account on this device; data is
untouched.

There is no e-mail verification and no mailbox involved: the address is only a
label for the local account, so no sender domain, API key or other service is
needed.

## Deploy

The Vercel project `cvis-68070080` is connected to this repository, so a push
to `main` builds and deploys production automatically. Vite produces the static
site in `dist/`.

## Layout

- `src/client/` — React UI and the IndexedDB layer (`localstore.ts`,
  `localapi.ts`, `account.ts`, `backup.ts`, `LoginView.tsx`).
- `src/shared/types.ts` — types shared by the UI.
- `src/worker/`, `wrangler.jsonc`, `deploy.json` — an earlier Cloudflare Worker
  version kept for reference; the app no longer uses them.
