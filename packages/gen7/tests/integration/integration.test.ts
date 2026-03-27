/**
 * Gen 7 Wave 10: Integration Tests
 *
 * End-to-end scenarios testing multiple Gen 7 systems working together.
 * Each test exercises at least 2 subsystems in combination.
 */

import type {
  AbilityContext,
  ActivePokemon,
  BattleConfig,
  BattleEvent,
  BattleState,
} from "@pokemon-lib-ts/battle";
import { BATTLE_GIMMICK_IDS, BattleEngine } from "@pokemon-lib-ts/battle";
import { createOnFieldPokemon } from "@pokemon-lib-ts/battle/utils";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_GENDERS,
  CORE_GIMMICK_IDS,
  CORE_ITEM_IDS,
  CORE_MOVE_CATEGORIES,
  CORE_MOVE_IDS,
  CORE_STAT_IDS,
  CORE_STATUS_IDS,
  CORE_TERRAIN_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  CORE_WEATHER_IDS,
  createEvs,
  createFriendship,
  createIvs,
  createMoveSlot,
  createPokemonInstance,
  type MoveData,
  type PokemonInstance,
  type PokemonType,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  applyGen7TerrainEffects,
  checkPsychicTerrainPriorityBlock,
  createGen7DataManager,
  GEN7_ABILITY_IDS,
  GEN7_ITEM_IDS,
  GEN7_MOVE_IDS,
  GEN7_NATURE_IDS,
  GEN7_SPECIES_IDS,
  handleGen7NewAbility,
  handleSurgeAbility,
  isSchoolForm,
  TERRAIN_DEFAULT_TURNS,
  TERRAIN_EXTENDED_TURNS,
} from "../../src";
import {
  handleGen7StatAbility,
  isGaleWingsActive,
  isPranksterBlockedByDarkType,
} from "../../src/Gen7AbilitiesStat";
import { calculateGen7Damage } from "../../src/Gen7DamageCalc";
import { Gen7MegaEvolution } from "../../src/Gen7MegaEvolution";
import { Gen7Ruleset } from "../../src/Gen7Ruleset";
import { GEN7_TYPE_CHART } from "../../src/Gen7TypeChart";
import { Gen7ZMove } from "../../src/Gen7ZMove";

const dataManager = createGen7DataManager();
const ABILITIES = { ...CORE_ABILITY_IDS, ...GEN7_ABILITY_IDS } as const;
const ABILITY_SLOTS = CORE_ABILITY_SLOTS;
const TRIGGERS = CORE_ABILITY_TRIGGER_IDS;
const GENDERS = CORE_GENDERS;
const GIMMICKS = { ...CORE_GIMMICK_IDS, ...BATTLE_GIMMICK_IDS } as const;
const ITEM_IDS = { ...CORE_ITEM_IDS, ...GEN7_ITEM_IDS } as const;
const MOVE_CATEGORIES = CORE_MOVE_CATEGORIES;
const MOVES = { ...CORE_MOVE_IDS, ...GEN7_MOVE_IDS } as const;
const _STATUS = CORE_STATUS_IDS;
const SPECIES = GEN7_SPECIES_IDS;
const TERRAIN = CORE_TERRAIN_IDS;
const VOLATILES = CORE_VOLATILE_IDS;
const WEATHER = CORE_WEATHER_IDS;
const TYPES = CORE_TYPE_IDS;
const DEFAULT_NATURE = GEN7_NATURE_IDS.hardy;
const AURORA_VEIL = MOVES.auroraVeil;
const DISGUISE_BROKEN = VOLATILES.disguiseBroken;

function getCanonicalMove(moveId: string): MoveData {
  return dataManager.getMove(moveId);
}

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function createSyntheticPokemonInstance(overrides: {
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
  nickname?: string | null;
  movedThisTurn?: boolean;
  turnsOnField?: number;
  volatileStatuses?: Map<string, unknown>;
  suppressedAbility?: string | null;
  moveIds?: string[];
  friendship?: number;
  gender?: (typeof GENDERS)[keyof typeof GENDERS];
}): PokemonInstance {
  const species = dataManager.getSpecies(overrides.speciesId ?? SPECIES.bulbasaur);
  const hp = overrides.hp ?? 200;
  const attack = overrides.attack ?? 100;
  const defense = overrides.defense ?? 100;
  const spAttack = overrides.spAttack ?? 100;
  const spDefense = overrides.spDefense ?? 100;
  const speed = overrides.speed ?? 100;
  const moveIds = overrides.moveIds ?? [MOVES.tackle];
  const pokemon = createPokemonInstance(species, overrides.level ?? 50, new SeededRandom(7), {
    nature: DEFAULT_NATURE,
    ivs: createIvs(),
    evs: createEvs(),
    abilitySlot: ABILITY_SLOTS.normal1,
    gender: overrides.gender ?? GENDERS.male,
    friendship: createFriendship(overrides.friendship ?? species.baseFriendship),
    heldItem: overrides.heldItem ?? null,
    status: (overrides.status ?? null) as any,
    nickname: overrides.nickname ?? null,
    moves: moveIds,
    metLocation: "test",
    originalTrainer: "Test",
    originalTrainerId: 0,
    pokeball: ITEM_IDS.pokeBall,
  });
  pokemon.moves = moveIds.map((moveId) => {
    const move = getCanonicalMove(moveId);
    return createMoveSlot(moveId, move.pp);
  });
  pokemon.currentHp = overrides.currentHp ?? hp;
  pokemon.ability = overrides.ability ?? ABILITIES.none;
  pokemon.calculatedStats = { hp, attack, defense, spAttack, spDefense, speed };
  return pokemon;
}

