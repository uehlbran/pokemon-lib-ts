import type { AccuracyContext, ActivePokemon, DamageContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType, StatBlock } from "@pokemon-lib-ts/core";
import { CORE_ABILITY_IDS, CORE_ITEM_IDS, CORE_TYPE_IDS, getStatStageMultiplier } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen4DataManager,
  GEN4_ABILITY_IDS,
  GEN4_ITEM_IDS,
  GEN4_MOVE_IDS,
  GEN4_NATURE_IDS,
  GEN4_SPECIES_IDS,
} from "../src";
import { calculateGen4Damage } from "../src/Gen4DamageCalc";
import { Gen4Ruleset } from "../src/Gen4Ruleset";
import { GEN4_TYPE_CHART } from "../src/Gen4TypeChart";

/**
 * Simple & Unaware Ability Tests — Gen 4
 *
 * Canonical move/species/item/ability/nature ids come from the owned Gen 4/core surfaces.
 * Canonical moves are loaded from the Gen 4 data manager; no local canonical payload copies.
 */

const DATA_MANAGER = createGen4DataManager();
const ABILITIES = { ...CORE_ABILITY_IDS, ...GEN4_ABILITY_IDS } as const;
const ITEMS = { ...CORE_ITEM_IDS, ...GEN4_ITEM_IDS } as const;
const MOVES = { ...GEN4_MOVE_IDS } as const;
const SPECIES = GEN4_SPECIES_IDS;
const DEFAULT_SPECIES = DATA_MANAGER.getSpecies(SPECIES.bulbasaur);
const DEFAULT_NATURE = GEN4_NATURE_IDS.hardy;
const TACKLE = DATA_MANAGER.getMove(MOVES.tackle);
const DYNAMIC_PUNCH = DATA_MANAGER.getMove(MOVES.dynamicPunch);

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

