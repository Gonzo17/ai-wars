export type GameEventType
  = 'research-complete'
    | 'building-complete'
    | 'ship-complete'
    | 'army-arrived'
    | 'combat'
    | 'discovery'
    | 'diplomatic'

export type GameEventSeverity = 'info' | 'success' | 'warning' | 'critical'

export interface GameEventDetail {
  labelKey: string
  value: string
  valueParams?: Record<string, string | number>
  icon?: string
}

export interface GameEvent {
  id: string
  type: GameEventType
  severity: GameEventSeverity
  year: number
  titleKey: string
  titleParams?: Record<string, string | number>
  descriptionKey: string
  descriptionParams?: Record<string, string | number>
  details?: GameEventDetail[]
  relatedEntityId?: string
  relatedEntityType?: 'planet' | 'army' | 'system'
  read: boolean
  showToast?: boolean
  timestamp: number
}

export type GameEventFilter = GameEventType | 'all'

export interface GameToast {
  id: string
  eventId: string
  event: GameEvent
  duration: number
  requiresDismiss: boolean
  createdAt: number
}
