/**
 * Regression tests for Gen 2 mechanic bug fixes.
 *
 * Issues fixed:
 * - #214: Metal Powder unconditional (missing transform check)
 * - #251: Counter reflects wrong types (should only reflect Normal/Fighting)
 * - #252: Whirlwind/Roar wrong priority (-1 instead of -6)
 * - #253: Hyper Beam recharge not skipped on miss (only on KO)
 * - #325: Attract and Nightmare volatile not cleared on switch-out
 * - #328: Baton Pass missing perish song counter, substitute, and curse transfer
 * - #329: Bright Powder accuracy reduction not implemented
 * - #330: SolarBeam not halved in rain; Thunder always-hit in rain
 * - #331: Moonlight/Morning Sun/Synthesis healing not weather-dependent
 * - #333: Perish Song counter not cleared on switch-out
 * - #375: Test docstring fix (tested by existing file correction)
 */

import type {
  ActivePokemon,
  BattleSide,
  BattleState,
  DamageContext,
  MoveEffectContext,
} from "@pokemon-lib-ts/battle";
import type {
  MoveData,
  PokemonInstance,
  PokemonType,
  PrimaryStatus,
  StatBlock,
  TypeChart,
} from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen2DataManager } from "../src/data";
import { calculateGen2Damage } from "../src/Gen2DamageCalc";
import { handleCustomEffect, type MutableResult } from "../src/Gen2MoveEffects";
import { Gen2Ruleset } from "../src/Gen2Ruleset";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockActive(
  overrides: Partial<{
    level: number;
    currentHp: number;
    maxHp: number;
    attack: number;
    defense: number;
    spAttack: number;
    spDefense: number;
    speed: number;
    status: string | null;
    types: string[];
    heldItem: string | null;
    speciesId: number;
    nickname: string | null;
    moves: Array<{ moveId: string; pp: number; maxPp: number }>;
    lastDamageTaken: number;
    lastDamageCategory: string | null;
    lastDamageType: string | null;
    lastMoveUsed: string | null;
    transformed: boolean;
  }> = {},
): ActivePokemon {
  const maxHp = overrides.maxHp ?? 200;
  return {
    pokemon: {
      speciesId: overrides.speciesId ?? 1,
      level: overrides.level ?? 50,
      currentHp: overrides.currentHp ?? maxHp,
      status: (overrides.status as unknown as PrimaryStatus | null) ?? null,
      heldItem: overrides.heldItem ?? null,
      nickname: overrides.nickname ?? null,
      ivs: { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      moves: overrides.moves ?? [{ moveId: "tackle", pp: 35, maxPp: 35 }],
      calculatedStats: {
        hp: maxHp,
        attack: overrides.attack ?? 100,
        defense: overrides.defense ?? 100,
        spAttack: overrides.spAttack ?? 100,
        spDefense: overrides.spDefense ?? 100,
        speed: overrides.speed ?? 100,
      },
      friendship: 70,
    },
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
    types: (overrides.types as unknown as PokemonType[]) ?? ["normal"],
    ability: "",
    lastMoveUsed: overrides.lastMoveUsed ?? null,
    turnsOnField: 0,
    movedThisTurn: false,
    consecutiveProtects: 0,
    substituteHp: 0,
    transformed: overrides.transformed ?? false,
    transformedSpecies: null,
    isMega: false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    stellarBoostedTypes: [],
    lastDamageTaken: overrides.lastDamageTaken ?? 0,
    lastDamageCategory: overrides.lastDamageCategory ?? null,
    lastDamageType: overrides.lastDamageType ?? null,
  } as unknown as ActivePokemon;
}

function createMockSide(
  index: 0 | 1,
  active: ActivePokemon,
  team: PokemonInstance[] = [],
): BattleSide {
  return {
    index,
    trainer: null,
    team: team.length > 0 ? team : [active.pokemon as unknown as PokemonInstance],
    active: [active],
    hazards: [],
    screens: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
    gimmickUsed: false,
  } as unknown as BattleSide;
}

function createMockState(
  side0: BattleSide,
  side1: BattleSide,
  weather: { type: string; turnsLeft: number } | null = null,
): BattleState {
  return {
    sides: [side0, side1],
    turn: 1,
    weather,
    terrain: null,
    trickRoom: null,
    format: { id: "singles", slots: 1 },
  } as unknown as BattleState;
}

function createMove(id: string, overrides?: Partial<MoveData>): MoveData {
  return {
    id,
    displayName: id,
    type: "normal",
    category: "physical",
    power: 80,
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
    ...overrides,
  } as MoveData;
}

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

function createMockRng(intReturnValue: number) {
  return {
    next: () => 0,
    int: (_min: number, _max: number) => intReturnValue,
    chance: () => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  } as unknown as SeededRandom;
}

function createSpecies() {
  return {
    id: 1,
    name: "test",
    displayName: "Test",
    types: ["normal"],
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const ruleset = new Gen2Ruleset();

// =========================================================================
// #214: Metal Powder transform check
// =========================================================================

describe("#214 — Metal Powder should not apply when Ditto is Transformed", () => {
  it("given untransformed Ditto holding Metal Powder, when physical attack received, then defense is doubled", () => {
    // Source: pret/pokecrystal engine/battle/core.asm — Metal Powder doubles Defense for untransformed Ditto
    const attacker = createMockActive({
      level: 50,
      attack: 100,
      types: ["normal"],
    });
    const defender = createMockActive({
      level: 50,
      defense: 80,
      speciesId: 132, // Ditto
      heldItem: "metal-powder",
      transformed: false,
      types: ["normal"],
    });
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
    const typeChart = createNeutralTypeChart();

    const result = calculateGen2Damage(
      {
        attacker,
        defender,
        move: createMove("tackle", { type: "normal", power: 40, category: "physical" }),
        state,
        rng: createMockRng(255),
        isCrit: false,
      } as DamageContext,
      typeChart,
      createSpecies() as any,
    );

    // With Metal Powder: defense 80 * 2 = 160
    // Without Metal Powder: defense 80
    // The damage should be lower with Metal Powder active
    // levelFactor = floor(2*50/5)+2 = 22
    // A=100, D=160 (doubled by Metal Powder)
    // floor(floor(22*40*100)/160/50) = floor(550/50) = 11
    // +2 = 13, then STAB (attacker is Normal, move is Normal): floor(13 * 1.5) = 19
    // floor(19 * 255/255) = 19
    // Source: inline formula derivation + pret/pokecrystal BattleCommand_Stab
    expect(result.damage).toBe(19);
  });

  it("given Transformed Ditto holding Metal Powder, when physical attack received, then defense is NOT doubled", () => {
    // Source: pret/pokecrystal engine/battle/core.asm — Metal Powder check skips if SUBSTATUS_TRANSFORMED
    const attacker = createMockActive({
      level: 50,
      attack: 100,
      types: ["normal"],
    });
    const defender = createMockActive({
      level: 50,
      defense: 80,
      speciesId: 132, // Ditto
      heldItem: "metal-powder",
      transformed: true, // Ditto has Transformed
      types: ["normal"],
    });
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
    const typeChart = createNeutralTypeChart();

    const result = calculateGen2Damage(
      {
        attacker,
        defender,
        move: createMove("tackle", { type: "normal", power: 40, category: "physical" }),
        state,
        rng: createMockRng(255),
        isCrit: false,
      } as DamageContext,
      typeChart,
      createSpecies() as any,
    );

    // Without Metal Powder effect: defense stays at 80 (Ditto is Transformed)
    // levelFactor = 22, A=100, D=80
    // floor(floor(22*40*100)/80/50) = floor(1100/50) = 22
    // +2 = 24, then STAB (attacker is Normal, move is Normal): floor(24 * 1.5) = 36
    // floor(36 * 255/255) = 36
    // Source: inline formula derivation + pret/pokecrystal BattleCommand_Stab
    expect(result.damage).toBe(36);
  });
});

// =========================================================================
// #251: Counter type restriction
// =========================================================================

describe("#251 — Counter reflects ALL physical-type damage in Gen 2", () => {
  // Source: pret/pokecrystal engine/battle/move_effects/counter.asm:33-35
  //   ld a, [wStringBuffer1 + MOVE_TYPE]
  //   cp SPECIAL        ; SPECIAL = 20 (Fire is first special type)
  //   ret nc            ; fail if type >= SPECIAL
  // Counter works on ALL physical types (type < SPECIAL), not just Normal/Fighting
  // like Gen 1. Physical types: Normal, Fighting, Flying, Poison, Ground, Rock, Bug, Ghost, Steel.
  const counterMove = createMove("counter", {
    type: "fighting",
    category: "physical",
    power: null,
    priority: -1,
    effect: null,
  });

  it("given attacker took physical Normal-type damage, when Counter is used, then reflects 2x damage", () => {
    // Source: pret/pokecrystal counter.asm — Normal (type 0) < SPECIAL → Counter succeeds.
    const attacker = createMockActive({
      lastDamageTaken: 50,
      lastDamageCategory: "physical",
      lastDamageType: "normal",
    });
    const defender = createMockActive();
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

    const result = ruleset.executeMoveEffect({
      attacker,
      defender,
      move: counterMove,
      damage: 0,
      state,
      rng: new SeededRandom(42),
    });

    expect(result.customDamage).toEqual({
      target: "defender",
      amount: 100,
      source: "counter",
    });
  });

  it("given attacker took physical Fighting-type damage, when Counter is used, then reflects 2x damage", () => {
    // Source: pret/pokecrystal counter.asm — Fighting (type 1) < SPECIAL → Counter succeeds.
    const attacker = createMockActive({
      lastDamageTaken: 60,
      lastDamageCategory: "physical",
      lastDamageType: "fighting",
    });
    const defender = createMockActive();
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

    const result = ruleset.executeMoveEffect({
      attacker,
      defender,
      move: counterMove,
      damage: 0,
      state,
      rng: new SeededRandom(42),
    });

    expect(result.customDamage).toEqual({
      target: "defender",
      amount: 120,
      source: "counter",
    });
  });

  it("given attacker took physical Rock-type damage, when Counter is used, then reflects 2x damage", () => {
    // Source: pret/pokecrystal counter.asm — Rock (type 5) < SPECIAL → Counter succeeds.
    // In Gen 2, Counter works on ALL physical types, not just Normal/Fighting.
    const attacker = createMockActive({
      lastDamageTaken: 80,
      lastDamageCategory: "physical",
      lastDamageType: "rock",
    });
    const defender = createMockActive();
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

    const result = ruleset.executeMoveEffect({
      attacker,
      defender,
      move: counterMove,
      damage: 0,
      state,
      rng: new SeededRandom(42),
    });

    expect(result.customDamage).toEqual({
      target: "defender",
      amount: 160,
      source: "counter",
    });
  });

  it("given attacker took physical Ground-type damage, when Counter is used, then reflects 2x damage", () => {
    // Source: pret/pokecrystal counter.asm — Ground (type 4) < SPECIAL → Counter succeeds.
    const attacker = createMockActive({
      lastDamageTaken: 90,
      lastDamageCategory: "physical",
      lastDamageType: "ground",
    });
    const defender = createMockActive();
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

    const result = ruleset.executeMoveEffect({
      attacker,
      defender,
      move: counterMove,
      damage: 0,
      state,
      rng: new SeededRandom(42),
    });

    expect(result.customDamage).toEqual({
      target: "defender",
      amount: 180,
      source: "counter",
    });
  });

  it("given attacker took special Water-type damage, when Counter is used, then fails", () => {
    // Source: pret/pokecrystal counter.asm — Water (type 21) >= SPECIAL → Counter fails.
    const attacker = createMockActive({
      lastDamageTaken: 70,
      lastDamageCategory: "special",
      lastDamageType: "water",
    });
    const defender = createMockActive();
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

    const result = ruleset.executeMoveEffect({
      attacker,
      defender,
      move: counterMove,
      damage: 0,
      state,
      rng: new SeededRandom(42),
    });

    expect(result.customDamage).toBeUndefined();
    expect(result.messages).toContain("But it failed!");
  });
});

// =========================================================================
// #252: Whirlwind/Roar priority
// =========================================================================

describe("#252 — Whirlwind/Roar should have priority -6", () => {
  it("given Gen 2 moves.json, when loading Whirlwind, then priority is -6", () => {
    // Source: pret/pokecrystal engine/battle/core.asm — Whirlwind/Roar always go last
    // Source: Bulbapedia — Whirlwind has -6 priority in Gen 2+
    const dm = createGen2DataManager();
    const move = dm.getMove("whirlwind");
    expect(move.priority).toBe(-6);
  });

  it("given Gen 2 moves.json, when loading Roar, then priority is -6", () => {
    // Source: pret/pokecrystal engine/battle/core.asm — Whirlwind/Roar always go last
    // Source: Bulbapedia — Roar has -6 priority in Gen 2+
    const dm = createGen2DataManager();
    const move = dm.getMove("roar");
    expect(move.priority).toBe(-6);
  });
});

// =========================================================================
// #253: Hyper Beam recharge only on KO
// =========================================================================

describe("#253 — Hyper Beam recharge skipped only on KO, NOT on miss", () => {
  const hyperBeamMove = createMove("hyper-beam", {
    type: "normal",
    category: "special",
    power: 150,
    flags: { recharge: true } as any,
    effect: null,
  });

  it("given Hyper Beam KOs the target (currentHp === 0), when executeMoveEffect, then noRecharge is true", () => {
    // Source: pret/pokecrystal engine/battle/core.asm HyperBeamCheck
    // Skip recharge when target faints.
    const attacker = createMockActive();
    const defender = createMockActive({ currentHp: 0, maxHp: 200 });
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

    const result = ruleset.executeMoveEffect({
      attacker,
      defender,
      move: hyperBeamMove,
      damage: 150,
      state,
      rng: new SeededRandom(42),
    });

    expect(result.noRecharge).toBe(true);
  });

  it("given Hyper Beam misses (damage=0, defender alive), when executeMoveEffect, then noRecharge is NOT set", () => {
    // Source: pret/pokecrystal engine/battle/core.asm HyperBeamCheck
    // In Gen 2 (unlike Gen 1), missing does NOT skip recharge.
    const attacker = createMockActive();
    const defender = createMockActive({ currentHp: 150, maxHp: 200 });
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

    const result = ruleset.executeMoveEffect({
      attacker,
      defender,
      move: hyperBeamMove,
      damage: 0,
      state,
      rng: new SeededRandom(42),
    });

    // noRecharge should be falsy (undefined) — user must recharge even on miss
    expect(result.noRecharge).toBeFalsy();
  });

  it("given Hyper Beam hits but target survives, when executeMoveEffect, then noRecharge is NOT set", () => {
    // Source: pret/pokecrystal engine/battle/core.asm HyperBeamCheck
    // Target surviving also means no recharge skip.
    const attacker = createMockActive();
    const defender = createMockActive({ currentHp: 50, maxHp: 200 });
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

    const result = ruleset.executeMoveEffect({
      attacker,
      defender,
      move: hyperBeamMove,
      damage: 100,
      state,
      rng: new SeededRandom(42),
    });

    expect(result.noRecharge).toBeFalsy();
  });
});

// =========================================================================
// #325: Attract and Nightmare cleared on switch-out
// =========================================================================

describe("#325 — Attract and Nightmare volatile cleared on switch-out", () => {
  it("given Pokemon has Attract volatile, when switching out, then Attract is cleared", () => {
    // Source: pret/pokecrystal engine/battle/core.asm:4078-4104 NewBattleMonStatus
    // Source: gen2-ground-truth.md Switching Mechanics — Attract resets on switch
    const pokemon = createMockActive({ lastMoveUsed: "tackle" });
    pokemon.volatileStatuses.set("infatuation", { turnsLeft: -1 });
    const state = createMockState(
      createMockSide(0, pokemon),
      createMockSide(1, createMockActive()),
    );

    ruleset.onSwitchOut(pokemon, state);

    expect(pokemon.volatileStatuses.has("infatuation")).toBe(false);
  });

  it("given Pokemon has Nightmare volatile, when switching out, then Nightmare is cleared", () => {
    // Source: pret/pokecrystal engine/battle/core.asm:4078-4104 NewBattleMonStatus
    // Source: gen2-ground-truth.md Switching Mechanics — Nightmare resets on switch
    const pokemon = createMockActive({ lastMoveUsed: "tackle" });
    pokemon.volatileStatuses.set("nightmare", { turnsLeft: -1 });
    const state = createMockState(
      createMockSide(0, pokemon),
      createMockSide(1, createMockActive()),
    );

    ruleset.onSwitchOut(pokemon, state);

    expect(pokemon.volatileStatuses.has("nightmare")).toBe(false);
  });

  it("given Pokemon has both Attract and Nightmare, when switching out, then both are cleared", () => {
    // Source: pret/pokecrystal — both are non-persistent volatiles
    const pokemon = createMockActive({ lastMoveUsed: "tackle" });
    pokemon.volatileStatuses.set("infatuation", { turnsLeft: -1 });
    pokemon.volatileStatuses.set("nightmare", { turnsLeft: -1 });
    const state = createMockState(
      createMockSide(0, pokemon),
      createMockSide(1, createMockActive()),
    );

    ruleset.onSwitchOut(pokemon, state);

    expect(pokemon.volatileStatuses.has("infatuation")).toBe(false);
    expect(pokemon.volatileStatuses.has("nightmare")).toBe(false);
  });
});

// =========================================================================
// #328: Baton Pass transfers perish-song, substitute, curse
// =========================================================================

describe("#328 — Baton Pass should transfer perish-song, substitute, and curse", () => {
  it("given Baton Pass switch, when onSwitchOut is called, then perish-song is preserved", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm BatonPassEffect
    // Perish Song counter transfers via Baton Pass.
    const pokemon = createMockActive({ lastMoveUsed: "baton-pass" });
    pokemon.volatileStatuses.set("perish-song", { turnsLeft: 2, data: { counter: 2 } });
    const state = createMockState(
      createMockSide(0, pokemon),
      createMockSide(1, createMockActive()),
    );

    ruleset.onSwitchOut(pokemon, state);

    expect(pokemon.volatileStatuses.has("perish-song")).toBe(true);
  });

  it("given Baton Pass switch, when onSwitchOut is called, then substitute is preserved", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm BatonPassEffect
    // Substitute HP and flag transfer via Baton Pass.
    const pokemon = createMockActive({ lastMoveUsed: "baton-pass" });
    pokemon.volatileStatuses.set("substitute", { turnsLeft: -1, data: { hp: 50 } });
    const state = createMockState(
      createMockSide(0, pokemon),
      createMockSide(1, createMockActive()),
    );

    ruleset.onSwitchOut(pokemon, state);

    expect(pokemon.volatileStatuses.has("substitute")).toBe(true);
  });

  it("given Baton Pass switch, when onSwitchOut is called, then curse is preserved", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm BatonPassEffect
    // Curse (Ghost-type) transfers via Baton Pass.
    const pokemon = createMockActive({ lastMoveUsed: "baton-pass" });
    pokemon.volatileStatuses.set("curse", { turnsLeft: -1 });
    const state = createMockState(
      createMockSide(0, pokemon),
      createMockSide(1, createMockActive()),
    );

    ruleset.onSwitchOut(pokemon, state);

    expect(pokemon.volatileStatuses.has("curse")).toBe(true);
  });

  it("given normal switch (not Baton Pass), when onSwitchOut, then perish-song/substitute/curse are cleared", () => {
    // Source: pret/pokecrystal engine/battle/core.asm NewBattleMonStatus
    // Normal switch clears all non-persistent volatiles.
    const pokemon = createMockActive({ lastMoveUsed: "tackle" });
    pokemon.volatileStatuses.set("perish-song", { turnsLeft: 2, data: { counter: 2 } });
    pokemon.volatileStatuses.set("substitute", { turnsLeft: -1, data: { hp: 50 } });
    pokemon.volatileStatuses.set("curse", { turnsLeft: -1 });
    const state = createMockState(
      createMockSide(0, pokemon),
      createMockSide(1, createMockActive()),
    );

    ruleset.onSwitchOut(pokemon, state);

    expect(pokemon.volatileStatuses.has("perish-song")).toBe(false);
    expect(pokemon.volatileStatuses.has("substitute")).toBe(false);
    expect(pokemon.volatileStatuses.has("curse")).toBe(false);
  });
});

