/**
 * Discriminant values for every event in the BattleEvent union.
 * Use these instead of raw string literals when comparing `event.type`.
 */
export const BATTLE_EVENT_TYPES = {
  battleStart: "battle-start",
  turnStart: "turn-start",
  switchIn: "switch-in",
  switchOut: "switch-out",
  moveStart: "move-start",
  moveMiss: "move-miss",
  moveFail: "move-fail",
  damage: "damage",
  heal: "heal",
  faint: "faint",
  effectiveness: "effectiveness",
  criticalHit: "critical-hit",
  statusInflict: "status-inflict",
  statusCure: "status-cure",
  volatileStart: "volatile-start",
  volatileEnd: "volatile-end",
  statChange: "stat-change",
  weatherSet: "weather-set",
  weatherEnd: "weather-end",
  terrainSet: "terrain-set",
  terrainEnd: "terrain-end",
  abilityActivate: "ability-activate",
  itemActivate: "item-activate",
  itemConsumed: "item-consumed",
  hazardSet: "hazard-set",
  hazardClear: "hazard-clear",
  screenSet: "screen-set",
  screenEnd: "screen-end",
  megaEvolve: "mega-evolve",
  dynamax: "dynamax",
  dynamaxEnd: "dynamax-end",
  terastallize: "terastallize",
  zMove: "z-move",
  ultraBurst: "ultra-burst",
  catchAttempt: "catch-attempt",
  expGain: "exp-gain",
  levelUp: "level-up",
  fleeAttempt: "flee-attempt",
  message: "message",
  engineWarning: "engine-warning",
  battleEnd: "battle-end",
} as const;
export type BattleEventType = (typeof BATTLE_EVENT_TYPES)[keyof typeof BATTLE_EVENT_TYPES];

/**
 * Battle engine phase identifiers.
 * Use these instead of raw string literals when comparing `engine.getPhase()`.
 */
export const BATTLE_PHASE_IDS = {
  battleStart: "battle-start",
  turnStart: "turn-start",
  actionSelect: "action-select",
  turnResolve: "turn-resolve",
  turnEnd: "turn-end",
  faintCheck: "faint-check",
  switchPrompt: "switch-prompt",
  battleEnd: "battle-end",
} as const;
export type BattlePhaseId = (typeof BATTLE_PHASE_IDS)[keyof typeof BATTLE_PHASE_IDS];

export const BATTLE_GIMMICK_IDS = {
  dynamax: "dynamax",
  mega: "mega",
  tera: "tera",
  ultraBurst: "ultraburst",
  zMove: "zmove",
} as const;

export const BATTLE_SOURCE_IDS = {
  ability: "ability",
  aquaRing: "aqua-ring",
  bind: "bind",
  confusion: "confusion",
  curse: "curse",
  entryHazard: "entry-hazard",
  grassyTerrain: "grassy-terrain",
  heldItem: "held-item",
  ingrain: "ingrain",
  leechSeed: "leech-seed",
  moveEffect: "move-effect",
  nightmare: "nightmare",
  recoil: "recoil",
  saltCure: "salt-cure",
  struggle: "struggle",
  struggleRecoil: "struggle-recoil",
  wish: "wish",
  weatherPrefix: "weather-",
} as const;
export type BattleSourceId = (typeof BATTLE_SOURCE_IDS)[keyof typeof BATTLE_SOURCE_IDS];
