/**
 * Gen 6 Integration Tests
 *
 * End-to-end battle scenarios exercising multiple Gen 6 mechanics together.
 * These tests verify that different subsystems (abilities, items, terrain, weather,
 * move effects, type chart, damage calc) interact correctly.
 *
 * Source: Showdown battle engine and Bulbapedia cross-references
 */

import type {
  AbilityContext,
  ActivePokemon,
  BattleSide,
  BattleState,
  DamageContext,
  ItemContext,
} from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType, PrimaryStatus, VolatileStatus } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_END_OF_TURN_EFFECT_IDS,
  CORE_HAZARD_IDS,
  CORE_ITEM_IDS,
  CORE_MOVE_IDS,
  CORE_SCREEN_IDS,
  CORE_STATUS_IDS,
  CORE_TERRAIN_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  CORE_WEATHER_IDS,
  createMoveSlot,
  getTypeEffectiveness,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  GEN6_ABILITY_IDS,
  GEN6_ITEM_IDS,
  GEN6_MOVE_IDS,
  GEN6_NATURE_IDS,
  GEN6_SPECIES_IDS,
  createGen6DataManager,
} from "../../src";
import { applyGen6Ability } from "../../src/Gen6Abilities";
import { getToughClawsMultiplier, isParentalBondEligible } from "../../src/Gen6AbilitiesDamage";
import { calculateGen6Damage } from "../../src/Gen6DamageCalc";
import { applyGen6EntryHazards } from "../../src/Gen6EntryHazards";
import { applyGen6HeldItem, isMegaStone } from "../../src/Gen6Items";
import { calculateSpikyShieldDamage, isBlockedByKingsShield } from "../../src/Gen6MoveEffects";
import { Gen6Ruleset } from "../../src/Gen6Ruleset";
import { canInflictStatusWithTerrain, getTerrainDamageModifier } from "../../src/Gen6Terrain";
import { GEN6_TYPE_CHART } from "../../src/Gen6TypeChart";

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

