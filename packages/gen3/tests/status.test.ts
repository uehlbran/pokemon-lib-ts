import type { ActivePokemon, BattleAction, BattleState } from "@pokemon-lib-ts/battle";
import type { PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen3DataManager } from "../src/data";
import { Gen3Ruleset } from "../src/Gen3Ruleset";

/**
 * Gen 3 Status Tests
 *
 * Verifies the gen-specific overrides already implemented in Gen3Ruleset:
 *   - applyStatusDamage: burn = 1/8 max HP (Gen 3-6; Gen 7+ uses 1/16)
 *   - applyStatusDamage: poison = 1/8 max HP (same as BaseRuleset, confirmed)
 *   - getEffectiveSpeed (via resolveTurnOrder): paralysis = 0.25x (Gen 3-6; Gen 7+ uses 0.5x)
 */

function makeRuleset(): Gen3Ruleset {
  return new Gen3Ruleset(createGen3DataManager());
}

/** Minimal PokemonInstance for status/speed tests. */
function makePokemonInstance(overrides: {
  maxHp?: number;
  speed?: number;
  status?: PokemonInstance["status"];
  level?: number;
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  const speed = overrides.speed ?? 100;
  return {
    uid: "test",
    speciesId: 1,
    nickname: null,
    level: overrides.level ?? 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: maxHp,
    moves: [],
    ability: "",
    abilitySlot: "normal1" as const,
    heldItem: null,
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
      speed,
    },
  } as PokemonInstance;
}

