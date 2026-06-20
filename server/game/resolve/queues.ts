import { getBuildingDef, getUnitDef } from '~~/shared/defs/production'
import type { GameSnapshot, Unit, UnitId } from '~~/shared/types/game'
import { addEvent, buildingNameKey, getPlanetName, unitNameKey } from './events'

/**
 * Keep each player's empireState in sync with ownership: planets controlled,
 * stars controlled, and the highest Dyson-sphere stage built on any owned star.
 * These drive the stellar ascension gates (K2.0 onward).
 */
export function updatePlanetsControlled(snapshot: GameSnapshot) {
  for (const player of snapshot.players) {
    const owned = snapshot.planets.filter(p => p.owner === player.id)
    const ownedStars = owned.filter(p => p.kind === 'star')
    let dysonStages = 0
    for (const star of ownedStars) {
      for (const slot of star.slots) {
        if (slot.buildingId === 'bld:dyson-sphere' && !slot.isConstructing) {
          dysonStages = Math.max(dysonStages, slot.buildingLevel)
        }
      }
    }
    player.research.empireState.planetsControlled = owned.filter(p => p.kind !== 'star').length
    player.research.empireState.starsControlled = ownedStars.length
    player.research.empireState.dysonStages = dysonStages
  }
}

export function advanceQueues(snapshot: GameSnapshot, turn: number, nextEventId: () => string) {
  for (const planet of snapshot.planets) {
    if (planet.queues.build.length > 0) {
      planet.queues.build = planet.queues.build.slice(0, 1)
      planet.queues.shipyard = []
    } else if (planet.queues.shipyard.length > 0) {
      planet.queues.shipyard = planet.queues.shipyard.slice(0, 1)
    }

    if (!planet.progressMemory) {
      planet.progressMemory = {}
    }

    const available = (planet.workers * planet.productionPerWorker) + (planet.productionCarryover ?? 0)
    planet.productionCarryover = 0

    // ── Building queue (slot-based) ──────────────────────────────────
    const buildQueue = planet.queues.build
    if (buildQueue.length > 0) {
      const entry = buildQueue[0]!
      const slot = planet.slots[entry.slotIndex]
      if (!slot || !slot.buildingId || !slot.isConstructing) {
        // Invalid queue entry — clear it
        planet.queues.build = []
        continue
      }
      const def = getBuildingDef(slot.buildingId)
      const remaining = Math.max(0, slot.constructionTimeLeft - available)
      const overflow = available - slot.constructionTimeLeft
      slot.constructionTimeLeft = remaining

      if (remaining <= 0) {
        slot.isConstructing = false
        slot.constructionTimeLeft = 0

        if (planet.owner !== 'unclaimed' && planet.owner !== 'unknown') {
          addEvent(snapshot, planet.owner, {
            id: nextEventId(),
            type: 'building-complete',
            severity: 'success',
            year: turn,
            titleKey: 'events.types.building-complete.title',
            titleParams: { name: buildingNameKey(slot.buildingId) },
            descriptionKey: 'events.types.building-complete.description',
            descriptionParams: { location: getPlanetName(snapshot, planet.id) },
            details: [
              { labelKey: 'events.details.energy-used', value: String(def?.resourceCosts.energy ?? 0), icon: 'i-lucide-zap' },
              { labelKey: 'events.details.materials-used', value: String(def?.resourceCosts.minerals ?? 0), icon: 'i-lucide-wrench' }
            ],
            relatedEntityId: planet.id,
            relatedEntityType: 'planet',
            read: false,
            timestamp: Date.now()
          })
        }
        planet.queues.build = buildQueue.slice(1)
        if (overflow > 0) {
          planet.productionCarryover = overflow
        }
      }
      continue
    }

    // ── Shipyard queue (unit-based, unchanged) ───────────────────────
    const shipyardQueue = planet.queues.shipyard
    if (shipyardQueue.length > 0) {
      const current = shipyardQueue[0]!
      const def = getUnitDef(current.id)
      const productionCost = def?.productionCost ?? 0
      const remaining = Math.max(0, (current.eta ?? 0) - available)
      const overflow = available - (current.eta ?? 0)
      current.eta = remaining
      const spent = Math.max(0, productionCost - remaining)
      planet.progressMemory[current.id] = { productionSpent: spent, resourcePaid: true }
      if (remaining <= 0) {
        if (current.id === 'unit:worker') {
          planet.workers += 1
        } else {
          // Assign a unique instance id; the def id stays available via defId
          snapshot.fleets.push({
            ...current,
            id: `${current.id}@${planet.id}@t${turn}` as UnitId,
            defId: current.id,
            eta: undefined,
            location: planet.id
          } as Unit)
        }
        planet.progressMemory = Object.fromEntries(
          Object.entries(planet.progressMemory).filter(([key]) => key !== current.id)
        )
        if (planet.owner !== 'unclaimed' && planet.owner !== 'unknown') {
          addEvent(snapshot, planet.owner, {
            id: nextEventId(),
            type: 'ship-complete',
            severity: 'success',
            year: turn,
            titleKey: 'events.types.ship-complete.title',
            titleParams: { name: unitNameKey(current.id) },
            descriptionKey: 'events.types.ship-complete.description',
            descriptionParams: { location: getPlanetName(snapshot, planet.id) },
            relatedEntityId: planet.id,
            relatedEntityType: 'planet',
            read: false,
            timestamp: Date.now()
          })
        }
        planet.queues.shipyard = shipyardQueue.slice(1)
        if (overflow > 0) {
          planet.productionCarryover = overflow
        }
      }
    }
  }
}
