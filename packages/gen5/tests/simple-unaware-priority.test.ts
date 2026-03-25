/**
 * Tests for #757: Simple/Unaware priority order in getEffectiveStatStage.
 *
 * The correct priority order is:
 *   1. Unaware ignores opponent's stat stages (overrides Simple)
 *   2. Simple doubles stat stages (when no Unaware on opponent)
 *   3. Mold Breaker / Turboblaze / Teravolt bypass opponent's abilities
 *
 * Source: Showdown sim/battle.ts -- Unaware's onAnyModifyBoost runs before Simple's doubling
 * Source: Showdown data/abilities.ts -- moldbreaker/turboblaze/teravolt bypass Unaware/Simple
 */

import type { ActivePokemon, BattleState, DamageContext } from "@pokemon-lib-ts/battle";
import { getEffectiveStatStage } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ITEM_IDS,
  CORE_TYPE_IDS,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen5DataManager,
  GEN5_ABILITY_IDS,
  GEN5_MOVE_IDS,
  GEN5_NATURE_IDS,
  GEN5_SPECIES_IDS,
} from "../src";
import { calculateGen5Damage } from "../src/Gen5DamageCalc";
import { GEN5_TYPE_CHART } from "../src/Gen5TypeChart";

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

const dataManager = createGen5DataManager();

function getGen5Move(id: string): MoveData {
  const move = dataManager.getMove(id);
  return { ...move, flags: { ...move.flags } };
}

