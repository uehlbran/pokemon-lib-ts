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

/**
 * Volatile status conditions — can have multiple at once.
 * These are cleared when the Pokemon switches out or the battle ends.
 */
export type VolatileStatus =
  | "confusion"
  | "infatuation"
  | "leech-seed"
  | "curse" // Ghost-type Curse effect
  | "nightmare"
  | "perish-song"
  | "taunt"
  | "torment"
  | "encore"
  | "disable"
  | "yawn"
  | "ingrain"
  | "aqua-ring"
  | "substitute"
  | "focus-energy"
  | "magnet-rise"
  | "embargo"
  | "heal-block"
  | "flinch"
  | "protect"
  | "endure"
  | "drowsy" // Gen 9 — from Yawn equivalent
  | "bound" // Bind, Wrap, Fire Spin, etc.
  | "trapped" // Mean Look, Spider Web (Gen 2+) — prevents switching
  | "recharge" // Must recharge next turn (Hyper Beam, etc.)
  | "sleep-counter" // Tracks remaining sleep turns
  | "no-retreat" // Gen 8
  | "tar-shot" // Gen 8
  | "octolock"; // Gen 8
