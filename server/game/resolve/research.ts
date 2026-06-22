import { TECH_DEFS } from '~~/shared/defs/research-tree'
import type { GameSnapshot, PlayerSnapshot, ResearchId } from '~~/shared/types/game'
import { getResearchPointsPerTurn } from '~~/shared/utils/economy'
import { lockedDoctrineGroups } from '~~/shared/utils/techBuffs'
import { addEvent, getPlanetName, techNameKey } from './events'

export function updateAvailableResearch(player: PlayerSnapshot) {
  const completed = new Set(player.research.completedTechIds)
  const activeId = player.research.activeResearch?.techId
  // A doctrine fork is permanent: once one sibling is completed, the others lock out.
  const lockedGroups = lockedDoctrineGroups(TECH_DEFS, completed)
  player.availableResearchIds = TECH_DEFS
    .filter(tech => !completed.has(tech.id) && tech.prerequisites.every(id => completed.has(id)))
    .filter(tech => !(tech.doctrineGroup && lockedGroups.has(tech.doctrineGroup)))
    .map(tech => tech.id as ResearchId)
    .filter(id => id !== activeId)
}

export function advanceResearch(snapshot: GameSnapshot, turn: number, nextEventId: () => string) {
  for (const player of snapshot.players) {
    const active = player.research.activeResearch
    if (!active) {
      updateAvailableResearch(player)
      continue
    }
    const tech = TECH_DEFS.find(t => t.id === active.techId)
    if (!tech) continue
    const requiredPoints = tech.researchPoints ?? 0
    const increment = getResearchPointsPerTurn(snapshot.planets, player.id, player.research.completedTechIds)
    active.progressPoints = Math.min(requiredPoints, active.progressPoints + increment)
    if (active.progressPoints >= requiredPoints) {
      player.research.completedTechIds.push(active.techId)
      player.research.activeResearch = undefined
      player.research.progressMemory = Object.fromEntries(
        Object.entries(player.research.progressMemory).filter(([key]) => key !== active.techId)
      )
      const locationId = player.planets[0]
      addEvent(snapshot, player.id, {
        id: nextEventId(),
        type: 'research-complete',
        severity: 'success',
        year: turn,
        titleKey: 'events.types.research-complete.title',
        titleParams: { name: techNameKey(active.techId as ResearchId) },
        descriptionKey: 'events.types.research-complete.description',
        descriptionParams: { location: locationId ? getPlanetName(snapshot, locationId) : 'Unknown' },
        details: [
          {
            labelKey: 'events.details.research-points',
            value: String(requiredPoints),
            icon: 'i-lucide-flask'
          }
        ],
        relatedEntityId: active.techId,
        relatedEntityType: 'research',
        read: false,
        timestamp: Date.now()
      })
    }
    updateAvailableResearch(player)
  }
}
