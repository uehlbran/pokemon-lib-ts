import type {
  AbilityTrigger,
  BattleStat,
  CORE_STAT_IDS,
  EntryHazardType,
  Generation,
  MoveCategory,
  MoveData,
  PokemonInstance,
  PokemonSpeciesData,
  PokemonType,
  PrimaryStatus,
  SeededRandom,
  TerrainType,
  TwoTurnMoveVolatileByGeneration,
  VolatileStatus,
  VolatileStatusByGeneration,
  WeatherType,
} from "@pokemon-lib-ts/core";
import type {
  BATTLE_ABILITY_EFFECT_TYPES,
  BATTLE_EFFECT_TARGETS,
  BATTLE_ITEM_EFFECT_TYPES,
} from "../constants/effect-protocol";
import type { BattleEvent } from "../events/BattleEvent";
import type {
  ActivePokemon,
  ActivePokemonFor,
  BattleSide,
  TrainerDataRef,
} from "../state/BattleSide";
import type { BattleFormat, BattleState, BattleStateFor } from "../state/BattleState";

/**
 * All inputs required for a generation's damage calculation.
 * Passed to `GenerationRuleset.calculateDamage()`.
 */
export interface DamageContext {
  /** The Pokémon using the move */
  readonly attacker: ActivePokemon;
  /** The Pokémon receiving the damage */
  readonly defender: ActivePokemon;
  /** The move being used */
  readonly move: MoveData;
  /** Current full battle state (weather, terrain, field conditions) */
  readonly state: BattleState;
  /** PRNG instance for the random damage roll */
  readonly rng: SeededRandom;
  /** Whether this hit is a critical hit (already determined before damage calc) */
  readonly isCrit: boolean;
  /**
   * Set to `true` when a Z-Move or Max Move bypasses Protect/Detect/etc.
   * The damage calc should apply a 0.25x modifier (via pokeRound) when this flag is set.
   *
   * Source: Showdown sim/battle-actions.ts -- Z-Moves bypass Protect at 0.25x damage
   * Source: Bulbapedia "Z-Move" -- "deals a quarter of its damage" through Protect
   * Source: Bulbapedia "Max Move" -- Max Moves also deal 25% through Protect
   */
  readonly hitThroughProtect?: boolean;
}

/**
 * Output of a generation's damage calculation.
 * Returned by `GenerationRuleset.calculateDamage()`.
 */
export interface DamageResult {
  /** Final HP to subtract from the defender (always a non-negative integer) */
  readonly damage: number;
  /** Type-effectiveness multiplier applied (one of: 0, 0.25, 0.5, 1, 2, 4) */
  readonly effectiveness: number;
  /** Whether this result was a critical hit */
  readonly isCrit: boolean;
  /** The random factor applied to the final damage (typically 0.85–1.0) */
  readonly randomFactor: number;
  /** Optional per-modifier breakdown; present when `BattleConfig` requests detailed logging */
  readonly breakdown?: DamageBreakdown;
  /** The effective move type used for damage (may differ from move.type for Hidden Power etc.) */
  readonly effectiveType?: PokemonType;
  /** The effective category used for damage (may differ from move.category for type-split gens) */
  readonly effectiveCategory?: "physical" | "special" | "status";
}

/**
 * Per-modifier breakdown of a damage calculation result.
 * Useful for damage log display and debugging. Only populated when requested.
 * All modifier values are multipliers applied to the base damage.
 */
export interface DamageBreakdown {
  /** Damage before any multipliers (`floor((2*Level/5 + 2) * Power * Atk/Def / 50) + 2`) */
  readonly baseDamage: number;
  /** Weather modifier (e.g., 1.5 for rain + Water move, 0.5 for rain + Fire move) */
  readonly weatherMultiplier: number;
  /** Critical hit modifier (1.5 in Gen 6+, 2.0 in Gen 1–5) */
  readonly critMultiplier: number;
  /** Random damage roll (0.85–1.0 in Gen 5+; 217/255–255/255 in Gen 1–4) */
  readonly randomMultiplier: number;
  /** STAB (Same-Type Attack Bonus) modifier (1.5, or 2.0 with Adaptability) */
  readonly stabMultiplier: number;
  /** Type-effectiveness product (0, 0.25, 0.5, 1, 2, or 4) */
  readonly typeMultiplier: number;
  /** Burn modifier (0.5 for burned attacker using a physical move; 1.0 otherwise) */
  readonly burnMultiplier: number;
  /** Net ability modifier from attacker and defender abilities */
  readonly abilityMultiplier: number;
  /** Net held-item modifier from attacker and defender items */
  readonly itemMultiplier: number;
  /** Catch-all for any additional modifier not covered by the fields above */
  readonly otherMultiplier: number;
  /** The damage value after all multipliers are applied (equals `DamageResult.damage`) */
  readonly finalDamage: number;
}

/**
 * All inputs required for critical hit determination.
 * Passed to `GenerationRuleset.isCriticalHit()`.
 */
export interface CritContext {
  /** The Pokémon using the move */
  readonly attacker: ActivePokemon;
  /** The move being used */
  readonly move: MoveData;
  /** Current full battle state */
  readonly state: BattleState;
  /** PRNG instance for the crit roll */
  readonly rng: SeededRandom;
  /** The defending Pokémon (optional — used by abilities like Battle Armor / Shell Armor) */
  readonly defender?: ActivePokemon;
}

/**
 * All inputs required for an accuracy/evasion check.
 * Passed to `GenerationRuleset.checkAccuracy()`.
 */
export interface AccuracyContext {
  /** The Pokémon using the move */
  readonly attacker: ActivePokemon;
  /** The Pokémon being targeted */
  readonly defender: ActivePokemon;
  /** The move whose accuracy is being checked */
  readonly move: MoveData;
  /** Current full battle state */
  readonly state: BattleState;
  /** PRNG instance for the accuracy roll */
  readonly rng: SeededRandom;
}

/**
 * All inputs required when executing a move's secondary effects.
 * Passed to `GenerationRuleset.executePreDamageMoveEffect()` after a move has
 * already passed hit/protect checks but before the damage is finalized for the
 * current hit, or to `GenerationRuleset.executeMoveEffect()` after the damage
 * step for normal moves and before accuracy/damage for charge-turn setup
 * handling on two-turn moves.
 */
