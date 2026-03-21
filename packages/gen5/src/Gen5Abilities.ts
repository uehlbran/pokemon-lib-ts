import type { BattleEvent } from "@pokemon-lib-ts/battle";

/**
 * Gen 5 ability effects.
 *
 * Stub -- will be fully implemented in Waves 3-4.
 *
 * Gen 5 introduced many new abilities:
 *   - Sheer Force: removes secondary effects for 1.3x damage boost
 *   - Analytic: 1.3x damage if moving last
 *   - Multiscale: halves damage at full HP
 *   - Regenerator: restores 1/3 max HP on switch-out
 *   - Sand Rush / Sand Force: sand-based speed/power boosts
 *   - Illusion: disguises as last party member
 *   - Prankster: +1 priority on status moves
 *   - Magic Bounce: reflects status moves
 *   - Contrary: inverts stat changes
 *   - Defiant / Competitive: raises Attack/SpAtk when stats are lowered
 *   - Moxie: raises Attack on KO
 *   - Mold Breaker / Teravolt / Turboblaze: ignore target abilities
 *
 * Source: references/pokemon-showdown/data/mods/gen5/abilities.ts
 */
export function applyGen5Ability(): BattleEvent[] {
  // Stub -- implemented in Waves 3-4
  return [];
}
