import type {
  AbilityContext,
  AccuracyContext,
  ActivePokemon,
  BattleState,
  DamageContext,
  MoveEffectContext,
} from "@pokemon-lib-ts/battle";
import type {
  MoveData,
  PokemonInstance,
  PokemonType,
  StatBlock,
  TypeChart,
} from "@pokemon-lib-ts/core";
import { CORE_STATUS_IDS, CORE_TYPE_IDS, CORE_VOLATILE_IDS, CORE_WEATHER_IDS } from "@pokemon-lib-ts/core";
import { GEN3_NATURE_IDS } from "../../src";
import { describe, expect, it } from "vitest";
import { createGen3DataManager } from "../../src/data";
import {
  applyGen3Ability,
  isGen3StatDropBlocked,
  isWeatherSuppressedGen3,
  WEATHER_SUPPRESSING_ABILITIES,
} from "../../src/Gen3Abilities";
import { GEN3_ABILITY_IDS, GEN3_MOVE_IDS, GEN3_SPECIES_IDS } from "../../src";
import { calculateGen3Damage } from "../../src/Gen3DamageCalc";
import { Gen3Ruleset } from "../../src/Gen3Ruleset";
import { applyGen3WeatherEffects } from "../../src/Gen3Weather";

/**
 * Tests for Gen 3 ability bug fixes:
 *   #339 — Synchronize (verify already-correct implementation)
 *   #340 — Trace (verify no blocklist in Gen 3)
 *   #342 — Cloud Nine / Air Lock weather suppression
 *   #344 — Pressure / Color Change (verify already-correct)
 *   #345 — Clear Body / White Smoke / Hyper Cutter / Keen Eye stat-drop immunity
 *   #346 — Forecast (Castform type change based on weather)
 *   #347 — Baton Pass batonPass flag
 *
 * Source hierarchy for Gen 3:
 *   1. pret/pokeemerald disassembly (ground truth)
 *   2. Pokemon Showdown Gen 3 mod
 *   3. Bulbapedia
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createMockRng(intReturnValue: number) {
  return {
    next: () => 0,
    int: (_min: number, _max: number) => intReturnValue,
    chance: () => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  };
}

function createActivePokemon(opts: {
  level?: number;
  attack?: number;
  defense?: number;
  spAttack?: number;
  spDefense?: number;
  hp?: number;
  currentHp?: number;
  types: PokemonType[];
  status?: (typeof CORE_STATUS_IDS)[keyof typeof CORE_STATUS_IDS] | null;
  ability?: (typeof GEN3_ABILITY_IDS)[keyof typeof GEN3_ABILITY_IDS];
  heldItem?: string | null;
  nickname?: string | null;
  speciesId?: number;
  statStages?: Partial<Record<string, number>>;
}): ActivePokemon {
  const stats: StatBlock = {
    hp: opts.hp ?? 200,
    attack: opts.attack ?? 100,
    defense: opts.defense ?? 100,
    spAttack: opts.spAttack ?? 100,
    spDefense: opts.spDefense ?? 100,
    speed: 100,
  };

  const pokemon = {
    uid: "gen3-test",
    speciesId: opts.speciesId ?? 1,
    nickname: opts.nickname === undefined ? null : opts.nickname,
    level: opts.level ?? 50,
    experience: 0,
    nature: GEN3_NATURE_IDS.hardy,
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: opts.currentHp ?? opts.hp ?? 200,
    moves: [],
    ability: opts.ability ?? "",
    abilitySlot: "normal1" as const,
    heldItem: opts.heldItem ?? null,
    status: opts.status ?? null,
    friendship: 0,
    gender: "male" as const,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: "pokeball",
    calculatedStats: stats,
  } as PokemonInstance;

  return {
    pokemon,
    teamSlot: 0,
    statStages: {
      attack: opts.statStages?.attack ?? 0,
      defense: opts.statStages?.defense ?? 0,
      spAttack: opts.statStages?.spAttack ?? 0,
      spDefense: opts.statStages?.spDefense ?? 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
    volatileStatuses: new Map(),
    types: opts.types,
    ability: opts.ability ?? "",
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    turnsOnField: 0,
    movedThisTurn: false,
    consecutiveProtects: 0,
    substituteHp: 0,
    transformed: false,
    transformedSpecies: null,
    isMega: false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    stellarBoostedTypes: [],
  } as ActivePokemon;
}

function createMove(type: PokemonType, power: number, id = GEN3_MOVE_IDS.tackle): MoveData {
  return {
    id,
    displayName: "Test Move",
    type,
    category: "physical",
    power,
    accuracy: 100,
    pp: 35,
    priority: 0,
    target: "adjacent-foe",
    flags: {
      contact: false,
      sound: false,
      bullet: false,
      pulse: false,
      punch: false,
      bite: false,
      wind: false,
      slicing: false,
      powder: false,
      protect: true,
      mirror: true,
      snatch: false,
      gravity: false,
      defrost: false,
      recharge: false,
      charge: false,
      bypassSubstitute: false,
    },
    effect: null,
    description: "",
    generation: 3,
  } as MoveData;
}

function createNeutralTypeChart(): TypeChart {
  const types: PokemonType[] = [
    CORE_TYPE_IDS.normal,
    CORE_TYPE_IDS.fire,
    CORE_TYPE_IDS.water,
    CORE_TYPE_IDS.electric,
    CORE_TYPE_IDS.grass,
    CORE_TYPE_IDS.ice,
    CORE_TYPE_IDS.fighting,
    CORE_TYPE_IDS.poison,
    CORE_TYPE_IDS.ground,
    CORE_TYPE_IDS.flying,
    CORE_TYPE_IDS.psychic,
    CORE_TYPE_IDS.bug,
    CORE_TYPE_IDS.rock,
    CORE_TYPE_IDS.ghost,
    CORE_TYPE_IDS.dragon,
    CORE_TYPE_IDS.dark,
    CORE_TYPE_IDS.steel,
  ];
  const chart = {} as Record<string, Record<string, number>>;
  for (const atk of types) {
    chart[atk] = {};
    for (const def of types) {
      (chart[atk] as Record<string, number>)[def] = 1;
    }
  }
  return chart as TypeChart;
}

function createAbilityContext(opts: {
  pokemon: ActivePokemon;
  opponent?: ActivePokemon;
  weather?: { type: string; turnsLeft: number; source: string } | null;
}): AbilityContext {
  const opponent = opts.opponent ?? createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
  return {
    pokemon: opts.pokemon,
    opponent,
    state: {
      weather: opts.weather ?? null,
      sides: [
        {
          active: [opts.pokemon],
          team: [],
          screens: {},
          hazards: [],
          tailwind: { active: false, turnsLeft: 0 },
          futureAttack: null,
          faintCount: 0,
          gimmickUsed: false,
          trainer: null,
        },
        {
          active: [opponent],
          team: [],
          screens: {},
          hazards: [],
          tailwind: { active: false, turnsLeft: 0 },
          futureAttack: null,
          faintCount: 0,
          gimmickUsed: false,
          trainer: null,
        },
      ],
      terrain: { type: null, turnsLeft: 0, source: null },
      trickRoom: { active: false, turnsLeft: 0 },
      turnNumber: 1,
      phase: "action-select" as const,
      winner: null,
      ended: false,
    } as BattleState,
    rng: createMockRng(50),
  } as AbilityContext;
}

function createDamageContext(opts: {
  attacker: ActivePokemon;
  defender: ActivePokemon;
  move: MoveData;
  isCrit?: boolean;
  rng?: ReturnType<typeof createMockRng>;
  weather?: { type: string; turnsLeft: number; source: string } | null;
}): DamageContext {
  return {
    attacker: opts.attacker,
    defender: opts.defender,
    move: opts.move,
    isCrit: opts.isCrit ?? false,
    rng: opts.rng ?? createMockRng(100),
    state: {
      weather: opts.weather ?? null,
    } as BattleState,
  } as DamageContext;
}

function createBattleStateWithWeather(
  attacker: ActivePokemon,
  defender: ActivePokemon,
  weather: { type: string; turnsLeft: number; source: string } | null,
): BattleState {
  return {
    sides: [
      {
        index: 0,
        active: [attacker],
        team: [attacker.pokemon],
        screens: { reflect: null, lightScreen: null, auroraVeil: null },
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
        trainer: null,
      },
      {
        index: 1,
        active: [defender],
        team: [defender.pokemon],
        screens: { reflect: null, lightScreen: null, auroraVeil: null },
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
        trainer: null,
      },
    ],
    weather,
    terrain: { type: null, turnsLeft: 0, source: null },
    trickRoom: { active: false, turnsLeft: 0 },
    turnNumber: 1,
    phase: "action-select" as const,
    winner: null,
    ended: false,
  } as BattleState;
}

// ═══════════════════════════════════════════════════════════════════════════
// #345 — Clear Body / White Smoke / Hyper Cutter / Keen Eye stat-drop immunity
// ═══════════════════════════════════════════════════════════════════════════

describe("Gen 3 Stat-Drop Immunity Abilities (#345)", () => {
  describe("isGen3StatDropBlocked", () => {
    // --- Clear Body ---
    it("given Clear Body, when checking any stat drop, then returns true (blocks all drops)", () => {
      // Source: pret/pokeemerald src/battle_script_commands.c:6987-6993
      //   ABILITY_CLEAR_BODY blocks all opponent-caused stat drops
      expect(isGen3StatDropBlocked(GEN3_ABILITY_IDS.clearBody, "attack")).toBe(true);
      expect(isGen3StatDropBlocked(GEN3_ABILITY_IDS.clearBody, "defense")).toBe(true);
      expect(isGen3StatDropBlocked(GEN3_ABILITY_IDS.clearBody, "spAttack")).toBe(true);
      expect(isGen3StatDropBlocked(GEN3_ABILITY_IDS.clearBody, "spDefense")).toBe(true);
      expect(isGen3StatDropBlocked(GEN3_ABILITY_IDS.clearBody, "speed")).toBe(true);
      expect(isGen3StatDropBlocked(GEN3_ABILITY_IDS.clearBody, "accuracy")).toBe(true);
    });

    // --- White Smoke ---
    it("given White Smoke, when checking any stat drop, then returns true (blocks all drops)", () => {
      // Source: pret/pokeemerald src/battle_script_commands.c:6987-6993
      //   ABILITY_WHITE_SMOKE blocks all opponent-caused stat drops (same as Clear Body)
      expect(isGen3StatDropBlocked(GEN3_ABILITY_IDS.whiteSmoke, "attack")).toBe(true);
      expect(isGen3StatDropBlocked(GEN3_ABILITY_IDS.whiteSmoke, "defense")).toBe(true);
      expect(isGen3StatDropBlocked(GEN3_ABILITY_IDS.whiteSmoke, "speed")).toBe(true);
    });

    // --- Hyper Cutter ---
    it("given Hyper Cutter, when checking Attack drop, then returns true", () => {
      // Source: pret/pokeemerald src/battle_script_commands.c:7014-7021
      //   ABILITY_HYPER_CUTTER blocks Attack drops only
      expect(isGen3StatDropBlocked(GEN3_ABILITY_IDS.hyperCutter, "attack")).toBe(true);
    });

    it("given Hyper Cutter, when checking non-Attack drop, then returns false", () => {
      // Source: pret/pokeemerald — Hyper Cutter only protects Attack
      expect(isGen3StatDropBlocked(GEN3_ABILITY_IDS.hyperCutter, "defense")).toBe(false);
      expect(isGen3StatDropBlocked(GEN3_ABILITY_IDS.hyperCutter, "speed")).toBe(false);
      expect(isGen3StatDropBlocked(GEN3_ABILITY_IDS.hyperCutter, "spAttack")).toBe(false);
    });

    // --- Keen Eye ---
    it("given Keen Eye, when checking Accuracy drop, then returns true", () => {
      // Source: pret/pokeemerald src/battle_script_commands.c:7023-7030
      //   ABILITY_KEEN_EYE blocks Accuracy drops only
      expect(isGen3StatDropBlocked(GEN3_ABILITY_IDS.keenEye, "accuracy")).toBe(true);
    });

    it("given Keen Eye, when checking non-Accuracy drop, then returns false", () => {
      // Source: pret/pokeemerald — Keen Eye only protects Accuracy
      expect(isGen3StatDropBlocked(GEN3_ABILITY_IDS.keenEye, "attack")).toBe(false);
      expect(isGen3StatDropBlocked(GEN3_ABILITY_IDS.keenEye, "defense")).toBe(false);
      expect(isGen3StatDropBlocked(GEN3_ABILITY_IDS.keenEye, "evasion")).toBe(false);
    });

    // --- No blocking ability ---
    it("given no blocking ability, when checking any stat drop, then returns false", () => {
      expect(isGen3StatDropBlocked(GEN3_ABILITY_IDS.blaze, "attack")).toBe(false);
      expect(isGen3StatDropBlocked("", "attack")).toBe(false);
    });
  });

  describe("Intimidate blocked by stat-drop immunity abilities", () => {
    it("given opponent has Clear Body, when Intimidate triggers, then Attack drop is blocked", () => {
      // Source: pret/pokeemerald src/battle_script_commands.c:4141-4145
      //   Intimidate's Attack drop is blocked by Clear Body
      const intimidator = createActivePokemon({
        types: [CORE_TYPE_IDS.normal],
        ability: GEN3_ABILITY_IDS.intimidate,
        nickname: "Mightyena",
      });
      const defender = createActivePokemon({
        types: [CORE_TYPE_IDS.steel],
        ability: GEN3_ABILITY_IDS.clearBody,
        nickname: "Metagross",
      });
      const ctx = createAbilityContext({ pokemon: intimidator, opponent: defender });

      const result = applyGen3Ability("on-switch-in", ctx);

      expect(result.activated).toBe(true);
      // Effects should be empty (no stat drop applied)
      expect(result.effects).toEqual([]);
      expect(result.messages.length).toBeGreaterThan(0);
      expect(result.messages.some((m) => m.includes("Clear Body"))).toBe(true);
    });

    it("given opponent has Hyper Cutter, when Intimidate triggers, then Attack drop is blocked", () => {
      // Source: pret/pokeemerald src/battle_script_commands.c:4141-4145
      //   Intimidate's Attack drop is also blocked by Hyper Cutter
      const intimidator = createActivePokemon({
        types: [CORE_TYPE_IDS.normal],
        ability: GEN3_ABILITY_IDS.intimidate,
        nickname: "Mightyena",
      });
      const defender = createActivePokemon({
        types: [CORE_TYPE_IDS.water],
        ability: GEN3_ABILITY_IDS.hyperCutter,
        nickname: "Kingler",
      });
      const ctx = createAbilityContext({ pokemon: intimidator, opponent: defender });

      const result = applyGen3Ability("on-switch-in", ctx);

      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([]);
      expect(result.messages.some((m) => m.includes("Hyper Cutter"))).toBe(true);
    });

    it("given opponent has White Smoke, when Intimidate triggers, then Attack drop is blocked", () => {
      // Source: pret/pokeemerald src/battle_script_commands.c:4141-4145
      const intimidator = createActivePokemon({
        types: [CORE_TYPE_IDS.normal],
        ability: GEN3_ABILITY_IDS.intimidate,
        nickname: "Mightyena",
      });
      const defender = createActivePokemon({
        types: [CORE_TYPE_IDS.fire],
        ability: GEN3_ABILITY_IDS.whiteSmoke,
        nickname: "Torkoal",
      });
      const ctx = createAbilityContext({ pokemon: intimidator, opponent: defender });

      const result = applyGen3Ability("on-switch-in", ctx);

      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([]);
      expect(result.messages.some((m) => m.includes("White Smoke"))).toBe(true);
    });

    it("given opponent has no blocking ability, when Intimidate triggers, then Attack drops normally", () => {
      // Source: pret/pokeemerald — Intimidate lowers Attack by 1 when not blocked
      const intimidator = createActivePokemon({
        types: [CORE_TYPE_IDS.normal],
        ability: GEN3_ABILITY_IDS.intimidate,
        nickname: "Mightyena",
      });
      const defender = createActivePokemon({
        types: [CORE_TYPE_IDS.normal],
        ability: GEN3_ABILITY_IDS.blaze,
        nickname: "Blaziken",
      });
      const ctx = createAbilityContext({ pokemon: intimidator, opponent: defender });

      const result = applyGen3Ability("on-switch-in", ctx);

      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([
        { effectType: "stat-change", target: "opponent", stat: "attack", stages: -1 },
      ]);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// #342 — Cloud Nine / Air Lock weather suppression
// ═══════════════════════════════════════════════════════════════════════════

describe("Gen 3 Cloud Nine / Air Lock Weather Suppression (#342)", () => {
  describe("WEATHER_SUPPRESSING_ABILITIES constant", () => {
    it("given the weather-suppressing set, when queried, then it contains Cloud Nine and Air Lock", () => {
      // Source: pret/pokeemerald src/battle_util.c — WEATHER_HAS_EFFECT macro
      expect(WEATHER_SUPPRESSING_ABILITIES.has(GEN3_ABILITY_IDS.cloudNine)).toBe(true);
      expect(WEATHER_SUPPRESSING_ABILITIES.has(GEN3_ABILITY_IDS.airLock)).toBe(true);
    });

    it("given the weather-suppressing set, when queried, then it excludes non-weather abilities", () => {
      expect(WEATHER_SUPPRESSING_ABILITIES.has(GEN3_ABILITY_IDS.drizzle)).toBe(false);
      expect(WEATHER_SUPPRESSING_ABILITIES.has(GEN3_ABILITY_IDS.drought)).toBe(false);
    });
  });

  describe("isWeatherSuppressedGen3", () => {
    it("given pokemon has Cloud Nine, when checking weather suppression, then returns true", () => {
      // Source: pret/pokeemerald src/battle_util.c — WEATHER_HAS_EFFECT
      const cloudNine = createActivePokemon({ types: [CORE_TYPE_IDS.normal], ability: GEN3_ABILITY_IDS.cloudNine });
      const normal = createActivePokemon({ types: [CORE_TYPE_IDS.normal], ability: GEN3_ABILITY_IDS.blaze });
      expect(isWeatherSuppressedGen3(cloudNine, normal)).toBe(true);
    });

    it("given opponent has Air Lock, when checking weather suppression, then returns true", () => {
      // Source: pret/pokeemerald src/battle_util.c — WEATHER_HAS_EFFECT
      const normal = createActivePokemon({ types: [CORE_TYPE_IDS.normal], ability: GEN3_ABILITY_IDS.blaze });
      const airLock = createActivePokemon({ types: [CORE_TYPE_IDS.flying], ability: GEN3_ABILITY_IDS.airLock });
      expect(isWeatherSuppressedGen3(normal, airLock)).toBe(true);
    });

    it("given neither has weather-suppressing ability, when checking, then returns false", () => {
      const a = createActivePokemon({ types: [CORE_TYPE_IDS.normal], ability: GEN3_ABILITY_IDS.blaze });
      const b = createActivePokemon({ types: [CORE_TYPE_IDS.normal], ability: GEN3_ABILITY_IDS.torrent });
      expect(isWeatherSuppressedGen3(a, b)).toBe(false);
    });

    it("given pokemon is undefined, when opponent has Cloud Nine, then returns true", () => {
      const cloudNine = createActivePokemon({ types: [CORE_TYPE_IDS.normal], ability: GEN3_ABILITY_IDS.cloudNine });
      expect(isWeatherSuppressedGen3(undefined, cloudNine)).toBe(true);
    });
  });

  describe("Weather suppression in damage calculation", () => {
    it("given attacker has Cloud Nine and rain is active, when using Water move, then no rain boost applied", () => {
      // Source: pret/pokeemerald src/battle_util.c — WEATHER_HAS_EFFECT macro
      // Rain normally boosts Water moves by 1.5x. Cloud Nine should negate this.
      //
      // Damage derivation (no weather boost):
      //   ((2*50/5+2) * 80 * 100/100) / 50 + 2 = (22*80*100/100)/50 + 2
      //   = (1760*1)/50 + 2 = 35 + 2 = 37 (base)
      //   STAB: floor(37 * 1.5) = 55
      //   Type effectiveness: 1.0 (neutral chart)
      //   Random: 100/100 = 1.0 → 55
      const attacker = createActivePokemon({
        types: [CORE_TYPE_IDS.water],
        ability: GEN3_ABILITY_IDS.cloudNine,
        attack: 100,
        level: 50,
      });
      const defender = createActivePokemon({
        types: [CORE_TYPE_IDS.normal],
        ability: "",
        defense: 100,
      });
      const move = createMove(CORE_TYPE_IDS.water, 80, GEN3_MOVE_IDS.surf);
      const rng = createMockRng(100);
      const contextNoWeather = createDamageContext({
        attacker,
        defender,
        move,
        rng,
        weather: null,
      });
      const contextRainSuppressed = createDamageContext({
        attacker,
        defender,
        move,
        rng,
        weather: { type: CORE_WEATHER_IDS.rain, turnsLeft: 5, source: GEN3_ABILITY_IDS.drizzle },
      });

      const typeChart = createNeutralTypeChart();
      const resultNoWeather = calculateGen3Damage(contextNoWeather, typeChart);
      const resultRainSuppressed = calculateGen3Damage(contextRainSuppressed, typeChart);

      // With Cloud Nine on attacker, rain should be suppressed — damage should be identical
      expect(resultRainSuppressed.damage).toBe(resultNoWeather.damage);
    });

    it("given defender has Air Lock and sun is active, when using Fire move, then no sun boost applied", () => {
      // Source: pret/pokeemerald src/battle_util.c — WEATHER_HAS_EFFECT macro
      // Sun normally boosts Fire moves by 1.5x. Air Lock should negate this.
      const attacker = createActivePokemon({
        types: [CORE_TYPE_IDS.fire],
        ability: GEN3_ABILITY_IDS.blaze,
        attack: 100,
        level: 50,
      });
      const defender = createActivePokemon({
        types: [CORE_TYPE_IDS.normal],
        ability: GEN3_ABILITY_IDS.airLock,
        defense: 100,
      });
      const move = createMove(CORE_TYPE_IDS.fire, 80, GEN3_MOVE_IDS.flamethrower);
      const rng = createMockRng(100);
      const ctxWithSun = createDamageContext({
        attacker,
        defender,
        move,
        rng,
        weather: { type: CORE_WEATHER_IDS.sun, turnsLeft: 5, source: GEN3_ABILITY_IDS.drought },
      });
      const ctxNoWeather = createDamageContext({
        attacker,
        defender,
        move,
        rng,
        weather: null,
      });

      const typeChart = createNeutralTypeChart();
      const resultSunSuppressed = calculateGen3Damage(ctxWithSun, typeChart);
      const resultNoWeather = calculateGen3Damage(ctxNoWeather, typeChart);

      // Air Lock on defender means sun is suppressed — damage identical to no weather
      expect(resultSunSuppressed.damage).toBe(resultNoWeather.damage);
    });

    it("given no weather-suppressing ability and rain active, when using Water move, then rain boost IS applied", () => {
      // Control test: confirm rain boost works when no suppression
      const attacker = createActivePokemon({
        types: [CORE_TYPE_IDS.water],
        ability: GEN3_ABILITY_IDS.torrent,
        attack: 100,
        level: 50,
      });
      const defender = createActivePokemon({
        types: [CORE_TYPE_IDS.normal],
        ability: "",
        defense: 100,
      });
      const move = createMove(CORE_TYPE_IDS.water, 80, GEN3_MOVE_IDS.surf);
      const rng = createMockRng(100);
      const ctxRain = createDamageContext({
        attacker,
        defender,
        move,
        rng,
        weather: { type: CORE_WEATHER_IDS.rain, turnsLeft: 5, source: GEN3_ABILITY_IDS.drizzle },
      });
      const ctxNoWeather = createDamageContext({
        attacker,
        defender,
        move,
        rng,
        weather: null,
      });

      const typeChart = createNeutralTypeChart();
      const resultRain = calculateGen3Damage(ctxRain, typeChart);
      const resultNoWeather = calculateGen3Damage(ctxNoWeather, typeChart);

      // Rain should boost Water damage — result should be higher
      expect(resultRain.damage).toBeGreaterThan(resultNoWeather.damage);
    });
  });

  describe("Weather suppression in weather chip damage", () => {
    it("given Cloud Nine holder on field and sandstorm active, when applying weather effects, then no chip damage", () => {
      // Source: pret/pokeemerald src/battle_util.c — WEATHER_HAS_EFFECT check
      // Cloud Nine suppresses sandstorm chip damage
      const cloudNiner = createActivePokemon({
        types: [CORE_TYPE_IDS.normal],
        ability: GEN3_ABILITY_IDS.cloudNine,
        nickname: "Golduck",
      });
      const normalMon = createActivePokemon({
        types: [CORE_TYPE_IDS.normal],
        ability: "",
        nickname: "Rattata",
      });
      const state = createBattleStateWithWeather(cloudNiner, normalMon, {
        type: CORE_WEATHER_IDS.sand,
        turnsLeft: 5,
        source: GEN3_ABILITY_IDS.sandStream,
      });

      const results = applyGen3WeatherEffects(state);

      // No chip damage should occur because Cloud Nine suppresses weather
      expect(results).toEqual([]);
    });

    it("given Air Lock holder on field and hail active, when applying weather effects, then no chip damage", () => {
      // Source: pret/pokeemerald src/battle_util.c — WEATHER_HAS_EFFECT check
      const airLocker = createActivePokemon({
        types: [CORE_TYPE_IDS.flying, CORE_TYPE_IDS.dragon],
        ability: GEN3_ABILITY_IDS.airLock,
        nickname: "Rayquaza",
      });
      const normalMon = createActivePokemon({
        types: [CORE_TYPE_IDS.fire],
        ability: "",
        nickname: "Charmander",
      });
      const state = createBattleStateWithWeather(airLocker, normalMon, {
        type: CORE_WEATHER_IDS.hail,
        turnsLeft: 5,
        source: "hail-move",
      });

      const results = applyGen3WeatherEffects(state);

      expect(results).toEqual([]);
    });

    it("given no weather-suppressing ability and sandstorm active, when applying weather effects, then chip damage occurs", () => {
      // Control: sandstorm should deal chip damage to non-immune types
      const normalMon = createActivePokemon({
        types: [CORE_TYPE_IDS.normal],
        ability: "",
        nickname: "Rattata",
        hp: 160,
      });
      const otherMon = createActivePokemon({
        types: [CORE_TYPE_IDS.fire],
        ability: "",
        nickname: "Charmander",
        hp: 160,
      });
      const state = createBattleStateWithWeather(normalMon, otherMon, {
        type: CORE_WEATHER_IDS.sand,
        turnsLeft: 5,
        source: GEN3_ABILITY_IDS.sandStream,
      });

      const results = applyGen3WeatherEffects(state);

      // Both non-immune types should take 1/16 max HP chip
      // 160 / 16 = 10
      expect(results.length).toBe(2);
      // Source: 160 HP / 16 = 10 damage per target for sandstorm chip damage.
      expect(results[0]!.damage).toBe(10);
      // Source: both non-immune battlers take the same 10 HP chip damage.
      expect(results[1]!.damage).toBe(10);
    });
  });

  describe("Weather suppression in accuracy (Thunder/Blizzard)", () => {
    const dataManager = createGen3DataManager();
    const ruleset = new Gen3Ruleset(dataManager);

    it("given attacker has Cloud Nine and rain active, when Thunder used, then normal accuracy (no auto-hit)", () => {
      // Source: pret/pokeemerald src/battle_script_commands.c — Cmd_accuracycheck
      // Thunder normally auto-hits in rain, but Cloud Nine suppresses this.
      // With Cloud Nine, Thunder uses its base 70% accuracy.
      // We use an RNG roll of 71 which would miss at 70% accuracy.
      const attacker = createActivePokemon({
        types: [CORE_TYPE_IDS.electric],
        ability: GEN3_ABILITY_IDS.cloudNine,
      });
      const defender = createActivePokemon({
        types: [CORE_TYPE_IDS.normal],
        ability: "",
      });

      const rng = createMockRng(71); // Roll 71 > 70 accuracy = miss
      const context: AccuracyContext = {
        attacker,
        defender,
        move: {
          id: GEN3_MOVE_IDS.thunder,
          accuracy: 70,
          type: CORE_TYPE_IDS.electric,
        } as MoveData,
        state: {
          weather: { type: CORE_WEATHER_IDS.rain, turnsLeft: 5, source: GEN3_ABILITY_IDS.drizzle },
        } as BattleState,
        rng,
      } as AccuracyContext;

      const hits = ruleset.doesMoveHit(context);

      // Cloud Nine suppresses rain, so Thunder uses 70% accuracy.
      // Roll of 71 > 70 means miss.
      expect(hits).toBe(false);
    });

    it("given no weather suppression and rain active, when Thunder used, then auto-hit", () => {
      // Control: Thunder should auto-hit in rain without suppression
      const attacker = createActivePokemon({
        types: [CORE_TYPE_IDS.electric],
        ability: GEN3_ABILITY_IDS.static,
      });
      const defender = createActivePokemon({
        types: [CORE_TYPE_IDS.normal],
        ability: "",
      });

      const rng = createMockRng(100); // Any roll should hit
      const context: AccuracyContext = {
        attacker,
        defender,
        move: {
          id: GEN3_MOVE_IDS.thunder,
          accuracy: 70,
          type: CORE_TYPE_IDS.electric,
        } as MoveData,
        state: {
          weather: { type: CORE_WEATHER_IDS.rain, turnsLeft: 5, source: GEN3_ABILITY_IDS.drizzle },
        } as BattleState,
        rng,
      } as AccuracyContext;

      const hits = ruleset.doesMoveHit(context);

      expect(hits).toBe(true);
    });

    it("given defender has Air Lock and sandstorm active, when Sand Veil checked, then no evasion bonus", () => {
      // Source: pret/pokeemerald src/battle_util.c — WEATHER_HAS_EFFECT
      // Sand Veil gives 0.8x accuracy in sandstorm. Air Lock suppresses this.
      // With 100% accuracy move and roll of 81, normally Sand Veil would make
      // effective accuracy 80 and a roll of 81 would miss. But with Air Lock
      // suppressing weather, Sand Veil doesn't activate and 81 <= 100 hits.
      const attacker = createActivePokemon({
        types: [CORE_TYPE_IDS.normal],
        ability: "",
      });
      const defender = createActivePokemon({
        types: [CORE_TYPE_IDS.ground],
        ability: GEN3_ABILITY_IDS.sandVeil,
      });

      const rng = createMockRng(81);
      const context: AccuracyContext = {
        attacker: { ...attacker, ability: GEN3_ABILITY_IDS.airLock } as ActivePokemon,
        defender,
        move: {
          id: GEN3_MOVE_IDS.tackle,
          accuracy: 100,
          type: CORE_TYPE_IDS.normal,
        } as MoveData,
        state: {
          weather: { type: CORE_WEATHER_IDS.sand, turnsLeft: 5, source: GEN3_ABILITY_IDS.sandStream },
        } as BattleState,
        rng,
      } as AccuracyContext;

      const hits = ruleset.doesMoveHit(context);

      // Air Lock suppresses sandstorm, so Sand Veil doesn't trigger.
      // 81 <= 100 = hit
      expect(hits).toBe(true);
    });
  });

  describe("Weather suppression in Rain Dish healing", () => {
    it("given Rain Dish holder also has Cloud Nine ally, when rain active, then Rain Dish does not heal", () => {
      // Source: pret/pokeemerald src/battle_util.c — WEATHER_HAS_EFFECT
      // If weather is suppressed, Rain Dish should not activate.
      const rainDisher = createActivePokemon({
        types: [CORE_TYPE_IDS.water],
        ability: GEN3_ABILITY_IDS.rainDish,
        nickname: "Ludicolo",
        hp: 200,
        currentHp: 150,
      });
      // The opponent has Cloud Nine which suppresses weather
      const cloudNiner = createActivePokemon({
        types: [CORE_TYPE_IDS.normal],
        ability: GEN3_ABILITY_IDS.cloudNine,
        nickname: "Golduck",
      });
      const ctx = createAbilityContext({
        pokemon: rainDisher,
        opponent: cloudNiner,
        weather: { type: CORE_WEATHER_IDS.rain, turnsLeft: 5, source: GEN3_ABILITY_IDS.drizzle },
      });

      const result = applyGen3Ability("on-turn-end", ctx);

      expect(result.activated).toBe(false);
      expect(result.effects).toEqual([]);
    });

    it("given Rain Dish holder with no weather suppression, when rain active, then heals 1/16 max HP", () => {
      // Source: pret/pokeemerald — Rain Dish heals 1/16 max HP in rain
      // 200 / 16 = 12
      const rainDisher = createActivePokemon({
        types: [CORE_TYPE_IDS.water],
        ability: GEN3_ABILITY_IDS.rainDish,
        nickname: "Ludicolo",
        hp: 200,
        currentHp: 150,
      });
      const opponent = createActivePokemon({
        types: [CORE_TYPE_IDS.normal],
        ability: "",
      });
      const ctx = createAbilityContext({
        pokemon: rainDisher,
        opponent,
        weather: { type: CORE_WEATHER_IDS.rain, turnsLeft: 5, source: GEN3_ABILITY_IDS.drizzle },
      });

      const result = applyGen3Ability("on-turn-end", ctx);

      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([{ effectType: "heal", target: "self", value: 12 }]);
    });
  });

  describe("Cloud Nine / Air Lock on-switch-in announcement", () => {
    it("given Cloud Nine holder switches in, then announces weather negation", () => {
      // Source: pret/pokeemerald src/battle_util.c — ABILITYEFFECT_ON_SWITCHIN
      const cloudNiner = createActivePokemon({
        types: [CORE_TYPE_IDS.water],
        ability: GEN3_ABILITY_IDS.cloudNine,
        nickname: "Golduck",
      });
      const ctx = createAbilityContext({ pokemon: cloudNiner });

      const result = applyGen3Ability("on-switch-in", ctx);

      expect(result.activated).toBe(true);
      expect(result.messages.some((m) => m.includes("Cloud Nine"))).toBe(true);
    });

    it("given Air Lock holder switches in, then announces weather negation", () => {
      // Source: pret/pokeemerald src/battle_util.c — ABILITYEFFECT_ON_SWITCHIN
      const airLocker = createActivePokemon({
        types: [CORE_TYPE_IDS.flying, CORE_TYPE_IDS.dragon],
        ability: GEN3_ABILITY_IDS.airLock,
        nickname: "Rayquaza",
      });
      const ctx = createAbilityContext({ pokemon: airLocker });

      const result = applyGen3Ability("on-switch-in", ctx);

      expect(result.activated).toBe(true);
      expect(result.messages.some((m) => m.includes("Air Lock"))).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// #346 — Forecast (Castform type change based on weather)
// ═══════════════════════════════════════════════════════════════════════════

describe("Gen 3 Forecast — Castform Type Change (#346)", () => {
  it("given Castform with Forecast switches in during sun, then type changes to Fire", () => {
    // Source: pret/pokeemerald src/battle_util.c — ABILITY_FORECAST / GetCastformForm
    const castform = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      ability: GEN3_ABILITY_IDS.forecast,
      speciesId: 351, // Castform's national dex number
      nickname: "Castform",
    });
    const ctx = createAbilityContext({
      pokemon: castform,
      weather: { type: CORE_WEATHER_IDS.sun, turnsLeft: 5, source: GEN3_ABILITY_IDS.drought },
    });

    const result = applyGen3Ability("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { effectType: "type-change", target: "self", types: [CORE_TYPE_IDS.fire] },
    ]);
  });

  it("given Castform with Forecast switches in during rain, then type changes to Water", () => {
    // Source: pret/pokeemerald — Forecast: Rain → Water type
    const castform = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      ability: GEN3_ABILITY_IDS.forecast,
      speciesId: 351, // Castform's national dex number
      nickname: "Castform",
    });
    const ctx = createAbilityContext({
      pokemon: castform,
      weather: { type: CORE_WEATHER_IDS.rain, turnsLeft: 5, source: GEN3_ABILITY_IDS.drizzle },
    });

    const result = applyGen3Ability("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { effectType: "type-change", target: "self", types: [CORE_TYPE_IDS.water] },
    ]);
  });

  it("given Castform with Forecast switches in during hail, then type changes to Ice", () => {
    // Source: pret/pokeemerald — Forecast: Hail → Ice type
    const castform = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      ability: GEN3_ABILITY_IDS.forecast,
      speciesId: 351, // Castform's national dex number
      nickname: "Castform",
    });
    const ctx = createAbilityContext({
      pokemon: castform,
      weather: { type: CORE_WEATHER_IDS.hail, turnsLeft: 5, source: "hail-move" },
    });

    const result = applyGen3Ability("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([{ effectType: "type-change", target: "self", types: [CORE_TYPE_IDS.ice] }]);
  });

  it("given Castform with Forecast switches in during sandstorm, then stays Normal", () => {
    // Source: pret/pokeemerald — Forecast: Sandstorm → Normal (no change)
    const castform = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      ability: GEN3_ABILITY_IDS.forecast,
      speciesId: 351, // Castform's national dex number
      nickname: "Castform",
    });
    const ctx = createAbilityContext({
      pokemon: castform,
      weather: { type: CORE_WEATHER_IDS.sand, turnsLeft: 5, source: GEN3_ABILITY_IDS.sandStream },
    });

    const result = applyGen3Ability("on-switch-in", ctx);

    // Normal → Normal = no change, not activated
    expect(result.activated).toBe(false);
  });

  it("given Castform with Forecast switches in with no weather, then stays Normal", () => {
    // Source: pret/pokeemerald — Forecast: no weather → Normal
    const castform = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      ability: GEN3_ABILITY_IDS.forecast,
      speciesId: 351, // Castform's national dex number
      nickname: "Castform",
    });
    const ctx = createAbilityContext({
      pokemon: castform,
      weather: null,
    });

    const result = applyGen3Ability("on-switch-in", ctx);

    expect(result.activated).toBe(false);
  });

  it("given Castform with Forecast and opponent has Cloud Nine, when rain active, then stays Normal", () => {
    // Source: pret/pokeemerald — Forecast respects WEATHER_HAS_EFFECT check
    // Cloud Nine suppresses weather, so Forecast treats it as no weather → Normal
    const castform = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      ability: GEN3_ABILITY_IDS.forecast,
      speciesId: 351, // Castform's national dex number
      nickname: "Castform",
    });
    const cloudNiner = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      ability: GEN3_ABILITY_IDS.cloudNine,
      nickname: "Golduck",
    });
    const ctx = createAbilityContext({
      pokemon: castform,
      opponent: cloudNiner,
      weather: { type: CORE_WEATHER_IDS.rain, turnsLeft: 5, source: GEN3_ABILITY_IDS.drizzle },
    });

    const result = applyGen3Ability("on-switch-in", ctx);

    // Weather suppressed → effective weather = null → Normal type → no change
    expect(result.activated).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// #347 — Baton Pass batonPass flag
// ═══════════════════════════════════════════════════════════════════════════

describe("Gen 3 Baton Pass batonPass flag (#347)", () => {
  const dataManager = createGen3DataManager();
  const ruleset = new Gen3Ruleset(dataManager);

  function createMoveContext(
    attacker: ActivePokemon,
    defender: ActivePokemon,
    move: MoveData,
    damageDealt = 0,
  ): MoveEffectContext {
    return {
      attacker,
      defender,
      move,
      damageDealt,
      isCrit: false,
      rng: createMockRng(50),
      state: createBattleStateWithWeather(attacker, defender, null),
    } as MoveEffectContext;
  }

  it("given Baton Pass used, when executeMoveEffect called, then result has batonPass = true", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c — Baton Pass
    // Source: Bulbapedia — "Baton Pass passes stat stage changes and certain
    //   volatile statuses (Substitute, Focus Energy, etc.) to the replacement"
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.bug], ability: GEN3_ABILITY_IDS.speedBoost });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal], ability: "" });
    const move = dataManager.getMove(GEN3_MOVE_IDS.batonPass);

    const context = createMoveContext(attacker, defender, move!);
    const result = ruleset.executeMoveEffect(context);

    expect(result.batonPass).toBe(true);
    expect(result.switchOut).toBe(true);
  });

  it("given a non-Baton-Pass switch-out move, when executeMoveEffect called, then batonPass is not true", () => {
    // Control: a generic switch-out move that is NOT baton-pass should NOT set batonPass.
    // We use a synthetic move with switch-out effect.
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.normal], ability: "" });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal], ability: "" });
    const move = {
      ...createMove(CORE_TYPE_IDS.normal, 0, GEN3_MOVE_IDS.tackle),
      category: "status" as const,
      accuracy: null,
      power: null,
      effect: { type: "switch-out", target: "self" },
    } as MoveData;

    const context = createMoveContext(attacker, defender, move);
    const result = ruleset.executeMoveEffect(context);

    expect(result.switchOut).toBe(true);
    expect(result.batonPass).not.toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// #340 — Trace: no blocklist in Gen 3 (except self-copy guard)
// ═══════════════════════════════════════════════════════════════════════════

describe("Gen 3 Trace — No Blocklist (#340)", () => {
  it("given opponent has Wonder Guard, when Trace triggers, then copies Wonder Guard", () => {
    // Source: pret/pokeemerald src/battle_util.c:3020-3060
    // In Gen 3, Trace only checks that the opponent's ability != ABILITY_NONE.
    // There is NO blocklist — Wonder Guard, Forecast, etc. are all copyable.
    // The blocklist was added in Gen 4+.
    const tracer = createActivePokemon({
      types: [CORE_TYPE_IDS.psychic],
      ability: GEN3_ABILITY_IDS.trace,
      nickname: "Gardevoir",
    });
    const opponent = createActivePokemon({
      types: [CORE_TYPE_IDS.bug, CORE_TYPE_IDS.ghost],
      ability: GEN3_ABILITY_IDS.wonderGuard,
      nickname: "Shedinja",
    });
    const ctx = createAbilityContext({ pokemon: tracer, opponent });

    const result = applyGen3Ability("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { effectType: "ability-change", target: "self", newAbility: GEN3_ABILITY_IDS.wonderGuard },
    ]);
  });

  it("given opponent has Forecast, when Trace triggers, then copies Forecast", () => {
    // Source: pret/pokeemerald — no blocklist in Gen 3
    const tracer = createActivePokemon({
      types: [CORE_TYPE_IDS.psychic],
      ability: GEN3_ABILITY_IDS.trace,
      nickname: "Gardevoir",
    });
    const opponent = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      ability: GEN3_ABILITY_IDS.forecast,
      speciesId: 351, // Castform's national dex number
      nickname: "Castform",
    });
    const ctx = createAbilityContext({ pokemon: tracer, opponent });

    const result = applyGen3Ability("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { effectType: "ability-change", target: "self", newAbility: GEN3_ABILITY_IDS.forecast },
    ]);
  });

  it("given opponent has Trace, when Trace triggers, then does NOT copy (self-copy guard)", () => {
    // Source: pret/pokeemerald — only check is ability != ABILITY_NONE and != ABILITY_TRACE
    // (implementation guard to prevent infinite loop)
    const tracer = createActivePokemon({
      types: [CORE_TYPE_IDS.psychic],
      ability: GEN3_ABILITY_IDS.trace,
      nickname: "Gardevoir",
    });
    const opponent = createActivePokemon({
      types: [CORE_TYPE_IDS.psychic],
      ability: GEN3_ABILITY_IDS.trace,
      nickname: "Alakazam",
    });
    const ctx = createAbilityContext({ pokemon: tracer, opponent });

    const result = applyGen3Ability("on-switch-in", ctx);

    expect(result.activated).toBe(false);
  });

  it("given opponent has no ability, when Trace triggers, then does not activate", () => {
    // Source: pret/pokeemerald — Trace requires opponent to have a non-empty ability
    const tracer = createActivePokemon({
      types: [CORE_TYPE_IDS.psychic],
      ability: GEN3_ABILITY_IDS.trace,
      nickname: "Gardevoir",
    });
    const opponent = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      ability: "",
      nickname: "Ditto",
    });
    const ctx = createAbilityContext({ pokemon: tracer, opponent });

    const result = applyGen3Ability("on-switch-in", ctx);

    expect(result.activated).toBe(false);
  });
});