export interface MoveEffectContext {
  /** The Pokémon that used the move */
  readonly attacker: ActivePokemon;
  /** The Pokémon that was targeted */
  readonly defender: ActivePokemon;
  /** The move that was used */
  readonly move: MoveData;
  /**
   * Damage associated with this hit.
   * For pre-damage hooks this is the preliminary projected damage from the
   * first damage pass; for post-damage hooks it is the actual damage dealt.
   */
  readonly damage: number;
  /** Current full battle state */
  readonly state: BattleState;
  /** PRNG instance for secondary effect rolls */
  readonly rng: SeededRandom;
  /**
   * Set to `true` by the engine when this hit destroyed the defender's substitute.
   * Used by Gen 1 Hyper Beam to skip recharge when a substitute is broken.
   * Source: gen1-ground-truth.md — Hyper Beam skips recharge if it breaks a Substitute.
   */
  readonly brokeSubstitute?: boolean;
  /**
   * The move the defender selected this turn, if known. Used by Sucker Punch
   * to fail when the defender chose a status move.
   * Source: Showdown sim/battle-actions.ts Gen 4 — Sucker Punch onTry
   */
  readonly defenderSelectedMove?: { id: string; category: MoveCategory } | null;
}

export type MoveEffectSideTarget =
  | typeof BATTLE_EFFECT_TARGETS.attacker
  | typeof BATTLE_EFFECT_TARGETS.defender;

export type MoveEffectSideTargetWithBoth = MoveEffectSideTarget | typeof BATTLE_EFFECT_TARGETS.both;

/**
 * Structured result produced by `GenerationRuleset.executeMoveEffect()`.
 * The engine reads these fields and applies each effect to the battle state,
 * emitting the appropriate BattleEvents. All fields are optional/nullable;
 * unset fields mean "no effect of this type".
 */
