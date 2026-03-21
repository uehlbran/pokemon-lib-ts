import type {
  AbilityTrigger,
  BattleStat,
  EntryHazardType,
  Generation,
  MoveCategory,
  MoveData,
  PokemonInstance,
  PokemonSpeciesData,
  PokemonType,
  PrimaryStatus,
  SeededRandom,
  VolatileStatus,
  WeatherType,
} from "@pokemon-lib-ts/core";
import type { BattleEvent } from "../events";
import type {
  ActivePokemon,
  BattleFormat,
  BattleSide,
  BattleState,
  TrainerDataRef,
} from "../state";

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
 * Passed to `GenerationRuleset.executeMoveEffect()` after the damage step.
 */
export interface MoveEffectContext {
  /** The Pokémon that used the move */
  readonly attacker: ActivePokemon;
  /** The Pokémon that was targeted */
  readonly defender: ActivePokemon;
  /** The move that was used */
  readonly move: MoveData;
  /** Damage dealt this hit (0 for status moves) */
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
}

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
  /** Stat stage changes to apply; empty array means no stat changes */
  readonly statChanges: ReadonlyArray<{
    target: "attacker" | "defender";
    stat: BattleStat;
    stages: number;
  }>;
  /** Recoil damage to deal to the attacker (0 = no recoil) */
  readonly recoilDamage: number;
  /** HP to restore to the attacker (0 = no healing) */
  readonly healAmount: number;
  /** `true` if the attacker should be forced to switch out after this move */
  readonly switchOut: boolean;
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
  readonly screenSet?: { screen: string; turnsLeft: number; side: "attacker" | "defender" } | null;
  /** Wave 1: Attacker faints after using the move (Explosion, Self-Destruct) */
  readonly selfFaint?: boolean;
  /** Wave 1: Skip recharge next turn (e.g., Hyper Beam KO'd the target) */
  readonly noRecharge?: boolean;
  /** Wave 1: Custom damage to apply to a target (for OHKO, fixed-damage, Counter) */
  readonly customDamage?: {
    target: "attacker" | "defender";
    amount: number;
    source: string;
    /** The type of the move dealing this damage, for lastDamageType tracking */
    type?: PokemonType | null;
  } | null;
  /** Cure the target's status AND reset their stat stages (e.g., Haze cures defender's status) */
  readonly statusCured?: { target: "attacker" | "defender" | "both" } | null;
  /** Wave 2/3: Data for volatile status infliction (turnsLeft, etc.) */
  readonly volatileData?: { turnsLeft: number; data?: Record<string, unknown> } | null;
  readonly weatherSet?: { weather: WeatherType; turns: number; source: string } | null;
  readonly hazardSet?: { hazard: EntryHazardType; targetSide: 0 | 1 } | null;
  readonly volatilesToClear?: ReadonlyArray<{
    target: "attacker" | "defender";
    volatile: VolatileStatus;
  }>;
  readonly clearSideHazards?: "attacker" | "defender";
  readonly itemTransfer?: { from: "attacker" | "defender"; to: "attacker" | "defender" };
  /** Gen 1: Clear screens from the specified side(s) (Haze or setter switching out) */
  readonly screensCleared?: "attacker" | "defender" | "both" | null;
  /** Reset stat stages for target(s) WITHOUT curing status (e.g. Haze resets attacker stages) */
  readonly statStagesReset?: { target: "attacker" | "defender" | "both" } | null;
  /** Cure the attacker's status WITHOUT resetting stat stages (unlike statusCured which is Haze-only) */
  readonly statusCuredOnly?: { target: "attacker" | "defender" | "both" } | null;
  /** Primary status to inflict on the ATTACKER (e.g., Rest's self-sleep) */
  readonly selfStatusInflicted?: PrimaryStatus | null;
  /** Volatile status to inflict on the ATTACKER */
  readonly selfVolatileInflicted?: VolatileStatus | null;
  /** Data for selfVolatileInflicted (turnsLeft, etc.) */
  readonly selfVolatileData?: { turnsLeft: number; data?: Record<string, unknown> } | null;
  /** Change the types of the attacker or defender */
  readonly typeChange?: { target: "attacker" | "defender"; types: readonly PokemonType[] } | null;
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
  readonly tailwindSet?: { turnsLeft: number; side: "attacker" | "defender" } | null;
  /** Set Trick Room on the field (Gen 4+) */
  readonly trickRoomSet?: { turnsLeft: number } | null;
  /** Schedule a Future Sight / Doom Desire attack on the target side (Gen 2+) */
  readonly futureAttack?: { moveId: string; turnsLeft: number; sourceSide: 0 | 1 } | null;
  /** Activate Gravity field effect (Gen 4+) */
  readonly gravitySet?: boolean;
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
}

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
  /** The lifecycle event that caused this ability to fire (e.g., `"on-switch-in"`, `"on-damage"`) */
  readonly trigger: AbilityTrigger;
  /** The move involved in the trigger, if applicable */
  readonly move?: MoveData;
  /** Damage dealt this turn, if the trigger is damage-related */
  readonly damage?: number;
}

