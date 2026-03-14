import type {
  AbilityTrigger,
  BattleStat,
  Generation,
  MoveCategory,
  MoveData,
  PokemonInstance,
  PokemonSpeciesData,
  PokemonType,
  PrimaryStatus,
  VolatileStatus,
} from "@pokemon-lib/core";
import type { SeededRandom } from "@pokemon-lib/core";
import type { BattleEvent } from "../events";
import type { ActivePokemon, BattleFormat, BattleSide, BattleState } from "../state";

export interface DamageContext {
  readonly attacker: ActivePokemon;
  readonly defender: ActivePokemon;
  readonly move: MoveData;
  readonly state: BattleState;
  readonly rng: SeededRandom;
  readonly isCrit: boolean;
}

export interface DamageResult {
  readonly damage: number;
  readonly effectiveness: number;
  readonly isCrit: boolean;
  readonly randomFactor: number;
  readonly breakdown?: DamageBreakdown;
}

export interface DamageBreakdown {
  readonly baseDamage: number;
  readonly weatherMod: number;
  readonly critMod: number;
  readonly randomMod: number;
  readonly stabMod: number;
  readonly typeMod: number;
  readonly burnMod: number;
  readonly abilityMod: number;
  readonly itemMod: number;
  readonly otherMod: number;
  readonly finalDamage: number;
}

export interface CritContext {
  readonly attacker: ActivePokemon;
  readonly move: MoveData;
  readonly state: BattleState;
  readonly rng: SeededRandom;
}

export interface AccuracyContext {
  readonly attacker: ActivePokemon;
  readonly defender: ActivePokemon;
  readonly move: MoveData;
  readonly state: BattleState;
  readonly rng: SeededRandom;
}

export interface MoveEffectContext {
  readonly attacker: ActivePokemon;
  readonly defender: ActivePokemon;
  readonly move: MoveData;
  readonly damage: number;
  readonly state: BattleState;
  readonly rng: SeededRandom;
}

export interface MoveEffectResult {
  readonly statusInflicted: PrimaryStatus | null;
  readonly volatileInflicted: VolatileStatus | null;
  readonly statChanges: ReadonlyArray<{
    target: "attacker" | "defender";
    stat: BattleStat;
    stages: number;
  }>;
  readonly recoilDamage: number;
  readonly healAmount: number;
  readonly switchOut: boolean;
  readonly messages: readonly string[];
}

export interface AbilityContext {
  readonly pokemon: ActivePokemon;
  readonly opponent?: ActivePokemon;
  readonly state: BattleState;
  readonly rng: SeededRandom;
  readonly trigger: AbilityTrigger;
  readonly move?: MoveData;
  readonly damage?: number;
}

export interface AbilityResult {
  readonly activated: boolean;
  readonly effects: ReadonlyArray<{
    type: string;
    target: "self" | "opponent" | "field";
    value: unknown;
  }>;
  readonly messages: readonly string[];
}

export interface ItemContext {
  readonly pokemon: ActivePokemon;
  readonly state: BattleState;
  readonly rng: SeededRandom;
  readonly move?: MoveData;
  readonly damage?: number;
}

export interface ItemResult {
  readonly activated: boolean;
  readonly effects: ReadonlyArray<{
    type: string;
    target: "self" | "opponent" | "field";
    value: unknown;
  }>;
  readonly messages: readonly string[];
}

export interface ExpContext {
  readonly defeatedSpecies: PokemonSpeciesData;
  readonly defeatedLevel: number;
  readonly participantLevel: number;
  readonly isTrainerBattle: boolean;
  readonly participantCount: number;
  readonly hasLuckyEgg: boolean;
  readonly hasExpShare: boolean;
  readonly affectionBonus: boolean;
}

export interface BattleGimmick {
  readonly name: string;
  readonly generations: readonly Generation[];
  canUse(pokemon: ActivePokemon, side: BattleSide, state: BattleState): boolean;
  activate(pokemon: ActivePokemon, side: BattleSide, state: BattleState): BattleEvent[];
  revert?(pokemon: ActivePokemon, state: BattleState): BattleEvent[];
  modifyMove?(move: MoveData, pokemon: ActivePokemon): MoveData;
}

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
  | "harvest"
  | "pickup"
  | "poison-heal";

export interface BattleConfig {
  readonly generation: Generation;
  readonly format: BattleFormat;
  readonly teams: readonly [PokemonInstance[], PokemonInstance[]];
  readonly trainers?: readonly [TrainerDataRef | null, TrainerDataRef | null];
  readonly seed: number;
  readonly isWildBattle?: boolean;
}

/** Simplified trainer reference for battle config */
export interface TrainerDataRef {
  readonly id: string;
  readonly displayName: string;
  readonly trainerClass: string;
}

export interface AvailableMove {
  readonly index: number;
  readonly moveId: string;
  readonly displayName: string;
  readonly type: PokemonType;
  readonly category: MoveCategory;
  readonly pp: number;
  readonly maxPp: number;
  readonly disabled: boolean;
  readonly disabledReason?: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export interface WeatherEffectResult {
  readonly side: 0 | 1;
  readonly pokemon: string;
  readonly damage: number;
  readonly message: string;
}

export interface TerrainEffectResult {
  readonly side: 0 | 1;
  readonly pokemon: string;
  readonly effect: string;
  readonly message: string;
}

export interface EntryHazardResult {
  readonly damage: number;
  readonly statusInflicted: PrimaryStatus | null;
  readonly statChanges: ReadonlyArray<{ stat: BattleStat; stages: number }>;
  readonly messages: readonly string[];
}
