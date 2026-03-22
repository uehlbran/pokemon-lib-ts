/**
 * Gen 5 Magic Bounce implementation.
 *
 * Magic Bounce reflects certain status moves back at the user without the holder
 * needing to use Magic Coat. The set of reflectable moves matches Showdown's
 * `flags.reflectable` flag on each move.
 *
 * Source: Showdown data/abilities.ts -- magicbounce.onTryHit:
 *   if (target === source || move.hasBounced || !move.flags['reflectable']) return;
 *   const newMove = this.dex.getActiveMove(move.id);
 *   newMove.hasBounced = true;
 *   this.actions.useMove(newMove, target, { target: source });
 *   return null;
 *
 * Source: Bulbapedia -- Magic Bounce:
 *   "Non-damaging moves that are affected by Magic Coat are reflected back
 *    to the user by Magic Bounce."
 */

import type { ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import type { MoveData } from "@pokemon-lib-ts/core";

/**
 * Set of move IDs that are reflectable by Magic Bounce (and Magic Coat).
 *
 * This set is derived from Showdown's `flags.reflectable` flag on each move,
 * filtered to moves that exist in Gen 5. The `reflectable` flag is separate
 * from the `mirror` flag (which controls Mirror Move copying).
 *
 * Source: Showdown data/moves.ts -- every move entry with `reflectable: 1`
 *   cross-referenced against the Gen 5 move pool.
 */
export const GEN5_REFLECTABLE_MOVES: ReadonlySet<string> = new Set([
  // Status-inflicting moves
  "attract",
  "confuse-ray",
  "dark-void",
  "glare",
  "grass-whistle",
  "hypnosis",
  "lovely-kiss",
  "poison-gas",
  "poison-powder",
  "sing",
  "sleep-powder",
  "spore",
  "stun-spore",
  "supersonic",
  "swagger",
  "sweet-kiss",
  "thunder-wave",
  "toxic",
  "will-o-wisp",
  "yawn",

  // Stat-lowering moves
  "captivate",
  "charm",
  "cotton-spore",
  "fake-tears",
  "feather-dance",
  "flash",
  "growl",
  "kinesis",
  "leer",
  "metal-sound",
  "sand-attack",
  "scary-face",
  "screech",
  "smokescreen",
  "string-shot",
  "sweet-scent",
  "tail-whip",
  "tickle",

  // Volatile status / disruption moves
  "block",
  "disable",
  "embargo",
  "encore",
  "entrainment",
  "flatter",
  "gastro-acid",
  "heal-block",
  "leech-seed",
  "mean-look",
  "simple-beam",
  "soak",
  "spider-web",
  "spite",
  "taunt",
  "telekinesis",
  "torment",
  "worry-seed",

  // Identification moves
  "defog",
  "foresight",
  "miracle-eye",
  "odor-sleuth",

  // Entry hazards (foe-field targeting)
  "spikes",
  "stealth-rock",
  "toxic-spikes",

  // Phazing moves
  "roar",
  "whirlwind",

  // Healing moves that target opponent
  "heal-pulse",
]);

/**
 * Check if a move is reflectable by Magic Bounce.
 *
 * Source: Showdown data/abilities.ts -- magicbounce checks move.flags['reflectable']
 */
export function isReflectableMove(moveId: string): boolean {
  return GEN5_REFLECTABLE_MOVES.has(moveId);
}

/**
 * Check if a move should be reflected by Magic Bounce.
 *
 * Returns a reflection result if:
 * 1. The defender has the "magic-bounce" ability
 * 2. The move is in the reflectable set
 * 3. The attacker does not have a Mold Breaker variant ability (which ignores
 *    the target's ability)
 * 4. The defender is not semi-invulnerable
 *
 * Source: Showdown data/abilities.ts -- magicbounce.onTryHit:
 *   - Checks move.hasBounced (prevent infinite loops)
 *   - Checks move.flags['reflectable']
 *   - target.isSemiInvulnerable() check
 *   - flags: { breakable: 1 } -- Mold Breaker bypasses Magic Bounce
 *
 * @param move - The move data
 * @param attacker - The Pokemon using the move
 * @param defender - The Pokemon being targeted (potential Magic Bounce holder)
 * @param _state - Current battle state (unused but available for future extensions)
 * @returns Reflection result or null
 */
export function shouldReflectMoveGen5(
  move: MoveData,
  attacker: ActivePokemon,
  defender: ActivePokemon,
  _state: BattleState,
): { reflected: true; messages: string[] } | null {
  // Only Magic Bounce holders reflect moves
  if (defender.ability !== "magic-bounce") return null;

  // The move must be reflectable
  if (!isReflectableMove(move.id)) return null;

  // Mold Breaker variants ignore target abilities (including Magic Bounce)
  // Source: Showdown data/abilities.ts -- magicbounce has { breakable: 1 }
  const moldBreakerAbilities = new Set(["mold-breaker", "teravolt", "turboblaze"]);
  if (moldBreakerAbilities.has(attacker.ability)) return null;

  // Semi-invulnerable defenders cannot reflect
  // Source: Showdown -- target.isSemiInvulnerable() check
  if (
    defender.volatileStatuses.has("flying") ||
    defender.volatileStatuses.has("underground") ||
    defender.volatileStatuses.has("underwater") ||
    defender.volatileStatuses.has("shadow-force-charging")
  ) {
    return null;
  }

  const defenderName = defender.pokemon.nickname ?? String(defender.pokemon.speciesId);
  return {
    reflected: true,
    messages: [`${defenderName}'s Magic Bounce reflected ${move.displayName} back!`],
  };
}
