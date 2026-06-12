import { getHeader } from 'h3'
import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import type { H3Event } from 'h3'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Dev-only bypass: when running `pnpm dev` with NUXT_DEV_TEST_MODE=true,
// requests carrying `x-test-user-id: <uuid>` resolve directly to that user.
// Gated by `import.meta.dev` so it is statically dead code in production builds.
function resolveTestUserId(event: H3Event): string | null {
  if (!import.meta.dev) return null
  if (process.env.NUXT_DEV_TEST_MODE !== 'true') return null
  const header = getHeader(event, 'x-test-user-id')
  if (!header) return null
  return UUID_RE.test(header) ? header : null
}

export async function resolveUserId(event: H3Event): Promise<string | null> {
  const testUserId = resolveTestUserId(event)
  if (testUserId) return testUserId

  const user = await serverSupabaseUser(event)
  if (user?.id) return user.id

  const authHeader = getHeader(event, 'authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null
  if (!token) return null

  const adminClient = serverSupabaseServiceRole(event)
  const { data } = await adminClient.auth.getUser(token)
  return data.user?.id ?? null
}