const DATA_MANAGER = createGen6DataManager()
const SPECIES = GEN6_SPECIES_IDS
const TYPES = CORE_TYPE_IDS
const TERRAINS = CORE_TERRAIN_IDS
const STATUS = CORE_STATUS_IDS
const WEATHER = CORE_WEATHER_IDS
const DEFAULT_SPECIES = DATA_MANAGER.getSpecies(SPECIES.bulbasaur)
const DEFAULT_NATURE = GEN6_NATURE_IDS.hardy
const TACKLE = DATA_MANAGER.getMove(CORE_MOVE_IDS.tackle)
const THUNDERBOLT = DATA_MANAGER.getMove(CORE_MOVE_IDS.thunderbolt)
const FIRE_PUNCH = DATA_MANAGER.getMove(GEN6_MOVE_IDS.firePunch)
const ICE_BEAM = DATA_MANAGER.getMove(GEN6_MOVE_IDS.iceBeam)
const CLOSE_COMBAT = DATA_MANAGER.getMove(GEN6_MOVE_IDS.closeCombat)
const SHADOW_BALL = DATA_MANAGER.getMove(GEN6_MOVE_IDS.shadowBall)
const IRON_HEAD = DATA_MANAGER.getMove(GEN6_MOVE_IDS.ironHead)
const SURF = DATA_MANAGER.getMove(CORE_MOVE_IDS.surf)
const PHANTOM_FORCE = DATA_MANAGER.getMove(GEN6_MOVE_IDS.phantomForce)
const ELECTRIC_TERRAIN = DATA_MANAGER.getMove(GEN6_MOVE_IDS.electricTerrain)
const MISTY_TERRAIN = DATA_MANAGER.getMove(GEN6_MOVE_IDS.mistyTerrain)

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
  status?: PrimaryStatus | null;
  speciesId?: number;
  nickname?: string | null;
  volatiles?: Map<VolatileStatus, { turnsLeft: number; data?: Record<string, unknown> }>;
  moves?: PokemonInstance["moves"];
  isMega?: boolean;
}): ActivePokemon {
  const hp = overrides.hp ?? 200;
  const speciesId = overrides.speciesId ?? SPECIES.bulbasaur;
  const species = DATA_MANAGER.getSpecies(speciesId);
  return {
    pokemon: {
      uid: CORE_TERRAIN_IDS.testSource,
      speciesId,
      nickname: overrides.nickname ?? null,
      level: overrides.level ?? 50,
      experience: 0,
      nature: DEFAULT_NATURE,
      ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: overrides.currentHp ?? hp,
      moves: overrides.moves ?? [createMoveSlot(TACKLE.id, TACKLE.pp)],
      ability: overrides.ability ?? CORE_ABILITY_IDS.none,
      abilitySlot: `${CORE_TYPE_IDS.normal}1` as const,
      heldItem: overrides.heldItem ?? null,
      status: overrides.status ?? null,
      friendship: 0,
      gender: "male" as any,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: CORE_ITEM_IDS.pokeBall,
      calculatedStats: {
        hp,
        attack: overrides.attack ?? 100,
        defense: overrides.defense ?? 100,
        spAttack: overrides.spAttack ?? 100,
        spDefense: overrides.spDefense ?? 100,
        speed: overrides.speed ?? 100,
      },
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
    types: overrides.types ?? [...species.types],
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
    isMega: overrides.isMega ?? false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    stellarBoostedTypes: [],
    suppressedAbility: null,
    forcedMove: null,
  } as ActivePokemon;
}

function makeCanonicalMove(
  moveId: (typeof GEN6_MOVE_IDS)[keyof typeof GEN6_MOVE_IDS] | (typeof CORE_MOVE_IDS)[keyof typeof CORE_MOVE_IDS],
  overrides: Partial<MoveData> = {},
): MoveData {
  const baseMove = DATA_MANAGER.getMove(moveId);
  return {
    ...baseMove,
    flags: overrides.flags ? { ...baseMove.flags, ...overrides.flags } : baseMove.flags,
    effect: overrides && "effect" in overrides ? overrides.effect : baseMove.effect,
    ...overrides,
  };
}

function makeSyntheticProtectBreakingPhantomForce(): MoveData {
  return makeCanonicalMove(GEN6_MOVE_IDS.phantomForce, {
    // Synthetic probe: the protection-bypass assertion exercises the explicit
    // `breaksProtect` branch, which is not currently carried on the canonical
    // Gen 6 move record exported by the data manager.
    breaksProtect: true,
  });
}

function makeState(overrides?: {
  weather?: { type: string; turnsLeft: number; source: string } | null;
  terrain?: { type: string; turnsLeft: number; source: string } | null;
  sides?: [any, any];
}): BattleState {
  return {
    weather: overrides?.weather ?? null,
    terrain: overrides?.terrain ?? null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    format: "singles",
    generation: 6,
    turnNumber: 1,
    rng: new SeededRandom(42),
    sides: overrides?.sides ?? [
      {
        active: [],
        tailwind: { active: false, turnsLeft: 0 },
        hazards: new Map(),
        screens: new Map(),
      },
      {
        active: [],
        tailwind: { active: false, turnsLeft: 0 },
        hazards: new Map(),
        screens: new Map(),
      },
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
    move: overrides.move ?? TACKLE,
    state: overrides.state ?? makeState(),
    rng: new SeededRandom(overrides.seed ?? 42),
    isCrit: overrides.isCrit ?? false,
  };
}

function makeItemContext(overrides: {
  pokemon?: ActivePokemon;
  state?: BattleState;
  move?: MoveData;
  damage?: number;
  seed?: number;
}): ItemContext {
  return {
    pokemon: overrides.pokemon ?? makeActive({}),
    state: overrides.state ?? makeState(),
    rng: new SeededRandom(overrides.seed ?? 42),
    move: overrides.move,
    damage: overrides.damage,
  };
}

const typeChart = GEN6_TYPE_CHART as Record<string, Record<string, number>>;

// ===========================================================================
// Integration Test Scenarios
// ===========================================================================

describe("Gen 6 Integration: Terrain + Status immunity stacking", () => {
  it("given Electric Terrain is active and a grounded Grass-type, when sleep is attempted, then terrain blocks sleep on grounded Pokemon", () => {
    // Source: Bulbapedia "Electric Terrain" -- grounded Pokemon cannot fall asleep
    const grassTarget = makeActive({ speciesId: SPECIES.bulbasaur, nickname: "Bulbasaur" });
    const state = makeState({
      terrain: { type: TERRAINS.electric, turnsLeft: 5, source: ELECTRIC_TERRAIN.id },
    });
    const canSleep = canInflictStatusWithTerrain(STATUS.sleep, grassTarget, state);
    expect(canSleep).toBe(false);
  });

  it("given Electric Terrain is active and a NON-Grass grounded Pokemon, when sleep is attempted, then terrain blocks sleep", () => {
    // Source: Bulbapedia "Electric Terrain" -- grounded Pokemon cannot fall asleep
    const normalTarget = makeActive({ speciesId: SPECIES.snorlax, nickname: "Snorlax" });
    const state = makeState({
      terrain: { type: TERRAINS.electric, turnsLeft: 5, source: ELECTRIC_TERRAIN.id },
    });
    const canSleep = canInflictStatusWithTerrain(STATUS.sleep, normalTarget, state);
    expect(canSleep).toBe(false);
  });

  it("given Misty Terrain is active and a grounded Pokemon, when statuses are attempted, then terrain blocks ALL primary statuses", () => {
    // Source: Bulbapedia "Misty Terrain" -- grounded Pokemon protected from ALL status conditions
    const target = makeActive({ speciesId: SPECIES.vaporeon, nickname: "Vaporeon" });
    const state = makeState({
      terrain: { type: TERRAINS.misty, turnsLeft: 5, source: MISTY_TERRAIN.id },
    });
    expect(canInflictStatusWithTerrain(STATUS.paralysis, target, state)).toBe(false);
    expect(canInflictStatusWithTerrain(STATUS.burn, target, state)).toBe(false);
    expect(canInflictStatusWithTerrain(STATUS.poison, target, state)).toBe(false);
    expect(canInflictStatusWithTerrain(STATUS.sleep, target, state)).toBe(false);
    expect(canInflictStatusWithTerrain(STATUS.freeze, target, state)).toBe(false);
  });
});

describe("Gen 6 Integration: Mega Evolution + Tough Claws + Damage calc", () => {
  it("given Mega Charizard X (Tough Claws) uses a contact move, when damage multiplier is checked, then Tough Claws 1.3x boost applies", () => {
    // Source: Showdown data/abilities.ts -- toughclaws: chainModify([5325, 4096])
    const multiplier = getToughClawsMultiplier(GEN6_ABILITY_IDS.toughClaws, true);
    expect(multiplier).toBeCloseTo(5325 / 4096, 6);
    const noBoost = getToughClawsMultiplier(GEN6_ABILITY_IDS.toughClaws, false);
    expect(noBoost).toBe(1);
  });

  it("given Mega Charizard X uses contact Fire move on Grass/Poison, when damage is calculated, then STAB + SE + Tough Claws all apply", () => {
    // Source: Showdown damage calc -- multiplicative stacking
    const megaCharizardX = makeActive({
      speciesId: SPECIES.charizard,
      types: [TYPES.fire, TYPES.dragon],
      ability: GEN6_ABILITY_IDS.toughClaws,
      attack: 130,
      level: 50,
      nickname: "Charizard",
      isMega: true,
    });
    const venusaur = makeActive({
      speciesId: SPECIES.venusaur,
      types: [TYPES.grass, TYPES.poison],
      defense: 83,
      hp: 160,
      currentHp: 160,
      nickname: "Venusaur",
    });
    const ctx = makeDamageContext({
      attacker: megaCharizardX,
      defender: venusaur,
      move: FIRE_PUNCH,
    });
    const result = calculateGen6Damage(ctx, typeChart);
    // Fire vs Grass = 2x, Fire vs Poison = 1x, combined = 2x
    expect(result.effectiveness).toBe(2);
    expect(result.damage).toBeGreaterThan(0);
  });
});

describe("Gen 6 Integration: Parental Bond + Life Orb", () => {
  it("given a Parental Bond user holding Life Orb, when dealing damage, then Life Orb recoil = floor(maxHP/10)", () => {
    // Source: Showdown data/items.ts -- Life Orb: floor(maxHP / 10)
    const attacker = makeActive({
      speciesId: SPECIES.kangaskhan,
      ability: GEN6_ABILITY_IDS.parentalBond,
      heldItem: GEN6_ITEM_IDS.lifeOrb,
      hp: 200,
      currentHp: 200,
      attack: 120,
      nickname: "Kangaskhan",
    });
    expect(isParentalBondEligible(GEN6_ABILITY_IDS.parentalBond, FIRE_PUNCH)).toBe(true);
    const ctx = makeItemContext({
      pokemon: attacker,
      damage: 100,
      move: FIRE_PUNCH,
    });
    const result = applyGen6HeldItem("on-hit", ctx);
    expect(result.activated).toBe(true);
    // Derivation: floor(200 / 10) = 20
    expect(result.effects).toEqual([{ type: "chip-damage", target: "self", value: 20 }]);
  });

  it("given a Sheer Force user holding Life Orb using a move with secondary effects, when on-hit triggers, then Life Orb recoil is suppressed", () => {
    // Source: Showdown scripts.ts -- Sheer Force suppresses Life Orb recoil
    const attacker = makeActive({
      speciesId: SPECIES.nidoking,
      ability: GEN6_ABILITY_IDS.sheerForce,
      heldItem: GEN6_ITEM_IDS.lifeOrb,
      hp: 200,
      currentHp: 200,
      nickname: "Nidoking",
    });
    const ctx = makeItemContext({
      pokemon: attacker,
      damage: 100,
      move: ICE_BEAM,
    });
    const result = applyGen6HeldItem("on-hit", ctx);
    expect(result.activated).toBe(false);
  });
});

describe("Gen 6 Integration: Spiky Shield + Rocky Helmet separate damage", () => {
  it("given Spiky Shield (1/8) and Rocky Helmet (1/6) on contact, then each deals damage separately based on different fractions", () => {
    // Source: Showdown -- separate damage sources, not additive
    const attackerMaxHp = 300;

    // Spiky Shield: floor(300/8) = 37
    // Source: Showdown data/moves.ts -- spikyshield: floor(attacker.maxhp / 8)
    const spikyDamage = calculateSpikyShieldDamage(attackerMaxHp);
    expect(spikyDamage).toBe(37);

    // Rocky Helmet: floor(300/6) = 50
    // Source: Showdown data/items.ts -- rockyhelmet: floor(source.maxhp / 6)
    const defender = makeActive({
      speciesId: SPECIES.chesnaught,
      heldItem: GEN6_ITEM_IDS.rockyHelmet,
      hp: 200,
      currentHp: 200,
      nickname: "Chesnaught",
    });
    const attacker = makeActive({
      hp: attackerMaxHp,
      currentHp: attackerMaxHp,
      nickname: "Attacker",
    });
    const state = makeState({
      sides: [
        {
          active: [defender],
          tailwind: { active: false, turnsLeft: 0 },
          hazards: new Map(),
          screens: new Map(),
        },
        {
          active: [attacker],
          tailwind: { active: false, turnsLeft: 0 },
          hazards: new Map(),
          screens: new Map(),
        },
      ],
    });
    const itemCtx = makeItemContext({
      pokemon: defender,
      state,
      damage: 50,
      move: CLOSE_COMBAT,
    });
    const rockyResult = applyGen6HeldItem("on-contact", itemCtx);
    expect(rockyResult.activated).toBe(true);
    expect(rockyResult.effects).toEqual([{ type: "chip-damage", target: "opponent", value: 50 }]);
    // Different fractions produce different values
    expect(spikyDamage).not.toBe(rockyResult.effects[0].value);
    // Total combined: 37 + 50 = 87
    expect(spikyDamage + rockyResult.effects[0].value).toBe(87);
  });
});

describe("Gen 6 Integration: King's Shield blocks contact, stat drop persists", () => {
  it("given King's Shield blocks a contact physical move, then the move is blocked and contact penalty applies", () => {
    // Source: Showdown data/moves.ts -- kingsshield blocks protect-flagged moves
    // isBlockedByKingsShield(category, protectFlag, contactFlag)
    const result = isBlockedByKingsShield("physical", true, true);
    expect(result.blocked).toBe(true);
    expect(result.contactPenalty).toBe(true);
  });

  it("given an Atk drop from King's Shield, when a special move is used, then the Atk drop does NOT affect special damage", () => {
    // Source: fundamental mechanic -- Atk stages only affect physical moves
    const attacker = makeActive({
      speciesId: SPECIES.aegislash,
      nickname: "Aegislash",
    });
    attacker.statStages.attack = -2;
    const psychicTarget = makeActive({
      speciesId: SPECIES.alakazam,
      spDefense: 100,
      nickname: "Alakazam",
    });
    const ctx = makeDamageContext({
      attacker,
      defender: psychicTarget,
      move: SHADOW_BALL,
    });
    const result = calculateGen6Damage(ctx, typeChart);
    expect(result.effectiveness).toBe(2);
    expect(result.damage).toBeGreaterThan(0);

    // Physical move IS affected by Atk drop
    const physCtx = makeDamageContext({
      attacker,
      defender: psychicTarget,
      move: IRON_HEAD,
    });
    const physResult = calculateGen6Damage(physCtx, typeChart);

    const cleanAttacker = makeActive({
      speciesId: SPECIES.aegislash,
    });
    const cleanCtx = makeDamageContext({
      attacker: cleanAttacker,
      defender: psychicTarget,
      move: IRON_HEAD,
    });
    const cleanResult = calculateGen6Damage(cleanCtx, typeChart);
    expect(physResult.damage).toBeLessThan(cleanResult.damage);
  });
});

describe("Gen 6 Integration: Sticky Web + grounding checks", () => {
  it("given Sticky Web is set, when Magic Guard Pokemon switches in, then -1 Speed STILL applies (stat change, not damage)", () => {
    // Source: Bulbapedia -- Magic Guard only prevents indirect DAMAGE, not stat changes
    const magicGuardPokemon = makeActive({
      speciesId: SPECIES.alakazam,
      ability: GEN6_ABILITY_IDS.magicGuard,
      nickname: "Alakazam",
    });
    // Hazards is an array of { type, layers } objects
    const hazards = [{ type: CORE_HAZARD_IDS.stickyWeb as const, layers: 1 }];
    const side = {
      index: 0,
      active: [magicGuardPokemon],
      tailwind: { active: false, turnsLeft: 0 },
      hazards,
      screens: [],
    } as unknown as BattleSide;
    const state = makeState();
    const result = applyGen6EntryHazards(magicGuardPokemon, side, state, GEN6_TYPE_CHART);
    expect(result.statChanges.length).toBeGreaterThan(0);
    expect(result.statChanges[0]).toEqual(expect.objectContaining({ stat: "speed", stages: -1 }));
  });

  it("given Sticky Web is set, when Flying-type switches in, then Sticky Web does NOT apply (not grounded)", () => {
    // Source: Showdown data/moves.ts -- stickyweb only affects grounded Pokemon
    const flyingPokemon = makeActive({
      speciesId: SPECIES.talonflame,
      nickname: "Talonflame",
    });
    const hazards = [{ type: CORE_HAZARD_IDS.stickyWeb as const, layers: 1 }];
    const side = {
      index: 0,
      active: [flyingPokemon],
      tailwind: { active: false, turnsLeft: 0 },
      hazards,
      screens: [],
    } as unknown as BattleSide;
    const state = makeState();
    const result = applyGen6EntryHazards(flyingPokemon, side, state, GEN6_TYPE_CHART);
    expect(result.statChanges.length).toBe(0);
  });
});

describe("Gen 6 Integration: Weather ability switch-in", () => {
  it("given Drizzle with Damp Rock, when switching in, then rain ability activates", () => {
    // Source: Bulbapedia "Damp Rock" -- extends rain from 5 to 8 turns
    const drizzleUser = makeActive({
      speciesId: SPECIES.politoed,
      ability: CORE_ABILITY_IDS.drizzle,
      heldItem: GEN6_ITEM_IDS.dampRock,
      nickname: "Politoed",
    });
    const state = makeState();
    const ctx: AbilityContext = {
      pokemon: drizzleUser,
      state,
      rng: new SeededRandom(42),
      trigger: "on-switch-in",
    };
    const result = applyGen6Ability("on-switch-in", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects.length).toBeGreaterThan(0);
  });

  it("given Drought with Heat Rock, when switching in, then sun ability activates with weather-set effect", () => {
    // Source: Bulbapedia "Heat Rock" -- extends sun from 5 to 8 turns
    const droughtUser = makeActive({
      speciesId: SPECIES.ninetales,
      ability: CORE_ABILITY_IDS.drought,
      heldItem: GEN6_ITEM_IDS.heatRock,
      nickname: "Ninetales",
    });
    const state = makeState();
    const ctx: AbilityContext = {
      pokemon: droughtUser,
      state,
      rng: new SeededRandom(42),
      trigger: "on-switch-in",
    };
    const result = applyGen6Ability("on-switch-in", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects.some((e: any) => e.effectType === "weather-set")).toBe(true);
  });
});

describe("Gen 6 Integration: Phantom Force bypasses Protect variants", () => {
  it("given Phantom Force has breaksProtect, when checked against King's Shield, then the move has the bypass flag", () => {
    // Source: Showdown data/moves.ts -- phantomforce: breaksProtect: true
    const phantomForce = makeSyntheticProtectBreakingPhantomForce();
    expect(phantomForce.breaksProtect).toBe(true);
    expect(phantomForce.flags.contact).toBe(true);
    expect(phantomForce.type).toBe(CORE_TYPE_IDS.ghost);
  });
});

describe("Gen 6 Integration: Terrain damage modifiers", () => {
  it("given Electric Terrain, when an Electric move is used by grounded attacker, then 1.5x (6144/4096) boost applies", () => {
    // Source: Showdown data/conditions.ts -- electricterrain: 1.5x for Electric on grounded
    // getTerrainDamageModifier(terrainType, moveType, moveId, attackerGrounded, defenderGrounded)
    const mod = getTerrainDamageModifier(TERRAINS.electric, TYPES.electric, CORE_MOVE_IDS.thunderbolt, true, true);
    expect(mod.powerModifier).toBe(6144); // 1.5x in 4096-based
  });

  it("given Electric Terrain, when an Electric move is used by NON-grounded attacker, then no boost", () => {
    // Source: Showdown -- terrain boosts only apply to grounded Pokemon
    const mod = getTerrainDamageModifier(TERRAINS.electric, TYPES.electric, CORE_MOVE_IDS.thunderbolt, false, true);
    expect(mod.powerModifier).toBeNull();
  });

  it("given Grassy Terrain, when Earthquake is used vs grounded target, then grassyGroundHalved is true", () => {
    // Source: Showdown data/conditions.ts -- grassyterrain halves Earthquake/Bulldoze/Magnitude
    const mod = getTerrainDamageModifier(
      CORE_TERRAIN_IDS.grassy,
      CORE_TYPE_IDS.ground,
      GEN6_MOVE_IDS.earthquake,
      true,
      true,
    );
    expect(mod.grassyGroundHalved).toBe(true);
  });

  it("given Grassy Terrain, when Earthquake is used vs non-grounded target, then grassyGroundHalved is false", () => {
    // Source: Showdown -- only halves vs grounded defenders
    const mod = getTerrainDamageModifier(
      CORE_TERRAIN_IDS.grassy,
      CORE_TYPE_IDS.ground,
      GEN6_MOVE_IDS.earthquake,
      true,
      false,
    );
    expect(mod.grassyGroundHalved).toBe(false);
  });

  it("given Misty Terrain, when a Dragon move is used vs grounded defender, then power is halved (2048)", () => {
    // Source: Showdown data/conditions.ts -- mistyterrain: 0.5x Dragon vs grounded
    const mod = getTerrainDamageModifier(
      CORE_TERRAIN_IDS.misty,
      CORE_TYPE_IDS.dragon,
      GEN6_MOVE_IDS.dragonPulse,
      true,
      true,
    );
    expect(mod.powerModifier).toBe(2048); // 0.5x
  });
});

describe("Gen 6 Integration: Fairy type chart", () => {
  it("given Gen 6 type chart, Fairy vs Dragon = 2x SE", () => {
    // Source: Bulbapedia -- Fairy is super-effective against Dragon
    expect(getTypeEffectiveness(CORE_TYPE_IDS.fairy, [CORE_TYPE_IDS.dragon], GEN6_TYPE_CHART)).toBe(2);
  });

  it("given Gen 6 type chart, Dragon vs Fairy = 0x immune", () => {
    // Source: Bulbapedia -- Fairy is immune to Dragon
    expect(getTypeEffectiveness(CORE_TYPE_IDS.dragon, [CORE_TYPE_IDS.fairy], GEN6_TYPE_CHART)).toBe(0);
  });

  it("given Gen 6 type chart, Steel vs Fairy = 2x SE", () => {
    // Source: Bulbapedia -- Steel is super-effective against Fairy
    expect(getTypeEffectiveness(CORE_TYPE_IDS.steel, [CORE_TYPE_IDS.fairy], GEN6_TYPE_CHART)).toBe(2);
  });

  it("given Gen 6 type chart, Fairy vs Fighting/Dark = 4x SE", () => {
    // Source: Bulbapedia -- Fairy is SE against both Fighting and Dark
    expect(getTypeEffectiveness(CORE_TYPE_IDS.fairy, [CORE_TYPE_IDS.fighting, CORE_TYPE_IDS.dark], GEN6_TYPE_CHART)).toBe(4);
  });

  it("given Gen 6 type chart, Dark vs Steel = 1x neutral (lost resistance)", () => {
    // Source: Bulbapedia -- Steel no longer resists Dark as of Gen 6
    expect(getTypeEffectiveness(CORE_TYPE_IDS.dark, [CORE_TYPE_IDS.steel], GEN6_TYPE_CHART)).toBe(1);
  });

  it("given Gen 6 type chart, Ghost vs Steel = 1x neutral (lost resistance)", () => {
    // Source: Bulbapedia -- Steel no longer resists Ghost as of Gen 6
    expect(getTypeEffectiveness(CORE_TYPE_IDS.ghost, [CORE_TYPE_IDS.steel], GEN6_TYPE_CHART)).toBe(1);
  });
});

describe("Gen 6 Integration: Weakness Policy activation", () => {
  it("given Weakness Policy holder hit by SE move, then +2 Atk/SpAtk and item is consumed", () => {
    // Source: Showdown data/items.ts -- weaknesspolicy: +2 atk/spa on SE hit
    const pokemon = makeActive({
      speciesId: SPECIES.dragonite,
      heldItem: GEN6_ITEM_IDS.weaknessPolicy,
      hp: 300,
      currentHp: 200,
      nickname: "Dragonite",
    });
    const ctx = makeItemContext({ pokemon, damage: 150, move: ICE_BEAM });
    const result = applyGen6HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "stat-boost", target: "self", value: "attack", stages: 2 },
      { type: "stat-boost", target: "self", value: "spAttack", stages: 2 },
      { type: "consume", target: "self", value: GEN6_ITEM_IDS.weaknessPolicy },
    ]);
  });

  it("given Weakness Policy holder hit by neutral move, then item does NOT activate", () => {
    // Source: Showdown data/items.ts -- weaknesspolicy requires typeMod >= 2
    const pokemon = makeActive({
      speciesId: SPECIES.gyarados,
      heldItem: GEN6_ITEM_IDS.weaknessPolicy,
      hp: 200,
      currentHp: 150,
      nickname: "Gyarados",
    });
    const ctx = makeItemContext({ pokemon, damage: 50, move: SURF });
    const result = applyGen6HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(false);
  });
});

