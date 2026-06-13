import { describe, expect, it } from 'vitest'
import { slotOutput, activeSynergies } from '../../shared/utils/synergies'
import { calculateResourceProduction, getResearchPointsPerTurn } from '../../shared/utils/economy'
import { createPlanetSlots } from '../../shared/types/planetSlots'
import type { BuildingId, Planet, PlayerId, ResourceNodeType } from '../../shared/types/game'

const OWNER = 'player:test' as PlayerId

function makePlanet(
  buildings: Array<{ slotIndex: number, id: BuildingId, level?: number, constructing?: boolean }>,
  oreNodes: number[] = []
): Planet {
  const nodes = new Map<number, ResourceNodeType>(oreNodes.map(i => [i, 'ore']))
  const slots = createPlanetSlots(nodes)
  for (const b of buildings) {
    const slot = slots[b.slotIndex]!
    slot.buildingId = b.id
    slot.buildingLevel = b.level ?? 1
    slot.isConstructing = b.constructing ?? false
  }
  return {
    id: 'pl:test',
    systemId: 'sys:test',
    name: 'Test',
    owner: OWNER,
    type: 'terrestrial',
    size: 'large',
    workers: 1,
    productionPerWorker: 20,
    slots,
    queues: { build: [], shipyard: [] },
    progressMemory: {},
    productionCarryover: 0,
    location: { x: 0, y: 0 }
  }
}

describe('ore-extraction synergy', () => {
  it('doubles mineral output of a mineral building on an ore node', () => {
    const onOre = makePlanet([{ slotIndex: 2, id: 'bld:mining-facility' }], [2])
    const offOre = makePlanet([{ slotIndex: 1, id: 'bld:mining-facility' }], [2])

    expect(slotOutput(onOre, 2).minerals).toBe(30) // 15 × 2
    expect(slotOutput(offOre, 1).minerals).toBe(15) // node is on slot 2, not 1
    expect(activeSynergies(onOre, 2, 'bld:mining-facility')).toContain('ore-extraction')
  })

  it('does not boost non-mineral buildings on an ore node', () => {
    const planet = makePlanet([{ slotIndex: 2, id: 'bld:solar-array' }], [2])
    expect(slotOutput(planet, 2).energy).toBe(20) // unaffected
    expect(activeSynergies(planet, 2, 'bld:solar-array')).not.toContain('ore-extraction')
  })
})

describe('power-grid synergy', () => {
  it('grants +25% energy per adjacent energy building', () => {
    // slots 0 (centre) and 1 are adjacent in the surface hex grid
    const planet = makePlanet([
      { slotIndex: 0, id: 'bld:solar-array' },
      { slotIndex: 1, id: 'bld:solar-array' }
    ])
    expect(slotOutput(planet, 0).energy).toBe(25) // 20 × 1.25 (one neighbour)
    expect(slotOutput(planet, 1).energy).toBe(25)
  })

  it('ignores adjacent energy buildings that are still under construction', () => {
    const planet = makePlanet([
      { slotIndex: 0, id: 'bld:solar-array' },
      { slotIndex: 1, id: 'bld:solar-array', constructing: true }
    ])
    expect(slotOutput(planet, 0).energy).toBe(20) // neighbour not operational yet
  })
})

describe('compute-uplink synergy', () => {
  it('boosts data-center research by 25% per completed energy building (capped)', () => {
    // data-center on an orbital slot (7), two energy buildings on the surface
    const planet = makePlanet([
      { slotIndex: 7, id: 'bld:data-center' },
      { slotIndex: 0, id: 'bld:solar-array' },
      { slotIndex: 1, id: 'bld:fusion-core' }
    ])
    expect(slotOutput(planet, 7).research).toBe(30) // 20 × (1 + 0.25×2)
  })

  it('caps the bonus at four energy buildings (+100%)', () => {
    const planet = makePlanet([
      { slotIndex: 7, id: 'bld:data-center' },
      { slotIndex: 0, id: 'bld:solar-array' },
      { slotIndex: 1, id: 'bld:solar-array' },
      { slotIndex: 2, id: 'bld:solar-array' },
      { slotIndex: 3, id: 'bld:solar-array' },
      { slotIndex: 4, id: 'bld:solar-array' } // five energy buildings, only 4 count
    ])
    expect(slotOutput(planet, 7).research).toBe(40) // 20 × 2.0
  })
})

describe('economy aggregation', () => {
  it('feeds synergies into total production and research', () => {
    const planet = makePlanet([
      { slotIndex: 2, id: 'bld:mining-facility' }, // on ore → 30 minerals
      { slotIndex: 7, id: 'bld:data-center' }, // +25% per energy building
      { slotIndex: 0, id: 'bld:solar-array' } // 20 energy, no neighbour
    ], [2])

    const production = calculateResourceProduction([planet], OWNER)
    expect(production.minerals).toBe(30)
    expect(production.energy).toBe(20)
    expect(getResearchPointsPerTurn([planet], OWNER)).toBe(25) // 20 × 1.25 (one energy building)
  })
})
