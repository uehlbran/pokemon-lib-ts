/**
 * Gen 9 Wave 9 integration tests.
 *
 * Each test validates cross-mechanic interactions using the real Gen9Ruleset
 * and real Gen 9 functions (no mocks). Uses SeededRandom for determinism.
 *
 * Covers:
 *   1. Tera + STAB damage integration
 *   2. Supreme Overlord power boost
 *   3. Last Respects base power scaling
 *   4. Orichalcum Pulse Attack boost in Sun
 *   5. Hadron Engine SpAtk boost on Electric Terrain
 *   6. Snow Ice-type Defense boost
 *   7. Salt Cure residual damage (Water/Steel type)
 *   8. Salt Cure residual damage (non-Water/Steel type)
 *   9. Stellar Tera one-time boost consumption
 *  10. Determinism (same seed = same results)
 *
 * Source: Showdown sim/battle-actions.ts, data/abilities.ts, data/moves.ts,
 *         data/conditions.ts
 */

import type { ActivePokemon, BattleSide, BattleState, DamageContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType, VolatileStatus } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  getHadronEngineSpAModifier,
  getOrichalcumPulseAtkModifier,
  getSupremeOverlordModifier,
  SUPREME_OVERLORD_TABLE,
} from "../../src/Gen9AbilitiesDamage";
import { calculateGen9Damage, pokeRound } from "../../src/Gen9DamageCalc";
import {
  calculateSaltCureDamage,
  getLastRespectsPower,
  getRageFistPower,
} from "../../src/Gen9MoveEffects";
import { Gen9Ruleset } from "../../src/Gen9Ruleset";
import { calculateTeraStab, Gen9Terastallization } from "../../src/Gen9Terastallization";
import { GEN9_TYPE_CHART } from "../../src/Gen9TypeChart";

