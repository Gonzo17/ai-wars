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

export interface SeverityStyle {
  border: string
  glow: string
  icon: string
}

export const eventSeverityStyles: Record<GameEventSeverity, SeverityStyle> = {
  info: {
    border: 'border-cyan-500/50',
    glow: 'shadow-cyan-500/20',
    icon: 'text-cyan-400'
  },
  success: {
    border: 'border-emerald-500/50',
    glow: 'shadow-emerald-500/20',
    icon: 'text-emerald-400'
  },
  warning: {
    border: 'border-amber-500/50',
    glow: 'shadow-amber-500/20',
    icon: 'text-amber-400'
  },
  critical: {
    border: 'border-rose-500/50',
    glow: 'shadow-rose-500/20',
    icon: 'text-rose-400'
  }
}
