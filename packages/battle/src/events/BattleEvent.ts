import type {
  BattleStat,
  EntryHazardType,
  Gender,
  Generation,
  PokemonType,
  PrimaryStatus,
  ScreenType,
  TerrainType,
  VolatileStatus,
  WeatherType,
} from "@pokemon-lib/core";
import type { BattleFormat } from "../state";

export type BattleEvent =
  | BattleStartEvent
  | TurnStartEvent
  | SwitchInEvent
  | SwitchOutEvent
  | MoveStartEvent
  | MoveMissEvent
  | MoveFailEvent
  | DamageEvent
  | HealEvent
  | FaintEvent
  | EffectivenessEvent
  | CriticalHitEvent
  | StatusInflictEvent
  | StatusCureEvent
  | VolatileStartEvent
  | VolatileEndEvent
  | StatChangeEvent
  | WeatherSetEvent
  | WeatherEndEvent
  | TerrainSetEvent
  | TerrainEndEvent
  | AbilityActivateEvent
  | ItemActivateEvent
  | ItemConsumedEvent
  | HazardSetEvent
  | HazardClearEvent
  | ScreenSetEvent
  | ScreenEndEvent
  | MegaEvolveEvent
  | DynamaxEvent
  | DynamaxEndEvent
  | TerastallizeEvent
  | ZMoveEvent
  | CatchAttemptEvent
  | ExpGainEvent
  | LevelUpEvent
  | MessageEvent
  | BattleEndEvent;

export interface BattleStartEvent {
  readonly type: "battle-start";
  readonly format: BattleFormat;
  readonly generation: Generation;
}

export interface TurnStartEvent {
  readonly type: "turn-start";
  readonly turnNumber: number;
}

export interface SwitchInEvent {
  readonly type: "switch-in";
  readonly side: 0 | 1;
  readonly pokemon: PokemonSnapshot;
  readonly slot: number;
}

export interface SwitchOutEvent {
  readonly type: "switch-out";
  readonly side: 0 | 1;
  readonly pokemon: PokemonSnapshot;
}

export interface MoveStartEvent {
  readonly type: "move-start";
  readonly side: 0 | 1;
  readonly pokemon: string;
  readonly move: string;
}

export interface MoveMissEvent {
  readonly type: "move-miss";
  readonly side: 0 | 1;
  readonly pokemon: string;
  readonly move: string;
}

export interface MoveFailEvent {
  readonly type: "move-fail";
  readonly side: 0 | 1;
  readonly pokemon: string;
  readonly move: string;
  readonly reason: string;
}

export interface DamageEvent {
  readonly type: "damage";
  readonly side: 0 | 1;
  readonly pokemon: string;
  readonly amount: number;
  readonly currentHp: number;
  readonly maxHp: number;
  readonly source: string;
}

export interface HealEvent {
  readonly type: "heal";
  readonly side: 0 | 1;
  readonly pokemon: string;
  readonly amount: number;
  readonly currentHp: number;
  readonly maxHp: number;
  readonly source: string;
}

export interface FaintEvent {
  readonly type: "faint";
  readonly side: 0 | 1;
  readonly pokemon: string;
}

export interface EffectivenessEvent {
  readonly type: "effectiveness";
  readonly multiplier: number;
}

export interface CriticalHitEvent {
  readonly type: "critical-hit";
}

export interface StatusInflictEvent {
  readonly type: "status-inflict";
  readonly side: 0 | 1;
  readonly pokemon: string;
  readonly status: PrimaryStatus;
}

export interface StatusCureEvent {
  readonly type: "status-cure";
  readonly side: 0 | 1;
  readonly pokemon: string;
  readonly status: PrimaryStatus;
}

export interface VolatileStartEvent {
  readonly type: "volatile-start";
  readonly side: 0 | 1;
  readonly pokemon: string;
  readonly volatile: VolatileStatus;
}

