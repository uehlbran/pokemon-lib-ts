/**
 * Gen 8 status damage tests.
 *
 * Gen 8 carries forward the Gen 7 changes:
 *   - Burn: 1/16 max HP (changed from 1/8 in Gen 3-6, Gen 7+ default)
 *   - Poison: 1/8 max HP (unchanged from Gen 3+)
 *   - Badly-poisoned: escalating 1/16 per toxic counter
 *   - Paralysis speed: 0.5x (Gen 7+ default in BaseRuleset)
 *
 * Source: Showdown sim/battle-actions.ts -- Gen 8 status damage unchanged from Gen 7
 * Source: Bulbapedia -- Burn status: "From Generation VII onwards, 1/16 max HP"
 */
import type { ActivePokemon, BattleAction, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import type { SeededRandom } from "@pokemon-lib-ts/core";
import { DataManager } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { Gen8Ruleset } from "../src/Gen8Ruleset";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeActive(
  overrides: {
    hp?: number;
    currentHp?: number;
    speed?: number;
    status?: string | null;
    ability?: string | null;
    heldItem?: string | null;
    speedStage?: number;
    volatiles?: [string, unknown][];
  } = {},
): ActivePokemon {
  const hp = overrides.hp ?? 200;
  return {
    pokemon: {
      calculatedStats: {
        hp,
        speed: overrides.speed ?? 100,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
      },
      currentHp: overrides.currentHp ?? hp,
      status: overrides.status ?? null,
      heldItem: overrides.heldItem ?? null,
      level: 50,
      nickname: null,
      speciesId: 25,
      moves: [{ moveId: "tackle" }],
    },
    ability: overrides.ability ?? null,
    statStages: {
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: overrides.speedStage ?? 0,
      accuracy: 0,
      evasion: 0,
    },
    types: ["electric"],
    volatileStatuses: new Map(
      (overrides.volatiles ?? []).map(([k, v]) => [k, v] as [string, unknown]),
    ),
    substituteHp: 0,
    turnsOnField: 1,
    movedThisTurn: false,
    consecutiveProtects: 0,
    isMega: false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    forcedMove: null,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    itemKnockedOff: false,
    transformed: false,
    transformedSpecies: null,
    suppressedAbility: null,
    teamSlot: 0,
  } as unknown as ActivePokemon;
}

function makeSide(
  index: 0 | 1,
  overrides?: {
    active?: ActivePokemon[];
  },
): BattleSide {
  return {
    index,
    trainer: null,
    team: [],
    active: overrides?.active ?? [],
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

function makeRng(): SeededRandom {
  return {
    next: () => 0.5,
    int: (min: number, _max: number) => min,
    chance: () => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: T[]) => arr,
    getState: () => 0,
    setState: () => {},
  } as unknown as SeededRandom;
}

function makeState(overrides?: { sides?: BattleSide[]; rng?: SeededRandom }): BattleState {
  return {
    phase: "turn-resolve",
    generation: 8,
    format: "singles",
    turnNumber: 1,
    sides: overrides?.sides ?? [makeSide(0), makeSide(1)],
    weather: null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    turnHistory: [],
    rng: overrides?.rng ?? makeRng(),
    ended: false,
    winner: null,
  } as unknown as BattleState;
}

const ruleset = new Gen8Ruleset(new DataManager());

// ===========================================================================
// Burn damage -- 1/16 max HP in Gen 8 (same as Gen 7, changed from 1/8 in Gen 3-6)
// ===========================================================================

describe("Gen8Ruleset -- applyStatusDamage (burn)", () => {
  it("given burned Pokemon with 160 max HP, when applying status damage, then takes 10 HP (160/16)", () => {
    // Source: Showdown sim/battle-actions.ts -- Gen 7+ burn damage is 1/16 max HP
    // Source: Bulbapedia -- Burn: "From Generation VII onwards, 1/16 of maximum HP"
    // 160 / 16 = 10
    const pokemon = makeActive({ hp: 160, status: "burn" });
    const result = ruleset.applyStatusDamage(pokemon, "burn" as never, {} as BattleState);
    expect(result).toBe(10);
  });

  it("given burned Pokemon with 400 max HP, when applying status damage, then takes 25 HP (400/16)", () => {
    // Source: Showdown sim/battle-actions.ts -- Gen 7+ burn damage is floor(maxHp/16)
    // 400 / 16 = 25
    const pokemon = makeActive({ hp: 400, status: "burn" });
    const result = ruleset.applyStatusDamage(pokemon, "burn" as never, {} as BattleState);
    expect(result).toBe(25);
  });

  it("given burned Pokemon with 15 max HP, when applying status damage, then takes minimum 1 HP", () => {
    // Source: Showdown -- damage is max(1, floor(maxHp/16))
    // 15 / 16 = 0.9375, floor = 0, max(1, 0) = 1
    const pokemon = makeActive({ hp: 15, status: "burn" });
    const result = ruleset.applyStatusDamage(pokemon, "burn" as never, {} as BattleState);
    expect(result).toBe(1);
  });
});

// ===========================================================================
// Poison damage -- 1/8 max HP (same as Gen 3+)
// ===========================================================================

describe("Gen8Ruleset -- applyStatusDamage (poison)", () => {
  it("given poisoned Pokemon with 200 max HP, when applying status damage, then takes 25 HP (200/8)", () => {
    // Source: Showdown -- Poison damage is 1/8 max HP in all gens from Gen 3+
    // 200 / 8 = 25
    const pokemon = makeActive({ hp: 200, status: "poison" });
    const result = ruleset.applyStatusDamage(pokemon, "poison" as never, {} as BattleState);
    expect(result).toBe(25);
  });

  it("given poisoned Pokemon with 160 max HP, when applying status damage, then takes 20 HP (160/8)", () => {
    // Source: Showdown -- Poison damage is 1/8 max HP
    // 160 / 8 = 20
    const pokemon = makeActive({ hp: 160, status: "poison" });
    const result = ruleset.applyStatusDamage(pokemon, "poison" as never, {} as BattleState);
    expect(result).toBe(20);
  });
});

// ===========================================================================
// Badly-poisoned damage -- escalating 1/16 per counter
// ===========================================================================

describe("Gen8Ruleset -- applyStatusDamage (badly-poisoned)", () => {
  it("given badly-poisoned Pokemon with toxic counter at 1 and 160 max HP, when applying status damage, then takes 10 HP (160*1/16)", () => {
    // Source: Showdown -- Toxic damage starts at 1/16, then 2/16, 3/16...
    // 160 * 1 / 16 = 10
    const pokemon = makeActive({
      hp: 160,
      status: "badly-poisoned",
      volatiles: [["toxic-counter", { turnsLeft: -1, data: { counter: 1 } }]],
    });
    const result = ruleset.applyStatusDamage(pokemon, "badly-poisoned" as never, {} as BattleState);
    expect(result).toBe(10);
  });

  it("given badly-poisoned Pokemon with toxic counter at 3 and 160 max HP, when applying status damage, then takes 30 HP (160*3/16)", () => {
    // Source: Showdown -- Toxic damage at counter=3 is 3/16 max HP
    // 160 * 3 / 16 = 30
    const pokemon = makeActive({
      hp: 160,
      status: "badly-poisoned",
      volatiles: [["toxic-counter", { turnsLeft: -1, data: { counter: 3 } }]],
    });
    const result = ruleset.applyStatusDamage(pokemon, "badly-poisoned" as never, {} as BattleState);
    expect(result).toBe(30);
  });
});

// ===========================================================================
// Sleep/Freeze/Paralysis -- no chip damage
// ===========================================================================

describe("Gen8Ruleset -- applyStatusDamage (no-damage statuses)", () => {
  it("given sleeping Pokemon, when applying status damage, then takes 0 HP", () => {
    // Source: Showdown -- sleep has no per-turn chip damage
    const pokemon = makeActive({ status: "sleep" });
    const result = ruleset.applyStatusDamage(pokemon, "sleep" as never, {} as BattleState);
    expect(result).toBe(0);
  });

  it("given frozen Pokemon, when applying status damage, then takes 0 HP", () => {
    // Source: Showdown -- freeze has no per-turn chip damage
    const pokemon = makeActive({ status: "freeze" });
    const result = ruleset.applyStatusDamage(pokemon, "freeze" as never, {} as BattleState);
    expect(result).toBe(0);
  });

  it("given paralyzed Pokemon, when applying status damage, then takes 0 HP", () => {
    // Source: Showdown -- paralysis has no per-turn chip damage
    const pokemon = makeActive({ status: "paralysis" });
    const result = ruleset.applyStatusDamage(pokemon, "paralysis" as never, {} as BattleState);
    expect(result).toBe(0);
  });
});

// ===========================================================================
// Paralysis speed -- 0.5x (Gen 7+ default, inherited from BaseRuleset)
// ===========================================================================

describe("Gen8Ruleset -- paralysis speed via resolveTurnOrder", () => {
  /**
   * Helper: resolves two move actions and returns the side index that goes first.
   */
  function whoGoesFirst(activeA: ActivePokemon, activeB: ActivePokemon): number {
    const side0 = makeSide(0, { active: [activeA] });
    const side1 = makeSide(1, { active: [activeB] });
    const state = makeState({ sides: [side0, side1] });
    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 } as BattleAction,
      { type: "move", side: 1, moveIndex: 0 } as BattleAction,
    ];
    const ordered = ruleset.resolveTurnOrder(actions, state, state.rng);
    return (ordered[0] as { side: number }).side;
  }

  it("given paralyzed Pokemon with 200 base speed vs 120 base speed, when resolving turn order, then paralyzed goes second (200*0.5=100 < 120)", () => {
    // Source: Showdown sim/pokemon.ts Gen 7+ -- paralysis reduces speed to 50%
    // 200 * 0.5 = 100 < 120 => paralyzed goes second
    const paralyzed = makeActive({ speed: 200, status: "paralysis" });
    const normal = makeActive({ speed: 120 });
    expect(whoGoesFirst(paralyzed, normal)).toBe(1);
  });

  it("given paralyzed Pokemon with 100 base speed vs 40 base speed, when resolving turn order, then paralyzed goes first (100*0.5=50 > 40)", () => {
    // Source: Showdown sim/pokemon.ts Gen 7+ -- paralysis reduces speed to 50%
    // 100 * 0.5 = 50 > 40 => paralyzed still faster
    const paralyzed = makeActive({ speed: 100, status: "paralysis" });
    const slower = makeActive({ speed: 40 });
    expect(whoGoesFirst(paralyzed, slower)).toBe(0);
  });
});
