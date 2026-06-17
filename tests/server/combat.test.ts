import { describe, expect, it } from 'vitest'
import { submitTurn } from '../../server/game/turn'
import { initialState } from '../../server/game/initialState'
import { InMemoryGameRepository } from '../../server/game/inMemoryRepository'
import { toPlayerId } from '../../server/game/playerId'
import { validateTurnPlan } from '../../shared/validation/turnPlan'
import type { BuildingId, GameSnapshot, Planet, Unit, UnitId } from '../../shared/types/game'
import type { TurnPlan } from '../../shared/types/turn'

const U1 = 'u1'
const U2 = 'u2'
const EMPTY: TurnPlan = { commands: [] }

function getSnapshot(repo: InMemoryGameRepository, turn: number): GameSnapshot {
  const row = repo.data.game_state.find(r => r.game_id === 'g1' && r.turn === turn)
  expect(row).toBeDefined()
  return row!.state_json
}

let shipCounter = 0
function placeFleet(snapshot: GameSnapshot, owner: string, defId: string, type: Unit['type'], strength: number, location: string) {
  snapshot.fleets.push({
    id: `${defId}#${shipCounter++}` as UnitId,
    defId: defId as UnitId,
    type,
    name: defId,
    status: 'idle',
    location: location as Unit['location'],
    strength,
    ownerId: toPlayerId(owner)
  })
}

function seedGame() {
  return new InMemoryGameRepository({
    games: [{ id: 'g1', turn: 1, phase: 'planning', status: 'active', resolving_turn: null } as never],
    game_players: [
      { game_id: 'g1', user_id: U1 },
      { game_id: 'g1', user_id: U2 }
    ],
    game_state: [{ game_id: 'g1', turn: 1, state_json: initialState([U1, U2], 1) }]
  })
}

async function playTurn(repo: InMemoryGameRepository, turn: number) {
  await submitTurn(repo, U1, 'g1', turn, EMPTY)
  const result = await submitTurn(repo, U2, 'g1', turn, EMPTY)
  expect(result.resolved).toBe(true)
}

describe('fleet combat', () => {
  it('destroys the weaker fleet and reduces the winner when fleets clash', async () => {
    const repo = seedGame()
    const state = getSnapshot(repo, 1)
    // Both meet at the neutral hub
    placeFleet(state, U1, 'unit:frigate', 'battleship', 4, 'sys:frontier')
    placeFleet(state, U1, 'unit:frigate', 'battleship', 4, 'sys:frontier') // offense 8
    placeFleet(state, U2, 'unit:frigate', 'battleship', 4, 'sys:frontier') // offense 4

    await playTurn(repo, 1)

    const next = getSnapshot(repo, 2)
    const u1Fleets = next.fleets.filter(f => f.ownerId === toPlayerId(U1))
    const u2Fleets = next.fleets.filter(f => f.ownerId === toPlayerId(U2))
    expect(u2Fleets).toHaveLength(0) // loser wiped out
    expect(u1Fleets).toHaveLength(1) // winner lost one of two frigates

    const u1Events = next.players.find(p => p.id === toPlayerId(U1))!.events
    const u2Events = next.players.find(p => p.id === toPlayerId(U2))!.events
    expect(u1Events.some(e => e.type === 'combat')).toBe(true)
    expect(u2Events.some(e => e.type === 'combat')).toBe(true)
  })

  it('leaves fleets untouched when only one owner is present', async () => {
    const repo = seedGame()
    const state = getSnapshot(repo, 1)
    placeFleet(state, U1, 'unit:frigate', 'battleship', 4, 'sys:frontier')

    await playTurn(repo, 1)

    const next = getSnapshot(repo, 2)
    expect(next.fleets.filter(f => f.ownerId === toPlayerId(U1))).toHaveLength(1)
  })
})

describe('colonization', () => {
  it('captures an unclaimed planet with a colony ship', async () => {
    const repo = seedGame()
    const state = getSnapshot(repo, 1)
    // pl:frontier-alpha is unclaimed in sys:frontier
    placeFleet(state, U1, 'unit:colony-ship', 'colonizer', 1, 'sys:frontier')

    await playTurn(repo, 1)

    const next = getSnapshot(repo, 2)
    // The colonizer captures one unclaimed planet in its system (layout-independent).
    const outpost = next.planets.find(p => p.systemId === 'sys:frontier' && p.owner === toPlayerId(U1))!
    expect(outpost).toBeDefined()
    expect(next.players.find(p => p.id === toPlayerId(U1))!.planets).toContain(outpost.id)
    // colony ship consumed
    expect(next.fleets.filter(f => f.defId === 'unit:colony-ship')).toHaveLength(0)
    // planetsControlled updated for ascension gates (1 homeworld + 1 colonised)
    expect(next.players.find(p => p.id === toPlayerId(U1))!.research.empireState.planetsControlled).toBe(2)

    const events = next.players.find(p => p.id === toPlayerId(U1))!.events
    expect(events.some(e => e.type === 'colony-established')).toBe(true)
  })

  it('does not colonize a planet contested by an enemy fleet', async () => {
    const repo = seedGame()
    const state = getSnapshot(repo, 1)
    placeFleet(state, U1, 'unit:colony-ship', 'colonizer', 1, 'sys:frontier')
    placeFleet(state, U2, 'unit:frigate', 'battleship', 4, 'sys:frontier') // contests the system

    await playTurn(repo, 1)

    const next = getSnapshot(repo, 2)
    const outpost = next.planets.find(p => p.id === 'pl:frontier-alpha')!
    expect(outpost.owner).toBe('unclaimed')
    // colony ship is destroyed in combat (weak), enemy frigate survives
    expect(next.fleets.some(f => f.ownerId === toPlayerId(U2))).toBe(true)
  })
})

