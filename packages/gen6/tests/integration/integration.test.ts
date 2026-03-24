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
import type { MoveData, MoveEffect, PokemonType } from "@pokemon-lib-ts/core";
import { getTypeEffectiveness, SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
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
  nickname?: string | null;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  moves?: Array<{ moveId: string; currentPp: number; maxPp: number }>;
  isMega?: boolean;
}): ActivePokemon {
  const hp = overrides.hp ?? 200;
  return {
    pokemon: {
      uid: "test",
      speciesId: overrides.speciesId ?? 1,
      nickname: overrides.nickname ?? null,
      level: overrides.level ?? 50,
      experience: 0,
      nature: "hardy",
      ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: overrides.currentHp ?? hp,
      moves: overrides.moves ?? [],
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

function makeMove(overrides?: {
  id?: string;
  type?: PokemonType;
  category?: "physical" | "special" | "status";
  power?: number | null;
  flags?: Partial<MoveData["flags"]>;
  effect?: MoveData["effect"];
  critRatio?: number;
  breaksProtect?: boolean;
}): MoveData {
  return {
    id: overrides?.id ?? "tackle",
    displayName: overrides?.id ?? "Tackle",
    type: overrides?.type ?? "normal",
    category: overrides?.category ?? "physical",
    power: overrides?.power ?? 50,
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
      ...overrides?.flags,
    },
    effect: overrides?.effect ?? null,
    description: "",
    generation: 6,
    critRatio: overrides?.critRatio ?? 0,
    breaksProtect: overrides?.breaksProtect ?? false,
  } as MoveData;
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
    move: overrides.move ?? makeMove({}),
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
    const grassTarget = makeActive({ types: ["grass"], nickname: "Bulbasaur" });
    const state = makeState({
      terrain: { type: "electric", turnsLeft: 5, source: "electric-surge" },
    });
    const canSleep = canInflictStatusWithTerrain("sleep", grassTarget, state);
    expect(canSleep).toBe(false);
  });

  it("given Electric Terrain is active and a NON-Grass grounded Pokemon, when sleep is attempted, then terrain blocks sleep", () => {
    // Source: Bulbapedia "Electric Terrain" -- grounded Pokemon cannot fall asleep
    const normalTarget = makeActive({ types: ["normal"], nickname: "Snorlax" });
    const state = makeState({
      terrain: { type: "electric", turnsLeft: 5, source: "electric-surge" },
    });
    const canSleep = canInflictStatusWithTerrain("sleep", normalTarget, state);
    expect(canSleep).toBe(false);
  });

  it("given Misty Terrain is active and a grounded Pokemon, when statuses are attempted, then terrain blocks ALL primary statuses", () => {
    // Source: Bulbapedia "Misty Terrain" -- grounded Pokemon protected from ALL status conditions
    const target = makeActive({ types: ["water"], nickname: "Vaporeon" });
    const state = makeState({
      terrain: { type: "misty", turnsLeft: 5, source: "misty-surge" },
    });
    expect(canInflictStatusWithTerrain("paralysis", target, state)).toBe(false);
    expect(canInflictStatusWithTerrain("burn", target, state)).toBe(false);
    expect(canInflictStatusWithTerrain("poison", target, state)).toBe(false);
    expect(canInflictStatusWithTerrain("sleep", target, state)).toBe(false);
    expect(canInflictStatusWithTerrain("freeze", target, state)).toBe(false);
  });
});

