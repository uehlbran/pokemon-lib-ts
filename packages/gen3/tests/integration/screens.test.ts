import type {
  ActivePokemon,
  BattleState,
  DamageContext,
  MoveEffectContext,
} from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType, StatBlock } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen3DataManager } from "../../src/data";
import { calculateGen3Damage } from "../../src/Gen3DamageCalc";
import { Gen3Ruleset } from "../../src/Gen3Ruleset";
import { GEN3_TYPE_CHART } from "../../src/Gen3TypeChart";

/**
 * Gen 3 Reflect / Light Screen Tests
 *
 * Tests screen effects in both move effect execution (returning screenSet)
 * and damage calculation (halving damage on non-crit).
 *
 * Source: pret/pokeemerald src/pokemon.c:3266-3273 (Reflect) / 3317-3324 (Light Screen)
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
  types: PokemonType[];
  attack?: number;
  defense?: number;
  spAttack?: number;
  spDefense?: number;
  level?: number;
  status?: string | null;
  heldItem?: string | null;
  nickname?: string | null;
  ability?: string;
}): ActivePokemon {
  const stats: StatBlock = {
    hp: 200,
    attack: opts.attack ?? 100,
    defense: opts.defense ?? 100,
    spAttack: opts.spAttack ?? 100,
    spDefense: opts.spDefense ?? 100,
    speed: 100,
  };

  const pokemon = {
    uid: "test-mon",
    speciesId: 1,
    nickname: opts.nickname ?? null,
    level: opts.level ?? 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: 200,
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
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
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
    lastDamageCategory: null,
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

function createMove(
  type: PokemonType,
  power: number,
  id = "test-move",
  overrides?: Partial<MoveData>,
): MoveData {
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
    ...overrides,
  } as MoveData;
}

function createBattleStateWithScreens(
  attacker: ActivePokemon,
  defender: ActivePokemon,
  defenderScreens: Array<{ type: "reflect" | "light-screen"; turnsLeft: number }>,
): BattleState {
  return {
    sides: [
      {
        active: [attacker],
        team: [attacker.pokemon],
        screens: [],
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
        trainer: null,
      },
      {
        active: [defender],
        team: [defender.pokemon],
        screens: defenderScreens,
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
        trainer: null,
      },
    ],
    weather: null,
    terrain: { type: null, turnsLeft: 0, source: null },
    trickRoom: { active: false, turnsLeft: 0 },
    turnNumber: 1,
    phase: "action-select" as const,
    winner: null,
    ended: false,
  } as BattleState;
}

function createMoveEffectContext(
  attacker: ActivePokemon,
  defender: ActivePokemon,
  move: MoveData,
): MoveEffectContext {
  return {
    attacker,
    defender,
    move,
    damage: 0,
    state: {
      sides: [
        {
          active: [attacker],
          team: [attacker.pokemon],
          screens: [],
          hazards: [],
          tailwind: { active: false, turnsLeft: 0 },
          futureAttack: null,
          faintCount: 0,
          gimmickUsed: false,
          trainer: null,
        },
        {
          active: [defender],
          team: [defender.pokemon],
          screens: [],
          hazards: [],
          tailwind: { active: false, turnsLeft: 0 },
          futureAttack: null,
          faintCount: 0,
          gimmickUsed: false,
          trainer: null,
        },
      ],
      weather: null,
      terrain: { type: null, turnsLeft: 0, source: null },
      trickRoom: { active: false, turnsLeft: 0 },
      turnNumber: 1,
      phase: "action-select" as const,
      winner: null,
      ended: false,
    } as BattleState,
    rng: createMockRng(0),
  } as MoveEffectContext;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const dataManager = createGen3DataManager();
const ruleset = new Gen3Ruleset(dataManager);

describe("Gen 3 Screens — Damage Calc", () => {
  // ─── Reflect ───

  it("given Reflect on defender side, when physical move hits non-crit, then damage is halved", () => {
    // Source: pret/pokeemerald src/pokemon.c:3266-3273
    // "if (!criticalHit && HasReflect(defender)) damage /= 2"
    //
    // Setup: L50, 100 Atk vs 100 Def, 80 BP Normal physical, max random roll (100)
    // Base: floor(floor(floor(22 * 80 * 100 / 100) / 50) + 2 = floor(35.2) + 2 = 37
    // Without screen: no halving
    // With screen: floor(35 / 2) + 2 = 17 + 2 = 19... no wait, screen applied after burn,
    // before +2. Let me trace:
    //   levelFactor = floor(2*50/5) + 2 = 22
    //   baseDamage = floor(floor(22 * 80 * 100 / 100) / 50) = floor(1760 / 100 / 50)
    //             = floor(floor(176000/100)/50) = floor(1760/50) = floor(35.2) = 35
    //   After burn: 35 (no burn)
    //   After screen: floor(35/2) = 17
    //   After weather: 17 (no weather)
    //   +2: 19
    //   After crit: 19 (no crit)
    //   Random: floor(19 * 100/100) = 19
    //   STAB: 19 (no STAB)
    //   Type: 19 * 1 = 19
    //
    // Without screen:
    //   baseDamage = 35, +2 = 37, random = 37, final = 37
    // Use fighting type attacker to avoid STAB on Normal move
    const attacker = createActivePokemon({ types: ["fighting"], attack: 100 });
    const defender = createActivePokemon({ types: ["fighting"], defense: 100 });
    const move = createMove("normal", 80);
    const rng = createMockRng(100); // max random roll

    // Without Reflect
    const stateNoScreen = createBattleStateWithScreens(attacker, defender, []);
    const ctxNoScreen: DamageContext = {
      attacker,
      defender,
      move,
      isCrit: false,
      rng,
      state: stateNoScreen,
    } as DamageContext;
    const resultNoScreen = calculateGen3Damage(ctxNoScreen, GEN3_TYPE_CHART);

    // With Reflect
    const stateWithScreen = createBattleStateWithScreens(attacker, defender, [
      { type: "reflect", turnsLeft: 5 },
    ]);
    const ctxWithScreen: DamageContext = {
      attacker,
      defender,
      move,
      isCrit: false,
      rng,
      state: stateWithScreen,
    } as DamageContext;
    const resultWithScreen = calculateGen3Damage(ctxWithScreen, GEN3_TYPE_CHART);

    // Source: manual formula trace
    // L50, 100 Atk vs 100 Def, 80 BP Normal, fighting attacker (no STAB), max roll
    // base = floor(floor(22 * 80 * 100 / 100) / 50) = 35
    // Without screen: 35, +2=37, random=37, STAB=1x, final=37
    // With screen: floor(35/2)=17, +2=19, random=19, STAB=1x, final=19
    expect(resultNoScreen.damage).toBe(37);
    expect(resultWithScreen.damage).toBe(19);
  });

  it("given Reflect on defender side with different stats, when physical move hits, then damage halved consistently", () => {
    // Source: pret/pokeemerald src/pokemon.c:3266-3273
    // Triangulation: L50, 150 Atk vs 80 Def, 100 BP Normal, max roll
    //   levelFactor = 22
    //   baseDamage = floor(floor(22 * 100 * 150 / 80) / 50) = floor(floor(330000/80)/50)
    //             = floor(4125/50) = floor(82.5) = 82
    //   No screen: 82 + 2 = 84, * 1.0 = 84
    //   Screen: floor(82/2)=41, 41+2=43, * 1.0 = 43
    // Use fighting type attacker to avoid STAB on Normal move
    const attacker = createActivePokemon({ types: ["fighting"], attack: 150 });
    const defender = createActivePokemon({ types: ["fighting"], defense: 80 });
    const move = createMove("normal", 100);
    const rng = createMockRng(100);

    const stateNoScreen = createBattleStateWithScreens(attacker, defender, []);
    const resultNoScreen = calculateGen3Damage(
      { attacker, defender, move, isCrit: false, rng, state: stateNoScreen } as DamageContext,
      GEN3_TYPE_CHART,
    );

    const stateWithScreen = createBattleStateWithScreens(attacker, defender, [
      { type: "reflect", turnsLeft: 3 },
    ]);
    const resultWithScreen = calculateGen3Damage(
      { attacker, defender, move, isCrit: false, rng, state: stateWithScreen } as DamageContext,
      GEN3_TYPE_CHART,
    );

    // Source: formula trace above
    expect(resultNoScreen.damage).toBe(84);
    expect(resultWithScreen.damage).toBe(43);
  });

  it("given Reflect on defender side, when physical move is a critical hit, then screen is bypassed", () => {
    // Source: pret/pokeemerald src/pokemon.c:3266-3273
    // "if (!criticalHit && HasReflect(defender)) damage /= 2"
    // On crit: no screen reduction, and crit = 2x multiplier applied after +2
    //
    // L50, 100 Atk vs 100 Def, 80 BP Normal, crit, max roll
    //   base = 35, no screen (crit bypasses), +2 = 37
    //   crit: 37 * 2 = 74
    //   random: 74 * 100/100 = 74
    //   No STAB (fighting using normal), neutral type = 74
    const attacker = createActivePokemon({ types: ["fighting"], attack: 100 });
    const defender = createActivePokemon({ types: ["fighting"], defense: 100 });
    const move = createMove("normal", 80);
    const rng = createMockRng(100);

    const stateWithScreen = createBattleStateWithScreens(attacker, defender, [
      { type: "reflect", turnsLeft: 5 },
    ]);
    const ctxCrit: DamageContext = {
      attacker,
      defender,
      move,
      isCrit: true,
      rng,
      state: stateWithScreen,
    } as DamageContext;
    const result = calculateGen3Damage(ctxCrit, GEN3_TYPE_CHART);

    // With screen + crit: crit bypasses screen, so base = 35, +2 = 37, *2 = 74
    // Source: pret/pokeemerald — crits bypass screens
    expect(result.damage).toBe(74);
    expect(result.isCrit).toBe(true);
  });

  // ─── Light Screen ───

  it("given Light Screen on defender side, when special move hits non-crit, then damage is halved", () => {
    // Source: pret/pokeemerald src/pokemon.c:3317-3324
    // Special in Gen 3 determined by type. Fire = special.
    // L50, 100 SpAtk vs 100 SpDef, 80 BP Fire, max roll, neutral chart
    //   base = floor(floor(22 * 80 * 100 / 100) / 50) = 35
    //   No screen: 35 + 2 = 37
    //   Screen: floor(35/2) = 17, 17 + 2 = 19
    // Use normal type attacker to avoid STAB on Fire move
    const attacker = createActivePokemon({ types: ["normal"], spAttack: 100 });
    const defender = createActivePokemon({ types: ["fighting"], spDefense: 100 });
    const move = createMove("fire", 80); // Fire = special in Gen 3
    const rng = createMockRng(100);

    const stateNoScreen = createBattleStateWithScreens(attacker, defender, []);
    const resultNoScreen = calculateGen3Damage(
      { attacker, defender, move, isCrit: false, rng, state: stateNoScreen } as DamageContext,
      GEN3_TYPE_CHART,
    );

    const stateWithScreen = createBattleStateWithScreens(attacker, defender, [
      { type: "light-screen", turnsLeft: 5 },
    ]);
    const resultWithScreen = calculateGen3Damage(
      { attacker, defender, move, isCrit: false, rng, state: stateWithScreen } as DamageContext,
      GEN3_TYPE_CHART,
    );

    // Source: formula trace — fire is special in Gen 3, normal attacker = no STAB
    // base = 35, no screen = 37, with screen = 19
    expect(resultNoScreen.damage).toBe(37);
    expect(resultWithScreen.damage).toBe(19);
  });

  it("given Reflect on defender side, when special move hits, then Reflect does not apply", () => {
    // Source: pret/pokeemerald — Reflect only affects physical moves, Light Screen only special
    // Fire = special in Gen 3, so Reflect should have no effect.
    // Use normal type attacker to avoid STAB on Fire move
    const attacker = createActivePokemon({ types: ["normal"], spAttack: 100 });
    const defender = createActivePokemon({ types: ["fighting"], spDefense: 100 });
    const move = createMove("fire", 80);
    const rng = createMockRng(100);

    const stateWithReflect = createBattleStateWithScreens(attacker, defender, [
      { type: "reflect", turnsLeft: 5 },
    ]);
    const result = calculateGen3Damage(
      { attacker, defender, move, isCrit: false, rng, state: stateWithReflect } as DamageContext,
      GEN3_TYPE_CHART,
    );

    // Reflect doesn't affect special moves, so damage = 37 (same as no screen)
    // Source: pret/pokeemerald — Reflect is physical only
    expect(result.damage).toBe(37);
  });

  it("given Light Screen on defender side, when physical move hits, then Light Screen does not apply", () => {
    // Source: pret/pokeemerald — Light Screen only affects special moves
    // Normal = physical in Gen 3, so Light Screen should have no effect.
    // Use fighting type attacker to avoid STAB on Normal move
    const attacker = createActivePokemon({ types: ["fighting"], attack: 100 });
    const defender = createActivePokemon({ types: ["fighting"], defense: 100 });
    const move = createMove("normal", 80);
    const rng = createMockRng(100);

    const stateWithLS = createBattleStateWithScreens(attacker, defender, [
      { type: "light-screen", turnsLeft: 5 },
    ]);
    const result = calculateGen3Damage(
      { attacker, defender, move, isCrit: false, rng, state: stateWithLS } as DamageContext,
      GEN3_TYPE_CHART,
    );

    // Light Screen doesn't affect physical moves, so damage = 37 (same as no screen)
    // Source: pret/pokeemerald — Light Screen is special only
    expect(result.damage).toBe(37);
  });
});

describe("Gen 3 Screens — Move Effects", () => {
  it("given Reflect used, when executeMoveEffect is called, then returns screenSet with screen 'reflect' and 5 turns", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c — Reflect sets 5-turn screen
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("reflect");
    const context = createMoveEffectContext(attacker, defender, move);

    const result = ruleset.executeMoveEffect(context);

    expect(result.screenSet).toEqual({
      screen: "reflect",
      turnsLeft: 5,
      side: "attacker",
    });
  });

  it("given Light Screen used, when executeMoveEffect is called, then returns screenSet with screen 'light-screen' and 5 turns", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c — Light Screen sets 5-turn screen
    const attacker = createActivePokemon({ types: ["psychic"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("light-screen");
    const context = createMoveEffectContext(attacker, defender, move);

    const result = ruleset.executeMoveEffect(context);

    expect(result.screenSet).toEqual({
      screen: "light-screen",
      turnsLeft: 5,
      side: "attacker",
    });
  });
});
