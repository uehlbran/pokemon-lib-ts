import type {
  AccuracyContext,
  ActivePokemon,
  BattleSide,
  BattleState,
  CritContext,
} from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType, StatBlock } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen4DataManager } from "../src/data";
import { Gen4Ruleset } from "../src/Gen4Ruleset";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeRuleset(): Gen4Ruleset {
  return new Gen4Ruleset(createGen4DataManager());
}

function createMockRng(opts?: { intReturn?: number; chanceReturn?: boolean }) {
  return {
    next: () => 0,
    int: (_min: number, _max: number) => opts?.intReturn ?? 1,
    chance: (_p: number) => opts?.chanceReturn ?? false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  };
}

function makePokemonInstance(overrides: {
  maxHp?: number;
  status?: PokemonInstance["status"];
  ability?: string;
  heldItem?: string | null;
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  return {
    uid: "test",
    speciesId: 1,
    nickname: null,
    level: 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: maxHp,
    moves: [],
    ability: overrides.ability ?? "",
    abilitySlot: "normal1" as const,
    heldItem: overrides.heldItem ?? null,
    status: overrides.status ?? null,
    friendship: 0,
    gender: "male" as const,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: "pokeball",
    calculatedStats: {
      hp: maxHp,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 100,
    },
  } as PokemonInstance;
}

function makeActivePokemon(overrides: {
  maxHp?: number;
  status?: PokemonInstance["status"];
  types?: PokemonType[];
  ability?: string;
  heldItem?: string | null;
  statStages?: Partial<Record<string, number>>;
  volatiles?: Map<string, { turnsLeft: number }>;
}): ActivePokemon {
  return {
    pokemon: makePokemonInstance({
      maxHp: overrides.maxHp,
      status: overrides.status,
      ability: overrides.ability,
      heldItem: overrides.heldItem,
    }),
    teamSlot: 0,
    statStages: {
      attack: overrides.statStages?.attack ?? 0,
      defense: overrides.statStages?.defense ?? 0,
      spAttack: overrides.statStages?.spAttack ?? 0,
      spDefense: overrides.statStages?.spDefense ?? 0,
      speed: overrides.statStages?.speed ?? 0,
      accuracy: overrides.statStages?.accuracy ?? 0,
      evasion: overrides.statStages?.evasion ?? 0,
    },
    volatileStatuses: overrides.volatiles ?? new Map(),
    types: overrides.types ?? ["normal"],
    ability: overrides.ability ?? "",
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

function makeSide(index: 0 | 1, active?: ActivePokemon): BattleSide {
  return {
    index,
    trainer: null,
    team: [],
    active: active ? [active] : [],
    hazards: [],
    screens: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
    gimmickUsed: false,
  } as BattleSide;
}

function makeSideWithHazards(
  active: ActivePokemon,
  hazards: Array<{ type: string; layers: number }>,
  luckyChantActive = false,
): BattleSide {
  return {
    index: 0 as const,
    trainer: null,
    team: [],
    active: [active],
    hazards,
    screens: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: luckyChantActive, turnsLeft: luckyChantActive ? 5 : 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
    gimmickUsed: false,
  } as BattleSide;
}

function makeBattleState(overrides?: {
  sides?: [BattleSide, BattleSide];
  gravityActive?: boolean;
}): BattleState {
  return {
    phase: "turn-resolve",
    generation: 4,
    format: "singles",
    turnNumber: 1,
    sides: overrides?.sides ?? [makeSide(0), makeSide(1)],
    weather: null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: overrides?.gravityActive ?? false, turnsLeft: 0 },
    turnHistory: [],
    rng: createMockRng(),
    ended: false,
    winner: null,
  } as unknown as BattleState;
}

function makeMove(overrides?: Partial<MoveData>): MoveData {
  return {
    id: overrides?.id ?? "tackle",
    displayName: "Tackle",
    type: overrides?.type ?? "normal",
    category: overrides?.category ?? "physical",
    power: overrides?.power ?? 40,
    accuracy: overrides?.accuracy ?? 100,
    pp: 35,
    priority: 0,
    target: "adjacent-foe",
    flags: {
      contact: true,
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
    generation: 4,
    critRatio: overrides?.critRatio ?? 0,
  } as MoveData;
}

const STUB_STATE = {} as BattleState;

// ===========================================================================
// #354 -- processSleepTurn: Pokemon CAN act on wake turn in Gen 4
// ===========================================================================

describe("#354 processSleepTurn allows action on wake turn", () => {
  it("given sleep counter at 1 (last sleep turn), when processSleepTurn called, then returns true (Pokemon acts on wake)", () => {
    // Source: Showdown Gen 4 data/mods/gen4/conditions.ts lines 39-52 --
    //   when time <= 0, cureStatus() and return without "return false",
    //   allowing the Pokemon to act.
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ status: "sleep" });
    mon.volatileStatuses.set("sleep-counter", { turnsLeft: 1 });

    const canAct = ruleset.processSleepTurn(mon, STUB_STATE);

    expect(canAct).toBe(true);
    expect(mon.pokemon.status).toBeNull();
    expect(mon.volatileStatuses.has("sleep-counter")).toBe(false);
  });

  it("given sleep counter at 2, when processSleepTurn called twice, then first call returns false (still sleeping), second returns true (wakes and acts)", () => {
    // Source: Showdown Gen 4 data/mods/gen4/conditions.ts --
    //   counter decrements each turn; once it hits 0, Pokemon wakes and CAN act.
    // Turn 1: counter 2 -> 1 (still sleeping, returns false)
    // Turn 2: counter 1 -> 0 (wakes up, returns true)
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ status: "sleep" });
    mon.volatileStatuses.set("sleep-counter", { turnsLeft: 2 });

    const canActTurn1 = ruleset.processSleepTurn(mon, STUB_STATE);
    expect(canActTurn1).toBe(false);
    expect(mon.pokemon.status).toBe("sleep");

    const canActTurn2 = ruleset.processSleepTurn(mon, STUB_STATE);
    expect(canActTurn2).toBe(true);
    expect(mon.pokemon.status).toBeNull();
  });
});

