/**
 * Gen 5 move effect master dispatcher.
 *
 * Routes move effect execution to the appropriate sub-module:
 *   - Gen5MoveEffectsField: field effect moves (Magic Room, Wonder Room, Trick Room,
 *     Quick Guard, Wide Guard)
 *   - Gen5MoveEffectsBehavior: behavioral overrides (Defog, Scald, Growth, Knock Off,
 *     Thief, Covet, Encore, Taunt, Disable)
 *   - Gen5MoveEffectsCombat: combat moves (Shell Smash, Quiver Dance, Dragon Tail,
 *     Acrobatics, Final Gambit, etc.)
 *   - Gen5MoveEffectsStatus: status/utility moves (Heal Pulse, Aromatherapy, Heal Bell,
 *     Soak, Incinerate, Bestow, Entrainment, Round)
 *   - Gen5MovePledges: Pledge moves (Fire/Grass/Water Pledge, singles mode)
 *   - Gen5SkyDrop: Sky Drop (stubbed, pending engine support)
 *
 * Also re-exports all public functions from sub-modules for direct consumer access.
 *
 * Source: references/pokemon-showdown/data/mods/gen5/moves.ts
 * Source: references/pokemon-showdown/data/moves.ts
 */

import type { MoveEffectContext, MoveEffectResult } from "@pokemon-lib-ts/battle";
import type { SeededRandom } from "@pokemon-lib-ts/core";
import { handleGen5BehaviorMove } from "./Gen5MoveEffectsBehavior";
import { handleGen5CombatMove } from "./Gen5MoveEffectsCombat";
import { handleGen5FieldMove } from "./Gen5MoveEffectsField";
import { handleGen5StatusMove } from "./Gen5MoveEffectsStatus";
import { handleGen5PledgeMove } from "./Gen5MovePledges";
import { handleGen5SkyDrop } from "./Gen5SkyDrop";

// ---------------------------------------------------------------------------
// Re-exports from sub-modules
// ---------------------------------------------------------------------------

export {
  handleGen5BehaviorMove,
  isGen5PowderMoveBlocked,
  isToxicGuaranteedAccuracy,
} from "./Gen5MoveEffectsBehavior";

export {
  didAllyFaintLastTurn,
  getAcrobaticsBP,
  getElectroBallBP,
  getGyroBallBP,
  getRetaliateBP,
  getWeightBasedBP,
  handleGen5CombatMove,
} from "./Gen5MoveEffectsCombat";

export {
  getGen5PriorityOverride,
  handleGen5FieldMove,
  isBlockedByQuickGuard,
  isBlockedByWideGuard,
} from "./Gen5MoveEffectsField";

export {
  GEN5_CANTSUPPRESS,
  GEN5_FAIL_ROLE_PLAY,
  GEN5_FAIL_SKILL_SWAP,
  handleGen5StatusMove,
  isBerry,
} from "./Gen5MoveEffectsStatus";

export { handleGen5PledgeMove, isPledgeMove } from "./Gen5MovePledges";

export { handleGen5SkyDrop, isSkyDrop } from "./Gen5SkyDrop";

// ---------------------------------------------------------------------------
// Master dispatcher
// ---------------------------------------------------------------------------

/**
 * Master dispatch function for Gen 5 move effects.
 *
 * Tries each sub-module in order:
 *   1. Field effects (Magic Room, Wonder Room, Trick Room, Quick Guard, Wide Guard)
 *   2. Behavioral overrides (Defog, Scald, Growth, Knock Off)
 *   3. Combat moves (Shell Smash, Dragon Tail, Acrobatics, Final Gambit, etc.)
 *   4. Status/utility moves (Heal Pulse, Aromatherapy, Heal Bell, Soak, Incinerate,
 *      Bestow, Entrainment, Round)
 *   5. Pledge moves (Fire/Grass/Water Pledge -- singles mode, pure damage)
 *   6. Sky Drop (stubbed, pending engine support for target-volatile two-turn moves)
 *
 * Returns the MoveEffectResult from the first sub-module that handles the move,
 * or null if no sub-module recognizes it (the caller should fall through to
 * BaseRuleset's default handler).
 *
 * @param ctx - Full move execution context
 * @param rng - Seeded PRNG for moves that need randomness (e.g., Quick/Wide Guard stall check)
 * @param rollProtectSuccess - Protect success roll function (for stalling moves)
 * @returns MoveEffectResult if handled, or null if unrecognized
 */
export function executeGen5MoveEffect(
  ctx: MoveEffectContext,
  rng: SeededRandom,
  rollProtectSuccess: (consecutiveProtects: number, rng: SeededRandom) => boolean,
): MoveEffectResult | null {
  // 1. Field effect moves (highest priority -- room effects, guards)
  const fieldResult = handleGen5FieldMove(ctx, rng, rollProtectSuccess);
  if (fieldResult !== null) return fieldResult;

  // 2. Behavioral overrides (gen-specific move behavior differences)
  const behaviorResult = handleGen5BehaviorMove(ctx);
  if (behaviorResult !== null) return behaviorResult;

  // 3. Combat moves (stat-boosting moves, force-switch, self-destruct, etc.)
  const combatResult = handleGen5CombatMove(ctx);
  if (combatResult !== null) return combatResult;

  // 4. Status/utility moves (Heal Pulse, Aromatherapy, Heal Bell, Soak, etc.)
  const statusResult = handleGen5StatusMove(ctx);
  if (statusResult !== null) return statusResult;

  // 5. Pledge moves (Fire/Grass/Water Pledge -- singles mode, no field effects)
  // Source: Showdown data/mods/gen5/moves.ts -- pledge moves in singles are pure damage
  const pledgeResult = handleGen5PledgeMove(ctx.move.id);
  if (pledgeResult !== undefined) return pledgeResult;

  // 6. Sky Drop (stubbed -- deals base damage via damage calc, no special effect)
  // Source: Showdown data/moves.ts -- skydrop: basePower 60
  const skyDropResult = handleGen5SkyDrop(ctx.move.id);
  if (skyDropResult !== undefined) return skyDropResult;

  // Not handled by any Gen 5-specific sub-module
  return null;
}