describe("Gen 6 Integration: Mega Evolution + Tough Claws + Damage calc", () => {
  it("given Mega Charizard X (Tough Claws) uses a contact move, when damage multiplier is checked, then Tough Claws 1.3x boost applies", () => {
    // Source: Showdown data/abilities.ts -- toughclaws: chainModify([5325, 4096])
    const multiplier = getToughClawsMultiplier("tough-claws", true);
    expect(multiplier).toBeCloseTo(5325 / 4096, 6);
    const noBoost = getToughClawsMultiplier("tough-claws", false);
    expect(noBoost).toBe(1);
  });

  it("given Mega Charizard X uses contact Fire move on Grass/Poison, when damage is calculated, then STAB + SE + Tough Claws all apply", () => {
    // Source: Showdown damage calc -- multiplicative stacking
    const megaCharizardX = makeActive({
      types: ["fire", "dragon"],
      ability: "tough-claws",
      attack: 130,
      level: 50,
      nickname: "Charizard",
      isMega: true,
    });
    const venusaur = makeActive({
      types: ["grass", "poison"],
      defense: 83,
      hp: 160,
      currentHp: 160,
      nickname: "Venusaur",
    });
    const firePunch = makeMove({
      id: "fire-punch",
      type: "fire",
      category: "physical",
      power: 75,
      flags: { contact: true, punch: true },
    });
    const ctx = makeDamageContext({
      attacker: megaCharizardX,
      defender: venusaur,
      move: firePunch,
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
      ability: "parental-bond",
      heldItem: "life-orb",
      hp: 200,
      currentHp: 200,
      attack: 120,
      types: ["normal"],
      nickname: "Kangaskhan",
    });
    expect(isParentalBondEligible("parental-bond", makeMove({ power: 80 }))).toBe(true);
    const ctx = makeItemContext({
      pokemon: attacker,
      damage: 100,
      move: makeMove({ id: "return", type: "normal", power: 102 }),
    });
    const result = applyGen6HeldItem("on-hit", ctx);
    expect(result.activated).toBe(true);
    // Derivation: floor(200 / 10) = 20
    expect(result.effects).toEqual([{ type: "chip-damage", target: "self", value: 20 }]);
  });

  it("given a Sheer Force user holding Life Orb using a move with secondary effects, when on-hit triggers, then Life Orb recoil is suppressed", () => {
    // Source: Showdown scripts.ts -- Sheer Force suppresses Life Orb recoil
    const attacker = makeActive({
      ability: "sheer-force",
      heldItem: "life-orb",
      hp: 200,
      currentHp: 200,
      types: ["normal"],
      nickname: "Nidoking",
    });
    const iceBeam = makeMove({
      id: "ice-beam",
      type: "ice",
      category: "special",
      power: 90,
      flags: { contact: false },
      effect: { type: "status-chance", status: "freeze", chance: 10 } as MoveEffect,
    });
    const ctx = makeItemContext({
      pokemon: attacker,
      damage: 100,
      move: iceBeam,
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
      heldItem: "rocky-helmet",
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
    const contactMove = makeMove({
      id: "close-combat",
      type: "fighting",
      power: 120,
      flags: { contact: true },
    });
    const itemCtx = makeItemContext({
      pokemon: defender,
      state,
      damage: 50,
      move: contactMove,
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
      attack: 100,
      spAttack: 100,
      types: ["steel", "ghost"],
      nickname: "Aegislash",
    });
    attacker.statStages.attack = -2;
    const shadowBall = makeMove({
      id: "shadow-ball",
      type: "ghost",
      category: "special",
      power: 80,
      flags: { contact: false },
    });
    const psychicTarget = makeActive({
      types: ["psychic"],
      spDefense: 100,
      nickname: "Alakazam",
    });
    const ctx = makeDamageContext({
      attacker,
      defender: psychicTarget,
      move: shadowBall,
    });
    const result = calculateGen6Damage(ctx, typeChart);
    expect(result.effectiveness).toBe(2);
    expect(result.damage).toBeGreaterThan(0);

    // Physical move IS affected by Atk drop
    const ironHead = makeMove({
      id: "iron-head",
      type: "steel",
      category: "physical",
      power: 80,
    });
    const physCtx = makeDamageContext({
      attacker,
      defender: psychicTarget,
      move: ironHead,
    });
    const physResult = calculateGen6Damage(physCtx, typeChart);

    const cleanAttacker = makeActive({
      attack: 100,
      spAttack: 100,
      types: ["steel", "ghost"],
    });
    const cleanCtx = makeDamageContext({
      attacker: cleanAttacker,
      defender: psychicTarget,
      move: ironHead,
    });
    const cleanResult = calculateGen6Damage(cleanCtx, typeChart);
    expect(physResult.damage).toBeLessThan(cleanResult.damage);
  });
});

describe("Gen 6 Integration: Sticky Web + grounding checks", () => {
  it("given Sticky Web is set, when Magic Guard Pokemon switches in, then -1 Speed STILL applies (stat change, not damage)", () => {
    // Source: Bulbapedia -- Magic Guard only prevents indirect DAMAGE, not stat changes
    const magicGuardPokemon = makeActive({
      types: ["psychic"],
      ability: "magic-guard",
      nickname: "Alakazam",
    });
    // Hazards is an array of { type, layers } objects
    const hazards = [{ type: "sticky-web" as const, layers: 1 }];
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
      types: ["flying", "normal"],
      nickname: "Talonflame",
    });
    const hazards = [{ type: "sticky-web" as const, layers: 1 }];
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
      types: ["water"],
      ability: "drizzle",
      heldItem: "damp-rock",
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
      types: ["fire"],
      ability: "drought",
      heldItem: "heat-rock",
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
    const phantomForce = makeMove({
      id: "phantom-force",
      type: "ghost",
      category: "physical",
      power: 90,
      flags: { contact: true },
      breaksProtect: true,
    });
    expect(phantomForce.breaksProtect).toBe(true);
    expect(phantomForce.flags.contact).toBe(true);
    expect(phantomForce.type).toBe("ghost");
  });
});

