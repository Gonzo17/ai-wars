import { describe, expect, it } from 'vitest'
import { submitTurn } from '../../server/game/turn'
import { resolveTurn } from '../../server/game/resolveTurn'
import { initialState } from '../../server/game/initialState'
import { InMemoryGameRepository } from '../../server/game/inMemoryRepository'
import { toPlayerId } from '../../server/game/playerId'
import { findLanePath } from '../../shared/utils/starlanes'
import type { GameSnapshot, PlayerSnapshot, ResourceId } from '../../shared/types/game'
import type { TurnCommand, TurnPlan } from '../../shared/types/turn'

const U1 = 'u1'
const U2 = 'u2'
const EMPTY: TurnPlan = { commands: [] }

/** Single-building production queue for a planet. */
const buildCmd = (planetId: string, buildingId: string, slotIndex: number): TurnCommand =>
  ({ type: 'setProductionQueue', planetId: planetId as never, items: [{ kind: 'building', slotIndex, buildingId: buildingId as never }] })

/** Single-unit production queue for a planet. */
const unitCmd = (planetId: string, unitId: string): TurnCommand =>
  ({ type: 'setProductionQueue', planetId: planetId as never, items: [{ kind: 'unit', unitId: unitId as never }] })

function seedTwoPlayerGame(repo?: InMemoryGameRepository) {
  return repo ?? new InMemoryGameRepository({
    games: [{ id: 'g1', turn: 1, phase: 'planning', status: 'active', resolving_turn: null } as never],
    game_players: [
      { game_id: 'g1', user_id: U1 },
      { game_id: 'g1', user_id: U2 }
    ],
    game_state: [{ game_id: 'g1', turn: 1, state_json: initialState([U1, U2], 1) }]
  })
}

/** Submit a plan for both players on the given turn; resolution runs on the second submit. */
async function playTurn(repo: InMemoryGameRepository, turn: number, plans: Partial<Record<string, TurnPlan>> = {}) {
  await submitTurn(repo, U1, 'g1', turn, plans[U1] ?? EMPTY)
  const result = await submitTurn(repo, U2, 'g1', turn, plans[U2] ?? EMPTY)
  expect(result.resolved).toBe(true)
}

function getSnapshot(repo: InMemoryGameRepository, turn: number): GameSnapshot {
  const row = repo.data.game_state.find(r => r.game_id === 'g1' && r.turn === turn)
  expect(row).toBeDefined()
  return row!.state_json
}

function getPlayer(snapshot: GameSnapshot, userId: string): PlayerSnapshot {
  const player = snapshot.players.find(p => p.id === toPlayerId(userId))
  expect(player).toBeDefined()
  return player!
}

function getResource(player: PlayerSnapshot, key: ResourceId): number {
  return player.resources.find(r => r.key === key)?.current ?? Number.NaN
}

