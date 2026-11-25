import { get, writeAll } from './localstore'

/** The one account for this browser: an e-mail and its password verifier. */
export type LocalAccount = {
  email: string
  salt: string
  hash: string
  iterations: number
  createdAt: number
  verifiedAt: number
}

const RECORD_KEY = 'account'
const ITERATIONS = 210_000

/** Password rule shared by the sign-up form and the reset form. */
export const MIN_PASSWORD = 8

export const normalizeEmail = (email: string) => email.trim().toLowerCase()

export const isEmail = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())

const toBase64 = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const text = value.replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(text + '='.repeat((4 - (text.length % 4)) % 4))
  const bytes = new Uint8Array(raw.length)
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index)
  }
  return bytes
}

function subtle(): SubtleCrypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error(
      'เบราว์เซอร์นี้ไม่รองรับการเข้ารหัสรหัสผ่าน — เปิดผ่าน https หรือ localhost',
    )
  }
  return globalThis.crypto.subtle
}

async function derive(password: string, salt: string, iterations: number) {
  const key = await subtle().importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await subtle().deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(salt), iterations },
    key,
    256,
  )
  return toBase64(new Uint8Array(bits))
}

export async function readAccount(): Promise<LocalAccount | null> {
  const record = await get<{ key: string; value: LocalAccount }>(
    'meta',
    RECORD_KEY,
  )
  return record?.value ?? null
}

/**
 * Stores the account, or replaces its password when the address was just
 * verified again. The record lives in IndexedDB next to the data it protects
 * and is deliberately left out of the JSON backup.
 */
export async function saveAccount(
  email: string,
  password: string,
): Promise<LocalAccount> {
  const salt = toBase64(crypto.getRandomValues(new Uint8Array(16)))
  const now = Date.now()
  const account: LocalAccount = {
    email: normalizeEmail(email),
    salt,
    hash: await derive(password, salt, ITERATIONS),
    iterations: ITERATIONS,
    createdAt: now,
    verifiedAt: now,
  }
  await writeAll([
    { type: 'put', store: 'meta', value: { key: RECORD_KEY, value: account } },
  ])
  return account
}

export async function passwordMatches(
  account: LocalAccount,
  password: string,
): Promise<boolean> {
  const expected = await derive(
    password,
    account.salt,
    account.iterations || ITERATIONS,
  )
  const left = new TextEncoder().encode(expected)
  const right = new TextEncoder().encode(account.hash)
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index]
  }
  return difference === 0
}
