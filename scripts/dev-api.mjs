import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/**
 * Serves the Vercel functions in ./api during local development, so the
 * Google + OTP flow can be exercised without deploying.
 *
 * `CVIS_DEV_OTP=1` makes /api/auth/otp/send return the code instead of mailing
 * it; Vercel never sets that variable.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const envFile = join(root, '.env.local')
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line)
    if (!match) continue
    const value = match[2].trim().replace(/^["']|["']$/g, '')
    if (process.env[match[1]] === undefined) process.env[match[1]] = value
  }
}
process.env.CVIS_DEV_OTP = '1'

const port = Number(process.env.CVIS_API_PORT || 3001)

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${port}`)
  if (!url.pathname.startsWith('/api/')) {
    res.statusCode = 404
    res.end('not found')
    return
  }

  const route = url.pathname.replace(/^\/api\//, '').replace(/\/+$/, '')
  const file = join(root, 'api', `${route}.js`)
  if (!route || route.includes('..') || !existsSync(file)) {
    res.statusCode = 404
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: 'ไม่พบ endpoint นี้' }))
    return
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    let raw = ''
    for await (const chunk of req) raw += chunk
    if (raw) {
      try {
        req.body = JSON.parse(raw)
      } catch {
        req.body = {}
      }
    }
  }

  try {
    const module = await import(`${pathToFileURL(file).href}?t=${Date.now()}`)
    await module.default(req, res)
  } catch (error) {
    console.error(`${req.method} /api/${route} failed`, error)
    if (!res.writableEnded) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
        }),
      )
    }
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Cvis auth API ready on http://127.0.0.1:${port}`)
})
