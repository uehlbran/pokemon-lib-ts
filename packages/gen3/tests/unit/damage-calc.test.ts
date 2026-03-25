import type { ActivePokemon, DamageContext } from "@pokemon-lib-ts/battle";
import type {
  MoveData,
  PokemonInstance,
  PokemonType,
  StatBlock,
  TypeChart,
} from "@pokemon-lib-ts/core";
import { CORE_STATUS_IDS, CORE_TYPE_IDS, CORE_WEATHER_IDS } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen3DataManager,
  GEN3_MOVE_IDS,
  GEN3_NATURE_IDS,
  GEN3_SPECIES_IDS,
  GEN3_TYPES,
} from "../../src";
import { calculateGen3Damage, isGen3PhysicalType } from "../../src/Gen3DamageCalc";

/**
 * Gen 3 Damage Formula Tests
 *
 * The Gen 3 damage formula (pokeemerald order):
 *   BaseDamage = floor(floor(floor(2*Level/5+2) * Power * Atk/Def) / 50) + 2
 *
 * Modifier chain (applied in this order per pokeemerald):
 *   1. Targets (0.5x if spread move hitting multiple targets — doubles)
 *   2. Weather (rain: Water 1.5x / Fire 0.5x; sun: Fire 1.5x / Water 0.5x)
 *   3. Critical hit (2.0x)
 *   4. Random factor (85-100 inclusive, / 100)
 *   5. STAB (1.5x)
 *   6. Type effectiveness (product of matchups)
 *   7. Burn penalty (0.5x if attacker burned + physical move)
 *
 * Source: pret/pokeemerald src/battle_script_commands.c
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** A mock RNG whose int() always returns a fixed value. */
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
const T = CORE_TYPE_IDS;
const S = CORE_STATUS_IDS;
const W = CORE_WEATHER_IDS;

/** Minimal ActivePokemon mock. */
function createActivePokemon(opts: {
  level: number;
  attack: number;
  defense: number;
  spAttack: number;
  spDefense: number;
  types: PokemonType[];
  status?: (typeof S)[keyof typeof S] | null;
  heldItem?: string | null;
  statStages?: Partial<Record<string, number>>;
}): ActivePokemon {
  const stats: StatBlock = {
    hp: 200,
    attack: opts.attack,
    defense: opts.defense,
    spAttack: opts.spAttack,
    spDefense: opts.spDefense,
    speed: 100,
  };

  const pokemon = {
    uid: "test",
    speciesId: GEN3_SPECIES_IDS.bulbasaur,
    nickname: null,
    level: opts.level,
    experience: 0,
    nature: GEN3_NATURE_IDS.hardy,
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: 200,
    moves: [],
    ability: "",
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
    pokeball: "pokeball",
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
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
    volatileStatuses: new Map(),
    types: opts.types,
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
    stellarBoostedTypes: [],
  } as ActivePokemon;
}

/** Create a move mock from the owned Gen 3 move data. */
function createMove(id: string, overrides?: Partial<MoveData>): MoveData {
  return {
    ...dataManager.getMove(id),
    ...overrides,
  } as MoveData;
}

/** All-neutral type chart for 17 Gen 3 types. */
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

/** Create a type chart with specific overrides from neutral. */
function createTypeChart(overrides: [PokemonType, PokemonType, number][]): TypeChart {
  const chart = createNeutralTypeChart();
  for (const [atk, def, mult] of overrides) {
    (chart as Record<string, Record<string, number>>)[atk]![def] = mult;
  }
  return chart;
}

/** Create a BattleState mock with optional weather. */
function createMockState(weather?: { type: string; turnsLeft: number; source: string } | null) {
  return {
    weather: weather ?? null,
  } as DamageContext["state"];
}