// =========================================================================
// #329: Bright Powder accuracy reduction
// =========================================================================

describe("#329 — Bright Powder reduces opponent's accuracy by 20/256", () => {
  it("given defender holds Bright Powder, when 100% accurate move used, then accuracy is reduced and can miss", () => {
    // Source: pret/pokecrystal engine/battle/core.asm:1074-1094 BrightPowderEffect
    // "sub 20" — subtracts 20 from the accuracy value
    // A 100% move has accuracy = floor(100*255/100) = 255 on the 0-255 scale
    // After Bright Powder: 255 - 20 = 235
    // If the RNG rolls 235-254, the move misses (previously it would always hit)
    const attacker = createMockActive();
    const defender = createMockActive({ heldItem: "bright-powder" });
    const move = createMove("body-slam", {
      accuracy: 100,
      type: "normal",
      category: "physical",
    });
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

    // Roll 240 (above 235, should miss with Bright Powder)
    const rngMiss = createMockRng(240);
    const hitResult = ruleset.doesMoveHit({
      attacker,
      defender,
      move,
      state,
      rng: rngMiss,
    });

    expect(hitResult).toBe(false);
  });

  it("given defender does NOT hold Bright Powder, when 100% accurate move and RNG=240, then move hits", () => {
    // Source: without Bright Powder, accuracy = 255 and 255 >= 255 means always hit
    const attacker = createMockActive();
    const defender = createMockActive({ heldItem: null });
    const move = createMove("body-slam", {
      accuracy: 100,
      type: "normal",
      category: "physical",
    });
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

    const rng = createMockRng(240);
    const hitResult = ruleset.doesMoveHit({
      attacker,
      defender,
      move,
      state,
      rng,
    });

    // Without Bright Powder, accuracy = 255. 255 >= 255 means always hit (no 1/256 bug in Gen 2)
    expect(hitResult).toBe(true);
  });
});

