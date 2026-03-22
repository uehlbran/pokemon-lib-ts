/**
 * Regression tests for Gen 1 bug sweep — 10 mechanical correctness fixes.
 * Issues: #54, #55, #90, #91, #93, #94, #101, #102, #103, #105
 *
 * Each test uses Given/When/Then naming and AAA structure.
 * All expected values are sourced from gen1-ground-truth.md.
 */

import type {
  ActivePokemon,
  BattleState,
  DamageContext,
  MoveEffectContext,
} from "@pokemon-lib-ts/battle";
import type {
  MoveData,
  PokemonInstance,
  PokemonSpeciesData,
  PokemonType,
  StatBlock,
  TypeChart,
} from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen1DataManager } from "../src/data";
import { calculateGen1Damage } from "../src/Gen1DamageCalc";
import { Gen1Ruleset } from "../src/Gen1Ruleset";

// ============================================================================
// Shared test infrastructure
// ============================================================================

const ruleset = new Gen1Ruleset();

const DEFAULT_FLAGS: MoveData["flags"] = {
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
};

function makeMove(overrides: Partial<MoveData> = {}): MoveData {
  return {
    id: "test-move",
    displayName: "Test Move",
    type: "normal" as PokemonType,
    category: "physical",
    power: 50,
    accuracy: 100,
    pp: 35,
    priority: 0,
    target: "adjacent-foe",
    flags: DEFAULT_FLAGS,
    effect: null,
    description: "A test move.",
    generation: 1,
    ...overrides,
  };
}

function makeStats(overrides: Partial<StatBlock> = {}): StatBlock {
  return {
    hp: 200,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    speed: 100,
    ...overrides,
  };
}

