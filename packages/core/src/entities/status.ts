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
  | "charging" // Generic charge turn (SolarBeam, Skull Bash, Razor Wind, Sky Attack) — NOT semi-invulnerable
  | "metronome-count" // Metronome item — tracks consecutive same-move uses (Gen 4+)
  | "slow-start" // Slow Start — halves Attack and Speed for 5 turns (Gen 4+ Regigigas)
  | "unburden" // Unburden — Speed doubles when held item is consumed/lost (Gen 4+)
  | "rage" // Gen 1 Rage lock-in; data: { moveIndex: number }
  | "rage-miss-lock" // Gen 1 Rage miss loop — once Rage misses, all subsequent uses auto-miss
  | "bide" // Gen 1 Bide charging; data: { accumulatedDamage: number }
  | "thrash-lock" // Gen 1 Thrash / Petal Dance forced move; data: { moveId: string }
  | "mimic-slot" // Gen 1 Mimic — tracks which slot was replaced; data: { slot: number, originalMoveId: string }
  | "transform-data" // Stores original moves/types/stats for Transform restoration on switch-out
  | "truant-turn" // Truant — alternates between acting and loafing each turn (Gen 3+)
  | "quick-guard" // Quick Guard — protects the user's side from priority moves (Gen 5+)
  | "wide-guard" // Wide Guard — protects the user's side from multi-target moves (Gen 5+)
  | "uproar" // Uproar — prevents all Pokemon from falling asleep, lasts 3 turns (Gen 3+)
  | "illusion" // Illusion — disguises the Pokemon as the last party member (Gen 5+, Zoroark)
  | "rollout" // Rollout — tracks consecutive turn count for escalating power (Gen 2+)
  | "fury-cutter"; // Fury Cutter — tracks consecutive use count for escalating power (Gen 2+)
