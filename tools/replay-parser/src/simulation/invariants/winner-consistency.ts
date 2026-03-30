import type { BattleEvent } from "@pokemon-lib-ts/battle";
import { BATTLE_EVENT_TYPES } from "@pokemon-lib-ts/battle";
import type { Invariant, InvariantViolation } from "../types.js";

/** Invariant 14: Winner side has fewer faints than the loser side
 *  Invariant 15: Loser side has all Pokemon fainted
 *
 *  Only checked when there are faint events in the stream (i.e. a real battle was played out).
 *  Minimal event streams with no faint events are not checked to avoid false positives. */
export const winnerConsistency: Invariant = {
  name: "winner-consistency",
  description: "Winner must have surviving Pokemon; loser must have all fainted",
  check(events, _config) {
    const violations: InvariantViolation[] = [];
    const faintedBySide: [Set<string>, Set<string>] = [new Set(), new Set()];
    let battleEndIndex = -1;
    let battleEndWinner: 0 | 1 | null = null;

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      if (!event) continue;
      if (event.type === BATTLE_EVENT_TYPES.faint) {
        const e = event as Extract<BattleEvent, { type: "faint" }>;
        faintedBySide[e.side].add(`${e.side}:${e.pokemon}`);
      }
      if (event.type === BATTLE_EVENT_TYPES.battleEnd) {
        const e = event as Extract<BattleEvent, { type: "battle-end" }>;
        battleEndIndex = i;
        battleEndWinner = e.winner;
      }
    }

    // Only check if we have a declared winner AND there were faint events (real battle)
    if (battleEndWinner === null || battleEndIndex === -1) return [];
    const faintsBySide: [number, number] = [faintedBySide[0].size, faintedBySide[1].size];
    const totalFaints = faintsBySide[0] + faintsBySide[1];
    if (totalFaints === 0) return []; // no faint data — skip check

    const winner = battleEndWinner;
    const loser = (winner === 0 ? 1 : 0) as 0 | 1;

    // Loser must have at least one faint
    if (faintsBySide[loser] === 0) {
      violations.push({
        invariant: "winner-consistency",
        severity: "error",
        turnNumber: null,
        message: `Loser (side ${loser}) has 0 faints — expected at least 1`,
        eventIndex: battleEndIndex,
      } satisfies InvariantViolation);
    }

    // Winner must have fewer faints than loser (winner had at least one survivor)
    if (faintsBySide[loser] > 0 && faintsBySide[winner] > faintsBySide[loser]) {
      violations.push({
        invariant: "winner-consistency",
        severity: "error",
        turnNumber: null,
        message: `Winner (side ${winner}) has ${faintsBySide[winner]} faints but loser (side ${loser}) has only ${faintsBySide[loser]} — winner should have fewer faints`,
        eventIndex: battleEndIndex,
      } satisfies InvariantViolation);
    }

    return violations;
  },
};
