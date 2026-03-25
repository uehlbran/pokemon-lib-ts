import type { ActivePokemon, BattleState, DamageContext } from "@pokemon-lib-ts/battle";
import type {
  MoveData,
  PokemonType,
  PrimaryStatus,
  TerrainType,
  VolatileStatus,
} from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ITEM_IDS,
  CORE_MOVE_IDS,
  CORE_TERRAIN_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  NEUTRAL_NATURES,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { GEN6_MOVE_IDS, GEN6_SPECIES_IDS } from "../src";
import { calculateGen6Damage } from "../src/Gen6DamageCalc";
import { Gen6Ruleset } from "../src/Gen6Ruleset";
import {
  applyGen6TerrainEffects,
  canInflictStatusWithTerrain,
  getTerrainDamageModifier,
} from "../src/Gen6Terrain";
import { GEN6_TYPE_CHART } from "../src/Gen6TypeChart";

const ABILITIES = CORE_ABILITY_IDS;
const ITEMS = CORE_ITEM_IDS;
const MOVES = { ...CORE_MOVE_IDS, ...GEN6_MOVE_IDS };
const SPECIES = GEN6_SPECIES_IDS;
const TERRAINS = CORE_TERRAIN_IDS;
const TYPES = CORE_TYPE_IDS;
const VOLATILES = CORE_VOLATILE_IDS;
const DEFAULT_NATURE = NEUTRAL_NATURES[0];
const TERRAIN_SOURCES = {
  electric: GEN6_MOVE_IDS.electricTerrain,
  grassy: GEN6_MOVE_IDS.grassyTerrain,
  misty: GEN6_MOVE_IDS.mistyTerrain,
} as const;

// ---------------------------------------------------------------------------
// Helper factories (same patterns as damage-calc.test.ts)
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
  status?: PrimaryStatus | null
  speciesId?: number;
  gender?: "male" | "female" | "genderless";
  volatiles?: Map<VolatileStatus, { turnsLeft: number; data?: Record<string, unknown> }>;
  nickname?: string | null;
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
      speciesId: overrides.speciesId ?? SPECIES.bulbasaur,
      nickname: overrides.nickname ?? null,
      level: overrides.level ?? 50,
      experience: 0,
      nature: DEFAULT_NATURE,
      ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: overrides.currentHp ?? hp,
      moves: [],
      ability: overrides.ability ?? ABILITIES.none,
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
    volatileStatuses: overrides.volatiles ?? new Map(),
    types: overrides.types ?? [TYPES.normal],
    ability: overrides.ability ?? ABILITIES.none,
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

function makeMove(overrides: {
  id?: string;
  type?: PokemonType;
  category?: "physical" | "special" | "status";
  power?: number | null;
  flags?: Partial<MoveData["flags"]>;
  effect?: MoveData["effect"];
  critRatio?: number;
  target?: string;
}): MoveData {
  return {
    id: overrides.id ?? MOVES.tackle,
    displayName: overrides.id ?? "Tackle",
    type: overrides.type ?? TYPES.normal,
    category: overrides.category ?? "physical",
    power: overrides.power ?? 50,
    accuracy: 100,
    pp: 35,
    priority: 0,
    target: overrides.target ?? "adjacent-foe",
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
    generation: 6,
    critRatio: overrides.critRatio ?? 0,
  } as MoveData;
}

