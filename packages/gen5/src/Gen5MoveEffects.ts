import type { MoveEffectResult } from "@pokemon-lib-ts/battle";

/**
 * Gen 5 move effect execution.
 *
 * Stub -- will be fully implemented in Waves 5-6.
 *
 * Gen 5 introduced many new moves:
 *   - Shell Smash: -1 Def/SpDef, +2 Atk/SpAtk/Speed
 *   - Quiver Dance: +1 SpAtk/SpDef/Speed
 *   - Dragon Tail / Circle Throw: force switch, negative priority
 *   - Acrobatics: 55 BP, doubles power with no held item
 *   - Scald: 80 BP, 30% burn chance
 *   - Quick Guard / Wide Guard: protect moves
 *   - Final Gambit: user faints, deals HP as damage
 *   - Retaliate: doubles power if ally fainted last turn
 *   - Round: base power doubles if ally used Round
 *   - Flame Charge: 50 BP + Speed +1
 *
 * Source: references/pokemon-showdown/data/mods/gen5/moves.ts
 */
export function executeGen5MoveEffect(): MoveEffectResult {
  // Stub -- implemented in Waves 5-6
  return {
    statusInflicted: null,
    volatileInflicted: null,
    statChanges: [],
    recoilDamage: 0,
    healAmount: 0,
    switchOut: false,
    messages: [],
  };
}