// ===========================================================================
// #356 -- rollSleepTurns: 1-4 effective turns (not 1-5)
// ===========================================================================

describe("#356 rollSleepTurns returns 1-4 effective turns", () => {
  it("given rollSleepTurns with seed=1, when called, then returns a value in [1, 4]", () => {
    // Source: Showdown Gen 4 data/mods/gen4/conditions.ts line 32 --
    //   this.effectState.time = this.random(2, 6); // counter 2-5
    //   Our processSleepTurn decrements turnsLeft; effective sleep = turnsLeft value.
    const ruleset = makeRuleset();
    const rng = new SeededRandom(1);
    const turns = ruleset.rollSleepTurns(rng);
    expect(turns).toBeGreaterThanOrEqual(1);
    expect(turns).toBeLessThanOrEqual(4);
  });

  it("given rollSleepTurns called 500 times with varying seeds, then max is 4 and min is 1", () => {
    // Source: Showdown Gen 4 data/mods/gen4/conditions.ts --
    //   counter random(2,6) = 2-5; effective turns 1-4.
    // Triangulation: 500 iterations to verify distribution boundaries.
    const ruleset = makeRuleset();
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;

    for (let seed = 1; seed <= 500; seed++) {
      const rng = new SeededRandom(seed);
      const turns = ruleset.rollSleepTurns(rng);
      if (turns < min) min = turns;
      if (turns > max) max = turns;
    }

    expect(min).toBe(1);
    expect(max).toBe(4);
  });
});

// ===========================================================================
// #359 -- Magic Guard prevents full paralysis (25% move loss)
// ===========================================================================