// ---------------------------------------------------------------------------
// Shared test helper factories
// ---------------------------------------------------------------------------

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
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  isTerastallized?: boolean;
  teraType?: PokemonType | null;
  stellarBoostedTypes?: PokemonType[];
  timesAttacked?: number;
  teamSlot?: number;
}): ActivePokemon {
  const hp = overrides.hp ?? 200;
  const attack = overrides.attack ?? 100;
  const defense = overrides.defense ?? 100;
  const spAttack = overrides.spAttack ?? 100;
  const spDefense = overrides.spDefense ?? 100;
  const speed = overrides.speed ?? 100;
  return {
    pokemon: {
      uid: `test-${overrides.speciesId ?? 1}`,
      speciesId: overrides.speciesId ?? 1,
      nickname: null,
      level: overrides.level ?? 50,
      experience: 0,
      nature: "hardy",
      ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: overrides.currentHp ?? hp,
      moves: [],
      ability: overrides.ability ?? "none",
      abilitySlot: "normal1" as const,
      heldItem: overrides.heldItem ?? null,
      status: (overrides.status ?? null) as any,
      friendship: 0,
      gender: "male" as any,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: "pokeball",
      calculatedStats: { hp, attack, defense, spAttack, spDefense, speed },
      teraType: overrides.teraType ?? null,
      timesAttacked: overrides.timesAttacked ?? 0,
    },
    teamSlot: overrides.teamSlot ?? 0,
    statStages: {
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
    volatileStatuses: overrides.volatiles ?? new Map(),
    types: overrides.types ?? ["normal"],
    ability: overrides.ability ?? "none",
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
    isTerastallized: overrides.isTerastallized ?? false,
    teraType: overrides.teraType ?? null,
    stellarBoostedTypes: overrides.stellarBoostedTypes ?? [],
    suppressedAbility: null,
    forcedMove: null,
  } as ActivePokemon;
}

function makeMove(overrides: {
  id?: string;
  type?: PokemonType;
  category?: "physical" | "special" | "status";
  power?: number | null;
  flags?: Partial<MoveData["flags"]>;
  effect?: MoveData["effect"];
  critRatio?: number;
}): MoveData {
  return {
    id: overrides.id ?? "tackle",
    displayName: overrides.id ?? "Tackle",
    type: overrides.type ?? "normal",
    category: overrides.category ?? "physical",
    power: overrides.power ?? 50,
    accuracy: 100,
    pp: 35,
    priority: 0,
    target: "adjacent-foe",
    flags: {
      contact: true,
      sound: false,
      bullet: false,
      pulse: false,
      punch: false,
      bite: false,
      wind: false,
      slicing: false,
      powder: false,
      protect: true,
      mirror: true,
      snatch: false,
      gravity: false,
      defrost: false,
      recharge: false,
      charge: false,
      bypassSubstitute: false,
      ...overrides.flags,
    },
    effect: overrides.effect ?? null,
    description: "",
    generation: 9,
    critRatio: overrides.critRatio ?? 0,
    hasCrashDamage: false,
  } as MoveData;
}

function makeSide(overrides?: Partial<BattleSide> & { index?: 0 | 1 }): BattleSide {
  return {
    index: overrides?.index ?? 0,
    trainer: null,
    team: overrides?.team ?? [],
    active: overrides?.active ?? [],
    hazards: [],
    screens: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: overrides?.faintCount ?? 0,
    gimmickUsed: overrides?.gimmickUsed ?? false,
    ...overrides,
  } as unknown as BattleSide;
}

function makeState(overrides?: {
  weather?: { type: string; turnsLeft: number; source?: string } | null;
  terrain?: { type: string; turnsLeft: number; source?: string } | null;
  sides?: BattleSide[];
}): BattleState {
  return {
    weather: overrides?.weather ?? null,
    terrain: overrides?.terrain ?? null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    format: "singles",
    generation: 9,
    turnNumber: 1,
    sides: overrides?.sides ?? [makeSide({ index: 0 }), makeSide({ index: 1 })],
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
    move: overrides.move ?? makeMove({}),
    state: overrides.state ?? makeState(),
    rng: new SeededRandom(overrides.seed ?? 42),
    isCrit: overrides.isCrit ?? false,
  };
}

const typeChart = GEN9_TYPE_CHART as Record<string, Record<string, number>>;

// ===========================================================================
// Integration Tests
// ===========================================================================

describe("Gen 9 integration tests", () => {
  // -------------------------------------------------------------------------
  // 1. Tera STAB integration
  // -------------------------------------------------------------------------

  describe("Terastallization + STAB integration", () => {
    it("given a Fire-type Pokemon Terastallized into Fire, when using a Fire move, then STAB is 2.0x (Tera + original match)", () => {
      // Source: Showdown sim/battle-actions.ts:1788-1791
      // When Tera type matches original type AND move type: 2.0x STAB
      // Formula derivation:
      //   calculateTeraStab returns 2.0 when pokemon.isTerastallized && teraType === moveType && originalTypes.includes(moveType)
      const pokemon = makeActive({
        types: ["fire"],
        isTerastallized: true,
        teraType: "fire",
      });

      const stab = calculateTeraStab(pokemon, "fire", ["fire"], false);
      expect(stab).toBe(2.0);
    });

    it("given a Normal-type Pokemon Terastallized into Fire, when using a Fire move, then STAB is 1.5x (Tera only)", () => {
      // Source: Showdown sim/battle-actions.ts:1756-1793
      // When Tera type matches move type but NOT original type: 1.5x STAB
      const pokemon = makeActive({
        types: ["fire"], // types changed to Tera type after activation
        isTerastallized: true,
        teraType: "fire",
      });

      // Original types were Normal (not Fire)
      const stab = calculateTeraStab(pokemon, "fire", ["normal"], false);
      expect(stab).toBe(1.5);
    });

    it("given Tera Fire Pokemon, when damage calc runs with Fire move, then damage includes 2.0x STAB", () => {
      // Source: Showdown sim/battle-actions.ts -- Tera STAB integration in damage calc
      // This is an end-to-end test of Tera STAB flowing through calculateGen9Damage.
      //
      // Scenario: L50, 100 Atk, 100 Def, 80 BP Fire move, Fire Tera (matching original)
      // Base damage: floor(floor((2*50/5+2) * 80 * 100/100)/50) + 2 = floor(floor(22*80*1)/50)+2
      //   = floor(1760/50)+2 = floor(35.2)+2 = 35+2 = 37
      // No weather, no crit. Random roll is seeded.
      // STAB = 2.0x (Tera + original match)
      // Effectiveness = 1.0x (neutral)
      //
      // Non-Tera STAB = 1.5x for comparison
      const attackerTera = makeActive({
        types: ["fire"],
        isTerastallized: true,
        teraType: "fire",
      });
      const attackerNonTera = makeActive({
        types: ["fire"],
        isTerastallized: false,
      });
      const defender = makeActive({ types: ["normal"] });
      const move = makeMove({ id: "flamethrower", type: "fire", category: "special", power: 80 });

      const resultTera = calculateGen9Damage(
        makeDamageContext({
          attacker: attackerTera,
          defender,
          move,
          seed: 100,
        }),
        typeChart,
      );
      const resultNonTera = calculateGen9Damage(
        makeDamageContext({
          attacker: attackerNonTera,
          defender,
          move,
          seed: 100,
        }),
        typeChart,
      );

      // Tera STAB (2.0x) should produce more damage than non-Tera STAB (1.5x)
      // The ratio should be approximately 2.0/1.5 = 1.333x
      // Due to integer rounding in pokeRound, the ratio may not be exact
      expect(resultTera.damage).toBeGreaterThan(resultNonTera.damage);

      // Verify the ratio is in the expected range (accounting for integer rounding)
      // 2.0/1.5 = 1.333..., allow some rounding variance
      const ratio = resultTera.damage / resultNonTera.damage;
      expect(ratio).toBeGreaterThan(1.25);
      expect(ratio).toBeLessThan(1.45);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Supreme Overlord power boost
  // -------------------------------------------------------------------------

  describe("Supreme Overlord integration", () => {
    it("given a Pokemon with Supreme Overlord and 3 fainted allies, when calculating modifier, then returns 5325/4096", () => {
      // Source: Showdown data/abilities.ts:4634-4658
      //   const powMod = [4096, 4506, 4915, 5325, 5734, 6144];
      //   faintCount 3 → powMod[3] = 5325
      const modifier = getSupremeOverlordModifier("supreme-overlord", 3);
      expect(modifier).toBe(5325);
      expect(SUPREME_OVERLORD_TABLE[3]).toBe(5325);
    });

    it("given Supreme Overlord with 3 fainted allies, when damage calc runs, then power is boosted by 5325/4096", () => {
      // Source: Showdown data/abilities.ts:4634-4658 -- supremeoverlord onBasePower
      // pokeRound(basePower, 5325) for 3 fainted allies
      //
      // We verify the power boost flows through the damage calc by comparing
      // damage with 0 fainted vs 3 fainted allies.
      const attacker = makeActive({
        ability: "supreme-overlord",
        types: ["normal"],
      });
      const defender = makeActive({ types: ["normal"] });
      const move = makeMove({ id: "body-slam", type: "normal", power: 85 });

      // 0 fainted: no boost
      const side0 = makeSide({
        index: 0,
        active: [attacker],
        team: [attacker.pokemon],
        faintCount: 0,
      });
      const state0 = makeState({ sides: [side0, makeSide({ index: 1 })] });

      const result0 = calculateGen9Damage(
        makeDamageContext({ attacker, defender, move, state: state0, seed: 42 }),
        typeChart,
      );

      // 3 fainted: 5325/4096 boost (~1.30x)
      const side3 = makeSide({
        index: 0,
        active: [attacker],
        team: [attacker.pokemon],
        faintCount: 3,
      });
      const state3 = makeState({ sides: [side3, makeSide({ index: 1 })] });

      const result3 = calculateGen9Damage(
        makeDamageContext({ attacker, defender, move, state: state3, seed: 42 }),
        typeChart,
      );

      // With 3 fainted allies, damage should be higher
      expect(result3.damage).toBeGreaterThan(result0.damage);

      // Verify the power boost numerically
      // pokeRound(85, 5325) = floor((85 * 5325 + 2047) / 4096) = floor((452625 + 2047) / 4096)
      //   = floor(454672 / 4096) = floor(110.9...) = 111 (rounds up due to +2047 bias)
      // vs original power = 85
      // Ratio = 111/85 ≈ 1.306, close to 5325/4096 ≈ 1.2998
      const boostedPower = pokeRound(85, 5325);
      expect(boostedPower).toBe(111);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Last Respects base power scaling
  // -------------------------------------------------------------------------

  describe("Last Respects integration", () => {
    it("given 3 fainted allies, when using Last Respects, then base power is 200", () => {
      // Source: Showdown data/moves.ts:10473-10474
      //   basePowerCallback(pokemon, target, move) { return 50 + 50 * pokemon.side.totalFainted; }
      // 3 fainted: 50 + 50*3 = 200
      expect(getLastRespectsPower(3)).toBe(200);
    });

    it("given 0 fainted allies, when using Last Respects, then base power is 50", () => {
      // Source: Showdown data/moves.ts:10473-10474
      // 0 fainted: 50 + 50*0 = 50
      expect(getLastRespectsPower(0)).toBe(50);
    });

    it("given 3 fainted allies, when damage calc runs Last Respects, then uses boosted power", () => {
      // Source: Showdown data/moves.ts:10473-10474
      // Last Respects base power scales via the damage calc (not move effect handler)
      const attacker = makeActive({ types: ["ghost"] });
      const _defender = makeActive({ types: ["normal"] });
      const move = makeMove({
        id: "last-respects",
        type: "ghost",
        category: "physical",
        power: 50,
      });

      // With 3 fainted allies
      const side3 = makeSide({
        index: 0,
        active: [attacker],
        team: [attacker.pokemon],
        faintCount: 3,
      });
      const state3 = makeState({ sides: [side3, makeSide({ index: 1 })] });

      // Ghost vs Normal = immune in the type chart
      // Use a non-immune defender type instead
      const normalDefender = makeActive({ types: ["fighting"] });

      const result = calculateGen9Damage(
        makeDamageContext({
          attacker,
          defender: normalDefender,
          move,
          state: state3,
          seed: 42,
        }),
        typeChart,
      );

      // Ghost is neutral vs Fighting
      // Level 50, Atk=100, Def=100, BP=200, Ghost STAB=1.5x, Ghost vs Fighting=1x, seed=42 (roll=94)
      // baseDamage = floor(floor(22*200*100/100)/50)+2 = 90
      // after random: floor(90*94/100) = 84
      // after STAB 1.5x: pokeRound(84, 6144) = 126
      // Source: formula derivation from Showdown sim/battle-actions.ts
      expect(result.damage).toBe(126);

      // Compare against 0 fainted to verify the power scaling actually happened
      const side0 = makeSide({
        index: 0,
        active: [attacker],
        team: [attacker.pokemon],
        faintCount: 0,
      });
      const state0 = makeState({ sides: [side0, makeSide({ index: 1 })] });
      const result0 = calculateGen9Damage(
        makeDamageContext({
          attacker,
          defender: normalDefender,
          move,
          state: state0,
          seed: 42,
        }),
        typeChart,
      );
      // 3 fainted = 200 BP vs 0 fainted = 50 BP: damage should be ~4x higher
      expect(result.damage).toBeGreaterThan(result0.damage * 3);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Orichalcum Pulse Attack boost
  // -------------------------------------------------------------------------

  describe("Orichalcum Pulse integration", () => {
    it("given Sun weather and Orichalcum Pulse ability, when checking modifier, then returns 5461/4096", () => {
      // Source: Showdown data/abilities.ts:3016-3035 -- orichalcumpulse onModifyAtk
      //   if (['sunnyday', 'desolateland'].includes(pokemon.effectiveWeather()))
      //     return this.chainModify([5461, 4096]);
      const modifier = getOrichalcumPulseAtkModifier("orichalcum-pulse", "sun");
      expect(modifier).toBe(5461);
    });

    it("given no Sun weather and Orichalcum Pulse ability, when checking modifier, then returns 4096 (neutral)", () => {
      // Source: Showdown data/abilities.ts:3016-3035 -- only activates in sun/desolateland
      const modifier = getOrichalcumPulseAtkModifier("orichalcum-pulse", "rain");
      expect(modifier).toBe(4096);
    });

    it("given harsh-sun (Desolate Land) and Orichalcum Pulse, when checking modifier, then returns 5461", () => {
      // Source: Showdown data/abilities.ts:3016-3035 -- desolateland triggers too
      const modifier = getOrichalcumPulseAtkModifier("orichalcum-pulse", "harsh-sun");
      expect(modifier).toBe(5461);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Hadron Engine SpAtk boost
  // -------------------------------------------------------------------------

  describe("Hadron Engine integration", () => {
    it("given Electric Terrain and Hadron Engine ability, when checking modifier, then returns 5461/4096", () => {
      // Source: Showdown data/abilities.ts:1725-1742 -- hadronengine onModifySpA
      //   if (this.field.isTerrain('electricterrain'))
      //     return this.chainModify([5461, 4096]);
      const modifier = getHadronEngineSpAModifier("hadron-engine", "electric");
      expect(modifier).toBe(5461);
    });

    it("given no Electric Terrain and Hadron Engine, when checking modifier, then returns 4096 (neutral)", () => {
      // Source: Showdown data/abilities.ts:1725-1742 -- only activates on Electric Terrain
      const modifier = getHadronEngineSpAModifier("hadron-engine", "grassy");
      expect(modifier).toBe(4096);
    });

    it("given Electric Terrain and non-Hadron Engine ability, when checking modifier, then returns 4096 (neutral)", () => {
      // Source: Showdown data/abilities.ts -- only hadron-engine gets this boost
      const modifier = getHadronEngineSpAModifier("levitate", "electric");
      expect(modifier).toBe(4096);
    });
  });

  // -------------------------------------------------------------------------
  // 6. Snow Ice-type Defense boost
  // -------------------------------------------------------------------------

  describe("Snow Ice-type Defense boost integration", () => {
    it("given Snow weather and an Ice-type defender, when a physical move is used, then Defense is boosted by 1.5x in damage calc", () => {
      // Source: Showdown data/conditions.ts:709 -- snow.onModifyDef: this.modify(def, 1.5)
      // Source: Bulbapedia -- "In Snow, Ice-type Pokemon have their Defense boosted by 50%"
      //
      // Test setup:
      //   Attacker: L50, 100 Atk, using 80 BP physical move
      //   Defender: L50, Ice type, 100 Def base (becomes 150 in snow)
      //
      // With Snow + Ice defender:
      //   Effective defense = floor(100 * 1.5) = 150
      //   Base damage = floor(floor((22) * 80 * 100 / 150) / 50) + 2
      //     = floor(floor(1173.33) / 50) + 2 = floor(1173/50) + 2 = 23 + 2 = 25
      //
      // Without Snow:
      //   Effective defense = 100
      //   Base damage = floor(floor(22 * 80 * 100 / 100) / 50) + 2
      //     = floor(1760/50) + 2 = 35 + 2 = 37

      const attacker = makeActive({ types: ["fighting"], attack: 100 });
      const iceDefender = makeActive({ types: ["ice"], defense: 100 });

      const move = makeMove({
        id: "close-combat",
        type: "fighting",
        category: "physical",
        power: 80,
      });

      const snowState = makeState({
        weather: { type: "snow", turnsLeft: 5 },
      });
      const noWeatherState = makeState();

      const resultSnow = calculateGen9Damage(
        makeDamageContext({
          attacker,
          defender: iceDefender,
          move,
          state: snowState,
          seed: 100,
        }),
        typeChart,
      );
      const resultNoWeather = calculateGen9Damage(
        makeDamageContext({
          attacker,
          defender: iceDefender,
          move,
          state: noWeatherState,
          seed: 100,
        }),
        typeChart,
      );

      // Snow should reduce damage due to the 1.5x Defense boost
      expect(resultSnow.damage).toBeLessThan(resultNoWeather.damage);

      // The damage ratio should reflect the Defense boost
      // With 1.5x Defense, damage should be approximately 1/1.5 ≈ 0.667x
      // Due to integer rounding, check within a reasonable range
      const ratio = resultSnow.damage / resultNoWeather.damage;
      expect(ratio).toBeGreaterThan(0.6);
      expect(ratio).toBeLessThan(0.75);
    });

    it("given Snow weather and a non-Ice-type defender, when a physical move is used, then Defense is NOT boosted", () => {
      // Source: Showdown data/conditions.ts:709 -- only Ice-type gets the boost
      const attacker = makeActive({ types: ["normal"] });
      const normalDefender = makeActive({ types: ["normal"], defense: 100 });
      const move = makeMove({ id: "tackle", type: "normal", power: 80, category: "physical" });

      const snowState = makeState({
        weather: { type: "snow", turnsLeft: 5 },
      });
      const noWeatherState = makeState();

      const resultSnow = calculateGen9Damage(
        makeDamageContext({ attacker, defender: normalDefender, move, state: snowState, seed: 50 }),
        typeChart,
      );
      const resultNoWeather = calculateGen9Damage(
        makeDamageContext({
          attacker,
          defender: normalDefender,
          move,
          state: noWeatherState,
          seed: 50,
        }),
        typeChart,
      );

      // Non-Ice type: Snow should not affect Defense
      expect(resultSnow.damage).toBe(resultNoWeather.damage);
    });
  });

  // -------------------------------------------------------------------------
  // 7. Salt Cure residual (Water/Steel type)
  // -------------------------------------------------------------------------

  describe("Salt Cure integration", () => {
    it("given Salt Cure volatile on a Water-type Pokemon, when end of turn processes, then damage is floor(maxHP / 4)", () => {
      // Source: Showdown data/moves.ts:16225-16227
      //   onResidual(pokemon) {
      //     this.damage(pokemon.baseMaxhp / (pokemon.hasType(['Water', 'Steel']) ? 4 : 8));
      //   }
      // maxHp = 200, Water type: floor(200/4) = 50
      const damage = calculateSaltCureDamage(200, ["water"]);
      expect(damage).toBe(50);
    });

    it("given Salt Cure volatile on a Steel-type Pokemon, when end of turn processes, then damage is floor(maxHP / 4)", () => {
      // Source: Showdown data/moves.ts:16225-16227 -- Steel type also gets 1/4
      // maxHp = 200, Steel type: floor(200/4) = 50
      const damage = calculateSaltCureDamage(200, ["steel"]);
      expect(damage).toBe(50);
    });

    it("given Salt Cure volatile on a Normal-type Pokemon, when end of turn processes, then damage is floor(maxHP / 8)", () => {
      // Source: Showdown data/moves.ts:16225-16227 -- non-Water/Steel gets 1/8
      // maxHp = 200, Normal type: floor(200/8) = 25
      const damage = calculateSaltCureDamage(200, ["normal"]);
      expect(damage).toBe(25);
    });

    it("given Salt Cure with odd maxHP on Water type, when calculating damage, then floors correctly", () => {
      // Source: Showdown data/moves.ts:16225-16227
      // maxHp = 301, Water type: floor(301/4) = 75
      const damage = calculateSaltCureDamage(301, ["water"]);
      expect(damage).toBe(75);
    });

    it("given Salt Cure via Gen9Ruleset.processSaltCureDamage on Water-type, when processing, then applies damage to HP", () => {
      // Integration test: Salt Cure flowing through Gen9Ruleset.processSaltCureDamage
      // Source: Gen9Ruleset.ts:546-556 -- delegates to calculateSaltCureDamage
      const ruleset = new Gen9Ruleset();
      const active = makeActive({
        types: ["water"],
        hp: 200,
        currentHp: 200,
        volatiles: new Map([["salt-cure" as string, { turnsLeft: -1 }]]) as Map<
          VolatileStatus,
          { turnsLeft: number }
        > as any,
      });

      const damage = ruleset.processSaltCureDamage(active);

      // Source: floor(200/4) = 50 for Water type
      expect(damage).toBe(50);
      // HP should be reduced
      expect(active.pokemon.currentHp).toBe(150);
    });

    it("given Salt Cure via Gen9Ruleset.processSaltCureDamage on Normal-type, when processing, then applies 1/8 damage", () => {
      // Source: Showdown data/moves.ts:16225-16227 -- 1/8 for non-Water/Steel
      const ruleset = new Gen9Ruleset();
      const active = makeActive({
        types: ["normal"],
        hp: 200,
        currentHp: 200,
        volatiles: new Map([["salt-cure" as string, { turnsLeft: -1 }]]) as Map<
          VolatileStatus,
          { turnsLeft: number }
        > as any,
      });

      const damage = ruleset.processSaltCureDamage(active);

      // Source: floor(200/8) = 25 for Normal type
      expect(damage).toBe(25);
      expect(active.pokemon.currentHp).toBe(175);
    });
  });

  // -------------------------------------------------------------------------
  // 9. Stellar Tera one-time boost
  // -------------------------------------------------------------------------

  describe("Stellar Tera integration", () => {
    it("given Stellar Tera and a move matching an original type, when used first time, then 2x boost and stellarBoostedTypes updated", () => {
      // Source: Showdown sim/battle-actions.ts:1770-1785
      // Stellar Tera: first use of a base type gets 2x boost, then marked as consumed
      const pokemon = makeActive({
        types: ["fire", "flying"],
        isTerastallized: true,
        teraType: "stellar" as PokemonType,
        stellarBoostedTypes: [],
      });

      // First use of Fire: should get 2x boost
      const stab1 = calculateTeraStab(pokemon, "fire", ["fire", "flying"], false);
      expect(stab1).toBe(2.0);
      // stellarBoostedTypes should now include "fire"
      expect(pokemon.stellarBoostedTypes).toContain("fire");
    });

    it("given Stellar Tera and a move matching an already-boosted type, when used again, then 1.5x STAB (standard)", () => {
      // Source: Showdown sim/battle-actions.ts:1770-1785
      // After the one-time boost is consumed, it falls back to standard 1.5x STAB
      const pokemon = makeActive({
        types: ["fire", "flying"],
        isTerastallized: true,
        teraType: "stellar" as PokemonType,
        stellarBoostedTypes: ["fire"], // Already boosted
      });

      const stab = calculateTeraStab(pokemon, "fire", ["fire", "flying"], false);
      expect(stab).toBe(1.5);
    });

    it("given Stellar Tera and a non-base-type move, when used, then returns 4915/4096 (~1.2x)", () => {
      // Source: Showdown sim/battle-actions.ts:1781-1784
      // Non-base type: 1.2x boost (4915/4096)
      const pokemon = makeActive({
        types: ["fire", "flying"],
        isTerastallized: true,
        teraType: "stellar" as PokemonType,
        stellarBoostedTypes: [],
      });

      // Ground is not a base type for Fire/Flying
      const stab = calculateTeraStab(pokemon, "ground", ["fire", "flying"], false);
      expect(stab).toBeCloseTo(4915 / 4096, 6);
    });

    it("given Stellar Tera, when boosting Fire then Flying sequentially, then each gets independent 2x boost", () => {
      // Source: Showdown sim/battle-actions.ts:1770-1785
      // Each base type gets its own independent one-time 2x boost
      const pokemon = makeActive({
        types: ["fire", "flying"],
        isTerastallized: true,
        teraType: "stellar" as PokemonType,
        stellarBoostedTypes: [],
      });

      // Fire: first use -> 2x
      const stabFire = calculateTeraStab(pokemon, "fire", ["fire", "flying"], false);
      expect(stabFire).toBe(2.0);
      expect(pokemon.stellarBoostedTypes).toEqual(["fire"]);

      // Flying: first use -> 2x (independent)
      const stabFlying = calculateTeraStab(pokemon, "flying", ["fire", "flying"], false);
      expect(stabFlying).toBe(2.0);
      expect(pokemon.stellarBoostedTypes).toEqual(["fire", "flying"]);

      // Fire again: already consumed -> 1.5x
      const stabFireAgain = calculateTeraStab(pokemon, "fire", ["fire", "flying"], false);
      expect(stabFireAgain).toBe(1.5);
    });
  });

  // -------------------------------------------------------------------------
  // 10. Determinism (same seed = same results)
  // -------------------------------------------------------------------------

  describe("Determinism", () => {
    it("given same seed and same inputs, when damage calc runs twice, then results are identical", () => {
      // Source: @pokemon-lib-ts/core SeededRandom (Mulberry32) -- deterministic PRNG
      // Same seed + same inputs = same damage output
      const attacker = makeActive({ types: ["fire"], attack: 130 });
      const defender = makeActive({ types: ["grass"], defense: 90 });
      const move = makeMove({
        id: "fire-punch",
        type: "fire",
        category: "physical",
        power: 75,
      });
      const state = makeState();

      const result1 = calculateGen9Damage(
        makeDamageContext({ attacker, defender, move, state, seed: 12345 }),
        typeChart,
      );
      const result2 = calculateGen9Damage(
        makeDamageContext({ attacker, defender, move, state, seed: 12345 }),
        typeChart,
      );

      expect(result1.damage).toBe(result2.damage);
      expect(result1.effectiveness).toBe(result2.effectiveness);
      expect(result1.breakdown).toEqual(result2.breakdown);
    });

    it("given different seeds, when damage calc runs, then results may differ (randomRoll varies)", () => {
      // Source: Showdown sim/battle-actions.ts -- random factor [85..100]
      // Different seeds produce different random rolls
      const attacker = makeActive({ types: ["water"], spAttack: 120 });
      const defender = makeActive({ types: ["fire"], spDefense: 80 });
      const move = makeMove({
        id: "surf",
        type: "water",
        category: "special",
        power: 90,
      });
      const state = makeState();

      // Collect damage values from 20 different seeds
      const damages = new Set<number>();
      for (let seed = 1; seed <= 20; seed++) {
        const result = calculateGen9Damage(
          makeDamageContext({ attacker, defender, move, state, seed }),
          typeChart,
        );
        damages.add(result.damage);
      }

      // With different seeds, we should get multiple damage values
      // (the random roll ranges from 85-100, so there are up to 16 different possible results)
      expect(damages.size).toBeGreaterThan(1);
    });
  });

  // -------------------------------------------------------------------------
  // Additional cross-mechanic tests
  // -------------------------------------------------------------------------

  describe("Cross-mechanic interactions", () => {
    it("given a Gen9Ruleset instance, when checking all key properties, then they match Gen 9 specs", () => {
      // Source: Multiple -- smoke test verifying Gen9Ruleset consistency
      const ruleset = new Gen9Ruleset();
      expect(ruleset.generation).toBe(9);
      expect(ruleset.getCritMultiplier()).toBe(1.5);
      expect(ruleset.getCritRateTable()).toEqual([24, 8, 2, 1]);
      expect(ruleset.hasTerrain()).toBe(true);
      expect(ruleset.shouldExecutePursuitPreSwitch()).toBe(false);
      expect(ruleset.recalculatesFutureAttackDamage()).toBe(true);
      expect(ruleset.getAvailableHazards()).toEqual([
        "stealth-rock",
        "spikes",
        "toxic-spikes",
        "sticky-web",
      ]);
    });

    it("given Tera + Supreme Overlord together, when damage calc runs, then both modifiers stack", () => {
      // Integration test: Tera STAB (2.0x) + Supreme Overlord (5325/4096 at 3 fainted)
      // These modifiers are applied at different stages of the damage calc:
      //   - Supreme Overlord modifies base power
      //   - Tera STAB is applied as the STAB multiplier
      // Source: Showdown sim/battle-actions.ts -- modifier stacking
      const attacker = makeActive({
        types: ["fire"],
        ability: "supreme-overlord",
        isTerastallized: true,
        teraType: "fire",
        attack: 120,
      });
      const defender = makeActive({ types: ["grass"], defense: 100 });
      const move = makeMove({
        id: "flare-blitz",
        type: "fire",
        category: "physical",
        power: 120,
      });

      const side = makeSide({
        index: 0,
        active: [attacker],
        team: [attacker.pokemon],
        faintCount: 3,
      });
      const state = makeState({ sides: [side, makeSide({ index: 1 })] });

      const result = calculateGen9Damage(
        makeDamageContext({ attacker, defender, move, state, seed: 42 }),
        typeChart,
      );

      // Level 50, Atk=120, Def=100, seed=42 (roll=94)
      // Supreme Overlord (3 fainted): pokeRound(120, 5325) = 156 (effective BP)
      // baseDamage = floor(floor(22*156*120/100)/50)+2 = floor(floor(4118.4)/50)+2 = 84
      // after random: floor(84*94/100) = 78
      // after Tera STAB 2.0x: pokeRound(78, 8192) = 156
      // after Fire vs Grass 2x SE: 156*2 = 312
      // Source: formula derivation from Showdown sim/battle-actions.ts
      expect(result.damage).toBe(312);
      expect(result.effectiveness).toBe(2);
    });

    it("given Rage Fist with 6 hits taken (capped at 350 BP), when calculating base power, then returns 350", () => {
      // Source: Showdown data/moves.ts:15126-15128
      //   basePowerCallback(pokemon) { return Math.min(350, 50 + 50 * pokemon.timesAttacked); }
      // 6 hits: min(350, 50 + 50*6) = min(350, 350) = 350
      expect(getRageFistPower(6)).toBe(350);
    });

    it("given Rage Fist with 7 hits taken (exceeds cap), when calculating base power, then still returns 350", () => {
      // Source: Showdown data/moves.ts:15126-15128 -- Math.min(350, ...)
      // 7 hits: min(350, 50 + 50*7) = min(350, 400) = 350
      expect(getRageFistPower(7)).toBe(350);
    });

    it("given Gen9Terastallization.canUse, when side.gimmickUsed is true, then returns false", () => {
      // Source: Showdown sim/battle.ts -- one Tera per team per battle
      const tera = new Gen9Terastallization();
      const pokemon = makeActive({
        isTerastallized: false,
        teraType: "fire",
      });
      const side = makeSide({ gimmickUsed: true });
      const state = makeState();

      expect(tera.canUse(pokemon, side, state)).toBe(false);
    });

    it("given Gen9Terastallization.activate, when activated, then types change and gimmickUsed is set", () => {
      // Source: Bulbapedia "Terastallization" -- type change, one per trainer
      const tera = new Gen9Terastallization();
      const pokemon = makeActive({
        types: ["fire", "flying"],
        isTerastallized: false,
        teraType: "water",
      });
      pokemon.pokemon.teraType = "water";
      const side = makeSide({ gimmickUsed: false });
      const state = makeState();

      const events = tera.activate(pokemon, side, state);

      expect(pokemon.isTerastallized).toBe(true);
      expect(pokemon.teraType).toBe("water");
      expect(pokemon.types).toEqual(["water"]);
      expect(side.gimmickUsed).toBe(true);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: "terastallize",
        teraType: "water",
      });
    });

    it("given Snow weather, when checking weather effects via Gen9Ruleset, then no chip damage for any type", () => {
      // Source: Showdown data/conditions.ts:696-728 -- Snow has no onResidual damage
      // Source: Bulbapedia -- Snow replaced Hail; no chip damage
      const ruleset = new Gen9Ruleset();
      const iceActive = makeActive({ types: ["ice"], hp: 200, currentHp: 200 });
      const fireActive = makeActive({ types: ["fire"], hp: 200, currentHp: 200 });

      const side0 = makeSide({ index: 0, active: [iceActive] });
      const side1 = makeSide({ index: 1, active: [fireActive] });
      const state = makeState({
        weather: { type: "snow", turnsLeft: 5 },
        sides: [side0, side1],
      });

      const effects = ruleset.applyWeatherEffects(state);

      // Snow should produce ZERO weather effect results (no chip damage)
      expect(effects).toHaveLength(0);
    });
  });
});
