import type { Generation } from "./types";

/**
 * Primary status conditions — only one can be active at a time.
 * These persist outside of battle (except badly-poisoned which reverts to poison).
 */
export type PrimaryStatus =
  | "burn"
  | "poison"
  | "badly-poisoned" // Toxic — escalating damage. Reverts to 'poison' outside battle in Gen 1-4.
  | "paralysis"
  | "sleep"
  | "freeze";

const GEN1_VOLATILE_STATUSES = [
  "confusion",
  "leech-seed",
  "disable",
  "substitute",
  "focus-energy",
  "flinch",
  "bound",
  "recharge",
  "mist",
  "charging",
  "rage",
  "rage-miss-lock",
  "bide",
  "thrash-lock",
  "mimic-slot",
  "transform-data",
  "toxic-counter",
] as const;

const GEN2_VOLATILE_STATUS_ADDITIONS = [
  "infatuation",
  "curse",
  "nightmare",
  "perish-song",
  "encore",
  "protect",
  "endure",
  "trapped",
  "sleep-counter",
  "just-frozen",
  "destiny-bond",
  "flying",
  "underground",
  "rollout",
  "fury-cutter",
] as const;

const GEN3_VOLATILE_STATUS_ADDITIONS = [
  "taunt",
  "torment",
  "yawn",
  "ingrain",
  "flash-fire",
  "underwater",
  "truant-turn",
  "uproar",
  "charged",
  "mud-sport",
  "water-sport",
] as const;

const GEN4_VOLATILE_STATUS_ADDITIONS = [
  "aqua-ring",
  "magnet-rise",
  "embargo",
  "heal-block",
  "choice-locked",
  "shadow-force-charging",
  "metronome-count",
  "slow-start",
  "unburden",
] as const;

const GEN5_VOLATILE_STATUS_ADDITIONS = [
  "quick-guard",
  "wide-guard",
  "illusion",
  "harvest-berry",
  "hazard-status-source",
] as const;

const GEN6_VOLATILE_STATUS_ADDITIONS = [
  "kings-shield",
  "spiky-shield",
  "mat-block",
  "crafty-shield",
] as const;

const GEN7_VOLATILE_STATUS_ADDITIONS = [
  "baneful-bunker",
  "disguise-broken",
  "power-construct-transformed",
  "battle-bond-transformed",
] as const;

const GEN8_VOLATILE_STATUS_ADDITIONS = [
  "no-retreat",
  "tar-shot",
  "octolock",
  "obstruct",
  "jaw-lock",
  "max-guard",
  "ice-face-broken",
] as const;

const GEN9_VOLATILE_STATUS_ADDITIONS = [
  "drowsy",
  "protosynthesis",
  "quarkdrive",
  "embody-aspect-used",
  "intrepid-sword-used",
  "dauntless-shield-used",
  "protean-used",
  "silk-trap",
  "salt-cure",
  "shed-tail-sub",
] as const;

export type Gen1VolatileStatus = (typeof GEN1_VOLATILE_STATUSES)[number];
export type Gen2VolatileStatus =
  | Gen1VolatileStatus
  | (typeof GEN2_VOLATILE_STATUS_ADDITIONS)[number];
export type Gen3VolatileStatus =
  | Gen2VolatileStatus
  | (typeof GEN3_VOLATILE_STATUS_ADDITIONS)[number];
export type Gen4VolatileStatus =
  | Gen3VolatileStatus
  | (typeof GEN4_VOLATILE_STATUS_ADDITIONS)[number];
export type Gen5VolatileStatus =
  | Gen4VolatileStatus
  | (typeof GEN5_VOLATILE_STATUS_ADDITIONS)[number];
export type Gen6VolatileStatus =
  | Gen5VolatileStatus
  | (typeof GEN6_VOLATILE_STATUS_ADDITIONS)[number];
export type Gen7VolatileStatus =
  | Gen6VolatileStatus
  | (typeof GEN7_VOLATILE_STATUS_ADDITIONS)[number];
export type Gen8VolatileStatus =
  | Gen7VolatileStatus
  | (typeof GEN8_VOLATILE_STATUS_ADDITIONS)[number];
export type Gen9VolatileStatus =
  | Gen8VolatileStatus
  | (typeof GEN9_VOLATILE_STATUS_ADDITIONS)[number];

/**
 * Volatile status conditions — can have multiple at once.
 * This remains the full compatibility union for battle state maps and public APIs
 * that intentionally span multiple generations.
 */
export type VolatileStatus = Gen9VolatileStatus;

/**
 * Generation-aware volatile union for callers that want compile-time narrowing
 * instead of the compatibility superset.
 */