export interface MoveEffectResult {
  /** Primary status condition to inflict on the defender, or `null` */
  readonly statusInflicted: PrimaryStatus | null;
  /** Volatile status to inflict on the defender, or `null` */
  readonly volatileInflicted: VolatileStatus | null;
  /**
   * Volatile status to inflict on the defender with source-link metadata.
   * Use this for effects that immobilize the target until the source leaves
   * the field or the effect is explicitly cleared.
   */
  readonly targetVolatileInflicted?: {
    volatile: VolatileStatus;
    turnsLeft?: number;
    data?: Record<string, unknown>;
    sourcePokemonUid?: string;
    blocksAction?: boolean;
  } | null;
  /** Stat stage changes to apply; empty array means no stat changes */
  readonly statChanges: ReadonlyArray<{
    target: MoveEffectSideTarget;
    stat: BattleStat;
    stages: number;
  }>;
  /** Recoil damage to deal to the attacker (0 = no recoil) */
  readonly recoilDamage: number;
  /** HP to restore to the attacker (0 = no healing) */
  readonly healAmount: number;
  /**
   * HP to restore to the DEFENDER (e.g., Heal Pulse).
   * Unlike `healAmount` which heals the attacker, this heals the target of the move.
   * 0 or undefined = no defender healing.
   *
   * Source: Showdown data/moves.ts -- healPulse: { target: 'normal', heal: [1, 2] }
   */
  readonly defenderHealAmount?: number;
  /** `true` if the attacker should be forced to switch out after this move */
  readonly switchOut: boolean;
  /**
   * `true` if the move should immediately end the battle as a successful escape.
   * Used by mechanics like wild-battle Teleport in Gen 1.
   */
  readonly escapeBattle?: boolean;
  /**
   * `true` if the switch-out is a Baton Pass — stat stages and volatile statuses
   * should be preserved and transferred to the incoming Pokemon.
   * Only meaningful when `switchOut` is also `true`.
   */
  readonly batonPass?: boolean;
  /** When `true` along with `switchOut`, the DEFENDER is forced to switch (Whirlwind/Roar phazing) */
  readonly forcedSwitch?: boolean;
  /** Freeform messages to emit as `MessageEvent`s after the move resolves */
  readonly messages: readonly string[];
  /** Wave 1: Set a screen (Reflect/Light Screen) on the attacker's side */
  readonly screenSet?: {
    screen: string;
    turnsLeft: number;
    side: MoveEffectSideTarget;
  } | null;
  /** Wave 1: Attacker faints after using the move (Explosion, Self-Destruct) */
  readonly selfFaint?: boolean;
  /** Wave 1: Skip recharge next turn (e.g., Hyper Beam KO'd the target) */
  readonly noRecharge?: boolean;
  /** Wave 1: Custom damage to apply to a target (for OHKO, fixed-damage, Counter) */
  readonly customDamage?: {
    target: MoveEffectSideTarget;
    amount: number;
    source: string;
    /** The type of the move dealing this damage, for lastDamageType tracking */
    type?: PokemonType | null;
  } | null;
  /** Cure the target's status AND reset their stat stages (e.g., Haze cures defender's status) */
  readonly statusCured?: { target: MoveEffectSideTargetWithBoth } | null;
  /** Wave 2/3: Data for volatile status infliction (turnsLeft, etc.) */
  readonly volatileData?: { turnsLeft: number; data?: Record<string, unknown> } | null;
  readonly weatherSet?: { weather: WeatherType; turns: number; source: string } | null;
  /**
   * Set terrain on the field (Gen 6+). `null` clears terrain.
   * Source: Showdown sim/battle-actions.ts — terrain moves set terrain for 5 turns (8 with Terrain Extender)
   */
  readonly terrainSet?: {
    terrain: TerrainType;
    turns: number;
    source: string;
  } | null;
  readonly hazardSet?: { hazard: EntryHazardType; targetSide: 0 | 1 } | null;
  readonly volatilesToClear?: ReadonlyArray<{
    target: MoveEffectSideTarget;
    volatile: VolatileStatus;
  }>;
  readonly clearSideHazards?: MoveEffectSideTarget;
  readonly itemTransfer?: { from: MoveEffectSideTarget; to: MoveEffectSideTarget };
  /** Gen 1: Clear screens from the specified side(s) (Haze or setter switching out) */
  readonly screensCleared?: MoveEffectSideTargetWithBoth | null;
  /**
   * When set alongside `screensCleared`, only remove screens whose type is in this list.
   * E.g., Brick Break sets `["reflect", "light-screen"]` to avoid removing Safeguard.
   * If omitted, all screens are cleared (Defog behavior).
   *
   * Source: pret/pokeemerald EFFECT_BRICK_BREAK -- only removes Reflect and Light Screen
   */
  readonly screenTypesToRemove?: readonly string[];
  /** Reset stat stages for target(s) WITHOUT curing status (e.g. Haze resets attacker stages) */
  readonly statStagesReset?: { target: MoveEffectSideTargetWithBoth } | null;
  /** Cure the attacker's status WITHOUT resetting stat stages (unlike statusCured which is Haze-only) */
  readonly statusCuredOnly?: { target: MoveEffectSideTargetWithBoth } | null;
  /**
   * Cure primary status on ALL Pokemon on the specified side's team (including bench).
   * Used by Aromatherapy and Heal Bell which cure the entire party, not just the active Pokemon.
   *
   * Source: Bulbapedia -- "Aromatherapy cures the status conditions of all Pokemon on the user's team"
   * Source: Showdown data/moves.ts -- aromatherapy: { target: 'allyTeam' }
   */
  readonly teamStatusCure?: { side: MoveEffectSideTarget } | null;
  /**
   * Change the active ability of the attacker or defender.
   * Used by Entrainment (replaces target's ability with user's ability),
   * Skill Swap, etc.
   *
   * Source: Showdown data/moves.ts -- entrainment: target.setAbility(source.ability)
   */
  readonly abilityChange?: {
    target: MoveEffectSideTarget;
    ability: string;
  } | null;
  /** Primary status to inflict on the ATTACKER (e.g., Rest's self-sleep) */
  readonly selfStatusInflicted?: PrimaryStatus | null;
  /** Volatile status to inflict on the ATTACKER */
  readonly selfVolatileInflicted?: VolatileStatus | null;
  /** Data for selfVolatileInflicted (turnsLeft, etc.) */
  readonly selfVolatileData?: { turnsLeft: number; data?: Record<string, unknown> } | null;
  /** Change the types of the attacker or defender */
  readonly typeChange?: { target: MoveEffectSideTarget; types: readonly PokemonType[] } | null;
  /**
   * Move ID to execute immediately after this move resolves (for Mirror Move, Metronome).
   * No PP is deducted for the recursive move.
   * Source: pret/pokered MirrorMoveEffect, MetronomeEffect
   */
  readonly recursiveMove?: string | null;
  /**
   * Replace a move slot in the attacker's moveset temporarily (for Mimic).
   * The engine replaces the slot, stores the original in a `mimic-slot` volatile,
   * and Gen1Ruleset restores it in `onSwitchOut`.
   * Source: pret/pokered MimicEffect
   */
  readonly moveSlotChange?: {
    slot: number;
    newMoveId: string;
    newPP: number;
    originalMoveId: string;
  } | null;
  /** Set Tailwind on a side (Gen 4+) */
  readonly tailwindSet?: { turnsLeft: number; side: MoveEffectSideTarget } | null;
  /** Set Trick Room on the field (Gen 4+) */
  readonly trickRoomSet?: { turnsLeft: number } | null;
  /** Schedule a Future Sight / Doom Desire attack on the target side (Gen 2+) */
  readonly futureAttack?: { moveId: string; turnsLeft: number; sourceSide: 0 | 1 } | null;
  /** Activate Gravity field effect (Gen 4+) */
  readonly gravitySet?: boolean;
  /** Set Magic Room on the field (Gen 5+); suppresses held items for 5 turns */
  readonly magicRoomSet?: { turnsLeft: number } | null;
  /** Set Wonder Room on the field (Gen 5+); swaps Def and SpDef for 5 turns */
  readonly wonderRoomSet?: { turnsLeft: number } | null;
  /**
   * Set a forced move for the next turn (two-turn moves like Fly, Dig, SolarBeam).
   * The volatile status is applied to the attacker during the charge turn; it is
   * removed before the forced move executes on the second turn.
   */
  readonly forcedMoveSet?: {
    moveIndex: number;
    moveId: string;
    volatileStatus: VolatileStatus;
  } | null;
  /**
   * Number of additional hits for multi-hit moves (Fury Attack, Pin Missile, etc.).
   * When set, the engine repeats the damage calculation this many additional times
   * (e.g., multiHitCount=4 means 4 MORE hits after the initial one, for 5 total).
   * Source: pokered multi-hit distribution — 37.5/37.5/12.5/12.5% for 2/3/4/5 hits.
   */
  readonly multiHitCount?: number | null;
  /**
   * Pre-computed damage values for each additional hit of a multi-hit move.
   * When set, the engine uses `perHitDamage[i]` instead of repeating the first hit's
   * damage for the i-th additional hit (0-indexed).
   *
   * Required for moves where damage varies per hit:
   * - Triple Kick: power escalates 10 → 20 → 30 per hit
   * - Beat Up (Gen 2): each hit uses a different party member's base Attack
   *
   * Length should equal `multiHitCount`. If shorter, remaining hits use first-hit damage.
   * If not set or null, all hits use the first hit's damage (default behavior).
   *
   * Source: Bulbapedia — "Triple Kick: Power increases by 10 with each successive hit"
   * Source: pret/pokecrystal engine/battle/effect_commands.asm BeatUpEffect
   */
  readonly perHitDamage?: readonly number[] | null;
  /**
   * Lazy per-hit damage function for multi-hit moves with variable power/stats.
   * When set, the engine calls `perHitDamageFn(hitIndex)` for each additional hit
   * instead of indexing into a precomputed `perHitDamage` array. This ensures RNG
   * is only consumed for hits that actually execute (e.g., if the target faints
   * after hit 1, no RNG is consumed for hit 2).
   *
   * Takes precedence over `perHitDamage` when both are set.
   *
   * `hitIndex` is 0-based for additional hits (hit index 0 = the 2nd hit overall).
   *
   * Source: pret/pokecrystal engine/battle/effect_commands.asm — TripleKickEffect
   *   and BeatUpEffect both compute damage inside the hit loop, not before it.
   */
  readonly perHitDamageFn?: ((hitIndex: number) => number) | null;
  /**
   * Schedule a Wish on the attacker's side. At the end of the next turn, the
   * active Pokemon in that slot is healed by `healAmount` HP.
   *
   * `turnsLeft` is the countdown duration; Gen 3+ Wish uses 2 (fires at end of the
   * next turn). Handlers must set this explicitly so the engine does not hardcode
   * the duration — this allows future gens to vary Wish timing if needed.
   *
   * Source: Showdown data/moves.ts -- wish: { condition: { duration: 2, onResidual: heals floor(hp/2) } }
   * Source: Bulbapedia -- "At the end of the next turn, the Pokemon in the slot
   *   will be restored by half the maximum HP of the Pokemon that used Wish"
   */
  readonly wishSet?: { healAmount: number; turnsLeft: number } | null;
  /**
   * `true` if this move is Shed Tail — attacker voluntarily switches out after creating a substitute
   * for the incoming Pokemon. This is the ONLY voluntary self-switch that triggers a switch prompt
   * mid-turn (via sidesNeedingSwitch). Baton Pass and U-turn are NOT self-switches in this engine —
   * they rely on different resolution paths.
   *
   * Using a specific flag (rather than `switchOut && !forcedSwitch`) prevents gen3-8 moves
   * like Baton Pass and U-turn from accidentally triggering the switch prompt.
   *
   * Source: Showdown data/moves.ts:16795 -- selfSwitch: 'shedtail' is distinct from 'copyvolatile'
   */
  readonly shedTail?: boolean;
  /**
   * When `true`, the engine re-rolls accuracy before each additional hit in the
   * multi-hit loop. If a hit misses, the loop stops immediately.
   *
   * Used for Population Bomb (Gen 9), which is a 10-hit move where EACH hit
   * independently checks accuracy (unlike normal multi-hit moves that check once).
   *
   * Source: Showdown data/moves.ts:14112-14126 -- populationbomb: multiaccuracy: true
   */
  readonly checkPerHitAccuracy?: boolean;
  /**
   * When `true`, the engine will consume the attacker's held item after processing this
   * move effect — sets heldItem to null and emits an `item-consumed` event.
   *
   * Used for moves that consume the user's item as part of their effect: Power Herb
   * (skips charge turn), Natural Gift (berry consumed), Fling (item thrown at target).
   *
   * The item is read from `attacker.pokemon.heldItem` at the time processEffectResult
   * runs, so move handlers should NOT set heldItem to null themselves — let the engine
   * do it via this flag.
   *
   * Source: Showdown data/moves.ts — naturalGift, fling, and powerherb all consume
   *   the user's item as part of the move's onTryMove / onAfterMove lifecycle.
   */
  readonly attackerItemConsumed?: boolean;
}

