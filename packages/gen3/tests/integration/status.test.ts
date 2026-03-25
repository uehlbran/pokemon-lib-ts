import type { ActivePokemon, BattleAction, BattleState } from "@pokemon-lib-ts/battle";
import { createOnFieldPokemon as createBattleOnFieldPokemon } from "@pokemon-lib-ts/battle/utils";
import type { PokemonInstance, PokemonType, PrimaryStatus } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_STATUS_IDS,
  createPokemonInstance as createCorePokemonInstance,
  createEvs,
  createFriendship,
  createIvs,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import {
  createGen3DataManager,
  GEN3_MOVE_IDS,
  GEN3_NATURE_IDS,
  GEN3_SPECIES_IDS,
  Gen3Ruleset,
} from "@pokemon-lib-ts/gen3";
import { describe, expect, it } from "vitest";

const dataManager = createGen3DataManager();
const HARDY_NATURE = dataManager.getNature(GEN3_NATURE_IDS.hardy).id;
const NINETALES = dataManager.getSpecies(GEN3_SPECIES_IDS.ninetales);
const VAPOREON = dataManager.getSpecies(GEN3_SPECIES_IDS.vaporeon);
const TACKLE = dataManager.getMove(GEN3_MOVE_IDS.tackle);

/**
 * Gen 3 Status Tests
 *
 * Verifies the gen-specific overrides already implemented in Gen3Ruleset:
 *   - applyStatusDamage: burn = 1/8 max HP (Gen 3-6; Gen 7+ uses 1/16)
 *   - applyStatusDamage: poison = 1/8 max HP (same as BaseRuleset, confirmed)
 *   - getEffectiveSpeed (via resolveTurnOrder): paralysis = 0.25x (Gen 3-6; Gen 7+ uses 0.5x)
 */

function createGen3Ruleset(): Gen3Ruleset {
  return new Gen3Ruleset(dataManager);
}

function createSyntheticPokemonInstance(
  overrides: {
    maxHp?: number;
    speed?: number;
    status?: PrimaryStatus | null;
    level?: number;
    speciesId?: number;
  } = {},
): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  const speed = overrides.speed ?? 100;
  const species = dataManager.getSpecies(overrides.speciesId ?? NINETALES.id);
  const pokemon = createCorePokemonInstance(species, overrides.level ?? 50, new SeededRandom(3), {
    nature: HARDY_NATURE,
    ivs: createIvs(),
    evs: createEvs(),
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    friendship: createFriendship(0),
    gender: CORE_GENDERS.male,
    pokeball: CORE_ITEM_IDS.pokeBall,
  });

  pokemon.currentHp = maxHp;
  pokemon.status = overrides.status ?? null;
  pokemon.ability = CORE_ABILITY_IDS.none;
  pokemon.calculatedStats = {
    hp: maxHp,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    speed,
  };

  return pokemon;
}

function createSyntheticOnFieldPokemon(
  overrides: {
    maxHp?: number;
    speed?: number;
    status?: PrimaryStatus | null;
    types?: PokemonType[];
    level?: number;
    speciesId?: number;
  } = {},
): ActivePokemon {
  const pokemon = createSyntheticPokemonInstance(overrides);
  const species = dataManager.getSpecies(pokemon.speciesId);
  const onFieldPokemon = createBattleOnFieldPokemon(
    pokemon,
    0,
    overrides.types ?? [...species.types],
  );
  onFieldPokemon.ability = CORE_ABILITY_IDS.none;
  return onFieldPokemon;
}

function createBattleSide(index: 0 | 1, active: ActivePokemon) {
  return {
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
  };
}

