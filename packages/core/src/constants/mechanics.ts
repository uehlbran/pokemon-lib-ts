/**
 * Cross-generation mechanic multipliers shared across the battle stack.
 *
 * These are formula constants, not generation data-bundle values.
 * Generation-specific mechanic constants should live in the owning gen package.
 */
export const CORE_MECHANIC_MULTIPLIERS = {
  neutral: 1,
  maxRandom: 1,
  stab: 1.5,
  adaptabilityStab: 2,
} as const;

/**
 * Type effectiveness multipliers used in damage calculations.
 * These are the canonical multiplier values for type matchup thresholds.
 * Source: Bulbapedia "Type chart"
 */
export const TYPE_EFFECTIVENESS_MULTIPLIERS = {
  immune: 0,
  quarterDamage: 0.25,
  halfDamage: 0.5,
  neutral: 1,
  superEffective: 2,
  doubleSuper: 4,
} as const;

export type TypeEffectivenessMultiplier =
  (typeof TYPE_EFFECTIVENESS_MULTIPLIERS)[keyof typeof TYPE_EFFECTIVENESS_MULTIPLIERS];
