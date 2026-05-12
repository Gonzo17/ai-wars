import { getHeader } from 'h3'
import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import type { H3Event } from 'h3'

export async function resolveUserId(event: H3Event): Promise<string | null> {
  const user = await serverSupabaseUser(event)
  if (user?.id) return user.id

  const authHeader = getHeader(event, 'authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null
  if (!token) return null

  const adminClient = serverSupabaseServiceRole(event)
  const { data } = await adminClient.auth.getUser(token)
  return data.user?.id ?? null
}