describe('initial state', () => {
  it('gives every player a single terrestrial homeworld', () => {
    const snapshot = initialState([U1, U2], 1)

    for (const userId of [U1, U2]) {
      const player = getPlayer(snapshot, userId)
      expect(player.planets).toHaveLength(1)

      const owned = snapshot.planets.filter(p => p.owner === player.id)
      expect(owned.map(p => p.id).sort()).toEqual([...player.planets].sort())
      expect(owned[0]!.type).toBe('terrestrial')
      expect(owned[0]!.isHomeworld).toBe(true)

      const buildings = owned
        .flatMap(p => p.slots)
        .filter(s => s.buildingId)
        .map(s => `${s.buildingId}@${s.buildingLevel}`)
        .sort()
      expect(buildings).toEqual([
        'bld:data-center@1',
        'bld:fusion-core@2',
        'bld:hydroponics@3',
        'bld:orbital-dock@1'
      ])
    }

    const [p1, p2] = [getPlayer(snapshot, U1), getPlayer(snapshot, U2)]
    expect(p1.resources).toEqual(p2.resources)
    expect(p1.planets.some(id => p2.planets.includes(id))).toBe(false)

    // Each player gets their own galaxy; a shared Frontier links them all
    expect(snapshot.galaxies.filter(g => g.id !== 'galaxy:frontier')).toHaveLength(2)
    const frontier = snapshot.systems.find(s => s.id === 'sys:frontier')
    expect(frontier).toBeDefined()
    for (const player of snapshot.players) {
      const homeSystemId = snapshot.planets.find(p => p.owner === player.id)!.systemId
      // home and Frontier are in different galaxies, but reachable by lane
      expect(findLanePath(snapshot.systems, homeSystemId, 'sys:frontier')).not.toBeNull()
    }
  })

  it('gives every system one unclaimed star', () => {
    const snapshot = initialState([U1, U2], 1)

    for (const system of snapshot.systems) {
      expect(system.starId).toBeDefined()
      const star = snapshot.planets.find(p => p.id === system.starId)
      expect(star?.kind).toBe('star')
      expect(star?.owner).toBe('unclaimed')
      expect(star?.systemId).toBe(system.id)
    }
    // stars are not counted as planets for ascension
    for (const player of snapshot.players) {
      expect(player.research.empireState.planetsControlled).toBe(1)
    }
  })

  it('players resolve empty turns to identical resources', async () => {
    const repo = seedTwoPlayerGame()
    await playTurn(repo, 1)
    await playTurn(repo, 2)

    const snapshot = getSnapshot(repo, 3)
    const [p1, p2] = [getPlayer(snapshot, U1), getPlayer(snapshot, U2)]
    expect(p1.resources).toEqual(p2.resources)
    // 2 turns of fusion-core L2 (100/turn); the lone homeworld has no mineral building yet
    expect(getResource(p1, 'res:energy')).toBe(700)
    expect(getResource(p1, 'res:material')).toBe(100)
  })
})

describe('building construction cycle', () => {
  it('deducts cost once, applies ore adjacency, completes, and carries over overflow', async () => {
    const repo = seedTwoPlayerGame()
    const plan: TurnPlan = {
      // Slot 2 on the primary planet is empty and has an ore node →
      // mining facility gets the −5 % adjusted production cost (60 → 57).
      commands: [buildCmd('pl:aurora', 'bld:mining-facility', 2)]
    }

    await playTurn(repo, 1, { [U1]: plan })

    const turn2 = getSnapshot(repo, 2)
    const p1 = getPlayer(turn2, U1)
    // 500 start − 30 build cost (deducted once) + 100 production
    expect(getResource(p1, 'res:energy')).toBe(570)
    const slot = turn2.planets.find(p => p.id === 'pl:aurora')!.slots[2]!
    expect(slot.buildingId).toBe('bld:mining-facility')
    expect(slot.isConstructing).toBe(true)
    // 57 adjusted cost − 20 production this turn
    expect(slot.constructionTimeLeft).toBe(37)

    // Mining facility takes 3 turns at 20 production/turn (57 → 37 → 17 → done)
    await playTurn(repo, 2)
    await playTurn(repo, 3)

    const turn4 = getSnapshot(repo, 4)
    const planet = turn4.planets.find(p => p.id === 'pl:aurora')!
    expect(planet.slots[2]!.isConstructing).toBe(false)
    // last turn: 20 production − 17 remaining = 3 overflow carried over
    expect(planet.productionCarryover).toBe(3)

    const events = getPlayer(turn4, U1).events
    expect(events.some(e => e.type === 'building-complete')).toBe(true)

    // Mine sits on the ore node → ore-extraction synergy doubles its 15 to 30
    const mineralRes = getPlayer(turn4, U1).resources.find(r => r.key === 'res:material')
    expect(mineralRes?.delta).toBe(30)
  })

  it('resuming the same build in the same slot does not charge again', async () => {
    const repo = seedTwoPlayerGame()
    const plan: TurnPlan = {
      commands: [buildCmd('pl:aurora', 'bld:solar-array', 3)]
    }

    // Solar array costs 60 → 3 turns; re-submit the identical command each turn,
    // which must be treated as a resume (charged once, progress kept)
    await playTurn(repo, 1, { [U1]: plan })
    await playTurn(repo, 2, { [U1]: plan })
    await playTurn(repo, 3, { [U1]: plan })

    const turn4 = getSnapshot(repo, 4)
    const p1 = getPlayer(turn4, U1)
    // 100 start − 50 (charged exactly once); no refinery on the lone homeworld
    expect(getResource(p1, 'res:material')).toBe(50)
    expect(turn4.planets.find(p => p.id === 'pl:aurora')!.slots[3]!.isConstructing).toBe(false)
  })

  it('rejects building on a planet the player does not own', async () => {
    const repo = seedTwoPlayerGame()
    const plan: TurnPlan = {
      // pl:meridian is player 2's home world
      commands: [buildCmd('pl:meridian', 'bld:solar-array', 3)]
    }

    await expect(submitTurn(repo, U1, 'g1', 1, plan)).rejects.toMatchObject({ statusCode: 400 })
  })
})

