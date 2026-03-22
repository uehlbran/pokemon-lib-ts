/**
 * Gen 5 Pledge move handling (Fire Pledge, Grass Pledge, Water Pledge).
 *
 * In Gen 5, pledge moves have base power 50 in singles. When combined in doubles
 * (ally uses a matching pledge on the same turn), the resulting move has 150 BP
 * and creates a field effect:
 *   - Fire + Grass -> "sea of fire" (1/8 chip per turn for 4 turns on opponent's side)
 *   - Fire + Water -> "rainbow" (doubles secondary effect chance for 4 turns on user's side)
 *   - Water + Grass -> "swamp" (halves speed for 4 turns on opponent's side)
 *
 * In singles, pledge moves are pure damage moves with no special effects.
 * The damage calc handles power/typing from move data; no MoveEffectResult is needed.
 *
 * Source: Showdown data/mods/gen5/moves.ts -- firepledge/grasspledge/waterpledge:
 *   basePower 50, basePowerCallback returns 150 when combined
 * Source: Bulbapedia -- Pledge (move): "In a Single Battle, the moves retain
 *   their individual power and typing, without creating field effects."
 */

import type { MoveEffectResult } from "@pokemon-lib-ts/battle";

const PLEDGE_MOVES: ReadonlySet<string> = new Set(["fire-pledge", "grass-pledge", "water-pledge"]);

/**
 * Check whether a move is one of the three Pledge moves.
 *
 * Source: Showdown data/mods/gen5/moves.ts -- firepledge, grasspledge, waterpledge
 */
export function isPledgeMove(moveName: string): boolean {
  return PLEDGE_MOVES.has(moveName);
}

/**
 * Handle a Pledge move in singles battle.
 *
 * Returns null because pledge moves in singles are pure damage moves -- their
 * power (50 BP in Gen 5) and typing are handled by the damage calc via move
 * data, and there are no secondary effects or field effects in singles mode.
 *
 * Returns undefined if the provided move name is not a pledge move (caller
 * error -- use isPledgeMove() to check first).
 *
 * TODO: Implement combined pledge effects for doubles battles (sea of fire,
 * rainbow, swamp) when doubles support is added. The combined mode requires
 * two-action coordination: the first pledge user delays their action until
 * the ally's pledge resolves, then the combined move fires with 150 BP and
 * the appropriate field effect.
 * Source: Showdown data/mods/gen5/moves.ts -- basePowerCallback returns 150
 *   when move.sourceEffect is a matching pledge move
 *
 * @param moveName - The move ID (e.g., "fire-pledge")
 * @returns null for singles (no special effect), undefined if not a pledge move
 */
export function handleGen5PledgeMove(moveName: string): MoveEffectResult | null | undefined {
  if (!PLEDGE_MOVES.has(moveName)) return undefined;
  // In singles: no special effect. Damage is handled by damage calc using
  // the move's base power (50 in Gen 5) and typing from move data.
  // Source: Bulbapedia -- Pledge (move): singles mode = standard damage, no field effect
  return null;
}
