import type { GameRepository, LobbyRow, LobbyPlayerRow, GameRow, GamePlayerRow, TurnPlanRow, GameStateRow } from './repository'

type InMemoryData = {
  lobbies: LobbyRow[]
  lobby_players: LobbyPlayerRow[]
  games: GameRow[]
  game_players: GamePlayerRow[]
  turn_plans: TurnPlanRow[]
  game_state: GameStateRow[]
  gameCounter: number
}

type InMemorySeed = Partial<Omit<InMemoryData, 'gameCounter'>> & { gameCounter?: number }

export class InMemoryGameRepository implements GameRepository {
  data: InMemoryData

  constructor(seed?: InMemorySeed) {
    this.data = {
      lobbies: seed?.lobbies ?? [],
      lobby_players: seed?.lobby_players ?? [],
      games: seed?.games ?? [],
      game_players: seed?.game_players ?? [],
      turn_plans: seed?.turn_plans ?? [],
      game_state: seed?.game_state ?? [],
      gameCounter: seed?.gameCounter ?? 1
    }
  }

  async getLobby(lobbyId: string): Promise<LobbyRow | null> {
    return this.data.lobbies.find(lobby => lobby.id === lobbyId) ?? null
  }

  async getLobbyMembership(lobbyId: string, userId: string): Promise<LobbyPlayerRow | null> {
    return this.data.lobby_players.find(row => row.lobby_id === lobbyId && row.user_id === userId) ?? null
  }

  async listLobbyPlayers(lobbyId: string): Promise<string[]> {
    return this.data.lobby_players.filter(row => row.lobby_id === lobbyId).map(row => row.user_id)
  }

  async createGame(createdBy: string): Promise<string> {
    const gameId = `game-${this.data.gameCounter++}`
    this.data.games.push({ id: gameId, created_by: createdBy, status: 'active', turn: 1, phase: 'planning', resolving_turn: null } as GameRow)
    return gameId
  }

  async addGamePlayers(gameId: string, userIds: string[]): Promise<void> {
    for (const userId of userIds) {
      if (!this.data.game_players.some(row => row.game_id === gameId && row.user_id === userId)) {
        this.data.game_players.push({ game_id: gameId, user_id: userId })
      }
    }
  }

  async insertGameState(gameId: string, turn: number, snapshot: GameSnapshot): Promise<void> {
    this.data.game_state.push({ game_id: gameId, turn, state_json: snapshot })
  }

  async updateLobbyStarted(lobbyId: string, gameId: string, startedAt: string): Promise<void> {
    const lobby = this.data.lobbies.find(row => row.id === lobbyId)
    if (lobby) {
      lobby.status = 'started'
      lobby.game_id = gameId
      ;(lobby as LobbyRow & { started_at?: string }).started_at = startedAt
    }
  }

  async getGame(gameId: string): Promise<GameRow | null> {
    return this.data.games.find(game => game.id === gameId) ?? null
  }

  async getGameMembership(gameId: string, userId: string): Promise<GamePlayerRow | null> {
    return this.data.game_players.find(row => row.game_id === gameId && row.user_id === userId) ?? null
  }

  async listGamePlayers(gameId: string): Promise<string[]> {
    return this.data.game_players.filter(row => row.game_id === gameId).map(row => row.user_id)
  }

  async listReadyPlayers(gameId: string, turn: number): Promise<string[]> {
    return this.data.game_players
      .filter(row => row.game_id === gameId && row.ready_turn === turn)
      .map(row => row.user_id)
  }

  async markPlayerReady(gameId: string, userId: string, turn: number, readyAt: string): Promise<void> {
    const row = this.data.game_players.find(item => item.game_id === gameId && item.user_id === userId)
    if (row) {
      row.ready_turn = turn
      row.ready_at = readyAt
    }
  }

  async clearPlayerReady(gameId: string, userId: string): Promise<void> {
    const row = this.data.game_players.find(item => item.game_id === gameId && item.user_id === userId)
    if (row) {
      row.ready_turn = null
      row.ready_at = null
    }
  }

  async getGameState(gameId: string, turn: number): Promise<GameSnapshot | null> {
    return this.data.game_state.find(row => row.game_id === gameId && row.turn === turn)?.state_json ?? null
  }

  async upsertTurnPlan(gameId: string, turn: number, userId: string, plan: TurnPlan, submittedAt: string): Promise<void> {
    const existing = this.data.turn_plans.find(row => row.game_id === gameId && row.turn === turn && row.user_id === userId)
    if (existing) {
      existing.plan_json = plan
      existing.submitted_at = submittedAt
    } else {
      this.data.turn_plans.push({ game_id: gameId, turn, user_id: userId, plan_json: plan, submitted_at: submittedAt })
    }
  }

  async clearTurnPlanSubmission(gameId: string, turn: number, userId: string): Promise<void> {
    const existing = this.data.turn_plans.find(row => row.game_id === gameId && row.turn === turn && row.user_id === userId)
    if (existing) existing.submitted_at = null
  }

  async tryAcquireResolveLock(gameId: string, turn: number): Promise<boolean> {
    const game = this.data.games.find(row => row.id === gameId)
    if (!game) return false
    if (game.phase !== 'planning') return false
    if (game.turn !== turn) return false
    if (game.resolving_turn != null) return false
    game.phase = 'resolving'
    game.resolving_turn = turn
    return true
  }

  async releaseResolveLock(gameId: string): Promise<void> {
    const game = this.data.games.find(row => row.id === gameId)
    if (game) {
      game.phase = 'planning'
      game.resolving_turn = null
    }
  }

  async listSubmittedPlans(gameId: string, turn: number): Promise<Array<{ user_id: string, plan_json: TurnPlan }>> {
    return this.data.turn_plans
      .filter(row => row.game_id === gameId && row.turn === turn && row.submitted_at)
      .map(row => ({ user_id: row.user_id, plan_json: row.plan_json }))
  }

  async updateGameTurn(gameId: string, nextTurn: number): Promise<void> {
    const game = this.data.games.find(row => row.id === gameId)
    if (game) {
      game.turn = nextTurn
      game.phase = 'planning'
      game.resolving_turn = null
    }
    for (const row of this.data.game_players.filter(item => item.game_id === gameId)) {
      row.ready_turn = null
      row.ready_at = null
    }
  }
}