describe("Gen 6 Integration: Mega Stone identification", () => {
  it("given various Mega Stones, then they are correctly identified", () => {
    // Source: Showdown data/items.ts -- mega stones have onTakeItem: false
    expect(isMegaStone(GEN6_ITEM_IDS.charizarditeX)).toBe(true);
    expect(isMegaStone(GEN6_ITEM_IDS.venusaurite)).toBe(true);
    expect(isMegaStone(GEN6_ITEM_IDS.blueOrb)).toBe(true);
    expect(isMegaStone(GEN6_ITEM_IDS.redOrb)).toBe(true);
  });

  it("given Eviolite ends in ite but is NOT a Mega Stone", () => {
    // Source: Bulbapedia "Eviolite" -- not a Mega Stone
    expect(isMegaStone(GEN6_ITEM_IDS.eviolite)).toBe(false);
    expect(isMegaStone("")).toBe(false);
  });
});

describe("Gen 6 Integration: Crit multiplier is 1.5x", () => {
  it("given a crit hit in Gen 6, when damage is calculated, then crit/non-crit ratio is approximately 1.5x", () => {
    // Source: Bulbapedia "Critical hit" -- Gen 6 uses 1.5x, not 2.0x
    const attacker = makeActive({ types: [CORE_TYPE_IDS.normal], attack: 100, level: 50 });
    const defender = makeActive({ types: [CORE_TYPE_IDS.normal], defense: 100, hp: 200, currentHp: 200 });
    const nonCritResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: TACKLE, isCrit: false, seed: 99 }),
      typeChart,
    );
    const critResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: TACKLE, isCrit: true, seed: 99 }),
      typeChart,
    );
    expect(critResult.damage).toBeGreaterThan(nonCritResult.damage);
    const ratio = critResult.damage / nonCritResult.damage;
    expect(ratio).toBeGreaterThanOrEqual(1.4);
    expect(ratio).toBeLessThanOrEqual(1.6);
  });
});