export type VolatileStatusByGeneration<G extends Generation> = G extends 1
  ? Gen1VolatileStatus
  : G extends 2
    ? Gen2VolatileStatus
    : G extends 3
      ? Gen3VolatileStatus
      : G extends 4
        ? Gen4VolatileStatus
        : G extends 5
          ? Gen5VolatileStatus
          : G extends 6
            ? Gen6VolatileStatus
            : G extends 7
              ? Gen7VolatileStatus
              : G extends 8
                ? Gen8VolatileStatus
                : Gen9VolatileStatus;

const SEMI_INVULNERABLE_VOLATILES = [
  "flying",
  "underground",
  "underwater",
  "shadow-force-charging",
] as const;

export type SemiInvulnerableVolatile = (typeof SEMI_INVULNERABLE_VOLATILES)[number];

export type SemiInvulnerableVolatileByGeneration<G extends Generation> = Extract<
  VolatileStatusByGeneration<G>,
  SemiInvulnerableVolatile
>;

const TWO_TURN_MOVE_VOLATILES = [...SEMI_INVULNERABLE_VOLATILES, "charging"] as const;

/**
 * Two-turn move target states handled by `canHitSemiInvulnerable()`.
 * This includes both truly semi-invulnerable positions and the generic
 * `charging` marker, which remains targetable but shares the same hook.
 */
export type TwoTurnMoveVolatile = (typeof TWO_TURN_MOVE_VOLATILES)[number];

export type TwoTurnMoveVolatileByGeneration<G extends Generation> = Extract<
  VolatileStatusByGeneration<G>,
  TwoTurnMoveVolatile
>;

export type Gen3SemiInvulnerableVolatile = SemiInvulnerableVolatileByGeneration<3>;
export type Gen4SemiInvulnerableVolatile = SemiInvulnerableVolatileByGeneration<4>;
export type Gen5SemiInvulnerableVolatile = SemiInvulnerableVolatileByGeneration<5>;
export type Gen6SemiInvulnerableVolatile = SemiInvulnerableVolatileByGeneration<6>;
export type Gen7SemiInvulnerableVolatile = SemiInvulnerableVolatileByGeneration<7>;
export type Gen8SemiInvulnerableVolatile = SemiInvulnerableVolatileByGeneration<8>;
export type Gen9SemiInvulnerableVolatile = SemiInvulnerableVolatileByGeneration<9>;
export type Gen3TwoTurnMoveVolatile = TwoTurnMoveVolatileByGeneration<3>;
export type Gen4TwoTurnMoveVolatile = TwoTurnMoveVolatileByGeneration<4>;
export type Gen5TwoTurnMoveVolatile = TwoTurnMoveVolatileByGeneration<5>;
export type Gen6TwoTurnMoveVolatile = TwoTurnMoveVolatileByGeneration<6>;
export type Gen7TwoTurnMoveVolatile = TwoTurnMoveVolatileByGeneration<7>;
export type Gen8TwoTurnMoveVolatile = TwoTurnMoveVolatileByGeneration<8>;
export type Gen9TwoTurnMoveVolatile = TwoTurnMoveVolatileByGeneration<9>;

const SWITCH_BLOCKING_VOLATILES = [
  "trapped",
  "ingrain",
  "no-retreat",
  "octolock",
  "jaw-lock",
] as const;

/**
 * Volatiles that can prevent the affected Pokemon from switching or being phased.
 * `ingrain` belongs here because the engine treats it as blocking forced switching.
 */
export type SwitchBlockingVolatile = (typeof SWITCH_BLOCKING_VOLATILES)[number];

const SEMI_INVULNERABLE_VOLATILE_SET = new Set<VolatileStatus>(SEMI_INVULNERABLE_VOLATILES);

const SWITCH_BLOCKING_VOLATILE_SET = new Set<VolatileStatus>(SWITCH_BLOCKING_VOLATILES);