function createSyntheticOnFieldPokemon(overrides: {
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
  nickname?: string | null;
  movedThisTurn?: boolean;
  turnsOnField?: number;
  volatileStatuses?: Map<string, unknown>;
  suppressedAbility?: string | null;
  moveIds?: string[];
  friendship?: number;
  gender?: (typeof GENDERS)[keyof typeof GENDERS];
}): ActivePokemon {
  const pokemon = createSyntheticPokemonInstance(overrides);
  const active = createOnFieldPokemon(pokemon, 0, [...(overrides.types ?? [TYPES.normal])]);
  active.volatileStatuses = overrides.volatileStatuses ?? new Map();
  active.types = [...(overrides.types ?? [TYPES.normal])];
  active.ability = overrides.ability ?? ABILITIES.none;
  active.lastMoveUsed = null;
  active.lastDamageTaken = 0;
  active.lastDamageType = null;
  active.lastDamageCategory = null;
  active.turnsOnField = overrides.turnsOnField ?? 0;
  active.movedThisTurn = overrides.movedThisTurn ?? false;
  active.consecutiveProtects = 0;
  active.substituteHp = 0;
  active.itemKnockedOff = false;
  active.transformed = false;
  active.transformedSpecies = null;
  active.isMega = false;
  active.isDynamaxed = false;
  active.dynamaxTurnsLeft = 0;
  active.isTerastallized = false;
  active.teraType = null;
  active.stellarBoostedTypes = [];
  active.suppressedAbility = overrides.suppressedAbility ?? null;
  active.forcedMove = null;
  return active as ActivePokemon;
}

function createSyntheticMoveFromCanonical(
  moveId = MOVES.tackle,
  overrides: Partial<MoveData> = {},
): MoveData {
  const baseMove = getCanonicalMove(moveId);
  return {
    ...baseMove,
    ...overrides,
    flags: { ...baseMove.flags, ...overrides.flags },
  } as MoveData;
}

function createSyntheticBattleState(overrides?: Partial<BattleState>): BattleState {
  return {
    weather: null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    format: "singles",
    generation: 7,
    turnNumber: 1,
    sides: [
      { index: 0, active: [], hazards: {}, tailwind: { active: false, turnsLeft: 0 } },
      { index: 1, active: [], hazards: {}, tailwind: { active: false, turnsLeft: 0 } },
    ],
    ...overrides,
  } as unknown as BattleState;
}

function createGen7Engine(options?: {
  team1?: PokemonInstance[];
  team2?: PokemonInstance[];
  seed?: number;
}) {
  const ruleset = new Gen7Ruleset(dataManager);
  const events: BattleEvent[] = [];
  const config: BattleConfig = {
    generation: 7,
    format: "singles",
    teams: [
      options?.team1 ?? [createSyntheticPokemonInstance({ moveIds: [MOVES.tackle], speed: 120 })],
      options?.team2 ?? [createSyntheticPokemonInstance({ moveIds: [MOVES.tackle], speed: 80 })],
    ],
    seed: options?.seed ?? 7,
  };

  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((event) => events.push(event));
  return { engine, ruleset, events };
}

// ===========================================================================
// Integration Scenario 1: Z-Move vs Mega team -- both gimmicks in same battle
// ===========================================================================

describe("Integration: Z-Move vs Mega Evolution coexistence", () => {
  it("given a team with Z-Move and Mega, when checking gimmick availability, both are accessible independently", () => {
    // Source: Showdown sim/side.ts -- zMoveUsed and megaUsed are tracked separately
    // Source: Bulbapedia "Z-Move" -- "Z-Moves and Mega Evolution can both be used in the same battle"
    const ruleset = new Gen7Ruleset();
    const zMoveGimmick = ruleset.getBattleGimmick(GIMMICKS.zMove);
    const megaGimmick = ruleset.getBattleGimmick(GIMMICKS.mega);

    expect(zMoveGimmick).not.toBeNull();
    expect(megaGimmick).not.toBeNull();
    // They must be different instances
    expect(zMoveGimmick).not.toBe(megaGimmick);
  });

  it("given one side uses Z-Move and the other uses Mega, both should function correctly", () => {
    // Source: Showdown sim/side.ts:170 -- per-side tracking; side 0 can Z, side 1 can Mega
    const zMove = new Gen7ZMove();
    const mega = new Gen7MegaEvolution();

    // Side 0 Z-Move user with Normalium Z
    const zUser = createSyntheticOnFieldPokemon({
      ability: ABILITIES.none,
      heldItem: ITEM_IDS.normaliumZ,
      types: [TYPES.normal],
      speciesId: SPECIES.snorlax,
      nickname: "Snorlax",
    });

    // Side 1 Mega user with Charizardite X
    const megaUser = createSyntheticOnFieldPokemon({
      ability: ABILITIES.none,
      heldItem: ITEM_IDS.charizarditeX,
      types: [TYPES.fire, TYPES.flying],
      speciesId: SPECIES.charizard,
      nickname: "Charizard",
    });

    const gigaImpact = createSyntheticMoveFromCanonical(MOVES.gigaImpact);

    // Z-Move should be available for side 0
    const canUseZ = zMove.canUse(zUser, gigaImpact, 0, createSyntheticBattleState());
    expect(canUseZ).toBe(true);

    // Mega should be available for side 1
    const canUseMega = mega.canUse(
      megaUser,
      createSyntheticMoveFromCanonical(MOVES.flareBlitz),
      1,
      createSyntheticBattleState(),
    );
    expect(canUseMega).toBe(true);
  });

  it("given Z-Move already used on side 0, Mega should still work on side 0", () => {
    // Source: Showdown -- Z and Mega are independently tracked per side
    const zMove = new Gen7ZMove();
    const mega = new Gen7MegaEvolution();

    // Use Z-Move on side 0
    const zUser = createSyntheticOnFieldPokemon({
      ability: ABILITIES.none,
      heldItem: ITEM_IDS.normaliumZ,
      types: [TYPES.normal],
      nickname: "Snorlax",
    });
    const normalMove = createSyntheticMoveFromCanonical(MOVES.tackle);
    const state = createSyntheticBattleState();

    zMove.activate(zUser, normalMove, 0, state);

    // Mega should still be available on side 0
    const megaUser = createSyntheticOnFieldPokemon({
      ability: ABILITIES.none,
      heldItem: ITEM_IDS.charizarditeX,
      types: [TYPES.fire, TYPES.flying],
      speciesId: SPECIES.charizard,
      nickname: "Charizard",
    });

    const canMega = mega.canUse(
      megaUser,
      createSyntheticMoveFromCanonical(MOVES.flareBlitz),
      0,
      state,
    );
    expect(canMega).toBe(true);
  });
});

