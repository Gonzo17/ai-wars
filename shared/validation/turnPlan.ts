import type { GameSnapshot, Planet, PlayerSnapshot, ResearchId } from '../types/game'
import type { TurnPlan, ValidationError } from '../types/turn'
import { BUILD_QUEUE_LIMIT, buildingSite, getBuildingDef, getUnitDef } from '../defs/production'
import { getProjectDef } from '../defs/projects'
import type { StrategicCosts } from '../defs/production'
import { findDistrictNode } from '../defs/districts'
import { hasResearchDistrict } from '../utils/districts'
import { terrainAllows } from '../defs/terrain'
import { TECH_DEFS } from '../defs/research-tree'
import { isBuildingAllowedInZone } from '../types/planetSlots'
import { queueItemCosts, reconcileProductionQueue } from '../utils/productionQueue'
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
    // Satisfied by a completed building in a slot, OR by the facility built as a district
    // node (e.g. the orbital dock is the Shipyard district's base node).
    const direct = planet.slots.find(s =>
      (s.buildingId === req.id && !s.isConstructing && s.buildingLevel >= req.level)
      || (s.nodes?.includes(req.id as never)))
    if (direct) continue
    const substitutes = FACILITY_SUBSTITUTES[req.id] ?? []
    const hasSubstitute = substitutes.length > 0
      && planet.slots.some(s => s.buildingId !== null && substitutes.includes(s.buildingId) && !s.isConstructing)
    if (!hasSubstitute) return false
  }
  return true
}

/** True when the planet has a founded district of `type` (its base node is built). */
const hasFoundedDistrict = (planet: Planet, type: string) =>
  planet.slots.some(s => s.districtType === type && (s.nodes?.length ?? 0) > 0)

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

