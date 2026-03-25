import type {
  ActivePokemon,
  BattleState,
  DamageContext,
  MoveEffectContext,
} from "@pokemon-lib-ts/battle";
import { createDefaultStatStages } from "@pokemon-lib-ts/battle/utils";
import type {
  MoveData,
  PokemonInstance,
  PokemonType,
  StatBlock,
  TypeChart,
} from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  createEvs,
  createFriendship,
  createIvs,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { GEN3_ABILITY_IDS, GEN3_MOVE_IDS, GEN3_NATURE_IDS } from "../../src";
import { createGen3DataManager } from "../../src/data";
import { calculateGen3Damage } from "../../src/Gen3DamageCalc";
import { Gen3Ruleset } from "../../src/Gen3Ruleset";

/**
 * Tests for Gen 3 ability bug fixes:
 *   #139 — Pinch abilities (Overgrow, Blaze, Torrent, Swarm)
 *   #140 — Marvel Scale
 *   #144 — Rock Head recoil prevention
 *
 * Source hierarchy for Gen 3:
 *   1. pret/pokeemerald disassembly (ground truth)
 *   2. Pokemon Showdown Gen 3 mod
 *   3. Bulbapedia
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

/** Minimal ActivePokemon mock. */
function createSyntheticOnFieldPokemon(opts: {
  level: number;
  attack: number;
  defense: number;
  spAttack: number;
  spDefense: number;
  hp?: number;
  currentHp?: number;
  types: PokemonType[];
  status?: (typeof CORE_STATUS_IDS)[keyof typeof CORE_STATUS_IDS] | null;
  ability?: (typeof GEN3_ABILITY_IDS)[keyof typeof GEN3_ABILITY_IDS];
  heldItem?: string | null;
  statStages?: Partial<Record<string, number>>;
}): ActivePokemon {
  const stats: StatBlock = {
    hp: opts.hp ?? 200,
    attack: opts.attack,
    defense: opts.defense,
    spAttack: opts.spAttack,
    spDefense: opts.spDefense,
    speed: 100,
  };

  const pokemon = {
    uid: "gen3-test",
    speciesId: 1,
    nickname: null,
    level: opts.level,
    experience: 0,
    nature: GEN3_NATURE_IDS.hardy,
    ivs: createIvs({ hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 }),
    evs: createEvs(),
    currentHp: opts.currentHp ?? opts.hp ?? 200,
    moves: [],
    ability: opts.ability ?? "",
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    heldItem: opts.heldItem ?? null,
    status: opts.status ?? null,
    friendship: createFriendship(0),
    gender: CORE_GENDERS.male,
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
      ...createDefaultStatStages(),
      attack: opts.statStages?.attack ?? 0,
      defense: opts.statStages?.defense ?? 0,
      spAttack: opts.statStages?.spAttack ?? 0,
      spDefense: opts.statStages?.spDefense ?? 0,
    },
    volatileStatuses: new Map(),
    types: opts.types,
    ability: opts.ability ?? "",
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

/** Create an explicit synthetic move variant from canonical Gen 3 move data. */
function createSyntheticMove(moveId: string, overrides: Partial<MoveData>): MoveData {
  const baseMove = dataManager.getMove(moveId);
  return {
    ...baseMove,
    ...overrides,
    flags: {
      ...baseMove.flags,
      ...overrides.flags,
    },
  } as MoveData;
}

/** All-neutral type chart for 17 Gen 3 types. */
function createNeutralTypeChart(): TypeChart {
  const types: PokemonType[] = [
    CORE_TYPE_IDS.normal,
    CORE_TYPE_IDS.fire,
    CORE_TYPE_IDS.water,
    CORE_TYPE_IDS.electric,
    CORE_TYPE_IDS.grass,
    CORE_TYPE_IDS.ice,
    CORE_TYPE_IDS.fighting,
    CORE_TYPE_IDS.poison,
    CORE_TYPE_IDS.ground,
    CORE_TYPE_IDS.flying,
    CORE_TYPE_IDS.psychic,
    CORE_TYPE_IDS.bug,
    CORE_TYPE_IDS.rock,
    CORE_TYPE_IDS.ghost,
    CORE_TYPE_IDS.dragon,
    CORE_TYPE_IDS.dark,
    CORE_TYPE_IDS.steel,
  ];
  const chart = {} as Record<string, Record<string, number>>;
  for (const atk of types) {
    chart[atk] = {};
    for (const def of types) {
      (chart[atk] as Record<string, number>)[def] = 1;
    }
  }
  return chart as TypeChart;
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

function createMinimalBattleState(attacker: ActivePokemon, defender: ActivePokemon): BattleState {
  return {
    sides: [
      {
        active: [attacker],
        team: [attacker.pokemon],
        screens: { reflect: null, lightScreen: null, auroraVeil: null },
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
        trainer: null,
      },
      {
        active: [defender],
        team: [defender.pokemon],
        screens: { reflect: null, lightScreen: null, auroraVeil: null },
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
        trainer: null,
      },
    ],
    weather: { type: null, turnsLeft: 0, source: null },
    terrain: { type: null, turnsLeft: 0, source: null },
    trickRoom: { active: false, turnsLeft: 0 },
    turnNumber: 1,
    phase: "action-select" as const,
    winner: null,
    ended: false,
  } as BattleState;
}

function createMoveEffectContext(
  attacker: ActivePokemon,
  defender: ActivePokemon,
  move: MoveData,
  damage: number,
  rng: ReturnType<typeof createMockRng>,
): MoveEffectContext {
  const state = createMinimalBattleState(attacker, defender);
  return { attacker, defender, move, damage, state, rng } as MoveEffectContext;
}

const dataManager = createGen3DataManager();
const ruleset = new Gen3Ruleset(dataManager);

// ---------------------------------------------------------------------------
// #139 — Pinch Abilities (Overgrow, Blaze, Torrent, Swarm)
// ---------------------------------------------------------------------------

describe("Gen 3 Pinch Abilities — Overgrow, Blaze, Torrent, Swarm (#139)", () => {
  describe("Blaze", () => {
    it("given a Torchic with Blaze at <=1/3 HP, when using Ember (fire), then power is boosted 1.5x", () => {
      // Source: Bulbapedia — "Blaze: When HP is 1/3 or less, Fire-type moves deal 1.5x damage"
      // Source: pret/pokeemerald src/battle_util.c ABILITY_BLAZE
      // HP: 120 max, 40 current. floor(120/3) = 40, so 40 <= 40 = true (at threshold)
      //
      // Formula derivation (L50, Ember BP=40 -> boosted to floor(40*1.5)=60, Atk=100 vs Def=100, max roll):
      //   levelFactor = floor(2*50/5) + 2 = 22
      //   baseDamage = floor(floor(22 * 60 * 100 / 100) / 50) + 2 = floor(1320/50) + 2 = 28
      const attacker = createSyntheticOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        hp: 120,
        currentHp: 40,
        types: [CORE_TYPE_IDS.fire],
        ability: GEN3_ABILITY_IDS.blaze,
      });
      const defender = createSyntheticOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
      });
      // Ember is fire-type, special in Gen 3 but we'll use a fire physical move for simplicity
      // Actually fire is special in Gen 3. Let's check — fire type = special in Gen 3
      // So it uses spAttack vs spDefense. Both are 100. Same result.
      const move = createSyntheticMove(GEN3_MOVE_IDS.ember, {
        type: CORE_TYPE_IDS.fire,
        power: 40,
      });
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());

      // With Blaze boost: power = floor(40 * 1.5) = 60
      // Also gets STAB: fire attacker using fire move
      // base = floor(floor(22 * 60 * 100 / 100) / 50) + 2 = floor(1320/50) + 2 = floor(26.4) + 2 = 28
      // STAB: floor(28 * 1.5) = 42
      expect(result.damage).toBe(42);
    });

    it("given a Torchic with Blaze above 1/3 HP, when using Ember (fire), then power is NOT boosted", () => {
      // Source: pret/pokeemerald src/battle_util.c ABILITY_BLAZE — only activates at <=1/3 HP
      // HP: 120 max, 41 current. floor(120/3) = 40, so 41 > 40 = false (just above threshold)
      //
      // Formula (L50, Ember BP=40, SpAtk=100 vs SpDef=100, max roll):
      //   baseDamage = floor(floor(22 * 40 * 100 / 100) / 50) + 2 = floor(880/50) + 2 = 19
      //   STAB: floor(19 * 1.5) = 28
      const attacker = createSyntheticOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        hp: 120,
        currentHp: 41,
        types: [CORE_TYPE_IDS.fire],
        ability: GEN3_ABILITY_IDS.blaze,
      });
      const defender = createSyntheticOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
      });
      const move = createSyntheticMove(GEN3_MOVE_IDS.ember, {
        type: CORE_TYPE_IDS.fire,
        power: 40,
      });
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());

      // Without Blaze boost: power stays 40
      // base = floor(floor(22 * 40 * 100 / 100) / 50) + 2 = floor(880/50) + 2 = 19
      // STAB: floor(19 * 1.5) = 28
      expect(result.damage).toBe(28);
    });

    it("given a Torchic with Blaze at <=1/3 HP, when using Tackle (normal), then power is NOT boosted", () => {
      // Source: pret/pokeemerald — Blaze only boosts Fire-type moves, not other types
      // HP: 120 max, 40 current. At threshold but wrong move type.
      //
      // Formula (L50, Tackle BP=35, Atk=100 vs Def=100, max roll):
      //   baseDamage = floor(floor(22 * 35 * 100 / 100) / 50) + 2 = floor(770/50) + 2 = 17
      const attacker = createSyntheticOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        hp: 120,
        currentHp: 40,
        types: [CORE_TYPE_IDS.fire],
        ability: GEN3_ABILITY_IDS.blaze,
      });
      const defender = createSyntheticOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
      });
      // Normal type = physical in Gen 3
      const move = createSyntheticMove(GEN3_MOVE_IDS.tackle, {
        type: CORE_TYPE_IDS.normal,
        power: 35,
      });
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());

      // No Blaze boost (wrong type), no STAB (fire attacker, normal move)
      // base = floor(floor(22 * 35 * 100 / 100) / 50) + 2 = floor(770/50) + 2 = 17
      expect(result.damage).toBe(17);
    });
  });

  describe("Overgrow", () => {
    it("given a Treecko with Overgrow at <=1/3 HP, when using Razor Leaf (grass), then power is boosted 1.5x", () => {
      // Source: Bulbapedia — "Overgrow: When HP is 1/3 or less, Grass-type moves deal 1.5x damage"
      // Source: pret/pokeemerald src/battle_util.c ABILITY_OVERGROW
      // HP: 150 max, 50 current. floor(150/3) = 50, so 50 <= 50 = true
      //
      // Grass is special in Gen 3, uses SpAtk vs SpDef
      // Formula (L50, Razor Leaf BP=55 -> boosted to floor(55*1.5)=82, SpAtk=100 vs SpDef=100, max roll):
      //   baseDamage = floor(floor(22 * 82 * 100 / 100) / 50) + 2 = floor(1804/50) + 2 = 38
      //   STAB: floor(38 * 1.5) = 57
      const attacker = createSyntheticOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        hp: 150,
        currentHp: 50,
        types: [CORE_TYPE_IDS.grass],
        ability: GEN3_ABILITY_IDS.overgrow,
      });
      const defender = createSyntheticOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
      });
      const move = createSyntheticMove(GEN3_MOVE_IDS.razorLeaf, {
        type: CORE_TYPE_IDS.grass,
        power: 55,
      });
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());

      // With Overgrow: power = floor(55 * 1.5) = 82
      // base = floor(floor(22 * 82 * 100 / 100) / 50) + 2 = floor(1804/50) + 2 = floor(36.08) + 2 = 38
      // STAB: floor(38 * 1.5) = 57
      expect(result.damage).toBe(57);
    });

    it("given a Treecko with Overgrow above 1/3 HP, when using Razor Leaf (grass), then power is NOT boosted", () => {
      // Source: pret/pokeemerald ABILITY_OVERGROW — only activates at <=1/3 HP
      // HP: 150 max, 51 current. floor(150/3) = 50, so 51 > 50 = false
      //
      // Formula (L50, Razor Leaf BP=55, SpAtk=100 vs SpDef=100, max roll):
      //   baseDamage = floor(floor(22 * 55 * 100 / 100) / 50) + 2 = floor(1210/50) + 2 = 26
      //   STAB: floor(26 * 1.5) = 39
      const attacker = createSyntheticOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        hp: 150,
        currentHp: 51,
        types: [CORE_TYPE_IDS.grass],
        ability: GEN3_ABILITY_IDS.overgrow,
      });
      const defender = createSyntheticOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
      });
      const move = createSyntheticMove(GEN3_MOVE_IDS.razorLeaf, {
        type: CORE_TYPE_IDS.grass,
        power: 55,
      });
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());

      // Without Overgrow: power stays 55
      // base = floor(floor(22 * 55 * 100 / 100) / 50) + 2 = floor(1210/50) + 2 = floor(24.2) + 2 = 26
      // STAB: floor(26 * 1.5) = 39
      expect(result.damage).toBe(39);
    });
  });

  describe("Torrent", () => {
    it("given a Mudkip with Torrent at <=1/3 HP, when using Water Gun (water), then power is boosted 1.5x", () => {
      // Source: Bulbapedia — "Torrent: When HP is 1/3 or less, Water-type moves deal 1.5x damage"
      // Source: pret/pokeemerald src/battle_util.c ABILITY_TORRENT
      // HP: 200 max, 66 current. floor(200/3) = 66, so 66 <= 66 = true (at threshold)
      //
      // Water is special in Gen 3, uses SpAtk vs SpDef
      // Formula (L50, Water Gun BP=40 -> boosted to floor(40*1.5)=60, SpAtk=100 vs SpDef=100, max roll):
      //   baseDamage = floor(floor(22 * 60 * 100 / 100) / 50) + 2 = floor(1320/50) + 2 = 28
      //   STAB: floor(28 * 1.5) = 42
      const attacker = createSyntheticOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        hp: 200,
        currentHp: 66,
        types: [CORE_TYPE_IDS.water],
        ability: GEN3_ABILITY_IDS.torrent,
      });
      const defender = createSyntheticOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
      });
      const move = createSyntheticMove(GEN3_MOVE_IDS.waterGun, {
        type: CORE_TYPE_IDS.water,
        power: 40,
      });
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());

      expect(result.damage).toBe(42);
    });

    it("given a Mudkip with Torrent above 1/3 HP, when using Water Gun (water), then power is NOT boosted", () => {
      // Source: pret/pokeemerald ABILITY_TORRENT — only activates at <=1/3 HP
      // HP: 200 max, 67 current. floor(200/3) = 66, so 67 > 66 = false
      const attacker = createSyntheticOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        hp: 200,
        currentHp: 67,
        types: [CORE_TYPE_IDS.water],
        ability: GEN3_ABILITY_IDS.torrent,
      });
      const defender = createSyntheticOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
      });
      const move = createSyntheticMove(GEN3_MOVE_IDS.waterGun, {
        type: CORE_TYPE_IDS.water,
        power: 40,
      });
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());

      // Without Torrent: power stays 40
      // base = floor(floor(22 * 40 * 100 / 100) / 50) + 2 = floor(880/50) + 2 = 19
      // STAB: floor(19 * 1.5) = 28
      expect(result.damage).toBe(28);
    });
  });

  describe("Swarm", () => {
    it("given a Heracross with Swarm at <=1/3 HP, when using Megahorn (bug), then power is boosted 1.5x", () => {
      // Source: Bulbapedia — "Swarm: When HP is 1/3 or less, Bug-type moves deal 1.5x damage"
      // Source: pret/pokeemerald src/battle_util.c ABILITY_SWARM
      // HP: 300 max, 100 current. floor(300/3) = 100, so 100 <= 100 = true
      //
      // Bug is physical in Gen 3, uses Atk vs Def
      // Formula (L50, Megahorn BP=120 -> boosted to floor(120*1.5)=180, Atk=100 vs Def=100, max roll):
      //   baseDamage = floor(floor(22 * 180 * 100 / 100) / 50) + 2 = floor(3960/50) + 2 = 81
      //   STAB: attacker is bug/fighting, move is bug -> STAB applies
      //   floor(81 * 1.5) = 121
      const attacker = createSyntheticOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        hp: 300,
        currentHp: 100,
        types: [CORE_TYPE_IDS.bug, CORE_TYPE_IDS.fighting],
        ability: GEN3_ABILITY_IDS.swarm,
      });
      const defender = createSyntheticOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
      });
      const move = createSyntheticMove(GEN3_MOVE_IDS.megahorn, {
        type: CORE_TYPE_IDS.bug,
        power: 120,
      });
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());

      // With Swarm: power = floor(120 * 1.5) = 180
      // base = floor(floor(22 * 180 * 100 / 100) / 50) + 2 = floor(3960/50) + 2 = floor(79.2) + 2 = 81
      // STAB: floor(81 * 1.5) = floor(121.5) = 121
      expect(result.damage).toBe(121);
    });

    it("given a Heracross with Swarm above 1/3 HP, when using Megahorn (bug), then power is NOT boosted", () => {
      // Source: pret/pokeemerald ABILITY_SWARM — only activates at <=1/3 HP
      // HP: 300 max, 101 current. floor(300/3) = 100, so 101 > 100 = false
      const attacker = createSyntheticOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        hp: 300,
        currentHp: 101,
        types: [CORE_TYPE_IDS.bug, CORE_TYPE_IDS.fighting],
        ability: GEN3_ABILITY_IDS.swarm,
      });
      const defender = createSyntheticOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
      });
      const move = createSyntheticMove(GEN3_MOVE_IDS.megahorn, {
        type: CORE_TYPE_IDS.bug,
        power: 120,
      });
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());

      // Without Swarm: power stays 120
      // base = floor(floor(22 * 120 * 100 / 100) / 50) + 2 = floor(2640/50) + 2 = floor(52.8) + 2 = 54
      // STAB: floor(54 * 1.5) = floor(81) = 81
      expect(result.damage).toBe(81);
    });
  });
});

