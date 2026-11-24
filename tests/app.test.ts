import { afterAll, beforeAll, expect, test } from 'bun:test'
import { Miniflare } from 'miniflare'
import { createApp } from '../src/worker/app'
import { currentUser, type Env } from '../src/worker/auth'

const runtime = new Miniflare({
  workers: [
    {
      config: {
        name: 'test-db',
        compatibilityDate: '2026-11-11',
        manifest: {
          mainModule: 'index.js',
          modules: {
            'index.js': {
              type: 'esm',
              contents:
                'export default { fetch() { return new Response("test") } }',
            },
          },
        },
        env: { DB: { type: 'd1', name: 'cvis-test' } },
      },
    },
  ],
  port: 0,
})
let env: Env
beforeAll(async () => {
  const db = await runtime.getD1Database('DB')
  env = {
    DB: db as unknown as D1Database,
    APP_ORIGIN: 'https://app.example.test',
    ASSETS: {
      fetch: async () => new Response('public page'),
    } as unknown as Fetcher,
  }
}, 20_000)
afterAll(() => runtime.dispose())

// This identity seam exists only in the app factory. The Worker entrypoint
// never reads these test headers and always calls the real auth SDK.
const app = createApp(async (request) => {
  const sub = request.headers.get('test-user')
  return sub ? { sub, name: sub } : null
})
const call = (
  path: string,
  user?: string,
  method = 'GET',
  body?: unknown,
  origin = env.APP_ORIGIN!,
) =>
  app.request(
    `https://app.example.test${path}`,
    {
      method,
      headers: {
        ...(user ? { 'test-user': user } : {}),
        Origin: origin,
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    env,
  )

type Data = {
  settings: { displayName: string; theme: Record<string, string>; cycleDay: number }
  categories: { id: string; name: string; kind: string; budget: number }[]
  transactions: { id: string; amount: number; kind: string; categoryName: string }[]
  summary: { income: number; expense: number; savings: number; budgetTotal: number; budgetUsed: number }
}

test('unauthenticated data routes refuse access and public assets remain public', async () => {
  for (const [path, method] of [
    ['/api/data?month=2026-11', 'GET'],
    ['/api/transactions', 'POST'],
    ['/api/categories', 'POST'],
    ['/api/settings', 'PATCH'],
  ]) {
    const response = await call(path!, undefined, method)
    expect(response.status).toBe(401)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  }
  expect(await (await call('/')).text()).toBe('public page')
  expect((await call('/api/health')).status).toBe(200)
})

test('a new account starts with default categories and default theme', async () => {
  const response = await call('/api/data?month=2026-11', 'alice')
  expect(response.status).toBe(200)
  const data = (await response.json()) as Data
  expect(data.categories.length).toBeGreaterThan(0)
  expect(data.categories.some((category) => category.name === 'อาหาร')).toBe(true)
  expect(data.settings.theme.accent).toMatch(/^#[0-9a-f]{6}$/)
  expect(data.summary.income).toBe(0)
  expect(data.summary.expense).toBe(0)
})

test('transactions roll into the monthly summary and stay private per owner', async () => {
  const alice = (await (await call('/api/data?month=2026-11', 'alice')).json()) as Data
  const food = alice.categories.find((category) => category.name === 'อาหาร')!
  const salary = alice.categories.find((category) => category.kind === 'income')!

  const expense = await call('/api/transactions', 'alice', 'POST', {
    kind: 'expense',
    amount: 25_000,
    categoryId: food.id,
    note: ' ข้าวเที่ยง ',
    occurredAt: Date.UTC(2026, 10, 5, 12),
  })
  expect(expense.status).toBe(201)
  const created = (await expense.json()) as { id: string }

  expect(
    (
      await call('/api/transactions', 'alice', 'POST', {
        kind: 'income',
        amount: 100_000,
        categoryId: salary.id,
        note: '',
        occurredAt: Date.UTC(2026, 10, 6, 12),
      })
    ).status,
  ).toBe(201)

  const data = (await (await call('/api/data?month=2026-11', 'alice')).json()) as Data
  expect(data.summary.expense).toBe(25_000)
  expect(data.summary.income).toBe(100_000)
  expect(data.summary.savings).toBe(75_000)
  expect(data.transactions[0]!.categoryName).toBeTruthy()

  const bob = (await (await call('/api/data?month=2026-11', 'bob')).json()) as Data
  expect(bob.transactions).toHaveLength(0)
  expect(
    (await call(`/api/transactions/${created.id}`, 'bob', 'DELETE')).status,
  ).toBe(404)
  expect(
    (
      await call(`/api/transactions/${created.id}`, 'bob', 'PATCH', {
        amount: 1,
      })
    ).status,
  ).toBe(404)

  const updated = await call(`/api/transactions/${created.id}`, 'alice', 'PATCH', {
    amount: 30_000,
  })
  expect(updated.status).toBe(200)
  expect((await call(`/api/transactions/${created.id}`, 'alice', 'DELETE')).status).toBe(200)
})

test('category budgets feed the monthly budget summary', async () => {
  const data = (await (await call('/api/data?month=2027-01', 'alice')).json()) as Data
  const category = data.categories.find((item) => item.kind === 'expense')!
  const patched = await call(`/api/categories/${category.id}`, 'alice', 'PATCH', {
    budget: 300_000,
  })
  expect(patched.status).toBe(200)

  await call('/api/transactions', 'alice', 'POST', {
    kind: 'expense',
    amount: 40_000,
    categoryId: category.id,
    note: '',
    occurredAt: Date.UTC(2027, 0, 10, 12),
  })

  const next = (await (await call('/api/data?month=2027-01', 'alice')).json()) as Data
  expect(next.summary.budgetTotal).toBe(300_000)
  expect(next.summary.budgetUsed).toBe(40_000)

  const added = await call('/api/categories', 'alice', 'POST', {
    name: 'ของขวัญ',
    kind: 'expense',
    budget: 0,
  })
  expect(added.status).toBe(201)
  const created = (await added.json()) as { category: { id: string } }
  expect(
    (await call(`/api/categories/${created.category.id}`, 'alice', 'DELETE')).status,
  ).toBe(200)
})

test('theme and input validation reject malformed values', async () => {
  for (const body of [
    { theme: { accent: 'red', income: '#1b7f6b', expense: '#d81b60', background: '#f7f1ec' } },
    { theme: { accent: '#c2185b' } },
    { cycleDay: 31 },
    { displayName: 'x'.repeat(41) },
    { unknown: true },
  ]) {
    expect((await call('/api/settings', 'alice', 'PATCH', body)).status).toBe(400)
  }
  const saved = await call('/api/settings', 'alice', 'PATCH', {
    displayName: 'นราวิชญ์',
    theme: {
      accent: '#ff0088',
      income: '#0a7d5f',
      expense: '#e0457b',
      background: '#faf7f2',
    },
    cycleDay: 1,
  })
  expect(saved.status).toBe(200)
  expect(((await saved.json()) as { settings: Data['settings'] }).settings.displayName).toBe('นราวิชญ์')

  for (const [path, body] of [
    ['/api/transactions', { kind: 'expense', amount: 0, occurredAt: Date.now() }],
    ['/api/transactions', { kind: 'other', amount: 100, occurredAt: Date.now() }],
    ['/api/transactions', { kind: 'expense', amount: 1.5, occurredAt: Date.now() }],
    ['/api/categories', { name: '', kind: 'expense' }],
    ['/api/categories', { name: 'x'.repeat(41), kind: 'expense' }],
  ] as const) {
    expect((await call(path, 'alice', 'POST', body)).status).toBe(400)
  }
  expect(
    (await call('/api/transactions', 'alice', 'POST', { kind: 'expense', amount: '10' })).status,
  ).toBe(400)
  expect((await call('/api/data?month=2026-13', 'alice')).status).toBe(400)
  expect((await call('/api/data', 'alice')).status).toBe(400)
})

test('rejects foreign and absent origins, and oversized bodies', async () => {
  expect(
    (
      await call(
        '/api/transactions',
        'alice',
        'POST',
        { kind: 'expense', amount: 100 },
        'https://foreign.example',
      )
    ).status,
  ).toBe(403)
  expect(
    (
      await app.request(
        'https://app.example.test/api/transactions',
        { method: 'POST', headers: { 'test-user': 'alice' } },
        env,
      )
    ).status,
  ).toBe(403)
  expect(
    (
      await call('/api/transactions', 'alice', 'POST', {
        kind: 'expense',
        amount: 100,
        note: 'x'.repeat(20_000),
      })
    ).status,
  ).toBe(413)
})

test('missing database reports setup and local preview identity never activates on hosted origins', async () => {
  const noDb = await app.request(
    'https://app.example.test/api/data?month=2026-11',
    { headers: { 'test-user': 'alice' } },
    { ...env, DB: undefined },
  )
  expect(noDb.status).toBe(503)
  expect(
    await currentUser(new Request('https://app.example.test/'), {} as Env),
  ).toBeNull()
  expect(
    await currentUser(new Request('http://localhost:5000/'), {
      APP_ORIGIN: 'https://app.example.test',
    } as Env),
  ).toBeNull()
  expect(
    await currentUser(new Request('http://localhost:5000/'), {} as Env),
  ).toMatchObject({ sub: 'local-preview' })
})
