import type { GameSnapshot, PlayerId, VictoryCondition, VictoryProgress, VictoryState } from '~~/shared/types/game'
import { MILITARY_HOLD_TURNS, playerMeetsMilitary } from '~~/shared/utils/victory'
import { addEvent } from './events'

/** i18n value key for a condition name (mirrors the combat `outcome` param pattern). */
const conditionValueKey = (condition: VictoryCondition) => `events.values.condition-${condition}`

/** Telegraph a victory event to EVERY player — wins are globally announced (fairness). */
function announce(
  snapshot: GameSnapshot,
  nextEventId: () => string,
  subjectId: PlayerId,
  newTurn: number,
  payload: {
    type: 'victory' | 'victory-imminent'
    titleKey: string
    descriptionKey: string
    descriptionParams?: Record<string, string | number>
  }
) {
  for (const viewer of snapshot.players) {
    addEvent(snapshot, viewer.id, {
      id: nextEventId(),
      type: payload.type,
      severity: viewer.id === subjectId ? 'success' : 'critical',
      year: newTurn,
      titleKey: payload.titleKey,
      descriptionKey: payload.descriptionKey,
      descriptionParams: payload.descriptionParams,
      read: false,
      timestamp: Date.now()
    })
  }
}

/**
 * Evaluate victory conditions on the post-resolution snapshot (run AFTER
 * `updatePlanetsControlled`). Shared shape: a player meeting a trigger starts a
 * countdown; holding it for the condition's hold duration wins. Breaking the
 * trigger drops the countdown. Mutates `snapshot.victory` and emits events;
 * returns the winner id (if any) so the orchestrator can finish the game.
 *
 * `newTurn` is the turn of the snapshot being written (i.e. resolving turn + 1).
 * Only the Military path is implemented; Expansion/Research slot in here later.
 */
export function resolveVictory(snapshot: GameSnapshot, newTurn: number, nextEventId: () => string): { winnerId?: PlayerId } {
  const victory: VictoryState = snapshot.victory ?? { pending: [] }

  // Game already decided — leave it be.
  if (victory.winnerId) {
    snapshot.victory = victory
    return { winnerId: victory.winnerId }
  }

  const nextPending: VictoryProgress[] = []
  let winner: { playerId: PlayerId, condition: VictoryCondition } | undefined

  for (const player of snapshot.players) {
    if (!playerMeetsMilitary(snapshot, player.id)) continue

    const existing = victory.pending.find(p => p.playerId === player.id && p.condition === 'military')
    const entry: VictoryProgress = existing ?? {
      playerId: player.id,
      condition: 'military',
      startedTurn: newTurn,
      winTurn: newTurn + MILITARY_HOLD_TURNS
    }
    nextPending.push(entry)

    if (!existing) {
      announce(snapshot, nextEventId, player.id, newTurn, {
        type: 'victory-imminent',
        titleKey: 'events.types.victory-imminent.title',
        descriptionKey: 'events.types.victory-imminent.description',
        descriptionParams: { condition: conditionValueKey('military'), turns: MILITARY_HOLD_TURNS }
      })
    }

    if (newTurn >= entry.winTurn && !winner) {
      winner = { playerId: player.id, condition: 'military' }
    }
  }

  victory.pending = nextPending

  if (winner) {
    victory.winnerId = winner.playerId
    victory.winningCondition = winner.condition
    victory.pending = []
    announce(snapshot, nextEventId, winner.playerId, newTurn, {
      type: 'victory',
      titleKey: 'events.types.victory.title',
      descriptionKey: 'events.types.victory.description',
      descriptionParams: { condition: conditionValueKey(winner.condition) }
    })
  }

  snapshot.victory = victory
  return { winnerId: victory.winnerId }
}
