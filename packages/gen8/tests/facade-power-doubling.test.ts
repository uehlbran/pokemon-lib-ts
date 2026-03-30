/**
 * Facade power doubling — Gen 8
 *
 * Facade (70 BP) doubles its base power to 140 when the user has burn,
 * paralysis, poison, or badly-poisoned. Sleep does NOT trigger the doubling.
 *
 * Source: pokeemerald data/battle_scripts_1.s BattleScript_FacadeDoubleDmg
 *   setbyte sDMG_MULTIPLIER, 2 when STATUS1_POISON | STATUS1_BURN | STATUS1_PARALYSIS | STATUS1_TOXIC_POISON
 * Source: Showdown data/moves.ts facade.onBasePower:
 *   if (pokemon.status && pokemon.status !== 'slp') { return this.chainModify(2); }
 *
 * Gen 8 damage formula (burn bypass active for Facade in Gen 6+):
 *   Source: Showdown sim/battle-actions.ts — `this.battle.gen < 6 || move.id !== 'facade'`
 *   levelFactor = floor(2*50/5) + 2 = 22
 *   base(70BP)  = floor(floor(22*70*100/100)/50) + 2 = 30 + 2 = 32; STAB: pokeRound(32, 6144) = 48
 *   base(140BP) = floor(floor(22*140*100/100)/50) + 2 = 61 + 2 = 63; STAB: pokeRound(63, 6144) = 94
 *
 * Expected values (attack=100, defense=100, level=50, rng=100, Normal STAB):
 *   70BP no status:          48
 *   140BP burn (bypass):     94  (Gen 8 Facade bypasses burn halving)
 *   140BP paralysis:         94
 *   140BP poison:            94
 *   70BP sleep (no double):  48
 */

import type { ActivePokemon, BattleState, DamageContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType, PrimaryStatus } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  createEvs,
  createIvs,
  createMoveSlot,
  createPokemonInstance,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen8DataManager,
  GEN8_ITEM_IDS,
  GEN8_MOVE_IDS,
  GEN8_NATURE_IDS,
  GEN8_SPECIES_IDS,
} from "../src/data";
import { calculateGen8Damage } from "../src/Gen8DamageCalc";
import { GEN8_TYPE_CHART } from "../src/Gen8TypeChart";

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

const GEN8_DATA = createGen8DataManager();
const DEFAULT_SPECIES = GEN8_DATA.getSpecies(GEN8_SPECIES_IDS.bulbasaur);
const DEFAULT_MOVE = GEN8_DATA.getMove(GEN8_MOVE_IDS.tackle);
const ITEMS = { ...CORE_ITEM_IDS, ...GEN8_ITEM_IDS };

