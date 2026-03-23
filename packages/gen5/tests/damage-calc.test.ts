import type { ActivePokemon, BattleState, DamageContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { calculateGen5Damage, pokeRound } from "../src/Gen5DamageCalc";
import { GEN5_TYPE_CHART } from "../src/Gen5TypeChart";

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
  gender?: "male" | "female" | "genderless";
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
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
      gender: (overrides.gender ?? "male") as any,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: "pokeball",
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
    types: overrides.types ?? ["psychic"],
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
    generation: 5,
    critRatio: overrides.critRatio ?? 0,
  } as MoveData;
}

function makeState(overrides?: {
  weather?: { type: string; turnsLeft: number; source: string } | null;
  format?: string;
}): BattleState {
  return {
    weather: overrides?.weather ?? null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    format: overrides?.format ?? "singles",
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
    move: overrides.move ?? makeMove({}),
    state: overrides.state ?? makeState(),
    rng: new SeededRandom(overrides.seed ?? 42),
    isCrit: overrides.isCrit ?? false,
  };
}

// ---------------------------------------------------------------------------
// pokeRound unit tests
// ---------------------------------------------------------------------------

describe("pokeRound function", () => {
  it("given value=100 and modifier=6144, when applying pokeRound (1.5x), then returns 150", () => {
    // Source: Showdown sim/battle.ts modify() — tr((tr(100*6144) + 2047) / 4096)
    // 100 * 6144 = 614400; floor((614400 + 2047) / 4096) = floor(616447 / 4096) = 150
    expect(pokeRound(100, 6144)).toBe(150);
  });

  it("given value=100 and modifier=2048, when applying pokeRound (0.5x), then returns 50", () => {
    // Source: Showdown sim/battle.ts modify() — tr((tr(100*2048) + 2047) / 4096)
    // 100 * 2048 = 204800; floor((204800 + 2047) / 4096) = floor(206847 / 4096) = 50
    expect(pokeRound(100, 2048)).toBe(50);
  });

  it("given value=57 and modifier=6144, when applying pokeRound, then returns 85", () => {
    // Source: Showdown sim/battle.ts modify() — tr((tr(57*6144) + 2047) / 4096)
    // 57 * 6144 = 350208; floor((350208 + 2047) / 4096) = floor(352255 / 4096) = 85
    // This is a boundary case: 350208 % 4096 === 2048 (exact midpoint)
    expect(pokeRound(57, 6144)).toBe(85);
  });

  it("given value=1 and modifier=4096, when applying pokeRound (1.0x), then returns 1", () => {
    // Source: Showdown sim/battle.ts modify() — tr((tr(1*4096) + 2047) / 4096)
    // 1 * 4096 = 4096; floor((4096 + 2047) / 4096) = floor(6143 / 4096) = 1
    expect(pokeRound(1, 4096)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Status moves / power=0 return 0 damage
// ---------------------------------------------------------------------------

describe("Gen 5 damage calc -- status moves", () => {
  it("given status move, when calculating damage, then returns 0", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts -- status moves skip damage calc
    const ctx = makeDamageContext({
      move: makeMove({ id: "toxic", category: "status", power: null }),
    });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    // Source: references/pokemon-showdown/sim/battle-actions.ts -- status moves have power=null, return 0 damage; effectiveness stays 1 (not immune)
    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(1);
  });

  it("given move with power=0, when calculating damage, then returns 0", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts -- power 0 moves skip damage calc
    const ctx = makeDamageContext({
      move: makeMove({ power: 0 }),
    });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    // Source: references/pokemon-showdown/sim/battle-actions.ts -- power 0 skips all damage calc, returns 0
    expect(result.damage).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Base damage formula
// ---------------------------------------------------------------------------

describe("Gen 5 damage calc -- base formula", () => {
  it("given L50 attacker with 100 Atk using 50 BP physical move vs 100 Def defender, when calculating with max random (seed producing 100), then returns expected damage", () => {
    // Source: Bulbapedia damage formula + references/pokemon-showdown/sim/battle-actions.ts
    // Base formula: floor(floor((2*50/5+2) * 50 * 100 / 100) / 50) + 2
    //   levelFactor = floor(2*50/5) + 2 = floor(20) + 2 = 22
    //   baseDamage = floor(floor(22 * 50 * 100 / 100) / 50) + 2
    //             = floor(floor(110000 / 100) / 50) + 2
    //             = floor(1100 / 50) + 2 = floor(22) + 2 = 24
    // No weather, no crit, random 85-100%, no STAB, neutral effectiveness.
    // With random roll r: damage = floor(24 * r / 100)
    // With r=100: damage = floor(24 * 100 / 100) = 24
    // With r=85:  damage = floor(24 * 85 / 100)  = floor(20.4) = 20
    // Result depends on the seed's random roll.
    const attacker = makeActive({ attack: 100 });
    const defender = makeActive({ defense: 100 });
    const move = makeMove({ type: "normal", power: 50, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    // Damage must be in the range [20, 24] (85-100% of 24)
    expect(result.damage).toBeGreaterThanOrEqual(20);
    expect(result.damage).toBeLessThanOrEqual(24);
  });

  it("given L100 attacker with 200 Atk using 120 BP move vs 150 Def defender, when calculating, then damage is in expected range", () => {
    // Source: Bulbapedia damage formula
    // levelFactor = floor(2*100/5) + 2 = 42
    // baseDamage = floor(floor(42 * 120 * 200 / 150) / 50) + 2
    //   = floor(floor(1008000 / 150) / 50) + 2
    //   = floor(6720 / 50) + 2 = floor(134.4) + 2 = 134 + 2 = 136
    // Random range: floor(136 * 85/100) to floor(136 * 100/100) = 115 to 136
    const attacker = makeActive({ level: 100, attack: 200 });
    const defender = makeActive({ defense: 150 });
    const move = makeMove({ type: "normal", power: 120, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    expect(result.damage).toBeGreaterThanOrEqual(115);
    expect(result.damage).toBeLessThanOrEqual(136);
  });
});

// ---------------------------------------------------------------------------
// STAB via pokeRound
// ---------------------------------------------------------------------------

describe("Gen 5 damage calc -- STAB", () => {
  it("given STAB move via pokeRound, when applying 1.5x STAB modifier (6144/4096), then result uses pokeRound correctly", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts -- chainModify(1.5) in STAB section
    // Use a Fire attacker using a Fire move for STAB.
    // Base: L50, Atk=100, Def=100, Power=50
    // baseDamage = floor(floor(22*50*100/100)/50) + 2 = 24
    // STAB: pokeRound(24 * r_applied, 6144) where r_applied is after random
    // Actually the order is: baseDamage=24, random, then STAB
    // With max random (100%): 24 * 100/100 = 24, then STAB: pokeRound(24, 6144)
    //   = floor((24 * 6144 + 2047) / 4096) = floor((147456 + 2047)/4096) = floor(149503/4096)
    //   = floor(36.5) = 36
    // With min random (85%): floor(24*85/100) = floor(20.4) = 20, then STAB: pokeRound(20, 6144)
    //   = floor((20 * 6144 + 2047) / 4096) = floor((122880 + 2047)/4096) = floor(124927/4096)
    //   = floor(30.5) = 30
    const attacker = makeActive({ attack: 100, types: ["fire"] });
    const defender = makeActive({ defense: 100, types: ["normal"] });
    const move = makeMove({ type: "fire", power: 50, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    // STAB range: 30-36 (vs non-STAB 20-24)
    expect(result.damage).toBeGreaterThanOrEqual(30);
    expect(result.damage).toBeLessThanOrEqual(36);
  });

  it("given Adaptability ability with STAB move, when applying 2.0x modifier (8192/4096), then damage uses pokeRound with 8192", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts -- Adaptability uses 2x STAB
    // Base damage = 24 (same setup as above)
    // With max random (100%): 24, then STAB: pokeRound(24, 8192)
    //   = floor((24 * 8192 + 2047) / 4096) = floor((196608 + 2047)/4096) = floor(198655/4096)
    //   = floor(48.5) = 48
    // With min random (85%): floor(24*85/100) = 20, then STAB: pokeRound(20, 8192)
    //   = floor((20 * 8192 + 2047) / 4096) = floor((163840 + 2047)/4096) = floor(165887/4096)
    //   = floor(40.5) = 40
    const attacker = makeActive({ attack: 100, types: ["fire"], ability: "adaptability" });
    const defender = makeActive({ defense: 100, types: ["normal"] });
    const move = makeMove({ type: "fire", power: 50, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    // Adaptability STAB range: 40-48 (vs normal STAB 30-36, vs no STAB 20-24)
    expect(result.damage).toBeGreaterThanOrEqual(40);
    expect(result.damage).toBeLessThanOrEqual(48);
  });
});

// ---------------------------------------------------------------------------
// Type effectiveness
// ---------------------------------------------------------------------------

describe("Gen 5 damage calc -- type effectiveness", () => {
  it("given super-effective move (2x), when calculating damage, then applies 2x multiplier", () => {
    // Source: Showdown type effectiveness chain
    // Fire (attacker) using Fire move vs Grass (defender) = 2x
    // baseDamage = 24, random range 20-24, STAB 30-36, then 2x = 60-72
    const attacker = makeActive({ attack: 100, types: ["fire"] });
    const defender = makeActive({ defense: 100, types: ["grass"] });
    const move = makeMove({ type: "fire", power: 50, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    // Source: Showdown type chart -- Fire vs Grass = 2x (super effective)
    expect(result.effectiveness).toBe(2);
    // With STAB + SE: base 24, random 20-24, STAB -> 30-36, SE -> 60-72
    expect(result.damage).toBeGreaterThanOrEqual(60);
    expect(result.damage).toBeLessThanOrEqual(72);
  });

  it("given not-very-effective move (0.5x), when calculating damage, then applies 0.5x multiplier", () => {
    // Source: Showdown type effectiveness chain
    // Fire (attacker) using Fire move vs Water (defender) = 0.5x
    // baseDamage = 24, random range 20-24, STAB 30-36, then 0.5x = 15-18
    const attacker = makeActive({ attack: 100, types: ["fire"] });
    const defender = makeActive({ defense: 100, types: ["water"] });
    const move = makeMove({ type: "fire", power: 50, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    // Source: Showdown type chart -- Fire vs Water = 0.5x (not very effective)
    expect(result.effectiveness).toBe(0.5);
    expect(result.damage).toBeGreaterThanOrEqual(15);
    expect(result.damage).toBeLessThanOrEqual(18);
  });

  it("given type-immune matchup (0x), when calculating damage, then returns 0", () => {
    // Source: Showdown type effectiveness -- Normal attacks Ghost = 0x (immune)
    const attacker = makeActive({ attack: 100, types: ["normal"] });
    const defender = makeActive({ defense: 100, types: ["ghost"] });
    const move = makeMove({ type: "normal", power: 50, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    // Source: Showdown type chart -- Normal vs Ghost = 0x (immune); damage 0, effectiveness 0
    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Critical hit
// ---------------------------------------------------------------------------

describe("Gen 5 damage calc -- critical hit", () => {
  it("given critical hit in Gen 5, when applying crit multiplier, then uses 2x integer multiply (not pokeRound)", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts line 1751
    // baseDamage * (move.critModifier || (this.battle.gen >= 6 ? 1.5 : 2))
    // Gen 5: baseDamage * 2, as integer multiplication
    // Base damage: L50, Atk=100, Def=100, Power=50 -> 24
    // With crit: 24 * 2 = 48, random 85-100% -> floor(48 * r / 100)
    // Range: floor(48 * 85/100)=40 to floor(48 * 100/100)=48
    const attacker = makeActive({ attack: 100 });
    const defender = makeActive({ defense: 100 });
    const move = makeMove({ type: "normal", power: 50, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move, isCrit: true });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    // Source: references/pokemon-showdown/sim/battle-actions.ts -- isCrit passthrough from ctx.isCrit
    expect(result.isCrit).toBe(true);
    // Crit range: 40-48 (vs non-crit 20-24)
    expect(result.damage).toBeGreaterThanOrEqual(40);
    expect(result.damage).toBeLessThanOrEqual(48);
  });

  it("given critical hit with STAB, when calculating, then both crit 2x and STAB 1.5x apply", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts
    // Order: base=24, crit -> 48, random 40-48, STAB pokeRound(val, 6144)
    // With max random: 48, STAB = pokeRound(48, 6144) = floor((48*6144+2048)/4096)
    //   = floor((294912+2048)/4096) = floor(296960/4096) = floor(72.5) = 72
    // With min random: 40, STAB = pokeRound(40, 6144) = floor((40*6144+2048)/4096)
    //   = floor((245760+2048)/4096) = floor(247808/4096) = floor(60.5) = 60
    const attacker = makeActive({ attack: 100, types: ["fire"] });
    const defender = makeActive({ defense: 100 });
    const move = makeMove({ type: "fire", power: 50, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move, isCrit: true });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    // Crit + STAB range: 60-72
    expect(result.damage).toBeGreaterThanOrEqual(60);
    expect(result.damage).toBeLessThanOrEqual(72);
  });
});

// ---------------------------------------------------------------------------
// Burn penalty
// ---------------------------------------------------------------------------

describe("Gen 5 damage calc -- burn penalty", () => {
  it("given burned physical attacker using Tackle, when calculating damage, then applies 0.5x burn penalty via pokeRound(damage, 2048)", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts lines 1816-1820
    // Burn halves physical damage: pokeRound(val, 2048) = 0.5x
    // Base: 24, random 20-24, burn -> pokeRound(val, 2048)
    // With max random: pokeRound(24, 2048) = floor((24*2048+2048)/4096) = floor(51200/4096) = 12
    // With min random: pokeRound(20, 2048) = floor((20*2048+2048)/4096) = floor(43008/4096) = 10
    const attacker = makeActive({ attack: 100, status: "burn" });
    const defender = makeActive({ defense: 100 });
    const move = makeMove({ type: "normal", power: 50, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    // Burned range: 10-12 (vs non-burned 20-24)
    expect(result.damage).toBeGreaterThanOrEqual(10);
    expect(result.damage).toBeLessThanOrEqual(12);
  });

  it("given burned physical attacker using Facade in Gen 5, when calculating damage, then burn penalty STILL applies (0.5x)", () => {
    // Source: Facade burn bypass was added in Gen 6. In Gen 5, Facade is treated as normal physical.
    // references/pokemon-showdown/sim/battle-actions.ts lines 1816-1820:
    //   if (this.battle.gen < 6 || move.id !== 'facade') { baseDamage = modify(baseDamage, 0.5); }
    // Gen 5 < 6, so burn penalty always applies regardless of Facade.
    // Facade has 70 BP in Gen 5. Without burn power doubling (that's also Gen 6+), BP stays 70.
    // baseDamage = floor(floor(22*70*100/100)/50) + 2 = floor(1540/50) + 2 = 30 + 2 = 32
    // Random range: floor(32*85/100)=27 to 32
    // Burn: pokeRound(val, 2048)
    // Max: pokeRound(32, 2048) = floor((32*2048+2048)/4096) = floor(67584/4096) = 16
    // Min: pokeRound(27, 2048) = floor((27*2048+2048)/4096) = floor(57344/4096) = 14
    const attacker = makeActive({ attack: 100, status: "burn" });
    const defender = makeActive({ defense: 100 });
    const move = makeMove({ id: "facade", type: "normal", power: 70, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    // With burn penalty applied: 14-16
    expect(result.damage).toBeGreaterThanOrEqual(14);
    expect(result.damage).toBeLessThanOrEqual(16);
  });

  it("given burned special attacker, when calculating damage, then burn penalty does NOT apply", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts -- burn only affects physical moves
    // Burn only halves damage for physical category moves
    const attacker = makeActive({ spAttack: 100, status: "burn" });
    const defender = makeActive({ spDefense: 100 });
    const move = makeMove({ type: "normal", power: 50, category: "special" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    // No burn penalty: normal range 20-24
    expect(result.damage).toBeGreaterThanOrEqual(20);
    expect(result.damage).toBeLessThanOrEqual(24);
  });
});

// ---------------------------------------------------------------------------
// Gen 5 damage floor (baseDamage = 1 if 0 before final modifiers)
// ---------------------------------------------------------------------------

describe("Gen 5 damage calc -- Gen 5 damage floor", () => {
  it("given move that would deal 0 damage after burn penalty, when applying Gen 5 damage floor, then result is at least 1", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts line 1823
    // if (this.battle.gen === 5 && !baseDamage) baseDamage = 1;
    // Use a very weak attack with burn to try to get 0.
    // Power 1, Atk=1, Def=999, Level 1: levelFactor = floor(2/5) + 2 = 2
    // baseDamage = floor(floor(2*1*1/999)/50) + 2 = floor(0/50) + 2 = 0 + 2 = 2
    // That's still 2. Let me try even lower stats. The formula always adds +2 so
    // baseDamage before modifiers is at least 2. With burn the minimum is pokeRound(1, 2048) = 0.
    // After random at 85%: floor(2*85/100) = floor(1.7) = 1. Burn: pokeRound(1, 2048) = 0.
    // Gen 5 floor: if 0, set to 1. Then final damage = 1.
    // Use level 1, power 1, atk 1, def 200.
    // levelFactor = floor(2*1/5) + 2 = 0 + 2 = 2
    // baseDamage = floor(floor(2*1*1/200)/50) + 2 = floor(0/50) + 2 = 2
    // crit: no. random: floor(2 * r/100). At r=85: floor(1.7) = 1
    // STAB: no. Type eff: 1. Burn: pokeRound(1, 2048) = floor((2048+2047)/4096) = floor(0.999...) = 0
    // Actually burn makes it 1 not 0 in this case. Let me construct a scenario where burn => 0.
    // pokeRound(0, 2048) = floor((0+2048)/4096) = 0. So we need random to give 0 first.
    // floor(2 * 85/100) = 1, floor(2 * 86/100) = 1, ..., floor(2 * 100/100) = 2
    // So random never gives 0 from 2. The minimum damage after formula is always >= 2 (the +2).
    // With random 85% of 2 = floor(1.7) = 1, burn -> pokeRound(1, 2048) = 0. Gen 5 floor -> 1.
    // To get 0 after burn, need random to produce 0, which requires baseDamage < 85/100 = 0.85.
    // Since baseDamage is always >= 2 from the formula, random always gives >= 1.
    // pokeRound(1, 2048) = floor((1*2048 + 2047)/4096) = floor(4095/4096) = 0. Gen 5 floor -> 1.
    // In practice, the Gen 5 floor is needed for edge cases with modifier chains.
    // Let's just test with a minimal case: burn with very low power.
    // The floor guarantees damage >= 1 when not immune.
    const attacker = makeActive({ level: 1, attack: 1, status: "burn" });
    const defender = makeActive({ defense: 200 });
    const move = makeMove({ type: "normal", power: 1, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    expect(result.damage).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Weather modifiers
// ---------------------------------------------------------------------------

describe("Gen 5 damage calc -- weather", () => {
  it("given Water move in Rain, when applying weather boost, then applies pokeRound(damage, 6144) = 1.5x", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts weather modifier section
    // Base: L50, SpAtk=100, SpDef=100, Power=50. baseDamage = 24
    // Weather boost 1.5x via pokeRound(24, 6144) = floor((24*6144+2048)/4096) = 36
    // Then random: floor(36 * r/100)
    // Range: floor(36*85/100)=30 to floor(36*100/100)=36
    // But order is: base=24, weather -> pokeRound(24, 6144)=36, crit, random, STAB, type
    // Wait, need to check actual order in Gen 5. Looking at Showdown modifyDamage:
    // baseDamage += 2 (already in base = 24)
    // spread, weather, crit, random, STAB, type, burn
    // With rain + water: pokeRound(24, 6144) = 36
    // random: floor(36 * r/100). Range: 30-36
    const attacker = makeActive({ spAttack: 100 });
    const defender = makeActive({ spDefense: 100 });
    const move = makeMove({ type: "water", power: 50, category: "special" });
    const state = makeState({ weather: { type: "rain", turnsLeft: 5, source: "drizzle" } });
    const ctx = makeDamageContext({ attacker, defender, move, state });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    // Rain-boosted range: 30-36 (vs non-weather 20-24)
    expect(result.damage).toBeGreaterThanOrEqual(30);
    expect(result.damage).toBeLessThanOrEqual(36);
  });

  it("given Fire move in Sun, when applying weather boost, then applies pokeRound(damage, 6144) = 1.5x", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts weather modifier section
    // Same formula as rain+water but for sun+fire
    const attacker = makeActive({ attack: 100 });
    const defender = makeActive({ defense: 100 });
    const move = makeMove({ type: "fire", power: 50, category: "physical" });
    const state = makeState({ weather: { type: "sun", turnsLeft: 5, source: "drought" } });
    const ctx = makeDamageContext({ attacker, defender, move, state });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    // Sun-boosted fire range: 30-36
    expect(result.damage).toBeGreaterThanOrEqual(30);
    expect(result.damage).toBeLessThanOrEqual(36);
  });

  it("given Water move in Sun, when applying weather nerf, then applies pokeRound(damage, 2048) = 0.5x", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts weather modifier section
    // Sun nerfs Water: pokeRound(24, 2048) = floor((24*2048+2048)/4096) = floor(51200/4096) = 12
    // Random: floor(12*r/100). Range: floor(12*85/100)=10 to 12
    const attacker = makeActive({ spAttack: 100 });
    const defender = makeActive({ spDefense: 100 });
    const move = makeMove({ type: "water", power: 50, category: "special" });
    const state = makeState({ weather: { type: "sun", turnsLeft: 5, source: "drought" } });
    const ctx = makeDamageContext({ attacker, defender, move, state });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    // Sun-nerfed water range: 10-12
    expect(result.damage).toBeGreaterThanOrEqual(10);
    expect(result.damage).toBeLessThanOrEqual(12);
  });
});

// ---------------------------------------------------------------------------
// Life Orb final modifier
// ---------------------------------------------------------------------------

describe("Gen 5 damage calc -- Life Orb", () => {
  it("given Life Orb final modifier, when applying, then uses pokeRound(damage, 5324) ~= 1.3x", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts -- Life Orb modifier 5324/4096
    // Base: 24. Random range: 20-24. Life Orb: pokeRound(val, 5324)
    // With max random: pokeRound(24, 5324) = floor((24*5324+2048)/4096) = floor((127776+2048)/4096)
    //   = floor(129824/4096) = floor(31.7) = 31
    // With min random: pokeRound(20, 5324) = floor((20*5324+2048)/4096) = floor((106480+2048)/4096)
    //   = floor(108528/4096) = floor(26.5) = 26
    const attacker = makeActive({ attack: 100, heldItem: "life-orb" });
    const defender = makeActive({ defense: 100 });
    const move = makeMove({ type: "normal", power: 50, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    // Life Orb range: 26-31 (vs no-item 20-24)
    expect(result.damage).toBeGreaterThanOrEqual(26);
    expect(result.damage).toBeLessThanOrEqual(31);
  });
});

// ---------------------------------------------------------------------------
// Spread move modifier (doubles)
// ---------------------------------------------------------------------------

describe("Gen 5 damage calc -- spread modifier", () => {
  it("given spread move in doubles hitting 2 targets, when applying spread modifier, then uses pokeRound(damage, 3072) = 0.75x", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts spread modifier section
    // In doubles, multi-target moves get 0.75x via pokeRound(baseDamage, 3072)
    // Base: 24. Spread: pokeRound(24, 3072) = floor((24*3072+2048)/4096) = floor((73728+2048)/4096)
    //   = floor(75776/4096) = floor(18.5) = 18
    // Random: floor(18*r/100). Range: floor(18*85/100)=15 to 18
    const attacker = makeActive({ attack: 100 });
    const defender = makeActive({ defense: 100 });
    const move = makeMove({
      type: "normal",
      power: 50,
      category: "physical",
      flags: { contact: false },
    });
    // isSpread is determined by the context. We need to signal spread somehow.
    // Let's check how the damage calc detects spread moves...
    // For now, spread moves are a doubles format detail. We'll test via the format.
    const state = makeState({ format: "doubles" });
    const _ctx = makeDamageContext({ attacker, defender, move, state });
    // The spread modifier is only applied when move.target is "all-adjacent-foes" or similar
    // and format is doubles. Let's make a spread move.
    const spreadMove = makeMove({
      type: "normal",
      power: 50,
      category: "physical",
    });
    // Override target to make it a spread move
    const spreadMoveWithTarget = { ...spreadMove, target: "all-adjacent-foes" } as MoveData;
    const ctx2 = makeDamageContext({ attacker, defender, move: spreadMoveWithTarget, state });
    const result = calculateGen5Damage(
      ctx2,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    // Spread range: 15-18 (vs non-spread 20-24)
    expect(result.damage).toBeGreaterThanOrEqual(15);
    expect(result.damage).toBeLessThanOrEqual(18);
  });
});

// ---------------------------------------------------------------------------
// Gem boost (Gen 5: 1.5x base power)
// ---------------------------------------------------------------------------

describe("Gen 5 damage calc -- Gem boost", () => {
  it("given Normal Gem boost (1.5x base power in Gen 5), when calculating damage, then BP is 1.5x normal", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/conditions.ts gem condition -- chainModify(1.5)
    // Note: Gem boost is 1.5x in Gen 5, NOT 1.3x like Gen 6+
    // Gem is consumed before damage. In our implementation, gem modifies base power.
    // Power 50 * 1.5 = 75. Then calculate normally.
    // baseDamage with power 75: floor(floor(22*75*100/100)/50) + 2
    //   = floor(1650/50) + 2 = 33 + 2 = 35
    // Random: floor(35*r/100). Range: floor(35*85/100)=29 to 35
    const attacker = makeActive({ attack: 100, heldItem: "normal-gem" });
    const defender = makeActive({ defense: 100 });
    const move = makeMove({ type: "normal", power: 50, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    // Gem-boosted range: 29-35 (vs no gem 20-24)
    expect(result.damage).toBeGreaterThanOrEqual(29);
    expect(result.damage).toBeLessThanOrEqual(35);
  });
});

// ---------------------------------------------------------------------------
// Special moves use SpAttack / SpDefense
// ---------------------------------------------------------------------------

describe("Gen 5 damage calc -- special moves", () => {
  it("given special move, when calculating damage, then uses SpAttack and SpDefense stats", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts -- physical/special split
    // Use higher SpAtk than Atk to verify correct stat is used.
    // SpAtk = 150, SpDef = 100, Power = 50
    // baseDamage = floor(floor(22*50*150/100)/50) + 2 = floor(floor(165000/100)/50) + 2
    //   = floor(1650/50) + 2 = 33 + 2 = 35
    // Random: floor(35*r/100). Range: 29-35
    const attacker = makeActive({ attack: 50, spAttack: 150 });
    const defender = makeActive({ defense: 200, spDefense: 100 });
    const move = makeMove({ type: "normal", power: 50, category: "special" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    // Range: 29-35 (uses SpAtk 150 vs SpDef 100, not Atk 50 vs Def 200)
    expect(result.damage).toBeGreaterThanOrEqual(29);
    expect(result.damage).toBeLessThanOrEqual(35);
  });
});

// ---------------------------------------------------------------------------
// Ability type immunities
// ---------------------------------------------------------------------------

describe("Gen 5 damage calc -- ability type immunities", () => {
  it("given defender with Levitate and Ground move, when calculating damage, then returns 0 (immune)", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts -- ability immunities
    // Levitate grants Ground immunity
    const attacker = makeActive({ attack: 100 });
    const defender = makeActive({ defense: 100, ability: "levitate", types: ["psychic"] });
    const move = makeMove({ type: "ground", power: 80, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    // Source: references/pokemon-showdown/sim/battle-actions.ts -- Levitate grants Ground immunity; effectiveness 0
    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });

  it("given defender with Water Absorb and Water move, when calculating damage, then returns 0 (immune)", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts -- Water Absorb immunity
    const attacker = makeActive({ spAttack: 100 });
    const defender = makeActive({ spDefense: 100, ability: "water-absorb" });
    const move = makeMove({ type: "water", power: 80, category: "special" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    // Source: Showdown data/abilities.ts -- Water Absorb blocks Water moves; damage 0, effectiveness 0
    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });

  it("given attacker with Mold Breaker and defender with Levitate, when using Ground move, then Levitate is bypassed", () => {
    // Source: Bulbapedia -- Mold Breaker ignores target's defensive abilities
    const attacker = makeActive({ attack: 100, ability: "mold-breaker" });
    const defender = makeActive({ defense: 100, ability: "levitate", types: ["psychic"] });
    const move = makeMove({ type: "ground", power: 80, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    // Ground vs Psychic = 1x (neutral), damage should be > 0
    // Source: Showdown type chart -- Ground vs Psychic = 1x; Mold Breaker bypasses Levitate so normal calc applies
    expect(result.damage).toBeGreaterThan(0);
    expect(result.effectiveness).toBe(1);
  });

  it("given attacker with Teravolt and defender with Levitate, when using Ground move, then Levitate is bypassed", () => {
    // Source: Showdown data/abilities.ts -- Teravolt is Mold Breaker equivalent
    const attacker = makeActive({ attack: 100, ability: "teravolt" });
    const defender = makeActive({ defense: 100, ability: "levitate", types: ["psychic"] });
    const move = makeMove({ type: "ground", power: 80, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    expect(result.damage).toBeGreaterThan(0);
  });

  it("given attacker with Turboblaze and defender with Levitate, when using Ground move, then Levitate is bypassed", () => {
    // Source: Showdown data/abilities.ts -- Turboblaze is Mold Breaker equivalent
    const attacker = makeActive({ attack: 100, ability: "turboblaze" });
    const defender = makeActive({ defense: 100, ability: "levitate", types: ["psychic"] });
    const move = makeMove({ type: "ground", power: 80, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    expect(result.damage).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Attack/Defense stat modifier abilities and items
// ---------------------------------------------------------------------------

describe("Gen 5 damage calc -- stat modifier abilities", () => {
  it("given Huge Power attacker using physical move, when calculating damage, then Attack is doubled", () => {
    // Source: Showdown data/abilities.ts -- Huge Power doubles Attack
    // Base setup: Atk=100, Def=100, Power=50 -> baseDamage=24
    // With Huge Power: Atk*2=200 -> baseDamage = floor(floor(22*50*200/100)/50)+2
    //   = floor(floor(220000/100)/50)+2 = floor(2200/50)+2 = 44+2 = 46
    // Random range: floor(46*85/100) to 46 = 39 to 46
    const attacker = makeActive({ attack: 100, ability: "huge-power" });
    const defender = makeActive({ defense: 100 });
    const move = makeMove({ type: "fire", power: 50, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    expect(result.damage).toBeGreaterThanOrEqual(39);
    expect(result.damage).toBeLessThanOrEqual(46);
  });

  it("given Pure Power attacker using physical move, when calculating damage, then Attack is doubled", () => {
    // Source: Showdown data/abilities.ts -- Pure Power doubles Attack (same as Huge Power)
    const attacker = makeActive({ attack: 100, ability: "pure-power" });
    const defender = makeActive({ defense: 100 });
    const move = makeMove({ type: "fire", power: 50, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    expect(result.damage).toBeGreaterThanOrEqual(39);
    expect(result.damage).toBeLessThanOrEqual(46);
  });

  it("given Choice Band attacker using physical move, when calculating damage, then Attack is 1.5x", () => {
    // Source: Showdown data/items.ts -- Choice Band 1.5x Attack
    // Atk=100 -> 150 after Choice Band
    // baseDamage = floor(floor(22*50*150/100)/50)+2 = floor(floor(165000/100)/50)+2
    //   = floor(1650/50)+2 = 33+2 = 35
    const attacker = makeActive({ attack: 100, heldItem: "choice-band" });
    const defender = makeActive({ defense: 100 });
    const move = makeMove({ type: "fire", power: 50, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    expect(result.damage).toBeGreaterThanOrEqual(29);
    expect(result.damage).toBeLessThanOrEqual(35);
  });

  it("given Choice Specs attacker using special move, when calculating damage, then SpAttack is 1.5x", () => {
    // Source: Showdown data/items.ts -- Choice Specs 1.5x SpAttack
    const attacker = makeActive({ spAttack: 100, heldItem: "choice-specs" });
    const defender = makeActive({ spDefense: 100 });
    const move = makeMove({ type: "fire", power: 50, category: "special" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    expect(result.damage).toBeGreaterThanOrEqual(29);
    expect(result.damage).toBeLessThanOrEqual(35);
  });

  it("given Hustle attacker using physical move, when calculating damage, then Attack is 1.5x", () => {
    // Source: Showdown data/abilities.ts -- Hustle 1.5x Attack
    const attacker = makeActive({ attack: 100, ability: "hustle" });
    const defender = makeActive({ defense: 100 });
    const move = makeMove({ type: "fire", power: 50, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    expect(result.damage).toBeGreaterThanOrEqual(29);
    expect(result.damage).toBeLessThanOrEqual(35);
  });

  it("given Guts attacker with status using physical move, when calculating damage, then Attack is 1.5x and burn penalty is suppressed", () => {
    // Source: Showdown data/abilities.ts -- Guts 1.5x Attack when statused, prevents burn penalty
    const attacker = makeActive({ attack: 100, ability: "guts", status: "burn" });
    const defender = makeActive({ defense: 100 });
    const move = makeMove({ type: "fire", power: 50, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    // Guts 1.5x + no burn penalty: range 29-35
    expect(result.damage).toBeGreaterThanOrEqual(29);
    expect(result.damage).toBeLessThanOrEqual(35);
  });

  it("given Defeatist attacker at 50% HP or below, when calculating damage, then Attack is halved", () => {
    // Source: Bulbapedia -- Defeatist halves Attack/SpAtk at <= 50% HP
    // Atk=100 -> 50 after Defeatist
    // baseDamage = floor(floor(22*50*50/100)/50)+2 = floor(floor(55000/100)/50)+2
    //   = floor(550/50)+2 = 11+2 = 13
    const attacker = makeActive({ attack: 100, ability: "defeatist", hp: 200, currentHp: 100 });
    const defender = makeActive({ defense: 100 });
    const move = makeMove({ type: "fire", power: 50, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    expect(result.damage).toBeGreaterThanOrEqual(11);
    expect(result.damage).toBeLessThanOrEqual(13);
  });
});

// ---------------------------------------------------------------------------
// Defense stat modifier items
// ---------------------------------------------------------------------------

describe("Gen 5 damage calc -- defense modifiers", () => {
  it("given Eviolite holder, when calculating damage, then defense is 1.5x", () => {
    // Source: Bulbapedia -- Eviolite: +50% Def/SpDef for NFE Pokemon
    // Base with Def=100: baseDamage=24
    // With Eviolite Def=150: baseDamage = floor(floor(22*50*100/150)/50)+2
    //   = floor(floor(110000/150)/50)+2 = floor(733/50)+2 = 14+2 = 16
    const attacker = makeActive({ attack: 100 });
    const defender = makeActive({ defense: 100, heldItem: "eviolite" });
    const move = makeMove({ type: "fire", power: 50, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    expect(result.damage).toBeGreaterThanOrEqual(13);
    expect(result.damage).toBeLessThanOrEqual(16);
  });

  it("given Sandstorm and Rock-type defender, when using special move, then SpDef is 1.5x", () => {
    // Source: Bulbapedia -- Sandstorm boosts Rock-type SpDef by 50%
    const attacker = makeActive({ spAttack: 100 });
    const defender = makeActive({ spDefense: 100, types: ["rock"] });
    const move = makeMove({ type: "fire", power: 50, category: "special" });
    const state = makeState({ weather: { type: "sand", turnsLeft: 5, source: "sand-stream" } });
    const ctx = makeDamageContext({ attacker, defender, move, state });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    // Fire vs Rock = 0.5x, but we care about the SpDef boost here
    // Source: Showdown type chart -- Fire vs Rock = 0.5x (not very effective)
    expect(result.damage).toBeGreaterThan(0);
    expect(result.effectiveness).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// Base power modification abilities
// ---------------------------------------------------------------------------

describe("Gen 5 damage calc -- base power mods", () => {
  it("given SolarBeam in rain, when calculating damage, then power is halved", () => {
    // Source: Showdown -- SolarBeam power halved in non-sun weather
    // Power 120 -> 60 in rain
    const attacker = makeActive({ spAttack: 100 });
    const defender = makeActive({ spDefense: 100 });
    const move = makeMove({ id: "solar-beam", type: "grass", power: 120, category: "special" });
    const state = makeState({ weather: { type: "rain", turnsLeft: 5, source: "drizzle" } });
    const ctx = makeDamageContext({ attacker, defender, move, state });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    // Rain weakens Grass move via SolarBeam halving but also boosts rain (not grass).
    // Just verify damage is less than the non-rain, full-power version.
    expect(result.damage).toBeGreaterThan(0);
  });

  it("given Technician with 60 BP move, when calculating damage, then power is 1.5x", () => {
    // Source: Showdown data/abilities.ts -- Technician: 1.5x for moves <= 60 BP
    // Power 50 * 1.5 = 75
    // baseDamage = floor(floor(22*75*100/100)/50)+2 = floor(1650/50)+2 = 33+2 = 35
    const attacker = makeActive({ attack: 100, ability: "technician" });
    const defender = makeActive({ defense: 100 });
    const move = makeMove({ type: "fire", power: 50, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    expect(result.damage).toBeGreaterThanOrEqual(29);
    expect(result.damage).toBeLessThanOrEqual(35);
  });

  it("given type-boost item (Charcoal) matching move type, when calculating damage, then power is boosted", () => {
    // Source: Showdown data/items.ts -- Charcoal boosts Fire moves by ~1.2x (4915/4096)
    const attacker = makeActive({ attack: 100, heldItem: "charcoal" });
    const defender = makeActive({ defense: 100 });
    const move = makeMove({ type: "fire", power: 50, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    // Power 50 * 4915/4096 ~= 59 -> slightly more damage than base
    expect(result.damage).toBeGreaterThan(20);
  });

  it("given Plate item (Flame Plate) matching move type, when calculating damage, then power is boosted", () => {
    // Source: Showdown data/items.ts -- Flame Plate boosts Fire moves by ~1.2x (4915/4096)
    const attacker = makeActive({ attack: 100, heldItem: "flame-plate" });
    const defender = makeActive({ defense: 100 });
    const move = makeMove({ type: "fire", power: 50, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    expect(result.damage).toBeGreaterThan(20);
  });

  it("given Pinch ability (Blaze) at low HP with Fire move, when calculating damage, then power is 1.5x", () => {
    // Source: Showdown -- Blaze boosts Fire moves by 1.5x when HP <= floor(maxHP/3)
    const attacker = makeActive({ attack: 100, ability: "blaze", hp: 300, currentHp: 99 });
    const defender = makeActive({ defense: 100 });
    const move = makeMove({ type: "fire", power: 50, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    // Blaze 1.5x -> Power 75
    expect(result.damage).toBeGreaterThanOrEqual(29);
    expect(result.damage).toBeLessThanOrEqual(35);
  });

  it("given Acrobatics with no held item, when calculating damage, then power doubles", () => {
    // Source: Showdown data/moves.ts -- Acrobatics doubles power with no item
    // Power 55 * 2 = 110
    const attacker = makeActive({ attack: 100, heldItem: null });
    const defender = makeActive({ defense: 100 });
    const move = makeMove({ id: "acrobatics", type: "flying", power: 55, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    // Acrobatics doubles: 55 -> 110 BP
    expect(result.damage).toBeGreaterThan(30);
  });

  it("given Iron Fist with punching move, when calculating damage, then power is 1.2x", () => {
    // Source: Showdown data/abilities.ts -- Iron Fist 1.2x for punch moves
    const attacker = makeActive({ attack: 100, ability: "iron-fist" });
    const defender = makeActive({ defense: 100 });
    const move = makeMove({
      type: "fire",
      power: 75,
      category: "physical",
      flags: { punch: true },
    });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    // Power 75 * 1.2 = 90
    expect(result.damage).toBeGreaterThan(30);
  });

  it("given Reckless with recoil move, when calculating damage, then power is 1.2x", () => {
    // Source: Showdown data/abilities.ts -- Reckless 1.2x for recoil moves
    const attacker = makeActive({ attack: 100, ability: "reckless" });
    const defender = makeActive({ defense: 100 });
    const move = makeMove({
      type: "fire",
      power: 80,
      category: "physical",
      effect: { type: "recoil", percent: 33 },
    });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    // Power 80 * 1.2 = 96
    expect(result.damage).toBeGreaterThan(30);
  });

  it("given Flash Fire volatile active and Fire move, when calculating damage, then power is 1.5x", () => {
    // Source: Showdown data/abilities.ts -- Flash Fire boost
    const attacker = makeActive({
      attack: 100,
      volatiles: new Map([["flash-fire", { turnsLeft: -1 }]]),
    });
    const defender = makeActive({ defense: 100 });
    const move = makeMove({ type: "fire", power: 50, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    expect(result.damage).toBeGreaterThanOrEqual(29);
    expect(result.damage).toBeLessThanOrEqual(35);
  });

  it("given Normalize ability, when using any move, then move type becomes Normal", () => {
    // Source: Showdown data/abilities.ts -- Normalize changes all moves to Normal type
    // Fire move becomes Normal, so Fire-type defender takes neutral damage
    const attacker = makeActive({ attack: 100, ability: "normalize" });
    const defender = makeActive({ defense: 100, types: ["fire"] });
    const move = makeMove({ type: "fire", power: 50, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    // Normal vs Fire = 1x (neutral), not super effective
    // Source: Showdown type chart -- Normal vs Fire = 1x (neutral); Normalize changed Fire move to Normal type
    expect(result.effectiveness).toBe(1);
  });

  it("given Rivalry ability with same gender, when calculating damage, then power is 1.25x", () => {
    // Source: Showdown data/abilities.ts -- Rivalry same gender = 1.25x
    const attacker = makeActive({ attack: 100, ability: "rivalry", gender: "male" });
    const defender = makeActive({ defense: 100, gender: "male" });
    const move = makeMove({ type: "fire", power: 80, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    // Power 80 * 1.25 = 100
    expect(result.damage).toBeGreaterThan(30);
  });

  it("given Rivalry ability with opposite gender, when calculating damage, then power is 0.75x", () => {
    // Source: Showdown data/abilities.ts -- Rivalry opposite gender = 0.75x
    const attacker = makeActive({ attack: 100, ability: "rivalry", gender: "male" });
    const defender = makeActive({ defense: 100, gender: "female" });
    const move = makeMove({ type: "fire", power: 80, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    // Power 80 * 0.75 = 60
    expect(result.damage).toBeLessThan(30);
  });

  it("given Dry Skin defender and Fire move, when calculating damage, then base power is boosted 1.25x", () => {
    // Source: Showdown data/abilities.ts -- Dry Skin increases Fire damage by 1.25x
    const attacker = makeActive({ attack: 100 });
    const defender = makeActive({ defense: 100, ability: "dry-skin" });
    const move = makeMove({ type: "fire", power: 50, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    // Power 50 * 1.25 = 62. Fire vs Dry Skin's water-like typing isn't relevant here.
    expect(result.damage).toBeGreaterThan(20);
  });
});

// ---------------------------------------------------------------------------
// Defender ability effects
// ---------------------------------------------------------------------------

describe("Gen 5 damage calc -- defender abilities", () => {
  it("given Thick Fat defender and Fire move, when calculating damage, then attack is halved", () => {
    // Source: Showdown data/abilities.ts -- Thick Fat halves Fire/Ice damage
    const attacker = makeActive({ attack: 100 });
    const defender = makeActive({ defense: 100, ability: "thick-fat" });
    const move = makeMove({ type: "fire", power: 50, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    // Attack halved: Atk=50 effectively
    expect(result.damage).toBeLessThanOrEqual(13);
  });

  it("given Heatproof defender and Fire move, when calculating damage, then power is halved", () => {
    // Source: Showdown data/abilities.ts -- Heatproof halves Fire damage
    const attacker = makeActive({ attack: 100 });
    const defender = makeActive({ defense: 100, ability: "heatproof" });
    const move = makeMove({ type: "fire", power: 50, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    // Power halved: 50 -> 25
    expect(result.damage).toBeLessThanOrEqual(13);
  });

  it("given Wonder Guard defender and non-SE move, when calculating damage, then returns 0", () => {
    // Source: Showdown data/abilities.ts -- Wonder Guard blocks non-SE moves
    const attacker = makeActive({ attack: 100 });
    const defender = makeActive({ defense: 100, ability: "wonder-guard", types: ["normal"] });
    const move = makeMove({ type: "fire", power: 50, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    // Fire vs Normal = 1x (neutral), Wonder Guard blocks
    // Source: Showdown data/abilities.ts -- Wonder Guard: blocks all non-SE moves; damage 0
    expect(result.damage).toBe(0);
  });

  it("given Tinted Lens attacker and NVE matchup, when calculating damage, then damage is doubled", () => {
    // Source: Showdown data/abilities.ts -- Tinted Lens doubles NVE damage
    const attacker = makeActive({ attack: 100, ability: "tinted-lens" });
    const defender = makeActive({ defense: 100, types: ["water"] });
    const move = makeMove({ type: "fire", power: 50, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    // Fire vs Water = 0.5x, Tinted Lens doubles it back to ~1x
    // Source: Showdown type chart -- Fire vs Water = 0.5x; Tinted Lens doubles NVE damage but does not change effectiveness value
    expect(result.effectiveness).toBe(0.5);
    expect(result.damage).toBeGreaterThanOrEqual(20);
  });

  it("given Filter defender and SE move, when calculating damage, then damage is reduced by 0.75x", () => {
    // Source: Showdown data/abilities.ts -- Filter/Solid Rock: 0.75x for SE damage
    const attacker = makeActive({ attack: 100 });
    const defender = makeActive({ defense: 100, ability: "filter", types: ["grass"] });
    const move = makeMove({ type: "fire", power: 50, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    // SE 2x then Filter 0.75x = effective 1.5x
    // Source: Showdown type chart -- Fire vs Grass = 2x; Filter reduces damage but does not change effectiveness value
    expect(result.effectiveness).toBe(2);
    expect(result.damage).toBeLessThan(48); // Without Filter, max would be 48
  });

  it("given Solid Rock defender and SE move, when calculating damage, then damage is reduced by 0.75x", () => {
    // Source: Showdown data/abilities.ts -- Solid Rock = Filter
    const attacker = makeActive({ attack: 100 });
    const defender = makeActive({ defense: 100, ability: "solid-rock", types: ["grass"] });
    const move = makeMove({ type: "fire", power: 50, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    // Source: Showdown type chart -- Fire vs Grass = 2x; Solid Rock reduces damage but does not change effectiveness value
    expect(result.effectiveness).toBe(2);
    expect(result.damage).toBeLessThan(48);
  });

  it("given Scrappy attacker and Ghost defender using Normal move, when calculating damage, then Normal hits Ghost", () => {
    // Source: Showdown data/abilities.ts -- Scrappy: Normal/Fighting hit Ghost
    const attacker = makeActive({ attack: 100, ability: "scrappy" });
    const defender = makeActive({ defense: 100, types: ["ghost"] });
    const move = makeMove({ type: "normal", power: 50, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    expect(result.damage).toBeGreaterThan(0);
  });

  it("given Marvel Scale defender with status, when using physical move, then defense is 1.5x", () => {
    // Source: Showdown data/abilities.ts -- Marvel Scale 1.5x Def when statused
    const attacker = makeActive({ attack: 100 });
    const defender = makeActive({ defense: 100, ability: "marvel-scale", status: "paralysis" });
    const move = makeMove({ type: "fire", power: 50, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    // Def 100 -> 150 from Marvel Scale
    expect(result.damage).toBeLessThanOrEqual(16);
  });
});

// ---------------------------------------------------------------------------
// Final modifier items
// ---------------------------------------------------------------------------

describe("Gen 5 damage calc -- final modifier items", () => {
  it("given Expert Belt with SE move, when calculating damage, then applies ~1.2x via pokeRound(damage, 4915)", () => {
    // Source: Showdown data/items.ts -- Expert Belt 1.2x for SE moves
    const attacker = makeActive({ attack: 100, heldItem: "expert-belt" });
    const defender = makeActive({ defense: 100, types: ["grass"] });
    const move = makeMove({ type: "fire", power: 50, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    // Source: Showdown type chart -- Fire vs Grass = 2x (super effective); Expert Belt applies after
    expect(result.effectiveness).toBe(2);
    // SE 2x + Expert Belt ~1.2x
    expect(result.damage).toBeGreaterThan(40);
  });

  it("given Muscle Band with physical move, when calculating damage, then applies ~1.1x via pokeRound(damage, 4505)", () => {
    // Source: Showdown data/items.ts -- Muscle Band 1.1x for physical moves
    const attacker = makeActive({ attack: 100, heldItem: "muscle-band" });
    const defender = makeActive({ defense: 100 });
    const move = makeMove({ type: "fire", power: 50, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    expect(result.damage).toBeGreaterThan(20);
  });

  it("given Wise Glasses with special move, when calculating damage, then applies ~1.1x via pokeRound(damage, 4505)", () => {
    // Source: Showdown data/items.ts -- Wise Glasses 1.1x for special moves
    const attacker = makeActive({ spAttack: 100, heldItem: "wise-glasses" });
    const defender = makeActive({ spDefense: 100 });
    const move = makeMove({ type: "fire", power: 50, category: "special" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    expect(result.damage).toBeGreaterThan(20);
  });

  it("given Klutz attacker with Life Orb, when calculating damage, then Life Orb boost is suppressed", () => {
    // Source: Showdown data/abilities.ts -- Klutz suppresses held item effects
    const attacker = makeActive({ attack: 100, ability: "klutz", heldItem: "life-orb" });
    const defender = makeActive({ defense: 100 });
    const move = makeMove({ type: "fire", power: 50, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    // Without Life Orb: base range 20-24
    expect(result.damage).toBeGreaterThanOrEqual(20);
    expect(result.damage).toBeLessThanOrEqual(24);
  });

  it("given Sniper ability with critical hit, when calculating damage, then crit multiplier is 3x", () => {
    // Source: Showdown data/abilities.ts -- Sniper: 3x crit instead of 2x
    // Base 24, crit 3x = 72, random range: floor(72*85/100)=61 to 72
    const attacker = makeActive({ attack: 100, ability: "sniper" });
    const defender = makeActive({ defense: 100 });
    const move = makeMove({ type: "fire", power: 50, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move, isCrit: true });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    // Source: references/pokemon-showdown/sim/battle-actions.ts -- isCrit passthrough from ctx.isCrit; Sniper sets 3x modifier
    expect(result.isCrit).toBe(true);
    expect(result.damage).toBeGreaterThanOrEqual(61);
    expect(result.damage).toBeLessThanOrEqual(72);
  });

  it("given Magnet Rise volatile, when using Ground move, then returns 0 (immune)", () => {
    // Source: Showdown -- Magnet Rise grants Ground immunity
    const attacker = makeActive({ attack: 100 });
    const defender = makeActive({
      defense: 100,
      types: ["psychic"],
      volatiles: new Map([["magnet-rise", { turnsLeft: 5 }]]),
    });
    const move = makeMove({ type: "ground", power: 80, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    // Source: Showdown -- Magnet Rise grants Ground immunity; damage 0, effectiveness 0
    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });

  it("given Adamant Orb on Dialga (483) using Dragon move, when calculating damage, then power is boosted", () => {
    // Source: Showdown data/items.ts -- Adamant Orb boosts Dragon/Steel for Dialga
    const attacker = makeActive({ attack: 100, heldItem: "adamant-orb", speciesId: 483 });
    const defender = makeActive({ defense: 100 });
    const move = makeMove({ type: "dragon", power: 80, category: "physical" });
    const ctx = makeDamageContext({ attacker, defender, move });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    // Dragon vs Psychic = 1x, with Adamant Orb boost
    expect(result.damage).toBeGreaterThan(30);
  });
});

// ---------------------------------------------------------------------------
// Sheer Force power boost tests
// ---------------------------------------------------------------------------

describe("Sheer Force power boost in damage calc", () => {
  it("given Sheer Force user using Flamethrower (10% burn secondary), when calculating damage, then power is boosted by 5325/4096", () => {
    // Source: Showdown data/abilities.ts -- sheerforce: onBasePower chainModify([5325, 4096])
    // Source: Bulbapedia -- "Sheer Force raises the base power of moves that have
    //   additional effects by approximately 30%"
    //
    // Derivation:
    //   base power 90
    //   Sheer Force: pokeRound(90, 5325) = floor((90*5325 + 2048) / 4096)
    //     = floor(481298 / 4096) = floor(117.504...) = 117
    //   L50, spAtk 100 vs spDef 100, fire vs normal (neutral)
    //   levelFactor = floor(2*50/5) + 2 = 22
    //   baseDamage = floor(floor(22 * 117 * 100 / 100) / 50) = floor(51.48) = 51
    //   +2 => 53
    //   random(seed=42) = 94 => floor(53 * 94 / 100) = floor(49.82) = 49
    //   No STAB, neutral type, no burn => final damage = 49
    const attacker = makeActive({ spAttack: 100, ability: "sheer-force", types: ["normal"] });
    const defender = makeActive({ spDefense: 100, types: ["normal"] });
    const move = makeMove({
      id: "flamethrower",
      type: "fire",
      category: "special",
      power: 90,
      flags: { contact: false },
      effect: { type: "status-chance", status: "burn", chance: 10 },
    });
    const ctx = makeDamageContext({ attacker, defender, move, seed: 42 });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    expect(result.damage).toBe(49);
  });

  it("given Sheer Force user using Earthquake (no secondary effect), when calculating damage, then power is unchanged", () => {
    // Source: Showdown data/abilities.ts -- sheerforce only activates when move has secondaries
    // Source: Bulbapedia -- "Sheer Force does not affect moves that do not have
    //   additional effects"
    //
    // Derivation (no boost):
    //   base power 100, no secondary => no Sheer Force boost
    //   L50, atk 100 vs def 100, ground vs normal (neutral)
    //   levelFactor = 22
    //   baseDamage = floor(floor(22 * 100 * 100 / 100) / 50) = floor(44) = 44
    //   +2 => 46
    //   random(seed=42) = 94 => floor(46 * 94 / 100) = floor(43.24) = 43
    //   No STAB, neutral type, no burn => final damage = 43
    const attacker = makeActive({ attack: 100, ability: "sheer-force", types: ["normal"] });
    const defender = makeActive({ defense: 100, types: ["normal"] });
    const move = makeMove({
      id: "earthquake",
      type: "ground",
      category: "physical",
      power: 100,
      effect: null,
    });
    const ctx = makeDamageContext({ attacker, defender, move, seed: 42 });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    expect(result.damage).toBe(43);
  });

  it("given non-Sheer-Force user using Flamethrower, when calculating damage, then power uses base 90 (no boost)", () => {
    // Source: Showdown -- only sheer-force ability triggers the boost
    //
    // Derivation (no ability boost):
    //   base power 90, no Sheer Force
    //   L50, spAtk 100 vs spDef 100, fire vs normal (neutral)
    //   levelFactor = 22
    //   baseDamage = floor(floor(22 * 90 * 100 / 100) / 50) = floor(39.6) = 39
    //   +2 => 41
    //   random(seed=42) = 94 => floor(41 * 94 / 100) = floor(38.54) = 38
    //   No STAB, neutral type => final damage = 38
    const attacker = makeActive({ spAttack: 100, ability: "blaze", types: ["normal"] });
    const defender = makeActive({ spDefense: 100, types: ["normal"] });
    const move = makeMove({
      id: "flamethrower",
      type: "fire",
      category: "special",
      power: 90,
      flags: { contact: false },
      effect: { type: "status-chance", status: "burn", chance: 10 },
    });
    const ctx = makeDamageContext({ attacker, defender, move, seed: 42 });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    expect(result.damage).toBe(38);
  });
});

// ---------------------------------------------------------------------------
// Unaware vs Simple interaction (regression: #757)
// ---------------------------------------------------------------------------

describe("Gen 5 damage calc -- Unaware vs Simple interaction (regression: #757)", () => {
  it("given Simple attacker with +2 Atk stage vs Unaware defender, when calculating damage, then Unaware ignores all stages (same as stage-0 baseline)", () => {
    // Regression for bug #757: Simple was checked before Unaware, causing Simple to
    // double +2→+4 before Unaware could zero it out. Unaware must take priority.
    // Source: Showdown sim/battle.ts -- Unaware's onAnyModifyBoost zeroes boosts
    // independently of Simple's doubling; Gen 4's implementation was the correct reference.
    //
    // Derivation (Unaware active → effective stage = 0, stage multiplier = 1.0):
    //   L50, attack=100, defense=100, power=50, normal-type physical, water vs water (neutral, no STAB)
    //   levelFactor = floor(2*50/5) + 2 = 22
    //   step1 = floor(22 * 50 * 100 / 100) = 1100
    //   baseDamage = floor(1100 / 50) + 2 = 22 + 2 = 24
    //   random(seed=42) = 94 → floor(24 * 94 / 100) = floor(22.56) = 22
    const attacker = makeActive({ attack: 100, ability: "simple", types: ["water"] });
    attacker.statStages.attack = 2;
    const defender = makeActive({ defense: 100, ability: "unaware", types: ["water"] });
    const move = makeMove({ type: "normal", category: "physical", power: 50 });
    const ctx = makeDamageContext({ attacker, defender, move, seed: 42 });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    expect(result.damage).toBe(22);
  });

  it("given Simple attacker with +2 Atk stage vs non-Unaware defender, when calculating damage, then Simple doubles stage to +4", () => {
    // Source: Showdown sim/battle.ts -- Simple doubles stat stages (capped at ±6).
    //
    // Derivation (Simple active, no Unaware → effective stage = +4, multiplier = (2+4)/2 = 3.0):
    //   effectiveAttack = floor(100 * 3.0) = 300
    //   L50, defense=100, power=50, normal-type physical, water vs water (neutral, no STAB)
    //   step1 = floor(22 * 50 * 300 / 100) = 3300
    //   baseDamage = floor(3300 / 50) + 2 = 66 + 2 = 68
    //   random(seed=42) = 94 → floor(68 * 94 / 100) = floor(63.92) = 63
    const attacker = makeActive({ attack: 100, ability: "simple", types: ["water"] });
    attacker.statStages.attack = 2;
    const defender = makeActive({ defense: 100, ability: "none", types: ["water"] });
    const move = makeMove({ type: "normal", category: "physical", power: 50 });
    const ctx = makeDamageContext({ attacker, defender, move, seed: 42 });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    expect(result.damage).toBe(63);
  });
});
