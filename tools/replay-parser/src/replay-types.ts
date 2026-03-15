// Raw API response from replay.pokemonshowdown.com/{id}.json
export interface ShowdownReplayJson {
  readonly id: string;
  readonly format: string;
  readonly formatid: string;
  readonly log: string;
  readonly uploadtime: number;
  readonly views: number;
  readonly players: readonly string[];
}

// Search result from replay.pokemonshowdown.com/search.json
export interface ReplaySearchResult {
  readonly id: string;
  readonly format: string;
  readonly uploadtime: number;
  readonly players: readonly string[];
  readonly rating?: number;
}

// Parsed from "p1a: Nickname" format
export interface PokemonIdent {
  readonly side: 0 | 1;
  readonly position: string;
  readonly nickname: string;
}

// Parsed from "64/100 par" format
export interface ShowdownHp {
  readonly current: number;
  readonly max: number;
  readonly status: "par" | "brn" | "frz" | "slp" | "psn" | "tox" | null;
}

// All Showdown protocol events as discriminated union
export type ShowdownEvent =
  | SwitchEvent
  | MoveEvent
  | DamageEvent
  | HealEvent
  | CritEvent
  | SuperEffectiveEvent
  | ResistedEvent
  | ImmuneEvent
  | StatusEvent
  | CureStatusEvent
  | BoostEvent
  | UnboostEvent
  | MissEvent
  | FailEvent
  | CantEvent
  | FaintEvent
  | WinEvent
  | TieEvent
  | TurnEvent
  | HitCountEvent
  | StartEvent
  | EndEvent
  | UnknownEvent;

export interface SwitchEvent {
  readonly type: "switch";
  readonly ident: PokemonIdent;
  readonly species: string;
  readonly level: number;
  readonly hp: ShowdownHp;
}

export interface MoveEvent {
  readonly type: "move";
  readonly userIdent: PokemonIdent;
  readonly moveName: string;
  readonly moveId: string;
  readonly targetIdent: PokemonIdent | null;
}

export interface DamageEvent {
  readonly type: "damage";
  readonly ident: PokemonIdent;
  readonly hp: ShowdownHp;
  readonly from?: string;
}

export interface HealEvent {
  readonly type: "heal";
  readonly ident: PokemonIdent;
  readonly hp: ShowdownHp;
  readonly from?: string;
}

export interface CritEvent {
  readonly type: "crit";
  readonly ident: PokemonIdent;
}

export interface SuperEffectiveEvent {
  readonly type: "supereffective";
  readonly ident: PokemonIdent;
}

export interface ResistedEvent {
  readonly type: "resisted";
  readonly ident: PokemonIdent;
}

export interface ImmuneEvent {
  readonly type: "immune";
  readonly ident: PokemonIdent;
}

export interface StatusEvent {
  readonly type: "status";
  readonly ident: PokemonIdent;
  readonly statusId: string;
  readonly statusName: string;
}

export interface CureStatusEvent {
  readonly type: "curestatus";
  readonly ident: PokemonIdent;
  readonly statusId: string;
}

export interface BoostEvent {
  readonly type: "boost";
  readonly ident: PokemonIdent;
  readonly stat: "atk" | "def" | "spa" | "spd" | "spe" | "spc" | "accuracy" | "evasion";
  readonly amount: number;
}

export interface UnboostEvent {
  readonly type: "unboost";
  readonly ident: PokemonIdent;
  readonly stat: "atk" | "def" | "spa" | "spd" | "spe" | "spc" | "accuracy" | "evasion";
  readonly amount: number;
}

export interface MissEvent {
  readonly type: "miss";
  readonly userIdent: PokemonIdent;
  readonly targetIdent: PokemonIdent | null;
}

export interface FailEvent {
  readonly type: "fail";
  readonly ident: PokemonIdent;
  readonly reason?: string;
}

export interface CantEvent {
  readonly type: "cant";
  readonly ident: PokemonIdent;
  readonly reason: string;
  readonly moveName?: string;
}

export interface FaintEvent {
  readonly type: "faint";
  readonly ident: PokemonIdent;
}

export interface WinEvent {
  readonly type: "win";
  readonly winner: string;
}

export interface TieEvent {
  readonly type: "tie";
  readonly players: readonly [string, string];
}

export interface TurnEvent {
  readonly type: "turn";
  readonly turnNumber: number;
}

export interface HitCountEvent {
  readonly type: "hitcount";
  readonly ident: PokemonIdent;
  readonly count: number;
}

export interface StartEvent {
  readonly type: "start";
  readonly ident: PokemonIdent;
  readonly effect: string;
  readonly from?: string;
}

export interface EndEvent {
  readonly type: "end";
  readonly ident: PokemonIdent;
  readonly effect: string;
}

export interface UnknownEvent {
  readonly type: "unknown";
  readonly raw: string;
}

// A single parsed Pokemon seen in the replay
export interface ReconstructedPokemon {
  readonly species: string;
  readonly level: number;
  readonly knownMoves: readonly string[];
  readonly nickname: string;
}

// A single turn with all its events
export interface ParsedTurn {
  readonly turnNumber: number;
  readonly events: readonly ShowdownEvent[];
}

// Fully parsed replay
export interface ParsedReplay {
  readonly id: string;
  readonly format: string;
  readonly generation: number;
  readonly players: readonly [string, string];
  readonly teams: readonly [readonly ReconstructedPokemon[], readonly ReconstructedPokemon[]];
  readonly turns: readonly ParsedTurn[];
  readonly winner: string | null;
}

// Validation output
export type ValidationSeverity = "error" | "warning" | "info";

export interface ValidationMismatch {
  readonly turnNumber: number;
  readonly severity: ValidationSeverity;
  readonly check: string;
  readonly message: string;
}

export interface ValidationResult {
  readonly replayId: string;
  readonly format: string;
  readonly totalTurns: number;
  readonly winner: string | null;
  readonly passed: number;
  readonly mismatches: readonly ValidationMismatch[];
}
