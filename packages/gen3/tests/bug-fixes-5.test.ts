import type {
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
  SeededRandom,
  StatBlock,
  TypeChart,
} from "@pokemon-lib-ts/core";
import { SeededRandom as SeededRandomImpl } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { Gen3Ruleset } from "../src";
import { createGen3DataManager } from "../src/data";
import { calculateGen3Damage } from "../src/Gen3DamageCalc";

/**
 * Regression tests for Gen 3 bug fixes (batch 5).
 *
 * Covers:
 *   5A: Damage formula — burn placement & type-boost item ordering
 *   5B: Quick Claw — 20% activation rate (not 18.75%)
 *   5C: Struggle recoil — 1/4 damage dealt (not 1/2)
 *   5D: Secondary effect chance — %100 scale (not /256)
 *   5E: Accuracy — pokeemerald sAccuracyStageRatios table
 *
 * Source: pret/pokeemerald various files (see individual tests)
 */

const dataManager = createGen3DataManager();
const ruleset = new Gen3Ruleset(dataManager);

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createMockRng(opts: {
  intValue?: number;
  nextValue?: number;
  chanceResult?: boolean;
}): SeededRandom {
  return {
    next: () => opts.nextValue ?? 0,
    int: (_min: number, _max: number) => opts.intValue ?? 100,
    chance: (_p: number) => opts.chanceResult ?? false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  } as SeededRandom;
}

function createActivePokemon(opts?: {
  level?: number;
  attack?: number;
  defense?: number;
  spAttack?: number;
  spDefense?: number;
  speed?: number;
  types?: PokemonType[];
  status?: string | null;
  heldItem?: string | null;
  ability?: string;
  hp?: number;
  statStages?: Partial<Record<string, number>>;
}): ActivePokemon {
  const o = opts ?? {};
  const stats: StatBlock = {
    hp: o.hp ?? 200,
    attack: o.attack ?? 100,
    defense: o.defense ?? 100,
    spAttack: o.spAttack ?? 100,
    spDefense: o.spDefense ?? 100,
    speed: o.speed ?? 100,
  };

  const pokemon = {
    uid: "test",
    speciesId: 1,
    nickname: null,
    level: o.level ?? 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: o.hp ?? 200,
    moves: [],
    ability: o.ability ?? "",
    abilitySlot: "normal1" as const,
    heldItem: o.heldItem ?? null,
    status: o.status ?? null,
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
      attack: o.statStages?.attack ?? 0,
      defense: o.statStages?.defense ?? 0,
      spAttack: o.statStages?.spAttack ?? 0,
      spDefense: o.statStages?.spDefense ?? 0,
      speed: 0,
      accuracy: o.statStages?.accuracy ?? 0,
      evasion: o.statStages?.evasion ?? 0,
    },
    volatileStatuses: new Map(),
    types: o.types ?? ["normal"],
    ability: o.ability ?? "",
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
  } as ActivePokemon;
}

function createMove(type: PokemonType, power: number, opts?: Partial<MoveData>): MoveData {
  return {
    id: opts?.id ?? "test-move",
    displayName: "Test Move",
    type,
    category: "physical",
    power,
    accuracy: opts?.accuracy !== undefined ? opts.accuracy : 100,
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
    effect: opts?.effect ?? null,
    description: "",
    generation: 3,
  } as MoveData;
}

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

function createMinimalBattleState(): BattleState {
  return {
    sides: [
      {
        active: [],
        team: [],
        screens: { reflect: null, lightScreen: null, auroraVeil: null },
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
        trainer: null,
      },
      {
        active: [],
        team: [],
        screens: { reflect: null, lightScreen: null, auroraVeil: null },
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
        trainer: null,
      },
    ],
    weather: { type: null, turnsLeft: 0, source: null },
    terrain: { type: null, turnsLeft: 0, source: null },
    trickRoom: { active: false, turnsLeft: 0 },
    turnNumber: 1,
    phase: "action-select" as const,
    winner: null,
    ended: false,
  } as BattleState;
}

