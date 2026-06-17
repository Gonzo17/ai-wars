import type { ResearchId, ResourceId, ResourceNodeType } from '../types/game'

/**
 * Strategic resources (Civ-style): discovered via a survey tech, mined by a
 * dedicated extractor placed ON the matching deposit, then spent to build certain
 * advanced structures/units. They live as first-class entries in the player's
 * `resources` array alongside energy/material/rare, but are produced and spent
 * through the `strategicProduction` / `strategicCosts` hooks on the defs rather
 * than the base {energy, minerals, rare} cost shape.
 *
 * This file is the single source of truth tying resource ⇄ deposit ⇄ survey tech.
 */
export interface StrategicResourceDef {
  id: ResourceId
  nodeType: ResourceNodeType
  /** Researching this reveals the deposit and unlocks its extractor. */
  surveyTech: ResearchId
  /** Storage cap for the player stock. */
  max: number
}

export const STRATEGIC_RESOURCES: StrategicResourceDef[] = [
  { id: 'res:exotic-matter', nodeType: 'exotic-matter', surveyTech: 'tech:exotic-matter-survey', max: 500 },
  { id: 'res:antimatter', nodeType: 'antimatter', surveyTech: 'tech:antimatter-containment', max: 500 }
]

export const STRATEGIC_RESOURCE_IDS: ResourceId[] = STRATEGIC_RESOURCES.map(r => r.id)

export const isStrategicResource = (key: string): boolean =>
  STRATEGIC_RESOURCE_IDS.includes(key as ResourceId)

export const getStrategicResource = (id: string): StrategicResourceDef | undefined =>
  STRATEGIC_RESOURCES.find(r => r.id === id)

export const getStrategicByNode = (node: ResourceNodeType | null): StrategicResourceDef | undefined =>
  node ? STRATEGIC_RESOURCES.find(r => r.nodeType === node) : undefined