describe("Integration: Spectral Thief", () => {
  it("given the target has a positive Attack boost, when Spectral Thief resolves, then it steals the boost before the same hit's damage", () => {
    const bulbasaurAbility = dataManager.getSpecies(SPECIES.bulbasaur).abilities.normal[0];

    const createSpectralTeams = () => ({
      team1: [
        createSyntheticPokemonInstance({
          speciesId: SPECIES.bulbasaur,
          moveIds: [MOVES.spectralThief],
          ability: bulbasaurAbility,
          attack: 95,
          defense: 100,
          spAttack: 80,
          spDefense: 100,
          speed: 120,
          hp: 200,
          currentHp: 200,
        }),
      ],
      team2: [
        createSyntheticPokemonInstance({
          speciesId: SPECIES.bulbasaur,
          moveIds: [MOVES.splash],
          ability: bulbasaurAbility,
          attack: 100,
          defense: 100,
          spAttack: 80,
          spDefense: 100,
          speed: 80,
          hp: 200,
          currentHp: 200,
        }),
      ],
    });

    const boostedBattle = createGen7Engine(createSpectralTeams());
    boostedBattle.engine.start();
    const boostedDefender = boostedBattle.engine.state.sides[1].active[0];
    if (!boostedDefender) {
      throw new Error("Expected boosted Spectral Thief target");
    }
    boostedDefender.statStages.attack = 2;

    boostedBattle.engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    boostedBattle.engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const baselineBattle = createGen7Engine(createSpectralTeams());
    baselineBattle.engine.start();
    baselineBattle.engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    baselineBattle.engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const boostedDamage = boostedBattle.events.find(
      (event) => event.type === "damage" && event.side === 1,
    );
    const baselineDamage = baselineBattle.events.find(
      (event) => event.type === "damage" && event.side === 1,
    );

    expect(boostedBattle.engine.state.sides[0].active[0]?.statStages.attack).toBe(2);
    expect(boostedDefender.statStages.attack).toBe(0);
    expect(boostedDamage?.type === "damage" && boostedDamage.amount).toBeGreaterThan(
      baselineDamage?.type === "damage" ? baselineDamage.amount : 0,
    );

    const statChangeEvents = boostedBattle.events.filter((event) => event.type === "stat-change");
    expect(statChangeEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "stat-change",
          side: 0,
          stat: CORE_STAT_IDS.attack,
          stages: 2,
          currentStage: 2,
        }),
        expect.objectContaining({
          type: "stat-change",
          side: 1,
          stat: CORE_STAT_IDS.attack,
          stages: -2,
          currentStage: 0,
        }),
      ]),
    );
  });
});

// ===========================================================================
// Integration Scenario 2: Terrain + Weather combination
// ===========================================================================

