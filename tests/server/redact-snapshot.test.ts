import { describe, expect, it } from 'vitest'
import { initialState } from '../../server/game/initialState'
import { redactSnapshotFor } from '../../server/game/redactSnapshot'
import { toPlayerId } from '../../server/game/playerId'
import type { Unit, UnitId } from '../../shared/types/game'

const U1 = 'u1'
const U2 = 'u2'

function fleet(owner: string, location: string, id: string): Unit {
  return {
    id: id as UnitId,
    defId: 'unit:frigate' as UnitId,
    type: 'battleship',
    name: 'frigate',
    status: 'idle',
    location: location as Unit['location'],
    strength: 4,
    ownerId: toPlayerId(owner)
  }
}

describe('redactSnapshotFor', () => {
  it('keeps the viewer’s own data intact', () => {
    const snapshot = initialState([U1, U2], 1)
    const view = redactSnapshotFor(snapshot, toPlayerId(U1))

    const me = view.players.find(p => p.id === toPlayerId(U1))!
    expect(me.resources.length).toBeGreaterThan(0)
    const myPlanet = view.planets.find(p => p.owner === toPlayerId(U1))!
    expect(myPlanet.slots.some(s => s.buildingId)).toBe(true)
  })

  it('hides enemy planet contents but keeps map-level facts', () => {
    const snapshot = initialState([U1, U2], 1)
    const view = redactSnapshotFor(snapshot, toPlayerId(U1))

    const enemyPlanet = view.planets.find(p => p.owner === toPlayerId(U2))!
    expect(enemyPlanet.name).toBeTruthy() // still on the map
    expect(enemyPlanet.owner).toBe(toPlayerId(U2)) // ownership visible
    expect(enemyPlanet.slots).toEqual([]) // but no buildings leaked
    expect(enemyPlanet.queues.production).toEqual([])
  })

  it('strips enemy private state (resources, research, events)', () => {
    const snapshot = initialState([U1, U2], 1)
    snapshot.players.find(p => p.id === toPlayerId(U2))!.events.push({
      id: 'e1', type: 'research-complete', severity: 'success', year: 1,
      titleKey: 't', descriptionKey: 'd', read: false, timestamp: 0
    })

    const view = redactSnapshotFor(snapshot, toPlayerId(U1))
    const enemy = view.players.find(p => p.id === toPlayerId(U2))!
    expect(enemy.resources).toEqual([])
    expect(enemy.events).toEqual([])
    expect(enemy.research.completedTechIds).toEqual([])
    expect(enemy.availableResearchIds).toEqual([])
  })

  it('keeps unclaimed planets fully visible', () => {
    const snapshot = initialState([U1, U2], 1)
    const view = redactSnapshotFor(snapshot, toPlayerId(U1))

    const unclaimed = view.planets.find(p => p.owner === 'unclaimed')!
    expect(unclaimed.slots.length).toBeGreaterThan(0) // expansion target, not fogged
  })

  it('shows enemy fleets only in systems where the viewer owns a planet', () => {
    const snapshot = initialState([U1, U2], 1)
    // sys:lyra is U1's home system; sys:vega is U2's
    snapshot.fleets.push(
      fleet(U2, 'sys:lyra', 'enemy-in-my-space'),
      fleet(U2, 'sys:vega', 'enemy-at-home'),
      fleet(U1, 'sys:lyra', 'mine')
    )

    const view = redactSnapshotFor(snapshot, toPlayerId(U1))
    const ids = view.fleets.map(f => f.id)
    expect(ids).toContain('mine')
    expect(ids).toContain('enemy-in-my-space') // contesting my system → visible
    expect(ids).not.toContain('enemy-at-home') // roaming in fog → hidden
  })

  it('does not mutate the source snapshot', () => {
    const snapshot = initialState([U1, U2], 1)
    redactSnapshotFor(snapshot, toPlayerId(U1))
    // original enemy planet still has its buildings
    const enemyPlanet = snapshot.planets.find(p => p.owner === toPlayerId(U2))!
    expect(enemyPlanet.slots.some(s => s.buildingId)).toBe(true)
  })
})
