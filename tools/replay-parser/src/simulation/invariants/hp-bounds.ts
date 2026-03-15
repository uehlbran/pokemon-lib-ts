import type { BattleEvent } from "@pokemon-lib-ts/battle";
import type { Invariant, InvariantViolation } from "../types.js";

function violation(
  invariant: string,
  message: string,
  eventIndex: number,
  turnNumber: number | null = null,
): InvariantViolation {
  return { invariant, severity: "error", turnNumber, message, eventIndex };
}

/** Invariant 5: 0 ≤ currentHp ≤ maxHp on every damage/heal event */
export const hpBounds: Invariant = {
  name: "hp-bounds",
  description: "currentHp must be between 0 and maxHp inclusive on all damage/heal events",
  check(events, _config) {
    const violations: InvariantViolation[] = [];
    let currentTurn: number | null = null;
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      if (!event) continue;
      if (event.type === "turn-start") {
        const e = event as Extract<BattleEvent, { type: "turn-start" }>;
        currentTurn = e.turnNumber;
      }
      if (event.type === "damage" || event.type === "heal") {
        const e = event as
          | Extract<BattleEvent, { type: "damage" }>
          | Extract<BattleEvent, { type: "heal" }>;
        if (e.currentHp < 0 || e.currentHp > e.maxHp) {
          violations.push(
            violation(
              "hp-bounds",
              `Side ${e.side} pokemon ${e.pokemon}: currentHp=${e.currentHp} out of [0, ${e.maxHp}]`,
              i,
              currentTurn,
            ),
          );
        }
        if (e.maxHp <= 0) {
          violations.push(
            violation(
              "hp-bounds",
              `Side ${e.side} pokemon ${e.pokemon}: maxHp=${e.maxHp} is not positive`,
              i,
              currentTurn,
            ),
          );
        }
      }
    }
    return violations;
  },
};

/** Invariant 6: damage.amount >= 0 for all damage events (0 is allowed for edge-case rounding) */
export const positiveDamage: Invariant = {
  name: "positive-damage",
  description:
    "Damage amount must be non-negative (negative damage is clearly wrong; 0 is valid for floor-rounding edge cases)",
  check(events, _config) {
    const violations: InvariantViolation[] = [];
    let currentTurn: number | null = null;
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      if (!event) continue;
      if (event.type === "turn-start") {
        const e = event as Extract<BattleEvent, { type: "turn-start" }>;
        currentTurn = e.turnNumber;
      }
      if (event.type === "damage") {
        const e = event as Extract<BattleEvent, { type: "damage" }>;
        if (e.amount < 0) {
          violations.push(
            violation(
              "positive-damage",
              `Side ${e.side} pokemon ${e.pokemon}: damage amount ${e.amount} is negative`,
              i,
              currentTurn,
            ),
          );
        }
      }
    }
    return violations;
  },
};

/** Invariant 7: damage amount is consistent with HP change direction */
export const hpDeltaConsistency: Invariant = {
  name: "hp-delta-consistency",
  description:
    "Damage must reduce HP (not increase it); declared amount must be >= actual HP drop (overkill is valid)",
  check(events, _config) {
    const violations: InvariantViolation[] = [];
    // Track last known HP per Pokemon by "side:pokemonName"
    const lastHp = new Map<string, number>();
    let currentTurn: number | null = null;

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      if (!event) continue;
      if (event.type === "turn-start") {
        const e = event as Extract<BattleEvent, { type: "turn-start" }>;
        currentTurn = e.turnNumber;
      }
      if (event.type === "damage") {
        const e = event as Extract<BattleEvent, { type: "damage" }>;
        const key = `${e.side}:${e.pokemon}`;
        const prev = lastHp.get(key);
        if (prev !== undefined) {
          const actualDrop = prev - e.currentHp;
          // HP must not increase due to a damage event
          if (actualDrop < 0) {
            violations.push(
              violation(
                "hp-delta-consistency",
                `Side ${e.side} pokemon ${e.pokemon}: HP increased from ${prev} to ${e.currentHp} on a damage event`,
                i,
                currentTurn,
              ),
            );
          }
          // Declared amount must be >= actual HP drop (overkill: amount can exceed drop)
          if (e.amount < actualDrop) {
            violations.push(
              violation(
                "hp-delta-consistency",
                `Side ${e.side} pokemon ${e.pokemon}: declared damage=${e.amount} is less than actual HP drop=${actualDrop} (${prev}→${e.currentHp})`,
                i,
                currentTurn,
              ),
            );
          }
        }
        lastHp.set(key, e.currentHp);
      }
      if (event.type === "heal") {
        const e = event as Extract<BattleEvent, { type: "heal" }>;
        const key = `${e.side}:${e.pokemon}`;
        lastHp.set(key, e.currentHp);
      }
      if (event.type === "faint") {
        const e = event as Extract<BattleEvent, { type: "faint" }>;
        lastHp.delete(`${e.side}:${e.pokemon}`);
      }
    }
    return violations;
  },
};
