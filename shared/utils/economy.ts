import type { Planet } from '../types/game'
import { slotOutput } from './synergies'

export type ResourceTotals = { energy: number, minerals: number, rare: number }

function forEachOwnedPlanet(planets: Planet[], playerId: string, fn: (planet: Planet) => void) {
  for (const planet of planets) {
    if (planet.owner !== playerId) continue
    fn(planet)
  }
}

/** Per-turn resource production from all completed buildings owned by the player (synergies included). */
export function calculateResourceProduction(planets: Planet[], playerId: string): ResourceTotals {
  const totals: ResourceTotals = { energy: 0, minerals: 0, rare: 0 }
  forEachOwnedPlanet(planets, playerId, (planet) => {
    for (let i = 0; i < planet.slots.length; i++) {
      const output = slotOutput(planet, i)
      totals.energy += output.energy
      totals.minerals += output.minerals
      totals.rare += output.rare
    }
  })
  return totals
}

/** Per-turn research points from all completed buildings owned by the player (synergies included). */
export function getResearchPointsPerTurn(planets: Planet[], playerId: string): number {
  let total = 0
  forEachOwnedPlanet(planets, playerId, (planet) => {
    for (let i = 0; i < planet.slots.length; i++) {
      total += slotOutput(planet, i).research
    }
  })
  return total
}
