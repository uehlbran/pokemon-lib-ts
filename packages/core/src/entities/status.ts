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

// ---------------------------------------------------------------------------
// Volatile status sub-groups — semantic categories for type narrowing.
// The master VolatileStatus union (below) is the union of all sub-types,
// so existing code that accepts VolatileStatus is unaffected.
// ---------------------------------------------------------------------------

/**
 * Semi-invulnerable states — the Pokemon is off-screen during a two-turn move
 * and can only be hit by specific moves (e.g., Earthquake hits "underground").
 */
export type SemiInvulnerableVolatile =
  | "flying" // Fly, Bounce (Gen 2+)
  | "underground" // Dig (Gen 2+)
  | "underwater" // Dive (Gen 3+)
  | "shadow-force-charging"; // Shadow Force / Phantom Force (Gen 4+)

/**
 * Protection moves — Protect, its variants, and team-wide guards.
 * All share the "consecutive protect" success-rate decay mechanic.
 */
export type ProtectVolatile =
  | "protect"
  | "endure"
  | "quick-guard" // Protects side from priority moves (Gen 5+)
  | "wide-guard" // Protects side from multi-target moves (Gen 5+)
  | "kings-shield" // Blocks non-Status; -1 Atk on contact (Gen 6+)
  | "spiky-shield" // Blocks all; 1/8 HP chip on contact (Gen 6+)
  | "mat-block" // Team-side, blocks damaging; first turn only (Gen 6+)
  | "crafty-shield" // Team-side, blocks status moves (Gen 6+)
  | "baneful-bunker" // Blocks all; poisons contact attackers (Gen 7+)
  | "obstruct" // Blocks all; -2 Def on contact (Gen 8)
  | "max-guard" // Dynamax protect; blocks ALL moves (Gen 8)
  | "silk-trap"; // Blocks all; -1 Speed on contact (Gen 9)

/**
 * Trapping volatiles — prevent the target (or user) from switching out.
 */
export type TrappingVolatile =
  | "bound" // Bind, Wrap, Fire Spin, etc.
  | "trapped" // Mean Look, Spider Web (Gen 2+)
  | "no-retreat" // Gen 8 — user trapped after boosting
  | "octolock" // Gen 8 — traps + stat drops each turn
  | "jaw-lock"; // Gen 8 — traps both user and target

/**
 * Move restriction volatiles — limit which moves the Pokemon can select.
 */
export type MoveRestrictionVolatile =
  | "taunt"
  | "torment"
  | "encore"
  | "disable"
  | "choice-locked" // Choice item (Band/Specs/Scarf)
  | "embargo" // Prevents item use (Gen 4+)
  | "heal-block"; // Prevents healing moves (Gen 4+)

/**
 * Multi-turn and locked-in move volatiles — the Pokemon is forced to
 * continue using the same move for multiple turns.
 */
export type MultiTurnMoveVolatile =
  | "thrash-lock" // Thrash / Petal Dance / Outrage forced continuation; data: { moveId: string }
  | "uproar" // Prevents sleep, lasts 3 turns (Gen 3+)
  | "rollout" // Escalating power over consecutive turns (Gen 2+)
  | "rage" // Gen 1 Rage lock-in; data: { moveIndex: number }
  | "bide" // Gen 1 Bide charging; data: { accumulatedDamage: number }
  | "fury-cutter"; // Escalating power on consecutive use (Gen 2+)

/**
 * Charging move volatile — the Pokemon is preparing a two-turn move
 * but is NOT semi-invulnerable (e.g., SolarBeam, Skull Bash, Sky Attack).
 */
export type ChargingMoveVolatile = "charging";

/**
 * Condition volatiles — afflictions applied to the Pokemon that cause
 * recurring effects (damage, disruption, forced behavior).
 */
export type ConditionVolatile =
  | "confusion"
  | "infatuation"
  | "leech-seed"
  | "curse" // Ghost-type Curse effect
  | "nightmare"
  | "perish-song"
  | "yawn"
  | "drowsy" // Gen 9 — from Yawn equivalent
  | "flinch"
  | "salt-cure" // Residual 1/8 (1/4 for Water/Steel) damage per turn (Gen 9)
  | "destiny-bond" // If the user faints, the opponent faints too
  | "tar-shot"; // Gen 8 — doubles Fire effectiveness

/**
 * Stat modifier volatiles — affect stat stages or provide defensive buffs.
 */
export type StatModifierVolatile =
  | "focus-energy" // +2 crit stage
  | "mist" // Protects team from stat-lowering moves (Gen 1+)
  | "magnet-rise"; // Grants Ground immunity (Gen 4+)

