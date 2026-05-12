import type { PlayerId } from '../types/game'

export function toPlayerId(userId: string): PlayerId {
  return `player:${userId}` satisfies PlayerId
}