function makeActivePokemon(overrides: Partial<ActivePokemon> = {}): ActivePokemon {
  return {
    pokemon: {
      uid: "test-uid",
      speciesId: 25,
      nickname: null,
      level: 50,
      experience: 0,
      nature: "hardy",
      ivs: { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
      currentHp: 200,
      status: null,
      friendship: 70,
      heldItem: null,
      ability: "",
      abilitySlot: "normal1" as const,
      gender: "male" as const,
      isShiny: false,
      metLocation: "pallet-town",
      metLevel: 5,
      originalTrainer: "Red",
      originalTrainerId: 12345,
      pokeball: "poke-ball",
      calculatedStats: makeStats(),
    } as PokemonInstance,
    teamSlot: 0,
    statStages: {
      hp: 0,
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
    volatileStatuses: new Map(),
    types: ["normal"] as PokemonType[],
    ability: "",
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    turnsOnField: 1,
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
    ...overrides,
  };
}

function makeBattleStateFull(
  side0Pokemon: ActivePokemon,
  side1Pokemon: ActivePokemon,
): BattleState {
  const rng = new SeededRandom(42);
  return {
    phase: "turn-resolve",
    generation: 1,
    format: "singles",
    turnNumber: 1,
    sides: [
      {
        index: 0 as const,
        trainer: null,
        team: [],
        active: [side0Pokemon],
        hazards: [],
        screens: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
        wish: null,
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
      },
      {
        index: 1 as const,
        trainer: null,
        team: [],
        active: [side1Pokemon],
        hazards: [],
        screens: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
        wish: null,
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
      },
    ],
    weather: null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    turnHistory: [],
    rng,
    ended: false,
    winner: null,
  } as BattleState;
}

function makeMoveEffectContext(overrides: Partial<MoveEffectContext> = {}): MoveEffectContext {
  const attacker = makeActivePokemon();
  const defender = makeActivePokemon();
  return {
    attacker,
    defender,
    move: makeMove(),
    damage: 50,
    state: makeBattleStateFull(attacker, defender),
    rng: new SeededRandom(42),
    ...overrides,
  };
}

/** Create a minimal neutral type chart (all 1x). */
function makeNeutralTypeChart(): TypeChart {
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

/** Mock RNG that always returns a fixed int value. */
function fixedRng(intValue: number): SeededRandom {
  return {
    next: () => 0,
    int: () => intValue,
    chance: () => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: T[]) => arr,
    getState: () => 0,
    setState: () => {},
  } as unknown as SeededRandom;
}

/** Minimal species data for damage calc tests. */
function makeSpecies(): PokemonSpeciesData {
  return {
    id: 1,
    name: "test",
    displayName: "Test",
    types: ["normal"] as PokemonType[],
    baseStats: {
      hp: 100,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 100,
    },
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
    generation: 1,
    isLegendary: false,
    isMythical: false,
  } as PokemonSpeciesData;
}

// ============================================================================
// Bug #94 — Special stat not unified (Amnesia / Growth must affect both sides)
// Source: gen1-ground-truth.md §1 — Unified Special Stat
// ============================================================================

describe("Bug #94 — Amnesia/Growth unified special stat", () => {
  it("given Amnesia (+2 spDefense self), when executeMoveEffect is called, then BOTH spAttack and spDefense stat changes are returned", () => {
    // Arrange — Amnesia effect targets self and changes spDefense by +2
    const amnesia = makeMove({
      id: "amnesia",
      category: "status",
      power: null,
      accuracy: null,
      effect: {
        type: "stat-change",
        changes: [{ stat: "spDefense", stages: 2 }],
        target: "self",
        chance: 100,
      },
    });
    const context = makeMoveEffectContext({ move: amnesia });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert — Gen 1 unified Special: changing spDefense must also change spAttack
    // Source: gen1-ground-truth.md §1 — both sides of Special go up together
    const spAttackChange = result.statChanges.find(
      (c) => c.target === "attacker" && c.stat === "spAttack",
    );
    const spDefenseChange = result.statChanges.find(
      (c) => c.target === "attacker" && c.stat === "spDefense",
    );
    expect(spAttackChange).toBeDefined();
    expect(spDefenseChange).toBeDefined();
    expect(spAttackChange?.stages).toBe(2);
    expect(spDefenseChange?.stages).toBe(2);
  });

  it("given Growth (+1 spAttack self), when executeMoveEffect is called, then BOTH spAttack and spDefense increase by 1", () => {
    // Arrange — Growth targets self and changes spAttack by +1
    const growth = makeMove({
      id: "growth",
      category: "status",
      power: null,
      accuracy: null,
      effect: {
        type: "stat-change",
        changes: [{ stat: "spAttack", stages: 1 }],
        target: "self",
        chance: 100,
      },
    });
    const context = makeMoveEffectContext({ move: growth });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert — unified Special: both sides increase by 1
    const spAttackChange = result.statChanges.find((c) => c.stat === "spAttack");
    const spDefenseChange = result.statChanges.find((c) => c.stat === "spDefense");
    expect(spAttackChange?.stages).toBe(1);
    expect(spDefenseChange?.stages).toBe(1);
    // No duplicates (each stat appears exactly once)
    const spAttackChanges = result.statChanges.filter((c) => c.stat === "spAttack");
    const spDefenseChanges = result.statChanges.filter((c) => c.stat === "spDefense");
    expect(spAttackChanges).toHaveLength(1);
    expect(spDefenseChanges).toHaveLength(1);
  });

  it("given a non-special stat-change move (Swords Dance +2 attack), when executeMoveEffect is called, then only attack changes (no duplication)", () => {
    // Arrange
    const swordsDance = makeMove({
      id: "swords-dance",
      category: "status",
      power: null,
      accuracy: null,
      effect: {
        type: "stat-change",
        changes: [{ stat: "attack", stages: 2 }],
        target: "self",
        chance: 100,
      },
    });
    const context = makeMoveEffectContext({ move: swordsDance });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert — non-special stats are not duplicated
    expect(result.statChanges).toHaveLength(1);
    expect(result.statChanges[0]?.stat).toBe("attack");
    expect(result.statChanges[0]?.stages).toBe(2);
  });
});

// ============================================================================
// Bug #55 — Type effectiveness applied sequentially with floor between types
// Source: gen1-ground-truth.md §3 — Damage Formula, step 7
// ============================================================================

describe("Bug #55 — Sequential type effectiveness with per-type floor", () => {
  it("given a dual-typed defender (Water/Rock) hit by a 2x each type move at max roll, when calculating damage, then floors are applied per type sequentially", () => {
    // Arrange — use a chart where normal is 2x vs water AND 2x vs rock
    // Level 50, Power 60, Attack 100, Defense 100:
    //   levelFactor = floor(100/5)+2 = 22
    //   baseDamage = min(997, floor(floor(22*60*100)/100/50))+2 = min(997, 26)+2 = 28
    // No STAB (attacker is fire type).
    // 2x vs Water: floor(28 * 20/10) = 56
    // 2x vs Rock:  floor(56 * 20/10) = 112
    // Max roll (255): floor(112 * 255/255) = 112
    const chart = makeNeutralTypeChart() as Record<string, Record<string, number>>;
    (chart.normal as Record<string, number>).water = 2;
    (chart.normal as Record<string, number>).rock = 2;

    const attacker = makeActivePokemon({ types: ["fire"] as PokemonType[] });
    const defender = makeActivePokemon({ types: ["water", "rock"] as PokemonType[] });
    defender.pokemon.calculatedStats = makeStats({ defense: 100 });

    const move = makeMove({ type: "normal", power: 60, category: "physical" });
    const state = makeBattleStateFull(attacker, defender);

    const context: DamageContext = {
      attacker,
      defender,
      move,
      state,
      rng: fixedRng(255),
      isCrit: false,
    };

    // Act
    const result = calculateGen1Damage(context, chart as TypeChart, makeSpecies());

    // Assert — sequential floor: 28 → 56 → 112 → final 112 (at max roll)
    expect(result.effectiveness).toBe(4); // combined effectiveness is 4
    expect(result.damage).toBe(112);
  });

  it("given a dual-typed defender hit by 2x + 1x effectiveness at max roll, when calculating damage, then only one floor is applied", () => {
    // Water/Normal defender hit by Grass (2x vs Water, 1x vs Normal)
    // baseDamage (Power 50, Atk 100, Def 100, Level 50): floor(floor(22*50*100)/100/50)+2 = 22+2 = 24
    // 2x vs Water: floor(24 * 20/10) = 48
    // 1x vs Normal: no change → 48
    // Max roll: floor(48 * 255/255) = 48
    const chart = makeNeutralTypeChart() as Record<string, Record<string, number>>;
    (chart.grass as Record<string, number>).water = 2;

    const attacker = makeActivePokemon({ types: ["fire"] as PokemonType[] });
    const defender = makeActivePokemon({ types: ["water", "normal"] as PokemonType[] });
    defender.pokemon.calculatedStats = makeStats({ spDefense: 100 });
    attacker.pokemon.calculatedStats = makeStats({ spAttack: 100 });

    // Grass is a special type in Gen 1
    const move = makeMove({ type: "grass", power: 50, category: "special" });
    const state = makeBattleStateFull(attacker, defender);

    const context: DamageContext = {
      attacker,
      defender,
      move,
      state,
      rng: fixedRng(255),
      isCrit: false,
    };

    const result = calculateGen1Damage(context, chart as TypeChart, makeSpecies());

    expect(result.damage).toBe(48);
    expect(result.effectiveness).toBe(2);
  });
});

// ============================================================================
// Bug #54 — getEndOfTurnOrder() missing leech-seed
// Source: gen1-ground-truth.md §8 — End-of-Turn Order
// ============================================================================

describe("Bug #54 — leech-seed in end-of-turn order", () => {
  it("given Gen1Ruleset, when getEndOfTurnOrder is called, then 'leech-seed' is included after 'status-damage'", () => {
    // Source: gen1-ground-truth.md §8 — End-of-Turn Order:
    // 1. Burn/Poison damage (status-damage)
    // 2. Leech Seed drain (leech-seed)
    // 3. Faint check (handled by engine)
    // Arrange / Act
    const order = ruleset.getEndOfTurnOrder();

    // Assert
    expect(order).toContain("leech-seed");
    const statusIdx = order.indexOf("status-damage");
    const leechIdx = order.indexOf("leech-seed");
    expect(statusIdx).toBeGreaterThanOrEqual(0);
    expect(leechIdx).toBeGreaterThan(statusIdx); // leech-seed comes after status-damage
  });
});

// ============================================================================
// Bug #90 — Toxic counter not reset on switch-out
// Source: gen1-ground-truth.md §8 — What Resets on Switch-Out + §6 Toxic
// ============================================================================

describe("Bug #90 — Toxic counter resets on switch-out", () => {
  it("given a badly-poisoned Pokemon, when it switches out, then status reverts to regular poison", () => {
    // Source: gen1-ground-truth.md §6 — Toxic: counter resets on switch (reverts to regular poison)
    // Arrange
    const pokemon = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        status: "badly-poisoned" as const,
      } as PokemonInstance,
    });
    pokemon.volatileStatuses.set("toxic-counter", { turnsLeft: -1, data: { counter: 5 } });
    const state = makeBattleStateFull(pokemon, makeActivePokemon());

    // Act
    ruleset.onSwitchOut(pokemon, state);

    // Assert — badly-poisoned reverts to regular poison
    expect(pokemon.pokemon.status).toBe("poison");
    // Toxic counter volatile is cleared
    expect(pokemon.volatileStatuses.has("toxic-counter")).toBe(false);
  });

  it("given a regular-poisoned Pokemon, when it switches out, then status remains regular poison", () => {
    // Arrange
    const pokemon = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        status: "poison" as const,
      } as PokemonInstance,
    });
    const state = makeBattleStateFull(pokemon, makeActivePokemon());

    // Act
    ruleset.onSwitchOut(pokemon, state);

    // Assert — regular poison is unaffected by switch-out
    expect(pokemon.pokemon.status).toBe("poison");
  });

  it("given a badly-poisoned Pokemon with counter at 4, when it switches out, then no toxic-counter volatile remains", () => {
    // Arrange
    const pokemon = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        status: "badly-poisoned" as const,
      } as PokemonInstance,
    });
    pokemon.volatileStatuses.set("toxic-counter", { turnsLeft: -1, data: { counter: 4 } });
    const state = makeBattleStateFull(pokemon, makeActivePokemon());

    // Act
    ruleset.onSwitchOut(pokemon, state);

    // Assert — no toxic-counter volatile remains; status is now regular poison
    expect(pokemon.volatileStatuses.has("toxic-counter")).toBe(false);
    expect(pokemon.pokemon.status).toBe("poison");
  });
});

