import type { PrimaryStatus } from "../entities/status";
import type { SeededRandom } from "../prng/seeded-random";

/**
 * Status condition catch rate modifiers.
 *
 * Source: pret/pokeemerald src/battle_script_commands.c:9991 Cmd_handleballthrow
 *   sleep/freeze: odds *= 2 (Gen 3-4), Gen 5+ changed to 2.5
 *   poison/burn/paralysis/toxic: odds = (odds * 15) / 10
 * Source: Bulbapedia — Catch rate (https://bulbapedia.bulbagarden.net/wiki/Catch_rate)
 */
export const STATUS_CATCH_MODIFIERS: Record<PrimaryStatus, number> = {
  sleep: 2.5, // Gen 5+ (was 2.0 in Gen 3-4)
  freeze: 2.5, // Gen 5+ (was 2.0 in Gen 3-4)
  paralysis: 1.5,
  burn: 1.5,
  poison: 1.5,
  "badly-poisoned": 1.5,
} as const;

/**
 * Calculate the modified catch rate.
 *
 * Source: pret/pokeemerald src/battle_script_commands.c:9987 Cmd_handleballthrow
 *   odds = (catchRate * ballMultiplier / 10) * (maxHP * 3 - hp * 2) / (3 * maxHP)
 * Source: Bulbapedia — Catch rate (https://bulbapedia.bulbagarden.net/wiki/Catch_rate)
 *
 * Formula (Gen 3-4):
 *   a = ((3 * HP_max - 2 * HP_current) * CatchRate * BallMod) / (3 * HP_max)) * StatusMod
 *
 * @returns Modified catch rate clamped to [1, 255]. Higher = easier to catch.
 */
export function calculateModifiedCatchRate(
  maxHp: number,
  currentHp: number,
  baseCatchRate: number,
  ballModifier: number,
  statusModifier: number,
): number {
  const hpFactor = (3 * maxHp - 2 * currentHp) / (3 * maxHp);
  const a = hpFactor * baseCatchRate * ballModifier * statusModifier;
  return Math.min(255, Math.max(1, Math.floor(a)));
}

/**
 * Calculate how many times the ball shakes (0-4).
 * 4 shakes = caught.
 *
 * Source: pret/pokeemerald src/battle_script_commands.c:10025 Cmd_handleballthrow
 *   odds = Sqrt(Sqrt(16711680 / odds)); odds = 1048560 / odds
 *   (equivalent to b = 65536 / (255/a)^0.1875 using integer sqrt)
 * Source: Bulbapedia — Catch rate (https://bulbapedia.bulbagarden.net/wiki/Catch_rate)
 *
 * Formula:
 *   b = 65536 / (255 / a)^0.1875
 *   Each shake succeeds if a random number [0, 65535] < b
 *   4 successful checks = caught
 *
 * @returns Number of shake checks that succeed (0-4, where 4 = caught)
 */
export function calculateShakeChecks(modifiedCatchRate: number, rng: SeededRandom): number {
  if (modifiedCatchRate >= 255) return 4; // Guaranteed catch

  const b = Math.floor(65536 / (255 / modifiedCatchRate) ** 0.1875);

  let shakes = 0;
  for (let i = 0; i < 4; i++) {
    if (rng.int(0, 65535) < b) {
      shakes++;
    } else {
      break;
    }
  }
  return shakes;
}
