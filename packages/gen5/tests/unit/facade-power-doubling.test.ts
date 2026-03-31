/**
 * Facade power doubling — Gen 5
 *
 * Facade (70 BP) doubles its base power to 140 when the user has burn,
 * paralysis, poison, or badly-poisoned. Sleep does NOT trigger the doubling.
 *
 * Source: pokeemerald data/battle_scripts_1.s BattleScript_FacadeDoubleDmg
 *   setbyte sDMG_MULTIPLIER, 2 when STATUS1_POISON | STATUS1_BURN | STATUS1_PARALYSIS | STATUS1_TOXIC_POISON
 * Source: Showdown data/moves.ts facade.onBasePower:
 *   if (pokemon.status && pokemon.status !== 'slp') { return this.chainModify(2); }
 *
 * Gen 5 damage formula (burn applied AFTER STAB via pokeRound(base, 2048)):
 *   levelFactor = floor(2*50/5) + 2 = 22
 *   base(70BP)  = floor(floor(22*70*100/100)/50) + 2 = 30 + 2 = 32; STAB: pokeRound(32, 6144) = 48
 *   base(140BP) = floor(floor(22*140*100/100)/50) + 2 = 61 + 2 = 63; STAB: pokeRound(63, 6144) = 94
 *
 * NOTE: In Gen 5, burn penalty still applies even with Facade (bypass introduced in Gen 6).
 *   Source: Showdown sim/battle-actions.ts — `this.battle.gen < 6 || move.id !== 'facade'`
 *
 * Expected values (attack=100, defense=100, level=50, rng=100, Normal STAB):
 *   70BP no status:          48
 *   140BP burn (Gen5 burn applies after STAB): pokeRound(94, 2048) = floor((94*2048+2047)/4096) = 47
 *   140BP paralysis:         94
 *   140BP poison:            94
 *   70BP sleep (no double):  48
 */

import type { ActivePokemon, BattleState, DamageContext } from "@pokemon-lib-ts/battle";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  type MoveData,
  type PokemonType,
  type PrimaryStatus,
  type VolatileStatus,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen5DataManager,
  GEN5_ITEM_IDS,
  GEN5_MOVE_IDS,
  GEN5_NATURE_IDS,
  GEN5_SPECIES_IDS,
} from "../../src";
import { calculateGen5Damage } from "../../src/Gen5DamageCalc";
import { GEN5_TYPE_CHART } from "../../src/Gen5TypeChart";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A mock RNG whose int() always returns a fixed value (100 = max roll). */
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

const dataManager = createGen5DataManager();
const BASE_SPECIES = dataManager.getSpecies(GEN5_SPECIES_IDS.bulbasaur);
const DEFAULT_NATURE = dataManager.getNature(GEN5_NATURE_IDS.hardy).id;
const ITEMS = { ...CORE_ITEM_IDS, ...GEN5_ITEM_IDS };

function createSyntheticOnFieldPokemon(overrides: {
  level?: number;
  attack?: number;
  defense?: number;
  types?: PokemonType[];
  ability?: string;
  heldItem?: string | null;
  status?: PrimaryStatus | null;
  speciesId?: number;
}): ActivePokemon {
  const hp = 200;
  const attack = overrides.attack ?? 100;
  const defense = overrides.defense ?? 100;
  const spAttack = 100;
  const spDefense = 100;
  const speed = 100;
  return {
    pokemon: {
      uid: "gen5-facade-test",
      speciesId: overrides.speciesId ?? BASE_SPECIES.id,
      nickname: null,
      level: overrides.level ?? 50,
      experience: 0,
      nature: DEFAULT_NATURE,
      ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: hp,
      moves: [],
      ability: overrides.ability ?? CORE_ABILITY_IDS.none,
      abilitySlot: CORE_ABILITY_SLOTS.normal1,
      heldItem: overrides.heldItem ?? null,
      status: (overrides.status ?? null) as PrimaryStatus | null,
      friendship: 0,
      gender: CORE_GENDERS.male,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: ITEMS.pokeBall,
      calculatedStats: { hp, attack, defense, spAttack, spDefense, speed },
    },
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
    volatileStatuses: new Map<VolatileStatus, { turnsLeft: number }>(),
    types: overrides.types ?? [CORE_TYPE_IDS.normal],
    ability: overrides.ability ?? CORE_ABILITY_IDS.none,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: 0,
    movedThisTurn: false,
    consecutiveProtects: 0,
    substituteHp: 0,
    itemKnockedOff: false,
    transformed: false,
    transformedSpecies: null,
    isMega: false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    stellarBoostedTypes: [],
    suppressedAbility: null,
    forcedMove: null,
  } as ActivePokemon;
}

function createSyntheticBattleState(): BattleState {
  return {
    weather: null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    format: "singles",
    generation: 5,
    turnNumber: 1,
    sides: [{}, {}],
  } as unknown as BattleState;
}

function buildFacadeMove(powerOverride?: number): MoveData {
  const base = dataManager.getMove(GEN5_MOVE_IDS.facade);
  const move = { ...base } as MoveData;
  if (powerOverride !== undefined) {
    move.power = powerOverride;
  }
  return move;
}