function createSyntheticOnFieldPokemon(overrides: {
  level?: number;
  attack?: number;
  defense?: number;
  types?: PokemonType[];
  ability?: string;
  heldItem?: string | null;
  status?: string | null;
}): ActivePokemon {
  const hp = 200;
  const attack = overrides.attack ?? 100;
  const defense = overrides.defense ?? 100;
  const spAttack = 100;
  const spDefense = 100;
  const speed = 100;
  const pokemon = createPokemonInstance(
    DEFAULT_SPECIES,
    overrides.level ?? 50,
    new SeededRandom(8),
    {
      nature: GEN8_NATURE_IDS.hardy,
      ivs: createIvs(),
      evs: createEvs(),
      gender: CORE_GENDERS.male,
      abilitySlot: CORE_ABILITY_SLOTS.normal1,
      heldItem: overrides.heldItem ?? null,
      moves: [],
      isShiny: false,
      metLocation: "",
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: ITEMS.pokeBall,
    },
  );

  pokemon.currentHp = hp;
  pokemon.status = (overrides.status ?? null) as PrimaryStatus | null;
  pokemon.heldItem = overrides.heldItem ?? null;
  pokemon.ability = overrides.ability ?? CORE_ABILITY_IDS.none;
  pokemon.moves = [createMoveSlot(DEFAULT_MOVE.id, DEFAULT_MOVE.pp)];
  pokemon.calculatedStats = { hp, attack, defense, spAttack, spDefense, speed };

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

function createBattleState(): BattleState {
  return {
    weather: null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    format: "singles",
    generation: 8,
    turnNumber: 1,
    sides: [{}, {}],
  } as unknown as BattleState;
}

function buildFacadeMove(): MoveData {
  return { ...GEN8_DATA.getMove(GEN8_MOVE_IDS.facade) } as MoveData;
}

function createDamageContext(opts: { attacker: ActivePokemon; move: MoveData }): DamageContext {
  return {
    attacker: opts.attacker,
    defender: createSyntheticOnFieldPokemon({}),
    move: opts.move,
    state: createBattleState(),
    rng: createMockRng(100),
    isCrit: false,
  } as DamageContext;
}

describe("Gen 8 Facade power doubling", () => {
  it("given Normal attacker with no status using Facade (70 BP), when calculating damage, then returns 48", () => {
    // Source: pokeemerald BattleScript_FacadeDoubleDmg — no status, power stays 70
    // base = floor(floor(22*70*100/100)/50) + 2 = 32; STAB pokeRound(32, 6144) = 48
    const attacker = createSyntheticOnFieldPokemon({ status: null, types: [CORE_TYPE_IDS.normal] });
    const move = buildFacadeMove();
    const ctx = createDamageContext({ attacker, move });

    const result = calculateGen8Damage(ctx, GEN8_TYPE_CHART);

    expect(result.damage).toBe(48);
  });

  it("given Normal attacker with burn using Facade (power doubles to 140, burn bypass active in Gen 8), when calculating damage, then returns 94", () => {
    // Source: pokeemerald BattleScript_FacadeDoubleDmg — burn triggers 140 BP
    // Source: Showdown sim/battle-actions.ts — Gen 6+ Facade bypasses burn penalty
    //   `this.battle.gen < 6 || move.id !== 'facade'`
    // base(140BP) = 63; STAB pokeRound(63, 6144) = 94; burn bypass → no halving
    const attacker = createSyntheticOnFieldPokemon({
      status: CORE_STATUS_IDS.burn,
      types: [CORE_TYPE_IDS.normal],
    });
    const move = buildFacadeMove();
    const ctx = createDamageContext({ attacker, move });

    const result = calculateGen8Damage(ctx, GEN8_TYPE_CHART);

    expect(result.damage).toBe(94);
  });

  it("given Normal attacker with paralysis using Facade (power doubles to 140), when calculating damage, then returns 94", () => {
    // Source: pokeemerald BattleScript_FacadeDoubleDmg — paralysis triggers 140 BP
    const attacker = createSyntheticOnFieldPokemon({
      status: CORE_STATUS_IDS.paralysis,
      types: [CORE_TYPE_IDS.normal],
    });
    const move = buildFacadeMove();
    const ctx = createDamageContext({ attacker, move });

    const result = calculateGen8Damage(ctx, GEN8_TYPE_CHART);

    expect(result.damage).toBe(94);
  });

  it("given Normal attacker with poison using Facade (power doubles to 140), when calculating damage, then returns 94", () => {
    // Source: pokeemerald BattleScript_FacadeDoubleDmg — poison triggers 140 BP
    const attacker = createSyntheticOnFieldPokemon({
      status: CORE_STATUS_IDS.poison,
      types: [CORE_TYPE_IDS.normal],
    });
    const move = buildFacadeMove();
    const ctx = createDamageContext({ attacker, move });

    const result = calculateGen8Damage(ctx, GEN8_TYPE_CHART);

    expect(result.damage).toBe(94);
  });

  it("given Normal attacker with badly-poisoned (toxic) using Facade, when calculating damage, then returns 94", () => {
    // Source: pokeemerald BattleScript_FacadeDoubleDmg — STATUS1_TOXIC_POISON triggers 140 BP
    const attacker = createSyntheticOnFieldPokemon({
      status: CORE_STATUS_IDS.badlyPoisoned,
      types: [CORE_TYPE_IDS.normal],
    });
    const move = buildFacadeMove();
    const ctx = createDamageContext({ attacker, move });

    const result = calculateGen8Damage(ctx, GEN8_TYPE_CHART);

    expect(result.damage).toBe(94);
  });

  it("given Normal attacker with sleep using Facade, when calculating damage, then returns 48 (no power doubling)", () => {
    // Source: Showdown data/moves.ts facade.onBasePower — sleep excluded from doubling
    //   `if (pokemon.status && pokemon.status !== 'slp')`
    const attacker = createSyntheticOnFieldPokemon({
      status: CORE_STATUS_IDS.sleep,
      types: [CORE_TYPE_IDS.normal],
    });
    const move = buildFacadeMove();
    const ctx = createDamageContext({ attacker, move });

    const result = calculateGen8Damage(ctx, GEN8_TYPE_CHART);

    expect(result.damage).toBe(48);
  });
});
