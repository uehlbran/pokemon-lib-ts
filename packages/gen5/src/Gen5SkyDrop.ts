/**
 * Gen 5 Sky Drop move handling.
 *
 * Sky Drop is a two-turn Flying-type physical move (60 BP) introduced in Gen 5:
 *   - Turn 1: User grabs the target and both become airborne (semi-invulnerable).
 *     Both the user and target are immune to most moves while airborne.
 *   - Turn 2: User drops the target, dealing 60 BP Flying-type physical damage.
 *   - Fails if: target weighs > 200 kg, target has a Substitute, target is an ally,
 *     or target is already semi-invulnerable (Fly/Bounce/Dig/Dive/Shadow Force/Sky Drop).
 *   - If the user faints or switches while holding the target, the target is released.
 *   - Flying-type Pokemon are immune to the damage on turn 2.
 *
 * IMPLEMENTATION STATUS: Stubbed. Sky Drop has unique two-turn semantics that differ
 * from standard two-turn moves (Fly, Dig, etc.) because it also immobilizes the TARGET:
 *   1. Both user AND target must become semi-invulnerable (existing two-turn pattern
 *      only applies volatiles to the user).
 *   2. The target must be prevented from acting while grabbed (existing forcedMove
 *      system only works on the user).
 *   3. If the user faints mid-turn, the target must be released (requires engine
 *      support for cross-Pokemon volatile cleanup).
 *   4. Weight check (>200 kg) requires species data access at move execution time.
 *
 * These requirements need engine-level changes to BattleEngine.ts (which is outside
 * the scope of gen-package work). When the engine gains target-volatile support for
 * two-turn moves, this stub should be replaced with a full implementation.
 *
 * Source: Showdown data/mods/gen5/moves.ts -- skydrop
 * Source: Showdown data/moves.ts -- skydrop: basePower 60, effect: { duration: 2 }
 * Source: Bulbapedia -- Sky Drop: "This attack takes the target into the air with
 *   the user on the first turn and executes on the second."
 */

import type { MoveEffectResult } from "@pokemon-lib-ts/battle";

/**
 * Check whether a move is Sky Drop.
 */
export function isSkyDrop(moveName: string): boolean {
  return moveName === "sky-drop";
}

/**
 * Handle Sky Drop move effect.
 *
 * Currently a stub -- returns null (no special effect). The move's base damage
 * (60 BP Flying physical) is handled by the damage calc via move data.
 *
 * TODO: Implement full Sky Drop mechanics when the engine supports:
 *   - Applying volatiles to the DEFENDER during a two-turn move
 *   - Preventing the grabbed target from acting
 *   - Releasing the target if the user faints mid-turn
 *   - Weight check: fails if target weighs > 200 kg
 *     Source: Showdown data/moves.ts -- skydrop.condition.onTrapPokemon
 *   - Semi-invulnerability for both user and target during charge turn
 *     Source: Showdown data/moves.ts -- skydrop onMoveFail releases target
 *
 * @param moveName - The move ID
 * @returns null (stub -- damage handled by damage calc), undefined if not sky-drop
 */
export function handleGen5SkyDrop(moveName: string): MoveEffectResult | null | undefined {
  if (moveName !== "sky-drop") return undefined;
  // TODO: Full Sky Drop implementation pending engine support for target-volatile
  // two-turn moves. Currently, Sky Drop deals its 60 BP damage as a normal attack.
  // Source: Showdown data/moves.ts -- skydrop: basePower 60
  return null;
}
