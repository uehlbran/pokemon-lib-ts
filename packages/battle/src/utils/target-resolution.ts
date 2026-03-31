import type { StatChangeEffect } from "@pokemon-lib-ts/core";
import { CORE_MOVE_EFFECT_TARGETS } from "@pokemon-lib-ts/core";
import { BATTLE_EFFECT_TARGETS } from "../constants/effect-protocol";

/**
 * Resolves a StatChangeEffect target to the battle-layer attacker/defender slot.
 *
 * - "self" → the move user (attacker)
 * - "foe"  → the move target (defender)
 * - "ally" → throws: ally-targeting stat changes (e.g., Aromatic Mist, Coaching)
 *            require doubles support which is not yet implemented in the singles engine.
 *
 * This exhaustive switch ensures any future addition to StatChangeEffect["target"]
 * causes a compile error rather than silently routing to the wrong Pokemon.
 */
export function resolveStatChangeTarget(
  target: StatChangeEffect["target"],
): typeof BATTLE_EFFECT_TARGETS.attacker | typeof BATTLE_EFFECT_TARGETS.defender {
  switch (target) {
    case CORE_MOVE_EFFECT_TARGETS.self:
      return BATTLE_EFFECT_TARGETS.attacker;
    case CORE_MOVE_EFFECT_TARGETS.foe:
      return BATTLE_EFFECT_TARGETS.defender;
    case CORE_MOVE_EFFECT_TARGETS.ally:
      throw new Error(
        `Ally-targeting stat changes (e.g., Aromatic Mist, Coaching) require doubles support. ` +
          `Cannot resolve "ally" target in singles engine.`,
      );
    default: {
      const _exhaustive: never = target;
      throw new Error(`Unhandled stat-change target: ${String(_exhaustive)}`);
    }
  }
}
