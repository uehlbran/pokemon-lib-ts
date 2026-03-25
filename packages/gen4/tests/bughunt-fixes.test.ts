/**
 * Bug fix tests for Gen 4 issues:
 *   #704 — Mold Breaker bypasses Simple (no stage doubling) and Unaware (stages apply)
 *          in getEffectiveStatStage
 *
 * Source authority: Gen 4 data manager + owned Gen 4/core ids.
 */

import type { ActivePokemon, DamageContext } from "@pokemon-lib-ts/battle";
import type { BattleStat, MoveData, PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  createEvs,
  createIvs,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen4DataManager,
  GEN4_ABILITY_IDS,
  GEN4_MOVE_IDS,
  GEN4_NATURE_IDS,
  GEN4_SPECIES_IDS,
} from "../src";
import { calculateGen4Damage } from "../src/Gen4DamageCalc";
import { GEN4_TYPE_CHART } from "../src/Gen4TypeChart";

const DATA_MANAGER = createGen4DataManager();
const TACKLE = DATA_MANAGER.getMove(GEN4_MOVE_IDS.tackle);
const HARDY_NATURE = DATA_MANAGER.getNature(GEN4_NATURE_IDS.hardy).id;

function createMockRng(intReturnValue: number = 100) {
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

function createGen4ActivePokemon(opts: {
  speciesId: number;
  attack?: number;
  defense?: number;
  spAttack?: number;
  spDefense?: number;
  hp?: number;
  currentHp?: number;
  speed?: number;
  types?: PokemonType[];
  ability?: string;
  heldItem?: string | null;
  gender?: (typeof CORE_GENDERS)[keyof typeof CORE_GENDERS];
  statStages?: Partial<Record<BattleStat, number>>;
}): ActivePokemon {
  const species = DATA_MANAGER.getSpecies(opts.speciesId);
  const maxHp = opts.hp ?? 200;
  const stats = {
    hp: maxHp,
    attack: opts.attack ?? 100,
    defense: opts.defense ?? 100,
    spAttack: opts.spAttack ?? 100,
    spDefense: opts.spDefense ?? 100,
    speed: opts.speed ?? 100,
  };

  const pokemon = {
    uid: "test",
    speciesId: species.id,
    nickname: null,
    level: 50,
    experience: 0,
    nature: HARDY_NATURE,
    ivs: createIvs({ hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 }),
    evs: createEvs(),
    currentHp: opts.currentHp ?? maxHp,
    moves: [],
    ability: opts.ability ?? species.abilities.normal[0] ?? CORE_ABILITY_IDS.none,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    heldItem: opts.heldItem ?? null,
    status: null,
    friendship: 0,
    gender: opts.gender ?? CORE_GENDERS.male,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: CORE_ITEM_IDS.pokeBall,
    calculatedStats: stats,
  } as PokemonInstance;

  return {
    pokemon,
    teamSlot: 0,
    statStages: {
      attack: opts.statStages?.attack ?? 0,
      defense: opts.statStages?.defense ?? 0,
      spAttack: opts.statStages?.spAttack ?? 0,
      spDefense: opts.statStages?.spDefense ?? 0,
      speed: opts.statStages?.speed ?? 0,
      accuracy: opts.statStages?.accuracy ?? 0,
      evasion: opts.statStages?.evasion ?? 0,
    },
    volatileStatuses: new Map(),
    types: opts.types ?? [...species.types],
    ability: opts.ability ?? species.abilities.normal[0] ?? CORE_ABILITY_IDS.none,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
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
    forcedMove: null,
  } as ActivePokemon;
}

function createGen4DamageContext(opts: {
  attacker: ActivePokemon;
  defender: ActivePokemon;
  move: MoveData;
  isCrit?: boolean;
  weather?: { type: string; turnsLeft: number; source: string | null } | null;
}): DamageContext {
  return {
    attacker: opts.attacker,
    defender: opts.defender,
    move: opts.move,
    isCrit: opts.isCrit ?? false,
    rng: createMockRng(100),
    state: {
      weather: opts.weather ?? null,
      gravity: { active: false, turnsLeft: 0 },
    } as DamageContext["state"],
  } as DamageContext;
}

describe("Bug #704: Mold Breaker bypasses Simple and Unaware in getEffectiveStatStage", () => {
  describe("Mold Breaker attacker vs Unaware defender", () => {
    it("given attacker with Mold Breaker at +2 Attack, when attacking Unaware defender, then Attack stages are not ignored", () => {
      const moldBreakerAttacker = createGen4ActivePokemon({
        speciesId: GEN4_SPECIES_IDS.rampardos,
        ability: GEN4_ABILITY_IDS.moldBreaker,
        attack: 100,
        statStages: { attack: 2 },
      });
      const unawareDefender = createGen4ActivePokemon({
        speciesId: GEN4_SPECIES_IDS.bibarel,
        ability: GEN4_ABILITY_IDS.unaware,
        defense: 100,
      });

      const neutralAttacker = createGen4ActivePokemon({
        speciesId: GEN4_SPECIES_IDS.rampardos,
        ability: CORE_ABILITY_IDS.none,
        attack: 100,
        statStages: { attack: 2 },
      });
      const neutralDefender = createGen4ActivePokemon({
        speciesId: GEN4_SPECIES_IDS.bibarel,
        ability: CORE_ABILITY_IDS.none,
        defense: 100,
      });

      const moldBreakerResult = calculateGen4Damage(
        createGen4DamageContext({
          attacker: moldBreakerAttacker,
          defender: unawareDefender,
          move: TACKLE,
        }),
        GEN4_TYPE_CHART,
      );

      const neutralResult = calculateGen4Damage(
        createGen4DamageContext({
          attacker: neutralAttacker,
          defender: neutralDefender,
          move: TACKLE,
        }),
        GEN4_TYPE_CHART,
      );

      expect(moldBreakerResult.damage).toBe(neutralResult.damage);
    });

    it("given attacker without Mold Breaker at +2 Attack, when attacking Unaware defender, then Attack stages are ignored", () => {
      const boostedAttacker = createGen4ActivePokemon({
        speciesId: GEN4_SPECIES_IDS.rampardos,
        ability: CORE_ABILITY_IDS.none,
        attack: 100,
        statStages: { attack: 2 },
      });
      const unawareDefender = createGen4ActivePokemon({
        speciesId: GEN4_SPECIES_IDS.bibarel,
        ability: GEN4_ABILITY_IDS.unaware,
        defense: 100,
      });

      const baseAttacker = createGen4ActivePokemon({
        speciesId: GEN4_SPECIES_IDS.rampardos,
        ability: CORE_ABILITY_IDS.none,
        attack: 100,
        statStages: { attack: 0 },
      });
      const neutralDefender = createGen4ActivePokemon({
        speciesId: GEN4_SPECIES_IDS.bibarel,
        ability: CORE_ABILITY_IDS.none,
        defense: 100,
      });

      const unawareResult = calculateGen4Damage(
        createGen4DamageContext({
          attacker: boostedAttacker,
          defender: unawareDefender,
          move: TACKLE,
        }),
        GEN4_TYPE_CHART,
      );

      const baseResult = calculateGen4Damage(
        createGen4DamageContext({
          attacker: baseAttacker,
          defender: neutralDefender,
          move: TACKLE,
        }),
        GEN4_TYPE_CHART,
      );

      expect(unawareResult.damage).toBe(baseResult.damage);
    });
  });

  describe("Mold Breaker defender vs Simple attacker", () => {
    it("given defender with Mold Breaker, when attacker has Simple at +1 Attack, then Attack stages are doubled", () => {
      const simpleAttacker = createGen4ActivePokemon({
        speciesId: GEN4_SPECIES_IDS.bibarel,
        ability: GEN4_ABILITY_IDS.simple,
        attack: 100,
        statStages: { attack: 1 },
      });
      const moldBreakerDefender = createGen4ActivePokemon({
        speciesId: GEN4_SPECIES_IDS.rampardos,
        ability: GEN4_ABILITY_IDS.moldBreaker,
        defense: 100,
      });

      const doubledAttacker = createGen4ActivePokemon({
        speciesId: GEN4_SPECIES_IDS.bibarel,
        ability: CORE_ABILITY_IDS.none,
        attack: 100,
        statStages: { attack: 2 },
      });
      const neutralDefender = createGen4ActivePokemon({
        speciesId: GEN4_SPECIES_IDS.rampardos,
        ability: CORE_ABILITY_IDS.none,
        defense: 100,
      });

      const moldBreakerResult = calculateGen4Damage(
        createGen4DamageContext({
          attacker: simpleAttacker,
          defender: moldBreakerDefender,
          move: TACKLE,
        }),
        GEN4_TYPE_CHART,
      );

      const doubledResult = calculateGen4Damage(
        createGen4DamageContext({
          attacker: doubledAttacker,
          defender: neutralDefender,
          move: TACKLE,
        }),
        GEN4_TYPE_CHART,
      );

      expect(moldBreakerResult.damage).toBe(doubledResult.damage);
    });

    it("given defender without Mold Breaker, when attacker has Simple at +1 Attack, then Attack stages are doubled", () => {
      const simpleAttacker = createGen4ActivePokemon({
        speciesId: GEN4_SPECIES_IDS.bibarel,
        ability: GEN4_ABILITY_IDS.simple,
        attack: 100,
        statStages: { attack: 1 },
      });
      const normalDefender = createGen4ActivePokemon({
        speciesId: GEN4_SPECIES_IDS.rampardos,
        ability: CORE_ABILITY_IDS.none,
        defense: 100,
      });

      const referenceAttacker = createGen4ActivePokemon({
        speciesId: GEN4_SPECIES_IDS.bibarel,
        ability: CORE_ABILITY_IDS.none,
        attack: 100,
        statStages: { attack: 2 },
      });
      const referenceDefender = createGen4ActivePokemon({
        speciesId: GEN4_SPECIES_IDS.rampardos,
        ability: CORE_ABILITY_IDS.none,
        defense: 100,
      });

      const simpleResult = calculateGen4Damage(
        createGen4DamageContext({
          attacker: simpleAttacker,
          defender: normalDefender,
          move: TACKLE,
        }),
        GEN4_TYPE_CHART,
      );

      const referenceResult = calculateGen4Damage(
        createGen4DamageContext({
          attacker: referenceAttacker,
          defender: referenceDefender,
          move: TACKLE,
        }),
        GEN4_TYPE_CHART,
      );

      expect(simpleResult.damage).toBe(referenceResult.damage);
    });
  });
});