describe('research cycle', () => {
  it('progresses by research points per turn and completes', async () => {
    const repo = seedTwoPlayerGame()
    const plan: TurnPlan = {
      commands: [{ type: 'startResearch', researchId: 'tech:bootstrapped-ai-core' }]
    }

    // 60 points required. Data-center L1 yields 20, +25% compute-uplink from
    // the home fusion-core → 25/turn → completes in 3 turns.
    await playTurn(repo, 1, { [U1]: plan })

    const turn2 = getSnapshot(repo, 2)
    expect(getPlayer(turn2, U1).research.activeResearch?.progressPoints).toBe(25)

    for (let turn = 2; turn <= 5; turn++) {
      await playTurn(repo, turn)
    }

    const final = getSnapshot(repo, 6)
    const p1 = getPlayer(final, U1)
    expect(p1.research.completedTechIds).toContain('tech:bootstrapped-ai-core')
    expect(p1.research.activeResearch).toBeUndefined()
    // Children of the completed tech become available
    expect(p1.availableResearchIds).toEqual(expect.arrayContaining([
      'tech:basic-industrial-robotics',
      'tech:planetary-grid-management',
      'tech:probe-design'
    ]))
    expect(p1.events.some(e => e.type === 'research-complete')).toBe(true)

    // Player 2 never researched anything
    expect(getPlayer(final, U2).research.completedTechIds).toHaveLength(0)
  })
})

describe('unit production cycle', () => {
  it('a finished worker increases the planet worker count', async () => {
    const repo = seedTwoPlayerGame()
    const plan: TurnPlan = {
      commands: [unitCmd('pl:aurora', 'unit:worker')]
    }

    await playTurn(repo, 1, { [U1]: plan })

    const turn2 = getSnapshot(repo, 2)
    expect(turn2.planets.find(p => p.id === 'pl:aurora')!.workers).toBe(2)
  })

  it('a finished ship joins the global fleet list', async () => {
    const repo = seedTwoPlayerGame()
    // Probes cost 8 rare; players start with 0 → grant some up front.
    // Probes also require tech:probe-design since tech gating landed.
    const seedState = getSnapshot(repo, 1)
    getPlayer(seedState, U1).resources.find(r => r.key === 'res:rare')!.current = 100
    getPlayer(seedState, U1).research.completedTechIds.push('tech:probe-design')

    const plan: TurnPlan = {
      commands: [unitCmd('pl:aurora', 'unit:probe')]
    }

    // Probe costs 60 production at 20/turn → finishes after 3 resolves
    await playTurn(repo, 1, { [U1]: plan })
    await playTurn(repo, 2)
    await playTurn(repo, 3)

    const final = getSnapshot(repo, 4)
    expect(final.fleets).toHaveLength(1)
    expect(final.fleets[0]).toMatchObject({
      defId: 'unit:probe',
      ownerId: toPlayerId(U1),
      location: 'pl:aurora',
      status: 'idle'
    })
    // Instance id is unique, not the def id
    expect(final.fleets[0]!.id).not.toBe('unit:probe')
    expect(final.planets.find(p => p.id === 'pl:aurora')!.queues.production).toHaveLength(0)
  })
})