describe("Integration: Grassy Terrain + Sun simultaneous effects", () => {
  it("given Grassy Terrain and Sun active, both Grass move boost and Sun fire boost apply in damage calc", () => {
    // Source: Showdown data/conditions.ts -- terrain and weather multipliers stack
    // Source: Bulbapedia -- "Grassy Terrain boosts Grass moves by 1.5x for grounded Pokemon"
    // Source: Bulbapedia -- "Harsh sunlight boosts Fire moves by 1.5x"
    const attacker = createSyntheticOnFieldPokemon({
      types: [TYPES.grass, TYPES.fire],
      attack: 150,
      ability: ABILITIES.none,
      level: 50,
    });
    const defender = createSyntheticOnFieldPokemon({
      types: [TYPES.normal],
      defense: 100,
      hp: 300,
    });
    const grassMove = createSyntheticMoveFromCanonical(MOVES.energyBall);
    const fireMove = createSyntheticMoveFromCanonical(MOVES.flamethrower);

    const stateWithBoth = createSyntheticBattleState({
      terrain: { type: TERRAIN.grassy, turnsLeft: 5, source: ABILITIES.grassySurge },
      weather: { type: WEATHER.sun, turnsLeft: 5 },
    });
    const grassBaseline = createSyntheticBattleState({
      weather: { type: WEATHER.sun, turnsLeft: 5 },
    });
    const fireBaseline = createSyntheticBattleState({
      terrain: { type: TERRAIN.grassy, turnsLeft: 5, source: ABILITIES.grassySurge },
    });

    const resultGrass = calculateGen7Damage(
      {
        attacker,
        defender,
        move: grassMove,
        state: stateWithBoth,
        rng: new SeededRandom(42),
        isCrit: false,
      },
      GEN7_TYPE_CHART,
    );
    const baselineGrass = calculateGen7Damage(
      {
        attacker,
        defender,
        move: grassMove,
        state: grassBaseline,
        rng: new SeededRandom(42),
        isCrit: false,
      },
      GEN7_TYPE_CHART,
    );
    const resultFire = calculateGen7Damage(
      {
        attacker,
        defender,
        move: fireMove,
        state: stateWithBoth,
        rng: new SeededRandom(42),
        isCrit: false,
      },
      GEN7_TYPE_CHART,
    );
    const baselineFire = calculateGen7Damage(
      {
        attacker,
        defender,
        move: fireMove,
        state: fireBaseline,
        rng: new SeededRandom(42),
        isCrit: false,
      },
      GEN7_TYPE_CHART,
    );

    expect(resultGrass).toEqual(
      expect.objectContaining({
        damage: 85,
        breakdown: expect.objectContaining({
          baseDamage: 61,
          weatherMultiplier: 1,
          stabMultiplier: 1.5,
          finalDamage: 85,
        }),
      }),
    );
    expect(baselineGrass.damage).toBe(57);
    expect(resultFire).toEqual(
      expect.objectContaining({
        damage: 85,
        breakdown: expect.objectContaining({
          baseDamage: 61,
          weatherMultiplier: 1.5,
          stabMultiplier: 1.5,
          finalDamage: 85,
        }),
      }),
    );
    expect(baselineFire.damage).toBe(57);
  });

  it("given Grassy Terrain active, end-of-turn heals grounded Pokemon", () => {
    // Source: Showdown data/conditions.ts -- grassyterrain.onResidual: heal(pokemon.baseMaxhp / 16)
    const pokemon = createSyntheticOnFieldPokemon({
      hp: 200,
      currentHp: 100,
      types: [TYPES.normal],
    });
    const state = createSyntheticBattleState({
      terrain: { type: TERRAIN.grassy, turnsLeft: 3, source: ABILITIES.grassySurge },
    });
    state.sides[0].active = [pokemon];

    const results = applyGen7TerrainEffects(state);
    expect(results.length).toBe(1);
    // 1/16 of 200 = 12
    // Source: Showdown data/conditions.ts -- grassyterrain: heal(pokemon.baseMaxhp / 16)
    expect(results[0].healAmount).toBe(12);
    expect(results[0].effect).toBe("grassy-heal");
  });
});

// ===========================================================================
// Integration Scenario 3: Psychic Terrain blocks priority vs grounded
// ===========================================================================

describe("Integration: Psychic Terrain priority blocking", () => {
  it("given Psychic Terrain active, priority move is blocked against a grounded target", () => {
    // Source: Showdown data/conditions.ts -- psychicterrain.onTryHit: if grounded and priority > 0
    // Source: Bulbapedia "Psychic Terrain" -- "Grounded Pokemon are protected from priority moves"
    const groundedTarget = createSyntheticOnFieldPokemon({ types: [TYPES.normal] });
    const state = createSyntheticBattleState({
      terrain: { type: TERRAIN.psychic, turnsLeft: 5, source: ABILITIES.psychicSurge },
    });

    const blocked = checkPsychicTerrainPriorityBlock(TERRAIN.psychic, 1, groundedTarget, state);
    expect(blocked).toBe(true);
  });

  it("given Psychic Terrain active, priority move is NOT blocked against a Flying-type target", () => {
    // Source: Showdown -- Flying types are not grounded
    // Source: Bulbapedia "Psychic Terrain" -- only grounded Pokemon are protected
    const flyingTarget = createSyntheticOnFieldPokemon({ types: [TYPES.flying] });
    const state = createSyntheticBattleState({
      terrain: { type: TERRAIN.psychic, turnsLeft: 5, source: ABILITIES.psychicSurge },
    });

    const blocked = checkPsychicTerrainPriorityBlock(TERRAIN.psychic, 1, flyingTarget, state);
    expect(blocked).toBe(false);
  });

  it("given Psychic Terrain active, non-priority move still hits grounded target", () => {
    // Source: Showdown -- priority 0 or negative is not blocked
    const groundedTarget = createSyntheticOnFieldPokemon({ types: [TYPES.normal] });
    const state = createSyntheticBattleState({
      terrain: { type: TERRAIN.psychic, turnsLeft: 5, source: ABILITIES.psychicSurge },
    });

    const blocked = checkPsychicTerrainPriorityBlock(TERRAIN.psychic, 0, groundedTarget, state);
    expect(blocked).toBe(false);
  });

  it("given Gravity active AND Psychic Terrain, Flying-type IS now grounded and blocked", () => {
    // Source: Showdown -- Gravity grounds all Pokemon
    // Source: Bulbapedia "Gravity" -- "all Pokemon are grounded"
    const flyingTarget = createSyntheticOnFieldPokemon({ types: [TYPES.flying] });
    const state = createSyntheticBattleState({
      terrain: { type: TERRAIN.psychic, turnsLeft: 5, source: ABILITIES.psychicSurge },
      gravity: { active: true, turnsLeft: 3 },
    });

    const blocked = checkPsychicTerrainPriorityBlock(TERRAIN.psychic, 1, flyingTarget, state);
    expect(blocked).toBe(true);
  });
});