// ============================================================================
// Bug #91 — Reflect/Light Screen ignored in damage calc
// Source: gen1-ground-truth.md §7 — Reflect / Light Screen
// ============================================================================

describe("Bug #91 — Reflect/Light Screen doubles defense in damage calc", () => {
  it("given Reflect is active on defender's side, when a physical move hits (non-crit), then damage is reduced compared to no Reflect", () => {
    // Source: gen1-ground-truth.md §7 — Reflect doubles effective defense stat for physical moves.
    // L50, Atk100, Def100, Power80 (normal physical):
    //   levelFactor=22, baseDamage = min(997, floor(floor(22*80*100)/100/50))+2 = 35+2 = 37
    //   Max roll: floor(37 * 255/255) = 37
    // With Reflect (Def 200):
    //   baseDamage = min(997, floor(floor(22*80*100)/200/50))+2 = 17+2 = 19
    //   Max roll: 19
    // Arrange
    const attacker = makeActivePokemon({ types: ["fire"] as PokemonType[] });
    attacker.pokemon.calculatedStats = makeStats({ attack: 100 });
    const defender = makeActivePokemon({ types: ["normal"] as PokemonType[] });
    defender.pokemon.calculatedStats = makeStats({ defense: 100 });

    const stateNoReflect = makeBattleStateFull(attacker, defender);
    const stateWithReflect = makeBattleStateFull(attacker, defender);
    stateWithReflect.sides[1].screens.push({ type: "reflect", turnsLeft: -1 });

    const move = makeMove({ type: "normal", power: 80, category: "physical" });
    const chart = makeNeutralTypeChart();
    const species = makeSpecies();

    // Act
    const damageNoReflect = calculateGen1Damage(
      { attacker, defender, move, state: stateNoReflect, rng: fixedRng(255), isCrit: false },
      chart,
      species,
    ).damage;
    const damageWithReflect = calculateGen1Damage(
      { attacker, defender, move, state: stateWithReflect, rng: fixedRng(255), isCrit: false },
      chart,
      species,
    ).damage;

    // Assert
    expect(damageNoReflect).toBe(37);
    expect(damageWithReflect).toBe(19);
    expect(damageWithReflect).toBeLessThan(damageNoReflect);
  });

  it("given Light Screen is active on defender's side, when a special move hits (non-crit), then damage is reduced compared to no Light Screen", () => {
    // Source: gen1-ground-truth.md §7 — Light Screen doubles SpDefense for special moves.
    // Arrange
    const attacker = makeActivePokemon({ types: ["fire"] as PokemonType[] });
    attacker.pokemon.calculatedStats = makeStats({ spAttack: 100 });
    const defender = makeActivePokemon({ types: ["normal"] as PokemonType[] });
    defender.pokemon.calculatedStats = makeStats({ spDefense: 100 });

    const stateNoScreen = makeBattleStateFull(attacker, defender);
    const stateWithScreen = makeBattleStateFull(attacker, defender);
    stateWithScreen.sides[1].screens.push({ type: "light-screen", turnsLeft: -1 });

    // Fire is a special type in Gen 1
    const move = makeMove({ type: "fire", power: 80, category: "special" });
    const chart = makeNeutralTypeChart();
    const species = makeSpecies();

    // Act
    const damageNoScreen = calculateGen1Damage(
      { attacker, defender, move, state: stateNoScreen, rng: fixedRng(255), isCrit: false },
      chart,
      species,
    ).damage;
    const damageWithScreen = calculateGen1Damage(
      { attacker, defender, move, state: stateWithScreen, rng: fixedRng(255), isCrit: false },
      chart,
      species,
    ).damage;

    // Assert — Light Screen reduces special damage
    expect(damageWithScreen).toBeLessThan(damageNoScreen);
  });

  it("given Reflect is active and the move is a critical hit, when calculating damage, then Reflect is ignored (crit bypasses screens)", () => {
    // Source: gen1-ground-truth.md §3 — Crits ignore Reflect and Light Screen.
    // Arrange
    const attacker = makeActivePokemon({ types: ["fire"] as PokemonType[] });
    attacker.pokemon.calculatedStats = makeStats({ attack: 100 });
    const defender = makeActivePokemon({ types: ["normal"] as PokemonType[] });
    defender.pokemon.calculatedStats = makeStats({ defense: 100 });

    const stateWithReflect = makeBattleStateFull(attacker, defender);
    stateWithReflect.sides[1].screens.push({ type: "reflect", turnsLeft: -1 });

    const stateNoReflect = makeBattleStateFull(attacker, defender);

    const move = makeMove({ type: "normal", power: 80, category: "physical" });
    const chart = makeNeutralTypeChart();
    const species = makeSpecies();

    // Act — critical hits: Reflect should be ignored
    const critWithReflect = calculateGen1Damage(
      { attacker, defender, move, state: stateWithReflect, rng: fixedRng(255), isCrit: true },
      chart,
      species,
    ).damage;
    const critNoReflect = calculateGen1Damage(
      { attacker, defender, move, state: stateNoReflect, rng: fixedRng(255), isCrit: true },
      chart,
      species,
    ).damage;

    // Assert — crit damage is the same regardless of Reflect
    expect(critWithReflect).toBe(critNoReflect);

    // And non-crit WITH Reflect should be lower than crit (crit doubles level)
    const nonCritWithReflect = calculateGen1Damage(
      { attacker, defender, move, state: stateWithReflect, rng: fixedRng(255), isCrit: false },
      chart,
      species,
    ).damage;
    expect(critWithReflect).toBeGreaterThan(nonCritWithReflect);
  });
});