export function validateTurnPlan(snapshot: GameSnapshot, playerId: string, plan: TurnPlan): ValidationError[] {
  const errors: ValidationError[] = []
  const player = snapshot.players.find(p => p.id === playerId)

  if (!player) {
    return [{ code: 'INVALID_STATE', message: 'Player not found in snapshot' }]
  }

  let hasResearchCommand = false
  let availableResources = getPlayerResources(player)
  const availableStrategic: Record<string, number> = {}
  for (const r of player.resources) availableStrategic[r.key] = r.current
  // The data center (Research district) must come first — gates every other district.
  const researchEstablished = hasResearchDistrict(snapshot.planets.filter(p => p.owner === playerId))

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

    if (command.type === 'setProductionQueue') {
      const planet = snapshot.planets.find(p => p.id === command.planetId)
      if (!planet) {
        errors.push({ code: 'NOT_FOUND', message: 'Planet not found', path })
        continue
      }
      if (planet.owner !== playerId) {
        errors.push({ code: 'NOT_OWNER', message: 'Planet not owned by player', path })
      }
      if (command.items.length > BUILD_QUEUE_LIMIT) {
        errors.push({ code: 'INVALID_STATE', message: 'Build queue full', path })
      }

      // Which items are newly added (and therefore must be paid for) — same
      // classification the engine uses, so validation and resolve agree.
      const { isNew } = reconcileProductionQueue(planet, command.items)
      const itemCosts = queueItemCosts(planet, command.items, isNew)
      const isStar = planet.kind === 'star'
      const seenSlots = new Set<number>()

      for (const [j, item] of command.items.entries()) {
        const itemPath = `${path}.items.${j}`

        if (item.kind === 'building') {
          if (seenSlots.has(item.slotIndex)) {
            errors.push({ code: 'INVALID_COMMAND', message: 'Two builds target the same slot', path: itemPath })
            continue
          }
          seenSlots.add(item.slotIndex)

          if (item.slotIndex < 0 || item.slotIndex >= planet.slots.length) {
            errors.push({ code: 'INVALID_COMMAND', message: 'Slot index out of range', path: itemPath })
            continue
          }

          // ── District node (planets) ──────────────────────────────────
          const districtNode = findDistrictNode(item.buildingId)
          if (districtNode) {
            const slot = planet.slots[item.slotIndex]!
            const dDef = districtNode.district
            const nDef = districtNode.node
            if (isStar) {
              errors.push({ code: 'INVALID_COMMAND', message: 'Districts cannot be built on a star', path: itemPath })
              continue
            }
            if (!dDef.availableOn.includes(planet.type)) {
              errors.push({ code: 'INVALID_COMMAND', message: 'District not available on this planet type', path: itemPath })
              continue
            }
            if (dDef.type !== 'research' && !researchEstablished) {
              errors.push({ code: 'INVALID_STATE', message: 'Build a Research district (data center) first', path: itemPath })
              continue
            }
            if (dDef.zone !== 'any' && slot.zone !== dDef.zone) {
              errors.push({ code: 'INVALID_COMMAND', message: 'District not allowed in this zone', path: itemPath })
              continue
            }
            if (slot.zone === 'surface' && !terrainAllows(slot.terrain, dDef.type)) {
              errors.push({ code: 'INVALID_COMMAND', message: 'District not allowed on this terrain', path: itemPath })
              continue
            }
            if (slot.districtType && slot.districtType !== dDef.type) {
              errors.push({ code: 'INVALID_STATE', message: 'Slot occupied by a different district', path: itemPath })
              continue
            }
            if (!slot.districtType && slot.buildingId) {
              errors.push({ code: 'INVALID_STATE', message: 'Slot already occupied', path: itemPath })
              continue
            }
            if ((slot.nodes ?? []).includes(item.buildingId)) {
              errors.push({ code: 'INVALID_STATE', message: 'District node already built', path: itemPath })
              continue
            }
            const inProgress = slot.buildingId === item.buildingId && slot.isConstructing
            if (!inProgress) {
              const built = new Set(slot.nodes ?? [])
              if (!nDef.prereqIds.every(p => built.has(p))) {
                errors.push({ code: 'INVALID_STATE', message: 'District node prerequisites not met', path: itemPath })
                continue
              }
              if (nDef.branchGroup) {
                const chosen = [...(slot.nodes ?? []), ...(slot.isConstructing && slot.buildingId ? [slot.buildingId] : [])]
                const conflict = dDef.tree.some(n => n.branchGroup === nDef.branchGroup && n.id !== item.buildingId && chosen.includes(n.id))
                if (conflict) {
                  errors.push({ code: 'INVALID_STATE', message: 'Another branch already chosen in this district', path: itemPath })
                  continue
                }
              }
            }
            if (nDef.research && !hasResearchRequirement(player, [nDef.research])) {
              errors.push({ code: 'INVALID_STATE', message: 'Research requirements not met', path: itemPath })
            }
            if (isNew[j]) {
              const cost = itemCosts[j]!
              if (!canAfford(availableResources, cost) || !canAffordStrategic(availableStrategic, cost.strategic)) {
                errors.push({ code: 'INSUFFICIENT_RESOURCES', message: 'Not enough resources', path: itemPath })
              } else {
                availableResources = subtractCosts(availableResources, cost)
                subtractStrategic(availableStrategic, cost.strategic)
              }
            }
            continue
          }

          // ── Legacy building / megastructure (stars) ──────────────────
          const building = getBuildingDef(item.buildingId)
          if (!building) {
            errors.push({ code: 'NOT_FOUND', message: 'Building not found', path: itemPath })
            continue
          }
          if (item.slotIndex < 0 || item.slotIndex >= planet.slots.length) {
            errors.push({ code: 'INVALID_COMMAND', message: 'Slot index out of range', path: itemPath })
            continue
          }
          const slot = planet.slots[item.slotIndex]!

          if (buildingSite(building) === 'star' && !isStar) {
            errors.push({ code: 'INVALID_COMMAND', message: 'Megastructure can only be built on a star', path: itemPath })
            continue
          }
          if (buildingSite(building) !== 'star' && isStar) {
            errors.push({ code: 'INVALID_COMMAND', message: 'This building cannot be built on a star', path: itemPath })
            continue
          }
          if (!isStar && !isBuildingAllowedInZone(item.buildingId, slot.zone)) {
            errors.push({ code: 'INVALID_COMMAND', message: 'Building not allowed in this zone', path: itemPath })
            continue
          }
          if (slot.buildingId !== null && slot.buildingId !== item.buildingId) {
            errors.push({ code: 'INVALID_STATE', message: 'Slot already occupied by a different building', path: itemPath })
            continue
          }
          if (slot.buildingId === item.buildingId && !slot.isConstructing) {
            errors.push({ code: 'INVALID_STATE', message: 'Building already completed in this slot', path: itemPath })
            continue
          }
          if (building.requirements.buildings && !hasSlotBuildingRequirement(planet, building.requirements.buildings)) {
            errors.push({ code: 'INVALID_STATE', message: 'Building requirements not met', path: itemPath })
          }
          if (building.requirements.research && !hasResearchRequirement(player, building.requirements.research)) {
            errors.push({ code: 'INVALID_STATE', message: 'Research requirements not met', path: itemPath })
          }
          if (building.strategicProduction && slot.resourceNode !== building.strategicProduction.requiresNode) {
            errors.push({ code: 'INVALID_COMMAND', message: 'Extractor must be built on the matching deposit', path: itemPath })
          }
          if (isNew[j]) {
            const cost = itemCosts[j]!
            if (!canAfford(availableResources, cost) || !canAffordStrategic(availableStrategic, cost.strategic)) {
              errors.push({ code: 'INSUFFICIENT_RESOURCES', message: 'Not enough resources', path: itemPath })
            } else {
              availableResources = subtractCosts(availableResources, cost)
              subtractStrategic(availableStrategic, cost.strategic)
            }
          }
          continue
        }

        // Project item — repeatable, no resource cost; only needs its district founded.
        if (item.kind === 'project') {
          const project = getProjectDef(item.projectId)
          if (!project) {
            errors.push({ code: 'NOT_FOUND', message: 'Project not found', path: itemPath })
            continue
          }
          if (!hasFoundedDistrict(planet, project.districtType)) {
            errors.push({ code: 'INVALID_STATE', message: 'Project requires its district', path: itemPath })
          }
          continue
        }

        // Unit item
        const unit = getUnitDef(item.unitId)
        if (!unit) {
          errors.push({ code: 'NOT_FOUND', message: 'Unit not found', path: itemPath })
          continue
        }
        if (unit.requirements.buildings && !hasSlotBuildingRequirement(planet, unit.requirements.buildings)) {
          errors.push({ code: 'INVALID_STATE', message: 'Unit requirements not met', path: itemPath })
        }
        if (unit.requirements.research && !hasResearchRequirement(player, unit.requirements.research)) {
          errors.push({ code: 'INVALID_STATE', message: 'Research requirements not met', path: itemPath })
        }
        if (isNew[j]) {
          const cost = itemCosts[j]!
          if (!canAfford(availableResources, cost) || !canAffordStrategic(availableStrategic, cost.strategic)) {
            errors.push({ code: 'INSUFFICIENT_RESOURCES', message: 'Not enough resources', path: itemPath })
          } else {
            availableResources = subtractCosts(availableResources, cost)
            subtractStrategic(availableStrategic, cost.strategic)
          }
        }
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