const GEN1_VOLATILE_STATUS_SET = new Set<VolatileStatus>(GEN1_VOLATILE_STATUSES);
const GEN2_VOLATILE_STATUS_SET = new Set<VolatileStatus>([
  ...GEN1_VOLATILE_STATUSES,
  ...GEN2_VOLATILE_STATUS_ADDITIONS,
]);
const GEN3_VOLATILE_STATUS_SET = new Set<VolatileStatus>([
  ...GEN1_VOLATILE_STATUSES,
  ...GEN2_VOLATILE_STATUS_ADDITIONS,
  ...GEN3_VOLATILE_STATUS_ADDITIONS,
]);
const GEN4_VOLATILE_STATUS_SET = new Set<VolatileStatus>([
  ...GEN1_VOLATILE_STATUSES,
  ...GEN2_VOLATILE_STATUS_ADDITIONS,
  ...GEN3_VOLATILE_STATUS_ADDITIONS,
  ...GEN4_VOLATILE_STATUS_ADDITIONS,
]);
const GEN5_VOLATILE_STATUS_SET = new Set<VolatileStatus>([
  ...GEN1_VOLATILE_STATUSES,
  ...GEN2_VOLATILE_STATUS_ADDITIONS,
  ...GEN3_VOLATILE_STATUS_ADDITIONS,
  ...GEN4_VOLATILE_STATUS_ADDITIONS,
  ...GEN5_VOLATILE_STATUS_ADDITIONS,
]);
const GEN6_VOLATILE_STATUS_SET = new Set<VolatileStatus>([
  ...GEN1_VOLATILE_STATUSES,
  ...GEN2_VOLATILE_STATUS_ADDITIONS,
  ...GEN3_VOLATILE_STATUS_ADDITIONS,
  ...GEN4_VOLATILE_STATUS_ADDITIONS,
  ...GEN5_VOLATILE_STATUS_ADDITIONS,
  ...GEN6_VOLATILE_STATUS_ADDITIONS,
]);
const GEN7_VOLATILE_STATUS_SET = new Set<VolatileStatus>([
  ...GEN1_VOLATILE_STATUSES,
  ...GEN2_VOLATILE_STATUS_ADDITIONS,
  ...GEN3_VOLATILE_STATUS_ADDITIONS,
  ...GEN4_VOLATILE_STATUS_ADDITIONS,
  ...GEN5_VOLATILE_STATUS_ADDITIONS,
  ...GEN6_VOLATILE_STATUS_ADDITIONS,
  ...GEN7_VOLATILE_STATUS_ADDITIONS,
]);
const GEN8_VOLATILE_STATUS_SET = new Set<VolatileStatus>([
  ...GEN1_VOLATILE_STATUSES,
  ...GEN2_VOLATILE_STATUS_ADDITIONS,
  ...GEN3_VOLATILE_STATUS_ADDITIONS,
  ...GEN4_VOLATILE_STATUS_ADDITIONS,
  ...GEN5_VOLATILE_STATUS_ADDITIONS,
  ...GEN6_VOLATILE_STATUS_ADDITIONS,
  ...GEN7_VOLATILE_STATUS_ADDITIONS,
  ...GEN8_VOLATILE_STATUS_ADDITIONS,
]);
const GEN9_VOLATILE_STATUS_SET = new Set<VolatileStatus>([
  ...GEN1_VOLATILE_STATUSES,
  ...GEN2_VOLATILE_STATUS_ADDITIONS,
  ...GEN3_VOLATILE_STATUS_ADDITIONS,
  ...GEN4_VOLATILE_STATUS_ADDITIONS,
  ...GEN5_VOLATILE_STATUS_ADDITIONS,
  ...GEN6_VOLATILE_STATUS_ADDITIONS,
  ...GEN7_VOLATILE_STATUS_ADDITIONS,
  ...GEN8_VOLATILE_STATUS_ADDITIONS,
  ...GEN9_VOLATILE_STATUS_ADDITIONS,
]);

export function isSemiInvulnerableVolatile(
  volatile: VolatileStatus,
): volatile is SemiInvulnerableVolatile {
  return SEMI_INVULNERABLE_VOLATILE_SET.has(volatile);
}

export function isSwitchBlockingVolatile(
  volatile: VolatileStatus,
): volatile is SwitchBlockingVolatile {
  return SWITCH_BLOCKING_VOLATILE_SET.has(volatile);
}

export function isVolatileStatusForGeneration<G extends Generation>(
  generation: G,
  volatile: VolatileStatus,
): volatile is VolatileStatusByGeneration<G> {
  switch (generation) {
    case 1:
      return GEN1_VOLATILE_STATUS_SET.has(volatile);
    case 2:
      return GEN2_VOLATILE_STATUS_SET.has(volatile);
    case 3:
      return GEN3_VOLATILE_STATUS_SET.has(volatile);
    case 4:
      return GEN4_VOLATILE_STATUS_SET.has(volatile);
    case 5:
      return GEN5_VOLATILE_STATUS_SET.has(volatile);
    case 6:
      return GEN6_VOLATILE_STATUS_SET.has(volatile);
    case 7:
      return GEN7_VOLATILE_STATUS_SET.has(volatile);
    case 8:
      return GEN8_VOLATILE_STATUS_SET.has(volatile);
    case 9:
      return GEN9_VOLATILE_STATUS_SET.has(volatile);
  }

  return false;
}
