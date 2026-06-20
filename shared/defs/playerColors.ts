// Player colours, chosen in the lobby and used for the planet/ownership rings
// on the map. Shared so the lobby (client) and startLobby (server) agree.

/** Distinct, dark-background-readable colours offered in the lobby. */
export const PLAYER_COLORS = [
  '#ef4444', // red
  '#3b82f6', // blue
  '#22c55e', // green
  '#f59e0b', // amber
  '#a855f7', // violet
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#84cc16' // lime
] as const

/** Ring colour for an unclaimed planet. */
export const UNCLAIMED_COLOR = '#9ca3af' // neutral grey

/**
 * First palette colour not already taken — used to auto-assign a colour the
 * moment a player joins a lobby, so the "no colour chosen" state never exists.
 * Falls back to the first colour if the palette is exhausted.
 */
export function nextFreeColor(taken: Array<string | null | undefined>): string {
  const used = new Set(taken.filter((c): c is string => Boolean(c)))
  return (PLAYER_COLORS as readonly string[]).find(c => !used.has(c)) ?? PLAYER_COLORS[0]
}

/**
 * Fill in a colour for every player: keep any colour they picked, and assign
 * remaining players the next free palette colour (avoiding collisions). Falls
 * back to cycling the palette if there are more players than colours.
 */
export function assignPlayerColors(
  players: Array<{ user_id: string, color?: string | null }>
): Array<{ userId: string, color: string }> {
  const palette = PLAYER_COLORS as readonly string[]
  const used = new Set(players.map(p => p.color).filter((c): c is string => Boolean(c)))
  let next = 0
  const nextFree = (): string => {
    while (next < palette.length && used.has(palette[next]!)) next++
    const color = palette[next % palette.length] ?? UNCLAIMED_COLOR
    next++
    used.add(color)
    return color
  }
  return players.map(p => ({ userId: p.user_id, color: p.color || nextFree() }))
}
