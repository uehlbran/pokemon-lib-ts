import type { TypeChart } from "../entities/type-chart";
import type { PokemonType } from "../entities/types";

/**
 * Effectiveness classification for type matchups.
 */
export type EffectivenessCategory =
  | "immune" // 0x
  | "double-resisted" // 0.25x
  | "resisted" // 0.5x
  | "neutral" // 1x
  | "super-effective" // 2x
  | "double-super"; // 4x

/**
 * Get the type effectiveness multiplier for one attacking type vs one defending type.
 *
 * @returns 0 (immune), 0.5 (resisted), 1 (neutral), or 2 (super effective)
 */
export function getTypeFactor(
  attackType: PokemonType,
  defendType: PokemonType,
  chart: TypeChart,
): number {
  return chart[attackType]?.[defendType] ?? 1;
}

/**
 * Get the combined type effectiveness multiplier against a (possibly dual-typed) defender.
 * Multiplies the individual factors.
 *
 * @returns 0, 0.25, 0.5, 1, 2, or 4
 */
export function getTypeEffectiveness(
  attackType: PokemonType,
  defenderTypes: readonly PokemonType[],
  chart: TypeChart,
): number {
  let multiplier = 1;
  for (const defType of defenderTypes) {
    multiplier *= getTypeFactor(attackType, defType, chart);
  }
  return multiplier;
}

/**
 * Classify a multiplier into a human-readable category.
 */
export function classifyEffectiveness(multiplier: number): EffectivenessCategory {
  if (multiplier === 0) return "immune";
  if (multiplier === 0.25) return "double-resisted";
  if (multiplier === 0.5) return "resisted";
  if (multiplier === 1) return "neutral";
  if (multiplier === 2) return "super-effective";
  return "double-super"; // 4
}