// ============================================================================
// Bug #93 — Stat-change effects ignore chance field
// Source: gen1-ground-truth.md §7 — Secondary Effect Chance
// ============================================================================

describe("Bug #93 — Stat-change secondary effects respect chance field", () => {
  it("given Psychic (33% SpDef drop) and RNG rolls above threshold, when executeMoveEffect is called, then the stat drop does NOT occur", () => {
    // Source: gen1-ground-truth.md §7 — Secondary Effect Chance:
    // Roll: random(0..255) < floor(chance * 256 / 100)
    // 33% → threshold = floor(33 * 256 / 100) = 84
    // rng.int(0,255) returns 200 (>= 84) → effect skipped
    // Arrange
    const psychic = makeMove({
      id: "psychic",
      type: "psychic",
      category: "special",
      power: 90,
      effect: {
        type: "stat-change",
        changes: [{ stat: "spDefense", stages: -1 }],
        target: "foe",
        chance: 33,
      },
    });
    const context: MoveEffectContext = {
      ...makeMoveEffectContext({ move: psychic }),
      rng: fixedRng(200), // 200 >= 84 → secondary does NOT apply
    };

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert — no stat changes should be applied (the roll failed)
    expect(result.statChanges).toHaveLength(0);
  });

  it("given Psychic (33% SpDef drop) and RNG rolls below threshold, when executeMoveEffect is called, then the stat drop DOES occur", () => {
    // 33% → threshold = 84; rng.int(0,255) returns 10 (< 84) → effect applies
    // Arrange
    const psychic = makeMove({
      id: "psychic",
      type: "psychic",
      category: "special",
      power: 90,
      effect: {
        type: "stat-change",
        changes: [{ stat: "spDefense", stages: -1 }],
        target: "foe",
        chance: 33,
      },
    });
    const context: MoveEffectContext = {
      ...makeMoveEffectContext({ move: psychic }),
      rng: fixedRng(10), // 10 < 84 → secondary applies
    };

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert — unified Special: both spAttack and spDefense drop by 1 on defender
    // (Bug #93 fix triggers the secondary; bug #94 fix ensures both special stats are affected)
    const defenderChanges = result.statChanges.filter((c) => c.target === "defender");
    expect(defenderChanges.some((c) => c.stat === "spDefense" && c.stages === -1)).toBe(true);
    expect(defenderChanges.some((c) => c.stat === "spAttack" && c.stages === -1)).toBe(true);
  });

  it("given a 100% chance stat-change (Growl), when executeMoveEffect is called, then the stat change always applies", () => {
    // 100% chance → threshold = floor(100 * 256 / 100) = 256; all rolls 0-255 < 256 → always applied
    // Arrange
    const growl = makeMove({
      id: "growl",
      category: "status",
      power: null,
      accuracy: 100,
      effect: {
        type: "stat-change",
        changes: [{ stat: "attack", stages: -1 }],
        target: "foe",
        chance: 100,
      },
    });
    const context: MoveEffectContext = {
      ...makeMoveEffectContext({ move: growl }),
      rng: fixedRng(255), // highest possible roll; still applies at 100%
    };

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert — always applied when chance is 100
    expect(result.statChanges).toHaveLength(1);
    expect(result.statChanges[0]?.stat).toBe("attack");
  });
});