export interface VolatileEndEvent {
  readonly type: "volatile-end";
  readonly side: 0 | 1;
  readonly pokemon: string;
  readonly volatile: VolatileStatus;
}

export interface StatChangeEvent {
  readonly type: "stat-change";
  readonly side: 0 | 1;
  readonly pokemon: string;
  readonly stat: BattleStat;
  readonly stages: number;
  readonly currentStage: number;
}

export interface WeatherSetEvent {
  readonly type: "weather-set";
  readonly weather: WeatherType;
  readonly source: string;
}

export interface WeatherEndEvent {
  readonly type: "weather-end";
  readonly weather: WeatherType;
}

export interface TerrainSetEvent {
  readonly type: "terrain-set";
  readonly terrain: TerrainType;
  readonly source: string;
}

export interface TerrainEndEvent {
  readonly type: "terrain-end";
  readonly terrain: TerrainType;
}

export interface AbilityActivateEvent {
  readonly type: "ability-activate";
  readonly side: 0 | 1;
  readonly pokemon: string;
  readonly ability: string;
}

export interface ItemActivateEvent {
  readonly type: "item-activate";
  readonly side: 0 | 1;
  readonly pokemon: string;
  readonly item: string;
}

export interface ItemConsumedEvent {
  readonly type: "item-consumed";
  readonly side: 0 | 1;
  readonly pokemon: string;
  readonly item: string;
}

export interface HazardSetEvent {
  readonly type: "hazard-set";
  readonly side: 0 | 1;
  readonly hazard: EntryHazardType;
}

export interface HazardClearEvent {
  readonly type: "hazard-clear";
  readonly side: 0 | 1;
  readonly hazard: EntryHazardType;
}

export interface ScreenSetEvent {
  readonly type: "screen-set";
  readonly side: 0 | 1;
  readonly screen: ScreenType;
  readonly turns: number;
}

export interface ScreenEndEvent {
  readonly type: "screen-end";
  readonly side: 0 | 1;
  readonly screen: ScreenType;
}

export interface MegaEvolveEvent {
  readonly type: "mega-evolve";
  readonly side: 0 | 1;
  readonly pokemon: string;
  readonly form: string;
}

export interface DynamaxEvent {
  readonly type: "dynamax";
  readonly side: 0 | 1;
  readonly pokemon: string;
}

export interface DynamaxEndEvent {
  readonly type: "dynamax-end";
  readonly side: 0 | 1;
  readonly pokemon: string;
}

export interface TerastallizeEvent {
  readonly type: "terastallize";
  readonly side: 0 | 1;
  readonly pokemon: string;
  readonly teraType: PokemonType;
}

export interface ZMoveEvent {
  readonly type: "z-move";
  readonly side: 0 | 1;
  readonly pokemon: string;
  readonly move: string;
}

export interface CatchAttemptEvent {
  readonly type: "catch-attempt";
  readonly ball: string;
  readonly pokemon: string;
  readonly shakes: number;
  readonly caught: boolean;
}

export interface ExpGainEvent {
  readonly type: "exp-gain";
  readonly side: 0 | 1;
  readonly pokemon: string;
  readonly amount: number;
}

export interface LevelUpEvent {
  readonly type: "level-up";
  readonly side: 0 | 1;
  readonly pokemon: string;
  readonly newLevel: number;
}

export interface MessageEvent {
  readonly type: "message";
  readonly text: string;
}

export interface BattleEndEvent {
  readonly type: "battle-end";
  readonly winner: 0 | 1 | null;
}

export interface PokemonSnapshot {
  readonly speciesId: number;
  readonly nickname: string | null;
  readonly level: number;
  readonly currentHp: number;
  readonly maxHp: number;
  readonly status: PrimaryStatus | null;
  readonly gender: Gender;
  readonly isShiny: boolean;
}

export type BattleEventListener = (event: BattleEvent) => void;

export interface BattleEventEmitter {
  on(listener: BattleEventListener): void;
  off(listener: BattleEventListener): void;
  getEventLog(): readonly BattleEvent[];
}