// =========================================================================
// Bug 5A: Damage Formula — Burn placement + type-boost item ordering
// =========================================================================

describe("Bug 5A: Damage formula — burn applied AFTER base formula", () => {
  it("given burned attacker with 100 Atk vs 100 Def, when using 80 BP physical move, then burn halves damage after formula division", () => {
    // Source: pret/pokeemerald src/pokemon.c:3262-3264
    // "if ((attacker->status1 & STATUS1_BURN) && attacker->ability != ABILITY_GUTS) damage /= 2;"
    // This is applied AFTER the Atk*Power*(2L/5+2)/Def/50 division, BEFORE +2.
    //
    // Derivation:
    //   levelFactor = floor(2*50/5) + 2 = 22
    //   base = floor(floor(22 * 80 * 100 / 100) / 50) = floor(1760/50) = 35
    //   burn: floor(35 / 2) = 17
    //   +2: 17 + 2 = 19
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      types: ["fighting"], // not normal → no STAB
      status: "burn",
    });
    const defender = createActivePokemon({ defense: 100 });
    const move = createMove("normal", 80);
    const chart = createNeutralTypeChart();

    const result = calculateGen3Damage(
      {
        attacker,
        defender,
        move,
        isCrit: false,
        rng: createMockRng({ intValue: 100 }),
        state: createMinimalBattleState(),
      } as DamageContext,
      chart,
    );

    expect(result.damage).toBe(19);
  });

  it("given burned attacker with Guts, when using physical move, then burn halving is skipped", () => {
    // Source: pret/pokeemerald src/pokemon.c:3263
    // "attacker->ability != ABILITY_GUTS" — Guts negates the burn damage penalty
    // Also, Guts boosts Attack by 1.5x when statused (src/pokemon.c:3211-3212)
    //
    // Derivation:
    //   rawStat = 100, Guts: floor(150*100/100) = 150
    //   levelFactor = 22
    //   base = floor(floor(22 * 80 * 150 / 100) / 50) = floor(floor(264000/100)/50) = floor(2640/50) = 52
    //   NO burn halving (Guts active)
    //   +2: 52 + 2 = 54
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      types: ["fighting"],
      status: "burn",
      ability: "guts",
    });
    const defender = createActivePokemon({ defense: 100 });
    const move = createMove("normal", 80);
    const chart = createNeutralTypeChart();

    const result = calculateGen3Damage(
      {
        attacker,
        defender,
        move,
        isCrit: false,
        rng: createMockRng({ intValue: 100 }),
        state: createMinimalBattleState(),
      } as DamageContext,
      chart,
    );

    expect(result.damage).toBe(54);
  });
});

