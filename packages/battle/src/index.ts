// @pokemon-lib-ts/battle — BattleEngine, GenerationRuleset interface, BaseRuleset, BattleState, BattleEvent stream, AI controllers

// AI
export type { AIController } from "./ai";
export { RandomAI } from "./ai";
// Context
export type {
  AbilityContext,
  AbilityResult,
  AccuracyContext,
  AvailableMove,
  BattleConfig,
  BattleGimmick,
  CritContext,
  DamageBreakdown,
  DamageContext,
  DamageResult,
  EndOfTurnEffect,
  EntryHazardResult,
  ExpContext,
  ItemContext,
  ItemResult,
  MoveEffectContext,
  MoveEffectResult,
  TerrainEffectResult,
  TrainerDataRef,
  ValidationResult,
  WeatherEffectResult,
} from "./context";
// Engine
export { BattleEngine } from "./engine";
// Events
export type {
  AbilityActivateEvent,
  BattleAction,
  BattleEndEvent,
  BattleEvent,
  BattleEventEmitter,
  BattleEventListener,
  BattleStartEvent,
  CatchAttemptEvent,
  CriticalHitEvent,
  DamageEvent,
  DynamaxEndEvent,
  DynamaxEvent,
  EffectivenessEvent,
  ExpGainEvent,
  FaintEvent,
  HazardClearEvent,
  HazardSetEvent,
  HealEvent,
  ItemAction,
  ItemActivateEvent,
  ItemConsumedEvent,
  LevelUpEvent,
  MegaEvolveEvent,
  MessageEvent,
  MoveAction,
  MoveFailEvent,
  MoveMissEvent,
  MoveStartEvent,
  PokemonSnapshot,
  RechargeAction,
  RunAction,
  ScreenEndEvent,
  ScreenSetEvent,
  StatChangeEvent,
  StatusCureEvent,
  StatusInflictEvent,
  StruggleAction,
  SwitchAction,
  SwitchInEvent,
  SwitchOutEvent,
  TerastallizeEvent,
  TerrainEndEvent,
  TerrainSetEvent,
  TurnStartEvent,
  VolatileEndEvent,
  VolatileStartEvent,
  WeatherEndEvent,
  WeatherSetEvent,
  ZMoveEvent,
} from "./events";
// Ruleset
export type { GenerationRuleset } from "./ruleset";
export { BaseRuleset, GenerationRegistry, generations } from "./ruleset";
// State
export type {
  ActivePokemon,
  BattleFormat,
  BattlePhase,
  BattleSide,
  BattleState,
  EntryHazardState,
  FutureAttackState,
  ScreenState,
  TerrainState,
  TrainerRef,
  TurnRecord,
  VolatileStatusState,
  WeatherState,
} from "./state";

// Utils
export {
  createActivePokemon,
  createDefaultStatStages,
  createPokemonSnapshot,
  createTestPokemon,
  getPokemonName,
} from "./utils";