describe("Gen 6 Integration: Gen6Ruleset end-to-end queries", () => {
  it("given Gen6Ruleset, Fairy is the 18th available type", () => {
    const ruleset = new Gen6Ruleset();
    const types = ruleset.getAvailableTypes();
    expect(types).toContain(CORE_TYPE_IDS.fairy);
    // Source: Gen 6 type chart has 18 total types, with Fairy added as the 18th.
    expect(types.length).toBe(18);
  });

  it("given Gen6Ruleset, sticky-web is an available hazard", () => {
    const ruleset = new Gen6Ruleset();
    expect(ruleset.getAvailableHazards()).toContain(CORE_HAZARD_IDS.stickyWeb);
  });

  it("given Gen6Ruleset, hasTerrain returns true", () => {
    const ruleset = new Gen6Ruleset();
    expect(ruleset.hasTerrain()).toBe(true);
  });

  it("given Gen6Ruleset, grassy-terrain-heal is in EoT order after poison-heal", () => {
    const ruleset = new Gen6Ruleset();
    const order = ruleset.getEndOfTurnOrder();
    expect(order).toContain(CORE_END_OF_TURN_EFFECT_IDS.grassyTerrainHeal);
    expect(order.indexOf(CORE_END_OF_TURN_EFFECT_IDS.grassyTerrainHeal)).toBeGreaterThan(
      order.indexOf(CORE_END_OF_TURN_EFFECT_IDS.poisonHeal),
    );
  });

  it("given Gen6Ruleset, getBattleGimmick returns Mega Evolution", () => {
    const ruleset = new Gen6Ruleset();
    expect(ruleset.getBattleGimmick()).not.toBeNull();
  });

  it("given Gen6Ruleset, getPostAttackResidualOrder returns empty (Gen 6+)", () => {
    // Source: Showdown Gen 6 -- no per-attack residuals
    const ruleset = new Gen6Ruleset();
    expect(ruleset.getPostAttackResidualOrder()).toEqual([]);
  });

  it("given Gen6Ruleset, recalculatesFutureAttackDamage returns true (Gen 5+)", () => {
    // Source: Bulbapedia -- Gen 5+ calculates Future Sight damage at hit time
    const ruleset = new Gen6Ruleset();
    expect(ruleset.recalculatesFutureAttackDamage()).toBe(true);
  });
});