describe("#359 Magic Guard prevents full paralysis", () => {
  it("given a Pokemon with Magic Guard and paralysis, when checkFullParalysis called with rng returning true, then returns false (not fully paralyzed)", () => {
    // Source: Showdown Gen 4 data/mods/gen4/conditions.ts lines 15-19 --
    //   if (!pokemon.hasAbility('magicguard') && this.randomChance(1, 4))
    //   Magic Guard holders skip the full paralysis check entirely.
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ ability: "magic-guard", status: "paralysis" });
    const rng = createMockRng({ chanceReturn: true }); // would trigger paralysis normally

    const isFullyParalyzed = ruleset.checkFullParalysis(mon, rng as any);

    expect(isFullyParalyzed).toBe(false);
  });

  it("given a Pokemon WITHOUT Magic Guard and paralysis, when checkFullParalysis called with rng returning true, then returns true (fully paralyzed)", () => {
    // Source: Showdown Gen 4 data/mods/gen4/conditions.ts --
    //   Non-Magic Guard Pokemon have normal 25% full paralysis chance.
    // The rng.chance(0.25) returns true, so the Pokemon is fully paralyzed.
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ ability: "blaze", status: "paralysis" });
    const rng = createMockRng({ chanceReturn: true });

    const isFullyParalyzed = ruleset.checkFullParalysis(mon, rng as any);

    expect(isFullyParalyzed).toBe(true);
  });
});

// ===========================================================================
// #370 -- Entry hazards respect Gravity and Iron Ball grounding
// ===========================================================================

describe("#370 Entry hazards respect Gravity and Iron Ball grounding", () => {
  it("given a Flying-type with Gravity active, when stepping on Spikes, then takes damage (grounded by Gravity)", () => {
    // Source: Bulbapedia -- Gravity: "All Pokemon are grounded."
    // Source: Showdown Gen 4 mod -- Gravity grounds for hazard purposes.
    // Flying-type normally immune to Spikes, but Gravity overrides this.
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ types: ["flying"], maxHp: 200 });
    const side = makeSideWithHazards(mon, [{ type: "spikes", layers: 1 }]);
    const state = makeBattleState({ gravityActive: true });

    const result = ruleset.applyEntryHazards(mon, side as any, state);

    // 1 layer Spikes = 1/8 max HP = floor(200/8) = 25
    // Source: Bulbapedia -- Spikes damage: 1 layer = 1/8 max HP
    expect(result.damage).toBe(25);
  });

  it("given a Levitate holder with Gravity active, when stepping on Toxic Spikes, then gets poisoned (grounded by Gravity)", () => {
    // Source: Bulbapedia -- Gravity grounds all Pokemon including Levitate holders.
    // Levitate normally makes a Pokemon immune to Toxic Spikes, but Gravity overrides.
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ types: ["normal"], ability: "levitate", maxHp: 200 });
    const side = makeSideWithHazards(mon, [{ type: "toxic-spikes", layers: 1 }]);
    const state = makeBattleState({ gravityActive: true });

    const result = ruleset.applyEntryHazards(mon, side as any, state);

    expect(result.statusInflicted).toBe("poison");
  });

  it("given a Flying-type holding Iron Ball, when stepping on Spikes, then takes damage (grounded by Iron Ball)", () => {
    // Source: Bulbapedia -- Iron Ball: "makes the holder grounded"
    // Source: Showdown data/items.ts -- Iron Ball grounds the holder.
    // Flying-type normally immune to Spikes, but Iron Ball overrides.
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ types: ["flying"], maxHp: 200, heldItem: "iron-ball" });
    const side = makeSideWithHazards(mon, [{ type: "spikes", layers: 1 }]);
    const state = makeBattleState();

    const result = ruleset.applyEntryHazards(mon, side as any, state);

    // 1 layer Spikes = 1/8 max HP = floor(200/8) = 25
    expect(result.damage).toBe(25);
  });

  it("given a Flying-type with NO Gravity and NO Iron Ball, when stepping on Spikes, then takes no damage (immune)", () => {
    // Source: Bulbapedia -- Flying-types are immune to Spikes unless grounded.
    // Control test: without grounding effects, Flying-type is immune.
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ types: ["flying"], maxHp: 200 });
    const side = makeSideWithHazards(mon, [{ type: "spikes", layers: 1 }]);
    const state = makeBattleState();

    const result = ruleset.applyEntryHazards(mon, side as any, state);

    expect(result.damage).toBe(0);
  });
});

// ===========================================================================
// #376 -- Unaware takes priority over Simple in stat stage calc
// ===========================================================================