// =========================================================================
// #330: SolarBeam halved in rain; Thunder always-hit in rain
// =========================================================================

describe("#330 — SolarBeam halved in rain/sandstorm; Thunder always-hit in rain", () => {
  it("given rain weather, when Thunder is used, then it always hits (bypass accuracy)", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm:1286-1290
    // Thunder always hits in rain.
    const attacker = createMockActive();
    const defender = createMockActive();
    const move = createMove("thunder", {
      type: "electric",
      category: "special",
      power: 120,
      accuracy: 70,
    });
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender), {
      type: "rain",
      turnsLeft: 3,
    });

    // Even with a high RNG roll that would normally miss for 70% accuracy
    const rng = createMockRng(250);
    const hitResult = ruleset.doesMoveHit({
      attacker,
      defender,
      move,
      state,
      rng,
    });

    expect(hitResult).toBe(true);
  });

  it("given no weather, when Thunder with 70% accuracy used and RNG=250, then it misses", () => {
    // Source: Thunder's base accuracy is 70%; without rain, normal accuracy rules apply
    // 70% -> floor(70*255/100) = 178 on 0-255 scale
    // RNG roll of 250 > 178 -> miss
    const attacker = createMockActive();
    const defender = createMockActive();
    const move = createMove("thunder", {
      type: "electric",
      category: "special",
      power: 120,
      accuracy: 70,
    });
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender), null);

    const rng = createMockRng(250);
    const hitResult = ruleset.doesMoveHit({
      attacker,
      defender,
      move,
      state,
      rng,
    });

    expect(hitResult).toBe(false);
  });

  it("given sun weather, when Thunder with 70% accuracy used and RNG=100, then it hits at halved accuracy", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm ThunderAccuracy
    // In sun, Thunder's base accuracy is halved: floor(70 * 255 / 100) = 178 → floor(178/2) = 89
    // RNG roll of 100 > 89 → miss; RNG roll of 50 < 89 → hit
    const attacker = createMockActive();
    const defender = createMockActive();
    const move = createMove("thunder", {
      type: "electric",
      category: "special",
      power: 120,
      accuracy: 70,
    });
    const stateSun = createMockState(createMockSide(0, attacker), createMockSide(1, defender), {
      type: "sun",
      turnsLeft: 3,
    });

    // RNG=50 → 50 < 89 → hit (sun halved accuracy: 89)
    const rngHit = createMockRng(50);
    expect(ruleset.doesMoveHit({ attacker, defender, move, state: stateSun, rng: rngHit })).toBe(
      true,
    );

    // RNG=100 → 100 > 89 → miss
    const rngMiss = createMockRng(100);
    expect(ruleset.doesMoveHit({ attacker, defender, move, state: stateSun, rng: rngMiss })).toBe(
      false,
    );
  });

  it("given rain weather, when SolarBeam is used, then power is halved", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm SolarBeamPower
    // SolarBeam power halved in rain: 120 / 2 = 60
    const attacker = createMockActive({
      level: 50,
      spAttack: 100,
      types: ["grass"],
    });
    const defender = createMockActive({
      level: 50,
      spDefense: 100,
      types: ["normal"],
    });
    const stateRain = createMockState(createMockSide(0, attacker), createMockSide(1, defender), {
      type: "rain",
      turnsLeft: 3,
    });
    const stateNone = createMockState(
      createMockSide(0, attacker),
      createMockSide(1, defender),
      null,
    );
    const typeChart = createNeutralTypeChart();
    const species = createSpecies();
    const rng = createMockRng(255);
    const solarBeam = createMove("solar-beam", {
      type: "grass",
      category: "special",
      power: 120,
    });

    const damageRain = calculateGen2Damage(
      {
        attacker,
        defender,
        move: solarBeam,
        state: stateRain,
        rng,
        isCrit: false,
      } as DamageContext,
      typeChart,
      species as any,
    );
    const damageNone = calculateGen2Damage(
      {
        attacker,
        defender,
        move: solarBeam,
        state: stateNone,
        rng,
        isCrit: false,
      } as DamageContext,
      typeChart,
      species as any,
    );

    // Rain halves SolarBeam power (120 -> 60) AND rain halves Grass damage (0.5x weather mod)
    // So rain SolarBeam = power 60 with 0.5x weather = very reduced damage
    // No-weather SolarBeam = power 120 with 1x weather = normal damage
    // Rain damage should be significantly less than no-weather damage
    expect(damageRain.damage).toBeLessThan(damageNone.damage);
  });

  it("given sandstorm weather, when SolarBeam is used, then power is halved", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm SolarBeamPower
    // SolarBeam power halved in sandstorm as well
    const attacker = createMockActive({
      level: 50,
      spAttack: 100,
      types: ["grass"],
    });
    const defender = createMockActive({
      level: 50,
      spDefense: 100,
      types: ["normal"],
    });
    const stateSand = createMockState(createMockSide(0, attacker), createMockSide(1, defender), {
      type: "sand",
      turnsLeft: 3,
    });
    const stateNone = createMockState(
      createMockSide(0, attacker),
      createMockSide(1, defender),
      null,
    );
    const typeChart = createNeutralTypeChart();
    const species = createSpecies();
    const rng = createMockRng(255);
    const solarBeam = createMove("solar-beam", {
      type: "grass",
      category: "special",
      power: 120,
    });

    const damageSand = calculateGen2Damage(
      {
        attacker,
        defender,
        move: solarBeam,
        state: stateSand,
        rng,
        isCrit: false,
      } as DamageContext,
      typeChart,
      species as any,
    );
    const damageNone = calculateGen2Damage(
      {
        attacker,
        defender,
        move: solarBeam,
        state: stateNone,
        rng,
        isCrit: false,
      } as DamageContext,
      typeChart,
      species as any,
    );

    // Sandstorm halves SolarBeam power (120 -> 60)
    // Sandstorm has no weather modifier for Grass moves (only rain/sun do)
    // So damage should be roughly halved
    expect(damageSand.damage).toBeLessThan(damageNone.damage);
  });
});