export type DamageContextFor<G extends Generation> = Omit<
  DamageContext,
  "attacker" | "defender" | "state"
> & {
  readonly attacker: ActivePokemonFor<G>;
  readonly defender: ActivePokemonFor<G>;
  readonly state: BattleStateFor<G>;
};

export type CritContextFor<G extends Generation> = Omit<
  CritContext,
  "attacker" | "state" | "defender"
> & {
  readonly attacker: ActivePokemonFor<G>;
  readonly state: BattleStateFor<G>;
  readonly defender?: ActivePokemonFor<G>;
};

export type AccuracyContextFor<G extends Generation> = Omit<
  AccuracyContext,
  "attacker" | "defender" | "state"
> & {
  readonly attacker: ActivePokemonFor<G>;
  readonly defender: ActivePokemonFor<G>;
  readonly state: BattleStateFor<G>;
};

export type MoveEffectContextFor<G extends Generation> = Omit<
  MoveEffectContext,
  "attacker" | "defender" | "state"
> & {
  readonly attacker: ActivePokemonFor<G>;
  readonly defender: ActivePokemonFor<G>;
  readonly state: BattleStateFor<G>;
};

export type MoveEffectResultFor<G extends Generation> = Omit<
  MoveEffectResult,
  | "volatileInflicted"
  | "targetVolatileInflicted"
  | "volatilesToClear"
  | "selfVolatileInflicted"
  | "forcedMoveSet"
> & {
  readonly volatileInflicted: VolatileStatusByGeneration<G> | null;
  readonly targetVolatileInflicted?: {
    volatile: VolatileStatusByGeneration<G>;
    turnsLeft?: number;
    data?: Record<string, unknown>;
    sourcePokemonUid?: string;
    blocksAction?: boolean;
  } | null;
  readonly volatilesToClear?: ReadonlyArray<{
    target: MoveEffectSideTarget;
    volatile: VolatileStatusByGeneration<G>;
  }>;
  readonly selfVolatileInflicted?: VolatileStatusByGeneration<G> | null;
  readonly forcedMoveSet?: {
    moveIndex: number;
    moveId: string;
    volatileStatus: TwoTurnMoveVolatileByGeneration<G>;
  } | null;
};

/**
 * All inputs required when triggering an ability.
 * Passed to `GenerationRuleset.applyAbility()`.
 */
export interface AbilityContext {
  /** The Pokémon whose ability is triggering */
  readonly pokemon: ActivePokemon;
  /** The opposing Pokémon, if relevant to the trigger (omitted for field-wide abilities) */
  readonly opponent?: ActivePokemon;
  /** Current full battle state */
  readonly state: BattleState;
  /** PRNG instance for any ability rolls */
  readonly rng: SeededRandom;
  /**
   * The trigger id being evaluated for this ability.
   *
   * Most values come from BattleEngine lifecycle dispatch (`on-switch-in`,
   * `on-damage-taken`, etc.), while some triggers like `on-damage-calc` are
   * ruleset-local and only used by generation damage pipelines.
   */
  readonly trigger: AbilityTrigger;
  /** The move involved in the trigger, if applicable */
  readonly move?: MoveData;
  /** Damage dealt this turn, if the trigger is damage-related */
  readonly damage?: number;
  /**
   * For `on-stat-change` triggers: describes the stat change being attempted.
   * `stat` is the stat being changed, `stages` is the signed delta (negative = drop),
   * `source` indicates whether the change was caused by an opponent or self.
   * Absent for all other trigger types.
   */
  readonly statChange?: {
    readonly stat: BattleStat;
    readonly stages: number;
    readonly source: AbilitySourceTarget;
  };
  /** Whether the current hit is a critical hit (used by Sniper gating). */
  readonly isCrit?: boolean;
  /** The computed type-effectiveness multiplier (used by Tinted Lens / Solid Rock / Filter gating). */
  readonly typeEffectiveness?: number;
}