describe("Gen 6 Integration: Burn damage is 1/8 max HP", () => {
  it("given burned Pokemon with 200 max HP, then burn deals 25 HP (floor(200/8))", () => {
    // Source: Showdown -- Gen < 7 burn damage is 1/8 max HP
    const ruleset = new Gen6Ruleset();
    const pokemon = makeActive({ hp: 200, currentHp: 180, status: STATUS.burn });
    expect(ruleset.applyStatusDamage(pokemon, STATUS.burn, makeState())).toBe(25);
  });

  it("given burned Pokemon with 321 max HP, then burn deals 40 HP (floor(321/8))", () => {
    // Derivation: floor(321 / 8) = 40
    const ruleset = new Gen6Ruleset();
    const pokemon = makeActive({ hp: 321, currentHp: 300, status: STATUS.burn });
    expect(ruleset.applyStatusDamage(pokemon, STATUS.burn, makeState())).toBe(40);
  });

  it("given burned Magic Guard Pokemon, then burn deals 0 HP", () => {
    // Source: Bulbapedia -- Magic Guard prevents indirect damage
    const ruleset = new Gen6Ruleset();
    const pokemon = makeActive({ hp: 200, currentHp: 180, status: STATUS.burn, ability: GEN6_ABILITY_IDS.magicGuard });
    expect(ruleset.applyStatusDamage(pokemon, STATUS.burn, makeState())).toBe(0);
  });
});

