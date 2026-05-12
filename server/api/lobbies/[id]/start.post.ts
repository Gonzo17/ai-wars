import { createError, defineEventHandler, getRouterParam } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'
import { startLobbyGame } from '~~/server/game/startLobby'
import { SupabaseGameRepository } from '~~/server/game/supabaseRepository'
import { resolveUserId } from '~~/server/utils/resolveUserId'

export default defineEventHandler(async (event) => {
  const userId = await resolveUserId(event)
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const lobbyId = getRouterParam(event, 'id')
  if (!lobbyId) {
    throw createError({ statusCode: 400, statusMessage: 'Lobby id missing' })
  }

  const supabase = serverSupabaseServiceRole(event)
  const repo = new SupabaseGameRepository(supabase)
  return await startLobbyGame(repo, userId, lobbyId)
})
