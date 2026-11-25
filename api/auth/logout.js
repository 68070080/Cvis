import {
  CHALLENGE_COOKIE,
  PENDING_COOKIE,
  SESSION_COOKIE,
  clearCookie,
  json,
  methodNotAllowed,
} from '../_lib/auth.js'

/** Clears the session and any half-finished login step. */
export default function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST')
  clearCookie(req, res, SESSION_COOKIE)
  clearCookie(req, res, CHALLENGE_COOKIE)
  clearCookie(req, res, PENDING_COOKIE)
  return json(res, 200, { authenticated: false })
}
