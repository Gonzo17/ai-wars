import type { GameEventType, GameEventSeverity } from '~~/shared/types/events'

export const eventTypeIcons: Record<GameEventType, string> = {
  'research-complete': 'i-lucide-flask-conical',
  'building-complete': 'i-lucide-building',
  'ship-complete': 'i-lucide-rocket',
  'army-arrived': 'i-lucide-navigation',
  'combat': 'i-lucide-swords',
  'discovery': 'i-lucide-compass',
  'diplomatic': 'i-lucide-handshake'
}

export const eventSeverityColors: Record<GameEventSeverity, string> = {
  info: 'text-cyan-400',
  success: 'text-emerald-400',
  warning: 'text-amber-400',
  critical: 'text-rose-400'
}
