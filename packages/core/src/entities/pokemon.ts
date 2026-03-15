import type { Gender } from "./gender";
import type { MoveSlot } from "./move";
import type { NatureId } from "./nature";
import type { MutableStatBlock, StatBlock } from "./stats";
import type { PrimaryStatus } from "./status";
import type { PokemonType } from "./types";

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
  readonly abilitySlot: "normal1" | "normal2" | "hidden";

  /** Held item ID (null = no item) */
  heldItem: string | null;

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

  // --- Cached computed values (not serialized) ---

  /** Computed stats — recalculated when level/EVs/nature change */
  calculatedStats?: StatBlock;

  // --- Generation-specific fields ---

  /** Tera Type for Gen 9 battles */
  teraType?: PokemonType;

  /** Dynamax Level for Gen 8 battles (0-10) */
  dynamaxLevel?: number;
}

/** Options for creating a new PokemonInstance */
export interface PokemonCreationOptions {
  nickname: string | null;
  nature: NatureId;
  ivs: StatBlock;
  evs: MutableStatBlock;
  abilitySlot: "normal1" | "normal2" | "hidden";
  gender: Gender;
  isShiny: boolean;
  moves: string[]; // Move IDs — if empty, uses latest level-up moves
  heldItem: string | null;
  friendship: number;
  metLocation: string;
  originalTrainer: string;
  originalTrainerId: number;
  pokeball: string;
  teraType?: PokemonType;
  dynamaxLevel?: number;
}