/** Create a full DamageContext for calculateGen3Damage. */
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
    rng: opts.rng ?? createMockRng(100), // max random roll = no random penalty
    state: createMockState(opts.weather),
  } as DamageContext;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Gen 3 Damage Calculation", () => {
  // --- Physical vs Special Type Detection ---

  describe("isGen3PhysicalType", () => {
    it("given ground type (Earthquake), when determining move category, then isPhysical returns true", () => {
      // Source: Gen 3 type-based split — Ground is physical
      // pret/pokeemerald: TYPE_IS_PHYSICAL macro includes Normal through Steel (physical subset)
      expect(isGen3PhysicalType(T.ground)).toBe(true);
    });

    it("given fire type (Flamethrower), when determining move category, then isPhysical returns false", () => {
      // Source: Gen 3 type-based split — Fire is special
      // pret/pokeemerald: Fire is not in the TYPE_IS_PHYSICAL set
      expect(isGen3PhysicalType(T.fire)).toBe(false);
    });

    it("given psychic type, when determining move category, then isPhysical returns false", () => {
      // Source: Gen 3 type-based split — Psychic is special
      expect(isGen3PhysicalType(T.psychic)).toBe(false);
    });

    it("given normal type (Tackle), when determining move category, then isPhysical returns true", () => {
      // Source: Gen 3 type-based split — Normal is physical
      expect(isGen3PhysicalType(T.normal)).toBe(true);
    });

    it("given fighting type, when determining move category, then isPhysical returns true", () => {
      // Source: Gen 3 type-based split — Fighting is physical
      expect(isGen3PhysicalType(T.fighting)).toBe(true);
    });

    it("given ghost type, when determining move category, then isPhysical returns true", () => {
      // Source: Gen 3 type-based split — Ghost is physical (unusual but correct)
      // Shadow Ball is physical in Gen 3; this is type-based, not move-based
      expect(isGen3PhysicalType(T.ghost)).toBe(true);
    });

    it("given steel type, when determining move category, then isPhysical returns true", () => {
      // Source: Gen 3 type-based split — Steel is physical
      expect(isGen3PhysicalType(T.steel)).toBe(true);
    });

    it("given dark type, when determining move category, then isPhysical returns false", () => {
      // Source: Gen 3 type-based split — Dark is special
      expect(isGen3PhysicalType(T.dark)).toBe(false);
    });

    it("given water type, when determining move category, then isPhysical returns false", () => {
      // Source: Gen 3 type-based split — Water is special
      expect(isGen3PhysicalType(T.water)).toBe(false);
    });

    it("given dragon type, when determining move category, then isPhysical returns false", () => {
      // Source: Gen 3 type-based split — Dragon is special
      expect(isGen3PhysicalType(T.dragon)).toBe(false);
    });
  });

  // --- Base Formula (no modifiers) ---

  describe("base damage formula", () => {
    it("given L50 attacker with Atk=100 using Rock Throw (50 BP) vs Def=100, when calculating with max random roll and neutral type, then returns expected base damage", () => {
      // Source: Manual formula derivation from pret/pokeemerald
      // BaseDamage = floor(floor(floor(2 * 50 / 5 + 2) * 50 * 100 / 100) / 50) + 2
      //   levelFactor = floor(100/5) + 2 = 22
      //   floor(22 * 50 * 100 / 100) = floor(110000 / 100) = 1100
      //   floor(1100 / 50) = 22
      //   22 + 2 = 24
      // Modifiers: random = 100/100 = 1.0, STAB = 1.0, type = 1.0, crit = 1.0
      // Final = 24
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.normal],
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.normal],
      });
      // Rock type = physical, uses Atk/Def
      const move = createMove(GEN3_MOVE_IDS.rockThrow, { type: T.rock, power: 50 });
      const chart = createNeutralTypeChart();
      const ctx = createDamageContext({
        attacker,
        defender,
        move,
        rng: createMockRng(100), // random = 100/100 = 1.0
      });

      const result = calculateGen3Damage(ctx, chart);
      expect(result.damage).toBe(24);
    });

    it("given L100 attacker with Atk=200 using 100 BP normal move vs Def=150, when calculating with max random roll, then returns expected base damage", () => {
      // Source: Manual formula derivation from pret/pokeemerald
      // BaseDamage = floor(floor(floor(2 * 100 / 5 + 2) * 100 * 200 / 150) / 50) + 2
      //   levelFactor = floor(200/5) + 2 = 42
      //   floor(42 * 100 * 200 / 150) = floor(840000 / 150) = 5600
      //   floor(5600 / 50) = 112
      //   112 + 2 = 114
      // Final = 114 (neutral type, no STAB, max random roll)
      const attacker = createActivePokemon({
        level: 100,
        attack: 200,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.fighting],
      });
      const defender = createActivePokemon({
        level: 100,
        attack: 100,
        defense: 150,
        spAttack: 100,
        spDefense: 100,
        types: [T.rock],
      });
      const move = createMove(GEN3_MOVE_IDS.earthquake, { type: T.ground, power: 100 });
      const chart = createNeutralTypeChart();
      const ctx = createDamageContext({
        attacker,
        defender,
        move,
        rng: createMockRng(100),
      });

      const result = calculateGen3Damage(ctx, chart);
      expect(result.damage).toBe(114);
    });

    it("given a status move (power=0), when calculating damage, then returns 0 damage", () => {
      // Source: pret/pokeemerald — status moves deal no damage
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.normal],
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.normal],
      });
      const move = createMove(GEN3_MOVE_IDS.growl, { type: T.normal, power: 0, category: "status" });
      move.category = "status" as any;
      const chart = createNeutralTypeChart();
      const ctx = createDamageContext({ attacker, defender, move });

      const result = calculateGen3Damage(ctx, chart);
      expect(result.damage).toBe(0);
      expect(result.effectiveness).toBe(1);
    });
  });

  // --- STAB ---

  describe("STAB (Same Type Attack Bonus)", () => {
    it("given a Water-type using Surf (Water, 95 BP), when calculating damage, then STAB 1.5x is applied", () => {
      // Source: pret/pokeemerald — STAB multiplies damage by 1.5 when move type matches attacker type
      // Using max random roll (100) and neutral type chart to isolate STAB
      const waterAttacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 120,
        spDefense: 100,
        types: [T.water],
      });
      const normalAttacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 120,
        spDefense: 100,
        types: [T.normal],
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.normal],
      });
      // Water = special, uses SpAtk/SpDef
      const move = createMove(GEN3_MOVE_IDS.surf, { type: T.water, power: 95 });
      const chart = createNeutralTypeChart();

      const stabCtx = createDamageContext({
        attacker: waterAttacker,
        defender,
        move,
        rng: createMockRng(100),
      });
      const noStabCtx = createDamageContext({
        attacker: normalAttacker,
        defender,
        move,
        rng: createMockRng(100),
      });

      const stabResult = calculateGen3Damage(stabCtx, chart);
      const noStabResult = calculateGen3Damage(noStabCtx, chart);

      // STAB result should be floor(noStab * 1.5)
      expect(stabResult.damage).toBe(Math.floor(noStabResult.damage * 1.5));
    });

    it("given a Fire/Flying-type using Flamethrower (Fire, 95 BP), when calculating damage, then STAB 1.5x is applied for Fire match", () => {
      // Source: pret/pokeemerald — dual-type attacker gets STAB if move type matches either type
      const fireFlying = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 130,
        spDefense: 100,
        types: [T.fire, T.flying],
      });
      const pureNormal = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 130,
        spDefense: 100,
        types: [T.normal],
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.normal],
      });
      const move = createMove(GEN3_MOVE_IDS.flamethrower, { type: T.fire, power: 95 });
      const chart = createNeutralTypeChart();

      const stabResult = calculateGen3Damage(
        createDamageContext({ attacker: fireFlying, defender, move, rng: createMockRng(100) }),
        chart,
      );
      const noStabResult = calculateGen3Damage(
        createDamageContext({ attacker: pureNormal, defender, move, rng: createMockRng(100) }),
        chart,
      );

      expect(stabResult.damage).toBe(Math.floor(noStabResult.damage * 1.5));
    });
  });

  // --- Type Effectiveness ---

  describe("type effectiveness", () => {
    it("given Fire move vs Water-type defender, when calculating damage, then effectiveness is 0.5x (not-very-effective)", () => {
      // Source: Gen 3 type chart — Fire vs Water = 0.5x
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 120,
        spDefense: 100,
        types: [T.normal],
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.water],
      });
      const move = createMove(GEN3_MOVE_IDS.fireBlast, { type: T.fire, power: 100 });
      const chart = createTypeChart([[T.fire, T.water, 0.5]]);
      const ctx = createDamageContext({ attacker, defender, move, rng: createMockRng(100) });

      const result = calculateGen3Damage(ctx, chart);
      expect(result.effectiveness).toBe(0.5);
      // Compare to neutral: result should be half
      const neutralChart = createNeutralTypeChart();
      const neutralResult = calculateGen3Damage(
        createDamageContext({ attacker, defender, move, rng: createMockRng(100) }),
        neutralChart,
      );
      // After flooring, 0.5x applied to base
      expect(result.damage).toBe(Math.floor(neutralResult.damage * 0.5));
    });

    it("given Electric move vs Ground-type defender, when calculating damage, then damage is 0 (immune)", () => {
      // Source: Gen 3 type chart — Electric vs Ground = 0x
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 120,
        spDefense: 100,
        types: [T.normal],
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.ground],
      });
      const move = createMove(GEN3_MOVE_IDS.thunder, { type: T.electric, power: 100 });
      const chart = createTypeChart([[T.electric, T.ground, 0]]);
      const ctx = createDamageContext({ attacker, defender, move, rng: createMockRng(100) });

      const result = calculateGen3Damage(ctx, chart);
      expect(result.damage).toBe(0);
      expect(result.effectiveness).toBe(0);
    });

    it("given Water move vs Fire-type defender, when calculating damage, then effectiveness is 2x (super-effective)", () => {
      // Source: Gen 3 type chart — Water vs Fire = 2x
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 120,
        spDefense: 100,
        types: [T.normal],
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.fire],
      });
      const move = createMove(GEN3_MOVE_IDS.hydroPump, { type: T.water, power: 100 });
      const chart = createTypeChart([[T.water, T.fire, 2]]);
      const ctx = createDamageContext({ attacker, defender, move, rng: createMockRng(100) });

      const result = calculateGen3Damage(ctx, chart);
      expect(result.effectiveness).toBe(2);
    });

    it("given Water move vs Fire/Grass defender, when calculating damage, then effectiveness is 1x (2x * 0.5x)", () => {
      // Source: Gen 3 type chart — dual type effectiveness is product of individual matchups
      // Water vs Fire = 2x, Water vs Grass = 0.5x → 2 * 0.5 = 1x
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 120,
        spDefense: 100,
        types: [T.normal],
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.fire, T.grass],
      });
      const move = createMove(GEN3_MOVE_IDS.hydroPump, { type: T.water, power: 100 });
      const chart = createTypeChart([
        [T.water, T.fire, 2],
        [T.water, T.grass, 0.5],
      ]);
      const ctx = createDamageContext({ attacker, defender, move, rng: createMockRng(100) });

      const result = calculateGen3Damage(ctx, chart);
      expect(result.effectiveness).toBe(1);
    });

    it("given Ground move vs Fire/Rock defender, when calculating damage, then effectiveness is 4x (double super-effective)", () => {
      // Source: Gen 3 type chart — Ground vs Fire = 2x, Ground vs Rock = 2x → 2 * 2 = 4x
      const attacker = createActivePokemon({
        level: 50,
        attack: 150,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.normal],
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 80,
        spAttack: 100,
        spDefense: 100,
        types: [T.fire, T.rock],
      });
      const move = createMove(GEN3_MOVE_IDS.earthquake, { type: T.ground, power: 100 });
      const chart = createTypeChart([
        [T.ground, T.fire, 2],
        [T.ground, T.rock, 2],
      ]);
      const ctx = createDamageContext({ attacker, defender, move, rng: createMockRng(100) });

      const result = calculateGen3Damage(ctx, chart);
      expect(result.effectiveness).toBe(4);
    });
  });

  // --- Critical Hit ---

  describe("critical hit", () => {
    it("given a critical hit, when calculating damage, then multiplier is 2.0x vs non-crit", () => {
      // Source: pret/pokeemerald — Gen 3 crit multiplier = 2.0x
      // Use fighting-type attacker with normal-type move to avoid STAB
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.fighting],
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.fighting],
      });
      const move = createMove(GEN3_MOVE_IDS.doubleEdge, { type: T.normal, power: 80 });
      const chart = createNeutralTypeChart();

      const critCtx = createDamageContext({
        attacker,
        defender,
        move,
        isCrit: true,
        rng: createMockRng(100),
      });
      const normalCtx = createDamageContext({
        attacker,
        defender,
        move,
        isCrit: false,
        rng: createMockRng(100),
      });

      const critResult = calculateGen3Damage(critCtx, chart);
      const normalResult = calculateGen3Damage(normalCtx, chart);

      // No STAB (fighting attacker, normal move), neutral type, max random roll
      // Base = floor(floor(22*80*100/100)/50)+2 = 37
      // Non-crit: 37, Crit: weather(1.0) applied, then * 2 = 74
      // Source: manual derivation from pret/pokeemerald formula
      expect(normalResult.damage).toBe(37);
      expect(critResult.damage).toBe(74);
      expect(critResult.isCrit).toBe(true);
      expect(normalResult.isCrit).toBe(false);
    });

    it("given a crit with attacker at -1 Atk stage, when calculating, then negative stage is ignored (uses stage 0)", () => {
      // Source: pret/pokeemerald CalcCritChanceStage + damage calc
      // On crit: if attacker's attack stage < 0, treat as 0 (ignore the debuff)
      // On crit: if defender's defense stage > 0, treat as 0 (ignore the buff)
      const attackerWithDebuff = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.normal],
        statStages: { attack: -1 },
      });
      const attackerNoDebuff = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.normal],
        statStages: { attack: 0 },
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.normal],
      });
      const move = createMove(GEN3_MOVE_IDS.doubleEdge, { type: T.normal, power: 80 });
      const chart = createNeutralTypeChart();

      // Both with crit = true; the -1 Atk stage should be ignored
      const debuffCrit = calculateGen3Damage(
        createDamageContext({
          attacker: attackerWithDebuff,
          defender,
          move,
          isCrit: true,
          rng: createMockRng(100),
        }),
        chart,
      );
      const noDebuffCrit = calculateGen3Damage(
        createDamageContext({
          attacker: attackerNoDebuff,
          defender,
          move,
          isCrit: true,
          rng: createMockRng(100),
        }),
        chart,
      );

      // With the negative stage ignored, damage should be identical
      expect(debuffCrit.damage).toBe(noDebuffCrit.damage);
    });

    it("given a crit with attacker at +1 Atk stage, when calculating, then positive stage is kept", () => {
      // Source: pret/pokeemerald — crit does NOT ignore positive attacker stages
      const attackerBoosted = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.normal],
        statStages: { attack: 1 },
      });
      const attackerNeutral = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.normal],
        statStages: { attack: 0 },
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.normal],
      });
      const move = createMove(GEN3_MOVE_IDS.doubleEdge, { type: T.normal, power: 80 });
      const chart = createNeutralTypeChart();

      const boostedCrit = calculateGen3Damage(
        createDamageContext({
          attacker: attackerBoosted,
          defender,
          move,
          isCrit: true,
          rng: createMockRng(100),
        }),
        chart,
      );
      const neutralCrit = calculateGen3Damage(
        createDamageContext({
          attacker: attackerNeutral,
          defender,
          move,
          isCrit: true,
          rng: createMockRng(100),
        }),
        chart,
      );

      // Derivation (level=50, power=80, rng=100, isCrit=true, normal-type STAB 1.5x):
      //   levelFactor = floor(2*50/5) + 2 = 22
      //   neutralCrit:  atk=100 (stage 0)  → baseDmg = floor(floor(22*80*100/100)/50)+2 = 37
      //                 isCrit ×2 = 74, random×1.0 = 74, STAB×1.5 = floor(111) = 111
      //   boostedCrit:  atk=floor(100*1.5)=150 (stage +1 kept on crit)
      //                 → baseDmg = floor(floor(22*80*150/100)/50)+2 = floor(2640/50)+2 = 54
      //                 isCrit ×2 = 108, random×1.0 = 108, STAB×1.5 = floor(162) = 162
      expect(neutralCrit.damage).toBe(111);
      expect(boostedCrit.damage).toBe(162);
    });

    it("given a crit with defender at +2 Def stage, when calculating, then positive defense stage is ignored", () => {
      // Source: pret/pokeemerald — crit ignores positive defender stat stages
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.normal],
      });
      const defenderBoosted = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.normal],
        statStages: { defense: 2 },
      });
      const defenderNeutral = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.normal],
      });
      const move = createMove(GEN3_MOVE_IDS.doubleEdge, { type: T.normal, power: 80 });
      const chart = createNeutralTypeChart();

      const vsBoostedCrit = calculateGen3Damage(
        createDamageContext({
          attacker,
          defender: defenderBoosted,
          move,
          isCrit: true,
          rng: createMockRng(100),
        }),
        chart,
      );
      const vsNeutralCrit = calculateGen3Damage(
        createDamageContext({
          attacker,
          defender: defenderNeutral,
          move,
          isCrit: true,
          rng: createMockRng(100),
        }),
        chart,
      );

      // Crit ignores the +2 Def boost, so damage should be the same
      expect(vsBoostedCrit.damage).toBe(vsNeutralCrit.damage);
    });

    it("given a crit with defender at -1 Def stage, when calculating, then negative defense stage is kept", () => {
      // Source: pret/pokeemerald — crit does NOT ignore negative defender stages
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.normal],
      });
      const defenderDebuffed = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.normal],
        statStages: { defense: -1 },
      });
      const defenderNeutral = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.normal],
      });
      const move = createMove(GEN3_MOVE_IDS.doubleEdge, { type: T.normal, power: 80 });
      const chart = createNeutralTypeChart();

      const vsDebuffedCrit = calculateGen3Damage(
        createDamageContext({
          attacker,
          defender: defenderDebuffed,
          move,
          isCrit: true,
          rng: createMockRng(100),
        }),
        chart,
      );
      const vsNeutralCrit = calculateGen3Damage(
        createDamageContext({
          attacker,
          defender: defenderNeutral,
          move,
          isCrit: true,
          rng: createMockRng(100),
        }),
        chart,
      );

      // Derivation (level=50, power=80, rng=100, isCrit=true, normal-type STAB 1.5x):
      //   levelFactor = floor(2*50/5) + 2 = 22
      //   vsNeutralCrit: def=100 (stage 0) → baseDmg=37, ×2 crit=74, ×1.0 random=74, STAB=floor(111)=111
      //   vsDebuffedCrit: def stage -1 kept (not ignored on crit)
      //     effectiveDef = floor(100 * 2/3) = 66
      //     baseDmg = floor(floor(22*80*100/66)/50)+2 = floor(floor(2666)/50)+2 = floor(53.32)+2 = 55
      //     ×2 crit = 110, ×1.0 random = 110, STAB = floor(165) = 165
      expect(vsNeutralCrit.damage).toBe(111);
      expect(vsDebuffedCrit.damage).toBe(165);
    });
  });

  // --- Burn Penalty ---

  describe("burn penalty", () => {
    it("given burned attacker using physical move, when calculating, then damage is halved", () => {
      // Source: pret/pokeemerald — burn halves effective Attack for physical moves
      // Use fighting-type attacker with normal-type move to avoid STAB
      const burnedAttacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.fighting],
        status: S.burn,
      });
      const healthyAttacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.fighting],
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.fighting],
      });
      // Normal type = physical, attacker is fighting → no STAB
      const move = createMove(GEN3_MOVE_IDS.doubleEdge, { type: T.normal, power: 80 });
      const chart = createNeutralTypeChart();

      const burnedResult = calculateGen3Damage(
        createDamageContext({ attacker: burnedAttacker, defender, move, rng: createMockRng(100) }),
        chart,
      );
      const healthyResult = calculateGen3Damage(
        createDamageContext({ attacker: healthyAttacker, defender, move, rng: createMockRng(100) }),
        chart,
      );

      // Burn halves damage AFTER base formula, BEFORE +2:
      // Source: pret/pokeemerald src/pokemon.c:3262-3264 — "damage /= 2" after formula
      // Healthy: base = floor(floor(22*80*100/100)/50) = 35, +2 = 37
      // Burned:  base = floor(floor(22*80*100/100)/50) = 35, burn: floor(35/2) = 17, +2 = 19
      expect(healthyResult.damage).toBe(37);
      expect(burnedResult.damage).toBe(19);
    });

    it("given burned attacker using special move, when calculating, then burn penalty is NOT applied", () => {
      // Source: pret/pokeemerald — burn only affects physical attack; Fire type = special
      const burnedAttacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 120,
        spDefense: 100,
        types: [T.normal],
        status: S.burn,
      });
      const healthyAttacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 120,
        spDefense: 100,
        types: [T.normal],
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.normal],
      });
      // Fire type = special, burn should not affect it
      const move = createMove(GEN3_MOVE_IDS.flamethrower, { type: T.fire, power: 80 });
      const chart = createNeutralTypeChart();

      const burnedResult = calculateGen3Damage(
        createDamageContext({ attacker: burnedAttacker, defender, move, rng: createMockRng(100) }),
        chart,
      );
      const healthyResult = calculateGen3Damage(
        createDamageContext({ attacker: healthyAttacker, defender, move, rng: createMockRng(100) }),
        chart,
      );

      // Burn doesn't affect special moves, so damage should be identical
      expect(burnedResult.damage).toBe(healthyResult.damage);
    });
  });

  // --- Minimum Damage ---

  describe("minimum damage", () => {
    it("given any calculation that would produce damage below 1 (before type immunity), when result is below 1, then minimum is 1", () => {
      // Source: pret/pokeemerald — damage is always at least 1 (unless type immune)
      // Use very low attack vs very high defense to get near-0 damage
      const attacker = createActivePokemon({
        level: 1,
        attack: 1,
        defense: 1,
        spAttack: 1,
        spDefense: 1,
        types: [T.normal],
      });
      const defender = createActivePokemon({
        level: 100,
        attack: 100,
        defense: 999,
        spAttack: 100,
        spDefense: 999,
        types: [T.normal],
      });
      const move = createMove(GEN3_MOVE_IDS.tackle, { type: T.normal, power: 10 });
      const chart = createNeutralTypeChart();
      // Use minimum random roll (85)
      const ctx = createDamageContext({ attacker, defender, move, rng: createMockRng(85) });

      const result = calculateGen3Damage(ctx, chart);
      // Derivation: levelFactor = floor(2*1/5)+2 = 2; baseDmg = floor(floor(2*10*1/999)/50)+2
      //   = floor(floor(0.02)/50)+2 = floor(0/50)+2 = 2
      //   random roll=85: floor(2 * 0.85) = floor(1.7) = 1
      //   STAB (normal/normal): floor(1 * 1.5) = 1; type neutral: 1; max(1,1) = 1
      // Source: pret/pokeemerald — minimum damage is 1 (clamped from Math.max(1, ...))
      expect(result.damage).toBe(1);
    });

    it("given type immune matchup, when calculating, then damage is 0 (not clamped to 1)", () => {
      // Source: pret/pokeemerald — type immunity returns 0 damage
      const attacker = createActivePokemon({
        level: 50,
        attack: 200,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.normal],
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.ghost],
      });
      // Normal vs Ghost = immune
      const move = createMove(GEN3_MOVE_IDS.doubleEdge, { type: T.normal, power: 100 });
      const chart = createTypeChart([[T.normal, T.ghost, 0]]);
      const ctx = createDamageContext({ attacker, defender, move, rng: createMockRng(100) });

      const result = calculateGen3Damage(ctx, chart);
      expect(result.damage).toBe(0);
      expect(result.effectiveness).toBe(0);
    });
  });

  // --- Random Factor ---

  describe("random factor", () => {
    it("given a fixed seed producing random roll 85, when calculating, then damage is 85% of max", () => {
      // Source: pret/pokeemerald — random factor is int(85..100) / 100
      // Use fighting-type attacker with normal-type move to avoid STAB
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.fighting],
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.fighting],
      });
      const move = createMove(GEN3_MOVE_IDS.doubleEdge, { type: T.normal, power: 80 });
      const chart = createNeutralTypeChart();

      const minResult = calculateGen3Damage(
        createDamageContext({ attacker, defender, move, rng: createMockRng(85) }),
        chart,
      );
      const maxResult = calculateGen3Damage(
        createDamageContext({ attacker, defender, move, rng: createMockRng(100) }),
        chart,
      );

      // Base damage = floor(floor(22*80*100/100)/50)+2 = 37
      // Source: manual derivation from pret/pokeemerald formula
      expect(maxResult.damage).toBe(37);
      // With min roll: floor(37 * 85 / 100) = floor(31.45) = 31
      expect(minResult.damage).toBe(31);
      expect(minResult.randomFactor).toBeCloseTo(0.85, 2);
      expect(maxResult.randomFactor).toBeCloseTo(1.0, 2);
    });

    it("given random roll 93, when calculating, then damage reflects 93% of max", () => {
      // Source: pret/pokeemerald — random factor range 85-100 inclusive
      // Use fighting-type attacker with normal-type move to avoid STAB
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.fighting],
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.fighting],
      });
      const move = createMove(GEN3_MOVE_IDS.doubleEdge, { type: T.normal, power: 80 });
      const chart = createNeutralTypeChart();

      const result = calculateGen3Damage(
        createDamageContext({ attacker, defender, move, rng: createMockRng(93) }),
        chart,
      );

      // Base before random = 37 (from derivation above)
      // floor(37 * 93 / 100) = floor(34.41) = 34
      expect(result.damage).toBe(34);
    });
  });

  // --- Weather ---

  describe("weather modifiers", () => {
    it("given Rain weather and Water move, when calculating, then damage is boosted by 1.5x", () => {
      // Source: pret/pokeemerald — rain boosts Water moves by 1.5x
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 120,
        spDefense: 100,
        types: [T.normal],
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.normal],
      });
      const move = createMove(GEN3_MOVE_IDS.surf, { type: T.water, power: 80 });
      const chart = createNeutralTypeChart();

      const rainResult = calculateGen3Damage(
        createDamageContext({
          attacker,
          defender,
          move,
          rng: createMockRng(100),
          weather: { type: W.rain, turnsLeft: 3, source: "rain-dance" },
        }),
        chart,
      );
      const clearResult = calculateGen3Damage(
        createDamageContext({ attacker, defender, move, rng: createMockRng(100) }),
        chart,
      );

      // Derivation (level=50, spAtk=120, spDef=100, power=80, rng=100, no STAB — attacker is normal-type):
      //   levelFactor = 22; base = floor(floor(22*80*120/100)/50) = floor(2112/50) = 42
      //   clearResult:  no weather → 42+2=44, random×1.0=44, no STAB=44, type neutral=44
      //   rainResult:   water in rain → floor(42*1.5)=63, +2=65, random×1.0=65
      // Weather is applied BEFORE +2 per pokeemerald src/pokemon.c:3330-3363 (inside CalculateBaseDamage)
      // Source: pret/pokeemerald src/pokemon.c:3330-3343 — rain boosts Water damage before +2
      expect(clearResult.damage).toBe(44);
      expect(rainResult.damage).toBe(65);
    });

    it("given Rain weather and Fire move, when calculating, then damage is reduced by 0.5x", () => {
      // Source: pret/pokeemerald — rain weakens Fire moves by 0.5x
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 120,
        spDefense: 100,
        types: [T.normal],
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.normal],
      });
      const move = createMove(GEN3_MOVE_IDS.flamethrower, { type: T.fire, power: 80 });
      const chart = createNeutralTypeChart();

      const rainResult = calculateGen3Damage(
        createDamageContext({
          attacker,
          defender,
          move,
          rng: createMockRng(100),
          weather: { type: W.rain, turnsLeft: 3, source: "rain-dance" },
        }),
        chart,
      );
      const clearResult = calculateGen3Damage(
        createDamageContext({ attacker, defender, move, rng: createMockRng(100) }),
        chart,
      );

      // Derivation (level=50, spAtk=120, spDef=100, power=80, rng=100, no STAB):
      //   levelFactor = 22; base = floor(floor(22*80*120/100)/50) = floor(2112/50) = 42
      //   clearResult:  no weather → 42+2=44
      //   rainResult:   fire in rain → floor(42*0.5)=21, +2=23
      // Weather is applied BEFORE +2 per pokeemerald src/pokemon.c:3330-3363 (inside CalculateBaseDamage)
      // Source: pret/pokeemerald src/pokemon.c:3338-3340 — rain weakens Fire damage before +2
      expect(clearResult.damage).toBe(44);
      expect(rainResult.damage).toBe(23);
    });

    it("given Sun weather and Fire move, when calculating, then damage is boosted by 1.5x", () => {
      // Source: pret/pokeemerald — sun boosts Fire moves by 1.5x
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 120,
        spDefense: 100,
        types: [T.normal],
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.normal],
      });
      const move = createMove(GEN3_MOVE_IDS.flamethrower, { type: T.fire, power: 80 });
      const chart = createNeutralTypeChart();

      const sunResult = calculateGen3Damage(
        createDamageContext({
          attacker,
          defender,
          move,
          rng: createMockRng(100),
          weather: { type: W.sun, turnsLeft: 3, source: "sunny-day" },
        }),
        chart,
      );
      const clearResult = calculateGen3Damage(
        createDamageContext({ attacker, defender, move, rng: createMockRng(100) }),
        chart,
      );

      // Derivation (level=50, spAtk=120, spDef=100, power=80, rng=100, no STAB — attacker is normal-type):
      //   levelFactor = 22; base = floor(floor(22*80*120/100)/50) = floor(2112/50) = 42
      //   clearResult:  no weather → 42+2=44 (same as rain/water clear case)
      //   sunResult:    fire in sun → floor(42*1.5)=63, +2=65
      // Weather is applied BEFORE +2 per pokeemerald src/pokemon.c:3351-3363 (inside CalculateBaseDamage)
      // Source: pret/pokeemerald src/pokemon.c:3352-3358 — sun boosts Fire damage before +2
      expect(clearResult.damage).toBe(44);
      expect(sunResult.damage).toBe(65);
    });
  });

  // --- Special moves (SpAtk/SpDef) ---

  describe("physical vs special stat selection", () => {
    it("given a Fire move (special), when calculating, then SpAtk and SpDef are used", () => {
      // Source: pret/pokeemerald — Fire is a special type; uses SpAtk/SpDef
      // Attacker with high SpAtk but low Atk; if the calc uses SpAtk, damage will be higher
      const attackerHighSpAtk = createActivePokemon({
        level: 50,
        attack: 50,
        defense: 100,
        spAttack: 200,
        spDefense: 100,
        types: [T.normal],
      });
      const attackerHighAtk = createActivePokemon({
        level: 50,
        attack: 200,
        defense: 100,
        spAttack: 50,
        spDefense: 100,
        types: [T.normal],
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.normal],
      });
      const move = createMove(GEN3_MOVE_IDS.flamethrower, { type: T.fire, power: 80 });
      const chart = createNeutralTypeChart();

      const highSpAtkResult = calculateGen3Damage(
        createDamageContext({
          attacker: attackerHighSpAtk,
          defender,
          move,
          rng: createMockRng(100),
        }),
        chart,
      );
      const highAtkResult = calculateGen3Damage(
        createDamageContext({ attacker: attackerHighAtk, defender, move, rng: createMockRng(100) }),
        chart,
      );

      // Derivation (level=50, power=80, rng=100, fire=special, no STAB — attacker is normal-type):
      //   levelFactor = 22; spDef of defender = 100
      //   highSpAtkResult (spAtk=200): baseDmg = floor(floor(22*80*200/100)/50)+2 = floor(3520/50)+2 = 72
      //     random×1.0=72, no STAB=72, type neutral=72
      //   highAtkResult  (spAtk=50):  baseDmg = floor(floor(22*80*50/100)/50)+2 = floor(880/50)+2 = 19
      //     random×1.0=19, no STAB=19, type neutral=19
      // Source: pret/pokeemerald — Fire is special type; uses SpAtk/SpDef
      expect(highAtkResult.damage).toBe(19);
      expect(highSpAtkResult.damage).toBe(72);
    });

    it("given a Normal move (physical), when calculating, then Atk and Def are used", () => {
      // Source: pret/pokeemerald — Normal is a physical type; uses Atk/Def
      const attackerHighAtk = createActivePokemon({
        level: 50,
        attack: 200,
        defense: 100,
        spAttack: 50,
        spDefense: 100,
        types: [T.normal],
      });
      const attackerHighSpAtk = createActivePokemon({
        level: 50,
        attack: 50,
        defense: 100,
        spAttack: 200,
        spDefense: 100,
        types: [T.normal],
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.normal],
      });
      const move = createMove(GEN3_MOVE_IDS.doubleEdge, { type: T.normal, power: 80 });
      const chart = createNeutralTypeChart();

      const highAtkResult = calculateGen3Damage(
        createDamageContext({ attacker: attackerHighAtk, defender, move, rng: createMockRng(100) }),
        chart,
      );
      const highSpAtkResult = calculateGen3Damage(
        createDamageContext({
          attacker: attackerHighSpAtk,
          defender,
          move,
          rng: createMockRng(100),
        }),
        chart,
      );

      // Derivation (level=50, power=80, rng=100, normal=physical, STAB 1.5x — attacker is normal-type):
      //   levelFactor = 22; def of defender = 100
      //   highAtkResult   (atk=200): baseDmg = floor(floor(22*80*200/100)/50)+2 = 72
      //     random×1.0=72, STAB×1.5=floor(108)=108, type neutral=108
      //   highSpAtkResult (atk=50):  baseDmg = floor(floor(22*80*50/100)/50)+2 = 19
      //     random×1.0=19, STAB×1.5=floor(28.5)=28, type neutral=28
      // Source: pret/pokeemerald — Normal is physical type; uses Atk/Def
      expect(highSpAtkResult.damage).toBe(28);
      expect(highAtkResult.damage).toBe(108);
    });
  });

  // --- Stat stage application ---

  describe("stat stages", () => {
    it("given attacker at +2 Atk stage using physical move, when calculating, then attack stat is doubled", () => {
      // Source: pret/pokeemerald — stat stage +2 = 4/2 = 2.0x multiplier
      // Use fighting-type attacker with normal-type move to avoid STAB
      const boostedAttacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.fighting],
        statStages: { attack: 2 },
      });
      const normalAttacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.fighting],
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.fighting],
      });
      const move = createMove(GEN3_MOVE_IDS.doubleEdge, { type: T.normal, power: 80 });
      const chart = createNeutralTypeChart();

      const boostedResult = calculateGen3Damage(
        createDamageContext({ attacker: boostedAttacker, defender, move, rng: createMockRng(100) }),
        chart,
      );
      const normalResult = calculateGen3Damage(
        createDamageContext({ attacker: normalAttacker, defender, move, rng: createMockRng(100) }),
        chart,
      );

      // +2 Atk stage = 2.0x attack multiplier → effective attack = floor(100 * 2.0) = 200
      // Normal: floor(floor(22*80*100/100)/50)+2 = floor(1760/50)+2 = 35+2 = 37
      // Boosted: floor(floor(22*80*200/100)/50)+2 = floor(3520/50)+2 = 70+2 = 72
      // Source: manual derivation from pret/pokeemerald formula
      expect(normalResult.damage).toBe(37);
      expect(boostedResult.damage).toBe(72);
    });

    it("given defender at +1 Def stage vs physical move, when calculating, then defense stat is 1.5x", () => {
      // Source: pret/pokeemerald — stat stage +1 = 3/2 = 1.5x multiplier
      // Use fighting-type attacker with normal-type move to avoid STAB
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.fighting],
      });
      const boostedDefender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.fighting],
        statStages: { defense: 1 },
      });
      const normalDefender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.fighting],
      });
      const move = createMove(GEN3_MOVE_IDS.doubleEdge, { type: T.normal, power: 80 });
      const chart = createNeutralTypeChart();

      const vsBoosted = calculateGen3Damage(
        createDamageContext({ attacker, defender: boostedDefender, move, rng: createMockRng(100) }),
        chart,
      );
      const vsNormal = calculateGen3Damage(
        createDamageContext({ attacker, defender: normalDefender, move, rng: createMockRng(100) }),
        chart,
      );

      // +1 Def = 1.5x defense → effective def = floor(100 * 1.5) = 150
      // Normal: floor(floor(22*80*100/100)/50)+2 = 37
      // Boosted Def: floor(floor(22*80*100/150)/50)+2 = floor(floor(1173.33)/50)+2 = floor(1173/50)+2 = 23+2 = 25
      // Source: manual derivation from pret/pokeemerald formula
      expect(vsNormal.damage).toBe(37);
      expect(vsBoosted.damage).toBe(25);
    });
  });

  // --- DamageResult fields ---

  describe("DamageResult fields", () => {
    it("given a normal calculation, when checking result, then all fields are populated correctly", () => {
      // Use fighting-type attacker with normal-type move to avoid STAB
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.fighting],
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [T.fighting],
      });
      const move = createMove(GEN3_MOVE_IDS.doubleEdge, { type: T.normal, power: 80 });
      const chart = createNeutralTypeChart();
      const ctx = createDamageContext({ attacker, defender, move, rng: createMockRng(95) });

      const result = calculateGen3Damage(ctx, chart);

      // Source: manual derivation — base=37, random=95/100
      // floor(37 * 95/100) = floor(35.15) = 35
      expect(result.damage).toBe(35);
      expect(result.effectiveness).toBe(1);
      expect(result.isCrit).toBe(false);
      expect(result.randomFactor).toBeCloseTo(0.95, 2);
    });
  });

  // --- Breakdown ---

  describe("DamageBreakdown", () => {
    it("given a calculation with all modifiers active, when checking breakdown, then each field is correct", () => {
      // Water-type attacker using Surf (Water, 95 BP) vs Fire defender in Rain with burn
      // Water is special, so burn doesn't apply
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 120,
        spDefense: 100,
        types: [T.water],
        status: S.burn,
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 80,
        types: [T.fire],
      });
      const move = createMove(GEN3_MOVE_IDS.surf, { type: T.water, power: 95 });
      const chart = createTypeChart([[T.water, T.fire, 2]]);
      const ctx = createDamageContext({
        attacker,
        defender,
        move,
        isCrit: true,
        rng: createMockRng(100),
        weather: { type: W.rain, turnsLeft: 3, source: "rain-dance" },
      });

      const result = calculateGen3Damage(ctx, chart);

      expect(result.breakdown).not.toBeNull();
      // Source: rain boosts Water damage by 1.5x in Gen 3.
      const RAIN_WATER_MULTIPLIER = 1.5;
      expect(result.breakdown!.weatherMultiplier).toBe(RAIN_WATER_MULTIPLIER);
      expect(result.breakdown!.critMultiplier).toBe(2);
      // Source: same-type attack bonus is 1.5x.
      const STAB_MULTIPLIER = 1.5;
      expect(result.breakdown!.stabMultiplier).toBe(STAB_MULTIPLIER);
      expect(result.breakdown!.typeMultiplier).toBe(2);
      expect(result.breakdown!.burnMultiplier).toBe(1); // special move, burn doesn't apply
      // Source: the mocked RNG roll is 100, which produces the max random multiplier of 1.0.
      const MAX_RANDOM_MULTIPLIER = 1.0;
      expect(result.breakdown!.randomMultiplier).toBeCloseTo(MAX_RANDOM_MULTIPLIER, 2);
      expect(result.isCrit).toBe(true);
    });
  });
});
