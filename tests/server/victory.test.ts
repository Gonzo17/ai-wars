import { describe, expect, it } from 'vitest'
import { submitTurn } from '../../server/game/turn'
import { initialState } from '../../server/game/initialState'
import { InMemoryGameRepository } from '../../server/game/inMemoryRepository'
import { toPlayerId } from '../../server/game/playerId'
import { MILITARY_HOLD_TURNS } from '../../shared/utils/victory'
import type { GameSnapshot } from '../../shared/types/game'
import type { TurnPlan } from '../../shared/types/turn'

const U1 = 'u1'
const U2 = 'u2'
const EMPTY: TurnPlan = { commands: [] }

/** initialState mutated so U1 controls every homeworld + 3 planets (military trigger met). */
function militaryWinSnapshot(turn = 1): GameSnapshot {
  const snap = initialState([U1, U2], turn)
  const p1 = toPlayerId(U1)

  for (const hw of snap.planets.filter(p => p.isHomeworld)) hw.owner = p1
  const extra = snap.planets.find(p => p.kind !== 'star' && !p.isHomeworld && p.owner === 'unclaimed')!
  extra.owner = p1

  const owned = snap.planets.filter(p => p.owner === p1 && p.kind !== 'star').map(p => p.id)
  snap.players.find(p => p.id === p1)!.planets = owned
  snap.players.find(p => p.id === toPlayerId(U2))!.planets = []
  return snap
}

function makeRepo(snapshot: GameSnapshot) {
  return new InMemoryGameRepository({
    games: [{ id: 'g1', turn: snapshot.turn, phase: 'planning', status: 'active', resolving_turn: null } as never],
    game_players: [
      { game_id: 'g1', user_id: U1 },
      { game_id: 'g1', user_id: U2 }
    ],
    game_state: [{ game_id: 'g1', turn: snapshot.turn, state_json: snapshot }]
  })
}

async function playTurn(repo: InMemoryGameRepository, turn: number) {
  await submitTurn(repo, U1, 'g1', turn, EMPTY)
  await submitTurn(repo, U2, 'g1', turn, EMPTY)
}

function snapshotAt(repo: InMemoryGameRepository, turn: number): GameSnapshot {
  return repo.data.game_state.find(r => r.game_id === 'g1' && r.turn === turn)!.state_json
}

describe('military victory', () => {
  it('does not start a countdown in a fresh, even game', async () => {
    const repo = makeRepo(initialState([U1, U2], 1))
    await playTurn(repo, 1)

    const next = snapshotAt(repo, 2)
    expect(next.victory?.pending ?? []).toHaveLength(0)
    expect(next.victory?.winnerId).toBeUndefined()
  })

  it('starts a countdown when one player holds every homeworld', async () => {
    const repo = makeRepo(militaryWinSnapshot(1))
    await playTurn(repo, 1)

    const next = snapshotAt(repo, 2)
    expect(next.victory?.pending).toHaveLength(1)
    const entry = next.victory!.pending[0]!
    expect(entry.playerId).toBe(toPlayerId(U1))
    expect(entry.condition).toBe('military')
    expect(entry.winTurn).toBe(2 + MILITARY_HOLD_TURNS)
    expect(next.victory?.winnerId).toBeUndefined()
  })

  it('declares the winner after holding for the full duration and finishes the game', async () => {
    const repo = makeRepo(militaryWinSnapshot(1))

    // Countdown starts on resolve of turn 1 (newTurn 2), wins when newTurn >= winTurn.
    for (let turn = 1; turn <= MILITARY_HOLD_TURNS + 1; turn++) {
      await playTurn(repo, turn)
    }

    const winningTurn = 2 + MILITARY_HOLD_TURNS
    const final = snapshotAt(repo, winningTurn)
    expect(final.victory?.winnerId).toBe(toPlayerId(U1))
    expect(final.victory?.winningCondition).toBe('military')
    expect(final.victory?.pending ?? []).toHaveLength(0)

    const game = await repo.getGame('g1')
    expect(game?.status).toBe('finished')

    // A finished game rejects further turns.
    await expect(submitTurn(repo, U1, 'g1', winningTurn, EMPTY)).rejects.toMatchObject({ statusCode: 409 })
  })

  it('resets the countdown when the trigger is broken', async () => {
    const repo = makeRepo(militaryWinSnapshot(1))
    await playTurn(repo, 1)
    expect(snapshotAt(repo, 2).victory?.pending).toHaveLength(1)

    // Flip one homeworld back to U2 before resolving turn 2 → "owns every
    // homeworld" no longer holds, so the countdown must reset.
    const mid = snapshotAt(repo, 2)
    mid.planets.find(p => p.isHomeworld)!.owner = toPlayerId(U2)

    await playTurn(repo, 2)
    const after = snapshotAt(repo, 3)
    expect(after.victory?.pending ?? []).toHaveLength(0)
    expect(after.victory?.winnerId).toBeUndefined()
  })
})