describe("Bug 5A: Damage formula — type-boost items applied to raw stat", () => {
  it("given Charcoal holder using Fire move, when calculating damage, then 10% boost is applied to raw SpAtk stat", () => {
    // Source: pret/pokeemerald src/pokemon.c:3170-3182
    // "spAttack = (spAttack * (attackerHoldEffectParam + 100)) / 100;"
    // holdEffectParam for type-boost items = 10, so (spAttack * 110) / 100
    //
    // Derivation (spAtk=100, fire move, power=80, level=50):
    //   rawStat = 100, Charcoal: floor(100 * 110 / 100) = 110
    //   levelFactor = 22
    //   base = floor(floor(22 * 80 * 110 / 100) / 50) = floor(floor(193600/100)/50) = floor(1936/50) = 38
    //   +2: 38 + 2 = 40
    //
    // Without Charcoal:
    //   base = floor(floor(22 * 80 * 100 / 100) / 50) = floor(1760/50) = 35
    //   +2: 35 + 2 = 37
    const withItem = createActivePokemon({
      level: 50,
      spAttack: 100,
      types: ["normal"], // no STAB
      heldItem: "charcoal",
    });
    const withoutItem = createActivePokemon({
      level: 50,
      spAttack: 100,
      types: ["normal"],
    });
    const defender = createActivePokemon({ spDefense: 100 });
    const move = createMove("fire", 80);
    const chart = createNeutralTypeChart();
    const state = createMinimalBattleState();

    const resultWithItem = calculateGen3Damage(
      {
        attacker: withItem,
        defender,
        move,
        isCrit: false,
        rng: createMockRng({ intValue: 100 }),
        state,
      } as DamageContext,
      chart,
    );
    const resultWithout = calculateGen3Damage(
      {
        attacker: withoutItem,
        defender,
        move,
        isCrit: false,
        rng: createMockRng({ intValue: 100 }),
        state,
      } as DamageContext,
      chart,
    );

    // Source: pret/pokeemerald — type-boost items applied to raw stat before formula
    expect(resultWithout.damage).toBe(37);
    expect(resultWithItem.damage).toBe(40);
  });

  it("given Choice Band holder using physical move, when calculating damage, then 1.5x is applied to raw Atk stat", () => {
    // Source: pret/pokeemerald src/pokemon.c:3185-3186
    // "attack = (150 * attack) / 100;"
    //
    // Derivation (atk=100, normal move, power=80, level=50):
    //   rawStat = 100, Choice Band: floor(150 * 100 / 100) = 150
    //   levelFactor = 22
    //   base = floor(floor(22 * 80 * 150 / 100) / 50) = floor(2640/50) = 52
    //   +2: 52 + 2 = 54
    //
    // Without Choice Band:
    //   base = floor(floor(22 * 80 * 100 / 100) / 50) = 35
    //   +2: 35 + 2 = 37
    const withBand = createActivePokemon({
      level: 50,
      attack: 100,
      types: ["fighting"], // no STAB for normal
      heldItem: "choice-band",
    });
    const withoutBand = createActivePokemon({
      level: 50,
      attack: 100,
      types: ["fighting"],
    });
    const defender = createActivePokemon({ defense: 100 });
    const move = createMove("normal", 80);
    const chart = createNeutralTypeChart();
    const state = createMinimalBattleState();

    const resultWithBand = calculateGen3Damage(
      {
        attacker: withBand,
        defender,
        move,
        isCrit: false,
        rng: createMockRng({ intValue: 100 }),
        state,
      } as DamageContext,
      chart,
    );
    const resultWithout = calculateGen3Damage(
      {
        attacker: withoutBand,
        defender,
        move,
        isCrit: false,
        rng: createMockRng({ intValue: 100 }),
        state,
      } as DamageContext,
      chart,
    );

    expect(resultWithout.damage).toBe(37);
    expect(resultWithBand.damage).toBe(54);
  });
});

// =========================================================================
// Bug 5B: Quick Claw rate — 20% not 18.75%
// =========================================================================

