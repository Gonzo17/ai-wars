import type { GameSnapshot, Planet, PlayerSnapshot, ResearchId } from '../types/game'
import type { TurnPlan, ValidationError } from '../types/turn'
import { BUILD_QUEUE_LIMIT, buildingSite, getBuildingDef, getUnitDef } from '../defs/production'
import type { StrategicCosts } from '../defs/production'
import { TECH_DEFS } from '../defs/research-tree'
import { isBuildingAllowedInZone } from '../types/planetSlots'
import { findLanePath, getSystemIdForLocation } from '../utils/starlanes'

interface ResourceCosts {
  energy: number
  minerals: number
  rare: number
}

/**
 * Buildings that stand in for another facility requirement. A captured star has
 * no orbital dock, but a completed Stellar Shipyard provides the same capability,
 * so ship/unit builds requiring an orbital dock are allowed on such a star.
 */
const FACILITY_SUBSTITUTES: Record<string, string[]> = {
  'bld:orbital-dock': ['bld:orbital-shipyard-mega']
}

const hasSlotBuildingRequirement = (planet: Planet, requirements: Array<{ id: string, level: number }>) => {
  for (const req of requirements) {
    const direct = planet.slots.find(s => s.buildingId === req.id && !s.isConstructing && s.buildingLevel >= req.level)
    if (direct) continue
    const substitutes = FACILITY_SUBSTITUTES[req.id] ?? []
    const hasSubstitute = substitutes.length > 0
      && planet.slots.some(s => s.buildingId !== null && substitutes.includes(s.buildingId) && !s.isConstructing)
    if (!hasSubstitute) return false
  }
  return true
}

const hasResearchRequirement = (player: PlayerSnapshot, researchIds: string[]) => {
  return researchIds.every(id => player.research.completedTechIds.includes(id))
}

const hasAvailableResearch = (player: PlayerSnapshot, researchId: ResearchId) => {
  return player.availableResearchIds.includes(researchId)
}

const getTechById = (techId: string) => TECH_DEFS.find(tech => tech.id === techId)

function getPlayerResources(player: PlayerSnapshot): ResourceCosts {
  const energy = player.resources.find(r => r.key === 'res:energy')?.current ?? 0
  const minerals = player.resources.find(r => r.key === 'res:material')?.current ?? 0
  const rare = player.resources.find(r => r.key === 'res:rare')?.current ?? 0
  return { energy, minerals, rare }
}

function canAfford(available: ResourceCosts, cost: ResourceCosts): boolean {
  return available.energy >= cost.energy
    && available.minerals >= cost.minerals
    && available.rare >= cost.rare
}

function subtractCosts(available: ResourceCosts, cost: ResourceCosts): ResourceCosts {
  return {
    energy: available.energy - cost.energy,
    minerals: available.minerals - cost.minerals,
    rare: available.rare - cost.rare
  }
}

function canAffordStrategic(available: Record<string, number>, costs: StrategicCosts | undefined): boolean {
  if (!costs) return true
  return Object.entries(costs).every(([key, amount]) => (available[key] ?? 0) >= (amount ?? 0))
}

function subtractStrategic(available: Record<string, number>, costs: StrategicCosts | undefined): void {
  if (!costs) return
  for (const [key, amount] of Object.entries(costs)) {
    available[key] = (available[key] ?? 0) - (amount ?? 0)
  }
}

/**
 * A build on a slot is a "resume" (no new resource cost) if the slot
 * already has the same buildingId assigned and is under construction (resources were paid earlier).
 */
function isResumingSlotBuild(planet: Planet, slotIndex: number, buildingId: string): boolean {
  const slot = planet.slots[slotIndex]
  if (!slot) return false
  return slot.buildingId === buildingId && slot.isConstructing
}

function isResumingUnitBuild(planet: Planet, unitId: string): boolean {
  return planet.queues.shipyard.some(u => u.id === unitId)
    || Boolean(planet.progressMemory?.[unitId]?.resourcePaid)
}