describe("#376 Unaware takes priority over Simple in damage calc", () => {
  it("given attacker with Simple (+2 attack stage doubled to +4) vs defender with Unaware, when calculating damage, then Unaware ignores attacker's stages (effective stage = 0)", () => {
    // Source: Showdown Gen 4 -- Unaware's onAnyModifyBoost sets boosts to 0,
    //   which runs independently of and overrides Simple's doubling.
    // We test indirectly through the ruleset's calculateDamage: with Unaware,
    // the attack boost should be ignored, resulting in lower damage.
    const ruleset = makeRuleset();

    const attacker = makeActivePokemon({
      ability: "simple",
      types: ["normal"],
      statStages: { attack: 2 }, // Simple would double to +4
    });
    const defender = makeActivePokemon({
      ability: "unaware",
      types: ["normal"],
    });
    const move = makeMove({ power: 50, type: "normal", category: "physical" });
    const rng = createMockRng({ intReturn: 100 }); // max damage roll

    // With Unaware: attacker's attack stages are ignored (effective = 0)
    const resultWithUnaware = ruleset.calculateDamage({
      attacker,
      defender,
      move,
      state: makeBattleState(),
      rng: rng as any,
      isCrit: false,
    });

    // Now test without Unaware: Simple doubles +2 to +4
    const defenderNoUnaware = makeActivePokemon({
      ability: "blaze",
      types: ["normal"],
    });
    const rng2 = createMockRng({ intReturn: 100 });
    const resultWithoutUnaware = ruleset.calculateDamage({
      attacker,
      defender: defenderNoUnaware,
      move,
      state: makeBattleState(),
      rng: rng2 as any,
      isCrit: false,
    });

    // With Unaware, damage should be lower (no attack boost)
    // Without Unaware, Simple doubles +2 to +4 attack stage
    expect(resultWithUnaware.damage).toBeLessThan(resultWithoutUnaware.damage);
  });

  it("given attacker with Simple (+1 attack stage) vs defender without Unaware, when calculating damage, then Simple doubles the stage to +2", () => {
    // Source: Showdown Gen 4 -- Simple doubles stat stages.
    // Control test: Simple works normally when Unaware is not present.
    const ruleset = makeRuleset();

    const attackerSimple = makeActivePokemon({
      ability: "simple",
      types: ["normal"],
      statStages: { attack: 1 }, // Simple doubles to +2
    });
    const attackerNormal = makeActivePokemon({
      ability: "blaze",
      types: ["normal"],
      statStages: { attack: 2 }, // Normal +2
    });
    const defender = makeActivePokemon({ types: ["normal"] });
    const move = makeMove({ power: 50, type: "normal", category: "physical" });
    const rng1 = createMockRng({ intReturn: 100 });
    const rng2 = createMockRng({ intReturn: 100 });

    // Simple with +1 = effective +2
    const resultSimple = ruleset.calculateDamage({
      attacker: attackerSimple,
      defender,
      move,
      state: makeBattleState(),
      rng: rng1 as any,
      isCrit: false,
    });

    // Normal with +2 = effective +2
    const resultNormal = ruleset.calculateDamage({
      attacker: attackerNormal,
      defender,
      move,
      state: makeBattleState(),
      rng: rng2 as any,
      isCrit: false,
    });

    // Both should yield the same damage (both effective +2 attack)
    expect(resultSimple.damage).toBe(resultNormal.damage);
  });
});

// ===========================================================================
// #439 -- Lucky Chant blocks critical hits in rollCritical
// ===========================================================================

