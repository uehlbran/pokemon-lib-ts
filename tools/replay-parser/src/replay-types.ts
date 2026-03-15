// Raw API response from replay.pokemonshowdown.com/{id}.json
export interface ShowdownReplayJson {
  id: string;
  format: string;
  formatid: string;
  log: string;
  uploadtime: number;
  views: number;
  players: string[];
}

// Search result from replay.pokemonshowdown.com/search.json
export interface ReplaySearchResult {
  id: string;
  format: string;
  uploadtime: number;
  players: string[];
  rating?: number;
}

// Parsed from "p1a: Nickname" format
export interface PokemonIdent {
  side: 0 | 1;
  position: string;
  nickname: string;
}

// Parsed from "64/100 par" format
export interface ShowdownHp {
  current: number;
  max: number;
  status: string | null;
}

// All Showdown protocol events as discriminated union
export type ShowdownEvent =
  | SwitchEvent
  | MoveEvent
  | DamageEvent
  | HealEvent
  | CritEvent
  | EffectivenessEvent
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
  type: "switch";
  ident: PokemonIdent;
  species: string;
  level: number;
  hp: ShowdownHp;
}

export interface MoveEvent {
  type: "move";
  userIdent: PokemonIdent;
  moveName: string;
  moveId: string;
  targetIdent: PokemonIdent | null;
}

export interface DamageEvent {
  type: "damage";
  ident: PokemonIdent;
  hp: ShowdownHp;
  from?: string;
}

export interface HealEvent {
  type: "heal";
  ident: PokemonIdent;
  hp: ShowdownHp;
  from?: string;
}

export interface CritEvent {
  type: "crit";
  ident: PokemonIdent;
}

export interface EffectivenessEvent {
  type: "effectiveness";
  ident: PokemonIdent;
  multiplier: 0 | 0.5 | 2;
}

export interface StatusEvent {
  type: "status";
  ident: PokemonIdent;
  statusId: string;
  statusName: string;
}

export interface CureStatusEvent {
  type: "curestatus";
  ident: PokemonIdent;
  statusId: string;
}

export interface BoostEvent {
  type: "boost";
  ident: PokemonIdent;
  stat: string;
  amount: number;
}

export interface UnboostEvent {
  type: "unboost";
  ident: PokemonIdent;
  stat: string;
  amount: number;
}

export interface MissEvent {
  type: "miss";
  userIdent: PokemonIdent;
  targetIdent: PokemonIdent | null;
}

export interface FailEvent {
  type: "fail";
  ident: PokemonIdent;
  reason?: string;
}

export interface CantEvent {
  type: "cant";
  ident: PokemonIdent;
  reason: string;
  moveName?: string;
}

export interface FaintEvent {
  type: "faint";
  ident: PokemonIdent;
}

export interface WinEvent {
  type: "win";
  winner: string;
}

export interface TieEvent {
  type: "tie";
}

export interface TurnEvent {
  type: "turn";
  turnNumber: number;
}

export interface HitCountEvent {
  type: "hitcount";
  ident: PokemonIdent;
  count: number;
}

export interface StartEvent {
  type: "start";
  ident: PokemonIdent;
  effect: string;
  from?: string;
}

export interface EndEvent {
  type: "end";
  ident: PokemonIdent;
  effect: string;
}

export interface UnknownEvent {
  type: "unknown";
  raw: string;
}

// A single parsed Pokemon seen in the replay
export interface ReconstructedPokemon {
  species: string;
  level: number;
  knownMoves: string[];
  nickname: string;
}

// A single turn with all its events
export interface ParsedTurn {
  turnNumber: number;
  events: ShowdownEvent[];
}

// Fully parsed replay
export interface ParsedReplay {
  id: string;
  format: string;
  generation: number;
  players: [string, string];
  teams: [ReconstructedPokemon[], ReconstructedPokemon[]];
  turns: ParsedTurn[];
  winner: string | null;
}

// Validation output
export type ValidationSeverity = "error" | "warning" | "info";

export interface ValidationMismatch {
  turnNumber: number;
  severity: ValidationSeverity;
  check: string;
  message: string;
}

export interface ValidationResult {
  replayId: string;
  format: string;
  totalTurns: number;
  winner: string | null;
  passed: number;
  mismatches: ValidationMismatch[];
}
