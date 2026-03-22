import type {
  BattleStat,
  EntryHazardType,
  MoveCategory,
  PokemonInstance,
  PokemonSpeciesData,
  PokemonType,
  ScreenType,
  VolatileStatus,
} from "@pokemon-lib-ts/core";

/**
 * Represents one side of a battle (player or opponent). Contains all per-side
 * mutable state: the team, active slots, field conditions, and hazards.
 * Two `BattleSide` instances live in `BattleState.sides`.
 */
export interface BattleSide {
  /** Side index (0 = player/side-A, 1 = opponent/side-B); immutable */
  readonly index: 0 | 1;
  /** Trainer info for display purposes, or `null` for wild battles */
  readonly trainer: TrainerDataRef | null;
  /** Full team of Pokémon instances (includes fainted members) */
  team: PokemonInstance[];
  /**
   * Currently active Pokémon slots. Length equals the number of active slots
   * for the format (1 for singles, 2 for doubles, etc.). `null` means the slot
   * is empty (all Pokémon fainted or not yet sent out).
   */
  active: (ActivePokemon | null)[];
  /** Entry hazards currently on this side's field */
  hazards: EntryHazardState[];
  /** Active protective screens (Reflect, Light Screen) on this side */
  screens: ScreenState[];
  /** Tailwind status; doubles the Speed of this side's Pokémon while active (Gen 4+) */
  tailwind: { active: boolean; turnsLeft: number };
  /** Lucky Chant status; prevents critical hits against this side while active (Gen 4) */
  luckyChant: { active: boolean; turnsLeft: number };
  /** Pending Wish healing; activates at the end of the next turn if set (Gen 3+) */
  wish: { active: boolean; turnsLeft: number; healAmount: number } | null;
  /** Pending Future Sight / Doom Desire attack targeting this side (Gen 2+) */
  futureAttack: FutureAttackState | null;
  /** Number of Pokémon on this side that have fainted so far this battle */
  faintCount: number;
  /** `true` if this side has already used its once-per-battle gimmick (mega/Z/dynamax/tera) */
  gimmickUsed: boolean;
}

/**
 * Minimal reference to a trainer for display and battle attribution.
 * Stored in `BattleSide.trainer`.
 */
export interface TrainerDataRef {
  /** Unique trainer identifier */
  readonly id: string;
  /** Name shown in the battle UI (e.g., `"Ash"`, `"Gym Leader Brock"`) */
  readonly displayName: string;
  /** Trainer class (e.g., `"Pokémon Trainer"`, `"Gym Leader"`, `"Rival"`) */
  readonly trainerClass: string;
}

/**
 * Represents a Pokémon currently on the field. Wraps a `PokemonInstance` with
 * volatile (in-battle-only) state that is reset on switch-out.
 *
 * **Persistent fields** (survive switch-out): `pokemon` (the underlying instance,
 * including HP, status, and PP), `teamSlot`.
 *
 * **Volatile fields** (reset on switch-out): everything else — stat stages,
 * volatile statuses, types (for Transform), ability (for Skill Swap), etc.
 */