// ============================================================================
// Bug #101 — Trapping moves use correct "bound" volatile key
// Source: gen1-ground-truth.md §7 — Trapping Moves
// ============================================================================

describe("Bug #101 — Trapping moves use 'bound' volatile key", () => {
  it("given a trapping move (Wrap), when it hits, then volatileInflicted is 'bound' not 'trapped'", () => {
    // Source: gen1-ground-truth.md §7 — Trapping Moves target is immobilized.
    // The engine checks "bound" for immobilization; the volatile key must match.
    // Arrange
    const wrap = makeMove({
      id: "wrap",
      power: 15,
      effect: { type: "volatile-status", status: "bound", chance: 100 },
    });
    const context = makeMoveEffectContext({ move: wrap });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert — volatile inflicted must be "bound"
    expect(result.volatileInflicted).toBe("bound");
    expect(result.volatileInflicted).not.toBe("trapped");
  });

  it("given a Pokemon with 'bound' volatile set, when canSwitch is called, then returns false", () => {
    // Source: gen1-ground-truth.md §7 — Target completely immobilized — cannot attack or switch.
    // Arrange
    const pokemon = makeActivePokemon();
    pokemon.volatileStatuses.set("bound", { turnsLeft: 3, data: { bindTurns: 3 } });
    const state = makeBattleStateFull(pokemon, makeActivePokemon());

    // Act
    const canSwitch = ruleset.canSwitch(pokemon, state);

    // Assert — "bound" prevents switching
    expect(canSwitch).toBe(false);
  });

  it("given a Pokemon with 'trapped' volatile (old wrong key), when canSwitch is called, then returns true (wrong key does not block)", () => {
    // This confirms the fix: old code blocked on "trapped"; now only "bound" blocks.
    // Arrange
    const pokemon = makeActivePokemon();
    pokemon.volatileStatuses.set("trapped", { turnsLeft: 3 });
    const state = makeBattleStateFull(pokemon, makeActivePokemon());

    // Act
    const canSwitch = ruleset.canSwitch(pokemon, state);

    // Assert — "trapped" is no longer the blocking key (bug was that it was used)
    // With the fix, canSwitch checks "bound" not "trapped"
    expect(canSwitch).toBe(true);
  });

  it("given a Pokemon without any trapping volatile, when canSwitch is called, then returns true", () => {
    // Arrange
    const pokemon = makeActivePokemon();
    const state = makeBattleStateFull(pokemon, makeActivePokemon());

    // Act
    const canSwitch = ruleset.canSwitch(pokemon, state);

    // Assert
    expect(canSwitch).toBe(true);
  });
});

