// Seed two known test users (alice, bob) into the local Supabase instance.
// Idempotent: re-running is safe and prints the same IDs.
//
// Reads from .env:
//   SUPABASE_URL        — local Supabase API URL (http://127.0.0.1:54321)
//   SUPABASE_SECRET_KEY — local service-role key (from `pnpm supabase status`)
//
// Zero-dep: uses fetch() directly against the Supabase Admin REST API.
//
// Output: one JSON line per user with id + email + password, plus a
// ready-to-paste hint for enabling dev-mode bypass.

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

// Tiny .env loader (no dep needed). Tolerates `#` comments and quoted values.
function loadDotEnv(path) {
  if (!existsSync(path)) return
  const raw = readFileSync(path, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}

loadDotEnv(resolve(repoRoot, '.env'))

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('[seed] Missing SUPABASE_URL or SUPABASE_SECRET_KEY in .env')
  console.error('[seed] Run `pnpm supabase status` to print local keys and copy them into .env')
  process.exit(1)
}

if (!SUPABASE_URL.includes('127.0.0.1') && !SUPABASE_URL.includes('localhost')) {
  console.error(`[seed] Refusing to seed against non-local Supabase URL: ${SUPABASE_URL}`)
  console.error('[seed] This script only runs against http://127.0.0.1:54321')
  process.exit(1)
}

const TEST_PASSWORD = 'test-password-1234'
const USERS = [
  { email: 'alice@test.local', username: 'alice' },
  { email: 'bob@test.local', username: 'bob' }
]

const headers = {
  'apikey': SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json'
}

async function adminRequest(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers ?? {}) }
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status} ${res.statusText}\n${body}`)
  }
  // PostgREST with `Prefer: return=minimal` returns 201 with empty body;
  // Admin Auth typically returns JSON. Read as text and parse only if non-empty.
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

async function findUserByEmail(email) {
  // The admin API doesn't expose "get by email" directly; list and filter.
  // Test fixtures are tiny so one page suffices.
  const data = await adminRequest('/auth/v1/admin/users?page=1&per_page=200')
  return (data.users ?? []).find(u => u.email === email) ?? null
}

async function upsertUser({ email, username }) {
  let user = await findUserByEmail(email)

  if (!user) {
    user = await adminRequest('/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password: TEST_PASSWORD,
        email_confirm: true,
        user_metadata: { username }
      })
    })
    console.log(`[seed] Created  ${email} → ${user.id}`)
  } else {
    // Reset password to the known fixture value so login is deterministic.
    await adminRequest(`/auth/v1/admin/users/${user.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        password: TEST_PASSWORD,
        email_confirm: true
      })
    })
    console.log(`[seed] Existing ${email} → ${user.id} (password reset)`)
  }

  // Upsert profile via PostgREST with merge-duplicates so re-runs don't conflict.
  await adminRequest('/rest/v1/profiles', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: user.id, username })
  })

  return { id: user.id, email, username }
}

const results = []
for (const u of USERS) {
  results.push(await upsertUser(u))
}

console.log('')
console.log('[seed] Done. Test users:')
for (const r of results) {
  console.log(JSON.stringify({ ...r, password: TEST_PASSWORD }))
}

console.log('')
console.log('[seed] To enable dev-mode bypass in the Nuxt server:')
console.log('  bash:        NUXT_DEV_TEST_MODE=true pnpm dev')
console.log('  PowerShell:  $env:NUXT_DEV_TEST_MODE=\'true\'; pnpm dev')
console.log('')
console.log('[seed] Then either pass header `x-test-user-id: <id>` on API requests,')
console.log('       or log in normally with alice@test.local / bob@test.local')
console.log('       (password:', TEST_PASSWORD + ')')
