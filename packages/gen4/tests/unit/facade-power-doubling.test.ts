/**
 * Facade power doubling — Gen 4
 *
 * Facade (70 BP) doubles its base power to 140 when the user has burn,
 * paralysis, poison, or badly-poisoned. Sleep does NOT trigger the doubling.
 *
 * Source: pokeemerald data/battle_scripts_1.s BattleScript_FacadeDoubleDmg
 *   setbyte sDMG_MULTIPLIER, 2 when STATUS1_POISON | STATUS1_BURN | STATUS1_PARALYSIS | STATUS1_TOXIC_POISON
 * Source: Showdown data/moves.ts facade.onBasePower:
 *   if (pokemon.status && pokemon.status !== 'slp') { return this.chainModify(2); }
 *
 * Gen 4 damage formula (burn applied BEFORE +2 via Math.floor(base/2)):
 *   levelFactor = floor(2*50/5) + 2 = 22
 *   base(70BP)  = floor(floor(22*70*100/100)/50) = floor(1540/50) = 30
 *   base(140BP) = floor(floor(22*140*100/100)/50) = floor(3080/50) = 61
 *
 * Expected values (attack=100, defense=100, level=50, rng=100, Normal STAB):
 *   70BP no status: floor(30/2)*0+30 +2 = 32; STAB: floor(32*1.5) = 48
 *   140BP burn:     floor(61/2) = 30; +2 = 32; STAB: floor(32*1.5) = 48  (doubling cancels halving)
 *   140BP paralysis: 61 +2 = 63; STAB: floor(63*1.5) = 94
 *   70BP sleep (no doubling): same as no status = 48
 */

import type { ActivePokemon, DamageContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType, StatBlock } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen4DataManager,
  GEN4_ITEM_IDS,
  GEN4_MOVE_IDS,
  GEN4_NATURE_IDS,
  GEN4_SPECIES_IDS,
} from "../../src";
import { calculateGen4Damage } from "../../src/Gen4DamageCalc";
import { GEN4_TYPE_CHART } from "../../src/Gen4TypeChart";
import { createSyntheticOnFieldPokemon } from "../helpers/createSyntheticOnFieldPokemon";

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

const dataManager = createGen4DataManager();

function createActivePokemon(opts: {
  level?: number;
  attack?: number;
  defense?: number;
  types?: PokemonType[];
  status?: (typeof CORE_STATUS_IDS)[keyof typeof CORE_STATUS_IDS] | null;
}): ActivePokemon {
  const hp = 200;
  const calculatedStats: StatBlock = {
    hp,
    attack: opts.attack ?? 100,
    defense: opts.defense ?? 100,
    spAttack: 100,
    spDefense: 100,
    speed: 100,
  };
  return createSyntheticOnFieldPokemon({
    ability: CORE_ABILITY_IDS.none,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    calculatedStats,
    currentHp: hp,
    gender: CORE_GENDERS.male,
    heldItem: null,
    level: opts.level ?? 50,
    nature: GEN4_NATURE_IDS.hardy,
    pokeball: GEN4_ITEM_IDS.pokeBall,
    speciesId: GEN4_SPECIES_IDS.bulbasaur,
    status: opts.status ?? null,
    types: opts.types ?? [CORE_TYPE_IDS.normal],
  });
}

function buildFacadeMove(powerOverride?: number): MoveData {
  const base = dataManager.getMove(GEN4_MOVE_IDS.facade);
  const move = { ...base } as MoveData;
  if (powerOverride !== undefined) {
    move.power = powerOverride;
  }
  return move;
}