describe("#439 Lucky Chant blocks critical hits", () => {
  it("given Lucky Chant active on defender's side, when rollCritical called 100 times, then always returns false", () => {
    // Source: pret/pokeplatinum src/battle/battle_lib.c BattleSystem_CalcCriticalMulti
    //   line 7137: (sideConditions & SIDE_CONDITION_LUCKY_CHANT) == FALSE
    // Lucky Chant blocks all crits for the protected side.
    const ruleset = makeRuleset();
    const attacker = makeActivePokemon({ ability: "none" });
    const defender = makeActivePokemon({ ability: "none" });
    const move = makeMove({ critRatio: 0 });

    // Defender is on side 1, with Lucky Chant active
    const side0 = makeSide(0, attacker);
    const side1Lucky = {
      ...makeSide(1, defender),
      luckyChant: { active: true, turnsLeft: 5 },
    } as BattleSide;
    const state = makeBattleState({ sides: [side0, side1Lucky] });

    for (let seed = 1; seed <= 100; seed++) {
      const rng = new SeededRandom(seed);
      const result = ruleset.rollCritical({
        attacker,
        defender,
        move,
        state,
        rng,
      });
      expect(result).toBe(false);
    }
  });

  it("given Lucky Chant NOT active on defender's side, when rollCritical called, then crits can land normally", () => {
    // Source: pret/pokeplatinum -- without Lucky Chant, normal crit rules apply.
    // Control test: Lucky Chant inactive, crits should be possible.
    const ruleset = makeRuleset();
    const attacker = makeActivePokemon({ ability: "none" });
    const defender = makeActivePokemon({ ability: "none" });
    const move = makeMove({ critRatio: 0 });

    const side0 = makeSide(0, attacker);
    const side1 = makeSide(1, defender);
    const state = makeBattleState({ sides: [side0, side1] });

    let anyTrue = false;
    for (let seed = 1; seed <= 200; seed++) {
      const rng = new SeededRandom(seed);
      const result = ruleset.rollCritical({
        attacker,
        defender,
        move,
        state,
        rng,
      });
      if (result) anyTrue = true;
    }
    // At stage 0, crit rate is 1/16 = 6.25%. Over 200 rolls, we expect at least 1 crit.
    expect(anyTrue).toBe(true);
  });
});

// ===========================================================================
// #453 -- Tangled Feet applies 0.5x accuracy multiplier (not +2 evasion stage)
// ===========================================================================

describe("#453 Tangled Feet applies 0.5x accuracy multiplier", () => {
  it("given confused defender with Tangled Feet and 100-acc move, when checking accuracy, then effective accuracy is 50 (0.5x)", () => {
    // Source: Showdown data/abilities.ts -- Tangled Feet onModifyAccuracy: accuracy * 0.5
    // 100 accuracy move at neutral stages: calc = floor(3*100/3) = 100
    // After Tangled Feet: calc = floor(100 * 0.5) = 50
    // With rng roll = 50, the move should hit (roll <= calc).
    const ruleset = makeRuleset();
    const attacker = makeActivePokemon({});
    const defender = makeActivePokemon({
      ability: "tangled-feet",
      volatiles: new Map([["confusion", { turnsLeft: 3 }]]),
    });
    const move = makeMove({ accuracy: 100 });
    const rng = createMockRng({ intReturn: 50 });

    const context: AccuracyContext = {
      attacker,
      defender,
      move,
      state: makeBattleState(),
      rng: rng as any,
    };
    const result = ruleset.doesMoveHit(context);
    expect(result).toBe(true); // roll 50 <= calc 50 = hit
  });

  it("given confused defender with Tangled Feet and 100-acc move, when rng rolls 51, then move misses", () => {
    // Source: Showdown data/abilities.ts -- Tangled Feet onModifyAccuracy: accuracy * 0.5
    // calc = floor(100 * 0.5) = 50. rng = 51 > 50 => miss.
    // If Tangled Feet used +2 evasion (0.6x), calc would be 60 and rng 51 would hit.
    // This proves the 0.5x multiplier is used, not +2 evasion stage.
    const ruleset = makeRuleset();
    const attacker = makeActivePokemon({});
    const defender = makeActivePokemon({
      ability: "tangled-feet",
      volatiles: new Map([["confusion", { turnsLeft: 3 }]]),
    });
    const move = makeMove({ accuracy: 100 });
    const rng = createMockRng({ intReturn: 51 });

    const context: AccuracyContext = {
      attacker,
      defender,
      move,
      state: makeBattleState(),
      rng: rng as any,
    };
    const result = ruleset.doesMoveHit(context);
    expect(result).toBe(false); // roll 51 > calc 50 = miss
  });
});
