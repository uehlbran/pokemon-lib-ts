import type {
  ActivePokemon,
  BattleState,
  DamageContext,
  MoveEffectContext,
} from "@pokemon-lib-ts/battle";
import type {
  MoveData,
  PokemonInstance,
  PokemonType,
  ScreenType,
  StatBlock,
  TypeChart,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { calculateGen2Damage } from "../src/Gen2DamageCalc";
import { applyMoveEffect, handleCustomEffect, type MutableResult } from "../src/Gen2MoveEffects";
import { Gen2Ruleset } from "../src/Gen2Ruleset";
import { canInflictGen2Status } from "../src/Gen2Status";

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

/** A mock RNG whose int() always returns a fixed value. */
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

/** Minimal ActivePokemon mock. */
function createActivePokemon(opts: {
  level: number;
  attack: number;
  defense: number;
  spAttack: number;
  spDefense: number;
  types: PokemonType[];
  status?: "burn" | "paralysis" | "sleep" | "poison" | "freeze" | null;
  heldItem?: string | null;
  statStages?: Partial<Record<string, number>>;
  speciesId?: number;
  nickname?: string | null;
}): ActivePokemon {
  const stats: StatBlock = {
    hp: 200,
    attack: opts.attack,
    defense: opts.defense,
    spAttack: opts.spAttack,
    spDefense: opts.spDefense,
    speed: 100,
  };

  const pokemon = {
    uid: "test",
    speciesId: opts.speciesId ?? 1,
    nickname: opts.nickname ?? null,
    level: opts.level,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: 200,
    moves: [],
    ability: "",
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
      hp: 0,
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
    ability: "",
    lastMoveUsed: null,
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

/** Create a move mock with the given type and power. */
function createMove(
  type: PokemonType,
  power: number,
  category: "physical" | "special" | "status" = "physical",
  opts?: { id?: string },
): MoveData {
  return {
    id: opts?.id ?? "test-move",
    displayName: "Test Move",
    type,
    category,
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
    generation: 2,
  } as MoveData;
}

/** All-neutral type chart for 17 Gen 2 types. */
function createNeutralTypeChart(): TypeChart {
  const types: PokemonType[] = [
    "normal",
    "fire",
    "water",
    "electric",
    "grass",
    "ice",
    "fighting",
    "poison",
    "ground",
    "flying",
    "psychic",
    "bug",
    "rock",
    "ghost",
    "dragon",
    "dark",
    "steel",
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

/** Minimal species data mock. */
function createSpecies(types: PokemonType[] = ["normal"]) {
  return {
    id: 1,
    name: "test",
    displayName: "Test",
    types,
    baseStats: { hp: 100, attack: 100, defense: 100, spAttack: 100, spDefense: 100, speed: 100 },
    abilities: { normal: [""], hidden: null },
    genderRatio: 50,
    catchRate: 45,
    baseExp: 64,
    expGroup: "medium-slow",
    evYield: {},
    eggGroups: ["monster"],
    learnset: { levelUp: [], tm: [], egg: [], tutor: [] },
    evolution: null,
    dimensions: { height: 1, weight: 10 },
    spriteKey: "test",
    baseFriendship: 70,
    generation: 2,
    isLegendary: false,
    isMythical: false,
  };
}

/**
 * Create a BattleState mock with sides that include screens.
 *
 * @param defender - The defender ActivePokemon to include in side 1
 * @param screens - Screens to set on the defender's side
 * @param weather - Optional weather
 */
function createMockStateWithSides(
  attacker: ActivePokemon,
  defender: ActivePokemon,
  screens: Array<{ type: ScreenType; turnsLeft: number }> = [],
  weather?: { type: string; turnsLeft: number; source: string } | null,
): BattleState {
  return {
    weather: weather ?? null,
    sides: [
      {
        active: [attacker],
        team: [],
        hazards: [],
        screens: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
      },
      {
        active: [defender],
        team: [],
        hazards: [],
        screens,
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
      },
    ],
  } as unknown as BattleState;
}

/** Create a fresh MutableResult for effect testing. */
function createEmptyResult(): MutableResult {
  return {
    statusInflicted: null,
    volatileInflicted: null,
    statChanges: [],
    recoilDamage: 0,
    healAmount: 0,
    switchOut: false,
    messages: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Gen 2 Screens and Safeguard", () => {
  // -------------------------------------------------------------------
  // Reflect / Light Screen in Damage Calc
  // -------------------------------------------------------------------

  describe("Reflect and Light Screen in damage calc", () => {
    it("given defender's side has Reflect, when a physical move hits (non-crit), then damage is halved", () => {
      // Source: pret/pokecrystal engine/battle/core.asm BattleCalcDamage
      // Reflect halves physical damage. With max roll (255), neutral type chart,
      // L50, 100 Atk vs 100 Def, 80 BP, attacker is Fighting-type using Normal move (no STAB):
      //   Step 1: floor(floor(22 * 80 * 100) / 100 / 50) = floor(1760 / 50) = 35
      //   Step 5: +2 = 37
      //   (No STAB because Fighting attacker using Normal move)
      //   Step 9 (max roll): floor(37 * 255/255) = 37
      // With Reflect:
      //   Step 8.5: floor(37 / 2) = 18
      //   Step 9 (max roll): floor(18 * 255/255) = 18
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["fighting"], // NOT Normal — avoids STAB
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const move = createMove("normal", 80);
      const typeChart = createNeutralTypeChart();
      const species = createSpecies(["fighting"]);
      const rng = createMockRng(255); // max roll

      // Without Reflect
      const stateNoScreen = createMockStateWithSides(attacker, defender, []);
      const ctxNoScreen: DamageContext = {
        attacker,
        defender,
        move,
        state: stateNoScreen,
        rng,
        isCrit: false,
      };
      const noScreenResult = calculateGen2Damage(ctxNoScreen, typeChart, species as any);

      // With Reflect
      const stateWithReflect = createMockStateWithSides(attacker, defender, [
        { type: "reflect", turnsLeft: 5 },
      ]);
      const ctxWithReflect: DamageContext = {
        attacker,
        defender,
        move,
        state: stateWithReflect,
        rng: createMockRng(255),
        isCrit: false,
      };
      const reflectResult = calculateGen2Damage(ctxWithReflect, typeChart, species as any);

      // Source: pret/pokecrystal engine/battle/effect_commands.asm:2553-2557 — Reflect doubles
      // defense stat (sla c; rl b), not halves damage. Defense-doubling produces different
      // results from damage-halving due to intermediate floor truncation.
      // Without screen: levelFactor=22, base=floor(floor(22*80*100/100)/50)=35, +2=37
      // With Reflect (def=200): base=floor(floor(22*80*100/200)/50)=floor(880/50)=17, +2=19
      expect(noScreenResult.damage).toBe(37);
      expect(reflectResult.damage).toBe(19);
    });

    it("given defender's side has Light Screen, when a special move hits (non-crit), then damage is halved", () => {
      // Source: pret/pokecrystal engine/battle/core.asm BattleCalcDamage
      // Light Screen halves special damage. Psychic type is special in Gen 2.
      // Same formula as above but with special stats.
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["psychic"],
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const move = createMove("psychic", 80, "special");
      const typeChart = createNeutralTypeChart();
      const species = createSpecies(["psychic"]);
      const rng = createMockRng(255);

      // Without Light Screen
      const stateNoScreen = createMockStateWithSides(attacker, defender, []);
      const ctxNoScreen: DamageContext = {
        attacker,
        defender,
        move,
        state: stateNoScreen,
        rng,
        isCrit: false,
      };
      const noScreenResult = calculateGen2Damage(ctxNoScreen, typeChart, species as any);

      // With Light Screen
      const stateWithLS = createMockStateWithSides(attacker, defender, [
        { type: "light-screen", turnsLeft: 5 },
      ]);
      const ctxWithLS: DamageContext = {
        attacker,
        defender,
        move,
        state: stateWithLS,
        rng: createMockRng(255),
        isCrit: false,
      };
      const lsResult = calculateGen2Damage(ctxWithLS, typeChart, species as any);

      // Source: pret/pokecrystal engine/battle/effect_commands.asm:2577-2581 — Light Screen
      // doubles SpDef stat (sla c; rl b), not halves damage.
      // Without screen: base=35, +2=37, STAB: floor(37*1.5)=55
      // With Light Screen (spDef=200): base=floor(floor(22*80*100/200)/50)=17, +2=19,
      //   STAB: floor(19*1.5)=28
      expect(noScreenResult.damage).toBe(55);
      expect(lsResult.damage).toBe(28);
    });

    it("given defender's side has Reflect, when a critical hit lands, then screens are bypassed", () => {
      // Source: pret/pokecrystal engine/battle/core.asm BattleCalcDamage
      // Critical hits bypass Reflect/Light Screen in Gen 2
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const move = createMove("normal", 80);
      const typeChart = createNeutralTypeChart();
      const species = createSpecies(["normal"]);
      const rng = createMockRng(255);

      // Crit WITH Reflect — screens should be bypassed
      const stateWithReflect = createMockStateWithSides(attacker, defender, [
        { type: "reflect", turnsLeft: 5 },
      ]);
      const ctxCritReflect: DamageContext = {
        attacker,
        defender,
        move,
        state: stateWithReflect,
        rng,
        isCrit: true,
      };
      const critWithReflect = calculateGen2Damage(ctxCritReflect, typeChart, species as any);

      // Crit without Reflect
      const stateNoScreen = createMockStateWithSides(attacker, defender, []);
      const ctxCritNoScreen: DamageContext = {
        attacker,
        defender,
        move,
        state: stateNoScreen,
        rng: createMockRng(255),
        isCrit: true,
      };
      const critNoScreen = calculateGen2Damage(ctxCritNoScreen, typeChart, species as any);

      // Source: crits bypass screens, so damage should be identical
      expect(critWithReflect.damage).toBe(critNoScreen.damage);
    });

    it("given defender's side has Light Screen, when a critical special hit lands, then screens are bypassed", () => {
      // Source: pret/pokecrystal engine/battle/core.asm BattleCalcDamage
      // Critical hits bypass Light Screen in Gen 2
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["water"],
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const move = createMove("water", 80, "special");
      const typeChart = createNeutralTypeChart();
      const species = createSpecies(["water"]);
      const rng = createMockRng(255);

      // Crit WITH Light Screen — screens should be bypassed
      const stateWithLS = createMockStateWithSides(attacker, defender, [
        { type: "light-screen", turnsLeft: 5 },
      ]);
      const ctxCritLS: DamageContext = {
        attacker,
        defender,
        move,
        state: stateWithLS,
        rng,
        isCrit: true,
      };
      const critWithLS = calculateGen2Damage(ctxCritLS, typeChart, species as any);

      // Crit without Light Screen
      const stateNoScreen = createMockStateWithSides(attacker, defender, []);
      const ctxCritNoScreen: DamageContext = {
        attacker,
        defender,
        move,
        state: stateNoScreen,
        rng: createMockRng(255),
        isCrit: true,
      };
      const critNoScreen = calculateGen2Damage(ctxCritNoScreen, typeChart, species as any);

      // Source: crits bypass screens, damage should be identical
      expect(critWithLS.damage).toBe(critNoScreen.damage);
    });

    it("given Reflect is active, when a special move hits, then Reflect does not affect it", () => {
      // Source: pret/pokecrystal — Reflect only halves physical damage, not special
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["psychic"],
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      // Psychic is special in Gen 2
      const move = createMove("psychic", 80, "special");
      const typeChart = createNeutralTypeChart();
      const species = createSpecies(["psychic"]);

      // With Reflect (should not affect special moves)
      const stateWithReflect = createMockStateWithSides(attacker, defender, [
        { type: "reflect", turnsLeft: 5 },
      ]);
      const ctxReflect: DamageContext = {
        attacker,
        defender,
        move,
        state: stateWithReflect,
        rng: createMockRng(255),
        isCrit: false,
      };
      const reflectResult = calculateGen2Damage(ctxReflect, typeChart, species as any);

      // Without Reflect
      const stateNoScreen = createMockStateWithSides(attacker, defender, []);
      const ctxNoScreen: DamageContext = {
        attacker,
        defender,
        move,
        state: stateNoScreen,
        rng: createMockRng(255),
        isCrit: false,
      };
      const noScreenResult = calculateGen2Damage(ctxNoScreen, typeChart, species as any);

      // Source: Reflect only affects physical — damage should be identical
      expect(reflectResult.damage).toBe(noScreenResult.damage);
    });
  });

  // -------------------------------------------------------------------
  // Safeguard prevents status infliction
  // -------------------------------------------------------------------

  describe("Safeguard prevents status infliction", () => {
    it("given Safeguard is active on defender's side, when burn is attempted, then it is blocked", () => {
      // Source: pret/pokecrystal engine/battle/effect_commands.asm CheckSafeguard
      // Safeguard blocks all primary status conditions
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["fire"],
      });
      const state = createMockStateWithSides(attacker, defender, [
        { type: "safeguard", turnsLeft: 3 },
      ]);

      const canBurn = canInflictGen2Status("burn", defender, state);
      expect(canBurn).toBe(false);
    });

    it("given Safeguard is active on defender's side, when paralysis is attempted, then it is blocked", () => {
      // Source: pret/pokecrystal engine/battle/effect_commands.asm CheckSafeguard
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["electric"],
      });
      const state = createMockStateWithSides(attacker, defender, [
        { type: "safeguard", turnsLeft: 5 },
      ]);

      const canParalyze = canInflictGen2Status("paralysis", defender, state);
      expect(canParalyze).toBe(false);
    });

    it("given Safeguard is active on defender's side, when sleep is attempted, then it is blocked", () => {
      // Source: pret/pokecrystal engine/battle/effect_commands.asm CheckSafeguard
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["psychic"],
      });
      const state = createMockStateWithSides(attacker, defender, [
        { type: "safeguard", turnsLeft: 2 },
      ]);

      const canSleep = canInflictGen2Status("sleep", defender, state);
      expect(canSleep).toBe(false);
    });

    it("given Safeguard is active on defender's side, when poison is attempted, then it is blocked", () => {
      // Source: pret/pokecrystal engine/battle/effect_commands.asm CheckSafeguard
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["poison"],
      });
      const state = createMockStateWithSides(attacker, defender, [
        { type: "safeguard", turnsLeft: 4 },
      ]);

      const canPoison = canInflictGen2Status("poison", defender, state);
      expect(canPoison).toBe(false);
    });

    it("given no Safeguard on defender's side, when burn is attempted on a non-immune target, then it succeeds", () => {
      // Source: pret/pokecrystal — without Safeguard, normal type can be burned
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["fire"],
      });
      const state = createMockStateWithSides(attacker, defender, []);

      const canBurn = canInflictGen2Status("burn", defender, state);
      expect(canBurn).toBe(true);
    });

    it("given Safeguard is active, when stat-change effect is applied, then it is NOT blocked (Safeguard only blocks primary status)", () => {
      // Source: pret/pokecrystal — Safeguard only prevents primary status conditions
      // (burn, freeze, sleep, poison, paralysis). It does not prevent stat changes,
      // volatile statuses (confusion), or secondary effects like flinch.
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
        nickname: "Attacker",
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
        nickname: "Defender",
      });

      const stateWithSafeguard = createMockStateWithSides(attacker, defender, [
        { type: "safeguard", turnsLeft: 5 },
      ]);

      // Growl-like effect: stat-change targeting defender
      const statChangeEffect = {
        type: "stat-change" as const,
        target: "opponent" as const,
        chance: 100,
        changes: [{ stat: "attack" as const, stages: -1 }],
      };
      const move = createMove("normal", 0, "status");
      const result = createEmptyResult();
      const context: MoveEffectContext = {
        attacker,
        defender,
        move,
        damage: 0,
        state: stateWithSafeguard,
        rng: createMockRng(0),
      };

      applyMoveEffect(statChangeEffect, move, result, context);

      // Stat changes should still be applied — Safeguard does not block them
      expect(result.statChanges).toHaveLength(1);
      expect(result.statChanges[0]!.stat).toBe("attack");
      expect(result.statChanges[0]!.stages).toBe(-1);
    });
  });

  // -------------------------------------------------------------------
  // Screen move handler (applyMoveEffect for "screen" type)
  // -------------------------------------------------------------------

  describe("Screen move effect handler", () => {
    it("given a Reflect move with screen effect, when executed, then produces screenSet with turnsLeft=5 and side=attacker", () => {
      // Source: pret/pokecrystal — Reflect and Light Screen last 5 turns in Gen 2
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["psychic"],
        nickname: "Alakazam",
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
        nickname: "Snorlax",
      });
      const move = createMove("psychic", 0, "status", { id: "reflect" });
      const state = createMockStateWithSides(attacker, defender, []);
      const result = createEmptyResult();

      const screenEffect = {
        type: "screen" as const,
        screen: "reflect" as ScreenType,
        turns: 5,
      };

      applyMoveEffect(screenEffect, move, result, {
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng: createMockRng(0),
      });

      expect(result.screenSet).toEqual({
        screen: "reflect",
        turnsLeft: 5,
        side: "attacker",
      });
    });

    it("given a Light Screen move with screen effect, when executed, then produces screenSet with turnsLeft=5", () => {
      // Source: pret/pokecrystal — Light Screen lasts 5 turns in Gen 2
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["psychic"],
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const move = createMove("psychic", 0, "status", { id: "light-screen" });
      const state = createMockStateWithSides(attacker, defender, []);
      const result = createEmptyResult();

      const screenEffect = {
        type: "screen" as const,
        screen: "light-screen" as ScreenType,
        turns: 5,
      };

      applyMoveEffect(screenEffect, move, result, {
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng: createMockRng(0),
      });

      expect(result.screenSet).toEqual({
        screen: "light-screen",
        turnsLeft: 5,
        side: "attacker",
      });
    });
  });

  // -------------------------------------------------------------------
  // Safeguard move handler (handleCustomEffect for "safeguard")
  // -------------------------------------------------------------------

  describe("Safeguard move handler", () => {
    it("given the Safeguard move is used, when executed, then produces screenSet with safeguard screen and turnsLeft=5", () => {
      // Source: pret/pokecrystal engine/battle/effect_commands.asm SafeguardEffect
      // Safeguard sets a screen-like protection on the user's side for 5 turns
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
        nickname: "Blissey",
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const move = createMove("normal", 0, "status", { id: "safeguard" });
      const state = createMockStateWithSides(attacker, defender, []);
      const result = createEmptyResult();

      handleCustomEffect(move, result, {
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng: createMockRng(0),
      });

      expect(result.screenSet).toEqual({
        screen: "safeguard",
        turnsLeft: 5,
        side: "attacker",
      });
      expect(result.messages).toContain("Blissey's party is protected by Safeguard!");
    });

    it("given a different custom move, when executed, then does not set safeguard screen", () => {
      // Source: Safeguard handler should only activate for the "safeguard" move ID
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
        nickname: "Blissey",
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const move = createMove("normal", 0, "status", { id: "mean-look" });
      const state = createMockStateWithSides(attacker, defender, []);
      const result = createEmptyResult();

      handleCustomEffect(move, result, {
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng: createMockRng(0),
      });

      // Mean Look sets trapped volatile, not a screen
      expect(result.screenSet).toBeUndefined();
      expect(result.volatileInflicted).toBe("trapped");
    });

    it("given safeguard move with effect:null, when executeMoveEffect is called, then result.screenSet is populated", () => {
      // Source: pret/pokecrystal engine/battle/effect_commands.asm SafeguardEffect
      // Bug 3 fix: Safeguard has effect:null in move data, so executeMoveEffect previously
      // returned early (at the null-effect guard) before reaching handleCustomEffect.
      // This test verifies the pre-null-guard routing works end-to-end.
      const ruleset = new Gen2Ruleset();
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
        nickname: "Blissey",
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const move = createMove("normal", 0, "status", { id: "safeguard" });
      const state = createMockStateWithSides(attacker, defender, []);
      const context: MoveEffectContext = {
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng: createMockRng(0),
      };

      const result = ruleset.executeMoveEffect(context);

      expect(result.screenSet).toEqual({
        screen: "safeguard",
        turnsLeft: 5,
        side: "attacker",
      });
      expect(result.messages).toContain("Blissey's party is protected by Safeguard!");
    });

    it("given mean-look move with effect:null, when executeMoveEffect is called, then result.volatileInflicted is trapped", () => {
      // Source: pret/pokecrystal engine/battle/effect_commands.asm MeanLookEffect
      // Mean Look and Spider Web have effect:null in move data and were silently broken
      // (same root cause as Bug 3). This test verifies the pre-null-guard routing fixes them.
      const ruleset = new Gen2Ruleset();
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const move = createMove("normal", 0, "status", { id: "mean-look" });
      const state = createMockStateWithSides(attacker, defender, []);
      const context: MoveEffectContext = {
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng: createMockRng(0),
      };

      const result = ruleset.executeMoveEffect(context);

      expect(result.volatileInflicted).toBe("trapped");
    });
  });
});