/** Minimal ActivePokemon for status/speed tests. */
function makeActivePokemon(overrides: {
  maxHp?: number;
  speed?: number;
  status?: PokemonInstance["status"];
  types?: PokemonType[];
  level?: number;
}): ActivePokemon {
  return {
    pokemon: makePokemonInstance(overrides),
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
    types: overrides.types ?? ["normal"],
    ability: "",
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

/** Minimal BattleState stub for applyStatusDamage (unused but required by interface). */
const STUB_STATE = {} as BattleState;

// ---------------------------------------------------------------------------
// Burn damage
// ---------------------------------------------------------------------------

describe("Gen3 burn damage", () => {
  it("given a Pokemon with 160 maxHP, when burn damage is applied, then takes 20 HP (1/8 maxHP)", () => {
    // Source: pret/pokeemerald src/battle_util.c — burn tick = maxHP / 8
    // Gen 3-6: burn = 1/8 max HP. Gen 7+ changed to 1/16 (BaseRuleset default).
    // Derivation: floor(160 / 8) = 20
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ maxHp: 160, status: "burn" });
    expect(ruleset.applyStatusDamage(mon, "burn", STUB_STATE)).toBe(20);
  });

  it("given a Pokemon with 200 maxHP, when burn damage is applied, then takes 25 HP (1/8 maxHP)", () => {
    // Source: pret/pokeemerald src/battle_util.c — burn tick = maxHP / 8
    // Derivation: floor(200 / 8) = 25
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ maxHp: 200, status: "burn" });
    expect(ruleset.applyStatusDamage(mon, "burn", STUB_STATE)).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// Poison damage (same as BaseRuleset, confirmed 1/8 max HP in Gen 3)
// ---------------------------------------------------------------------------

describe("Gen3 poison damage", () => {
  it("given a Pokemon with 160 maxHP, when poison damage is applied, then takes 20 HP (1/8 maxHP)", () => {
    // Source: pret/pokeemerald src/battle_util.c — poison tick = maxHP / 8
    // Poison damage is the same in Gen 3 as the BaseRuleset default (1/8).
    // Derivation: floor(160 / 8) = 20
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ maxHp: 160, status: "poison" });
    expect(ruleset.applyStatusDamage(mon, "poison", STUB_STATE)).toBe(20);
  });

  it("given a Pokemon with 200 maxHP, when poison damage is applied, then takes 25 HP (1/8 maxHP)", () => {
    // Source: pret/pokeemerald src/battle_util.c — poison tick = maxHP / 8
    // Derivation: floor(200 / 8) = 25
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ maxHp: 200, status: "poison" });
    expect(ruleset.applyStatusDamage(mon, "poison", STUB_STATE)).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// Paralysis speed penalty (indirect: via resolveTurnOrder)
//
// getEffectiveSpeed is protected, so we test it indirectly by constructing
// two Pokemon — one paralyzed, one healthy — and confirming the paralyzed
// Pokemon moves second in turn order.
// ---------------------------------------------------------------------------

describe("Gen3 paralysis speed penalty", () => {
  /**
   * Build a minimal BattleState with two sides, each side having one active Pokemon.
   * Side 0 = paralyzed Pokemon (base speed 100).
   * Side 1 = healthy Pokemon (base speed 50).
   *
   * In Gen 3, paralysis reduces speed by 0.25x: 100 * 0.25 = 25.
   * The healthy Pokemon (50 speed) should therefore be faster than the paralyzed one (25).
   */
  function buildTwoSideState(
    side0Pokemon: ActivePokemon,
    side1Pokemon: ActivePokemon,
  ): BattleState {
    const makeSide = (index: 0 | 1, active: ActivePokemon) => ({
      index,
      trainer: null,
      team: [],
      active: [active],
      hazards: [],
      screens: [],
      tailwind: { active: false, turnsLeft: 0 },
      luckyChant: { active: false, turnsLeft: 0 },
      wish: null,
      futureAttack: null,
      faintCount: 0,
      gimmickUsed: false,
    });

    return {
      phase: "action-select",
      generation: 3,
      format: "singles",
      turnNumber: 1,
      sides: [makeSide(0, side0Pokemon), makeSide(1, side1Pokemon)],
      weather: null,
      terrain: null,
      trickRoom: { active: false, turnsLeft: 0 },
      magicRoom: { active: false, turnsLeft: 0 },
      wonderRoom: { active: false, turnsLeft: 0 },
      gravity: { active: false, turnsLeft: 0 },
      turnHistory: [],
      rng: {
        next: () => 0,
        int: () => 1,
        chance: () => false,
        pick: <T>(arr: readonly T[]) => arr[0] as T,
        shuffle: <T>(arr: T[]) => arr,
        getState: () => 0,
        setState: () => {},
      },
      ended: false,
      winner: null,
    } as unknown as BattleState;
  }

  it("given a paralyzed Pokemon with 100 base speed, when turn order is resolved, then it moves after a healthy 50-speed Pokemon", () => {
    // Source: pret/pokeemerald src/battle_util.c — paralyzed speed = speed / 4
    // Gen 3-6: paralysis quarters speed (×0.25). Gen 7+ changed to ×0.5.
    // Paralyzed Pokemon: floor(100 * 0.25) = 25 effective speed
    // Healthy Pokemon: 50 base speed, no penalty
    // Result: healthy (50) > paralyzed (25), so healthy Pokemon moves first
    const paralyzedMon = makeActivePokemon({ speed: 100, status: "paralysis" });
    const healthyMon = makeActivePokemon({ speed: 50, status: null });

    const state = buildTwoSideState(paralyzedMon, healthyMon);
    const ruleset = makeRuleset();

    // Create minimal move actions for both sides
    // Add moves to the pokemon so the action system can find them
    (paralyzedMon.pokemon.moves as unknown[]).push({ moveId: "tackle", pp: 35, maxPp: 35 });
    (healthyMon.pokemon.moves as unknown[]).push({ moveId: "tackle", pp: 35, maxPp: 35 });

    const actions: BattleAction[] = [
      { type: "move", side: 0, slot: 0, moveIndex: 0 },
      { type: "move", side: 1, slot: 0, moveIndex: 0 },
    ];

    const rng = new SeededRandom(1);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    // Side 1 (healthy, 50 speed) should move before side 0 (paralyzed, 25 eff. speed)
    expect(ordered[0]).toEqual(actions[1]); // healthy moves first
    expect(ordered[1]).toEqual(actions[0]); // paralyzed moves second
  });

  it("given a paralyzed Pokemon with 100 base speed vs a healthy 20-speed Pokemon, when turn order is resolved, then paralyzed moves first (25 > 20)", () => {
    // Source: pret/pokeemerald src/battle_util.c — paralyzed speed = speed / 4
    // Paralyzed: floor(100 * 0.25) = 25 effective speed
    // Healthy: 20 base speed
    // Result: paralyzed (25) > healthy (20), so paralyzed Pokemon moves first
    const paralyzedMon = makeActivePokemon({ speed: 100, status: "paralysis" });
    const slowMon = makeActivePokemon({ speed: 20, status: null });

    const state = buildTwoSideState(paralyzedMon, slowMon);
    const ruleset = makeRuleset();

    (paralyzedMon.pokemon.moves as unknown[]).push({ moveId: "tackle", pp: 35, maxPp: 35 });
    (slowMon.pokemon.moves as unknown[]).push({ moveId: "tackle", pp: 35, maxPp: 35 });

    const actions: BattleAction[] = [
      { type: "move", side: 0, slot: 0, moveIndex: 0 },
      { type: "move", side: 1, slot: 0, moveIndex: 0 },
    ];

    const rng = new SeededRandom(1);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    // Side 0 (paralyzed, 25 eff. speed) should move before side 1 (healthy, 20 speed)
    expect(ordered[0]).toEqual(actions[0]); // paralyzed moves first (still faster)
    expect(ordered[1]).toEqual(actions[1]); // slow Pokemon moves second
  });
});
