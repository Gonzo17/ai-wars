import type { StrategicCosts } from '~~/shared/defs/production'
import type { GameSnapshot, PlayerSnapshot, Resource } from '~~/shared/types/game'
import { calculateResourceProduction, calculateStrategicProduction } from '~~/shared/utils/economy'

export type ResourceCosts = { energy: number, minerals: number, rare: number }

export function getPlayerResource(player: PlayerSnapshot, key: string): Resource | undefined {
  return player.resources.find(r => r.key === key)
}

export function modifyResource(player: PlayerSnapshot, key: string, delta: number) {
  const resource = getPlayerResource(player, key)
  if (resource) {
    resource.current = Math.max(0, Math.min(resource.max, resource.current + delta))
  }
}

export function deductResourceCosts(player: PlayerSnapshot, costs: ResourceCosts) {
  modifyResource(player, 'res:energy', -costs.energy)
  modifyResource(player, 'res:material', -costs.minerals)
  modifyResource(player, 'res:rare', -costs.rare)
}

export function applyResourceProduction(player: PlayerSnapshot, production: ResourceCosts) {
  modifyResource(player, 'res:energy', production.energy)
  modifyResource(player, 'res:material', production.minerals)
  modifyResource(player, 'res:rare', production.rare)
}

/** Spend strategic resources (keyed by ResourceId) for a build. */
export function deductStrategicCosts(player: PlayerSnapshot, costs: StrategicCosts | undefined) {
  if (!costs) return
  for (const [key, amount] of Object.entries(costs)) {
    if (amount) modifyResource(player, key, -amount)
  }
}

/** Add this turn's mined strategic resources to the player's stocks. */
export function applyStrategicProduction(player: PlayerSnapshot, production: Record<string, number>) {
  for (const [key, amount] of Object.entries(production)) {
    if (amount) modifyResource(player, key, amount)
  }
}

export function updateResourceDeltas(snapshot: GameSnapshot) {
  for (const player of snapshot.players) {
    const production = calculateResourceProduction(snapshot.planets, player.id)
    const energyRes = getPlayerResource(player, 'res:energy')
    const mineralRes = getPlayerResource(player, 'res:material')
    const rareRes = getPlayerResource(player, 'res:rare')
    if (energyRes) energyRes.delta = production.energy
    if (mineralRes) mineralRes.delta = production.minerals
    if (rareRes) rareRes.delta = production.rare

    const strategic = calculateStrategicProduction(snapshot.planets, player.id)
    for (const [key, amount] of Object.entries(strategic)) {
      const res = getPlayerResource(player, key)
      if (res) res.delta = amount
    }
  }
}