// ===========================================================================
// Integration Scenario 4: Prankster vs Dark-type
// ===========================================================================

describe("Integration: Prankster vs Dark-type immunity", () => {
  it("given a Gen 7 ruleset and a Prankster status move into a Dark-type defender, then pre-execution failure is returned", () => {
    // Source: Showdown data/abilities.ts -- prankster: Dark targets block boosted status moves
    // Source: Bulbapedia "Prankster" Gen 7 -- "Status moves fail against Dark-type targets"
    const ruleset = new Gen7Ruleset();
    const attacker = createSyntheticOnFieldPokemon({
      ability: ABILITIES.prankster,
      moveIds: [MOVES.thunderWave],
      nickname: "Whimsicott",
      types: [TYPES.grass, TYPES.fairy],
    });
    const defender = createSyntheticOnFieldPokemon({
      nickname: "Umbreon",
      types: [TYPES.dark],
    });
    const thunderWave = getCanonicalMove(MOVES.thunderWave);

    const result = ruleset.getPreExecutionMoveFailure(
      attacker,
      defender,
      thunderWave,
      createSyntheticBattleState(),
    );

    expect(result).toEqual({
      reason: "blocked by Dark-type immunity",
    });
  });

  it("given Prankster user using status move vs Dark-type, move is blocked", () => {
    // Source: Showdown data/abilities.ts -- prankster: Dark targets block boosted status moves
    // Source: Bulbapedia "Prankster" Gen 7 -- "Status moves fail against Dark-type targets"
    const blocked = isPranksterBlockedByDarkType(
      ABILITIES.prankster,
      MOVE_CATEGORIES.status,
      [TYPES.dark],
      getCanonicalMove(MOVES.thunderWave).target,
    );
    expect(blocked).toBe(true);
  });

  it("given Prankster user using physical move vs Dark-type, move is NOT blocked", () => {
    // Source: Showdown -- Prankster only blocks status moves
    const blocked = isPranksterBlockedByDarkType(
      ABILITIES.prankster,
      MOVE_CATEGORIES.physical,
      [TYPES.dark],
      getCanonicalMove(MOVES.tackle).target,
    );
    expect(blocked).toBe(false);
  });

  it("given Prankster user using status move vs Dark/Fire dual type, move is blocked", () => {
    // Source: Showdown -- Dark-type check doesn't care about secondary type
    const blocked = isPranksterBlockedByDarkType(
      ABILITIES.prankster,
      MOVE_CATEGORIES.status,
      [TYPES.dark, TYPES.fire],
      getCanonicalMove(MOVES.thunderWave).target,
    );
    expect(blocked).toBe(true);
  });

  it("given non-Prankster user using status move vs Dark-type, move is NOT blocked", () => {
    // Source: Showdown -- immunity only applies to Prankster-boosted moves
    const blocked = isPranksterBlockedByDarkType(
      ABILITIES.none,
      MOVE_CATEGORIES.status,
      [TYPES.dark],
      getCanonicalMove(MOVES.thunderWave).target,
    );
    expect(blocked).toBe(false);
  });

  it("given Prankster, priority check activates for status move and then Dark-type blocks it", () => {
    // Source: Showdown -- Prankster raises priority AND Dark targets block the move
    // Integration: priority handler + Dark immunity check work together
    const ctx: AbilityContext = {
      pokemon: createSyntheticOnFieldPokemon({
        ability: ABILITIES.prankster,
        types: [TYPES.fairy],
        nickname: "Whimsicott",
      }),
      opponent: createSyntheticOnFieldPokemon({
        types: [TYPES.dark, TYPES.fire],
        nickname: "Houndoom",
      }),
      state: createSyntheticBattleState(),
      rng: new SeededRandom(42),
      trigger: TRIGGERS.onPriorityCheck,
      move: createSyntheticMoveFromCanonical(MOVES.thunderWave),
    };

    // Priority check activates
    const priorityResult = handleGen7StatAbility(ctx);
    expect(priorityResult.activated).toBe(true);

    // Dark-type check also blocks
    const darkBlocked = isPranksterBlockedByDarkType(
      ABILITIES.prankster,
      MOVE_CATEGORIES.status,
      [TYPES.dark, TYPES.fire],
      getCanonicalMove(MOVES.thunderWave).target,
    );
    expect(darkBlocked).toBe(true);
  });

  it("given Prankster user using a self-targeting status move vs Dark-type, move is NOT blocked", () => {
    // Source: Showdown data/abilities.ts -- the Dark-type immunity only applies to opposing targets.
    const agility = getCanonicalMove(MOVES.agility);
    const blocked = isPranksterBlockedByDarkType(
      ABILITIES.prankster,
      agility.category,
      [TYPES.dark],
      agility.target,
    );
    expect(blocked).toBe(false);
  });
});

// ===========================================================================
// Integration Scenario 5: Gale Wings full HP gate
// ===========================================================================