function createDamageContext(opts: { attacker: ActivePokemon; move: MoveData }): DamageContext {
  return {
    attacker: opts.attacker,
    defender: createActivePokemon({}),
    move: opts.move,
    isCrit: false,
    rng: createMockRng(100),
    state: { weather: null } as DamageContext["state"],
  } as DamageContext;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Gen 4 Facade power doubling", () => {
  it("given Normal attacker with no status using Facade (70 BP), when calculating damage, then returns 48", () => {
    // Source: pokeemerald BattleScript_FacadeDoubleDmg — no status, power stays 70
    // base = floor(floor(22*70*100/100)/50) = 30; +2 = 32; STAB floor(32*1.5) = 48
    const attacker = createActivePokemon({ status: null, types: [CORE_TYPE_IDS.normal] });
    const move = buildFacadeMove(); // canonical 70 BP, no doubling yet
    const ctx = createDamageContext({ attacker, move });

    const result = calculateGen4Damage(ctx, GEN4_TYPE_CHART);

    // Source: pokeemerald BattleScript_FacadeDoubleDmg — no status trigger, 70 BP
    expect(result.damage).toBe(48);
  });

  it("given Normal attacker with burn using Facade (power doubles to 140), when calculating damage, then returns 48 (doubling cancels burn halving)", () => {
    // Source: pokeemerald BattleScript_FacadeDoubleDmg — burn triggers 140 BP
    // Gen 4 burn halving: floor(base/2) applied BEFORE +2
    // base(140BP) = floor(floor(22*140*100/100)/50) = 61; burn: floor(61/2) = 30; +2 = 32; STAB floor(32*1.5) = 48
    // Facade power doubling not yet implemented — this test should FAIL until implementation is added
    const attacker = createActivePokemon({
      status: CORE_STATUS_IDS.burn,
      types: [CORE_TYPE_IDS.normal],
    });
    const move = buildFacadeMove(); // should be doubled to 140 by implementation
    const ctx = createDamageContext({ attacker, move });

    const result = calculateGen4Damage(ctx, GEN4_TYPE_CHART);

    // Source: pokeemerald BattleScript_FacadeDoubleDmg — 140 BP + Gen4 burn halving = 48
    expect(result.damage).toBe(48);
  });

  it("given Normal attacker with paralysis using Facade (power doubles to 140), when calculating damage, then returns 94", () => {
    // Source: pokeemerald BattleScript_FacadeDoubleDmg — paralysis triggers 140 BP, no other penalty
    // base(140BP) = floor(floor(22*140*100/100)/50) = 61; +2 = 63; STAB floor(63*1.5) = 94
    // Facade power doubling not yet implemented — this test should FAIL until implementation is added
    const attacker = createActivePokemon({
      status: CORE_STATUS_IDS.paralysis,
      types: [CORE_TYPE_IDS.normal],
    });
    const move = buildFacadeMove(); // should be doubled to 140 by implementation
    const ctx = createDamageContext({ attacker, move });

    const result = calculateGen4Damage(ctx, GEN4_TYPE_CHART);

    // Source: pokeemerald BattleScript_FacadeDoubleDmg — 140 BP with no penalty modifiers
    expect(result.damage).toBe(94);
  });

  it("given Normal attacker with poison using Facade (power doubles to 140), when calculating damage, then returns 94", () => {
    // Source: pokeemerald BattleScript_FacadeDoubleDmg — poison triggers 140 BP, no other penalty
    // base(140BP) = floor(floor(22*140*100/100)/50) = 61; +2 = 63; STAB floor(63*1.5) = 94
    // Facade power doubling not yet implemented — this test should FAIL until implementation is added
    const attacker = createActivePokemon({
      status: CORE_STATUS_IDS.poison,
      types: [CORE_TYPE_IDS.normal],
    });
    const move = buildFacadeMove(); // should be doubled to 140 by implementation
    const ctx = createDamageContext({ attacker, move });

    const result = calculateGen4Damage(ctx, GEN4_TYPE_CHART);

    // Source: pokeemerald BattleScript_FacadeDoubleDmg — poison triggers power doubling
    expect(result.damage).toBe(94);
  });

  it("given Normal attacker with badly-poisoned (toxic) using Facade (power doubles to 140), when calculating damage, then returns 94", () => {
    // Source: pokeemerald BattleScript_FacadeDoubleDmg — STATUS1_TOXIC_POISON listed explicitly
    // base(140BP) = floor(floor(22*140*100/100)/50) = 61; +2 = 63; STAB floor(63*1.5) = 94
    const attacker = createActivePokemon({
      status: CORE_STATUS_IDS.badlyPoisoned,
      types: [CORE_TYPE_IDS.normal],
    });
    const move = buildFacadeMove();
    const ctx = createDamageContext({ attacker, move });

    const result = calculateGen4Damage(ctx, GEN4_TYPE_CHART);

    expect(result.damage).toBe(94);
  });

  it("given Normal attacker with sleep using Facade (70 BP, no doubling), when calculating damage, then returns 48", () => {
    // Source: Showdown data/moves.ts facade.onBasePower — sleep does NOT trigger doubling
    //   `if (pokemon.status && pokemon.status !== 'slp') { return this.chainModify(2); }`
    // base(70BP) = floor(floor(22*70*100/100)/50) = 30; +2 = 32; STAB floor(32*1.5) = 48
    const attacker = createActivePokemon({
      status: CORE_STATUS_IDS.sleep,
      types: [CORE_TYPE_IDS.normal],
    });
    const move = buildFacadeMove(); // stays at 70 BP for sleep
    const ctx = createDamageContext({ attacker, move });

    const result = calculateGen4Damage(ctx, GEN4_TYPE_CHART);

    // Source: Showdown data/moves.ts facade.onBasePower — slp excluded from doubling
    expect(result.damage).toBe(48);
  });
});