export interface ActivePokemon {
  /** The underlying Pokémon instance (HP, status, moves, EVs/IVs, etc.) */
  pokemon: PokemonInstance;
  /** Index of this Pokémon in the side's `team` array (0-based) */
  teamSlot: number;
  /** Current stat stage modifiers (−6 to +6 per stat; reset on switch-out) */
  statStages: Record<BattleStat, number>;
  /** Active volatile statuses and their associated state data */
  volatileStatuses: Map<VolatileStatus, VolatileStatusState>;
  /** Current type(s); may differ from base species due to Transform or type-changing moves */
  types: PokemonType[];
  /** Current ability ID; may differ from base species due to Skill Swap / Trace / Imposter */
  ability: string;
  /** Original ability saved when suppressed by Gastro Acid; `null` when not suppressed */
  suppressedAbility: string | null;
  /** ID of the last move this Pokémon successfully used (for Encore, Disable, etc.) */
  lastMoveUsed: string | null;
  /** HP removed by the last hit this Pokémon received (for Counter / Mirror Coat) */
  lastDamageTaken: number;
  /** Type of the move that dealt the last damage (for Counter / Mirror Coat targeting) */
  lastDamageType: PokemonType | null;
  /** Category of the move that dealt the last damage (for Counter / Mirror Coat) */
  lastDamageCategory: MoveCategory | null;
  /** Number of turns this Pokémon has been on the field without switching (for Toxic, etc.) */
  turnsOnField: number;
  /** `true` if this Pokémon has already moved this turn (for after-turn effects) */
  movedThisTurn: boolean;
  /** Number of consecutive turns Protect/Detect was used (for success rate scaling) */
  consecutiveProtects: number;
  /** HP of the active Substitute; 0 means no Substitute is present */
  substituteHp: number;
  /** `true` if Knock Off removed this Pokémon's item; prevents re-giving items via Trick/Switcheroo */
  itemKnockedOff: boolean;
  /** `true` if this Pokémon has used Transform and currently resembles another Pokémon */
  transformed: boolean;
  /** Species data for the transformed form, or `null` if not transformed */
  transformedSpecies: PokemonSpeciesData | null;
  /** `true` if this Pokémon has mega evolved this battle (Gen 6+) */
  isMega: boolean;
  /** `true` if this Pokémon is currently dynamaxed (Gen 8) */
  isDynamaxed: boolean;
  /** Turns of Dynamax remaining (0 when not dynamaxed; Gen 8) */
  dynamaxTurnsLeft: number;
  /** `true` if this Pokémon has terastallized this battle (Gen 9) */
  isTerastallized: boolean;
  /** Active Tera Type after terastallization, or `null` if not terastallized (Gen 9) */
  teraType: PokemonType | null;
  /**
   * Types that have already received the one-time Stellar Tera boost for this Pokemon.
   * Stellar Tera Type gives 2x STAB boost the first time each type is used; subsequent
   * uses of that type revert to standard STAB. Tracked per Pokemon, persists while Tera
   * is active (Gen 9).
   */
  stellarBoostedTypes: PokemonType[];
  /**
   * Forced move for the next turn (two-turn moves like Fly, Dig, SolarBeam).
   * When set, the engine overrides the submitted action with this move on the next turn.
   * Cleared after the forced move executes.
   */
  forcedMove: { moveIndex: number; moveId: string } | null;
}

/**
 * Tracks the duration and metadata for a single volatile status on an `ActivePokemon`.
 * Stored in `ActivePokemon.volatileStatuses`.
 */
export interface VolatileStatusState {
  /** Turns remaining; −1 means the status has no set expiry */
  turnsLeft: number;
  /** Identifier of whatever caused this volatile status (move ID, ability ID, etc.) */
  source?: string;
  /** Arbitrary extra data for complex volatiles (e.g., confusion damage threshold) */
  data?: Record<string, unknown>;
}

/**
 * Tracks entry hazard layers on a `BattleSide`. Stored in `BattleSide.hazards`.
 */
export interface EntryHazardState {
  /** The hazard type (e.g., `"spikes"`, `"stealth-rock"`, `"toxic-spikes"`) */
  type: EntryHazardType;
  /** Number of layers present (Spikes: 1–3, Toxic Spikes: 1–2, others: always 1) */
  layers: number;
}

/**
 * Tracks an active protective screen on a `BattleSide`. Stored in `BattleSide.screens`.
 */
export interface ScreenState {
  /** The screen type (`"reflect"` or `"light-screen"`) */
  type: ScreenType;
  /** Turns remaining before the screen expires */
  turnsLeft: number;
}

/**
 * Tracks a pending Future Sight or Doom Desire attack targeting a `BattleSide`.
 * The stored damage is dealt when `turnsLeft` reaches 0.
 */
export interface FutureAttackState {
  /** Move ID of the delayed attack (e.g., `"future-sight"`, `"doom-desire"`) */
  moveId: string;
  /** Turns until the attack triggers (counts down from 2 to 0) */
  turnsLeft: number;
  /** Pre-calculated damage to deal when the attack triggers */
  damage: number;
  /**
   * Side index that used the move (0 or 1).
   * At hit time, damage is recalculated against whoever is currently active on this side —
   * not necessarily the original user. This is Gen 4 cartridge-accurate behavior: if the
   * original user switched out, the current active Pokemon's SpAtk is used for the calc.
   * Do NOT replace with a `sourcePokemonUid` — the current-active lookup is intentional.
   */
  sourceSide: 0 | 1;
}