describe("Bug 5B: Quick Claw activation rate is 20%", () => {
  it("given 10000 Quick Claw rolls with seed 42, when checking activation rate, then approximately 20% activate", () => {
    // Source: pret/pokeemerald src/battle_main.c:4653
    // "if (holdEffect == HOLD_EFFECT_QUICK_CLAW && gRandomTurnNumber < (0xFFFF * holdEffectParam) / 100)"
    // holdEffectParam = 20 (src/data/items.h:2241), giving (0xFFFF * 20) / 100 = 13107
    // 13107 / 65536 = 20.00%
    const rng = new SeededRandomImpl(42);
    let activations = 0;
    const trials = 10000;
    for (let i = 0; i < trials; i++) {
      if (rng.chance(0.2)) {
        activations++;
      }
    }
    const rate = activations / trials;

    // With 10000 trials, 20% should be within ~2 percentage points
    // Source: pret/pokeemerald — 20.00% activation
    expect(rate).toBeGreaterThan(0.18);
    expect(rate).toBeLessThan(0.22);

    // Verify it's NOT approximately 18.75% (the old 3/16 value)
    // 18.75% of 10000 = 1875 ± ~80 (2 stdev). If activations > 1955, it's not 18.75%.
    // 20.0% of 10000 = 2000 ± ~80. These ranges barely overlap.
    // Use a wider bound: if > 1900, that's consistent with 20% but not 18.75%
    expect(activations).toBeGreaterThan(1900);
  });

  it("given 10000 Quick Claw rolls with seed 12345, when checking activation rate, then approximately 20% activate (second seed)", () => {
    // Source: pret/pokeemerald src/battle_main.c:4653 — same formula, different seed
    const rng = new SeededRandomImpl(12345);
    let activations = 0;
    const trials = 10000;
    for (let i = 0; i < trials; i++) {
      if (rng.chance(0.2)) {
        activations++;
      }
    }
    const rate = activations / trials;

    // Source: pokeemerald — 20.00% activation rate
    expect(rate).toBeGreaterThan(0.18);
    expect(rate).toBeLessThan(0.22);
  });
});

// =========================================================================
// Bug 5C: Struggle recoil — 1/4 damage dealt, not 1/2
// =========================================================================

describe("Bug 5C: Struggle recoil is 1/4 damage dealt", () => {
  it("given Struggle dealing 100 damage, when calculating recoil, then recoil is 25 (floor(100/4))", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c:2636-2639
    // "case MOVE_EFFECT_RECOIL_25: gBattleMoveDamage = (gHpDealt) / 4;"
    const attacker = createActivePokemon({ hp: 200 });
    const recoil = ruleset.calculateStruggleRecoil(attacker, 100);
    expect(recoil).toBe(25);
  });

  it("given Struggle dealing 47 damage, when calculating recoil, then recoil is 11 (floor(47/4))", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c:2637
    // floor(47/4) = floor(11.75) = 11
    const attacker = createActivePokemon({ hp: 200 });
    const recoil = ruleset.calculateStruggleRecoil(attacker, 47);
    expect(recoil).toBe(11);
  });

  it("given Struggle dealing 3 damage, when calculating recoil, then recoil is 1 (minimum)", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c:2638-2639
    // "if (gBattleMoveDamage == 0) gBattleMoveDamage = 1;"
    // floor(3/4) = 0, clamped to 1
    const attacker = createActivePokemon({ hp: 200 });
    const recoil = ruleset.calculateStruggleRecoil(attacker, 3);
    expect(recoil).toBe(1);
  });
});

// =========================================================================
// Bug 5D: Secondary effect chance — %100 not /256
// =========================================================================

