import type { EntryHazardType, ScreenType } from "./field";
import type { BattleStat } from "./stats";
import type { PrimaryStatus, VolatileStatus } from "./status";
import type { Generation, PokemonType } from "./types";
import type { TerrainType, WeatherType } from "./weather";

export type MoveCategory = "physical" | "special" | "status";

/**
 * Move targeting categories.
 * In singles, most of these resolve to the same thing (the opponent),
 * but they matter for doubles/triples.
 */
export type MoveTarget =
  | "adjacent-foe" // Single adjacent opponent
  | "all-adjacent-foes" // Both opponents in doubles
  | "adjacent-ally" // Single adjacent ally (doubles)
  | "self" // User only
  | "all-adjacent" // All adjacent (foes + allies)
  | "user-and-allies" // User + allies
  | "all-foes" // All opponents
  | "entire-field" // Affects whole field
  | "user-field" // User's side (screens, hazards)
  | "foe-field" // Opponent's side (hazards)
  | "random-foe" // Random opponent
  | "any"; // Any single target (used in doubles)

export interface MoveData {
  /** Lowercase identifier (e.g., "flamethrower") */
  readonly id: string;

  /** Display name (e.g., "Flamethrower") */
  readonly displayName: string;

  /** Move type */
  readonly type: PokemonType;

  /** Physical, Special, or Status */
  readonly category: MoveCategory;

  /** Base power (null for status moves and variable-power moves) */
  readonly power: number | null;

  /** Accuracy percentage (null = never misses) */
  readonly accuracy: number | null;

  /** Base Power Points */
  readonly pp: number;

  /** Priority bracket (-7 to +5) */
  readonly priority: number;

  /** Targeting category */
  readonly target: MoveTarget;

  /** Move flags (contact, sound, etc.) */
  readonly flags: MoveFlags;

  /** Effect data (null for pure damage moves) */
  readonly effect: MoveEffect | null;

  /** Flavor text description */
  readonly description: string;

  /** Generation this move was introduced */
  readonly generation: Generation;

  // --- Generation-specific fields ---

  /** Z-Move base power (Gen 7) */
  readonly zMovePower?: number;

  /** Z-Move effect for status moves (Gen 7) */
  readonly zMoveEffect?: string;

  /** Max Move base power (Gen 8) */
  readonly maxMovePower?: number;

  /**
   * Critical hit ratio stage bonus for high-crit-ratio moves.
   * 0 or undefined = normal crit rate (no bonus).
   * 1 = +1 stage (Slash, Crabhammer, Razor Leaf, etc.).
   * 2 = +2 stages (10,000,000 Volt Thunderbolt; always crits at stage 3+).
   * Source: Showdown sim/battle-actions.ts getMoveHit crit stage calculation
   */
  readonly critRatio?: number;

  /**
   * Category override history — some moves changed category across gens.
   * In Gen 1-3, category was determined by TYPE (all Fire moves were Special).
   * In Gen 4+, each move has its own category.
   * The main `category` field reflects the Gen 4+ value.
   * Gen plugins use this field to look up the correct category for their gen.
   */
  readonly categoryByGen?: Partial<Record<Generation, MoveCategory>>;

  /**
   * True for moves that deal crash damage to the user on miss/failure.
   * Crash damage moves are boosted by Reckless (same as recoil moves).
   *
   * Gen 5 crash damage moves: Jump Kick, High Jump Kick.
   * Source: Showdown sim/dex-moves.ts — `hasCrashDamage?: boolean`
   * Source: Showdown data/abilities.ts — Reckless: `if (move.recoil || move.hasCrashDamage)`
   */
  readonly hasCrashDamage?: boolean;
}

export interface MoveFlags {
  readonly contact: boolean; // Makes contact (Rough Skin, Flame Body, etc.)
  readonly sound: boolean; // Sound-based (bypasses Substitute, Soundproof blocks)
  readonly bullet: boolean; // Bullet/ball move (Bulletproof blocks)
  readonly pulse: boolean; // Pulse move (Mega Launcher boosts 50%)
  readonly punch: boolean; // Punching move (Iron Fist boosts 20%)
  readonly bite: boolean; // Biting move (Strong Jaw boosts 50%)
  readonly wind: boolean; // Wind move (Wind Rider, Wind Power trigger)
  readonly slicing: boolean; // Slicing move (Sharpness boosts 50%, Gen 9)
  readonly powder: boolean; // Powder/spore move (Grass types immune Gen 6+)
  readonly protect: boolean; // Blocked by Protect/Detect/Baneful Bunker/etc.
  readonly mirror: boolean; // Reflected by Mirror Move / Magic Bounce
  readonly snatch: boolean; // Stolen by Snatch
  readonly gravity: boolean; // Disabled by Gravity (Fly, Bounce, etc.)
  readonly defrost: boolean; // Thaws user if frozen (Scald, Flame Wheel, etc.)
  readonly recharge: boolean; // Requires recharge next turn (Hyper Beam)
  readonly charge: boolean; // Two-turn move (Solar Beam, Fly, Dig)
  readonly bypassSubstitute: boolean; // Hits through Substitute (sound moves, etc.)
}