function createBattleState(side0Pokemon: ActivePokemon, side1Pokemon: ActivePokemon): BattleState {
  return {
    phase: "action-select",
    generation: 3,
    format: "singles",
    turnNumber: 1,
    sides: [createBattleSide(0, side0Pokemon), createBattleSide(1, side1Pokemon)],
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

function createMockRng(nextValue: number): SeededRandom {
  return {
    next: () => nextValue,
    int: (_min: number, _max: number) => Math.floor(nextValue * (_max - _min + 1)) + _min,
    chance: (p: number) => nextValue < p,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: T[]) => arr,
    getState: () => 0,
    setState: () => {},
  } as unknown as SeededRandom;
}

const STUB_STATE = {} as BattleState;

// ---------------------------------------------------------------------------
// Burn damage
// ---------------------------------------------------------------------------

describe("Gen 3 burn damage", () => {
  it("given a Pokemon with 160 maxHP, when burn damage is applied, then takes 20 HP (1/8 maxHP)", () => {
    // Source: pret/pokeemerald src/battle_util.c — burn tick = maxHP / 8
    // Derivation: floor(160 / 8) = 20
    const ruleset = createGen3Ruleset();
    const mon = createSyntheticOnFieldPokemon({
      maxHp: 160,
      status: CORE_STATUS_IDS.burn,
      speciesId: NINETALES.id,
    });
    expect(ruleset.applyStatusDamage(mon, CORE_STATUS_IDS.burn, STUB_STATE)).toBe(20);
  });

  it("given a Pokemon with 200 maxHP, when burn damage is applied, then takes 25 HP (1/8 maxHP)", () => {
    // Source: pret/pokeemerald src/battle_util.c — burn tick = maxHP / 8
    // Derivation: floor(200 / 8) = 25
    const ruleset = createGen3Ruleset();
    const mon = createSyntheticOnFieldPokemon({
      maxHp: 200,
      status: CORE_STATUS_IDS.burn,
      speciesId: NINETALES.id,
    });
    expect(ruleset.applyStatusDamage(mon, CORE_STATUS_IDS.burn, STUB_STATE)).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// Poison damage (same as BaseRuleset, confirmed 1/8 max HP in Gen 3)
// ---------------------------------------------------------------------------

describe("Gen 3 poison damage", () => {
  it("given a Pokemon with 160 maxHP, when poison damage is applied, then takes 20 HP (1/8 maxHP)", () => {
    // Source: pret/pokeemerald src/battle_util.c — poison tick = maxHP / 8
    // Derivation: floor(160 / 8) = 20
    const ruleset = createGen3Ruleset();
    const mon = createSyntheticOnFieldPokemon({
      maxHp: 160,
      status: CORE_STATUS_IDS.poison,
      speciesId: NINETALES.id,
    });
    expect(ruleset.applyStatusDamage(mon, CORE_STATUS_IDS.poison, STUB_STATE)).toBe(20);
  });

  it("given a Pokemon with 200 maxHP, when poison damage is applied, then takes 25 HP (1/8 maxHP)", () => {
    // Source: pret/pokeemerald src/battle_util.c — poison tick = maxHP / 8
    // Derivation: floor(200 / 8) = 25
    const ruleset = createGen3Ruleset();
    const mon = createSyntheticOnFieldPokemon({
      maxHp: 200,
      status: CORE_STATUS_IDS.poison,
      speciesId: NINETALES.id,
    });
    expect(ruleset.applyStatusDamage(mon, CORE_STATUS_IDS.poison, STUB_STATE)).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// Paralysis speed penalty (indirect: via resolveTurnOrder)
// ---------------------------------------------------------------------------

describe("Gen 3 paralysis speed penalty", () => {
  it("given a paralyzed Pokemon with 100 base speed vs a healthy 50-speed Pokemon, when turn order is resolved, then the healthy Pokemon moves first", () => {
    // Source: pret/pokeemerald src/battle_util.c — paralyzed speed = speed / 4
    const paralyzedMon = createSyntheticOnFieldPokemon({
      speed: 100,
      status: CORE_STATUS_IDS.paralysis,
      speciesId: NINETALES.id,
    });
    const healthyMon = createSyntheticOnFieldPokemon({
      speed: 50,
      status: null,
      speciesId: VAPOREON.id,
    });
    const state = createBattleState(paralyzedMon, healthyMon);
    const ruleset = createGen3Ruleset();

    paralyzedMon.pokemon.moves.push({
      moveId: TACKLE.id,
      pp: TACKLE.pp,
      maxPp: TACKLE.pp,
    } as never);
    healthyMon.pokemon.moves.push({
      moveId: TACKLE.id,
      pp: TACKLE.pp,
      maxPp: TACKLE.pp,
    } as never);

    const actions: BattleAction[] = [
      { type: "move", side: 0, slot: 0, moveIndex: 0 },
      { type: "move", side: 1, slot: 0, moveIndex: 0 },
    ];

    const ordered = ruleset.resolveTurnOrder(actions, state, new SeededRandom(1));

    expect(ordered[0]).toEqual(actions[1]);
    expect(ordered[1]).toEqual(actions[0]);
  });

  it("given a paralyzed Pokemon with 100 base speed vs a healthy 20-speed Pokemon, when turn order is resolved, then paralyzed moves first (25 > 20)", () => {
    // Source: pret/pokeemerald src/battle_util.c — paralyzed speed = speed / 4
    const paralyzedMon = createSyntheticOnFieldPokemon({
      speed: 100,
      status: CORE_STATUS_IDS.paralysis,
      speciesId: NINETALES.id,
    });
    const slowMon = createSyntheticOnFieldPokemon({
      speed: 20,
      status: null,
      speciesId: VAPOREON.id,
    });
    const state = createBattleState(paralyzedMon, slowMon);
    const ruleset = createGen3Ruleset();

    paralyzedMon.pokemon.moves.push({
      moveId: TACKLE.id,
      pp: TACKLE.pp,
      maxPp: TACKLE.pp,
    } as never);
    slowMon.pokemon.moves.push({
      moveId: TACKLE.id,
      pp: TACKLE.pp,
      maxPp: TACKLE.pp,
    } as never);

    const actions: BattleAction[] = [
      { type: "move", side: 0, slot: 0, moveIndex: 0 },
      { type: "move", side: 1, slot: 0, moveIndex: 0 },
    ];

    const ordered = ruleset.resolveTurnOrder(actions, state, new SeededRandom(1));

    expect(ordered[0]).toEqual(actions[0]);
    expect(ordered[1]).toEqual(actions[1]);
  });
});

// ---------------------------------------------------------------------------
// Issue #381: Freeze thaw — 20% chance per turn (Gen 3+)
// ---------------------------------------------------------------------------

describe("Gen 3 freeze thaw check (20% probability)", () => {
  /**
   * In Gen 3, a frozen Pokemon has a 20% chance to thaw at the start of its turn,
   * checked via checkFreezeThaw. This is handled pre-move (not end-of-turn).
   *
   * Source: pret/pokeemerald src/battle_util.c — DoFreezeStatusCallback:
   *   "if (Random() % 100 >= 80)" — thaws if random value is 80-99 (20 out of 100)
   * Source: BaseRuleset.checkFreezeThaw — returns rng.chance(0.2)
   *   rng.chance(p) = next() < p  (thaws if next() < 0.2)
   */

  it("given a frozen Pokemon, when RNG roll is below 0.2 (thaw threshold), then checkFreezeThaw returns true (thawed)", () => {
    // Source: pret/pokeemerald src/battle_util.c — 20% thaw: if(Random()%100 >= 80)
    const ruleset = createGen3Ruleset();
    const frozenMon = createSyntheticOnFieldPokemon({
      status: CORE_STATUS_IDS.freeze,
      speciesId: NINETALES.id,
    });
    const rng = createMockRng(0.19);

    expect(ruleset.checkFreezeThaw(frozenMon, rng)).toBe(true);
  });

  it("given a frozen Pokemon, when RNG roll is at or above 0.2 (stay frozen), then checkFreezeThaw returns false", () => {
    // Source: pret/pokeemerald src/battle_util.c — 20% thaw: if(Random()%100 >= 80)
    const ruleset = createGen3Ruleset();
    const frozenMon = createSyntheticOnFieldPokemon({
      status: CORE_STATUS_IDS.freeze,
      speciesId: NINETALES.id,
    });
    const rng = createMockRng(0.2);

    expect(ruleset.checkFreezeThaw(frozenMon, rng)).toBe(false);
  });

  it("given a frozen Pokemon, when RNG roll is well above threshold (0.99), then checkFreezeThaw returns false", () => {
    // Source: pret/pokeemerald src/battle_util.c — 80% chance to stay frozen
    const ruleset = createGen3Ruleset();
    const frozenMon = createSyntheticOnFieldPokemon({
      status: CORE_STATUS_IDS.freeze,
      speciesId: NINETALES.id,
    });
    const rng = createMockRng(0.99);

    expect(ruleset.checkFreezeThaw(frozenMon, rng)).toBe(false);
  });

  it("given a frozen Pokemon with SeededRandom, when 200 trials run, then approximately 20% thaw", () => {
    // Source: pret/pokeemerald — 20% thaw probability over many trials.
    const ruleset = createGen3Ruleset();
    const rng = new SeededRandom(12345);
    let thawCount = 0;
    const trials = 200;

    for (let i = 0; i < trials; i++) {
      const frozenMon = createSyntheticOnFieldPokemon({
        status: CORE_STATUS_IDS.freeze,
        speciesId: NINETALES.id,
      });
      if (ruleset.checkFreezeThaw(frozenMon, rng)) {
        thawCount++;
      }
    }

    const thawRate = thawCount / trials;
    expect(thawRate).toBeGreaterThanOrEqual(0.12);
    expect(thawRate).toBeLessThanOrEqual(0.28);
  });
});
