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
    if (!planet.queues?.production) {
      planet.queues = { production: [] }
    }
    const queue = planet.queues.production
    if (queue.length === 0) {
      planet.productionCarryover = 0
      continue
    }

    const available = (planet.workers * planet.productionPerWorker) + (planet.productionCarryover ?? 0)
    planet.productionCarryover = 0

    // Only the front item makes progress this turn; on completion the leftover
    // production carries to next turn (it does NOT cascade into the next item now).
    const entry = queue[0]!

    if (entry.kind === 'building') {
      const slot = planet.slots[entry.slotIndex]
      if (!slot || !slot.buildingId || !slot.isConstructing) {
        // Stale entry (slot was cancelled/freed) — drop it.
        planet.queues.production = queue.slice(1)
        continue
      }
      const def = getBuildingDef(slot.buildingId)
      const overflow = available - slot.constructionTimeLeft
      slot.constructionTimeLeft = Math.max(0, slot.constructionTimeLeft - available)

      if (slot.constructionTimeLeft <= 0) {
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
        planet.queues.production = queue.slice(1)
        if (overflow > 0) planet.productionCarryover = overflow
      }
      continue
    }

    // ── Unit item ────────────────────────────────────────────────────
    const def = getUnitDef(entry.unitId)
    const productionCost = def?.productionCost ?? 0
    const remaining = Math.max(0, productionCost - entry.productionSpent)
    const overflow = available - remaining

    if (available >= remaining) {
      if (entry.unitId === 'unit:worker') {
        planet.workers += 1
      } else {
        // Assign a unique instance id; the def id stays available via defId.
        snapshot.fleets.push({
          id: `${entry.unitId}@${planet.id}@t${turn}` as UnitId,
          defId: entry.unitId,
          type: def?.unitType ?? 'battleship',
          name: entry.unitId,
          status: 'idle',
          location: planet.id,
          strength: def?.strength ?? 1,
          ownerId: planet.owner as Unit['ownerId']
        } as Unit)
      }
      if (planet.owner !== 'unclaimed' && planet.owner !== 'unknown') {
        addEvent(snapshot, planet.owner, {
          id: nextEventId(),
          type: 'ship-complete',
          severity: 'success',
          year: turn,
          titleKey: 'events.types.ship-complete.title',
          titleParams: { name: unitNameKey(entry.unitId) },
          descriptionKey: 'events.types.ship-complete.description',
          descriptionParams: { location: getPlanetName(snapshot, planet.id) },
          relatedEntityId: planet.id,
          relatedEntityType: 'planet',
          read: false,
          timestamp: Date.now()
        })
      }
      planet.queues.production = queue.slice(1)
      if (overflow > 0) planet.productionCarryover = overflow
    } else {
      entry.productionSpent += available
    }
  }
}
