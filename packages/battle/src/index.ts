// @pokemon-lib/battle — BattleEngine, GenerationRuleset interface, BaseRuleset, BattleState, BattleEvent stream, AI controllers

// Ruleset
export type { GenerationRuleset } from "./ruleset";
export { BaseRuleset, GenerationRegistry, generations } from "./ruleset";

// State
export type {
  BattleState,
  BattlePhase,
  BattleFormat,
  WeatherState,
  TerrainState,
  TurnRecord,
  BattleSide,
  TrainerRef,
  ActivePokemon,
  VolatileStatusState,
  EntryHazardState,
  ScreenState,
  FutureAttackState,
} from "./state";

// Events
export type {
  BattleAction,
  MoveAction,
  SwitchAction,
  ItemAction,
  RunAction,
  RechargeAction,
  StruggleAction,
  BattleEvent,
  BattleStartEvent,
  TurnStartEvent,
  SwitchInEvent,
  SwitchOutEvent,
  MoveStartEvent,
  MoveMissEvent,
  MoveFailEvent,
  DamageEvent,
  HealEvent,
  FaintEvent,
  EffectivenessEvent,
  CriticalHitEvent,
  StatusInflictEvent,
  StatusCureEvent,
  VolatileStartEvent,
  VolatileEndEvent,
  StatChangeEvent,
  WeatherSetEvent,
  WeatherEndEvent,
  TerrainSetEvent,
  TerrainEndEvent,
  AbilityActivateEvent,
  ItemActivateEvent,
  ItemConsumedEvent,
  HazardSetEvent,
  HazardClearEvent,
  ScreenSetEvent,
  ScreenEndEvent,
  MegaEvolveEvent,
  DynamaxEvent,
  DynamaxEndEvent,
  TerastallizeEvent,
  ZMoveEvent,
  CatchAttemptEvent,
  ExpGainEvent,
  LevelUpEvent,
  MessageEvent,
  BattleEndEvent,
  PokemonSnapshot,
  BattleEventListener,
  BattleEventEmitter,
} from "./events";

// Context
export type {
  DamageContext,
  DamageResult,
  DamageBreakdown,
  CritContext,
  AccuracyContext,
  MoveEffectContext,
  MoveEffectResult,
  AbilityContext,
  AbilityResult,
  ItemContext,
  ItemResult,
  ExpContext,
  BattleGimmick,
  EndOfTurnEffect,
  BattleConfig,
  TrainerDataRef,
  AvailableMove,
  ValidationResult,
  WeatherEffectResult,
  TerrainEffectResult,
  EntryHazardResult,
} from "./context";

// Engine
export { BattleEngine } from "./engine";

// AI
export type { AIController } from "./ai";
export { RandomAI } from "./ai";

// Utils
export {
  createPokemonSnapshot,
  createDefaultStatStages,
  createActivePokemon,
  getPokemonName,
  createTestPokemon,
} from "./utils";
