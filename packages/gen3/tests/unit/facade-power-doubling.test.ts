/**
 * Tests for Facade power doubling when the user has a status condition.
 *
 * Source: pret/pokeemerald data/battle_scripts_1.s BattleScript_EffectFacade —
 *   "jumpifstatus BS_ATTACKER, STATUS1_POISON | STATUS1_BURN | STATUS1_PARALYSIS | STATUS1_TOXIC_POISON,
 *    BattleScript_FacadeDoubleDmg" then "setbyte sDMG_MULTIPLIER, 2"
 * Source: Showdown data/moves.ts facade.onBasePower —
 *   "if (pokemon.status && pokemon.status !== 'slp') { return this.chainModify(2); }"
 *
 * Facade (70 base power, Normal type) doubles its effective power to 140 when
 * the user has burn, paralysis, poison, or badly-poisoned.
 * Sleep does NOT activate Facade's power doubling.
 *
 * Damage derivation (Normal attacker, Normal move, attack=100, defense=100, level=50, max RNG=100):
 *
 * Without status (70 BP):
 *   levelFactor = floor(2×50/5) + 2 = 22
 *   base = floor(floor(22×70×100/100) / 50) = floor(1540/50) = 30
 *   + 2 = 32
 *   × 1.0 (random) = 32
 *   × 1.5 (STAB, Normal attacker vs Normal move) = floor(48) = 48
 *   × 1.0 (type, Normal vs Normal) = 48
 *
 * With burn (140 BP, burn halves physical before +2):
 *   base = floor(floor(22×140×100/100) / 50) = floor(3080/50) = 61
 *   burn: floor(61/2) = 30
 *   + 2 = 32  →  result = 48  (burn exactly cancels doubling for this stat block)
 *
 * With paralysis (140 BP, no physical penalty for paralysis):
 *   base = 61
 *   + 2 = 63
 *   × 1.0 = 63
 *   × 1.5 (STAB) = floor(94.5) = 94
 *   × 1.0 (type) = 94
 */

import type { ActivePokemon, DamageContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType, StatBlock, TypeChart } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen3DataManager, GEN3_MOVE_IDS, GEN3_SPECIES_IDS, GEN3_TYPES } from "../../src";
import { calculateGen3Damage } from "../../src/Gen3DamageCalc";
import { createSyntheticOnFieldPokemon } from "../helpers/createSyntheticOnFieldPokemon";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

const dataManager = createGen3DataManager();

function createActivePokemon(opts: {
  level: number;
  attack: number;
  defense: number;
  spAttack: number;
  spDefense: number;
  types: PokemonType[];
  status?: (typeof CORE_STATUS_IDS)[keyof typeof CORE_STATUS_IDS] | null;
}): ActivePokemon {
  const stats: StatBlock = {
    hp: 200,
    attack: opts.attack,
    defense: opts.defense,
    spAttack: opts.spAttack,
    spDefense: opts.spDefense,
    speed: 100,
  };
  return createSyntheticOnFieldPokemon({
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    calculatedStats: stats,
    currentHp: 200,
    gender: CORE_GENDERS.male,
    heldItem: null,
    level: opts.level,
    speciesId: GEN3_SPECIES_IDS.bulbasaur,
    statStages: {},
    status: opts.status ?? null,
    turnsOnField: 0,
    types: opts.types,
  });
}

function createNeutralTypeChart(): TypeChart {
  const chart = {} as Record<string, Record<string, number>>;
  for (const atk of GEN3_TYPES) {
    chart[atk] = {};
    for (const def of GEN3_TYPES) {
      chart[atk][def] = 1;
    }
  }
  return chart as TypeChart;
}