// ============================================================================
// Bug #102 — Hyper Beam recharge not skipped on KO
// Source: gen1-ground-truth.md §7 — Hyper Beam: skips recharge if KOs target
// ============================================================================

describe("Bug #102 — Hyper Beam skips recharge on KO", () => {
  it("given Hyper Beam KOs the defender, when executeMoveEffect is called post-engine, then noRecharge is true", () => {
    // Source: gen1-ground-truth.md §7 — Hyper Beam skips recharge if it KOs the target.
    // The engine applies damage to currentHp BEFORE calling executeMoveEffect, so a KO is
    // indicated by defender.pokemon.currentHp === 0 at the time executeMoveEffect runs.
    // Arrange — engine has already reduced defender to 0 HP (was 50, took 50)
    const defender = makeActivePokemon({
      pokemon: { ...makeActivePokemon().pokemon, currentHp: 0 } as PokemonInstance,
    });
    const hyperBeam = makeMove({
      id: "hyper-beam",
      type: "normal",
      power: 150,
      flags: { ...DEFAULT_FLAGS, recharge: true },
      effect: null,
    });
    const context = makeMoveEffectContext({ move: hyperBeam, damage: 50, defender });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert — KO occurred, recharge is skipped
    expect(result.noRecharge).toBe(true);
  });

  it("given Hyper Beam overkills the defender, when executeMoveEffect is called post-engine, then noRecharge is true", () => {
    // Overkill case: damage > original HP still counts as a KO; engine clamps currentHp to 0.
    // Arrange — engine has already reduced defender to 0 HP (was 30, took 50)
    const defender = makeActivePokemon({
      pokemon: { ...makeActivePokemon().pokemon, currentHp: 0 } as PokemonInstance,
    });
    const hyperBeam = makeMove({
      id: "hyper-beam",
      type: "normal",
      power: 150,
      flags: { ...DEFAULT_FLAGS, recharge: true },
      effect: null,
    });
    const context = makeMoveEffectContext({ move: hyperBeam, damage: 50, defender });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert — overkill also skips recharge
    expect(result.noRecharge).toBe(true);
  });

  it("given Hyper Beam does not KO the defender, when executeMoveEffect is called post-engine, then noRecharge is not set", () => {
    // Source: gen1-ground-truth.md §7 — Hyper Beam only skips recharge on KO.
    // The engine has already applied damage; defender.currentHp > 0 means it survived.
    // Arrange — defender had 200 HP, took 50 damage; engine reduced currentHp to 150
    const defender = makeActivePokemon({
      pokemon: { ...makeActivePokemon().pokemon, currentHp: 150 } as PokemonInstance,
    });
    const hyperBeam = makeMove({
      id: "hyper-beam",
      type: "normal",
      power: 150,
      flags: { ...DEFAULT_FLAGS, recharge: true },
      effect: null,
    });
    const context = makeMoveEffectContext({ move: hyperBeam, damage: 50, defender });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert — target survived, recharge is required
    expect(result.noRecharge).toBeFalsy();
  });
});