describe('tech gating', () => {
  it('rejects a building whose research requirement is not met', async () => {
    const repo = seedTwoPlayerGame()
    const plan: TurnPlan = {
      // rare-extractor requires tech:autonomous-resource-allocation
      commands: [buildCmd('pl:aurora', 'bld:rare-extractor', 3)]
    }

    await expect(submitTurn(repo, U1, 'g1', 1, plan)).rejects.toMatchObject({
      statusCode: 400,
      data: { errors: [{ code: 'INVALID_STATE', message: 'Research requirements not met' }] }
    })
  })

  it('allows the same building once the research is completed', async () => {
    const repo = seedTwoPlayerGame()
    const seedState = getSnapshot(repo, 1)
    getPlayer(seedState, U1).research.completedTechIds.push('tech:autonomous-resource-allocation')

    const plan: TurnPlan = {
      commands: [buildCmd('pl:aurora', 'bld:rare-extractor', 3)]
    }

    await playTurn(repo, 1, { [U1]: plan })

    const turn2 = getSnapshot(repo, 2)
    const slot = turn2.planets.find(p => p.id === 'pl:aurora')!.slots[3]!
    expect(slot.buildingId).toBe('bld:rare-extractor')
    expect(slot.isConstructing).toBe(true)
  })

  it('rejects a unit whose research requirement is not met even if the facility exists', async () => {
    const repo = seedTwoPlayerGame()
    // Home world has an orbital dock from the start; grant rare so only research blocks
    const seedState = getSnapshot(repo, 1)
    getPlayer(seedState, U1).resources.find(r => r.key === 'res:rare')!.current = 100

    const plan: TurnPlan = {
      // frigate requires tech:first-shipyard
      commands: [unitCmd('pl:aurora', 'unit:frigate')]
    }

    await expect(submitTurn(repo, U1, 'g1', 1, plan)).rejects.toMatchObject({
      statusCode: 400,
      data: {
        errors: expect.arrayContaining([
          expect.objectContaining({ code: 'INVALID_STATE', message: 'Research requirements not met' })
        ])
      }
    })
  })
})

describe('resolve failure handling', () => {
  class FailingRepository extends InMemoryGameRepository {
    failNextSnapshotInsert = false

    override async insertGameState(gameId: string, turn: number, snapshot: GameSnapshot): Promise<void> {
      if (this.failNextSnapshotInsert) {
        this.failNextSnapshotInsert = false
        throw new Error('simulated db failure')
      }
      return super.insertGameState(gameId, turn, snapshot)
    }
  }

  it('releases the resolve lock when resolution throws', async () => {
    const repo = new FailingRepository({
      games: [{ id: 'g1', turn: 1, phase: 'planning', status: 'active', resolving_turn: null } as never],
      game_players: [
        { game_id: 'g1', user_id: U1 },
        { game_id: 'g1', user_id: U2 }
      ],
      game_state: [{ game_id: 'g1', turn: 1, state_json: initialState([U1, U2], 1) }]
    })

    await submitTurn(repo, U1, 'g1', 1, EMPTY)
    repo.failNextSnapshotInsert = true

    await expect(submitTurn(repo, U2, 'g1', 1, EMPTY)).rejects.toThrow('simulated db failure')

    // The game must NOT be stuck in `resolving`
    const game = repo.data.games[0]!
    expect(game.phase).toBe('planning')
    expect(game.resolving_turn).toBeNull()
    expect(game.turn).toBe(1)

    // Both plans are still submitted, so a retry resolves cleanly
    const retry = await resolveTurn(repo, 'g1', 1)
    expect(retry.resolved).toBe(true)
    expect(repo.data.games[0]!.turn).toBe(2)
  })
})