/**
 * Result of an ability trigger.
 * Returned by `GenerationRuleset.applyAbility()`.
 */
type AbilityTarget = typeof BATTLE_EFFECT_TARGETS.self | typeof BATTLE_EFFECT_TARGETS.opponent;
type AbilityTargetWithAlly = AbilityTarget | typeof BATTLE_EFFECT_TARGETS.ally;
type AbilityTargetWithField = AbilityTarget | typeof BATTLE_EFFECT_TARGETS.field;
type AbilitySourceTarget =
  | typeof BATTLE_EFFECT_TARGETS.self
  | typeof BATTLE_EFFECT_TARGETS.opponent;
type StageableBattleStat = Exclude<BattleStat, typeof CORE_STAT_IDS.hp>;

/** Discriminated union of ability effect categories. */
export type AbilityEffectType =
  (typeof BATTLE_ABILITY_EFFECT_TYPES)[keyof typeof BATTLE_ABILITY_EFFECT_TYPES];

/** A single effect produced by an ability trigger — proper discriminated union on effectType. */
export type AbilityEffect =
  | {
      readonly effectType: typeof BATTLE_ABILITY_EFFECT_TYPES.statChange;
      readonly target: AbilityTarget;
      readonly stat: StageableBattleStat;
      readonly stages: number;
    }
  | {
      readonly effectType: typeof BATTLE_ABILITY_EFFECT_TYPES.weatherSet;
      readonly target: typeof BATTLE_EFFECT_TARGETS.field;
      readonly weather: import("@pokemon-lib-ts/core").WeatherType;
      readonly weatherTurns: number;
    }
  | {
      readonly effectType: typeof BATTLE_ABILITY_EFFECT_TYPES.damageReduction;
      readonly target: AbilityTarget;
    }
  | {
      readonly effectType: typeof BATTLE_ABILITY_EFFECT_TYPES.typeChange;
      readonly target: AbilityTarget;
      readonly types: readonly import("@pokemon-lib-ts/core").PokemonType[];
    }
  | {
      readonly effectType: typeof BATTLE_ABILITY_EFFECT_TYPES.statusCure;
      readonly target: AbilityTargetWithAlly;
    }
  | {
      readonly effectType: typeof BATTLE_ABILITY_EFFECT_TYPES.abilityChange;
      readonly target: AbilityTarget;
      readonly newAbility: string;
    }
  | {
      readonly effectType: typeof BATTLE_ABILITY_EFFECT_TYPES.heal;
      readonly target: AbilityTarget;
      readonly value: number;
    }
  | {
      readonly effectType: typeof BATTLE_ABILITY_EFFECT_TYPES.chipDamage;
      readonly target: AbilityTarget;
      readonly value: number;
    }
  | {
      readonly effectType: typeof BATTLE_ABILITY_EFFECT_TYPES.statusInflict;
      readonly target: AbilityTarget;
      readonly status: PrimaryStatus;
    }
  | {
      readonly effectType: typeof BATTLE_ABILITY_EFFECT_TYPES.volatileInflict;
      readonly target: AbilityTarget;
      readonly volatile: VolatileStatus;
      readonly data?: Record<string, unknown>;
    }
  | {
      readonly effectType: typeof BATTLE_ABILITY_EFFECT_TYPES.volatileRemove;
      readonly target: AbilityTarget;
      readonly volatile: VolatileStatus;
    }
  | {
      readonly effectType: typeof BATTLE_ABILITY_EFFECT_TYPES.itemRestore;
      readonly target: typeof BATTLE_EFFECT_TARGETS.self;
      readonly item: string;
    }
  | {
      readonly effectType: typeof BATTLE_ABILITY_EFFECT_TYPES.none;
      readonly target: AbilityTargetWithField;
    };

export interface AbilityResult {
  /** `true` if the ability actually activated and produced effects */
  readonly activated: boolean;
  /** Ordered list of effects the engine should apply to the battle state */
  readonly effects: readonly AbilityEffect[];
  /** Freeform messages to emit as `MessageEvent`s */
  readonly messages: readonly string[];
  /** Set to `true` when an ability blocks the move entirely (e.g., Truant skips a turn) */
  readonly movePrevented?: boolean;
  /**
   * Priority boost returned by `on-priority-check` triggers.
   * Used by `resolveTurnOrder` to adjust move priority.
   *
   * - Prankster: +1 (status moves)
   * - Gale Wings: +1 (Flying-type moves; Gen 7+ requires full HP)
   * - Triage: +3 (healing moves)
   * - Quick Draw: treated as "go first" within bracket (not a numeric boost)
   *
   * Absent or 0 means no priority modification.
   *
   * Source: Showdown sim/battle.ts -- getActionSpeed computes effective priority
   *   including ability boosts (onModifyPriority / onFractionalPriority)
   */
  readonly priorityBoost?: number;
}

/**
 * All inputs required when triggering a held item.
 * Passed to `GenerationRuleset.applyItem()`.
 */
export interface ItemContext {
  /** The Pokémon holding the item */
  readonly pokemon: ActivePokemon;
  /**
   * The opposing Pokémon, if relevant to the trigger.
   * Present for on-contact and on-damage-taken triggers (e.g., Rocky Helmet, Sticky Barb transfer)
   * so item handlers can deal damage to the attacker or read the attacker's properties.
   */
  readonly opponent?: ActivePokemon;
  /** Current full battle state */
  readonly state: BattleState;
  /** PRNG instance for any item rolls */
  readonly rng: SeededRandom;
  /** The move involved in the trigger, if applicable */
  readonly move?: MoveData;
  /** Damage dealt this turn, if the trigger is damage-related */
  readonly damage?: number;
}

type ItemEffectTarget = typeof BATTLE_EFFECT_TARGETS.self | typeof BATTLE_EFFECT_TARGETS.opponent;
type ItemEffectTargetWithField = ItemEffectTarget | typeof BATTLE_EFFECT_TARGETS.field;

/** Discriminated union of item effect categories. */
export type ItemEffectType =
  (typeof BATTLE_ITEM_EFFECT_TYPES)[keyof typeof BATTLE_ITEM_EFFECT_TYPES];

