import type {
  AccuracyContext,
  ActivePokemon,
  BattleState,
  CritContext,
  DamageContext,
} from "@pokemon-lib-ts/battle";
import type {
  MoveData,
  PokemonInstance,
  PokemonType,
  StatBlock,
  TypeChart,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen3DataManager } from "../src/data";
import { calculateGen3Damage } from "../src/Gen3DamageCalc";
import { canInflictGen3Status, Gen3Ruleset } from "../src/Gen3Ruleset";

/**
 * Regression tests for Gen 3 formula/calc bug fixes.
 *
 * Each describe block corresponds to a GitHub issue:
 *   #322 — Electric-type paralysis immunity removed (no immunity in Gen 3)
 *   #323 — processSleepTurn allows action on wake turn
 *   #327 — Focus Energy gives +1 crit stage (not +2)
 *   #332 — Type effectiveness applied sequentially with intermediate floor
 *   #334 — Thick Fat applied before stat stages
 *   #337 — BrightPowder and Lax Incense accuracy reduction
 *   #341 — Uproar wake-up check in end-of-turn order
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeRuleset(): Gen3Ruleset {
  return new Gen3Ruleset(createGen3DataManager());
}

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
  speed?: number;
  types: PokemonType[];
  status?: PokemonInstance["status"];
  heldItem?: string | null;
  ability?: string;
  statStages?: Partial<Record<string, number>>;
  speciesId?: number;
  maxHp?: number;
}): ActivePokemon {
  const maxHp = opts.maxHp ?? 200;
  const stats: StatBlock = {
    hp: maxHp,
    attack: opts.attack ?? 100,
    defense: opts.defense ?? 100,
    spAttack: opts.spAttack ?? 100,
    spDefense: opts.spDefense ?? 100,
    speed: opts.speed ?? 100,
  };

  const pokemon = {
    uid: "test",
    speciesId: opts.speciesId ?? 1,
    nickname: null,
    level: opts.level ?? 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: maxHp,
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
      accuracy: opts.statStages?.accuracy ?? 0,
      evasion: opts.statStages?.evasion ?? 0,
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

function createTypeChart(overrides: [PokemonType, PokemonType, number][]): TypeChart {
  const chart = createNeutralTypeChart();
  for (const [atk, def, mult] of overrides) {
    (chart as Record<string, Record<string, number>>)[atk]![def] = mult;
  }
  return chart;
}

function createMockState(weather?: { type: string; turnsLeft: number; source: string } | null) {
  return { weather: weather ?? null } as DamageContext["state"];
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
    state: createMockState(opts.weather),
  } as DamageContext;
}

// ===========================================================================
// #322 — Electric-type paralysis immunity removed
// ===========================================================================

describe("Regression #322: Electric-type has NO paralysis immunity in Gen 3", () => {
  it("given Electric-type Pikachu, when checking if paralysis can be inflicted, then returns true", () => {
    // Source: pret/pokeemerald src/battle_util.c — CanBeStatusd has no Electric-type
    //   paralysis check. Confirmed by Bulbapedia: "In Generation VI onward,
    //   Electric-type Pokemon are immune to paralysis."
    const target = createActivePokemon({ types: ["electric"] });
    expect(canInflictGen3Status("paralysis", target)).toBe(true);
  });

  it("given dual Electric/Steel type, when checking if paralysis can be inflicted, then returns true", () => {
    // Source: pret/pokeemerald src/battle_util.c — neither Electric nor Steel has
    //   paralysis immunity in Gen 3. Steel only immunizes against poison.
    const target = createActivePokemon({ types: ["electric", "steel"] });
    expect(canInflictGen3Status("paralysis", target)).toBe(true);
  });
});

// ===========================================================================
// #323 — processSleepTurn allows action on wake turn
// ===========================================================================

describe("Regression #323: Pokemon CAN act on wake turn in Gen 3", () => {
  it("given sleeping Pokemon with 1 turn left (no Early Bird), when sleep processed, then returns true (can act)", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c — sleep counter decremented
    //   before move execution; if counter reaches 0, Pokemon wakes and CAN act.
    // Source: Bulbapedia — "Starting in Generation III, a Pokemon can attack on the
    //   turn it wakes up."
    const ruleset = makeRuleset();
    const pokemon = createActivePokemon({ types: ["normal"], status: "sleep" });
    pokemon.volatileStatuses.set("sleep-counter", { turnsLeft: 1 });
    const state = {} as BattleState;

    const canAct = ruleset.processSleepTurn(pokemon, state);
    expect(canAct).toBe(true);
    expect(pokemon.pokemon.status).toBe(null);
  });

  it("given sleeping Pokemon with 3 turns left, when sleep processed, then returns false (still sleeping)", () => {
    // Source: pret/pokeemerald — counter decrements by 1 (3 -> 2), still sleeping
    const ruleset = makeRuleset();
    const pokemon = createActivePokemon({ types: ["normal"], status: "sleep" });
    pokemon.volatileStatuses.set("sleep-counter", { turnsLeft: 3 });
    const state = {} as BattleState;

    const canAct = ruleset.processSleepTurn(pokemon, state);
    expect(canAct).toBe(false);
    expect(pokemon.pokemon.status).toBe("sleep");
  });
});

// ===========================================================================
// #327 — Focus Energy gives +1 crit stage (not +2)
// ===========================================================================

describe("Regression #327: Focus Energy gives +1 crit stage in Gen 3", () => {
  it("given Focus Energy active and RNG returns 1, when rolling crit at stage 1 (1/8), then crits", () => {
    // Source: pret/pokeemerald src/battle_util.c CalcCritChanceStage
    //   "if (gBattleMons[gBattlerAttacker].status2 & STATUS2_FOCUS_ENERGY) critChance += 1;"
    // Focus Energy = +1 stage. Stage 0 base -> stage 1 = 1/8 crit rate (denominator 8).
    // rng.int(1, 8) === 1 means crit succeeds.
    const ruleset = makeRuleset();
    const attacker = createActivePokemon({ types: ["normal"] });
    attacker.volatileStatuses.set("focus-energy", { turnsLeft: -1 });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("normal", 80);

    const rng = createMockRng(1);
    const context: CritContext = { attacker, defender, move, rng };
    expect(ruleset.rollCritical(context)).toBe(true);
  });

  it("given Focus Energy active and RNG returns 4, when rolling crit at stage 1 (1/8), then does NOT crit", () => {
    // Source: pret/pokeemerald — Focus Energy = +1 stage, denominator 8.
    // rng.int(1, 8) returning 4 means no crit (only 1 out of 8 crits).
    const ruleset = makeRuleset();
    const attacker = createActivePokemon({ types: ["normal"] });
    attacker.volatileStatuses.set("focus-energy", { turnsLeft: -1 });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("normal", 80);

    const rng = createMockRng(4);
    const context: CritContext = { attacker, defender, move, rng };
    expect(ruleset.rollCritical(context)).toBe(false);
  });

  it("given Focus Energy + high-crit move (critRatio 1), when rolling at stage 2 (1/4) with rng=1, then crits", () => {
    // Source: pret/pokeemerald — Focus Energy (+1) + critRatio 1 = stage 2 = 1/4
    // If Focus Energy were +2, it would be stage 3 = 1/3, different denominator.
    const ruleset = makeRuleset();
    const attacker = createActivePokemon({ types: ["normal"] });
    attacker.volatileStatuses.set("focus-energy", { turnsLeft: -1 });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("normal", 80, "slash", { critRatio: 1 });

    const rng = createMockRng(1);
    const context: CritContext = { attacker, defender, move, rng };
    expect(ruleset.rollCritical(context)).toBe(true);
  });
});

// ===========================================================================
// #332 — Type effectiveness applied sequentially with floor
// ===========================================================================

describe("Regression #332: Type effectiveness applied sequentially with intermediate floor", () => {
  it("given damage=7, type1=0.5x, type2=2x, when applying effectiveness, then result is 6 (not 7)", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c — type effectiveness loop
    //   applies one type at a time with truncation between iterations.
    // Sequential: floor(floor(7 * 0.5) * 2) = floor(3 * 2) = 6
    // Combined (wrong): floor(7 * 1.0) = 7
    //
    // Fire is SPECIAL in Gen 3 (type-based split), so uses spAttack/spDefense.
    // To get base=7: floor(floor(22*60*20/100)/50)+2 = floor(264/50)+2 = 5+2 = 7
    const typeChart = createTypeChart([
      ["fire", "grass", 2],
      ["fire", "water", 0.5],
    ]);

    const attacker = createActivePokemon({
      level: 50,
      spAttack: 20,
      types: ["normal"],
    });
    const defender = createActivePokemon({
      spDefense: 100,
      types: ["water", "grass"],
    });

    const move = createMove("fire", 60);
    const rng = createMockRng(100);

    const context = createDamageContext({ attacker, defender, move, rng });
    const result = calculateGen3Damage(context, typeChart);

    // Sequential: floor(floor(7*0.5)*2) = floor(3*2) = 6
    expect(result.damage).toBe(6);
  });

  it("given damage=11, type1=0.5x, type2=0.5x, when applying effectiveness, then result is floor(floor(11*0.5)*0.5)=2", () => {
    // Source: pret/pokeemerald — sequential floor for each defender type.
    // Sequential: floor(floor(11*0.5)*0.5) = floor(5*0.5) = 2
    // Combined: floor(11*0.25) = 2 (same here, but different mechanism)
    //
    // To get base=11: floor(floor(22*100*22/100)/50)+2 = floor(484/50)+2 = 9+2 = 11
    const typeChart = createTypeChart([
      ["fire", "water", 0.5],
      ["fire", "dragon", 0.5],
    ]);

    const attacker = createActivePokemon({
      level: 50,
      spAttack: 22,
      types: ["normal"],
    });
    const defender = createActivePokemon({
      spDefense: 100,
      types: ["water", "dragon"],
    });

    const move = createMove("fire", 100);
    const rng = createMockRng(100);

    const context = createDamageContext({ attacker, defender, move, rng });
    const result = calculateGen3Damage(context, typeChart);

    // Sequential: floor(floor(11*0.5)*0.5) = floor(5*0.5) = floor(2.5) = 2
    expect(result.damage).toBe(2);
  });
});

// ===========================================================================
// #334 — Thick Fat applied before stat stages
// ===========================================================================

describe("Regression #334: Thick Fat applied before stat stages", () => {
  it("given rawStat=151 +1 stage vs spDef=50 Thick Fat defender, when fire move hits, then damage reflects before-stage Thick Fat", () => {
    // Source: pret/pokeemerald src/pokemon.c:3203-3204 — Thick Fat halves raw stat
    //   BEFORE stat stages (APPLY_STAT_MOD).
    //
    // Correct (before stages): floor(floor(151/2) * 1.5) = floor(75*1.5) = 112
    //   damage = floor(floor(22*80*112/50)/50) + 2 = floor(3942/50) + 2 = 78+2 = 80
    //
    // Wrong (after stages): floor(floor(151*1.5)/2) = floor(226/2) = 113
    //   damage = floor(floor(22*80*113/50)/50) + 2 = floor(3977/50) + 2 = 79+2 = 81
    //
    // Fire is SPECIAL in Gen 3. Attacker type != fire to avoid STAB.
    const typeChart = createNeutralTypeChart();

    const attacker = createActivePokemon({
      level: 50,
      spAttack: 151,
      types: ["normal"],
      statStages: { spAttack: 1 },
    });
    const defender = createActivePokemon({
      spDefense: 50,
      types: ["normal"],
      ability: "thick-fat",
    });

    const move = createMove("fire", 80);
    const rng = createMockRng(100);

    const context = createDamageContext({ attacker, defender, move, rng });
    const result = calculateGen3Damage(context, typeChart);

    // Source: Manual calculation per pokeemerald CalculateBaseDamage
    // Thick Fat BEFORE stages: floor(151/2) = 75, then floor(75*1.5) = 112
    // floor(floor(22*80*112/50)/50) + 2 = floor(3942/50) + 2 = 78 + 2 = 80
    expect(result.damage).toBe(80);
  });

  it("given rawStat=150 +1 stage vs spDef=50 Thick Fat defender, when ice move hits, then damage is same as fire", () => {
    // Source: pret/pokeemerald — Thick Fat applies to both Fire and Ice moves
    // rawStat=150: floor(150/2)=75, floor(75*1.5)=112 -> same effective stat as 151 case
    //   damage = floor(floor(22*80*112/50)/50) + 2 = 78+2 = 80
    //
    // Ice is also SPECIAL in Gen 3 (like Fire).
    const typeChart = createNeutralTypeChart();

    const attacker = createActivePokemon({
      level: 50,
      spAttack: 150,
      types: ["normal"],
      statStages: { spAttack: 1 },
    });
    const defender = createActivePokemon({
      spDefense: 50,
      types: ["normal"],
      ability: "thick-fat",
    });

    const move = createMove("ice", 80);
    const rng = createMockRng(100);

    const context = createDamageContext({ attacker, defender, move, rng });
    const result = calculateGen3Damage(context, typeChart);

    // floor(150/2)=75, floor(75*1.5)=112
    // floor(floor(22*80*112/50)/50)+2 = 78+2 = 80
    expect(result.damage).toBe(80);
  });
});

// ===========================================================================
// #337 — BrightPowder and Lax Incense accuracy reduction
// ===========================================================================

describe("Regression #337: BrightPowder and Lax Incense reduce accuracy", () => {
  it("given defender holds BrightPowder and move accuracy 100, when roll=90, then hits (90<=90)", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c:1154-1160
    //   HOLD_EFFECT_EVASION_UP: calc = calc * (100-10) / 100 = calc * 90/100
    // Base acc 100 at stage 0: calc = 100. After BrightPowder: floor(100*90/100) = 90.
    const ruleset = makeRuleset();
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"], heldItem: "bright-powder" });
    const move = createMove("normal", 80);
    const state = { weather: null } as BattleState;

    const rng = createMockRng(90);
    const ctx: AccuracyContext = { attacker, defender, move, state, rng } as AccuracyContext;
    expect(ruleset.doesMoveHit(ctx)).toBe(true);
  });

  it("given defender holds BrightPowder and move accuracy 100, when roll=91, then misses (91>90)", () => {
    // Source: pret/pokeemerald — same as above, roll 91 > 90 means miss.
    const ruleset = makeRuleset();
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"], heldItem: "bright-powder" });
    const move = createMove("normal", 80);
    const state = { weather: null } as BattleState;

    const rng = createMockRng(91);
    const ctx: AccuracyContext = { attacker, defender, move, state, rng } as AccuracyContext;
    expect(ruleset.doesMoveHit(ctx)).toBe(false);
  });

  it("given defender holds Lax Incense and move accuracy 100, when roll=91, then misses", () => {
    // Source: pret/pokeemerald — Lax Incense has same HOLD_EFFECT_EVASION_UP as BrightPowder
    // Source: Bulbapedia — "Lax Incense lowers the opponent's accuracy by 10%"
    const ruleset = makeRuleset();
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"], heldItem: "lax-incense" });
    const move = createMove("normal", 80);
    const state = { weather: null } as BattleState;

    const rng = createMockRng(91);
    const ctx: AccuracyContext = { attacker, defender, move, state, rng } as AccuracyContext;
    expect(ruleset.doesMoveHit(ctx)).toBe(false);
  });
});

// ===========================================================================
// #341 — Uproar wake-up check in end-of-turn order
// ===========================================================================

describe("Regression #341: Uproar in end-of-turn order", () => {
  it("given Gen3Ruleset, when getting EoT order, then uproar is between perish-song and speed-boost", () => {
    // Source: pret/pokeemerald src/battle_main.c — Uproar processing in end-of-turn loop
    // Source: Spec 04-gen3.md line 1038 — "13. Uproar wake-up check"
    const ruleset = makeRuleset();
    const order = ruleset.getEndOfTurnOrder();

    const perishIdx = order.indexOf("perish-song");
    const uproarIdx = order.indexOf("uproar");
    const speedBoostIdx = order.indexOf("speed-boost");

    expect(uproarIdx).toBeGreaterThan(-1);
    expect(uproarIdx).toBeGreaterThan(perishIdx);
    expect(uproarIdx).toBeLessThan(speedBoostIdx);
  });

  it("given Gen3Ruleset, when getting EoT order, then total count is 20 (including uproar, ingrain, stat-boosting-items)", () => {
    // Source: pret/pokeemerald — 20 end-of-turn effects in Gen 3:
    // uproar, ingrain, and stat-boosting-items (White Herb) all added
    const ruleset = makeRuleset();
    const order = ruleset.getEndOfTurnOrder();
    expect(order).toHaveLength(20);
  });
});

// ===========================================================================
// #392 — OHKO level-based accuracy formula
// ===========================================================================

describe("Regression #392: OHKO moves use level-based accuracy (base accuracy + level difference)", () => {
  /**
   * Source: pret/pokeemerald src/battle_script_commands.c:7525-7529 (Cmd_ohkoattempt):
   *   chance = gBattleMoves[gCurrentMove].accuracy + (attackerLevel - defenderLevel);
   *   if (Random() % 100 + 1 < chance && attackerLevel >= defenderLevel) → hits
   *   else → misses
   *
   * OHKO moves (Fissure, Horn Drill, Guillotine, Sheer Cold) have base accuracy 30.
   * Formula: ohkoAccuracy = 30 + (attackerLevel - defenderLevel)
   *   - Auto-miss if attackerLevel < defenderLevel (regardless of computed accuracy)
   *   - Otherwise: hit if rng.int(1, 100) < ohkoAccuracy  (strict less-than, matching "< chance")
   *
   * Examples with base accuracy 30:
   *   L50 vs L40: 30 + (50-40) = 40; auto-miss? No (50>=40); hit if roll < 40 (rolls 1-39 hit)
   *   L40 vs L50: auto-miss (40 < 50); always misses
   *   L50 vs L50: 30 + 0 = 30; hit if roll < 30 (rolls 1-29 hit)
   *   L60 vs L50: 30 + 10 = 40; hit if roll < 40 (rolls 1-39 hit)
   */

  function makeOhkoMove(): MoveData {
    return createMove("normal", 0, "fissure", {
      accuracy: 30, // base accuracy for OHKO moves (Fissure, Horn Drill, Guillotine)
      effect: { type: "ohko" },
    });
  }

  it("given L50 attacker vs L40 defender with OHKO move, when roll=39, then hits (39 < 40)", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c:7525-7526
    // Derivation: ohkoAccuracy = 30 + (50 - 40) = 40; hit if roll < 40 → roll 39 < 40 → hits
    const ruleset = makeRuleset();
    const attacker = createActivePokemon({ level: 50, types: ["normal"] });
    const defender = createActivePokemon({ level: 40, types: ["normal"] });
    const move = makeOhkoMove();
    const state = { weather: null } as BattleState;

    const rng = createMockRng(39); // rng.int(1, 100) returns 39; 39 < 40 → hits
    const ctx: AccuracyContext = { attacker, defender, move, state, rng } as AccuracyContext;
    expect(ruleset.doesMoveHit(ctx)).toBe(true);
  });

  it("given L50 attacker vs L40 defender with OHKO move, when roll=40, then misses (40 is NOT < 40)", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c:7526 — "< chance" is strict
    // Derivation: ohkoAccuracy = 30 + (50 - 40) = 40; hit if roll < 40 → roll 40 is NOT < 40 → misses
    const ruleset = makeRuleset();
    const attacker = createActivePokemon({ level: 50, types: ["normal"] });
    const defender = createActivePokemon({ level: 40, types: ["normal"] });
    const move = makeOhkoMove();
    const state = { weather: null } as BattleState;

    const rng = createMockRng(40); // rng.int(1, 100) returns 40; 40 NOT < 40 → misses
    const ctx: AccuracyContext = { attacker, defender, move, state, rng } as AccuracyContext;
    expect(ruleset.doesMoveHit(ctx)).toBe(false);
  });

  it("given L40 attacker vs L50 defender with OHKO move, when any roll, then always misses (attacker level < defender level)", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c:7526 — "attackerLevel >= defenderLevel" condition
    // Derivation: 40 < 50 → auto-miss regardless of roll; roll=1 still misses
    const ruleset = makeRuleset();
    const attacker = createActivePokemon({ level: 40, types: ["normal"] });
    const defender = createActivePokemon({ level: 50, types: ["normal"] });
    const move = makeOhkoMove();
    const state = { weather: null } as BattleState;

    const rng = createMockRng(1); // lowest possible roll; still misses due to level check
    const ctx: AccuracyContext = { attacker, defender, move, state, rng } as AccuracyContext;
    expect(ruleset.doesMoveHit(ctx)).toBe(false);
  });

  it("given L49 attacker vs L50 defender with OHKO move, when roll=1, then always misses (attacker level < defender level)", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c:7526 — auto-miss enforced at exact level boundary
    // Derivation: 49 < 50 → auto-miss regardless of roll
    const ruleset = makeRuleset();
    const attacker = createActivePokemon({ level: 49, types: ["normal"] });
    const defender = createActivePokemon({ level: 50, types: ["normal"] });
    const move = makeOhkoMove();
    const state = { weather: null } as BattleState;

    const rng = createMockRng(1); // lowest possible roll; still misses
    const ctx: AccuracyContext = { attacker, defender, move, state, rng } as AccuracyContext;
    expect(ruleset.doesMoveHit(ctx)).toBe(false);
  });

  it("given equal-level L50 attacker vs L50 defender with OHKO move, when roll=29, then hits (29 < 30)", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c:7525-7526
    // Derivation: ohkoAccuracy = 30 + (50 - 50) = 30; hit if roll < 30 → roll 29 < 30 → hits
    const ruleset = makeRuleset();
    const attacker = createActivePokemon({ level: 50, types: ["normal"] });
    const defender = createActivePokemon({ level: 50, types: ["normal"] });
    const move = makeOhkoMove();
    const state = { weather: null } as BattleState;

    const rng = createMockRng(29); // 29 < 30 → hits
    const ctx: AccuracyContext = { attacker, defender, move, state, rng } as AccuracyContext;
    expect(ruleset.doesMoveHit(ctx)).toBe(true);
  });

  it("given equal-level L50 attacker vs L50 defender with OHKO move, when roll=30, then misses (30 is NOT < 30)", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c:7526 — strict less-than check
    // Derivation: ohkoAccuracy = 30 + (50 - 50) = 30; hit if roll < 30 → roll 30 NOT < 30 → misses
    const ruleset = makeRuleset();
    const attacker = createActivePokemon({ level: 50, types: ["normal"] });
    const defender = createActivePokemon({ level: 50, types: ["normal"] });
    const move = makeOhkoMove();
    const state = { weather: null } as BattleState;

    const rng = createMockRng(30); // 30 NOT < 30 → misses
    const ctx: AccuracyContext = { attacker, defender, move, state, rng } as AccuracyContext;
    expect(ruleset.doesMoveHit(ctx)).toBe(false);
  });
});