describe("Integration: Gale Wings full HP gate (Gen 7 nerf)", () => {
  it("given Gale Wings at full HP using Flying move, priority is granted", () => {
    // Source: Showdown data/abilities.ts -- galeWings Gen 7: requires pokemon.hp === pokemon.maxhp
    // Source: Bulbapedia "Gale Wings" Gen 7 -- "only activates when at full HP"
    const active = isGaleWingsActive(ABILITIES.galeWings, TYPES.flying, 200, 200);
    expect(active).toBe(true);
  });

  it("given Gale Wings at 199/200 HP using Flying move, priority is NOT granted", () => {
    // Source: Showdown -- must be at EXACTLY full HP
    const active = isGaleWingsActive(ABILITIES.galeWings, TYPES.flying, 199, 200);
    expect(active).toBe(false);
  });

  it("given Gale Wings at full HP using non-Flying move, priority is NOT granted", () => {
    // Source: Showdown -- Gale Wings only applies to Flying-type moves
    const active = isGaleWingsActive(ABILITIES.galeWings, TYPES.fire, 200, 200);
    expect(active).toBe(false);
  });

  it("given Gale Wings via handleGen7StatAbility, move type and HP gate both checked", () => {
    // Integration: full stat ability handler also checks HP
    const ctx: AbilityContext = {
      pokemon: createSyntheticOnFieldPokemon({
        ability: ABILITIES.galeWings,
        currentHp: 200,
        hp: 200,
        types: [TYPES.normal, TYPES.flying],
        nickname: "Talonflame",
      }),
      state: createSyntheticBattleState(),
      rng: new SeededRandom(42),
      trigger: TRIGGERS.onPriorityCheck,
      move: createSyntheticMoveFromCanonical(MOVES.braveBird),
    };

    const result = handleGen7StatAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.messages).toEqual(["Talonflame's Gale Wings boosted the move's priority!"]);
  });

  it("given Gale Wings via handleGen7StatAbility at non-full HP, priority denied", () => {
    const ctx: AbilityContext = {
      pokemon: createSyntheticOnFieldPokemon({
        ability: ABILITIES.galeWings,
        currentHp: 199,
        hp: 200,
        types: [TYPES.normal, TYPES.flying],
        nickname: "Talonflame",
      }),
      state: createSyntheticBattleState(),
      rng: new SeededRandom(42),
      trigger: TRIGGERS.onPriorityCheck,
      move: createSyntheticMoveFromCanonical(MOVES.braveBird),
    };

    const result = handleGen7StatAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Integration Scenario 6: Aurora Veil + Hail
// ===========================================================================

describe("Integration: Aurora Veil + Hail damage reduction", () => {
  it("given Aurora Veil set AND Hail active, physical damage is reduced", () => {
    // Source: Showdown data/conditions.ts -- Aurora Veil: 0.5x damage in singles
    // Source: Bulbapedia "Aurora Veil" -- "halves damage from physical and special moves"
    // Aurora Veil damage reduction is applied in the damage calc via side screens
    const attacker = createSyntheticOnFieldPokemon({
      attack: 150,
      types: [TYPES.fighting],
      nickname: "Machamp",
    });
    const defender = createSyntheticOnFieldPokemon({
      defense: 100,
      hp: 300,
      currentHp: 300,
      types: [TYPES.ice],
      ability: ABILITIES.none,
      nickname: "Alolan Ninetales",
    });

    const move = createSyntheticMoveFromCanonical(MOVES.closeCombat);

    const stateWithVeil = createSyntheticBattleState({
      weather: { type: WEATHER.hail, turnsLeft: 5 },
    });
    stateWithVeil.sides[1] = {
      index: 1,
      active: [defender],
      screens: [{ type: AURORA_VEIL, turnsLeft: 5 }],
      hazards: {},
      tailwind: { active: false, turnsLeft: 0 },
    } as any;

    const stateWithoutVeil = createSyntheticBattleState({
      weather: { type: WEATHER.hail, turnsLeft: 5 },
    });
    stateWithoutVeil.sides[1] = {
      index: 1,
      active: [defender],
      screens: [],
      hazards: {},
      tailwind: { active: false, turnsLeft: 0 },
    } as any;

    const resultWithVeil = calculateGen7Damage(
      {
        attacker,
        defender,
        move,
        state: stateWithVeil,
        rng: new SeededRandom(42),
        isCrit: false,
      },
      GEN7_TYPE_CHART,
    );

    const resultWithoutVeil = calculateGen7Damage(
      {
        attacker,
        defender,
        move,
        state: stateWithoutVeil,
        rng: new SeededRandom(42),
        isCrit: false,
      },
      GEN7_TYPE_CHART,
    );

    // Aurora Veil should reduce damage (approximately halved in singles)
    expect(resultWithVeil.damage).toBeLessThan(resultWithoutVeil.damage);
  });
});

// ===========================================================================
// Integration Scenario 7: Surge ability + Terrain Extender
// ===========================================================================

describe("Integration: Surge ability + Terrain Extender", () => {
  it("given Electric Surge without Terrain Extender, terrain lasts 5 turns", () => {
    // Source: Showdown data/abilities.ts -- Electric Surge sets Electric Terrain
    // Source: Bulbapedia "Electric Surge" -- terrain lasts 5 turns
    const tapu = createSyntheticOnFieldPokemon({
      ability: ABILITIES.electricSurge,
      types: [TYPES.electric, TYPES.fairy],
      nickname: "Tapu Koko",
      heldItem: null,
    });

    const ctx: AbilityContext = {
      pokemon: tapu,
      state: createSyntheticBattleState(),
      rng: new SeededRandom(42),
      trigger: TRIGGERS.onSwitchIn,
    };

    const result = handleSurgeAbility(ctx);
    expect(result.activated).toBe(true);
    expect(ctx.state.terrain?.type).toBe(TERRAIN.electric);
    expect(ctx.state.terrain?.turnsLeft).toBe(TERRAIN_DEFAULT_TURNS); // 5
  });

  it("given Electric Surge WITH Terrain Extender, terrain lasts 8 turns", () => {
    // Source: Showdown data/items.ts -- terrainextender: terrain duration + 3
    // Source: Bulbapedia "Terrain Extender" -- extends terrain to 8 turns
    const tapu = createSyntheticOnFieldPokemon({
      ability: ABILITIES.electricSurge,
      types: [TYPES.electric, TYPES.fairy],
      nickname: "Tapu Koko",
      heldItem: ITEM_IDS.terrainExtender,
    });

    const ctx: AbilityContext = {
      pokemon: tapu,
      state: createSyntheticBattleState(),
      rng: new SeededRandom(42),
      trigger: TRIGGERS.onSwitchIn,
    };

    const result = handleSurgeAbility(ctx);
    expect(result.activated).toBe(true);
    expect(ctx.state.terrain?.type).toBe(TERRAIN.electric);
    expect(ctx.state.terrain?.turnsLeft).toBe(TERRAIN_EXTENDED_TURNS); // 8
  });

  it("given Psychic Surge sets terrain, it replaces existing Electric Terrain", () => {
    // Source: Showdown -- only one terrain can be active at a time
    const state = createSyntheticBattleState({
      terrain: { type: TERRAIN.electric, turnsLeft: 3, source: ABILITIES.electricSurge },
    });

    const tapu = createSyntheticOnFieldPokemon({
      ability: ABILITIES.psychicSurge,
      types: [TYPES.psychic, TYPES.fairy],
      nickname: "Tapu Lele",
    });

    const ctx: AbilityContext = {
      pokemon: tapu,
      state,
      rng: new SeededRandom(42),
      trigger: TRIGGERS.onSwitchIn,
    };

    handleSurgeAbility(ctx);
    expect(state.terrain?.type).toBe(TERRAIN.psychic);
    expect(state.terrain?.turnsLeft).toBe(5);
  });

  it("given suppressed ability, Surge does not activate", () => {
    // Source: Showdown -- suppressed abilities do not trigger
    const tapu = createSyntheticOnFieldPokemon({
      ability: ABILITIES.electricSurge,
      types: [TYPES.electric, TYPES.fairy],
      nickname: "Tapu Koko",
      suppressedAbility: ABILITIES.electricSurge,
    });

    const ctx: AbilityContext = {
      pokemon: tapu,
      state: createSyntheticBattleState(),
      rng: new SeededRandom(42),
      trigger: TRIGGERS.onSwitchIn,
    };

    const result = handleSurgeAbility(ctx);
    expect(result.activated).toBe(false);
    expect(ctx.state.terrain).toBeNull();
  });
});

// ===========================================================================
// Integration Scenario 8: Beast Boost chain KOs
// ===========================================================================

describe("Integration: Beast Boost chain", () => {
  it("given Beast Boost with highest Attack stat, KO triggers +1 Attack", () => {
    // Source: Showdown data/abilities.ts -- beastboost: raises highest stat on KO
    // Source: Bulbapedia "Beast Boost" -- "raises the user's highest stat by one stage"
    const attacker = createSyntheticOnFieldPokemon({
      ability: ABILITIES.beastBoost,
      attack: 200,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 150,
      nickname: "Pheromosa",
    });

    const faintedOpponent = createSyntheticOnFieldPokemon({
      currentHp: 0,
      hp: 100,
      nickname: "Rattata",
    });

    const ctx: AbilityContext = {
      pokemon: attacker,
      opponent: faintedOpponent,
      state: createSyntheticBattleState(),
      rng: new SeededRandom(42),
      trigger: TRIGGERS.onAfterMoveUsed,
    };

    const result = handleGen7StatAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects.length).toBe(1);
    // Attack is highest, so Beast Boost raises Attack
    // Source: Showdown -- beastboost: highest stat = attack
    expect(result.effects[0]).toEqual(
      expect.objectContaining({
        effectType: "stat-change",
        stat: "attack",
        stages: 1,
      }),
    );
  });

  it("given Beast Boost with highest Speed stat, KO triggers +1 Speed", () => {
    // Source: Showdown data/abilities.ts -- beastboost checks all 5 battle stats
    const attacker = createSyntheticOnFieldPokemon({
      ability: ABILITIES.beastBoost,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 200,
      nickname: "Kartana",
    });

    const faintedOpponent = createSyntheticOnFieldPokemon({ currentHp: 0, hp: 100 });

    const ctx: AbilityContext = {
      pokemon: attacker,
      opponent: faintedOpponent,
      state: createSyntheticBattleState(),
      rng: new SeededRandom(42),
      trigger: TRIGGERS.onAfterMoveUsed,
    };

    const result = handleGen7StatAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(expect.objectContaining({ stat: "speed", stages: 1 }));
  });

  it("given Beast Boost, opponent not fainted (HP > 0), no activation", () => {
    // Source: Showdown -- beastboost only triggers on KO
    const attacker = createSyntheticOnFieldPokemon({
      ability: ABILITIES.beastBoost,
      attack: 200,
      nickname: "Pheromosa",
    });

    const aliveOpponent = createSyntheticOnFieldPokemon({
      currentHp: 50,
      hp: 100,
      nickname: "Rattata",
    });

    const ctx: AbilityContext = {
      pokemon: attacker,
      opponent: aliveOpponent,
      state: createSyntheticBattleState(),
      rng: new SeededRandom(42),
      trigger: TRIGGERS.onAfterMoveUsed,
    };

    const result = handleGen7StatAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Integration Scenario 9: Disguise break (no HP cost in Gen 7)
// ===========================================================================

describe("Integration: Disguise break (Gen 7 -- no chip damage)", () => {
  it("given Mimikyu with Disguise intact (no disguise-broken volatile), damage is blocked", () => {
    // Source: Showdown data/abilities.ts -- disguise Gen 7: damage set to 0 (no 1/8 chip)
    // Source: Bulbapedia "Disguise" -- "In Gen 7, Disguise completely blocks the damage with no recoil"
    const mimikyu = createSyntheticOnFieldPokemon({
      ability: ABILITIES.disguise,
      types: [TYPES.ghost, TYPES.fairy],
      hp: 200,
      currentHp: 200,
      nickname: "Mimikyu",
      speciesId: SPECIES.mimikyu,
    });
    // No "disguise-broken" volatile means Disguise is still intact

    const ctx: AbilityContext = {
      pokemon: mimikyu,
      opponent: createSyntheticOnFieldPokemon({}),
      state: createSyntheticBattleState(),
      rng: new SeededRandom(42),
      trigger: TRIGGERS.onDamageTaken,
      damage: 150,
      move: createSyntheticMoveFromCanonical(MOVES.shadowBall),
    };

    const result = handleGen7NewAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.messages).toEqual(["Mimikyu's Disguise was busted!"]);
    expect(result.effects).toEqual([
      { effectType: "volatile-inflict", target: "self", volatile: DISGUISE_BROKEN },
      { effectType: "damage-reduction", target: "self" },
    ]);
  });

  it("given Mimikyu with Disguise already broken (has disguise-broken volatile), damage goes through", () => {
    // Source: Showdown -- disguise only activates once per battle; "disguise-broken" volatile persists
    // Stopgap: core exposes the Gen 7 volatile type but not a reference-id constant for it yet.
    const brokenVolatiles = new Map<string, unknown>();
    brokenVolatiles.set(DISGUISE_BROKEN, true);

    const mimikyu = createSyntheticOnFieldPokemon({
      ability: ABILITIES.disguise,
      types: [TYPES.ghost, TYPES.fairy],
      hp: 200,
      currentHp: 200,
      nickname: "Mimikyu",
      speciesId: SPECIES.mimikyu,
      volatileStatuses: brokenVolatiles,
    });

    const ctx: AbilityContext = {
      pokemon: mimikyu,
      opponent: createSyntheticOnFieldPokemon({}),
      state: createSyntheticBattleState(),
      rng: new SeededRandom(42),
      trigger: TRIGGERS.onDamageTaken,
      damage: 150,
      move: createSyntheticMoveFromCanonical(MOVES.shadowBall),
    };

    const result = handleGen7NewAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Integration Scenario 10: Schooling form change
// ===========================================================================

describe("Integration: Schooling form change", () => {
  it("given Wishiwashi with Schooling at level 20+ and HP > 25%, School form is active", () => {
    // Source: Showdown data/abilities.ts -- schooling: level >= 20 && hp >= ceil(maxHp * 0.25)
    // Source: Bulbapedia "Schooling" -- "level 20+, HP above 25%"
    // isSchoolForm(abilityId, currentHp, maxHp, level)
    const result = isSchoolForm(ABILITIES.schooling, 100, 200, 20);
    expect(result).toBe(true);
  });

  it("given Wishiwashi below level 20, Solo form always", () => {
    // Source: Showdown -- schooling: level >= 20 required
    const result = isSchoolForm(ABILITIES.schooling, 200, 200, 19);
    expect(result).toBe(false);
  });

  it("given Wishiwashi at exactly 25% HP (ceil threshold), School form is still active", () => {
    // Source: Showdown data/abilities.ts -- schooling: hp >= Math.ceil(maxHp * 0.25)
    // For maxHp=200: threshold = ceil(200 * 0.25) = ceil(50) = 50
    // At exactly 50 HP: 50 >= 50 is true -> School form
    const result = isSchoolForm(ABILITIES.schooling, 50, 200, 20);
    expect(result).toBe(true);
  });

  it("given Wishiwashi at 1 HP below threshold, reverts to Solo form", () => {
    // Source: Showdown -- below the ceil threshold means Solo form
    // For maxHp=200: threshold = 50. At 49 HP: 49 < 50 -> Solo form
    const result = isSchoolForm(ABILITIES.schooling, 49, 200, 20);
    expect(result).toBe(false);
  });

  it("given Schooling triggers on switch-in, handleGen7NewAbility returns form change", () => {
    // Source: Showdown -- Schooling triggers on switch-in to check form
    const wishiwashi = createSyntheticOnFieldPokemon({
      ability: ABILITIES.schooling,
      types: [TYPES.water],
      hp: 200,
      currentHp: 200,
      level: 20,
      nickname: "Wishiwashi",
      speciesId: SPECIES.wishiwashi,
    });

    const ctx: AbilityContext = {
      pokemon: wishiwashi,
      state: createSyntheticBattleState(),
      rng: new SeededRandom(42),
      trigger: TRIGGERS.onSwitchIn,
    };

    const result = handleGen7NewAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.messages).toEqual(["Wishiwashi formed a school!"]);
  });
});