/**
 * A single effect produced by an item trigger — proper discriminated union on `type`.
 *
 * Preferred variants for new code:
 * - `chip-damage`: Life Orb recoil, Black Sludge damage, Sticky Barb, Rocky Helmet — value is HP amount
 * - `inflict-status`: Toxic Orb, Flame Orb — status field is the PrimaryStatus to inflict
 *
 * Legacy variants kept for backward compatibility (Gen 3–4 items):
 * - `self-damage`: generic damage to a target (value: number); prefer `chip-damage` in new code
 * - `status-inflict`: status via value field (value: PrimaryStatus string); prefer `inflict-status` in new code
 */
export type ItemEffect =
  | {
      readonly type: typeof BATTLE_ITEM_EFFECT_TYPES.heal;
      readonly target: ItemEffectTarget;
      readonly value: number;
    }
  | { readonly type: typeof BATTLE_ITEM_EFFECT_TYPES.statusCure; readonly target: ItemEffectTarget }
  | {
      readonly type: typeof BATTLE_ITEM_EFFECT_TYPES.consume;
      readonly target: ItemEffectTarget;
      readonly value: string;
    }
  | {
      readonly type: typeof BATTLE_ITEM_EFFECT_TYPES.survive;
      readonly target: typeof BATTLE_EFFECT_TARGETS.self;
      readonly value: number;
    }
  | { readonly type: typeof BATTLE_ITEM_EFFECT_TYPES.flinch; readonly target: ItemEffectTarget }
  | {
      readonly type: typeof BATTLE_ITEM_EFFECT_TYPES.volatileCure;
      readonly target: ItemEffectTarget;
      readonly value: string;
    }
  | {
      readonly type: typeof BATTLE_ITEM_EFFECT_TYPES.statBoost;
      readonly target: ItemEffectTarget;
      readonly value: string;
      readonly stages?: number;
    }
  | {
      readonly type: typeof BATTLE_ITEM_EFFECT_TYPES.speedBoost;
      readonly target: ItemEffectTarget;
      readonly value: number;
    }
  | {
      /** Chip damage to a target (Life Orb recoil, Black Sludge, Sticky Barb, Rocky Helmet). */
      readonly type: typeof BATTLE_ITEM_EFFECT_TYPES.chipDamage;
      readonly target: ItemEffectTarget;
      /** HP to subtract from the target (always positive). */
      readonly value: number;
    }
  | {
      /** Inflict a primary status condition on a target (Toxic Orb, Flame Orb). */
      readonly type: typeof BATTLE_ITEM_EFFECT_TYPES.inflictStatus;
      readonly target: ItemEffectTarget;
      readonly status: PrimaryStatus;
    }
  | {
      /** @deprecated Use `chip-damage` instead. Kept for Gen 3–4 backward compatibility. */
      readonly type: typeof BATTLE_ITEM_EFFECT_TYPES.selfDamage;
      readonly target: ItemEffectTarget;
      readonly value: number;
    }
  | {
      /** @deprecated Use `inflict-status` instead. Kept for Gen 3–4 backward compatibility. */
      readonly type: typeof BATTLE_ITEM_EFFECT_TYPES.statusInflict;
      readonly target?: ItemEffectTarget;
      readonly value: PrimaryStatus;
    }
  | {
      readonly type: typeof BATTLE_ITEM_EFFECT_TYPES.none;
      readonly target?: ItemEffectTargetWithField;
      readonly value?: number | string;
    };

/**
 * Result of a held item trigger.
 * Returned by `GenerationRuleset.applyItem()`.
 */
export interface ItemResult {
  /** `true` if the item actually activated and produced effects */
  readonly activated: boolean;
  /** Ordered list of effects the engine should apply to the battle state */
  readonly effects: readonly ItemEffect[];
  /** Freeform messages to emit as `MessageEvent`s */
  readonly messages: readonly string[];
}

/**
 * All inputs required to calculate how much EXP a Pokémon gains after a battle.
 * Passed to `GenerationRuleset.calculateExp()`.
 */
export interface ExpContext {
  /** Species data for the Pokémon that was defeated */
  readonly defeatedSpecies: PokemonSpeciesData;
  /** Level of the Pokémon that was defeated */
  readonly defeatedLevel: number;
  /** Level of the Pokémon that participated and is gaining EXP */
  readonly participantLevel: number;
  /** `true` if this is a trainer battle (1.5× multiplier in most gens) */
  readonly isTrainerBattle: boolean;
  /** Number of Pokémon that participated in defeating the target (EXP is split) */
  readonly participantCount: number;
  /** `true` if the participant holds a Lucky Egg (1.5× EXP) */
  readonly hasLuckyEgg: boolean;
  /** `true` if the participant holds or is affected by an Exp. Share */
  readonly hasExpShare: boolean;
  /** `true` if an Affection/friendship bonus applies (Gen 6+) */
  readonly affectionBonus: boolean;
  /**
   * `true` if the gaining Pokémon was obtained via trade (not caught by this trainer).
   * Traded Pokémon receive a boosted EXP multiplier. Defaults to `false` (not traded).
   *
   * Source: pret/pokeplatinum src/battle/battle_script.c lines 9980-9988
   *   `BattleSystem_PokemonIsOT` returns FALSE for traded Pokémon → EXP boost applied.
   */
  readonly isTradedPokemon?: boolean;
  /**
   * `true` if the trade was from a different game language/region (international trade).
   * Only meaningful when `isTradedPokemon` is `true`. Defaults to `false`.
   *
   * Gen 1–2: no language metadata exists — international trade is not modeled, so
   * only the 1.5× same-language bonus applies regardless of this field.
   * Gen 3+: international trades give 1.7× instead of 1.5×.
   *
   * Source: pret/pokeplatinum src/battle/battle_script.c lines 9981-9984
   *   `Pokemon_GetValue(mon, MON_DATA_LANGUAGE, NULL) != gGameLanguage` → 1.7×
   */
  readonly isInternationalTrade?: boolean;
}

/**
 * Interface for a battle gimmick — a once-per-battle mechanic tied to a specific
 * generation. Each gimmick knows which generations it applies to and how to activate,
 * revert, and modify moves.
 *
 * Implemented gimmicks:
 * - Mega Evolution (Gen 6)
 * - Z-Moves (Gen 7)
 * - Dynamax / Gigantamax (Gen 8)
 * - Terastallization (Gen 9)
 */