describe('star capture', () => {
  it('captures the system star with a star constructor under space superiority', async () => {
    const repo = seedGame()
    const state = getSnapshot(repo, 1)
    placeFleet(state, U1, 'unit:star-constructor', 'star-constructor', 1, 'sys:frontier')

    await playTurn(repo, 1)

    const next = getSnapshot(repo, 2)
    const star = next.planets.find(p => p.kind === 'star' && p.systemId === 'sys:frontier')!
    expect(star.owner).toBe(toPlayerId(U1))
    // constructor consumed; star does not count as a controlled planet
    expect(next.fleets.filter(f => f.defId === 'unit:star-constructor')).toHaveLength(0)
    expect(next.players.find(p => p.id === toPlayerId(U1))!.research.empireState.planetsControlled).toBe(1)

    const events = next.players.find(p => p.id === toPlayerId(U1))!.events
    expect(events.some(e => e.type === 'star-captured')).toBe(true)
  })

  it('does not capture a star contested by an enemy fleet', async () => {
    const repo = seedGame()
    const state = getSnapshot(repo, 1)
    placeFleet(state, U1, 'unit:star-constructor', 'star-constructor', 1, 'sys:frontier')
    placeFleet(state, U2, 'unit:frigate', 'battleship', 4, 'sys:frontier')

    await playTurn(repo, 1)

    const next = getSnapshot(repo, 2)
    const star = next.planets.find(p => p.kind === 'star' && p.systemId === 'sys:frontier')!
    expect(star.owner).toBe('unclaimed')
  })

  it('colony ships never target the star', async () => {
    const repo = seedGame()
    const state = getSnapshot(repo, 1)
    placeFleet(state, U1, 'unit:colony-ship', 'colonizer', 1, 'sys:frontier')

    await playTurn(repo, 1)

    const next = getSnapshot(repo, 2)
    const star = next.planets.find(p => p.kind === 'star' && p.systemId === 'sys:frontier')!
    expect(star.owner).toBe('unclaimed')
  })
})

describe('star megastructures', () => {
  /** Hand the home star to U1 so we can build megastructures on it. */
  function ownHomeStar(state: GameSnapshot): { star: Planet, homeworld: Planet } {
    const homeworld = state.planets.find(p => p.owner === toPlayerId(U1) && p.kind !== 'star')!
    const star = state.planets.find(p => p.kind === 'star' && p.systemId === homeworld.systemId)!
    star.owner = toPlayerId(U1)
    return { star, homeworld }
  }

  it('gates building placement by site', () => {
    const repo = seedGame()
    const state = getSnapshot(repo, 1)
    const { star, homeworld } = ownHomeStar(state)
    // Give the player enough resources so only the site rule can fail.
    const u1 = state.players.find(p => p.id === toPlayerId(U1))!
    for (const r of u1.resources) r.current = 5000

    // Megastructure on the captured star → allowed
    const onStar: TurnPlan = { commands: [{ type: 'buildStructure', planetId: star.id, buildingId: 'bld:dyson-sphere' as BuildingId, slotIndex: 0 }] }
    expect(validateTurnPlan(state, toPlayerId(U1), onStar)).toHaveLength(0)

    // Megastructure on a planet → rejected
    const megaOnPlanet: TurnPlan = { commands: [{ type: 'buildStructure', planetId: homeworld.id, buildingId: 'bld:dyson-sphere' as BuildingId, slotIndex: 0 }] }
    expect(validateTurnPlan(state, toPlayerId(U1), megaOnPlanet).length).toBeGreaterThan(0)

    // Normal building on the star → rejected
    const planetBldOnStar: TurnPlan = { commands: [{ type: 'buildStructure', planetId: star.id, buildingId: 'bld:solar-array' as BuildingId, slotIndex: 0 }] }
    expect(validateTurnPlan(state, toPlayerId(U1), planetBldOnStar).length).toBeGreaterThan(0)
  })

  it('completes a Dyson sphere on a captured star, lifting energy and dysonStages', async () => {
    const repo = seedGame()
    const state = getSnapshot(repo, 1)
    const { star } = ownHomeStar(state)
    // Seed a nearly-finished Dyson stage so one empty turn completes it.
    star.slots[0] = { index: 0, zone: 'orbital', buildingId: 'bld:dyson-sphere' as BuildingId, buildingLevel: 1, isConstructing: true, constructionTimeLeft: 20, resourceNode: null }
    star.queues.build = [{ slotIndex: 0 }]

    await playTurn(repo, 1)

    const next = getSnapshot(repo, 2)
    const nextStar = next.planets.find(p => p.id === star.id)!
    const dysonSlot = nextStar.slots[0]!
    expect(dysonSlot.buildingId).toBe('bld:dyson-sphere')
    expect(dysonSlot.isConstructing).toBe(false)

    const player = next.players.find(p => p.id === toPlayerId(U1))!
    expect(player.research.empireState.starsControlled).toBe(1)
    expect(player.research.empireState.dysonStages).toBe(1)
    // Dyson sphere adds 200 energy/turn to the player's production.
    expect(player.resources.find(r => r.key === 'res:energy')!.delta).toBeGreaterThanOrEqual(200)
  })
})