function createDamageContext(opts: { attacker: ActivePokemon; move: MoveData }): DamageContext {
  return {
    attacker: opts.attacker,
    defender: createSyntheticOnFieldPokemon({}),
    move: opts.move,
    state: createSyntheticBattleState(),
    rng: createMockRng(100),
    isCrit: false,
  } as DamageContext;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Gen 5 Facade power doubling", () => {
  it("given Normal attacker with no status using Facade (70 BP), when calculating damage, then returns 48", () => {
    // Source: pokeemerald BattleScript_FacadeDoubleDmg — no status, power stays 70
    // base = floor(floor(22*70*100/100)/50) + 2 = 32; STAB pokeRound(32, 6144) = 48
    const attacker = createSyntheticOnFieldPokemon({ status: null, types: [CORE_TYPE_IDS.normal] });
    const move = buildFacadeMove(); // canonical 70 BP, no doubling yet
    const ctx = createDamageContext({ attacker, move });

    const result = calculateGen5Damage(ctx, GEN5_TYPE_CHART);

    // Source: pokeemerald BattleScript_FacadeDoubleDmg — no status trigger, 70 BP
    expect(result.damage).toBe(48);
  });

  it("given Normal attacker with burn using Facade (power doubles to 140, burn still applies in Gen 5), when calculating damage, then returns 47", () => {
    // Source: pokeemerald BattleScript_FacadeDoubleDmg — burn triggers 140 BP
    // Source: Showdown sim/battle-actions.ts — Gen 5 burn applies even for Facade (bypass added Gen 6)
    // base(140BP) = 63; STAB pokeRound(63, 6144) = 94; burn pokeRound(94, 2048) = floor((94*2048+2047)/4096) = 47
    // Facade power doubling not yet implemented — this test should FAIL until implementation is added
    const attacker = createSyntheticOnFieldPokemon({
      status: CORE_STATUS_IDS.burn,
      types: [CORE_TYPE_IDS.normal],
    });
    const move = buildFacadeMove(); // should be doubled to 140 by implementation
    const ctx = createDamageContext({ attacker, move });

    const result = calculateGen5Damage(ctx, GEN5_TYPE_CHART);

    // Source: pokeemerald BattleScript_FacadeDoubleDmg + Gen5 burn: pokeRound(94, 2048) = 47
    expect(result.damage).toBe(47);
  });

  it("given Normal attacker with paralysis using Facade (power doubles to 140), when calculating damage, then returns 94", () => {
    // Source: pokeemerald BattleScript_FacadeDoubleDmg — paralysis triggers 140 BP, no other penalty
    // base(140BP) = 63; STAB pokeRound(63, 6144) = 94
    // Facade power doubling not yet implemented — this test should FAIL until implementation is added
    const attacker = createSyntheticOnFieldPokemon({
      status: CORE_STATUS_IDS.paralysis,
      types: [CORE_TYPE_IDS.normal],
    });
    const move = buildFacadeMove(); // should be doubled to 140 by implementation
    const ctx = createDamageContext({ attacker, move });

    const result = calculateGen5Damage(ctx, GEN5_TYPE_CHART);

    // Source: pokeemerald BattleScript_FacadeDoubleDmg — 140 BP with no penalty modifiers
    expect(result.damage).toBe(94);
  });

  it("given Normal attacker with poison using Facade (power doubles to 140), when calculating damage, then returns 94", () => {
    // Source: pokeemerald BattleScript_FacadeDoubleDmg — poison triggers 140 BP, no other penalty
    // base(140BP) = 63; STAB pokeRound(63, 6144) = 94
    // Facade power doubling not yet implemented — this test should FAIL until implementation is added
    const attacker = createSyntheticOnFieldPokemon({
      status: CORE_STATUS_IDS.poison,
      types: [CORE_TYPE_IDS.normal],
    });
    const move = buildFacadeMove(); // should be doubled to 140 by implementation
    const ctx = createDamageContext({ attacker, move });

    const result = calculateGen5Damage(ctx, GEN5_TYPE_CHART);

    // Source: pokeemerald BattleScript_FacadeDoubleDmg — poison triggers power doubling
    expect(result.damage).toBe(94);
  });

  it("given Normal attacker with badly-poisoned (toxic) using Facade (power doubles to 140), when calculating damage, then returns 94", () => {
    // Source: pokeemerald BattleScript_FacadeDoubleDmg — STATUS1_TOXIC_POISON listed explicitly
    // base(140BP) = 63; STAB pokeRound(63, 6144) = 94; no halving for toxic
    const attacker = createSyntheticOnFieldPokemon({
      status: CORE_STATUS_IDS.badlyPoisoned,
      types: [CORE_TYPE_IDS.normal],
    });
    const move = buildFacadeMove();
    const ctx = createDamageContext({ attacker, move });

    const result = calculateGen5Damage(ctx, GEN5_TYPE_CHART);

    expect(result.damage).toBe(94);
  });

  it("given Normal attacker with sleep using Facade (70 BP, no doubling), when calculating damage, then returns 48", () => {
    // Source: Showdown data/moves.ts facade.onBasePower — sleep does NOT trigger doubling
    //   `if (pokemon.status && pokemon.status !== 'slp') { return this.chainModify(2); }`
    // base(70BP) = 32; STAB pokeRound(32, 6144) = 48
    const attacker = createSyntheticOnFieldPokemon({
      status: CORE_STATUS_IDS.sleep,
      types: [CORE_TYPE_IDS.normal],
    });
    const move = buildFacadeMove(); // stays at 70 BP for sleep
    const ctx = createDamageContext({ attacker, move });

    const result = calculateGen5Damage(ctx, GEN5_TYPE_CHART);

    // Source: Showdown data/moves.ts facade.onBasePower — slp excluded from doubling
    expect(result.damage).toBe(48);
  });
});