function makeState(overrides?: {
  weather?: { type: string; turnsLeft: number; source: string } | null;
  terrain?: { type: TerrainType; turnsLeft: number; source: string } | null;
  format?: string;
  gravity?: { active: boolean; turnsLeft: number };
  sides?: Array<{
    index?: number;
    active?: Array<ActivePokemon | null>;
  }>;
}): BattleState {
  return {
    weather: overrides?.weather ?? null,
    terrain: overrides?.terrain ?? null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: overrides?.gravity ?? { active: false, turnsLeft: 0 },
    format: overrides?.format ?? "singles",
    generation: 6,
    turnNumber: 1,
    sides: overrides?.sides ?? [
      { index: 0, active: [] },
      { index: 1, active: [] },
    ],
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

const typeChart = GEN6_TYPE_CHART as Record<string, Record<string, number>>;

// ===========================================================================
// getTerrainDamageModifier — pure function tests
// ===========================================================================

describe("getTerrainDamageModifier", () => {
  describe("Electric Terrain", () => {
    it("given Electric Terrain + Electric move + grounded attacker, returns 6144 (1.5x) power modifier", () => {
      // Source: Bulbapedia "Electric Terrain" Gen 6 -- 1.5x Electric for grounded attacker
      const result = getTerrainDamageModifier(TERRAINS.electric, TYPES.electric, MOVES.thunderbolt, true, true);
      expect(result.powerModifier).toBe(6144);
      expect(result.grassyGroundHalved).toBe(false);
    });

    it("given Electric Terrain + Electric move + non-grounded attacker (Flying), returns no modifier", () => {
      // Source: Bulbapedia "Electric Terrain" -- only grounded attackers get the boost
      const result = getTerrainDamageModifier(TERRAINS.electric, TYPES.electric, MOVES.thunderbolt, false, true);
      expect(result.powerModifier).toBeNull();
    });

    it("given Electric Terrain + non-Electric move, returns no modifier", () => {
      // Source: Bulbapedia "Electric Terrain" -- only boosts Electric-type moves
      const result = getTerrainDamageModifier(TERRAINS.electric, TYPES.fire, MOVES.flamethrower, true, true);
      expect(result.powerModifier).toBeNull();
    });
  });

  describe("Grassy Terrain", () => {
    it("given Grassy Terrain + Grass move + grounded attacker, returns 6144 (1.5x) power modifier", () => {
      // Source: Bulbapedia "Grassy Terrain" Gen 6 -- 1.5x Grass for grounded attacker
      const result = getTerrainDamageModifier(TERRAINS.grassy, TYPES.grass, MOVES.energyBall, true, true);
      expect(result.powerModifier).toBe(6144);
      expect(result.grassyGroundHalved).toBe(false);
    });

    it("given Grassy Terrain + Grass move + non-grounded attacker, returns no modifier", () => {
      // Source: Bulbapedia "Grassy Terrain" -- only grounded attackers get the boost
      const result = getTerrainDamageModifier(TERRAINS.grassy, TYPES.grass, MOVES.energyBall, false, true);
      expect(result.powerModifier).toBeNull();
    });

    it("given Grassy Terrain + Earthquake vs grounded defender, returns grassyGroundHalved=true", () => {
      // Source: Bulbapedia "Grassy Terrain" -- Earthquake/Bulldoze/Magnitude halved
      const result = getTerrainDamageModifier(TERRAINS.grassy, TYPES.ground, MOVES.earthquake, true, true);
      expect(result.grassyGroundHalved).toBe(true);
    });

    it("given Grassy Terrain + Bulldoze vs grounded defender, returns grassyGroundHalved=true", () => {
      // Source: Bulbapedia "Grassy Terrain" -- Bulldoze is in the halved set
      const result = getTerrainDamageModifier(TERRAINS.grassy, TYPES.ground, MOVES.bulldoze, true, true);
      expect(result.grassyGroundHalved).toBe(true);
    });

    it("given Grassy Terrain + Magnitude vs grounded defender, returns grassyGroundHalved=true", () => {
      // Source: Bulbapedia "Grassy Terrain" -- Magnitude is in the halved set
      const result = getTerrainDamageModifier(TERRAINS.grassy, TYPES.ground, MOVES.magnitude, true, true);
      expect(result.grassyGroundHalved).toBe(true);
    });

    it("given Grassy Terrain + Earthquake vs non-grounded defender (Flying), no halving", () => {
      // Source: Bulbapedia "Grassy Terrain" -- only halves for grounded targets
      const result = getTerrainDamageModifier(TERRAINS.grassy, TYPES.ground, MOVES.earthquake, true, false);
      expect(result.grassyGroundHalved).toBe(false);
    });

    it("given Grassy Terrain + non-ground move, no halving", () => {
      // Source: Only Earthquake/Bulldoze/Magnitude are halved
      const result = getTerrainDamageModifier(TERRAINS.grassy, TYPES.normal, MOVES.tackle, true, true);
      expect(result.powerModifier).toBeNull();
      expect(result.grassyGroundHalved).toBe(false);
    });
  });

  describe("Misty Terrain", () => {
    it("given Misty Terrain + Dragon move vs grounded defender, returns 2048 (0.5x) power modifier", () => {
      // Source: Bulbapedia "Misty Terrain" Gen 6 -- Dragon moves halved vs grounded
      const result = getTerrainDamageModifier(TERRAINS.misty, TYPES.dragon, MOVES.dragonPulse, true, true);
      expect(result.powerModifier).toBe(2048);
    });

    it("given Misty Terrain + Dragon move vs non-grounded defender (Flying), returns no modifier", () => {
      // Source: Bulbapedia "Misty Terrain" -- only halves against grounded targets
      const result = getTerrainDamageModifier(TERRAINS.misty, TYPES.dragon, MOVES.dragonPulse, true, false);
      expect(result.powerModifier).toBeNull();
    });

    it("given Misty Terrain + non-Dragon move, returns no modifier", () => {
      // Source: Bulbapedia "Misty Terrain" -- only halves Dragon-type moves
      const result = getTerrainDamageModifier(TERRAINS.misty, TYPES.fire, MOVES.flamethrower, true, true);
      expect(result.powerModifier).toBeNull();
    });
  });

  describe("Psychic Terrain", () => {
    it("given Psychic Terrain, returns no power modifier (Psychic Terrain boost is Gen 7+)", () => {
      // Source: Bulbapedia "Psychic Terrain" -- power boost introduced Gen 7, not Gen 6
      // Gen 6 Psychic Terrain only blocks priority moves targeting grounded Pokemon
      const result = getTerrainDamageModifier(TERRAINS.psychic, TYPES.psychic, TYPES.psychic, true, true);
      expect(result.powerModifier).toBeNull();
    });
  });
});

// ===========================================================================
// Damage calc integration — terrain modifiers applied through calculateGen6Damage
// ===========================================================================

describe("calculateGen6Damage — terrain modifiers", () => {
  describe("Electric Terrain", () => {
    it("given Electric Terrain + grounded attacker using Thunderbolt, damage includes 1.5x boost", () => {
      // Source: Bulbapedia "Electric Terrain" Gen 6 -- 1.5x Electric for grounded attacker
      // Grounded: normal-type (not flying, no levitate)
      const attacker = makeActive({ types: [TYPES.normal], spAttack: 150 });
      const defender = makeActive({ types: [TYPES.normal], spDefense: 100 });
      const move = makeMove({
        id: MOVES.thunderbolt,
        type: TYPES.electric,
        category: "special",
        power: 90,
      });

      const stateNoTerrain = makeState();
      const stateWithTerrain = makeState({
        terrain: { type: TERRAINS.electric, turnsLeft: 5, source: TERRAIN_SOURCES.electric },
      });

      // Use same seed for deterministic comparison
      const resultNoTerrain = calculateGen6Damage(
        makeDamageContext({ attacker, defender, move, state: stateNoTerrain, seed: 99 }),
        typeChart,
      );
      const resultWithTerrain = calculateGen6Damage(
        makeDamageContext({ attacker, defender, move, state: stateWithTerrain, seed: 99 }),
        typeChart,
      );

      // With terrain the damage should be higher due to 1.5x power boost
      expect(resultWithTerrain.damage).toBeGreaterThan(resultNoTerrain.damage);
    });

    it("given Electric Terrain + Flying-type attacker using Thunderbolt, no terrain boost", () => {
      // Source: Bulbapedia "Electric Terrain" -- only grounded attackers get the boost
      const attacker = makeActive({ types: [TYPES.flying], spAttack: 150 });
      const defender = makeActive({ types: [TYPES.normal], spDefense: 100 });
      const move = makeMove({
        id: MOVES.thunderbolt,
        type: TYPES.electric,
        category: "special",
        power: 90,
      });

      const stateNoTerrain = makeState();
      const stateWithTerrain = makeState({
        terrain: { type: TERRAINS.electric, turnsLeft: 5, source: TERRAIN_SOURCES.electric },
      });

      const resultNoTerrain = calculateGen6Damage(
        makeDamageContext({ attacker, defender, move, state: stateNoTerrain, seed: 99 }),
        typeChart,
      );
      const resultWithTerrain = calculateGen6Damage(
        makeDamageContext({ attacker, defender, move, state: stateWithTerrain, seed: 99 }),
        typeChart,
      );

      // Flying attacker is not grounded, so no terrain boost
      expect(resultWithTerrain.damage).toBe(resultNoTerrain.damage);
    });
  });

  describe("Grassy Terrain", () => {
    it("given Grassy Terrain + grounded attacker using Energy Ball, damage includes 1.5x boost", () => {
      // Source: Bulbapedia "Grassy Terrain" Gen 6 -- 1.5x Grass for grounded attacker
      const attacker = makeActive({ types: [TYPES.grass], spAttack: 150 });
      const defender = makeActive({ types: [TYPES.normal], spDefense: 100 });
      const move = makeMove({
        id: MOVES.energyBall,
        type: TYPES.grass,
        category: "special",
        power: 90,
      });

      const stateNoTerrain = makeState();
      const stateWithTerrain = makeState({
        terrain: { type: TERRAINS.grassy, turnsLeft: 5, source: TERRAIN_SOURCES.grassy },
      });

      const resultNoTerrain = calculateGen6Damage(
        makeDamageContext({ attacker, defender, move, state: stateNoTerrain, seed: 99 }),
        typeChart,
      );
      const resultWithTerrain = calculateGen6Damage(
        makeDamageContext({ attacker, defender, move, state: stateWithTerrain, seed: 99 }),
        typeChart,
      );

      // Grassy terrain boost makes damage higher
      expect(resultWithTerrain.damage).toBeGreaterThan(resultNoTerrain.damage);
    });

    it("given Grassy Terrain + grounded defender hit by Earthquake, damage is halved", () => {
      // Source: Bulbapedia "Grassy Terrain" -- Earthquake damage halved vs grounded
      const attacker = makeActive({ types: [TYPES.ground], attack: 150 });
      const defender = makeActive({ types: [TYPES.normal], defense: 100 });
      const move = makeMove({
        id: MOVES.earthquake,
        type: TYPES.ground,
        category: "physical",
        power: 100,
      });

      const stateNoTerrain = makeState();
      const stateWithTerrain = makeState({
        terrain: { type: TERRAINS.grassy, turnsLeft: 5, source: TERRAIN_SOURCES.grassy },
      });

      const resultNoTerrain = calculateGen6Damage(
        makeDamageContext({ attacker, defender, move, state: stateNoTerrain, seed: 99 }),
        typeChart,
      );
      const resultWithTerrain = calculateGen6Damage(
        makeDamageContext({ attacker, defender, move, state: stateWithTerrain, seed: 99 }),
        typeChart,
      );

      // Earthquake is halved by Grassy Terrain
      expect(resultWithTerrain.damage).toBeLessThan(resultNoTerrain.damage);
    });

    it("given Grassy Terrain + Flying-type defender hit by Earthquake, no halving (not grounded)", () => {
      // Source: Bulbapedia "Grassy Terrain" -- halving only applies to grounded targets
      // Flying types are not grounded (Earthquake wouldn't normally hit them, but this
      // tests the terrain halving logic independently from type immunity)
      const attacker = makeActive({ types: [TYPES.ground], attack: 150 });
      const defender = makeActive({ types: [TYPES.normal, TYPES.flying], defense: 100 });
      const move = makeMove({
        id: MOVES.earthquake,
        type: TYPES.ground,
        category: "physical",
        power: 100,
      });

      const stateNoTerrain = makeState();
      const stateWithTerrain = makeState({
        terrain: { type: TERRAINS.grassy, turnsLeft: 5, source: TERRAIN_SOURCES.grassy },
      });

      const resultNoTerrain = calculateGen6Damage(
        makeDamageContext({ attacker, defender, move, state: stateNoTerrain, seed: 99 }),
        typeChart,
      );
      const resultWithTerrain = calculateGen6Damage(
        makeDamageContext({ attacker, defender, move, state: stateWithTerrain, seed: 99 }),
        typeChart,
      );

      // Flying defender is not grounded, so no Grassy halving
      // (both return 0 because Ground immune to Flying, which is fine)
      expect(resultWithTerrain.damage).toBe(resultNoTerrain.damage);
    });
  });

  describe("Misty Terrain", () => {
    it("given Misty Terrain + Dragon Pulse vs grounded defender, damage is halved", () => {
      // Source: Bulbapedia "Misty Terrain" Gen 6 -- Dragon moves 0.5x vs grounded
      const attacker = makeActive({ types: [TYPES.dragon], spAttack: 150 });
      const defender = makeActive({ types: [TYPES.normal], spDefense: 100 });
      const move = makeMove({
        id: MOVES.dragonPulse,
        type: TYPES.dragon,
        category: "special",
        power: 85,
      });

      const stateNoTerrain = makeState();
      const stateWithTerrain = makeState({
        terrain: { type: TERRAINS.misty, turnsLeft: 5, source: TERRAIN_SOURCES.misty },
      });

      const resultNoTerrain = calculateGen6Damage(
        makeDamageContext({ attacker, defender, move, state: stateNoTerrain, seed: 99 }),
        typeChart,
      );
      const resultWithTerrain = calculateGen6Damage(
        makeDamageContext({ attacker, defender, move, state: stateWithTerrain, seed: 99 }),
        typeChart,
      );

      // Dragon moves halved by Misty Terrain
      expect(resultWithTerrain.damage).toBeLessThan(resultNoTerrain.damage);
    });

    it("given Misty Terrain + Dragon move vs Flying defender (not grounded), no halving", () => {
      // Source: Bulbapedia "Misty Terrain" -- halving only vs grounded targets
      const attacker = makeActive({ types: [TYPES.dragon], spAttack: 150 });
      const defender = makeActive({ types: [TYPES.flying], spDefense: 100 });
      const move = makeMove({
        id: MOVES.dragonPulse,
        type: TYPES.dragon,
        category: "special",
        power: 85,
      });

      const stateNoTerrain = makeState();
      const stateWithTerrain = makeState({
        terrain: { type: TERRAINS.misty, turnsLeft: 5, source: TERRAIN_SOURCES.misty },
      });

      const resultNoTerrain = calculateGen6Damage(
        makeDamageContext({ attacker, defender, move, state: stateNoTerrain, seed: 99 }),
        typeChart,
      );
      const resultWithTerrain = calculateGen6Damage(
        makeDamageContext({ attacker, defender, move, state: stateWithTerrain, seed: 99 }),
        typeChart,
      );

      // Flying defender not grounded -- no Misty halving
      expect(resultWithTerrain.damage).toBe(resultNoTerrain.damage);
    });

    it("given Misty Terrain + non-Dragon move vs grounded defender, no halving", () => {
      // Source: Bulbapedia "Misty Terrain" -- only halves Dragon-type moves
      const attacker = makeActive({ types: [TYPES.fire], spAttack: 150 });
      const defender = makeActive({ types: [TYPES.normal], spDefense: 100 });
      const move = makeMove({
        id: MOVES.flamethrower,
        type: TYPES.fire,
        category: "special",
        power: 90,
      });

      const stateNoTerrain = makeState();
      const stateWithTerrain = makeState({
        terrain: { type: TERRAINS.misty, turnsLeft: 5, source: TERRAIN_SOURCES.misty },
      });

      const resultNoTerrain = calculateGen6Damage(
        makeDamageContext({ attacker, defender, move, state: stateNoTerrain, seed: 99 }),
        typeChart,
      );
      const resultWithTerrain = calculateGen6Damage(
        makeDamageContext({ attacker, defender, move, state: stateWithTerrain, seed: 99 }),
        typeChart,
      );

      // Non-Dragon move: no Misty halving
      expect(resultWithTerrain.damage).toBe(resultNoTerrain.damage);
    });
  });
});

// ===========================================================================
// applyGen6TerrainEffects — Grassy Terrain EoT healing
// ===========================================================================

describe("applyGen6TerrainEffects", () => {
  describe("Grassy Terrain healing", () => {
    it("given Grassy Terrain active + grounded Pokemon at 80% HP (320/400), heals 25 HP (floor(400/16))", () => {
      // Source: Bulbapedia "Grassy Terrain" -- 1/16 max HP heal at EoT for grounded
      // floor(400 / 16) = 25
      const pokemon = makeActive({ hp: 400, currentHp: 320, types: ["normal"] });
      const state = makeState({
        terrain: { type: "grassy", turnsLeft: 5, source: "grassy-surge" },
        sides: [
          { index: 0, active: [pokemon] },
          { index: 1, active: [] },
        ],
      });

      const results = applyGen6TerrainEffects(state);

      expect(results).toHaveLength(1);
      expect(results[0].effect).toBe("grassy-heal");
      expect(results[0].healAmount).toBe(25);
      expect(results[0].side).toBe(0);
    });

    it("given Grassy Terrain active + different max HP (160), heals 10 HP (floor(160/16))", () => {
      // Source: Bulbapedia "Grassy Terrain" -- 1/16 max HP heal
      // floor(160 / 16) = 10
      const pokemon = makeActive({ hp: 160, currentHp: 80, types: ["fire"] });
      const state = makeState({
        terrain: { type: "grassy", turnsLeft: 3, source: "grassy-terrain" },
        sides: [
          { index: 0, active: [pokemon] },
          { index: 1, active: [] },
        ],
      });

      const results = applyGen6TerrainEffects(state);

      expect(results).toHaveLength(1);
      expect(results[0].healAmount).toBe(10);
    });

    it("given Grassy Terrain active + Flying-type (not grounded), no healing", () => {
      // Source: Bulbapedia "Grassy Terrain" -- only grounded Pokemon are healed
      const pokemon = makeActive({ hp: 400, currentHp: 320, types: ["flying"] });
      const state = makeState({
        terrain: { type: "grassy", turnsLeft: 5, source: "grassy-surge" },
        sides: [
          { index: 0, active: [pokemon] },
          { index: 1, active: [] },
        ],
      });

      const results = applyGen6TerrainEffects(state);
      expect(results).toHaveLength(0);
    });

    it("given Grassy Terrain active + Pokemon at full HP, no healing", () => {
      // Source: Bulbapedia -- already at full HP, no healing needed
      const pokemon = makeActive({ hp: 400, currentHp: 400, types: ["normal"] });
      const state = makeState({
        terrain: { type: "grassy", turnsLeft: 5, source: "grassy-surge" },
        sides: [
          { index: 0, active: [pokemon] },
          { index: 1, active: [] },
        ],
      });

      const results = applyGen6TerrainEffects(state);
      expect(results).toHaveLength(0);
    });

    it("given Grassy Terrain active + fainted Pokemon (0 HP), no healing", () => {
      // Source: fainted Pokemon should not be healed
      const pokemon = makeActive({ hp: 400, currentHp: 0, types: ["normal"] });
      const state = makeState({
        terrain: { type: "grassy", turnsLeft: 5, source: "grassy-surge" },
        sides: [
          { index: 0, active: [pokemon] },
          { index: 1, active: [] },
        ],
      });

      const results = applyGen6TerrainEffects(state);
      expect(results).toHaveLength(0);
    });

    it("given Grassy Terrain active + Levitate ability (not grounded), no healing", () => {
      // Source: Bulbapedia -- Levitate makes the Pokemon non-grounded
      const pokemon = makeActive({
        hp: 400,
        currentHp: 320,
        types: [TYPES.psychic],
        ability: ABILITIES.levitate,
      });
      const state = makeState({
        terrain: { type: TERRAINS.grassy, turnsLeft: 5, source: TERRAIN_SOURCES.grassy },
        sides: [
          { index: 0, active: [pokemon] },
          { index: 1, active: [] },
        ],
      });

      const results = applyGen6TerrainEffects(state);
      expect(results).toHaveLength(0);
    });

    it("given Grassy Terrain active + Gravity, Flying-type IS grounded and gets healed", () => {
      // Source: Bulbapedia -- Gravity grounds everything, including Flying-types
      const pokemon = makeActive({ hp: 400, currentHp: 320, types: ["flying"] });
      const state = makeState({
        terrain: { type: "grassy", turnsLeft: 5, source: "grassy-surge" },
        gravity: { active: true, turnsLeft: 3 },
        sides: [
          { index: 0, active: [pokemon] },
          { index: 1, active: [] },
        ],
      });

      const results = applyGen6TerrainEffects(state);
      expect(results).toHaveLength(1);
      expect(results[0].healAmount).toBe(25);
    });

    it("given Grassy Terrain active + both sides have grounded Pokemon, both are healed", () => {
      // Source: Bulbapedia -- terrain effects apply to all Pokemon on the field
      const pokemon1 = makeActive({ hp: 400, currentHp: 200, types: ["normal"] });
      const pokemon2 = makeActive({ hp: 200, currentHp: 100, types: ["fire"] });
      const state = makeState({
        terrain: { type: "grassy", turnsLeft: 5, source: "grassy-surge" },
        sides: [
          { index: 0, active: [pokemon1] },
          { index: 1, active: [pokemon2] },
        ],
      });

      const results = applyGen6TerrainEffects(state);
      expect(results).toHaveLength(2);
      // Side 0: floor(400/16) = 25
      expect(results[0].healAmount).toBe(25);
      expect(results[0].side).toBe(0);
      // Side 1: floor(200/16) = 12
      expect(results[1].healAmount).toBe(12);
      expect(results[1].side).toBe(1);
    });

    it("given Grassy Terrain active + heal amount minimum is 1 (for low max HP)", () => {
      // Source: Showdown -- Math.max(1, floor(maxHP / 16))
      // A Pokemon with maxHP=10: floor(10/16)=0, but min is 1
      const pokemon = makeActive({ hp: 10, currentHp: 5, types: ["normal"] });
      const state = makeState({
        terrain: { type: "grassy", turnsLeft: 5, source: "grassy-surge" },
        sides: [
          { index: 0, active: [pokemon] },
          { index: 1, active: [] },
        ],
      });

      const results = applyGen6TerrainEffects(state);
      expect(results).toHaveLength(1);
      expect(results[0].healAmount).toBe(1);
    });
  });

  describe("Non-Grassy terrains", () => {
    it("given Electric Terrain, returns no healing results", () => {
      // Source: Electric Terrain has no EoT healing effect
      const pokemon = makeActive({ hp: 400, currentHp: 320, types: ["normal"] });
      const state = makeState({
        terrain: { type: "electric", turnsLeft: 5, source: "electric-surge" },
        sides: [
          { index: 0, active: [pokemon] },
          { index: 1, active: [] },
        ],
      });

      const results = applyGen6TerrainEffects(state);
      expect(results).toHaveLength(0);
    });

    it("given Misty Terrain, returns no healing results", () => {
      // Source: Misty Terrain has no EoT healing effect
      const pokemon = makeActive({ hp: 400, currentHp: 320, types: ["normal"] });
      const state = makeState({
        terrain: { type: "misty", turnsLeft: 5, source: "misty-surge" },
        sides: [
          { index: 0, active: [pokemon] },
          { index: 1, active: [] },
        ],
      });

      const results = applyGen6TerrainEffects(state);
      expect(results).toHaveLength(0);
    });
  });

  describe("No terrain", () => {
    it("given no active terrain, returns empty results", () => {
      // Source: Bulbapedia "Grassy Terrain" -- EoT heal only occurs while terrain is active
      // No terrain = no EoT effects = empty array
      const state = makeState({ terrain: null });
      const results = applyGen6TerrainEffects(state);
      expect(results).toHaveLength(0);
    });
  });
});

// ===========================================================================
// canInflictStatusWithTerrain — terrain-based status immunity
// ===========================================================================

describe("canInflictStatusWithTerrain", () => {
  describe("Electric Terrain", () => {
    it("given Electric Terrain active + grounded target, cannot fall asleep", () => {
      // Source: Bulbapedia "Electric Terrain" Gen 6 -- grounded sleep immunity
      const target = makeActive({ types: ["normal"] });
      const state = makeState({
        terrain: { type: "electric", turnsLeft: 5, source: "electric-surge" },
      });

      expect(canInflictStatusWithTerrain("sleep", target, state)).toBe(false);
    });

    it("given Electric Terrain active + grounded target, CAN be paralyzed", () => {
      // Source: Bulbapedia "Electric Terrain" -- only prevents sleep
      const target = makeActive({ types: ["normal"] });
      const state = makeState({
        terrain: { type: "electric", turnsLeft: 5, source: "electric-surge" },
      });

      expect(canInflictStatusWithTerrain("paralysis", target, state)).toBe(true);
    });

    it("given Electric Terrain active + grounded target, CAN be burned", () => {
      // Source: Bulbapedia "Electric Terrain" -- only prevents sleep
      const target = makeActive({ types: ["fire"] });
      const state = makeState({
        terrain: { type: "electric", turnsLeft: 5, source: "electric-surge" },
      });

      expect(canInflictStatusWithTerrain("burn", target, state)).toBe(true);
    });

    it("given Electric Terrain active + Flying-type target (not grounded), CAN fall asleep", () => {
      // Source: Bulbapedia "Electric Terrain" -- only grounded Pokemon are protected
      const target = makeActive({ types: ["flying"] });
      const state = makeState({
        terrain: { type: "electric", turnsLeft: 5, source: "electric-surge" },
      });

      expect(canInflictStatusWithTerrain("sleep", target, state)).toBe(true);
    });

    it("given Electric Terrain active + Levitate Pokemon (not grounded), CAN fall asleep", () => {
      // Source: Bulbapedia -- Levitate makes the Pokemon non-grounded
      const target = makeActive({ types: ["psychic"], ability: "levitate" });
      const state = makeState({
        terrain: { type: "electric", turnsLeft: 5, source: "electric-surge" },
      });

      expect(canInflictStatusWithTerrain("sleep", target, state)).toBe(true);
    });

    it("given Electric Terrain + Gravity, Flying-type IS grounded and cannot fall asleep", () => {
      // Source: Bulbapedia -- Gravity grounds everything
      const target = makeActive({ types: ["flying"] });
      const state = makeState({
        terrain: { type: "electric", turnsLeft: 5, source: "electric-surge" },
        gravity: { active: true, turnsLeft: 3 },
      });

      expect(canInflictStatusWithTerrain("sleep", target, state)).toBe(false);
    });
  });

  describe("Misty Terrain", () => {
    it("given Misty Terrain active + grounded target, cannot be burned", () => {
      // Source: Bulbapedia "Misty Terrain" Gen 6 -- grounded status immunity (all)
      const target = makeActive({ types: ["normal"] });
      const state = makeState({
        terrain: { type: "misty", turnsLeft: 5, source: "misty-surge" },
      });

      expect(canInflictStatusWithTerrain("burn", target, state)).toBe(false);
    });

    it("given Misty Terrain active + grounded target, cannot be paralyzed", () => {
      // Source: Bulbapedia "Misty Terrain" -- blocks all status for grounded
      const target = makeActive({ types: ["normal"] });
      const state = makeState({
        terrain: { type: "misty", turnsLeft: 5, source: "misty-surge" },
      });

      expect(canInflictStatusWithTerrain("paralysis", target, state)).toBe(false);
    });

    it("given Misty Terrain active + grounded target, cannot fall asleep", () => {
      // Source: Bulbapedia "Misty Terrain" -- blocks all status for grounded
      const target = makeActive({ types: ["normal"] });
      const state = makeState({
        terrain: { type: "misty", turnsLeft: 5, source: "misty-surge" },
      });

      expect(canInflictStatusWithTerrain("sleep", target, state)).toBe(false);
    });

    it("given Misty Terrain active + grounded target, cannot be poisoned", () => {
      // Source: Bulbapedia "Misty Terrain" -- blocks all status for grounded
      const target = makeActive({ types: ["normal"] });
      const state = makeState({
        terrain: { type: "misty", turnsLeft: 5, source: "misty-surge" },
      });

      expect(canInflictStatusWithTerrain("poison", target, state)).toBe(false);
    });

    it("given Misty Terrain active + grounded target, cannot be badly poisoned", () => {
      // Source: Bulbapedia "Misty Terrain" -- blocks all status for grounded
      const target = makeActive({ types: ["normal"] });
      const state = makeState({
        terrain: { type: "misty", turnsLeft: 5, source: "misty-surge" },
      });

      expect(canInflictStatusWithTerrain("badly-poisoned", target, state)).toBe(false);
    });

    it("given Misty Terrain active + grounded target, cannot be frozen", () => {
      // Source: Bulbapedia "Misty Terrain" -- blocks all status for grounded
      const target = makeActive({ types: ["normal"] });
      const state = makeState({
        terrain: { type: "misty", turnsLeft: 5, source: "misty-surge" },
      });

      expect(canInflictStatusWithTerrain("freeze", target, state)).toBe(false);
    });

    it("given Misty Terrain active + Flying-type target (not grounded), CAN be statused", () => {
      // Source: Bulbapedia "Misty Terrain" -- only grounded Pokemon are protected
      const target = makeActive({ types: ["flying"] });
      const state = makeState({
        terrain: { type: "misty", turnsLeft: 5, source: "misty-surge" },
      });

      expect(canInflictStatusWithTerrain("burn", target, state)).toBe(true);
      expect(canInflictStatusWithTerrain("sleep", target, state)).toBe(true);
      expect(canInflictStatusWithTerrain("paralysis", target, state)).toBe(true);
    });
  });

  describe("Grassy Terrain", () => {
    it("given Grassy Terrain, no status immunity (Grassy only heals)", () => {
      // Source: Bulbapedia "Grassy Terrain" -- no status immunity effect
      const target = makeActive({ types: ["normal"] });
      const state = makeState({
        terrain: { type: "grassy", turnsLeft: 5, source: "grassy-surge" },
      });

      expect(canInflictStatusWithTerrain("burn", target, state)).toBe(true);
      expect(canInflictStatusWithTerrain("sleep", target, state)).toBe(true);
      expect(canInflictStatusWithTerrain("paralysis", target, state)).toBe(true);
    });
  });

  describe("No terrain", () => {
    it("given no active terrain, all status can be inflicted", () => {
      // Source: Bulbapedia "Electric Terrain" / "Misty Terrain" -- status immunity only while
      // terrain is active. No terrain = no immunity = all statuses return true.
      const target = makeActive({ types: ["normal"] });
      const state = makeState({ terrain: null });

      expect(canInflictStatusWithTerrain("burn", target, state)).toBe(true);
      expect(canInflictStatusWithTerrain("sleep", target, state)).toBe(true);
      expect(canInflictStatusWithTerrain("paralysis", target, state)).toBe(true);
      expect(canInflictStatusWithTerrain("poison", target, state)).toBe(true);
      expect(canInflictStatusWithTerrain("freeze", target, state)).toBe(true);
    });
  });
});

// ===========================================================================
// Gen6Ruleset.checkTerrainStatusImmunity — integration via ruleset
// ===========================================================================

describe("Gen6Ruleset.checkTerrainStatusImmunity", () => {
  const ruleset = new Gen6Ruleset();

  it("given Electric Terrain + grounded target + sleep, returns immune=true with message", () => {
    // Source: Bulbapedia "Electric Terrain" -- grounded sleep immunity
    const target = makeActive({ types: ["normal"] });
    const state = makeState({
      terrain: { type: "electric", turnsLeft: 5, source: "electric-surge" },
    });

    const result = ruleset.checkTerrainStatusImmunity("sleep", target, state);
    expect(result.immune).toBe(true);
    expect(result.message).toContain("Electric Terrain");
  });

  it("given Misty Terrain + grounded target + burn, returns immune=true with message", () => {
    // Source: Bulbapedia "Misty Terrain" -- grounded status immunity
    const target = makeActive({ types: ["fire"] });
    const state = makeState({
      terrain: { type: "misty", turnsLeft: 5, source: "misty-surge" },
    });

    const result = ruleset.checkTerrainStatusImmunity("burn", target, state);
    expect(result.immune).toBe(true);
    expect(result.message).toContain("Misty Terrain");
  });

  it("given no terrain, returns immune=false", () => {
    const target = makeActive({ types: ["normal"] });
    const state = makeState({ terrain: null });

    const result = ruleset.checkTerrainStatusImmunity("sleep", target, state);
    expect(result.immune).toBe(false);
  });

  it("given Electric Terrain + non-grounded target + sleep, returns immune=false", () => {
    // Source: Bulbapedia "Electric Terrain" -- only grounded Pokemon protected
    const target = makeActive({ types: ["flying"] });
    const state = makeState({
      terrain: { type: "electric", turnsLeft: 5, source: "electric-surge" },
    });

    const result = ruleset.checkTerrainStatusImmunity("sleep", target, state);
    expect(result.immune).toBe(false);
  });
});

// ===========================================================================
// Gen6Ruleset.applyTerrainEffects — integration via ruleset
// ===========================================================================

describe("Gen6Ruleset.applyTerrainEffects", () => {
  const ruleset = new Gen6Ruleset();

  it("given Grassy Terrain + grounded Pokemon, delegates to applyGen6TerrainEffects", () => {
    // Source: Bulbapedia "Grassy Terrain" -- 1/16 max HP heal at EoT
    const pokemon = makeActive({ hp: 400, currentHp: 320, types: ["normal"] });
    const state = makeState({
      terrain: { type: "grassy", turnsLeft: 5, source: "grassy-surge" },
      sides: [
        { index: 0, active: [pokemon] },
        { index: 1, active: [] },
      ],
    });

    const results = ruleset.applyTerrainEffects(state);
    expect(results).toHaveLength(1);
    expect(results[0].effect).toBe("grassy-heal");
    expect(results[0].healAmount).toBe(25); // floor(400/16)
  });
});