// ---------------------------------------------------------------------------
// #140 — Marvel Scale
// ---------------------------------------------------------------------------

describe("Gen 3 Marvel Scale — Defense boost when statused (#140)", () => {
  it("given a Milotic with Marvel Scale and burn status, when defender, then Defense is 1.5x", () => {
    // Source: Bulbapedia — "Marvel Scale: If the Pokemon has a status condition, its Defense stat is 1.5x."
    // Source: pret/pokeemerald ABILITY_MARVEL_SCALE
    //
    // Attacker is CORE_TYPE_IDS.fighting type using CORE_TYPE_IDS.normal 80BP physical move (no STAB).
    // Defender has Defense 100, Marvel Scale with burn -> effective def = floor(100 * 1.5) = 150
    // L50, Atk=100 vs Def=150, max roll:
    //   levelFactor = floor(2*50/5) + 2 = 22
    //   22 * 80 * 100 = 176000
    //   176000 / 150 = 1173.33 -> floor = 1173
    //   1173 / 50 = 23.46 -> floor = 23
    //   23 + 2 = 25
    const attacker = createSyntheticOnFieldPokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: [CORE_TYPE_IDS.fighting], // no STAB with normal move
    });
    const defender = createSyntheticOnFieldPokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: [CORE_TYPE_IDS.water],
      ability: GEN3_ABILITY_IDS.marvelScale,
      status: CORE_STATUS_IDS.burn,
    });
    const move = createSyntheticMove(GEN3_MOVE_IDS.bodySlam, {
      type: CORE_TYPE_IDS.normal,
      power: 80,
    });
    const ctx = createDamageContext({ attacker, defender, move });
    const result = calculateGen3Damage(ctx, createNeutralTypeChart());

    // With Marvel Scale: def = floor(100 * 1.5) = 150
    // base = floor(floor(22 * 80 * 100 / 150) / 50) + 2
    //      = floor(floor(176000 / 150) / 50) + 2
    //      = floor(1173 / 50) + 2
    //      = 23 + 2 = 25
    expect(result.damage).toBe(25);
  });

  it("given a Milotic with Marvel Scale and paralysis status, when defender, then Defense is 1.5x", () => {
    // Source: pret/pokeemerald ABILITY_MARVEL_SCALE — any non-volatile status triggers it
    // Same calc as burn case — paralysis also triggers Marvel Scale
    const attacker = createSyntheticOnFieldPokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: [CORE_TYPE_IDS.fighting], // no STAB with normal move
    });
    const defender = createSyntheticOnFieldPokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: [CORE_TYPE_IDS.water],
      ability: GEN3_ABILITY_IDS.marvelScale,
      status: CORE_STATUS_IDS.paralysis,
    });
    const move = createSyntheticMove(GEN3_MOVE_IDS.bodySlam, {
      type: CORE_TYPE_IDS.normal,
      power: 80,
    });
    const ctx = createDamageContext({ attacker, defender, move });
    const result = calculateGen3Damage(ctx, createNeutralTypeChart());

    // Same as burn case: def = 150, result = 25
    expect(result.damage).toBe(25);
  });

  it("given a Milotic with Marvel Scale and no status, when defender, then Defense is NOT boosted", () => {
    // Source: pret/pokeemerald ABILITY_MARVEL_SCALE — requires a non-volatile status
    const attacker = createSyntheticOnFieldPokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: [CORE_TYPE_IDS.fighting], // no STAB with normal move
    });
    const defender = createSyntheticOnFieldPokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: [CORE_TYPE_IDS.water],
      ability: GEN3_ABILITY_IDS.marvelScale,
    });
    const move = createSyntheticMove(GEN3_MOVE_IDS.bodySlam, {
      type: CORE_TYPE_IDS.normal,
      power: 80,
    });
    const ctx = createDamageContext({ attacker, defender, move });
    const result = calculateGen3Damage(ctx, createNeutralTypeChart());

    // Without Marvel Scale boost: def = 100
    // base = floor(floor(22 * 80 * 100 / 100) / 50) + 2 = floor(1760/50) + 2 = floor(35.2) + 2 = 37
    expect(result.damage).toBe(37);
  });

  it("given a Marvel Scale defender with poison, when hit by special move, then Defense is NOT boosted (Marvel Scale only affects physical Defense)", () => {
    // Source: pret/pokeemerald ABILITY_MARVEL_SCALE — boosts Defense (not SpDef)
    // Fire is special in Gen 3, so it uses SpDef not Defense
    const attacker = createSyntheticOnFieldPokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: [CORE_TYPE_IDS.ground], // no STAB with fire move
    });
    const defender = createSyntheticOnFieldPokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: [CORE_TYPE_IDS.water],
      ability: GEN3_ABILITY_IDS.marvelScale,
      status: CORE_STATUS_IDS.poison,
    });
    // Fire is special in Gen 3 — uses SpDef, not Defense. Marvel Scale doesn't apply.
    const move = createSyntheticMove(GEN3_MOVE_IDS.flamethrower, {
      type: CORE_TYPE_IDS.fire,
      power: 80,
    });
    const ctx = createDamageContext({ attacker, defender, move });
    const result = calculateGen3Damage(ctx, createNeutralTypeChart());

    // SpDef is NOT boosted by Marvel Scale, so:
    // base = floor(floor(22 * 80 * 100 / 100) / 50) + 2 = floor(1760/50) + 2 = 37
    expect(result.damage).toBe(37);
  });
});

