import type { Generation, TerrainType, WeatherType } from "@pokemon-lib-ts/core";
import type { SeededRandom } from "@pokemon-lib-ts/core";
import type { BattleAction } from "../events";
import type { BattleEvent } from "../events";
import type { BattleSide } from "./BattleSide";

export type BattlePhase =
  | "BATTLE_START"
  | "TURN_START"
  | "ACTION_SELECT"
  | "TURN_RESOLVE"
  | "TURN_END"
  | "FAINT_CHECK"
  | "SWITCH_PROMPT"
  | "BATTLE_END";

export type BattleFormat = "singles" | "doubles" | "triples" | "rotation";

export interface WeatherState {
  type: WeatherType;
  turnsLeft: number;
  source: string;
}

export interface TerrainState {
  type: TerrainType;
  turnsLeft: number;
  source: string;
}

export interface TurnRecord {
  readonly turn: number;
  readonly actions: readonly BattleAction[];
  readonly events: readonly BattleEvent[];
}

export interface BattleState {
  phase: BattlePhase;
  readonly generation: Generation;
  readonly format: BattleFormat;
  turnNumber: number;
  sides: [BattleSide, BattleSide];
  weather: WeatherState | null;
  terrain: TerrainState | null;
  trickRoom: { active: boolean; turnsLeft: number };
  magicRoom: { active: boolean; turnsLeft: number };
  wonderRoom: { active: boolean; turnsLeft: number };
  gravity: { active: boolean; turnsLeft: number };
  turnHistory: TurnRecord[];
  readonly rng: SeededRandom;
  ended: boolean;
  winner: 0 | 1 | null;
}
