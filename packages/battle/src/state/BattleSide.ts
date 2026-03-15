import type {
  BattleStat,
  EntryHazardType,
  PokemonInstance,
  PokemonSpeciesData,
  PokemonType,
  ScreenType,
  VolatileStatus,
} from "@pokemon-lib-ts/core";

export interface BattleSide {
  readonly index: 0 | 1;
  readonly trainer: TrainerRef | null;
  team: PokemonInstance[];
  active: (ActivePokemon | null)[];
  hazards: EntryHazardState[];
  screens: ScreenState[];
  tailwind: { active: boolean; turnsLeft: number };
  luckyChant: { active: boolean; turnsLeft: number };
  wish: { active: boolean; turnsLeft: number; healAmount: number } | null;
  futureAttack: FutureAttackState | null;
  faintCount: number;
  gimmickUsed: boolean;
}

export interface TrainerRef {
  readonly id: string;
  readonly displayName: string;
  readonly trainerClass: string;
}

export interface ActivePokemon {
  pokemon: PokemonInstance;
  teamSlot: number;
  statStages: Record<BattleStat, number>;
  volatileStatuses: Map<VolatileStatus, VolatileStatusState>;
  types: PokemonType[];
  ability: string;
  lastMoveUsed: string | null;
  turnsOnField: number;
  movedThisTurn: boolean;
  consecutiveProtects: number;
  substituteHp: number;
  transformed: boolean;
  transformedSpecies: PokemonSpeciesData | null;
  isMega: boolean;
  isDynamaxed: boolean;
  dynamaxTurnsLeft: number;
  isTerastallized: boolean;
  teraType: PokemonType | null;
}

export interface VolatileStatusState {
  turnsLeft: number;
  source?: string;
  data?: Record<string, unknown>;
}

export interface EntryHazardState {
  type: EntryHazardType;
  layers: number;
}

export interface ScreenState {
  type: ScreenType;
  turnsLeft: number;
}

export interface FutureAttackState {
  moveId: string;
  turnsLeft: number;
  damage: number;
  sourceSide: 0 | 1;
}