function makeActive(overrides: {
  level?: number;
  attack?: number;
  defense?: number;
  spAttack?: number;
  spDefense?: number;
  speed?: number;
  hp?: number;
  currentHp?: number;
  types?: PokemonType[];
  ability?: string;
  heldItem?: string | null;
  status?: string | null;
  speciesId?: number;
  gender?: "male" | "female" | "genderless";
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  statStages?: Partial<Record<string, number>>;
}): ActivePokemon {
  const hp = overrides.hp ?? 200;
  const attack = overrides.attack ?? 100;
  const defense = overrides.defense ?? 100;
  const spAttack = overrides.spAttack ?? 100;
  const spDefense = overrides.spDefense ?? 100;
  const speed = overrides.speed ?? 100;
  return {
    pokemon: {
      uid: "test",
      speciesId: overrides.speciesId ?? GEN5_SPECIES_IDS.bulbasaur,
      nickname: null,
      level: overrides.level ?? 50,
      experience: 0,
      nature: GEN5_NATURE_IDS.hardy,
      ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: overrides.currentHp ?? hp,
      moves: [],
      ability: overrides.ability ?? CORE_ABILITY_IDS.none,
      abilitySlot: "normal1" as const,
      heldItem: overrides.heldItem ?? null,
      status: (overrides.status ?? null) as any,
      friendship: 0,
      gender: (overrides.gender ?? "male") as any,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: CORE_ITEM_IDS.pokeBall,
      calculatedStats: { hp, attack, defense, spAttack, spDefense, speed },
    },
    teamSlot: 0,
    statStages: {
      attack: overrides.statStages?.attack ?? 0,
      defense: overrides.statStages?.defense ?? 0,
      spAttack: overrides.statStages?.spAttack ?? 0,
      spDefense: overrides.statStages?.spDefense ?? 0,
      speed: overrides.statStages?.speed ?? 0,
      accuracy: 0,
      evasion: 0,
    },
    volatileStatuses: overrides.volatiles ?? new Map(),
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

function makeState(): BattleState {
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

function makeDamageContext(overrides: {
  attacker?: ActivePokemon;
  defender?: ActivePokemon;
  move?: MoveData;
  state?: BattleState;
  isCrit?: boolean;
  seed?: number;
}): DamageContext {
  return {
    attacker: overrides.attacker ?? makeActive({}),
    defender: overrides.defender ?? makeActive({}),
    move: overrides.move ?? getGen5Move(GEN5_MOVE_IDS.tackle),
    state: overrides.state ?? makeState(),
    rng: new SeededRandom(overrides.seed ?? 42),
    isCrit: overrides.isCrit ?? false,
  };
}

const typeChart = GEN5_TYPE_CHART as Record<string, Record<string, number>>;

// ---------------------------------------------------------------------------
// #757: Simple/Unaware priority order
// ---------------------------------------------------------------------------

describe("#757 — Simple/Unaware priority order in getEffectiveStatStage", () => {
  it("given attacker has Simple with +2 atk stages and defender has Unaware, when calculating damage, then Unaware ignores stages (Unaware beats Simple)", () => {
    // Source: Showdown data/abilities.ts -- Unaware onAnyModifyBoost; Simple.
    const attacker = makeActive({
      ability: GEN5_ABILITY_IDS.simple,
      attack: 100,
      types: [CORE_TYPE_IDS.normal],
      statStages: { attack: 2 },
    });
    const defenderUnaware = makeActive({
      ability: GEN5_ABILITY_IDS.unaware,
      defense: 100,
      types: [CORE_TYPE_IDS.normal],
    });
    const move = getGen5Move(GEN5_MOVE_IDS.tackle);

    const resultUnaware = calculateGen5Damage(
      makeDamageContext({ attacker, defender: defenderUnaware, move, seed: 99999 }),
      typeChart,
    );

    const attackerBaseline = makeActive({
      ability: CORE_ABILITY_IDS.none,
      attack: 100,
      types: [CORE_TYPE_IDS.normal],
      statStages: { attack: 0 },
    });
    const defenderBaseline = makeActive({
      ability: CORE_ABILITY_IDS.none,
      defense: 100,
      types: [CORE_TYPE_IDS.normal],
    });

    const resultBaseline = calculateGen5Damage(
      makeDamageContext({
        attacker: attackerBaseline,
        defender: defenderBaseline,
        move,
        seed: 99999,
      }),
      typeChart,
    );

    expect(resultUnaware.damage).toBe(resultBaseline.damage);
  });

  it("given attacker has Simple with +2 atk stages and defender has no Unaware, when calculating damage, then Simple doubles stages to +4 (3.0x multiplier)", () => {
    // Source: Showdown data/abilities.ts -- Simple doubles stat boosts.
    const attackerSimple = makeActive({
      ability: GEN5_ABILITY_IDS.simple,
      attack: 100,
      types: [CORE_TYPE_IDS.normal],
      statStages: { attack: 2 },
    });
    const attackerNormal = makeActive({
      ability: CORE_ABILITY_IDS.none,
      attack: 100,
      types: [CORE_TYPE_IDS.normal],
      statStages: { attack: 2 },
    });
    const defender = makeActive({
      ability: CORE_ABILITY_IDS.none,
      defense: 100,
      types: [CORE_TYPE_IDS.normal],
    });
    const move = getGen5Move(GEN5_MOVE_IDS.tackle);

    const resultSimple = calculateGen5Damage(
      makeDamageContext({ attacker: attackerSimple, defender, move, seed: 99999 }),
      typeChart,
    );
    const resultNormal = calculateGen5Damage(
      makeDamageContext({ attacker: attackerNormal, defender, move, seed: 99999 }),
      typeChart,
    );

    expect(resultSimple.damage).toBe(102);
    expect(resultNormal.damage).toBe(69);
  });

  it("given attacker has Mold Breaker with +2 atk stages and defender has Unaware, when calculating damage, then Mold Breaker bypasses Unaware (stages apply)", () => {
    // Source: Showdown data/abilities.ts -- moldbreaker bypasses Unaware.
    const attackerMoldBreaker = makeActive({
      ability: GEN5_ABILITY_IDS.moldBreaker,
      attack: 100,
      types: [CORE_TYPE_IDS.normal],
      statStages: { attack: 2 },
    });
    const defenderUnaware = makeActive({
      ability: GEN5_ABILITY_IDS.unaware,
      defense: 100,
      types: [CORE_TYPE_IDS.normal],
    });
    const move = getGen5Move(GEN5_MOVE_IDS.tackle);

    const resultMoldBreaker = calculateGen5Damage(
      makeDamageContext({
        attacker: attackerMoldBreaker,
        defender: defenderUnaware,
        move,
        seed: 99999,
      }),
      typeChart,
    );

    const attackerNormal = makeActive({
      ability: CORE_ABILITY_IDS.none,
      attack: 100,
      types: [CORE_TYPE_IDS.normal],
      statStages: { attack: 2 },
    });
    const defenderNone = makeActive({
      ability: CORE_ABILITY_IDS.none,
      defense: 100,
      types: [CORE_TYPE_IDS.normal],
    });

    const resultNormal = calculateGen5Damage(
      makeDamageContext({ attacker: attackerNormal, defender: defenderNone, move, seed: 99999 }),
      typeChart,
    );

    expect(resultMoldBreaker.damage).toBe(resultNormal.damage);
  });

  it("given attacker has Turboblaze with +3 atk stages and defender has Unaware, when calculating damage, then Turboblaze bypasses Unaware (stages apply)", () => {
    // Source: Showdown data/abilities.ts -- turboblaze has the same effect as moldbreaker.
    const attackerTurboblaze = makeActive({
      ability: GEN5_ABILITY_IDS.turboblaze,
      attack: 100,
      types: [CORE_TYPE_IDS.normal],
      statStages: { attack: 3 },
    });
    const defenderUnaware = makeActive({
      ability: GEN5_ABILITY_IDS.unaware,
      defense: 100,
      types: [CORE_TYPE_IDS.normal],
    });
    const move = getGen5Move(GEN5_MOVE_IDS.tackle);

    const resultTurboblaze = calculateGen5Damage(
      makeDamageContext({
        attacker: attackerTurboblaze,
        defender: defenderUnaware,
        move,
        seed: 99999,
      }),
      typeChart,
    );

    const attackerBaseline = makeActive({
      ability: CORE_ABILITY_IDS.none,
      attack: 100,
      types: [CORE_TYPE_IDS.normal],
      statStages: { attack: 3 },
    });
    const defenderNone = makeActive({
      ability: CORE_ABILITY_IDS.none,
      defense: 100,
      types: [CORE_TYPE_IDS.normal],
    });

    const resultBaseline = calculateGen5Damage(
      makeDamageContext({ attacker: attackerBaseline, defender: defenderNone, move, seed: 99999 }),
      typeChart,
    );

    expect(resultTurboblaze.damage).toBe(resultBaseline.damage);
  });

  it("given defender has Simple with +2 def stages and attacker has Mold Breaker, when calculating damage, then Mold Breaker bypasses defender's Simple (defense stages not doubled)", () => {
    // Source: Showdown data/abilities.ts -- moldbreaker bypasses Simple on the opponent.
    const attackerMoldBreaker = makeActive({
      ability: GEN5_ABILITY_IDS.moldBreaker,
      attack: 100,
      types: [CORE_TYPE_IDS.normal],
    });
    const defenderSimple = makeActive({
      ability: GEN5_ABILITY_IDS.simple,
      defense: 100,
      types: [CORE_TYPE_IDS.normal],
      statStages: { defense: 2 },
    });
    const move = getGen5Move(GEN5_MOVE_IDS.tackle);

    const resultMoldBreaker = calculateGen5Damage(
      makeDamageContext({
        attacker: attackerMoldBreaker,
        defender: defenderSimple,
        move,
        seed: 99999,
      }),
      typeChart,
    );

    const attackerNone = makeActive({
      ability: CORE_ABILITY_IDS.none,
      attack: 100,
      types: [CORE_TYPE_IDS.normal],
    });

    const resultNoBreaker = calculateGen5Damage(
      makeDamageContext({ attacker: attackerNone, defender: defenderSimple, move, seed: 99999 }),
      typeChart,
    );

    expect(resultMoldBreaker.damage).toBe(19);
    expect(resultNoBreaker.damage).toBe(13);
  });

  it("given attacker has Unaware and defender has Mold Breaker with +2 def stages, when calculating defense stat stage, then Unaware zeros defender's stages (defender MB cannot bypass attacker's Unaware)", () => {
    // Source: Showdown data/abilities.ts -- moldbreaker only suppresses target abilities while attacking.
    const attacker = makeActive({
      ability: GEN5_ABILITY_IDS.unaware,
    });
    const defender = makeActive({
      ability: GEN5_ABILITY_IDS.moldBreaker,
      statStages: { defense: 2 },
    });

    const stage = getEffectiveStatStage(defender, "defense", attacker, "defense");

    expect(stage).toBe(0);
  });
});
