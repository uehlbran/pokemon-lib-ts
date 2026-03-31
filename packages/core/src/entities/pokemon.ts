import type { Gender } from "./gender";
import type { MoveData, MoveSlot } from "./move";
import type { NatureId } from "./nature";
import type { MutableStatBlock, StatBlock } from "./stats";
import type { PrimaryStatus } from "./status";
import type { PokemonType } from "./types";

export type AbilitySlot = "normal1" | "normal2" | "hidden";

export interface PokemonInstance {
  /** Unique identifier for this individual */
  readonly uid: string;

  /** Species ID (references PokemonSpeciesData.id) */
  readonly speciesId: number;

  /** Nickname (null = use species display name) */
  nickname: string | null;

  /** Current level (1-100) */
  level: number;

  /** Current total experience points */
  experience: number;

  /** Nature */
  readonly nature: NatureId;

  /** Individual Values (0-31 per stat, determined at creation) */
  readonly ivs: StatBlock;

  /** Effort Values (0-252 per stat, 510 total cap) */
  evs: MutableStatBlock;

  /** Current HP (0 to max) */
  currentHp: number;

  /** Learned moves (1-4 slots) */
  moves: MoveSlot[];

  /** Active ability ID */
  ability: string;

  /** Which ability slot this is from */
  readonly abilitySlot: AbilitySlot;

  /** Held item ID (null = no item) */
  heldItem: string | null;

  /**
   * Most recently consumed held item.
   * Persists through switches so mechanics like Recycle can restore it later.
   * Cleared when the stored item is successfully restored.
   * Source: Showdown sim/pokemon.ts -- pokemon.lastItem
   */
  lastItem?: string | null;

  /**
   * Whether this Pokemon has eaten a Berry at any point this battle.
   * Persists through switches and remains true for the rest of the battle.
   * Used by Belch's move-availability gate.
   * Source: Showdown sim/pokemon.ts -- pokemon.ateBerry
   */
  ateBerry?: boolean;

  /** Primary status condition (null = healthy) */
  status: PrimaryStatus | null;

  /** Friendship / happiness (0-255) */
  friendship: number;

  /** Gender */
  readonly gender: Gender;

  /** Whether this individual is shiny */
  readonly isShiny: boolean;

  /** Where this Pokemon was caught/received */
  readonly metLocation: string;

  /** Level when caught/received */
  readonly metLevel: number;

  /** OT name */
  readonly originalTrainer: string;

  /** OT ID number */
  readonly originalTrainerId: number;

  /** Ball this Pokemon was caught in */
  readonly pokeball: string;

  /**
   * Whether this Pokemon was obtained via trade (not from the current player's OT).
   * When true, applies a 1.5x EXP bonus (Gen 3+: 1.7x for international trades).
   * Source: pret/pokeplatinum src/battle/battle_script.c lines 9980-9988
   */
  readonly isTradedPokemon?: boolean;

  /**
   * Whether the trade was international (different-language cartridge).
   * Only meaningful when `isTradedPokemon` is true.
   * Gen 1-2: always false (no language metadata on cartridge).
   * Source: pret/pokeplatinum src/battle/battle_script.c lines 9980-9988
   */
  readonly isInternationalTrade?: boolean;

  // --- Cached computed values (not serialized) ---

  /** Computed stats — recalculated when level/EVs/nature change */
  calculatedStats?: StatBlock;

  // --- Generation-specific metadata and persisted battle state ---
  //
  // This is the deliberate exception to core's generation-agnostic interface rule.
  // These fields are stored here only when they are properties of the individual
  // Pokemon or battle state that must survive switching (for example team-sheet
  // metadata like Tera Type / Dynamax Level, or once-per-battle activation state).
  // The mechanics that interpret these fields still live in the generation packages.

  /** Tera Type assigned to this Pokemon for Gen 9 battles. */
  teraType?: PokemonType;

  /** Dynamax Level assigned to this Pokemon for Gen 8 battles (0-10). */
  dynamaxLevel?: number;

  /**
   * Mega form types after Mega Evolution, persisted so createOnFieldPokemon can restore
   * the correct types when a mega-evolved Pokemon is switched back in.
   * Set by Gen6MegaEvolution.activate(). Absent on non-mega Pokemon.
   * Source: Gen 6 game mechanic — Mega Evolution persists for the entire battle.
   */
  megaTypes?: PokemonType[];

  /**
   * Mega form ability after Mega Evolution, persisted so createOnFieldPokemon can restore
   * the correct ability when a mega-evolved Pokemon is switched back in.
   * Set by Gen6MegaEvolution.activate(). Absent on non-mega Pokemon.
   * Source: Gen 6 game mechanic — Mega Evolution persists for the entire battle.
   */
  megaAbility?: string;

  /**
   * Ultra Burst form types after Ultra Burst, persisted so createOnFieldPokemon can
   * restore the correct types when Ultra Necrozma is switched back in.
   * Set by Gen7UltraBurst.activate(). Absent on non-Ultra-Burst Pokemon.
   * Source: Gen 7 USUM — Ultra Burst persists for the entire battle.
   */
  ultraBurstTypes?: PokemonType[];