/**
 * Substitute and barrier volatiles.
 */
export type SubstituteVolatile = "substitute" | "shed-tail-sub"; // Shed Tail substitute passed to switch-in (Gen 9)

/**
 * Healing volatiles — provide passive HP recovery each turn.
 */
export type HealingVolatile =
  | "ingrain" // Heals 1/16 HP per turn + anchors (prevents switching)
  | "aqua-ring"; // Heals 1/16 HP per turn

/**
 * Ability-activated volatiles — set by ability triggers to track state
 * (e.g., Flash Fire boost active, Disguise broken, form change used).
 */
export type AbilityVolatile =
  | "flash-fire" // Fire moves +50% when hit by Fire (Gen 3+)
  | "slow-start" // Halves Attack and Speed for 5 turns (Gen 4+, Regigigas)
  | "unburden" // Speed doubled when item consumed/lost (Gen 4+)
  | "truant-turn" // Alternates acting/loafing each turn (Gen 3+)
  | "illusion" // Disguised as last party member (Gen 5+, Zoroark)
  | "disguise-broken" // Mimikyu's Disguise has been broken (Gen 7+)
  | "power-construct-transformed" // Zygarde transformed to Complete Form (Gen 7+)
  | "battle-bond-transformed" // Greninja transformed to Ash-Greninja (Gen 7+)
  | "protosynthesis" // Boosts highest stat in Sun / Booster Energy (Gen 9); data: { boostedStat: string }
  | "quarkdrive" // Boosts highest stat on Electric Terrain / Booster Energy (Gen 9); data: { boostedStat: string }
  | "embody-aspect-used" // Ogerpon once-per-battle activation (Gen 9)
  | "intrepid-sword-used" // Once-per-battle flag (Gen 9 nerf)
  | "dauntless-shield-used" // Once-per-battle flag (Gen 9 nerf)
  | "protean-used" // Once-per-switchin flag (Gen 9 nerf)
  | "harvest-berry"; // Tracks last consumed berry for Harvest (Gen 5+); data: { berryId: string }

/**
 * Field-effect volatiles — modify move power for all Pokemon on the field.
 */
export type FieldEffectVolatile =
  | "charged" // Charge — doubles next Electric move's power (Gen 3+)
  | "mud-sport" // Halves Electric move power on field (Gen 3-4)
  | "water-sport"; // Halves Fire move power on field (Gen 3-4)

/**
 * Tracking / bookkeeping volatiles — internal counters, one-turn markers,
 * and transformation data that don't fit other categories.
 */
export type TrackingVolatile =
  | "recharge" // Must recharge next turn (Hyper Beam, etc.)
  | "sleep-counter" // Tracks remaining sleep turns
  | "toxic-counter" // Tracks escalating Toxic damage increments
  | "metronome-count" // Metronome item consecutive-use tracker (Gen 4+)
  | "just-frozen" // Gen 2 — frozen-this-turn flag (pokecrystal wPlayerJustGotFrozen)
  | "rage-miss-lock" // Gen 1 — Rage auto-miss after first miss
  | "mimic-slot" // Gen 1 Mimic slot tracking; data: { slot: number, originalMoveId: string }
  | "transform-data" // Stores original moves/types/stats for Transform restoration
  | "hazard-status-source"; // One-turn marker: Toxic Spikes status source for Synchronize check (Gen 5+)

// ---------------------------------------------------------------------------
// Master union — the union of ALL sub-types above.
// Existing code that uses VolatileStatus is unaffected.
// ---------------------------------------------------------------------------

/**
 * Volatile status conditions — can have multiple at once.
 * These are cleared when the Pokemon switches out or the battle ends.
 *
 * This is the union of all semantic sub-types:
 * {@link SemiInvulnerableVolatile}, {@link ProtectVolatile},
 * {@link TrappingVolatile}, {@link MoveRestrictionVolatile},
 * {@link MultiTurnMoveVolatile}, {@link ChargingMoveVolatile},
 * {@link ConditionVolatile}, {@link StatModifierVolatile},
 * {@link SubstituteVolatile}, {@link HealingVolatile},
 * {@link AbilityVolatile}, {@link FieldEffectVolatile},
 * {@link TrackingVolatile}
 */
export type VolatileStatus =
  | SemiInvulnerableVolatile
  | ProtectVolatile
  | TrappingVolatile
  | MoveRestrictionVolatile
  | MultiTurnMoveVolatile
  | ChargingMoveVolatile
  | ConditionVolatile
  | StatModifierVolatile
  | SubstituteVolatile
  | HealingVolatile
  | AbilityVolatile
  | FieldEffectVolatile
  | TrackingVolatile;
