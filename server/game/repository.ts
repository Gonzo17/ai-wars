export type LobbyRow = {
  id: string
  name?: string
  status: string
  game_id: string | null
  host_id: string | null
  started_at?: string
}

export type LobbyPlayerRow = {
  lobby_id: string
  user_id: string
  is_host?: boolean
}

export type GameRow = {
  id: string
  created_by?: string
  turn: number
  phase: string
  status: string
  resolving_turn?: number | null
}

export type GamePlayerRow = {
  game_id: string
  user_id: string
  ready_turn?: number | null
  ready_at?: string | null
}

export type TurnPlanRow = {
  game_id: string
  turn: number
  user_id: string
  plan_json: TurnPlan
  submitted_at: string | null
}

export type GameStateRow = {
  game_id: string
  turn: number
  state_json: GameSnapshot
}

export interface GameRepository {
  getLobby(lobbyId: string): Promise<LobbyRow | null>
  getLobbyMembership(lobbyId: string, userId: string): Promise<LobbyPlayerRow | null>
  listLobbyPlayers(lobbyId: string): Promise<string[]>
  createGame(createdBy: string): Promise<string>
  addGamePlayers(gameId: string, userIds: string[]): Promise<void>
  insertGameState(gameId: string, turn: number, snapshot: GameSnapshot): Promise<void>
  updateLobbyStarted(lobbyId: string, gameId: string, startedAt: string): Promise<void>

  getGame(gameId: string): Promise<GameRow | null>
  getGameMembership(gameId: string, userId: string): Promise<GamePlayerRow | null>
  listGamePlayers(gameId: string): Promise<string[]>
  listReadyPlayers(gameId: string, turn: number): Promise<string[]>
  markPlayerReady(gameId: string, userId: string, turn: number, readyAt: string): Promise<void>
  clearPlayerReady(gameId: string, userId: string): Promise<void>
  getGameState(gameId: string, turn: number): Promise<GameSnapshot | null>
  upsertTurnPlan(gameId: string, turn: number, userId: string, plan: TurnPlan, submittedAt: string): Promise<void>
  clearTurnPlanSubmission(gameId: string, turn: number, userId: string): Promise<void>
  tryAcquireResolveLock(gameId: string, turn: number): Promise<boolean>
  releaseResolveLock(gameId: string): Promise<void>
  listSubmittedPlans(gameId: string, turn: number): Promise<Array<{ user_id: string, plan_json: TurnPlan }>>
  updateGameTurn(gameId: string, nextTurn: number): Promise<void>
}