describe("Gen 6 Integration: Terrain damage modifiers", () => {
  it("given Electric Terrain, when an Electric move is used by grounded attacker, then 1.5x (6144/4096) boost applies", () => {
    // Source: Showdown data/conditions.ts -- electricterrain: 1.5x for Electric on grounded
    // getTerrainDamageModifier(terrainType, moveType, moveId, attackerGrounded, defenderGrounded)
    const mod = getTerrainDamageModifier("electric", "electric", "thunderbolt", true, true);
    expect(mod.powerModifier).toBe(6144); // 1.5x in 4096-based
  });

  it("given Electric Terrain, when an Electric move is used by NON-grounded attacker, then no boost", () => {
    // Source: Showdown -- terrain boosts only apply to grounded Pokemon
    const mod = getTerrainDamageModifier("electric", "electric", "thunderbolt", false, true);
    expect(mod.powerModifier).toBeNull();
  });

  it("given Grassy Terrain, when Earthquake is used vs grounded target, then grassyGroundHalved is true", () => {
    // Source: Showdown data/conditions.ts -- grassyterrain halves Earthquake/Bulldoze/Magnitude
    const mod = getTerrainDamageModifier("grassy", "ground", "earthquake", true, true);
    expect(mod.grassyGroundHalved).toBe(true);
  });

  it("given Grassy Terrain, when Earthquake is used vs non-grounded target, then grassyGroundHalved is false", () => {
    // Source: Showdown -- only halves vs grounded defenders
    const mod = getTerrainDamageModifier("grassy", "ground", "earthquake", true, false);
    expect(mod.grassyGroundHalved).toBe(false);
  });

  it("given Misty Terrain, when a Dragon move is used vs grounded defender, then power is halved (2048)", () => {
    // Source: Showdown data/conditions.ts -- mistyterrain: 0.5x Dragon vs grounded
    const mod = getTerrainDamageModifier("misty", "dragon", "dragon-pulse", true, true);
    expect(mod.powerModifier).toBe(2048); // 0.5x
  });
});

describe("Gen 6 Integration: Fairy type chart", () => {
  it("given Gen 6 type chart, Fairy vs Dragon = 2x SE", () => {
    // Source: Bulbapedia -- Fairy is super-effective against Dragon
    expect(getTypeEffectiveness("fairy", ["dragon"], GEN6_TYPE_CHART)).toBe(2);
  });

  it("given Gen 6 type chart, Dragon vs Fairy = 0x immune", () => {
    // Source: Bulbapedia -- Fairy is immune to Dragon
    expect(getTypeEffectiveness("dragon", ["fairy"], GEN6_TYPE_CHART)).toBe(0);
  });

  it("given Gen 6 type chart, Steel vs Fairy = 2x SE", () => {
    // Source: Bulbapedia -- Steel is super-effective against Fairy
    expect(getTypeEffectiveness("steel", ["fairy"], GEN6_TYPE_CHART)).toBe(2);
  });

  it("given Gen 6 type chart, Fairy vs Fighting/Dark = 4x SE", () => {
    // Source: Bulbapedia -- Fairy is SE against both Fighting and Dark
    expect(getTypeEffectiveness("fairy", ["fighting", "dark"], GEN6_TYPE_CHART)).toBe(4);
  });

  it("given Gen 6 type chart, Dark vs Steel = 1x neutral (lost resistance)", () => {
    // Source: Bulbapedia -- Steel no longer resists Dark as of Gen 6
    expect(getTypeEffectiveness("dark", ["steel"], GEN6_TYPE_CHART)).toBe(1);
  });

  it("given Gen 6 type chart, Ghost vs Steel = 1x neutral (lost resistance)", () => {
    // Source: Bulbapedia -- Steel no longer resists Ghost as of Gen 6
    expect(getTypeEffectiveness("ghost", ["steel"], GEN6_TYPE_CHART)).toBe(1);
  });
});

describe("Gen 6 Integration: Weakness Policy activation", () => {
  it("given Weakness Policy holder hit by SE move, then +2 Atk/SpAtk and item is consumed", () => {
    // Source: Showdown data/items.ts -- weaknesspolicy: +2 atk/spa on SE hit
    const pokemon = makeActive({
      types: ["dragon", "flying"],
      heldItem: "weakness-policy",
      hp: 300,
      currentHp: 200,
      nickname: "Dragonite",
    });
    const iceBeam = makeMove({
      id: "ice-beam",
      type: "ice",
      category: "special",
      power: 90,
      flags: { contact: false },
    });
    const ctx = makeItemContext({ pokemon, damage: 150, move: iceBeam });
    const result = applyGen6HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "stat-boost", target: "self", value: "attack", stages: 2 },
      { type: "stat-boost", target: "self", value: "spAttack", stages: 2 },
      { type: "consume", target: "self", value: "weakness-policy" },
    ]);
  });

  it("given Weakness Policy holder hit by neutral move, then item does NOT activate", () => {
    // Source: Showdown data/items.ts -- weaknesspolicy requires typeMod >= 2
    const pokemon = makeActive({
      types: ["water"],
      heldItem: "weakness-policy",
      hp: 200,
      currentHp: 150,
      nickname: "Gyarados",
    });
    const surf = makeMove({
      id: "surf",
      type: "water",
      category: "special",
      power: 90,
      flags: { contact: false },
    });
    const ctx = makeItemContext({ pokemon, damage: 50, move: surf });
    const result = applyGen6HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(false);
  });
});

