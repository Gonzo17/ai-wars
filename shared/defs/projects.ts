import type { ProjectId, ResourceId } from '../types/game'
import type { DistrictType } from '../types/districts'

/**
 * Repeatable PROJECTS. Unlike buildings/units, a project occupies no slot and costs no
 * resources up-front — it simply CONSUMES the planet's production (build throughput) and,
 * on completion, yields a lump of a resource or research. It then pops off the queue, so
 * the player re-queues it to run again. Each project belongs to a district and is offered
 * as a sub-item of that district (e.g. the Research district's "push research" project),
 * giving you something useful to build when a planet is otherwise fully developed.
 */
export interface ProjectDef {
  id: ProjectId
  /** The district this project is offered under; it must be founded on the planet. */
  districtType: DistrictType
  /** Production (hammers) needed to complete one run. */
  productionCost: number
  /** Applied to the owner on completion: a resource lump and/or research points. */
  output: { resource?: ResourceId, amount?: number, research?: number }
  icon: string
}

const p = (id: string): ProjectId => id as ProjectId

export const PROJECT_DEFS: ProjectDef[] = [
  // Push research: convert production into research points on the active project.
  { id: p('proj:research-initiative'), districtType: 'research', productionCost: 80, output: { research: 60 }, icon: 'i-lucide-flask-conical' },
  // Stockpile conversions — turn idle production into a resource.
  { id: p('proj:energy-reserve'), districtType: 'energy', productionCost: 70, output: { resource: 'res:energy', amount: 90 }, icon: 'i-lucide-zap' },
  { id: p('proj:matter-reserve'), districtType: 'matter', productionCost: 70, output: { resource: 'res:material', amount: 90 }, icon: 'i-lucide-pickaxe' }
]

export const getProjectDef = (id: ProjectId | string): ProjectDef | undefined =>
  PROJECT_DEFS.find(def => def.id === id)

export const projectsForDistrict = (type: DistrictType): ProjectDef[] =>
  PROJECT_DEFS.filter(def => def.districtType === type)
