import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'
import { unsubmitTurn } from '~~/server/game/turn'
import { SupabaseGameRepository } from '~~/server/game/supabaseRepository'
import { resolveUserId } from '~~/server/utils/resolveUserId'

export default defineEventHandler(async (event) => {
  const userId = await resolveUserId(event)
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const gameId = getRouterParam(event, 'id')
  if (!gameId) {
    throw createError({ statusCode: 400, statusMessage: 'Game id missing' })
  }

  const body = await readBody<{ turn?: number }>(event)
  if (!body?.turn) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid body' })
  }

  const supabase = serverSupabaseServiceRole(event)
  const repo = new SupabaseGameRepository(supabase)
  return await unsubmitTurn(repo, userId, gameId, body.turn)
})
