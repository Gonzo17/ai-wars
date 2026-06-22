import type { TerrainType } from '../types/game'
import type { DistrictType } from '../types/districts'

/**
 * Surface terrain. Each terrain scales (or forbids) districts by type: a multiplier of
 * 0 means the district cannot be built on that terrain at all, >1 is a bonus, <1 a malus,
 * and an absent entry is neutral (×1). The modifier is keyed by district type and applied
 * to that district's whole output (a district produces one main resource, so this scales
 * the right thing). Orbital slots have no terrain → always neutral.
 */
export interface TerrainDef {
  icon: string
  /** Per-district multiplier; 0 = forbidden, missing = 1 (neutral). */
  modifiers: Partial<Record<DistrictType, number>>
}

export const TERRAIN_DEFS: Record<TerrainType, TerrainDef> = {
  // 🌾 Plains — flexible baseline, everything allowed at ×1.
  plains: { icon: 'i-lucide-sprout', modifiers: {} },
  // ⛰ Mountains — rich ore, poor power, no room for labs.
  mountains: { icon: 'i-lucide-mountain', modifiers: { matter: 1.3, energy: 0.7, research: 0 } },
  // 🌋 Volcanic — geothermal power & industry, hostile to labs.
  volcanic: { icon: 'i-lucide-flame', modifiers: { energy: 1.4, matter: 0.8, production: 1.15, research: 0 } },
  // ❄ Tundra — cold compute, weak power and mining.
  tundra: { icon: 'i-lucide-snowflake', modifiers: { research: 1.3, energy: 0.8, matter: 0.8 } }
}

/** Multiplier for `district` on `terrain` (1 if no terrain / no entry; 0 = forbidden). */
export function terrainModifier(terrain: TerrainType | null | undefined, district: DistrictType): number {
  if (!terrain) return 1
  return TERRAIN_DEFS[terrain].modifiers[district] ?? 1
}

/** Whether `district` may be built on `terrain` at all. */
export function terrainAllows(terrain: TerrainType | null | undefined, district: DistrictType): boolean {
  return terrainModifier(terrain, district) !== 0
}

export const TERRAIN_ICONS: Record<TerrainType, string> = Object.fromEntries(
  Object.entries(TERRAIN_DEFS).map(([k, v]) => [k, v.icon])
) as Record<TerrainType, string>
