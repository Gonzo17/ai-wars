export type GameEventType
  = | 'research-complete'
    | 'building-complete'
    | 'ship-complete'
    | 'army-arrived'
    | 'combat'
    | 'discovery'
    | 'diplomatic'

export type GameEventSeverity = 'info' | 'success' | 'warning' | 'critical'

export interface GameEventDetail {
  label: string
  value: string
  icon?: string
}

export interface GameEvent {
  id: string
  type: GameEventType
  severity: GameEventSeverity
  year: number
  title: string
  description: string
  details?: GameEventDetail[]
  relatedEntityId?: string
  relatedEntityType?: 'planet' | 'army' | 'system'
  read: boolean
  showToast?: boolean
  timestamp: number
}

export type GameEventFilter = GameEventType | 'all'