/**
 * Result of an ability trigger.
 * Returned by `GenerationRuleset.applyAbility()`.
 */
/** Discriminated union of ability effect categories. */
export type AbilityEffectType =
  | "stat-change"
  | "status-cure"
  | "status-inflict"
  | "damage-reduction"
  | "type-change"
  | "weather-immunity"
  | "weather-set"
  | "ability-change"
  | "heal"
  | "chip-damage"
  | "volatile-inflict"
  | "move-prevented"
  | "none";

/** A single effect produced by an ability trigger — proper discriminated union on effectType. */
export type AbilityEffect =
  | {
      readonly effectType: "stat-change";
      readonly target: "self" | "opponent";
      readonly stat:
        | "attack"
        | "defense"
        | "spAttack"
        | "spDefense"
        | "speed"
        | "accuracy"
        | "evasion";
      readonly stages: number;
    }
  | {
      readonly effectType: "weather-set";
      readonly target: "field";
      readonly weather: import("@pokemon-lib-ts/core").WeatherType;
      readonly weatherTurns: number;
    }
  | { readonly effectType: "damage-reduction"; readonly target: "self" | "opponent" }
  | {
      readonly effectType: "type-change";
      readonly target: "self" | "opponent";
      readonly types: readonly import("@pokemon-lib-ts/core").PokemonType[];
    }
  | { readonly effectType: "weather-immunity"; readonly target: "self" | "opponent" }
  | { readonly effectType: "status-cure"; readonly target: "self" | "opponent" }
  | {
      readonly effectType: "ability-change";
      readonly target: "self" | "opponent";
      readonly newAbility: string;
    }
  | { readonly effectType: "heal"; readonly target: "self" | "opponent"; readonly value: number }
  | {
      readonly effectType: "chip-damage";
      readonly target: "self" | "opponent";
      readonly value: number;
    }
  | {
      readonly effectType: "status-inflict";
      readonly target: "self" | "opponent";
      readonly status: PrimaryStatus;
    }
  | {
      readonly effectType: "volatile-inflict";
      readonly target: "self" | "opponent";
      readonly volatile: VolatileStatus;
      readonly data?: Record<string, unknown>;
    }
  | { readonly effectType: "move-prevented"; readonly target: "self" }
  | { readonly effectType: "none"; readonly target: "self" | "opponent" | "field" };

export interface AbilityResult {
  /** `true` if the ability actually activated and produced effects */
  readonly activated: boolean;
  /** Ordered list of effects the engine should apply to the battle state */
  readonly effects: readonly AbilityEffect[];
  /** Freeform messages to emit as `MessageEvent`s */
  readonly messages: readonly string[];
  /** Set to `true` when an ability blocks the move entirely (e.g., Truant skips a turn) */
  readonly movePrevented?: boolean;
}

/**
 * All inputs required when triggering a held item.
 * Passed to `GenerationRuleset.applyItem()`.
 */
export interface ItemContext {
  /** The Pokémon holding the item */
  readonly pokemon: ActivePokemon;
  /** Current full battle state */
  readonly state: BattleState;
  /** PRNG instance for any item rolls */
  readonly rng: SeededRandom;
  /** The move involved in the trigger, if applicable */
  readonly move?: MoveData;
  /** Damage dealt this turn, if the trigger is damage-related */
  readonly damage?: number;
}

/** Discriminated union of item effect categories. */
export type ItemEffectType =
  | "stat-boost"
  | "heal"
  | "damage-boost"
  | "status-prevention"
  | "speed-boost"
  | "status-cure"
  | "consume"
  | "survive"
  | "flinch"
  | "volatile-cure"
  | "status-inflict"
  | "self-damage"
  | "none";

/** A single effect produced by an item trigger. */
export interface ItemEffect {
  /** Effect category — discriminant for the switch in processItemResult */
  readonly type: ItemEffectType;
  /** Payload for effects that carry numeric or string data (e.g., heal amount, volatile name) */
  readonly value?: number | string;
  /** Which entity the effect applies to (informational — engine derives target from context) */
  readonly target?: "self" | "opponent" | "field";
}

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
  | "yawn-countdown"
  | "heal-block-countdown"
  | "embargo-countdown"
  | "magnet-rise-countdown";

/**
 * Configuration object passed to the `BattleEngine` constructor.
 * Determines the generation, format, teams, and PRNG seed for the battle.
 */
export interface BattleConfig {
  /** Game generation (1–9); determines which ruleset mechanics apply */
  readonly generation: Generation;
  /** Battle format (`"singles"`, `"doubles"`, `"triples"`, or `"rotation"`) */
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
  /** Unique identifier of the damaged Pokémon */
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
  /** Unique identifier of the affected Pokémon */
  readonly pokemon: string;
  /** Effect identifier (e.g., `"grassy-heal"`, `"electric-immunity"`) */
  readonly effect: string;
  /** Message to emit describing the terrain effect */
  readonly message: string;
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
      /** 0–2 shake checks passed before the Pokemon broke free */
      readonly shakes: 0 | 1 | 2;
    };