  /**
   * Ultra Burst form ability after Ultra Burst, persisted so createOnFieldPokemon can
   * restore the correct ability when Ultra Necrozma is switched back in.
   * Set by Gen7UltraBurst.activate(). Absent on non-Ultra-Burst Pokemon.
   * Source: Gen 7 USUM — Ultra Burst persists for the entire battle.
   */
  ultraBurstAbility?: string;

  /**
   * Whether this Pokemon has Terastallized during this battle. Persisted so
   * createOnFieldPokemon can restore isTerastallized/teraType when a Tera'd Pokemon
   * is switched back in. Set by Gen9Terastallization.activate().
   * Source: Gen 9 game mechanic — Terastallization persists for the entire battle.
   */
  terastallized?: boolean;

  /**
   * Defensive types after Terastallization, persisted so createOnFieldPokemon can
   * restore the correct defensive typing when a Tera'd Pokemon is switched back in.
   * For non-Stellar Tera: single-element array of the Tera type.
   * For Stellar Tera: original types (Stellar retains original defensive types).
   * Set by Gen9Terastallization.activate(). Absent on non-Tera'd Pokemon.
   * Source: Gen 9 game mechanic — Terastallization persists for the entire battle.
   */
  teraTypes?: PokemonType[];

  /**
   * Original pre-Terastallization types, stored for cross-type STAB calculation.
   * Unlike teraTypes (which holds resolved defensive types), this always holds the
   * pre-Tera species types regardless of Tera variant.
   * Set by Gen9Terastallization.activate(). Absent on non-Tera'd Pokemon.
   * Source: Showdown sim/battle-actions.ts — teraTypes stores original species types
   */
  teraOriginalTypes?: PokemonType[];

  /**
   * Types that have already received the one-time Stellar Tera boost.
   * Persisted on PokemonInstance so it survives switches.
   * Source: Showdown sim/battle-actions.ts:1770-1785 — stellarBoostedTypes tracking
   */
  stellarBoostedTypes?: PokemonType[];

  /**
   * Whether Intrepid Sword has already activated once this battle.
   * Persisted on PokemonInstance so it survives switches (once-per-battle, not once-per-switchin).
   * Source: Showdown data/abilities.ts -- intrepidsword: onStart: if (pokemon.swordBoost) return; pokemon.swordBoost = true;
   */
  swordBoost?: boolean;

  /**
   * Whether Dauntless Shield has already activated once this battle.
   * Persisted on PokemonInstance so it survives switches (once-per-battle, not once-per-switchin).
   * Source: Showdown data/abilities.ts -- dauntlessshield: onStart: if (pokemon.shieldBoost) return; pokemon.shieldBoost = true;
   */
  shieldBoost?: boolean;

  /**
   * Number of times this Pokemon has been hit by a move (used by Rage Fist, Gen 9).
   * Persists through switches — stored on PokemonInstance, not volatile status.
   * Incremented each time the Pokemon takes damage from a move (multi-hit counts once).
   * Source: Showdown data/moves.ts:15127 — Math.min(350, 50 + 50 * pokemon.timesAttacked)
   */
  timesAttacked?: number;

  /**
   * Maps move IDs to the turn number on which they last incremented `timesAttacked`.
   * Used to deduplicate multi-hit moves: if the same move hits multiple times on the
   * same turn, `timesAttacked` should only increment once.
   * Persists through switches alongside `timesAttacked`.
   * Source: Showdown sim/pokemon.ts — timesAttacked incremented once per move use, not per hit.
   */
  rageFistLastHitTurns?: Record<string, number>;
}

/** Options for creating a new PokemonInstance */
export interface PokemonCreationOptions {
  nickname: string | null;
  nature: NatureId;
  ivs: StatBlock;
  evs: MutableStatBlock;
  abilitySlot: AbilitySlot;
  gender: Gender;
  isShiny: boolean;
  /**
   * Explicit moves for the created Pokemon.
   * - `string`: move id, resolved through canonical move metadata
   * - `MoveSlot`: fully specified slot, used as-is
   * - `{ id, pp }`: canonical move metadata seed
   *
   * If empty, uses latest level-up moves.
   */
  moves: Array<string | MoveSlot | Pick<MoveData, "id" | "pp">>;
  /**
   * Optional explicit PP resolver for string move ids when the species did not
   * come from a DataManager-backed canonical data bundle.
   */
  movePpResolver: (moveId: string) => number;
  heldItem: string | null;
  friendship: number;
  metLocation: string;
  originalTrainer: string;
  originalTrainerId: number;
  pokeball: string;
  /** Optional Gen 9 team-sheet metadata. Earlier generations ignore this. */
  teraType?: PokemonType;

  /** Optional Gen 8 team-sheet metadata. Earlier generations ignore this. */
  dynamaxLevel?: number;
}
