import type { BattleStat } from "@pokemon-lib-ts/core";
import { CORE_ABILITY_IDS } from "@pokemon-lib-ts/core";
import type { ActivePokemon } from "../state";

/**
 * Get the effective stat stage for a Pokemon, accounting for Simple, Unaware,
 * and Mold Breaker / Turboblaze / Teravolt ability interactions.
 *
 * Used by Gen 5-9 damage calculators for both offensive and defensive stat stages.
 *
 * Priority order:
 *   1. Unaware on the opponent ignores this Pokemon's stat stages (unless bypassed by attacker's Mold Breaker in offense context)
 *   2. Simple on this Pokemon doubles stat stages (unless bypassed by attacker's Mold Breaker in defense context)
 *   3. Otherwise, return raw stages
 *
 * @param statContext - "offense" when computing the attacker's stat; "defense" when computing
 *   the defender's stat. Affects how Mold Breaker interacts with Unaware and Simple.
 *
 * Source: Showdown sim/battle.ts -- Unaware's onAnyModifyBoost runs before Simple's doubling
 * Source: Showdown data/abilities.ts -- moldbreaker/turboblaze/teravolt bypass Unaware/Simple
 */
export function getEffectiveStatStage(
  pokemon: ActivePokemon,
  stat: BattleStat,
  opponent?: ActivePokemon,
  statContext: "offense" | "defense" = "offense",
  bypassesTargetAbility = false,
): number {
  // Mold Breaker / Turboblaze / Teravolt on the attacker bypasses the defender's abilities.
  // Source: Showdown data/abilities.ts -- moldbreaker/turboblaze/teravolt bypass Unaware/Simple
  const pokemonHasMoldBreaker =
    pokemon.ability === CORE_ABILITY_IDS.moldBreaker ||
    pokemon.ability === CORE_ABILITY_IDS.turboblaze ||
    pokemon.ability === CORE_ABILITY_IDS.teravolt;
  const opponentHasMoldBreaker =
    opponent?.ability === CORE_ABILITY_IDS.moldBreaker ||
    opponent?.ability === CORE_ABILITY_IDS.turboblaze ||
    opponent?.ability === CORE_ABILITY_IDS.teravolt;

  // Unaware takes priority over Simple — if the opponent has Unaware, stages are 0
  // regardless of whether this Pokemon has Simple.
  // Bypass rule: only in the OFFENSE context can this Pokemon's Mold Breaker bypass the
  // opponent's Unaware (the Mold Breaker user suppresses the target's ability when attacking).
  // In the DEFENSE context (pokemon=defender, opponent=attacker), the defender's Mold Breaker
  // cannot prevent the attacker's Unaware — Mold Breaker only affects the target's abilities.
  // Source: Showdown sim/battle.ts -- Unaware's onAnyModifyBoost runs before Simple's doubling
  // Source: Showdown data/abilities.ts -- moldbreaker isBreaking only suppresses target's abilities
  const bypassesOpponentAbility =
    bypassesTargetAbility || (statContext === "offense" && pokemonHasMoldBreaker);
  if (opponent?.ability === "unaware" && !bypassesOpponentAbility) {
    return 0;
  }

  if (!(stat in pokemon.statStages)) {
    throw new Error(`Unknown battle stat "${stat}"`);
  }

  const raw = pokemon.statStages[stat] ?? 0;
  // Suppress Simple only when computing the DEFENDER's defensive stat and the attacker
  // (opponent) has Mold Breaker — the Mold Breaker user bypasses the target's ability.
  // When computing the ATTACKER's offensive stat, the defender's Mold Breaker does NOT
  // suppress the attacker's own Simple.
  // Source: Showdown data/abilities.ts -- moldbreaker bypasses target's abilities only
  const bypassesPokemonAbility =
    bypassesTargetAbility || (statContext === "defense" && opponentHasMoldBreaker);
  if (pokemon.ability === CORE_ABILITY_IDS.simple && !bypassesPokemonAbility) {
    return Math.max(-6, Math.min(6, raw * 2));
  }
  return raw;
}