export interface BattleGimmick {
  /** Display name of the gimmick (e.g., `"Mega Evolution"`, `"Dynamax"`) */
  readonly name: string;
  /** Generations in which this gimmick is available */
  readonly generations: readonly Generation[];
  /**
   * Returns `true` if the gimmick can be activated for the given Pokémon on this turn.
   * Checks conditions such as holding the right item, gimmick not already used, etc.
   */
  canUse(pokemon: ActivePokemon, side: BattleSide, state: BattleState): boolean;
  /**
   * Activates the gimmick and returns the BattleEvents that result (e.g., `MegaEvolveEvent`).
   * Mutates `pokemon` and/or `side` state as needed.
   */
  activate(pokemon: ActivePokemon, side: BattleSide, state: BattleState): BattleEvent[];
  /**
   * Reverts the gimmick (e.g., Dynamax ending after 3 turns).
   * Returns any resulting BattleEvents. Optional — not all gimmicks revert automatically.
   */
  revert?(pokemon: ActivePokemon, state: BattleState): BattleEvent[];
  /**
   * Optionally transforms the move before it is executed (e.g., converting moves to Max Moves).
   * Returns the (possibly modified) move data.
   */
  modifyMove?(move: MoveData, pokemon: ActivePokemon): MoveData;
  /**
   * Resets per-battle state (e.g., clears usedBySide tracking) so the gimmick
   * is ready for a new battle when the same ruleset instance is reused.
   * Called by BattleEngine.start() before the battle begins.
   * Optional — only needed for gimmicks that cache state internally.
   */
  reset?(): void;
  /**
   * Serializes gimmick-owned per-battle state that is not stored in BattleState.
   * Used by BattleEngine save/load to preserve once-per-battle mechanics.
   */
  serializeState?(): unknown;
  /**
   * Restores gimmick-owned per-battle state from BattleEngine save/load data.
   * Implementations should tolerate malformed input and fall back to empty state.
   */
  restoreState?(state: unknown): void;
}

/**
 * Identifies a scheduled effect to be applied during the end-of-turn phase.
 * The engine iterates these in a generation-defined order. Each value corresponds to
 * a specific mechanic:
 *
 * - `weather-damage` — sandstorm/hail chip damage
 * - `weather-countdown` — decrement weather duration
 * - `terrain-countdown` — decrement terrain duration
 * - `status-damage` — burn/poison/badly-poisoned tick damage
 * - `leech-seed` — Leech Seed drains HP and transfers to seeder
 * - `curse` — Ghost-type Curse damage tick
 * - `bind` — partial trapping damage (Bind, Wrap, Fire Spin, etc.)
 * - `leftovers` — Leftovers / Black Sludge HP restoration
 * - `black-sludge` — Black Sludge (damages non-Poison types)
 * - `aqua-ring` — Aqua Ring HP restoration
 * - `ingrain` — Ingrain HP restoration
 * - `grassy-terrain-heal` — Grassy Terrain end-of-turn healing
 * - `wish` — Wish healing activates one turn later
 * - `future-attack` — Future Sight / Doom Desire damage triggers
 * - `perish-song` — Perish Song countdown; faints at 0
 * - `screen-countdown` — Reflect / Light Screen duration countdown
 * - `tailwind-countdown` — Tailwind duration countdown
 * - `trick-room-countdown` — Trick Room duration countdown
 * - `speed-boost` — Speed Boost ability raises Speed by 1 stage
 * - `moody` — Moody ability raises one stat and lowers another
 * - `bad-dreams` — Bad Dreams ability damages sleeping opponents
 * - `nightmare` — Nightmare status damage tick
 * - `harvest` — Harvest ability tries to restore a consumed Berry
 * - `pickup` — Pickup ability tries to collect a used item
 * - `poison-heal` — Poison Heal ability heals instead of taking poison damage
 * - `weather-healing` — Rain Dish, Dry Skin rain heal, Ice Body end-of-turn HP restoration
 * - `shed-skin` — Shed Skin 33% chance to cure primary status
 * - `toxic-orb-activation` — Toxic Orb badly poisons holder at end of turn
 * - `flame-orb-activation` — Flame Orb burns holder at end of turn
 * - `slow-start-countdown` — Slow Start 5-turn counter decrement
 * - `magnet-rise-countdown` — Magnet Rise levitation duration countdown
 * - `salt-cure` — Salt Cure end-of-turn residual damage (Gen 9)
 */
export type EndOfTurnEffect =
  | "weather-damage"
  | "weather-countdown"
  | "terrain-countdown"
  | "status-damage"
  | "leech-seed"
  | "curse"
  | "bind"
  | "leftovers"
  | "black-sludge"
  | "aqua-ring"
  | "ingrain"
  | "grassy-terrain-heal"
  | "wish"
  | "future-attack"
  | "perish-song"
  | "uproar"
  | "screen-countdown"
  | "tailwind-countdown"
  | "trick-room-countdown"
  | "speed-boost"
  | "moody"
  | "bad-dreams"
  | "nightmare"
  | "harvest"
  | "pickup"
  | "poison-heal"
  | "mystery-berry"
  | "defrost"
  | "safeguard-countdown"
  | "stat-boosting-items"
  | "healing-items"
  | "encore-countdown"
  | "weather-healing"
  | "shed-skin"
  | "toxic-orb-activation"
  | "flame-orb-activation"
  | "slow-start-countdown"
  | "taunt-countdown"
  | "disable-countdown"
  | "gravity-countdown"
  | "magic-room-countdown"
  | "wonder-room-countdown"
  | "yawn-countdown"
  | "heal-block-countdown"
  | "embargo-countdown"
  | "magnet-rise-countdown"
  | "salt-cure";

/**
 * Configuration object passed to the `BattleEngine` constructor.
 * Determines the generation, format, teams, and PRNG seed for the battle.
 */
