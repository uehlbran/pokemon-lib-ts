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