// ============================================================================
// Bug #103 — Sleep counter persists through switch-out
// Source: gen1-ground-truth.md §6 Sleep + §8 What Persists on Switch-Out
// ============================================================================

describe("Bug #103 — Sleep counter persists through switch-out", () => {
  it("given a sleeping Pokemon with 3 turns remaining, when it switches out, then sleep-counter volatile is preserved", () => {
    // Source: gen1-ground-truth.md §8 — Sleep counter (does NOT reset) on switch-out.
    // Arrange
    const pokemon = makeActivePokemon({
      pokemon: { ...makeActivePokemon().pokemon, status: "sleep" as const } as PokemonInstance,
    });
    pokemon.volatileStatuses.set("sleep-counter", { turnsLeft: 3 });
    const state = makeBattleStateFull(pokemon, makeActivePokemon());

    // Act
    ruleset.onSwitchOut(pokemon, state);

    // Assert — sleep counter survives the switch
    expect(pokemon.volatileStatuses.has("sleep-counter")).toBe(true);
    expect(pokemon.volatileStatuses.get("sleep-counter")?.turnsLeft).toBe(3);
  });

  it("given a sleeping Pokemon, when it switches out, then primary sleep status is preserved", () => {
    // Arrange
    const pokemon = makeActivePokemon({
      pokemon: { ...makeActivePokemon().pokemon, status: "sleep" as const } as PokemonInstance,
    });
    pokemon.volatileStatuses.set("sleep-counter", { turnsLeft: 5 });
    const state = makeBattleStateFull(pokemon, makeActivePokemon());

    // Act
    ruleset.onSwitchOut(pokemon, state);

    // Assert — primary status (sleep) is not cleared by onSwitchOut
    expect(pokemon.pokemon.status).toBe("sleep");
  });

  it("given a non-sleeping Pokemon, when it switches out, then no sleep-counter volatile exists", () => {
    // Arrange
    const pokemon = makeActivePokemon({
      pokemon: { ...makeActivePokemon().pokemon, status: null } as PokemonInstance,
    });
    const state = makeBattleStateFull(pokemon, makeActivePokemon());

    // Act
    ruleset.onSwitchOut(pokemon, state);

    // Assert
    expect(pokemon.volatileStatuses.has("sleep-counter")).toBe(false);
  });

  it("given a sleeping Pokemon with other volatiles, when it switches out, then other volatiles are cleared but sleep-counter remains", () => {
    // Gen 1: confusion, bound, etc. are cleared on switch-out, but sleep counter persists.
    // Arrange
    const pokemon = makeActivePokemon({
      pokemon: { ...makeActivePokemon().pokemon, status: "sleep" as const } as PokemonInstance,
    });
    pokemon.volatileStatuses.set("sleep-counter", { turnsLeft: 2 });
    pokemon.volatileStatuses.set("confusion", { turnsLeft: 3 });
    pokemon.volatileStatuses.set("bound", { turnsLeft: 2 });
    const state = makeBattleStateFull(pokemon, makeActivePokemon());

    // Act
    ruleset.onSwitchOut(pokemon, state);

    // Assert — sleep-counter persists; confusion and bound are cleared
    expect(pokemon.volatileStatuses.has("sleep-counter")).toBe(true);
    expect(pokemon.volatileStatuses.get("sleep-counter")?.turnsLeft).toBe(2);
    expect(pokemon.volatileStatuses.has("confusion")).toBe(false);
    expect(pokemon.volatileStatuses.has("bound")).toBe(false);
  });
});