/**
 * Discriminated union of all possible move effect types.
 * The `type` field enables exhaustive switch statements.
 */
export type MoveEffect =
  | DamageEffect
  | StatusChanceEffect
  | StatusGuaranteedEffect
  | StatChangeEffect
  | VolatileStatusEffect
  | HealEffect
  | RecoilEffect
  | DrainEffect
  | WeatherEffect
  | TerrainEffect
  | EntryHazardEffect
  | RemoveHazardsEffect
  | ScreenEffect
  | OhkoEffect
  | FixedDamageEffect
  | LevelDamageEffect
  | MultiHitEffect
  | TwoTurnEffect
  | SwitchOutEffect
  | ProtectEffect
  | MultiEffect
  | CustomEffect;

export interface DamageEffect {
  readonly type: "damage";
}

export interface StatusChanceEffect {
  readonly type: "status-chance";
  readonly status: PrimaryStatus;
  readonly chance: number; // 0-100
}

export interface StatusGuaranteedEffect {
  readonly type: "status-guaranteed";
  readonly status: PrimaryStatus;
}

export interface StatChangeEffect {
  readonly type: "stat-change";
  readonly changes: readonly StatChange[];
  readonly target: "self" | "foe" | "ally";
  readonly chance: number; // 0-100 (100 = guaranteed)
  /**
   * True when this effect originates from Showdown's `secondary.self.boosts` field.
   * Sheer Force uses this to distinguish eligible self-stat-changes (Flame Charge Speed boost)
   * from primary self-effects (Close Combat, Draco Meteor) that Sheer Force ignores.
   * Source: Showdown data/abilities.ts -- sheerforce deletes move.secondaries AND move.self
   *   only when secondaries exist (i.e., only secondary.self effects are "eligible")
   */
  readonly fromSecondary?: boolean;
}

export interface VolatileStatusEffect {
  readonly type: "volatile-status";
  readonly status: VolatileStatus;
  readonly chance: number;
}

export interface HealEffect {
  readonly type: "heal";
  readonly amount: number; // Fraction of max HP (0.5 = 50%)
}

export interface RecoilEffect {
  readonly type: "recoil";
  readonly amount: number; // Fraction of damage dealt
}

export interface DrainEffect {
  readonly type: "drain";
  readonly amount: number; // Fraction of damage dealt that heals user
}

export interface WeatherEffect {
  readonly type: "weather";
  readonly weather: WeatherType;
  readonly turns: number; // 5 default, 8 with weather rock
}

export interface TerrainEffect {
  readonly type: "terrain";
  readonly terrain: TerrainType;
  readonly turns: number;
}

export interface EntryHazardEffect {
  readonly type: "entry-hazard";
  readonly hazard: EntryHazardType;
}

export interface RemoveHazardsEffect {
  readonly type: "remove-hazards";
  readonly method: "spin" | "defog"; // Defog also removes screens
}

export interface ScreenEffect {
  readonly type: "screen";
  readonly screen: ScreenType;
  readonly turns: number;
}

export interface OhkoEffect {
  readonly type: "ohko";
}

export interface FixedDamageEffect {
  readonly type: "fixed-damage";
  readonly damage: number; // e.g., Dragon Rage = 40, Sonic Boom = 20
}

export interface LevelDamageEffect {
  readonly type: "level-damage"; // Damage = user's level (Night Shade, Seismic Toss)
}

export interface MultiHitEffect {
  readonly type: "multi-hit";
  readonly min: number;
  readonly max: number; // Usually 2-5
}

export interface TwoTurnEffect {
  readonly type: "two-turn";
  readonly firstTurn:
    | "charge"
    | "fly"
    | "dig"
    | "dive"
    | "bounce"
    | "phantom-force"
    | "shadow-force"
    | "solar-beam"
    | "meteor-beam"
    | "electro-shot";
}

export interface SwitchOutEffect {
  readonly type: "switch-out";
  readonly target: "self" | "foe"; // U-turn = self, Dragon Tail = foe
}

export interface ProtectEffect {
  readonly type: "protect";
  readonly variant:
    | "standard"
    | "baneful-bunker"
    | "spiky-shield"
    | "kings-shield"
    | "silk-trap"
    | "burning-bulwark"
    | "max-guard"; // Gen 8: Max Guard — blocks all moves including other Max Moves
}

/**
 * Moves with multiple effects (e.g., Scald: damage + 30% burn).
 * The effects list is applied in order.
 */
export interface MultiEffect {
  readonly type: "multi";
  readonly effects: readonly MoveEffect[];
}

/**
 * Complex moves that need custom handler logic.
 * The handler string maps to a registered function in the battle engine.
 */
export interface CustomEffect {
  readonly type: "custom";
  readonly handler: string; // e.g., "metronome", "mirror-move", "transform"
}

export interface StatChange {
  readonly stat: BattleStat;
  readonly stages: number; // Positive = raise, negative = lower
}

export interface MoveSlot {
  /** Move ID (references MoveData.id) */
  readonly moveId: string;

  /** Current PP remaining */
  currentPP: number;

  /** Maximum PP (base PP * (1 + 0.2 * ppUps)) */
  maxPP: number;

  /** PP Ups applied (0-3) */
  ppUps: number;
}