describe("Gen 3 Marvel Scale — Integer math fix (#155)", () => {
  it("given Marvel Scale with Defense 133, when calculating defense, then uses integer math floor((133 * 150) / 100) = 199", () => {
    // Source: pret/pokeemerald src/pokemon.c ABILITY_MARVEL_SCALE — (defense * 150) / 100
    // Fix: #155 — changed from Math.floor(baseStat * 1.5) to Math.floor((baseStat * 150) / 100)
    // For stat 133: float 1.5 = floor(199.5) = 199; integer = floor(19950/100) = floor(199.5) = 199
    // Both produce 199 here, but the integer form matches pokeemerald decomp exactly.
    //
    // L50, 100 Atk vs 133 Def (boosted to 199 by Marvel Scale), 80 BP Normal, max roll
    //   levelFactor = 22
    //   baseDamage = floor(floor(22 * 80 * 100 / 199) / 50)
    //             = floor(floor(176000 / 199) / 50)
    //             = floor(884 / 50) = floor(17.68) = 17
    //   +2 = 19, final = 19
    const attacker = createSyntheticOnFieldPokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: [CORE_TYPE_IDS.fighting],
    });
    const defender = createSyntheticOnFieldPokemon({
      level: 50,
      attack: 100,
      defense: 133,
      spAttack: 100,
      spDefense: 100,
      types: [CORE_TYPE_IDS.water],
      ability: GEN3_ABILITY_IDS.marvelScale,
      status: CORE_STATUS_IDS.burn,
    });
    const move = createSyntheticMove(GEN3_MOVE_IDS.bodySlam, {
      type: CORE_TYPE_IDS.normal,
      power: 80,
    });
    const ctx = createDamageContext({ attacker, defender, move });
    const result = calculateGen3Damage(ctx, createNeutralTypeChart());

    // Source: manual formula trace with floor((133 * 150) / 100) = 199 defense
    expect(result.damage).toBe(19);
  });

  it("given Marvel Scale with Defense 67, when calculating defense, then uses integer math floor((67 * 150) / 100) = 100", () => {
    // Source: pret/pokeemerald src/pokemon.c ABILITY_MARVEL_SCALE
    // Triangulation: different stat value to prove formula works for multiple inputs
    // For stat 67: floor((67 * 150) / 100) = floor(100.5) = 100
    //
    // L50, 100 Atk vs 67 Def (boosted to 100), 80 BP Normal, max roll
    //   baseDamage = floor(floor(22 * 80 * 100 / 100) / 50) = floor(35.2) = 35
    //   +2 = 37, final = 37
    const attacker = createSyntheticOnFieldPokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: [CORE_TYPE_IDS.fighting],
    });
    const defender = createSyntheticOnFieldPokemon({
      level: 50,
      attack: 100,
      defense: 67,
      spAttack: 100,
      spDefense: 100,
      types: [CORE_TYPE_IDS.water],
      ability: GEN3_ABILITY_IDS.marvelScale,
      status: CORE_STATUS_IDS.paralysis,
    });
    const move = createSyntheticMove(GEN3_MOVE_IDS.bodySlam, {
      type: CORE_TYPE_IDS.normal,
      power: 80,
    });
    const ctx = createDamageContext({ attacker, defender, move });
    const result = calculateGen3Damage(ctx, createNeutralTypeChart());

    // Source: manual formula trace with floor((67 * 150) / 100) = 100 defense
    expect(result.damage).toBe(37);
  });
});

