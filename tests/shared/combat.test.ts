import { describe, expect, it } from 'vitest'
import { resolveFleetCombat, fleetOffense } from '../../shared/utils/combat'
import type { PlayerId, Unit, UnitId } from '../../shared/types/game'

const A = 'player:a' as PlayerId
const B = 'player:b' as PlayerId

let counter = 0
function ship(ownerId: PlayerId, type: Unit['type'], strength: number): Unit {
  return {
    id: `unit:s${counter++}` as UnitId,
    defId: 'unit:frigate' as UnitId,
    type,
    name: 'ship',
    status: 'idle',
    location: 'sys:x' as Unit['location'],
    strength,
    ownerId
  }
}

describe('resolveFleetCombat', () => {
  it('stronger side wins and takes proportional casualties', () => {
    const a = [ship(A, 'battleship', 4), ship(A, 'battleship', 4)] // offense 8
    const b = [ship(B, 'battleship', 4)] // offense 4
    const result = resolveFleetCombat(new Map([[A, a], [B, b]]))

    expect(result.winnerId).toBe(A)
    const sideA = result.sides.find(s => s.ownerId === A)!
    const sideB = result.sides.find(s => s.ownerId === B)!
    expect(sideB.survivors).toHaveLength(0) // loser wiped out
    // winner takes 4 damage → loses one of its strength-4 ships
    expect(sideA.destroyed).toHaveLength(1)
    expect(sideA.survivors).toHaveLength(1)
  })

  it('a lone battleship shrugs off a probe (no partial kills)', () => {
    const a = [ship(A, 'battleship', 4)] // offense 4
    const b = [ship(B, 'probe', 1)] // offense 0.4
    const result = resolveFleetCombat(new Map([[A, a], [B, b]]))

    expect(result.winnerId).toBe(A)
    const sideA = result.sides.find(s => s.ownerId === A)!
    expect(sideA.survivors).toHaveLength(1) // frigate survives a scratch
    expect(sideA.destroyed).toHaveLength(0)
  })

  it('equal offense is mutual destruction', () => {
    const a = [ship(A, 'battleship', 4)]
    const b = [ship(B, 'battleship', 4)]
    const result = resolveFleetCombat(new Map([[A, a], [B, b]]))

    expect(result.winnerId).toBeNull()
    expect(result.sides.every(s => s.survivors.length === 0)).toBe(true)
  })

  it('support craft fight at reduced weight', () => {
    expect(fleetOffense([ship(A, 'battleship', 4)])).toBe(4)
    expect(fleetOffense([ship(A, 'probe', 1)])).toBeCloseTo(0.4)
    expect(fleetOffense([ship(A, 'colonizer', 1)])).toBeCloseTo(0.3)
  })
})
