import { describe, expect, it } from 'vitest'
import { PLAYER_COLORS, nextFreeColor } from '../../shared/defs/playerColors'

describe('nextFreeColor', () => {
  it('returns the first colour when none are taken', () => {
    expect(nextFreeColor([])).toBe(PLAYER_COLORS[0])
  })

  it('skips already-taken colours', () => {
    expect(nextFreeColor([PLAYER_COLORS[0]])).toBe(PLAYER_COLORS[1])
    expect(nextFreeColor([PLAYER_COLORS[0], PLAYER_COLORS[1]])).toBe(PLAYER_COLORS[2])
  })

  it('ignores null/undefined entries', () => {
    expect(nextFreeColor([null, undefined, PLAYER_COLORS[0]])).toBe(PLAYER_COLORS[1])
  })

  it('falls back to the first colour when the palette is exhausted', () => {
    expect(nextFreeColor([...PLAYER_COLORS])).toBe(PLAYER_COLORS[0])
  })
})