// =========================================================================
// #331: Moonlight/Morning Sun/Synthesis weather-dependent healing
// =========================================================================

describe("#331 — Weather-dependent healing for Moonlight/Morning Sun/Synthesis", () => {
  it("given no weather, when Moonlight is used, then heals 1/2 max HP", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm MoonlightEffect
    // No weather: heal 1/2 max HP = floor(200 * 0.5) = 100
    const attacker = createMockActive({ maxHp: 200, currentHp: 50 });
    const defender = createMockActive();
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender), null);
    const result = createEmptyResult();
    const move = createMove("moonlight", {
      category: "status",
      power: null,
      effect: { type: "custom", handler: "moonlight" } as any,
    });

    handleCustomEffect(move, result, {
      attacker,
      defender,
      move,
      damage: 0,
      state,
      rng: createMockRng(0),
    } as MoveEffectContext);

    expect(result.healAmount).toBe(100); // floor(200 * 1/2) = 100
  });

  it("given sun weather, when Morning Sun is used, then heals 2/3 max HP", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm MorningSunEffect
    // Sun: heal 2/3 max HP = floor(200 * 2/3) = floor(133.33) = 133
    const attacker = createMockActive({ maxHp: 200, currentHp: 50 });
    const defender = createMockActive();
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender), {
      type: "sun",
      turnsLeft: 3,
    });
    const result = createEmptyResult();
    const move = createMove("morning-sun", {
      category: "status",
      power: null,
      effect: { type: "custom", handler: "morning-sun" } as any,
    });

    handleCustomEffect(move, result, {
      attacker,
      defender,
      move,
      damage: 0,
      state,
      rng: createMockRng(0),
    } as MoveEffectContext);

    expect(result.healAmount).toBe(133); // floor(200 * 2/3) = 133
  });

  it("given rain weather, when Synthesis is used, then heals 1/4 max HP", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm SynthesisEffect
    // Rain: heal 1/4 max HP = floor(200 * 0.25) = 50
    const attacker = createMockActive({ maxHp: 200, currentHp: 50 });
    const defender = createMockActive();
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender), {
      type: "rain",
      turnsLeft: 3,
    });
    const result = createEmptyResult();
    const move = createMove("synthesis", {
      category: "status",
      power: null,
      effect: { type: "custom", handler: "synthesis" } as any,
    });

    handleCustomEffect(move, result, {
      attacker,
      defender,
      move,
      damage: 0,
      state,
      rng: createMockRng(0),
    } as MoveEffectContext);

    expect(result.healAmount).toBe(50); // floor(200 * 1/4) = 50
  });

  it("given sandstorm weather, when Moonlight is used, then heals 1/4 max HP", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm MoonlightEffect
    // Sandstorm: heal 1/4 max HP = floor(200 * 0.25) = 50
    const attacker = createMockActive({ maxHp: 200, currentHp: 50 });
    const defender = createMockActive();
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender), {
      type: "sand",
      turnsLeft: 3,
    });
    const result = createEmptyResult();
    const move = createMove("moonlight", {
      category: "status",
      power: null,
      effect: { type: "custom", handler: "moonlight" } as any,
    });

    handleCustomEffect(move, result, {
      attacker,
      defender,
      move,
      damage: 0,
      state,
      rng: createMockRng(0),
    } as MoveEffectContext);

    expect(result.healAmount).toBe(50); // floor(200 * 1/4) = 50
  });
});

