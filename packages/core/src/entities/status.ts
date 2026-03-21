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
  | "toxic-counter" // Tracks escalating Toxic damage (N increments each turn)
  | "no-retreat" // Gen 8
  | "tar-shot" // Gen 8
  | "octolock" // Gen 8
  | "mist" // Gen 1+ — protects the user's team from stat-lowering moves
  | "just-frozen" // Gen 2 — tracks whether a Pokemon was frozen this turn (cannot thaw same turn, per pokecrystal wPlayerJustGotFrozen)
  | "destiny-bond" // Destiny Bond — if the user faints from the opponent's move, the opponent faints too
  | "choice-locked" // Choice item (Band/Specs/Scarf) — locks the user into one move
  | "flash-fire" // Flash Fire — boosts Fire-type moves by 50% when hit by a Fire move
  | "flying" // Semi-invulnerable turn of Fly, Bounce (Gen 2+)
  | "underground" // Semi-invulnerable turn of Dig (Gen 2+)
  | "underwater" // Semi-invulnerable turn of Dive (Gen 3+)
  | "shadow-force-charging" // Semi-invulnerable turn of Shadow Force (Gen 4+)
  | "charging"; // Generic charge turn (SolarBeam, Skull Bash, Razor Wind, Sky Attack) — NOT semi-invulnerable
