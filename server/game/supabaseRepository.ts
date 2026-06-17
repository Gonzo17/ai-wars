import type { SupabaseClient } from '@supabase/supabase-js'
import type { GameRepository, LobbyRow, LobbyPlayerRow, GameRow } from './repository'

export class SupabaseGameRepository implements GameRepository {
  private client: SupabaseClient

  constructor(client: SupabaseClient) {
    this.client = client
  }

  async getLobby(lobbyId: string): Promise<LobbyRow | null> {
    const { data } = await this.client
      .from('lobbies')
      .select('id, status, game_id, host_id')
      .eq('id', lobbyId)
      .maybeSingle()

    return (data as LobbyRow | null) ?? null
  }

  async getLobbyMembership(lobbyId: string, userId: string): Promise<LobbyPlayerRow | null> {
    const { data } = await this.client
      .from('lobby_players')
      .select('lobby_id, user_id, is_host')
      .eq('lobby_id', lobbyId)
      .eq('user_id', userId)
      .maybeSingle()

    return (data as LobbyPlayerRow | null) ?? null
  }

  async listLobbyPlayers(lobbyId: string): Promise<string[]> {
    const { data } = await this.client
      .from('lobby_players')
      .select('user_id')
      .eq('lobby_id', lobbyId)

    return (data ?? []).map(row => row.user_id)
  }

  async listLobbyPlayersDetailed(lobbyId: string): Promise<Array<{ user_id: string, color: string | null }>> {
    const { data } = await this.client
      .from('lobby_players')
      .select('user_id, color')
      .eq('lobby_id', lobbyId)

    return (data ?? []).map(row => ({ user_id: row.user_id as string, color: (row.color as string | null) ?? null }))
  }

  async createGame(createdBy: string): Promise<string> {
    const { data } = await this.client
      .from('games')
      .insert({ created_by: createdBy, status: 'active', turn: 1, phase: 'planning' })
      .select('id')
      .single()

    return data?.id as string
  }

  async addGamePlayers(gameId: string, players: Array<{ userId: string, color: string | null }>): Promise<void> {
    if (players.length === 0) return
    await this.client.from('game_players').insert(
      players.map(p => ({ game_id: gameId, user_id: p.userId, color: p.color }))
    )
  }

  async insertGameState(gameId: string, turn: number, snapshot: GameSnapshot): Promise<void> {
    await this.client.from('game_state').insert({ game_id: gameId, turn, state_json: snapshot })
  }

  async updateLobbyStarted(lobbyId: string, gameId: string, startedAt: string): Promise<void> {
    await this.client
      .from('lobbies')
      .update({ status: 'started', game_id: gameId, started_at: startedAt })
      .eq('id', lobbyId)
  }

  async getGame(gameId: string): Promise<GameRow | null> {
    const { data } = await this.client
      .from('games')
      .select('id, turn, phase, status, resolving_turn')
      .eq('id', gameId)
      .maybeSingle()

    return (data as GameRow | null) ?? null
  }

  async listGamePlayers(gameId: string): Promise<string[]> {
    const { data } = await this.client
      .from('game_players')
      .select('user_id')
      .eq('game_id', gameId)

    return (data ?? []).map(row => row.user_id)
  }

  async listReadyPlayers(gameId: string, turn: number): Promise<string[]> {
    const { data } = await this.client
      .from('game_players')
      .select('user_id')
      .eq('game_id', gameId)
      .eq('ready_turn', turn)

    return (data ?? []).map(row => row.user_id)
  }

  async markPlayerReady(gameId: string, userId: string, turn: number, readyAt: string): Promise<void> {
    await this.client
      .from('game_players')
      .update({ ready_turn: turn, ready_at: readyAt })
      .eq('game_id', gameId)
      .eq('user_id', userId)
  }

  async clearPlayerReady(gameId: string, userId: string): Promise<void> {
    await this.client
      .from('game_players')
      .update({ ready_turn: null, ready_at: null })
      .eq('game_id', gameId)
      .eq('user_id', userId)
  }

  async getGameMembership(gameId: string, userId: string): Promise<{ game_id: string, user_id: string } | null> {
    const { data } = await this.client
      .from('game_players')
      .select('game_id, user_id')
      .eq('game_id', gameId)
      .eq('user_id', userId)
      .maybeSingle()

    return (data as { game_id: string, user_id: string } | null) ?? null
  }

  async getGameState(gameId: string, turn: number): Promise<GameSnapshot | null> {
    const { data } = await this.client
      .from('game_state')
      .select('state_json')
      .eq('game_id', gameId)
      .eq('turn', turn)
      .maybeSingle()

    return (data?.state_json as GameSnapshot | null) ?? null
  }

  async upsertTurnPlan(gameId: string, turn: number, userId: string, plan: TurnPlan, submittedAt: string): Promise<void> {
    await this.client
      .from('turn_plans')
      .upsert(
        {
          game_id: gameId,
          turn,
          user_id: userId,
          plan_json: plan,
          submitted_at: submittedAt
        },
        { onConflict: 'game_id,turn,user_id' }
      )
  }

  async clearTurnPlanSubmission(gameId: string, turn: number, userId: string): Promise<void> {
    await this.client
      .from('turn_plans')
      .update({ submitted_at: null })
      .eq('game_id', gameId)
      .eq('turn', turn)
      .eq('user_id', userId)
  }

  async tryAcquireResolveLock(gameId: string, turn: number): Promise<boolean> {
    const { data } = await this.client
      .from('games')
      .update({ phase: 'resolving', resolving_turn: turn, updated_at: new Date().toISOString() })
      .eq('id', gameId)
      .eq('phase', 'planning')
      .eq('turn', turn)
      .is('resolving_turn', null)
      .select('id')
      .maybeSingle()

    return Boolean(data)
  }

  async releaseResolveLock(gameId: string): Promise<void> {
    await this.client.from('games').update({ phase: 'planning', resolving_turn: null }).eq('id', gameId)
  }

  async listSubmittedPlans(gameId: string, turn: number): Promise<Array<{ user_id: string, plan_json: TurnPlan }>> {
    const { data } = await this.client
      .from('turn_plans')
      .select('user_id, plan_json, submitted_at')
      .eq('game_id', gameId)
      .eq('turn', turn)
      .not('submitted_at', 'is', null)

    return (data ?? []).map(row => ({ user_id: row.user_id, plan_json: row.plan_json as TurnPlan }))
  }

  async updateGameTurn(gameId: string, nextTurn: number): Promise<void> {
    await this.client
      .from('games')
      .update({ turn: nextTurn, phase: 'planning', resolving_turn: null, updated_at: new Date().toISOString() })
      .eq('id', gameId)

    await this.client
      .from('game_players')
      .update({ ready_turn: null, ready_at: null })
      .eq('game_id', gameId)
  }
}