// =========================================================================
// #333: Perish Song counter cleared on switch-out
// =========================================================================

describe("#333 — Perish Song counter cleared on normal switch-out", () => {
  it("given Pokemon has Perish Song counter, when switching out normally, then counter is cleared", () => {
    // Source: pret/pokecrystal engine/battle/core.asm NewBattleMonStatus
    // Source: gen2-ground-truth.md — Perish Song counter removed on switch-out
    const pokemon = createMockActive({ lastMoveUsed: "tackle" });
    pokemon.volatileStatuses.set("perish-song", { turnsLeft: 2, data: { counter: 2 } });
    const state = createMockState(
      createMockSide(0, pokemon),
      createMockSide(1, createMockActive()),
    );

    ruleset.onSwitchOut(pokemon, state);

    expect(pokemon.volatileStatuses.has("perish-song")).toBe(false);
  });

  it("given Pokemon has Perish Song counter at 1, when switching out normally, then counter is cleared (avoids faint)", () => {
    // Source: gen2-ground-truth.md — switching out removes Perish Song entirely
    // This is the key behavior: switching out saves the Pokemon from Perish Song faint
    const pokemon = createMockActive({ lastMoveUsed: "tackle" });
    pokemon.volatileStatuses.set("perish-song", { turnsLeft: 1, data: { counter: 1 } });
    const state = createMockState(
      createMockSide(0, pokemon),
      createMockSide(1, createMockActive()),
    );

    ruleset.onSwitchOut(pokemon, state);

    expect(pokemon.volatileStatuses.has("perish-song")).toBe(false);
  });
});