function createDamageContext(opts: {
  attacker: ActivePokemon;
  defender: ActivePokemon;
  move: MoveData;
  isCrit?: boolean;
  rng?: ReturnType<typeof createMockRng>;
}): DamageContext {
  return {
    attacker: opts.attacker,
    defender: opts.defender,
    move: opts.move,
    isCrit: opts.isCrit ?? false,
    rng: opts.rng ?? createMockRng(100),
    state: { weather: null } as DamageContext["state"],
  } as DamageContext;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Gen 3 — Facade power doubling (#1185)", () => {
  const chart = createNeutralTypeChart();
  const facade = dataManager.getMove(GEN3_MOVE_IDS.facade);

  // Normal attacker (STAB on Facade), attack=100, defense=100, level=50
  const attacker = createActivePokemon({
    level: 50,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    types: [CORE_TYPE_IDS.normal],
  });
  const defender = createActivePokemon({
    level: 50,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    types: [CORE_TYPE_IDS.normal],
  });

  it("given Facade user with no status, when damage is calculated, then base power is 70 (48 damage with normal attacker)", () => {
    // Source: pret/pokeemerald data/battle_scripts_1.s BattleScript_EffectFacade —
    //   jumpifstatus checks for status before doubling; no status = no doubling
    const ctx = createDamageContext({ attacker, defender, move: facade, rng: createMockRng(100) });
    const result = calculateGen3Damage(ctx, chart);
    // 70 BP, Normal STAB attacker: floor(floor(22×70×100/100)/50)=30 +2=32 ×1.5=48
    expect(result.damage).toBe(48);
  });

  it("given Facade user with burn, when damage is calculated, then damage equals baseline (doubling cancels burn halving)", () => {
    // Source: pret/pokeemerald data/battle_scripts_1.s BattleScript_FacadeDoubleDmg —
    //   setbyte sDMG_MULTIPLIER, 2 applies when STATUS1_BURN is set
    // Note: In Gen 3, burn still halves physical attack. Net effect:
    //   140 BP → base=61, burn: floor(61/2)=30, +2=32, ×1.5=48 (same as no status)
    const burnedAttacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: [CORE_TYPE_IDS.normal],
      status: CORE_STATUS_IDS.burn,
    });
    const ctx = createDamageContext({
      attacker: burnedAttacker,
      defender,
      move: facade,
      rng: createMockRng(100),
    });
    const result = calculateGen3Damage(ctx, chart);
    // 140 BP with burn halving → same as 70 BP without burn in this case
    expect(result.damage).toBe(48);
  });

  it("given Facade user with paralysis, when damage is calculated, then damage is doubled (~94) vs baseline 48", () => {
    // Source: pret/pokeemerald data/battle_scripts_1.s BattleScript_FacadeDoubleDmg —
    //   STATUS1_PARALYSIS triggers doubling; paralysis has no physical attack penalty
    // 140 BP, no burn halving: floor(floor(22×140×100/100)/50)=61, +2=63, ×1.5=floor(94.5)=94
    const paralyzedAttacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: [CORE_TYPE_IDS.normal],
      status: CORE_STATUS_IDS.paralysis,
    });
    const ctx = createDamageContext({
      attacker: paralyzedAttacker,
      defender,
      move: facade,
      rng: createMockRng(100),
    });
    const result = calculateGen3Damage(ctx, chart);
    // Source: pokeemerald BattleScript_FacadeDoubleDmg — paralysis triggers 2× multiplier
    expect(result.damage).toBe(94);
  });

  it("given Facade user with poison, when damage is calculated, then damage is doubled (~94) vs baseline 48", () => {
    // Source: pret/pokeemerald data/battle_scripts_1.s BattleScript_EffectFacade —
    //   STATUS1_POISON listed explicitly in jumpifstatus condition
    const poisonedAttacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: [CORE_TYPE_IDS.normal],
      status: CORE_STATUS_IDS.poison,
    });
    const ctx = createDamageContext({
      attacker: poisonedAttacker,
      defender,
      move: facade,
      rng: createMockRng(100),
    });
    const result = calculateGen3Damage(ctx, chart);
    expect(result.damage).toBe(94);
  });

  it("given Facade user with badly-poisoned (toxic), when damage is calculated, then damage is doubled (~94)", () => {
    // Source: pret/pokeemerald data/battle_scripts_1.s BattleScript_EffectFacade —
    //   STATUS1_TOXIC_POISON listed explicitly in jumpifstatus condition
    const toxicAttacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: [CORE_TYPE_IDS.normal],
      status: CORE_STATUS_IDS.badlyPoisoned,
    });
    const ctx = createDamageContext({
      attacker: toxicAttacker,
      defender,
      move: facade,
      rng: createMockRng(100),
    });
    const result = calculateGen3Damage(ctx, chart);
    expect(result.damage).toBe(94);
  });

  it("given Facade user with sleep, when damage is calculated, then damage is NOT doubled (equals baseline 48)", () => {
    // Source: Showdown data/moves.ts facade.onBasePower —
    //   "if (pokemon.status && pokemon.status !== 'slp')" — sleep explicitly excluded
    // Source: pret/pokeemerald — STATUS1_SLEEP not in jumpifstatus condition
    const sleepingAttacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: [CORE_TYPE_IDS.normal],
      status: CORE_STATUS_IDS.sleep,
    });
    const ctx = createDamageContext({
      attacker: sleepingAttacker,
      defender,
      move: facade,
      rng: createMockRng(100),
    });
    const result = calculateGen3Damage(ctx, chart);
    expect(result.damage).toBe(48);
  });
});