export interface BattleConfig {
  /** Game generation (1–9); determines which ruleset mechanics apply */
  readonly generation: Generation;
  /** Battle format; BattleEngine currently only supports `"singles"` */
  readonly format: BattleFormat;
  /** Both sides' teams as arrays of `PokemonInstance`; index 0 is player, index 1 is opponent */
  readonly teams: readonly [PokemonInstance[], PokemonInstance[]];
  /** Optional trainer metadata for each side; `null` for wild battles or unnamed opponents */
  readonly trainers?: readonly [TrainerDataRef | null, TrainerDataRef | null];
  /** Seed for the Mulberry32 PRNG — same seed + same actions = deterministic replay */
  readonly seed: number;
  /** `true` if this is a wild Pokémon encounter (enables flee, catch mechanics) */
  readonly isWildBattle?: boolean;
}

/**
 * Describes a single move slot for the active Pokémon, as returned by
 * `BattleEngine.getAvailableMoves()`. Consumers use this to render the move selection UI.
 */
export interface AvailableMove {
  /** Index of this move in the Pokémon's moveset (0–3) */
  readonly index: number;
  /** Move ID string (e.g., `"tackle"`) */
  readonly moveId: string;
  /** Display name for the move (e.g., `"Tackle"`) */
  readonly displayName: string;
  /** Move type (e.g., `"normal"`, `"fire"`) */
  readonly type: PokemonType;
  /** Move category (`"physical"`, `"special"`, or `"status"`) */
  readonly category: MoveCategory;
  /** Current PP remaining for this move slot */
  readonly pp: number;
  /** Maximum PP for this move slot */
  readonly maxPp: number;
  /** `true` if the move cannot be selected this turn (e.g., Disabled, Taunt, Encore) */
  readonly disabled: boolean;
  /** Human-readable reason the move is disabled, if `disabled` is `true` */
  readonly disabledReason?: string;
}

/**
 * Result of a team/Pokémon validation check.
 * Returned by `GenerationRuleset.validatePokemon()`.
 */
export interface ValidationResult {
  /** `true` if the Pokémon is legal and can participate in battle */
  readonly valid: boolean;
  /** Hard errors that make the Pokémon illegal (e.g., impossible move, out-of-range stat) */
  readonly errors: readonly string[];
}

/**
 * Result of applying weather damage to a single Pokémon at end of turn.
 * Returned by `GenerationRuleset.applyWeatherEffects()`.
 */
export interface WeatherEffectResult {
  /** Which side the damaged Pokémon belongs to */
  readonly side: 0 | 1;
  /** Display name of the damaged Pokémon (nickname if present, otherwise a fallback species label) */
  readonly pokemon: string;
  /** HP removed by weather damage (0 if immune) */
  readonly damage: number;
  /** Message to emit (e.g., `"Charizard is buffeted by the sandstorm!"`) */
  readonly message: string;
}

/**
 * Result of applying terrain effects to a single Pokémon at end of turn.
 * Returned by `GenerationRuleset.applyTerrainEffects()` (Gen 6+).
 */
export interface TerrainEffectResult {
  /** Which side the affected Pokémon belongs to */
  readonly side: 0 | 1;
  /** Display name of the affected Pokémon (nickname if present, otherwise a fallback species label) */
  readonly pokemon: string;
  /** Effect identifier (e.g., `"grassy-heal"`, `"electric-immunity"`) */
  readonly effect: string;
  /** Message to emit describing the terrain effect */
  readonly message: string;
  /**
   * HP to restore via terrain healing (e.g., Grassy Terrain 1/16 max HP).
   * 0 or omitted if no healing applies.
   * Source: Showdown sim/field.ts — Grassy Terrain heals 1/16 max HP at residual phase
   */
  readonly healAmount?: number;
}

/**
 * Result of applying entry hazards to a Pokémon switching in.
 * Returned by `GenerationRuleset.applyEntryHazards()`.
 */
export interface EntryHazardResult {
  /** HP removed by hazards (Spikes, Stealth Rock); 0 if immune or no hazards */
  readonly damage: number;
  /** Status inflicted by Toxic Spikes, or `null` */
  readonly statusInflicted: PrimaryStatus | null;
  /** Stat changes from hazards (e.g., Sticky Web −1 Speed) */
  readonly statChanges: ReadonlyArray<{ stat: BattleStat; stages: number }>;
  /** Messages to emit for each hazard effect */
  readonly messages: readonly string[];
  /** Hazard IDs to clear from the side (e.g., Poison-type absorbing Toxic Spikes) */
  readonly hazardsToRemove?: readonly EntryHazardType[];
}

/**
 * Result of applying a bag item (Potion, Antidote, X Attack, etc.) to a Pokemon.
 * Returned by `GenerationRuleset.applyBagItem()`.
 *
 * The engine reads these fields and applies each effect to the battle state,
 * emitting the appropriate BattleEvents. All optional fields mean "no effect of this type".
 */
export interface BagItemResult {
  /** `true` if the item activated and produced an effect */
  readonly activated: boolean;
  /** HP to restore (for healing items and revives) */
  readonly healAmount?: number;
  /** Primary status that was cured */
  readonly statusCured?: PrimaryStatus;
  /** Stat stage change to apply (for X items) */
  readonly statChange?: { readonly stat: BattleStat; readonly stages: number };
  /** `true` if the pokemon was revived from faint */
  readonly revived?: boolean;
  /** Freeform messages to emit as `MessageEvent`s */
  readonly messages: readonly string[];
}

/**
 * Result of a catch attempt roll.
 *
 * Source: pret/pokeemerald src/battle_script_commands.c Cmd_handleballthrow
 * Source: Bulbapedia -- Catch rate (https://bulbapedia.bulbagarden.net/wiki/Catch_rate)
 */
/**
 * Discriminated union ensuring caught/shake count combinations are always valid.
 * A successful catch always has shakes=3; a failed attempt always has shakes 0–2.
 *
 * Source: pret/pokeemerald src/battle_script_commands.c Cmd_handleballthrow
 * Source: Bulbapedia -- Catch rate (https://bulbapedia.bulbagarden.net/wiki/Catch_rate)
 */
export type CatchResult =
  | {
      readonly caught: true;
      /** Always 3 on a successful catch */
      readonly shakes: 3;
    }
  | {
      readonly caught: false;
      /** 0–3 shake checks passed before the Pokemon broke free.
       * In Gen 1, Z >= 70 gives 3 shakes even on a failed catch.
       * Source: pokered ItemUseBall .failedToCapture — Z thresholds 0/1/2/3 shakes.
       */
      readonly shakes: 0 | 1 | 2 | 3;
    };
