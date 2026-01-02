export interface GameResource {
  key: string
  label: string
  amount: number
  delta: string
  accent: string
  icon: string
}

export interface GameArmy {
  id: string
  name: string
  status: 'idle' | 'en-route'
  location: string
  eta?: string
  strength: number
}

export interface GamePlanet {
  id: string
  systemId: string
  name: string
  owner: string
  type: string
  buildings: string[]
  queues: {
    build: string[]
    shipyard: string[]
  }
  location: {
    x: number
    y: number
  }
}

export interface GameSolarSystem {
  id: string
  name: string
  probeStatus: 'scanned' | 'charted' | 'ping-only'
  intel: 'high' | 'medium' | 'low'
  connections: string[]
  location: {
    x: number
    y: number
  }
}
