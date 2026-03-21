import type { DamageContext, DamageResult } from "@pokemon-lib-ts/battle";

/**
 * Gen 5 damage calculation.
 *
 * Stub -- will be fully implemented in Wave 1.
 *
 * Gen 5 uses the same general damage formula structure as Gen 4, but with
 * key differences:
 *   - Type gems boost damage by 1.5x and are consumed on use
 *   - Sheer Force removes secondary effect chances but adds 1.3x damage boost
 *   - Life Orb boost is 1.3x (same as Gen 4)
 *   - Acrobatics doubles power when holder has no item
 *   - New items: Eviolite (+50% Def/SpDef for NFE), Rocky Helmet
 *
 * Source: references/pokemon-showdown/sim/battle-actions.ts lines 1718-1838
 */
export function calculateGen5Damage(
  _context: DamageContext,
  _typeChart: Record<string, Record<string, number>>,
): DamageResult {
  // Stub -- implemented in Wave 1
  return { damage: 0, isCrit: false, effectiveness: 1, randomFactor: 1 };
}