export function validateTurnPlan(snapshot: GameSnapshot, playerId: string, plan: TurnPlan): ValidationError[] {
  const errors: ValidationError[] = []
  const player = snapshot.players.find(p => p.id === playerId)

  if (!player) {
    return [{ code: 'INVALID_STATE', message: 'Player not found in snapshot' }]
  }

  let hasResearchCommand = false
  const queueCounts = new Map<string, number>()
  let availableResources = getPlayerResources(player)
  const availableStrategic: Record<string, number> = {}
  for (const r of player.resources) availableStrategic[r.key] = r.current

  for (const [index, command] of plan.commands.entries()) {
    const path = `commands.${index}`

    if (command.type === 'startResearch') {
      if (hasResearchCommand) {
        errors.push({ code: 'INVALID_STATE', message: 'Research already active', path })
      }
      const tech = getTechById(command.researchId)
      const isCurrent = player.research.activeResearch?.techId === command.researchId
      if (!tech || (!isCurrent && !hasAvailableResearch(player, command.researchId))) {
        errors.push({ code: 'NOT_FOUND', message: 'Research not available', path })
      }
      hasResearchCommand = true
      continue
    }

    if (command.type === 'buildStructure') {
      const planet = snapshot.planets.find(p => p.id === command.planetId)
      if (!planet) {
        errors.push({ code: 'NOT_FOUND', message: 'Planet not found', path })
        continue
      }
      if (planet.owner !== playerId) {
        errors.push({ code: 'NOT_OWNER', message: 'Planet not owned by player', path })
      }
      const building = getBuildingDef(command.buildingId)
      if (!building) {
        errors.push({ code: 'NOT_FOUND', message: 'Building not found', path })
        continue
      }

      // Validate slot index against this site's actual slot count
      if (command.slotIndex < 0 || command.slotIndex >= planet.slots.length) {
        errors.push({ code: 'INVALID_COMMAND', message: 'Slot index out of range', path })
        continue
      }
      const slot = planet.slots[command.slotIndex]
      if (!slot) {
        errors.push({ code: 'INVALID_COMMAND', message: 'Slot not found', path })
        continue
      }

      // Site check: megastructures only on stars, planet buildings only on planets
      const isStar = planet.kind === 'star'
      if (buildingSite(building) === 'star' && !isStar) {
        errors.push({ code: 'INVALID_COMMAND', message: 'Megastructure can only be built on a star', path })
        continue
      }
      if (buildingSite(building) !== 'star' && isStar) {
        errors.push({ code: 'INVALID_COMMAND', message: 'This building cannot be built on a star', path })
        continue
      }

      // Zone check (planets only — star shells are not surface/orbital zoned)
      if (!isStar && !isBuildingAllowedInZone(command.buildingId, slot.zone)) {
        errors.push({ code: 'INVALID_COMMAND', message: 'Building not allowed in this zone', path })
        continue
      }

      // Slot availability: must be empty or resuming the same build
      if (slot.buildingId !== null && slot.buildingId !== command.buildingId) {
        errors.push({ code: 'INVALID_STATE', message: 'Slot already occupied by a different building', path })
        continue
      }
      if (slot.buildingId === command.buildingId && !slot.isConstructing) {
        errors.push({ code: 'INVALID_STATE', message: 'Building already completed in this slot', path })
        continue
      }

      // Requirements
      if (building.requirements.buildings && !hasSlotBuildingRequirement(planet, building.requirements.buildings)) {
        errors.push({ code: 'INVALID_STATE', message: 'Building requirements not met', path })
      }
      if (building.requirements.research && !hasResearchRequirement(player, building.requirements.research)) {
        errors.push({ code: 'INVALID_STATE', message: 'Research requirements not met', path })
      }

      // Extractors must sit ON their matching strategic deposit
      if (building.strategicProduction && slot.resourceNode !== building.strategicProduction.requiresNode) {
        errors.push({ code: 'INVALID_COMMAND', message: 'Extractor must be built on the matching deposit', path })
      }

      // Resource cost (only for new builds, not resumes)
      if (!isResumingSlotBuild(planet, command.slotIndex, command.buildingId)) {
        if (!canAfford(availableResources, building.resourceCosts) || !canAffordStrategic(availableStrategic, building.strategicCosts)) {
          errors.push({ code: 'INSUFFICIENT_RESOURCES', message: 'Not enough resources', path })
        } else {
          availableResources = subtractCosts(availableResources, building.resourceCosts)
          subtractStrategic(availableStrategic, building.strategicCosts)
        }
      }

      // Queue limit
      const pending = queueCounts.get(planet.id) ?? 0
      const existing = planet.queues.build.length + planet.queues.shipyard.length
      if (existing + pending + 1 > BUILD_QUEUE_LIMIT) {
        if (existing >= BUILD_QUEUE_LIMIT && pending === 0) {
          queueCounts.set(planet.id, 1)
        } else {
          errors.push({ code: 'INVALID_STATE', message: 'Build queue full', path })
        }
      } else {
        queueCounts.set(planet.id, pending + 1)
      }
      continue
    }

    if (command.type === 'buildUnit') {
      const planet = snapshot.planets.find(p => p.id === command.planetId)
      if (!planet) {
        errors.push({ code: 'NOT_FOUND', message: 'Planet not found', path })
        continue
      }
      if (planet.owner !== playerId) {
        errors.push({ code: 'NOT_OWNER', message: 'Planet not owned by player', path })
      }
      const unit = getUnitDef(command.unitId)
      if (!unit) {
        errors.push({ code: 'NOT_FOUND', message: 'Unit not found', path })
        continue
      }
      if (unit.requirements.buildings && !hasSlotBuildingRequirement(planet, unit.requirements.buildings)) {
        errors.push({ code: 'INVALID_STATE', message: 'Unit requirements not met', path })
      }
      if (unit.requirements.research && !hasResearchRequirement(player, unit.requirements.research)) {
        errors.push({ code: 'INVALID_STATE', message: 'Research requirements not met', path })
      }
      // Resource cost (only new builds)
      if (!isResumingUnitBuild(planet, command.unitId)) {
        if (!canAfford(availableResources, unit.resourceCosts) || !canAffordStrategic(availableStrategic, unit.strategicCosts)) {
          errors.push({ code: 'INSUFFICIENT_RESOURCES', message: 'Not enough resources', path })
        } else {
          availableResources = subtractCosts(availableResources, unit.resourceCosts)
          subtractStrategic(availableStrategic, unit.strategicCosts)
        }
      }
      const pending = queueCounts.get(planet.id) ?? 0
      const existing = planet.queues.build.length + planet.queues.shipyard.length
      if (existing + pending + 1 > BUILD_QUEUE_LIMIT) {
        if (existing >= BUILD_QUEUE_LIMIT && pending === 0) {
          queueCounts.set(planet.id, 1)
        } else {
          errors.push({ code: 'INVALID_STATE', message: 'Build queue full', path })
        }
      } else {
        queueCounts.set(planet.id, pending + 1)
      }
      continue
    }

    if (command.type === 'moveFleet') {
      const fleet = snapshot.fleets.find(f => f.id === command.fleetId)
      if (!fleet) {
        errors.push({ code: 'NOT_FOUND', message: 'Fleet not found', path })
        continue
      }
      if (fleet.ownerId !== playerId) {
        errors.push({ code: 'NOT_OWNER', message: 'Fleet not owned by player', path })
        continue
      }
      if (!snapshot.systems.some(s => s.id === command.toSystemId)) {
        errors.push({ code: 'NOT_FOUND', message: 'Target system not found', path })
        continue
      }
      const fromSystemId = getSystemIdForLocation(snapshot, fleet.location)
      if (!fromSystemId) {
        errors.push({ code: 'INVALID_STATE', message: 'Fleet location unknown', path })
        continue
      }
      if (findLanePath(snapshot.systems, fromSystemId, command.toSystemId) === null) {
        errors.push({ code: 'INVALID_COMMAND', message: 'No star-lane route to target system', path })
      }
      continue
    }

    errors.push({ code: 'INVALID_COMMAND', message: 'Unknown command', path })
  }

  return errors
}