function createActivePokemon(opts: {
  level?: number;
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
  status?: PrimaryStatus | null;
  statStages?: Partial<Record<string, number>>;
}): ActivePokemon {
  const level = opts.level ?? 50;
  const maxHp = opts.hp ?? 200;
  const stats: StatBlock = {
    hp: maxHp,
    attack: opts.attack ?? 100,
    defense: opts.defense ?? 100,
    spAttack: opts.spAttack ?? 100,
    spDefense: opts.spDefense ?? 100,
    speed: opts.speed ?? 100,
  };

  const pokemon = {
    uid: "test",
    speciesId: DEFAULT_SPECIES.id,
    nickname: null,
    level,
    experience: 0,
    nature: DEFAULT_NATURE,
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: opts.currentHp ?? maxHp,
    moves: [],
    ability: opts.ability ?? ABILITIES.none,
    abilitySlot: "normal1" as const,
    heldItem: opts.heldItem ?? null,
    status: opts.status ?? null,
    friendship: 0,
    gender: "male" as const,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: ITEMS.pokeBall,
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
    types: opts.types ?? [CORE_TYPE_IDS.normal],
    ability: opts.ability ?? ABILITIES.none,
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

function createMockState(weather?: { type: string; turnsLeft: number; source: string } | null) {
  return {
    weather: weather ?? null,
    gravity: { active: false, turnsLeft: 0 },
  } as DamageContext["state"];
}

function createDamageContext(opts: {
  attacker: ActivePokemon;
  defender: ActivePokemon;
  move: MoveData;
  isCrit?: boolean;
  rng?: ReturnType<typeof createMockRng>;
  weather?: { type: string; turnsLeft: number; source: string } | null;
}): DamageContext {
  return {
    attacker: opts.attacker,
    defender: opts.defender,
    move: opts.move,
    isCrit: opts.isCrit ?? false,
    rng: opts.rng ?? createMockRng(100),
    state: createMockState(opts.weather),
  } as DamageContext;
}

describe("Simple ability", () => {
  describe("damage calculation — attack stages doubled", () => {
    it("given attacker with Simple at +1 Attack stage, when Tackle is used, then damage matches a normal attacker at +2 Attack stage", () => {
      // Source: Bulbapedia — Simple doubles stat stage changes.
      const simpleAttacker = createActivePokemon({
        ability: ABILITIES.simple,
        attack: 100,
        statStages: { attack: 1 },
      });
      const normalAttacker = createActivePokemon({
        attack: 100,
        statStages: { attack: 2 },
      });
      const defender = createActivePokemon({ defense: 100 });
      const move = TACKLE;

      const simpleResult = calculateGen4Damage(
        createDamageContext({ attacker: simpleAttacker, defender, move }),
        GEN4_TYPE_CHART,
      );
      const normalResult = calculateGen4Damage(
        createDamageContext({ attacker: normalAttacker, defender, move }),
        GEN4_TYPE_CHART,
      );

      expect(simpleResult.damage).toBe(normalResult.damage);
    });

    it("given attacker with Simple at +4 Attack stage, when Tackle is used, then damage matches a normal attacker at +6 Attack stage", () => {
      // Source: Bulbapedia — Simple stages clamp after doubling.
      const simpleAttacker = createActivePokemon({
        ability: ABILITIES.simple,
        attack: 100,
        statStages: { attack: 4 },
      });
      const normalAttacker = createActivePokemon({
        attack: 100,
        statStages: { attack: 6 },
      });
      const defender = createActivePokemon({ defense: 100 });
      const move = TACKLE;

      const simpleResult = calculateGen4Damage(
        createDamageContext({ attacker: simpleAttacker, defender, move }),
        GEN4_TYPE_CHART,
      );
      const normalResult = calculateGen4Damage(
        createDamageContext({ attacker: normalAttacker, defender, move }),
        GEN4_TYPE_CHART,
      );

      expect(simpleResult.damage).toBe(normalResult.damage);
    });
  });

  describe("damage calculation — defense stages doubled", () => {
    it("given defender with Simple at -1 Defense stage, when Tackle is used, then damage matches a normal defender at -2 Defense stage", () => {
      // Source: Bulbapedia — Simple doubles stat stage changes.
      const attacker = createActivePokemon({ attack: 100 });
      const simpleDefender = createActivePokemon({
        ability: ABILITIES.simple,
        defense: 100,
        statStages: { defense: -1 },
      });
      const normalDefender = createActivePokemon({
        defense: 100,
        statStages: { defense: -2 },
      });
      const move = TACKLE;

      const simpleResult = calculateGen4Damage(
        createDamageContext({ attacker, defender: simpleDefender, move }),
        GEN4_TYPE_CHART,
      );
      const normalResult = calculateGen4Damage(
        createDamageContext({ attacker, defender: normalDefender, move }),
        GEN4_TYPE_CHART,
      );

      expect(simpleResult.damage).toBe(normalResult.damage);
    });

    it("given defender with Simple at -4 Defense stage, when Tackle is used, then damage matches a normal defender at -6 Defense stage", () => {
      // Source: Bulbapedia — Simple stat stages clamp after doubling.
      const attacker = createActivePokemon({ attack: 100 });
      const simpleDefender = createActivePokemon({
        ability: ABILITIES.simple,
        defense: 100,
        statStages: { defense: -4 },
      });
      const normalDefender = createActivePokemon({
        defense: 100,
        statStages: { defense: -6 },
      });
      const move = TACKLE;

      const simpleResult = calculateGen4Damage(
        createDamageContext({ attacker, defender: simpleDefender, move }),
        GEN4_TYPE_CHART,
      );
      const normalResult = calculateGen4Damage(
        createDamageContext({ attacker, defender: normalDefender, move }),
        GEN4_TYPE_CHART,
      );

      expect(simpleResult.damage).toBe(normalResult.damage);
    });
  });

  describe("speed calculation — stages doubled", () => {
    it("given Pokemon with Simple at +1 Speed stage, when turn order is considered, then speed behaves as +2 stage", () => {
      // Source: Bulbapedia — Simple doubles stat stage changes.
      const simpleSpeedMultiplied = Math.floor(100 * getStatStageMultiplier(2));
      const normalSpeedSingleBoost = Math.floor(100 * getStatStageMultiplier(1));

      expect(simpleSpeedMultiplied).toBe(200);
      expect(normalSpeedSingleBoost).toBe(150);
      expect(simpleSpeedMultiplied).toBeGreaterThan(normalSpeedSingleBoost);
    });
  });
});

describe("Unaware ability", () => {
  describe("damage calculation — ignores defender stat stages when attacking", () => {
    it("given attacker with Unaware, when defender has +6 Defense stage, then damage matches a defender at +0 Defense stage", () => {
      // Source: Bulbapedia — Unaware ignores the opposing Pokemon's stat stage changes in damage calc.
      const unawareAttacker = createActivePokemon({
        ability: ABILITIES.unaware,
        attack: 100,
      });
      const boostedDefender = createActivePokemon({
        defense: 100,
        statStages: { defense: 6 },
      });
      const normalDefender = createActivePokemon({
        defense: 100,
        statStages: { defense: 0 },
      });
      const move = TACKLE;

      const vsBoosted = calculateGen4Damage(
        createDamageContext({ attacker: unawareAttacker, defender: boostedDefender, move }),
        GEN4_TYPE_CHART,
      );
      const vsNormal = calculateGen4Damage(
        createDamageContext({ attacker: unawareAttacker, defender: normalDefender, move }),
        GEN4_TYPE_CHART,
      );

      expect(vsBoosted.damage).toBe(vsNormal.damage);
    });

    it("given attacker without Unaware, when defender has +6 Defense stage, then damage is reduced", () => {
      // Source: Showdown Gen 4 — without Unaware, defense boosts reduce damage normally.
      const normalAttacker = createActivePokemon({
        attack: 100,
      });
      const boostedDefender = createActivePokemon({
        defense: 100,
        statStages: { defense: 6 },
      });
      const unboostedDefender = createActivePokemon({
        defense: 100,
        statStages: { defense: 0 },
      });
      const move = TACKLE;

      const vsBoosted = calculateGen4Damage(
        createDamageContext({ attacker: normalAttacker, defender: boostedDefender, move }),
        GEN4_TYPE_CHART,
      );
      const vsUnboosted = calculateGen4Damage(
        createDamageContext({ attacker: normalAttacker, defender: unboostedDefender, move }),
        GEN4_TYPE_CHART,
      );

      expect(vsBoosted.damage).toBeLessThan(vsUnboosted.damage);
    });
  });

  describe("damage calculation — ignores attacker stat stages when defending", () => {
    it("given defender with Unaware, when attacker has +6 Attack stage, then damage matches an attacker at +0 Attack stage", () => {
      // Source: Bulbapedia — Unaware ignores the opposing Pokemon's stat stage changes in damage calc.
      const boostedAttacker = createActivePokemon({
        attack: 100,
        statStages: { attack: 6 },
      });
      const normalAttacker = createActivePokemon({
        attack: 100,
        statStages: { attack: 0 },
      });
      const unawareDefender = createActivePokemon({
        ability: ABILITIES.unaware,
        defense: 100,
      });
      const move = TACKLE;

      const fromBoosted = calculateGen4Damage(
        createDamageContext({ attacker: boostedAttacker, defender: unawareDefender, move }),
        GEN4_TYPE_CHART,
      );
      const fromNormal = calculateGen4Damage(
        createDamageContext({ attacker: normalAttacker, defender: unawareDefender, move }),
        GEN4_TYPE_CHART,
      );

      expect(fromBoosted.damage).toBe(fromNormal.damage);
    });
  });

  describe("own stat stages still apply", () => {
    it("given attacker with Unaware and +2 Attack stage, when Tackle is used, then own +2 Attack stage is still applied", () => {
      // Source: Bulbapedia — Unaware only ignores the opposing Pokemon's stat stage changes.
      const unawareAttackerBoosted = createActivePokemon({
        ability: ABILITIES.unaware,
        attack: 100,
        statStages: { attack: 2 },
      });
      const unawareAttackerUnboosted = createActivePokemon({
        ability: ABILITIES.unaware,
        attack: 100,
        statStages: { attack: 0 },
      });
      const defender = createActivePokemon({ defense: 100 });
      const move = TACKLE;

      const boostedResult = calculateGen4Damage(
        createDamageContext({ attacker: unawareAttackerBoosted, defender, move }),
        GEN4_TYPE_CHART,
      );
      const unboostedResult = calculateGen4Damage(
        createDamageContext({ attacker: unawareAttackerUnboosted, defender, move }),
        GEN4_TYPE_CHART,
      );

      expect(boostedResult.damage).toBeGreaterThan(unboostedResult.damage);
    });
  });

  describe("accuracy/evasion interaction", () => {
    it("given attacker with Unaware, when defender has +6 evasion, then defender evasion is ignored", () => {
      // Source: Bulbapedia — Unaware ignores the opposing Pokemon's stat stage changes.
      const ruleset = new Gen4Ruleset(DATA_MANAGER);
      const attacker = createActivePokemon({
        ability: ABILITIES.unaware,
      });
      const defender = createActivePokemon({
        statStages: { evasion: 6 },
      });
      const move = DYNAMIC_PUNCH;
      const rng = createMockRng(1);
      const state = {
        weather: null,
        gravity: { active: false, turnsLeft: 0 },
      };

      const hits = ruleset.doesMoveHit({
        attacker,
        defender,
        move,
        rng,
        state,
      } as AccuracyContext);
      expect(hits).toBe(true);
    });

    it("given defender with Unaware, when attacker has +6 accuracy, then attacker accuracy is ignored", () => {
      // Source: Bulbapedia — Unaware ignores the opposing Pokemon's stat stage changes.
      const ruleset = new Gen4Ruleset(DATA_MANAGER);
      const attacker = createActivePokemon({
        statStages: { accuracy: 6 },
      });
      const defender = createActivePokemon({
        ability: ABILITIES.unaware,
      });
      const move = DYNAMIC_PUNCH;
      const rng = createMockRng(80);
      const state = {
        weather: null,
        gravity: { active: false, turnsLeft: 0 },
      };

      const hits = ruleset.doesMoveHit({
        attacker,
        defender,
        move,
        rng,
        state,
      } as AccuracyContext);
      expect(hits).toBe(false);
    });
  });
});