// ---------------------------------------------------------------------------
// #144 — Rock Head recoil prevention
// ---------------------------------------------------------------------------

describe("Gen 3 Rock Head — recoil prevention (#144)", () => {
  it("given attacker with Rock Head, when using Double-Edge (1/3 recoil), then recoilDamage is 0", () => {
    // Source: Bulbapedia — "Rock Head: Protects the Pokemon from recoil damage."
    // Source: pret/pokeemerald ABILITY_ROCK_HEAD — prevents recoil damage
    const attacker = createSyntheticOnFieldPokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: [CORE_TYPE_IDS.rock, CORE_TYPE_IDS.ground],
      ability: GEN3_ABILITY_IDS.rockHead,
    });
    const defender = createSyntheticOnFieldPokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: [CORE_TYPE_IDS.normal],
    });
    const move = dataManager.getMove(GEN3_MOVE_IDS.doubleEdge);
    const rng = createMockRng(0);
    const context = createMoveEffectContext(attacker, defender, move, 99, rng);

    const result = ruleset.executeMoveEffect(context);

    // Rock Head prevents recoil
    expect(result.recoilDamage).toBe(0);
  });

  it("given attacker WITHOUT Rock Head, when using Double-Edge (1/3 recoil), then recoilDamage is applied", () => {
    // Source: pret/pokeemerald — without Rock Head, recoil applies normally
    const attacker = createSyntheticOnFieldPokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: [CORE_TYPE_IDS.normal],
    });
    const defender = createSyntheticOnFieldPokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: [CORE_TYPE_IDS.normal],
    });
    const move = dataManager.getMove(GEN3_MOVE_IDS.doubleEdge);
    const rng = createMockRng(0);
    const context = createMoveEffectContext(attacker, defender, move, 99, rng);

    const result = ruleset.executeMoveEffect(context);

    // Without Rock Head: recoil = floor(99 * 1/3) = 33
    expect(result.recoilDamage).toBe(33);
  });

  it("given attacker with Rock Head, when Struggle is used, then Struggle recoil is NOT prevented", () => {
    // Source: Bulbapedia — "Rock Head does not prevent Struggle recoil."
    // Source: pret/pokeemerald — Struggle recoil uses a different code path
    // Struggle recoil is handled by calculateStruggleRecoil, not executeMoveEffect "recoil" case.
    // This test verifies that Rock Head has no effect on Struggle recoil.
    const attacker = createSyntheticOnFieldPokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      hp: 200,
      types: [CORE_TYPE_IDS.rock, CORE_TYPE_IDS.ground],
      ability: GEN3_ABILITY_IDS.rockHead,
    });
    // calculateStruggleRecoil in Gen 3 returns floor(damageDealt / 4)
    // Rock Head should NOT prevent this
    const struggleRecoil = ruleset.calculateStruggleRecoil(attacker, 100);

    // Struggle recoil = floor(100 / 4) = 25, Rock Head does NOT prevent it
    expect(struggleRecoil).toBe(25);
  });

  it("given attacker with Rock Head, when using Take Down (1/4 recoil), then recoilDamage is 0", () => {
    // Source: pret/pokeemerald ABILITY_ROCK_HEAD — prevents recoil from all recoil moves
    const attacker = createSyntheticOnFieldPokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: [CORE_TYPE_IDS.normal],
      ability: GEN3_ABILITY_IDS.rockHead,
    });
    const defender = createSyntheticOnFieldPokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: [CORE_TYPE_IDS.normal],
    });
    const move = dataManager.getMove(GEN3_MOVE_IDS.takeDown);
    const rng = createMockRng(0);
    const context = createMoveEffectContext(attacker, defender, move, 80, rng);

    const result = ruleset.executeMoveEffect(context);

    // Rock Head prevents recoil
    expect(result.recoilDamage).toBe(0);
  });
});
