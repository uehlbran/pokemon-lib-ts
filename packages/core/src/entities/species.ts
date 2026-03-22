import type { ExperienceGroup } from "./experience";
import type { Gender } from "./gender";
import type { StatBlock } from "./stats";
import type { Generation, PokemonType } from "./types";

export interface PokemonSpeciesData {
  /** National Pokedex number */
  readonly id: number;

  /** Lowercase identifier (e.g., "charizard") */
  readonly name: string;

  /** Display name (e.g., "Charizard") */
  readonly displayName: string;

  /** One or two types */
  readonly types: readonly [PokemonType] | readonly [PokemonType, PokemonType];

  /** Base stats (Gen 3+ model with SpAtk/SpDef split) */
  readonly baseStats: StatBlock;

  /** Available abilities */
  readonly abilities: {
    readonly normal: readonly string[]; // 1-2 regular ability IDs
    readonly hidden: string | null; // Hidden ability ID, or null
  };

  /** Gender ratio: percentage male. -1 = genderless. */
  readonly genderRatio: number;

  /** Base catch rate (0-255) */
  readonly catchRate: number;

  /** Base experience yield when defeated */
  readonly baseExp: number;

  /** Experience growth group */
  readonly expGroup: ExperienceGroup;

  /** EV yield when defeated */
  readonly evYield: Partial<StatBlock>;

  /** Egg groups for breeding */
  readonly eggGroups: readonly string[];

  /** Learnset — all moves this species can learn and how */
  readonly learnset: Learnset;

  /** Evolution data (null if doesn't evolve) */
  readonly evolution: EvolutionData | null;

  /** Physical dimensions */
  readonly dimensions: {
    readonly height: number; // meters
    readonly weight: number; // kg
  };

  /** Sprite lookup key (usually same as name) */
  readonly spriteKey: string;

  /** Base friendship/happiness (0-255) */
  readonly baseFriendship: number;

  /** Generation this species was introduced */
  readonly generation: Generation;

  /** Whether this is a legendary or mythical Pokemon */
  readonly isLegendary: boolean;
  readonly isMythical: boolean;

  // --- Form/Transformation Data (optional) ---

  /** Mega Evolution forms (Gen 6-7) */
  readonly megaEvolutions?: readonly MegaEvolutionData[];

  /** Gigantamax form data (Gen 8) */
  readonly gigantamaxForm?: GigantamaxData;

  /** Whether this species can Dynamax (Gen 8, default true) */
  readonly canDynamax?: boolean;

  /** Available Tera Types (Gen 9, default = same as species types) */
  readonly teraTypes?: readonly PokemonType[];

  /**
   * Regional forms (Alolan, Galarian, Hisuian, Paldean).
   * Each regional form is essentially a separate species entry
   * but linked to the original via this field.
   */
  readonly regionalForms?: readonly RegionalFormData[];
}

export interface Learnset {
  /** Moves learned by leveling up, ordered by level */
  readonly levelUp: readonly LevelUpMove[];

  /** Moves learned via TM/HM/TR */
  readonly tm: readonly string[];

  /** Moves available as egg moves */
  readonly egg: readonly string[];

  /** Moves taught by move tutor */
  readonly tutor: readonly string[];

  /** Moves obtainable only via special events */
  readonly event?: readonly string[];
}

export interface LevelUpMove {
  readonly level: number;
  readonly move: string; // Move ID
}

export interface EvolutionData {
  /** What this species evolves from (null if base form) */
  readonly from: EvolutionLink | null;

  /** What this species can evolve into */
  readonly to: readonly EvolutionLink[];
}

export interface EvolutionLink {
  /** Target species ID */
  readonly speciesId: number;

  /** How the evolution is triggered */
  readonly method: EvolutionMethod;

  /** Minimum level required (for level-up evolutions) */
  readonly level?: number;

  /** Item required (for item-use or held-item evolutions) */
  readonly item?: string;

  /** Special condition description */
  readonly condition?: string;

  /** Gender requirement */
  readonly gender?: Gender;

  /** Time of day requirement */
  readonly timeOfDay?: "day" | "night";

  /** Required held item during trade */
  readonly tradeItem?: string;

  /** Required known move */
  readonly knownMove?: string;

  /** Required known move type */
  readonly knownMoveType?: PokemonType;

  /** Required friendship level */
  readonly minFriendship?: number;

  /** Required location */
  readonly location?: string;
}

export type EvolutionMethod =
  | "level-up" // Reach a certain level
  | "trade" // Trade (with or without item)
  | "use-item" // Use item on Pokemon
  | "friendship" // Level up with high friendship
  | "friendship-day" // Level up with high friendship during day
  | "friendship-night" // Level up with high friendship at night
  | "special"; // Other conditions (Tyrogue, Wurmple, etc.)

export interface MegaEvolutionData {
  /** Form identifier: "mega", "mega-x", "mega-y" */
  readonly form: string;

  /** Required held Mega Stone item ID */
  readonly item: string;

  /** Types in Mega form */
  readonly types: readonly [PokemonType] | readonly [PokemonType, PokemonType];

  /** Base stats in Mega form */
  readonly baseStats: StatBlock;

  /** Ability in Mega form */
  readonly ability: string;

  /**
   * Species ID that this Mega Stone belongs to.
   * Used to validate stone-species compatibility in canUse().
   * Source: Game mechanic — each Mega Stone is specific to one species.
   */
  readonly baseSpeciesId: number;
}

export interface GigantamaxData {
  /** The G-Max Move this species gets */
  readonly gMaxMove: {
    readonly type: PokemonType;
    readonly name: string;
    readonly basePower: number;
    readonly effect: string;
  };
}

export interface RegionalFormData {
  /** Region identifier */
  readonly region: "alola" | "galar" | "hisui" | "paldea";

  /** Species ID of the regional form (PokeAPI assigns separate IDs) */
  readonly formSpeciesId: number;

  /** Types of the regional form */
  readonly types: readonly [PokemonType] | readonly [PokemonType, PokemonType];

  /** Base stats of the regional form */
  readonly baseStats: StatBlock;

  /** Abilities of the regional form */
  readonly abilities: {
    readonly normal: readonly string[];
    readonly hidden: string | null;
  };
}