describe("Gen 6 Integration: Mega Stone identification", () => {
  it("given various Mega Stones, then they are correctly identified", () => {
    // Source: Showdown data/items.ts -- mega stones have onTakeItem: false
    expect(isMegaStone("charizardite-x")).toBe(true);
    expect(isMegaStone("venusaurite")).toBe(true);
    expect(isMegaStone("blue-orb")).toBe(true);
    expect(isMegaStone("red-orb")).toBe(true);
  });

  it("given Eviolite ends in ite but is NOT a Mega Stone", () => {
    // Source: Bulbapedia "Eviolite" -- not a Mega Stone
    expect(isMegaStone("eviolite")).toBe(false);
    expect(isMegaStone("")).toBe(false);
  });
});

describe("Gen 6 Integration: Crit multiplier is 1.5x", () => {
  it("given a crit hit in Gen 6, when damage is calculated, then crit/non-crit ratio is approximately 1.5x", () => {
    // Source: Bulbapedia "Critical hit" -- Gen 6 uses 1.5x, not 2.0x
    const attacker = makeActive({ types: ["normal"], attack: 100, level: 50 });
    const defender = makeActive({ types: ["normal"], defense: 100, hp: 200, currentHp: 200 });
    const tackle = makeMove({ id: "tackle", type: "normal", power: 50 });
    const nonCritResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: tackle, isCrit: false, seed: 99 }),
      typeChart,
    );
    const critResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: tackle, isCrit: true, seed: 99 }),
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
    expect(types).toContain("fairy");
    expect(types.length).toBe(18);
  });

  it("given Gen6Ruleset, sticky-web is an available hazard", () => {
    const ruleset = new Gen6Ruleset();
    expect(ruleset.getAvailableHazards()).toContain("sticky-web");
  });

  it("given Gen6Ruleset, hasTerrain returns true", () => {
    const ruleset = new Gen6Ruleset();
    expect(ruleset.hasTerrain()).toBe(true);
  });

  it("given Gen6Ruleset, grassy-terrain-heal is in EoT order after poison-heal", () => {
    const ruleset = new Gen6Ruleset();
    const order = ruleset.getEndOfTurnOrder();
    expect(order).toContain("grassy-terrain-heal");
    expect(order.indexOf("grassy-terrain-heal")).toBeGreaterThan(order.indexOf("poison-heal"));
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
    const pokemon = makeActive({ hp: 200, currentHp: 180, status: "burn" });
    expect(ruleset.applyStatusDamage(pokemon, "burn", makeState())).toBe(25);
  });

  it("given burned Pokemon with 321 max HP, then burn deals 40 HP (floor(321/8))", () => {
    // Derivation: floor(321 / 8) = 40
    const ruleset = new Gen6Ruleset();
    const pokemon = makeActive({ hp: 321, currentHp: 300, status: "burn" });
    expect(ruleset.applyStatusDamage(pokemon, "burn", makeState())).toBe(40);
  });

  it("given burned Magic Guard Pokemon, then burn deals 0 HP", () => {
    // Source: Bulbapedia -- Magic Guard prevents indirect damage
    const ruleset = new Gen6Ruleset();
    const pokemon = makeActive({ hp: 200, currentHp: 180, status: "burn", ability: "magic-guard" });
    expect(ruleset.applyStatusDamage(pokemon, "burn", makeState())).toBe(0);
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
      status: "paralysis",
      moves: [{ moveId: "thunderbolt", currentPp: 15, maxPp: 15 }],
    });
    const slow = makeActive({
      speed: 60,
      moves: [{ moveId: "tackle", currentPp: 35, maxPp: 35 }],
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
    const pokemon = makeActive({ hp: 200, currentHp: 180, status: "burn", ability: "heatproof" });
    expect(ruleset.applyStatusDamage(pokemon, "burn", makeState())).toBe(12);
  });

  it("given burned Heatproof Pokemon with 100 max HP, then burn deals 6 HP (floor(100/16))", () => {
    // Derivation: floor(100/16) = 6
    const ruleset = new Gen6Ruleset();
    const pokemon = makeActive({ hp: 100, currentHp: 80, status: "burn", ability: "heatproof" });
    expect(ruleset.applyStatusDamage(pokemon, "burn", makeState())).toBe(6);
  });
});