// ============================================================================
// Bug #105 — moves.json missing "sharpen"
// Source: packages/gen1/CLAUDE.md — 165 moves; Gen 1 move ID 159 is Sharpen
// ============================================================================

describe("Bug #105 — Sharpen move exists in move data", () => {
  it("given the Gen 1 data manager, when getting the 'sharpen' move, then it is defined with correct fields", () => {
    // Source: packages/gen1/CLAUDE.md — 165 moves (sharpen was the missing 165th)
    // Arrange
    const dm = createGen1DataManager();

    // Act
    const sharpen = dm.getMove("sharpen");

    // Assert
    expect(sharpen).toBeDefined();
    expect(sharpen.id).toBe("sharpen");
    expect(sharpen.displayName).toBe("Sharpen");
    expect(sharpen.category).toBe("status");
    expect(sharpen.type).toBe("normal");
    expect(sharpen.pp).toBe(30);
    expect(sharpen.target).toBe("self");
    expect(sharpen.power).toBeNull();
    expect(sharpen.accuracy).toBeNull();
  });

  it("given Sharpen move data, when executeMoveEffect is called, then Attack increases by 1 stage on the user", () => {
    // Arrange
    const dm = createGen1DataManager();
    const sharpen = dm.getMove("sharpen");
    const context = makeMoveEffectContext({ move: sharpen });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert — Sharpen raises Attack by 1 stage on self (attacker)
    const attackChange = result.statChanges.find(
      (c) => c.stat === "attack" && c.target === "attacker",
    );
    expect(attackChange).toBeDefined();
    expect(attackChange?.stages).toBe(1);
    // Only attack is changed (not a special move)
    expect(result.statChanges).toHaveLength(1);
  });
});
