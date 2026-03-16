import type { Generation, SeededRandom, TerrainType, WeatherType } from "@pokemon-lib-ts/core";
import type { BattleAction, BattleEvent } from "../events";
import type { BattleSide } from "./BattleSide";

/**
 * The current phase of the battle state machine.
 *
 * Valid transitions:
 * - `battle-start` → `action-select` (after `BattleEngine.start()`)
 * - `action-select` → `turn-resolve` (after both sides submit actions)
 * - `turn-resolve` → `turn-end` (after all actions are executed)
 * - `turn-end` → `faint-check` (after weather/status end-of-turn ticks)
 * - `faint-check` → `switch-prompt` (if a side needs to send in a replacement)
 * - `faint-check` → `action-select` (no fainted Pokémon requiring replacements)
 * - `faint-check` → `battle-end` (all Pokémon on one side have fainted)
 * - `switch-prompt` → `action-select` (after all forced switches are submitted)
 */
export type BattlePhase =
  | "battle-start"
  | "turn-start"
  | "action-select"
  | "turn-resolve"
  | "turn-end"
  | "faint-check"
  | "switch-prompt"
  | "battle-end";

/**
 * The battle format determines how many Pokémon are active per side at once.
 * - `singles` — 1 vs 1 (most common format)
 * - `doubles` — 2 vs 2
 * - `triples` — 3 vs 3 (Gen 5–6)
 * - `rotation` — 3 on each side, only 1 attacks per turn (Gen 5)
 */
export type BattleFormat = "singles" | "doubles" | "triples" | "rotation";

/**
 * The current weather on the field and how many turns remain.
 * `null` means no active weather (clear skies).
 */
export interface WeatherState {
  /** The active weather condition (e.g., `"rain"`, `"sun"`, `"sandstorm"`, `"hail"`) */
  type: WeatherType;
  /** Turns remaining before weather expires; −1 means indefinite (ability-set weather) */
  turnsLeft: number;
  /** Move or ability that set the weather (for event attribution) */
  source: string;
}

/**
 * The current terrain on the field and how many turns remain (Gen 6+).
 * `null` means no active terrain.
 */
export interface TerrainState {
  /** The active terrain (e.g., `"electric"`, `"grassy"`, `"misty"`, `"psychic"`) */
  type: TerrainType;
  /** Turns remaining before terrain expires */
  turnsLeft: number;
  /** Move or ability that set the terrain (for event attribution) */
  source: string;
}

/**
 * An immutable record of all actions submitted and events emitted during a single turn.
 * Appended to `BattleState.turnHistory` at the end of each turn.
 * Useful for replay, undo, and debugging.
 */
export interface TurnRecord {
  /** The 1-based turn number this record covers */
  readonly turn: number;
  /** The actions both sides submitted during `action-select` */
  readonly actions: readonly BattleAction[];
  /** All events emitted between `turn-start` and `turn-end` (inclusive) */
  readonly events: readonly BattleEvent[];
}

/**
 * The full mutable battle state. This is the single source of truth for
 * all in-progress battle data. The engine reads and writes this object;
 * consumers should treat it as read-only (use `getEventLog()` or subscribe to events).
 */
export interface BattleState {
  /** Current phase of the battle state machine; mutated by the engine */
  phase: BattlePhase;
  /** Game generation (1–9); immutable after construction */
  readonly generation: Generation;
  /** Battle format; immutable after construction */
  readonly format: BattleFormat;
  /** 1-based turn counter; incremented at the start of each new turn */
  turnNumber: number;
  /** Both sides of the battle; index 0 = player/side-A, index 1 = opponent/side-B */
  sides: [BattleSide, BattleSide];
  /** Current field weather, or `null` if no weather is active */
  weather: WeatherState | null;
  /** Current field terrain, or `null` if no terrain is active (Gen 6+) */
  terrain: TerrainState | null;
  /** Trick Room field effect state (Gen 4+); reverses turn order when active */
  trickRoom: { active: boolean; turnsLeft: number };
  /** Magic Room field effect state (Gen 5+); suppresses held items when active */
  magicRoom: { active: boolean; turnsLeft: number };
  /** Wonder Room field effect state (Gen 5+); swaps Defense and Sp. Def when active */
  wonderRoom: { active: boolean; turnsLeft: number };
  /** Gravity field effect state (Gen 4+); grounds all Pokémon when active */
  gravity: { active: boolean; turnsLeft: number };
  /** Ordered history of completed turns; grows by one entry at the end of each turn */
  turnHistory: TurnRecord[];
  /** The PRNG instance; shared across all random rolls in the battle */
  readonly rng: SeededRandom;
  /** `true` once the battle has concluded (winner or draw determined) */
  ended: boolean;
  /** The winning side (0 or 1), or `null` if the battle ended in a draw */
  winner: 0 | 1 | null;
}
