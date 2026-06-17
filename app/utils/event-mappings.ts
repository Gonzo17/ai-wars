/** Centralized icon mapping for game concepts - use these across the UI for consistency */
export const gameIcons = {
  research: 'i-lucide-flask-conical',
  building: 'i-lucide-building',
  ship: 'i-lucide-rocket',
  shipyard: 'i-lucide-ship',
  movement: 'i-lucide-navigation',
  combat: 'i-lucide-swords',
  colony: 'i-lucide-flag',
  star: 'i-lucide-sun',
  discovery: 'i-lucide-compass',
  diplomatic: 'i-lucide-handshake',
  planet: 'i-lucide-earth'
} as const

export const eventTypeIcons: Record<GameEventType, string> = {
  'research-complete': gameIcons.research,
  'building-complete': gameIcons.building,
  'ship-complete': gameIcons.ship,
  'army-arrived': gameIcons.movement,
  'combat': gameIcons.combat,
  'colony-established': gameIcons.colony,
  'star-captured': gameIcons.star,
  'discovery': gameIcons.discovery,
  'diplomatic': gameIcons.diplomatic
}

export const eventSeverityColors: Record<GameEventSeverity, string> = {
  info: 'text-info-400',
  success: 'text-success-400',
  warning: 'text-warning-400',
  critical: 'text-critical-400'
}

export interface SeverityStyle {
  border: string
  glow: string
  icon: string
}

export const eventSeverityStyles: Record<GameEventSeverity, SeverityStyle> = {
  info: {
    border: 'border-info-500/50',
    glow: 'shadow-info-500/20',
    icon: 'text-info-400'
  },
  success: {
    border: 'border-success-500/50',
    glow: 'shadow-success-500/20',
    icon: 'text-success-400'
  },
  warning: {
    border: 'border-warning-500/50',
    glow: 'shadow-warning-500/20',
    icon: 'text-warning-400'
  },
  critical: {
    border: 'border-critical-500/50',
    glow: 'shadow-critical-500/20',
    icon: 'text-critical-400'
  }
}