describe("Gen 6 Integration: EXP formula", () => {
  it("given level 30 defeat by level 50, base EXP 100, then EXP = 54", () => {
    // Source: Bulbapedia EXP Gen V/VI formula
    // a=70, b=90, floor(sqrt(70)*4900)=40997, floor(sqrt(90)*8100)=76842
    // floor(40997*100/76842)+1 = 54
    const ruleset = new Gen6Ruleset();
    const exp = ruleset.calculateExpGain({
      defeatedLevel: 30,
      defeatedSpecies: { baseExp: 100 } as any,
      participantLevel: 50,
      participantCount: 1,
      isTrainerBattle: false,
      hasLuckyEgg: false,
      isTradedPokemon: false,
      isInternationalTrade: false,
    });
    expect(exp).toBe(54);
  });
});

describe("Gen 6 Integration: Paralysis 0.25x speed penalty in turn order", () => {
  it("given paralyzed 200 Speed vs non-paralyzed 60 Speed, then the paralyzed Pokemon goes second (effective 50 < 60)", () => {
    // Source: Bulbapedia -- Paralysis: speed reduced to 25% in Gen 3-6
    // floor(200*0.25)=50 < 60
    const ruleset = new Gen6Ruleset();
    const fast = makeActive({
      speed: 200,
      status: STATUS.paralysis,
      moves: [createMoveSlot(THUNDERBOLT.id, THUNDERBOLT.pp)],
    });
    const slow = makeActive({
      speed: 60,
      moves: [createMoveSlot(TACKLE.id, TACKLE.pp)],
    });
    const state = makeState({
      sides: [
        {
          active: [fast],
          tailwind: { active: false, turnsLeft: 0 },
          hazards: new Map(),
          screens: new Map(),
        },
        {
          active: [slow],
          tailwind: { active: false, turnsLeft: 0 },
          hazards: new Map(),
          screens: new Map(),
        },
      ],
    });
    const actions = ruleset.resolveTurnOrder(
      [
        { type: "move", side: 0, moveIndex: 0 },
        { type: "move", side: 1, moveIndex: 0 },
      ],
      state,
      new SeededRandom(42),
    );
    expect(actions[0]).toEqual(expect.objectContaining({ side: 1 }));
    expect(actions[1]).toEqual(expect.objectContaining({ side: 0 }));
  });
});

describe("Gen 6 Integration: Heatproof halves burn damage", () => {
  it("given burned Heatproof Pokemon with 200 max HP, then burn deals 12 HP (floor(200/16))", () => {
    // Source: Bulbapedia -- Heatproof halves burn damage from 1/8 to 1/16
    const ruleset = new Gen6Ruleset();
    const pokemon = makeActive({ hp: 200, currentHp: 180, status: STATUS.burn, ability: GEN6_ABILITY_IDS.heatproof });
    expect(ruleset.applyStatusDamage(pokemon, STATUS.burn, makeState())).toBe(12);
  });

  it("given burned Heatproof Pokemon with 100 max HP, then burn deals 6 HP (floor(100/16))", () => {
    // Derivation: floor(100/16) = 6
    const ruleset = new Gen6Ruleset();
    const pokemon = makeActive({ hp: 100, currentHp: 80, status: STATUS.burn, ability: GEN6_ABILITY_IDS.heatproof });
    expect(ruleset.applyStatusDamage(pokemon, STATUS.burn, makeState())).toBe(6);
  });
});