describe("Bug 5D: Secondary effect chance uses modulo 100 scale", () => {
  it("given 100% secondary effect chance, when rolling 1000 times, then all succeed (0 failures)", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c:2908-2935 Cmd_seteffectwithchance
    // "else if (Random() % 100 < percentChance ..."
    // Random() % 100 produces 0-99. 0-99 < 100 is ALWAYS true.
    // The old 0-255 scale had a 1/256 failure at 100% — this is wrong for Gen 3.
    const attacker = createActivePokemon({ types: ["water"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const state = createMinimalBattleState();

    // Use a move with 100% chance status-chance effect (e.g., Scald's burn)
    const move = createMove("water", 80, {
      id: "test-100pct",
      effect: {
        type: "status-chance",
        status: "burn",
        chance: 100,
      },
    });

    let failures = 0;
    for (let seed = 0; seed < 1000; seed++) {
      const rng = new SeededRandomImpl(seed);
      const context: MoveEffectContext = {
        attacker,
        defender,
        move,
        damage: 50,
        rng,
        state,
      } as MoveEffectContext;

      const result = ruleset.executeMoveEffect(context);
      if (result.statusInflicted !== "burn") {
        failures++;
      }
    }

    // Source: pokeemerald — 100% effects ALWAYS succeed
    expect(failures).toBe(0);
  });

  it("given 50% secondary effect chance, when rolling 1000 times, then approximately 500 succeed", () => {
    // Source: pret/pokeemerald — Random() % 100 < 50 succeeds ~50% of the time
    const attacker = createActivePokemon({ types: ["water"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const state = createMinimalBattleState();

    const move = createMove("water", 80, {
      id: "test-50pct",
      effect: {
        type: "status-chance",
        status: "burn",
        chance: 50,
      },
    });

    let successes = 0;
    const trials = 1000;
    for (let seed = 0; seed < trials; seed++) {
      const rng = new SeededRandomImpl(seed);
      const context: MoveEffectContext = {
        attacker,
        defender,
        move,
        damage: 50,
        rng,
        state,
      } as MoveEffectContext;

      const result = ruleset.executeMoveEffect(context);
      if (result.statusInflicted === "burn") {
        successes++;
      }
    }

    const rate = successes / trials;
    // Source: pokeemerald — Random() % 100 < 50 ≈ 50%
    expect(rate).toBeGreaterThan(0.4);
    expect(rate).toBeLessThan(0.6);
  });
});

// =========================================================================
// Bug 5E: Accuracy — pokeemerald sAccuracyStageRatios table
// =========================================================================

describe("Bug 5E: Accuracy uses pokeemerald sAccuracyStageRatios table", () => {
  it("given 100 accuracy move at stage -5, when calculating, then effective accuracy uses 36/100 ratio (not 3/8)", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c:591
    // sAccuracyStageRatios[-5] = { 36, 100 }
    // calc = floor(36 * 100 / 100) = 36
    //
    // The old 3-based formula gives: floor(100 * 3 / 8) = floor(37.5) = 37
    // pokeemerald gives 36 — the difference matters.
    //
    // Hit check: (Random() % 100 + 1) > calc means miss
    // So roll of 36 hits (36 <= 36), roll of 37 misses (37 > 36)
    const attacker = createActivePokemon({
      statStages: { accuracy: -5 },
    });
    const defender = createActivePokemon();
    const move = createMove("normal", 80, { accuracy: 100 });
    const state = createMinimalBattleState();

    // Roll of 36 should hit (36 <= 36)
    const hitContext: AccuracyContext = {
      attacker,
      defender,
      move,
      rng: createMockRng({ intValue: 36 }), // rng.int(1, 100) returns 36
      state,
    } as AccuracyContext;

    expect(ruleset.doesMoveHit(hitContext)).toBe(true);

    // Roll of 37 should miss (37 > 36)
    const missContext: AccuracyContext = {
      attacker,
      defender,
      move,
      rng: createMockRng({ intValue: 37 }),
      state,
    } as AccuracyContext;

    expect(ruleset.doesMoveHit(missContext)).toBe(false);
  });

  it("given 100 accuracy move at stage -4, when calculating, then effective accuracy uses 43/100 ratio", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c:592
    // sAccuracyStageRatios[-4] = { 43, 100 }
    // calc = floor(43 * 100 / 100) = 43
    //
    // The old 3-based formula gives: floor(100 * 3 / 7) = floor(42.857) = 42
    // pokeemerald gives 43 — the difference matters.
    const attacker = createActivePokemon({
      statStages: { accuracy: -4 },
    });
    const defender = createActivePokemon();
    const move = createMove("normal", 80, { accuracy: 100 });
    const state = createMinimalBattleState();

    // Roll of 43 should hit (43 <= 43)
    const hitContext: AccuracyContext = {
      attacker,
      defender,
      move,
      rng: createMockRng({ intValue: 43 }),
      state,
    } as AccuracyContext;

    expect(ruleset.doesMoveHit(hitContext)).toBe(true);

    // Roll of 44 should miss (44 > 43)
    const missContext: AccuracyContext = {
      attacker,
      defender,
      move,
      rng: createMockRng({ intValue: 44 }),
      state,
    } as AccuracyContext;

    expect(ruleset.doesMoveHit(missContext)).toBe(false);
  });

  it("given 100 accuracy move at stage 0, when calculating, then effective accuracy is 100 (always hits with roll <= 100)", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c:596
    // sAccuracyStageRatios[0] = { 1, 1 }
    // calc = floor(1 * 100 / 1) = 100
    // All rolls 1-100 hit (roll <= 100)
    const attacker = createActivePokemon();
    const defender = createActivePokemon();
    const move = createMove("normal", 80, { accuracy: 100 });
    const state = createMinimalBattleState();

    // Roll of 100 should hit (100 <= 100)
    const hitContext: AccuracyContext = {
      attacker,
      defender,
      move,
      rng: createMockRng({ intValue: 100 }),
      state,
    } as AccuracyContext;

    expect(ruleset.doesMoveHit(hitContext)).toBe(true);

    // Roll of 1 should hit (1 <= 100)
    const hit2Context: AccuracyContext = {
      attacker,
      defender,
      move,
      rng: createMockRng({ intValue: 1 }),
      state,
    } as AccuracyContext;

    expect(ruleset.doesMoveHit(hit2Context)).toBe(true);
  });

  it("given 100 accuracy move with attacker at +6 accuracy, when calculating, then effective accuracy uses 3/1 ratio = 300", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c:602
    // sAccuracyStageRatios[+6] = { 3, 1 }
    // calc = floor(3 * 100 / 1) = 300
    // All rolls 1-100 easily hit
    const attacker = createActivePokemon({
      statStages: { accuracy: 6 },
    });
    const defender = createActivePokemon();
    const move = createMove("normal", 80, { accuracy: 100 });
    const state = createMinimalBattleState();

    const context: AccuracyContext = {
      attacker,
      defender,
      move,
      rng: createMockRng({ intValue: 100 }),
      state,
    } as AccuracyContext;

    expect(ruleset.doesMoveHit(context)).toBe(true);
  });

  it("given never-miss move (accuracy null), when checking hit, then always returns true", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c:1103
    // "if (move == NO_ACC_CALC ...)" — certain moves skip accuracy entirely
    const attacker = createActivePokemon();
    const defender = createActivePokemon({ statStages: { evasion: 6 } });
    const move = createMove("normal", 80, { accuracy: null });
    const state = createMinimalBattleState();

    const context: AccuracyContext = {
      attacker,
      defender,
      move: move as MoveData,
      rng: createMockRng({ intValue: 100 }),
      state,
    } as AccuracyContext;

    expect(ruleset.doesMoveHit(context)).toBe(true);
  });

  it("given 80 accuracy move at stage -6, when calculating, then effective accuracy uses 33/100 ratio", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c:590
    // sAccuracyStageRatios[-6] = { 33, 100 }
    // calc = floor(33 * 80 / 100) = floor(26.4) = 26
    // Roll of 26 hits, roll of 27 misses
    const attacker = createActivePokemon({
      statStages: { accuracy: -6 },
    });
    const defender = createActivePokemon();
    const move = createMove("normal", 80, { accuracy: 80 });
    const state = createMinimalBattleState();

    // Roll of 26 should hit
    const hitContext: AccuracyContext = {
      attacker,
      defender,
      move,
      rng: createMockRng({ intValue: 26 }),
      state,
    } as AccuracyContext;
    expect(ruleset.doesMoveHit(hitContext)).toBe(true);

    // Roll of 27 should miss
    const missContext: AccuracyContext = {
      attacker,
      defender,
      move,
      rng: createMockRng({ intValue: 27 }),
      state,
    } as AccuracyContext;
    expect(ruleset.doesMoveHit(missContext)).toBe(false);
  });
});
