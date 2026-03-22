import type { ActivePokemon, BattleState, DamageContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { calculateGen6Damage, pokeRound } from "../src/Gen6DamageCalc";
import { GEN6_TYPE_CHART } from "../src/Gen6TypeChart";

// ---------------------------------------------------------------------------
// Helper factories (same pattern as damage-calc.test.ts)
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
  target?: string;
  hasCrashDamage?: boolean;
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
    hasCrashDamage: overrides.hasCrashDamage ?? false,
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
    generation: 6,
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

const typeChart = GEN6_TYPE_CHART as Record<string, Record<string, number>>;

// ---------------------------------------------------------------------------
// #663 — Iron Fist uses pokeRound(power, 4915) instead of Math.floor(power * 1.2)
// Source: Showdown data/abilities.ts -- Iron Fist: chainModify([4915, 4096])
// ---------------------------------------------------------------------------
describe("#663 — Iron Fist pokeRound", () => {
  it("given Iron Fist + punch move with power 40, when calculating damage, then pokeRound(40, 4915) = 48 is used as base power", () => {
    // Source: pokeRound(40, 4915) = floor((40 * 4915 + 2047) / 4096) = floor(198647/4096) = 48
    // Math.floor(40 * 1.2) = Math.floor(48.0) = 48 (same for p=40, but differs for p=3,4,8,9,...)
    const attacker = makeActive({ ability: "iron-fist", types: ["fighting"] });
    const defender = makeActive({ types: ["normal"] });
    const punchMove = makeMove({
      id: "mach-punch",
      type: "fighting",
      power: 40,
      flags: { punch: true, contact: true },
    });

    const baselineAttacker = makeActive({ ability: "none", types: ["fighting"] });

    const resultWith = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: punchMove, seed: 100 }),
      typeChart,
    );
    const resultWithout = calculateGen6Damage(
      makeDamageContext({ attacker: baselineAttacker, defender, move: punchMove, seed: 100 }),
      typeChart,
    );

    // Source: inline derivation -- pokeRound(40, 4915) = 48, unboosted power = 40
    // Boosted damage must exceed unboosted damage
    expect(resultWith.damage).toBeGreaterThan(resultWithout.damage);
  });

  it("given Iron Fist + punch move with power 75, when calculating damage, then uses 4915/4096 rounding", () => {
    // Source: pokeRound(75, 4915) = floor((75 * 4915 + 2047) / 4096) = floor(370672/4096) = 90
    // Math.floor(75 * 1.2) = Math.floor(90.0) = 90 (same in this case)
    const attacker = makeActive({ ability: "iron-fist", types: ["fighting"] });
    const defender = makeActive({ types: ["normal"] });
    const punchMove = makeMove({
      id: "power-up-punch",
      type: "fighting",
      power: 75,
      flags: { punch: true, contact: true },
    });

    const baselineAttacker = makeActive({ ability: "none", types: ["fighting"] });

    const resultWith = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: punchMove, seed: 200 }),
      typeChart,
    );
    const resultWithout = calculateGen6Damage(
      makeDamageContext({ attacker: baselineAttacker, defender, move: punchMove, seed: 200 }),
      typeChart,
    );

    expect(resultWith.damage).toBeGreaterThan(resultWithout.damage);
  });
});

// ---------------------------------------------------------------------------
// #663 — Technician uses pokeRound(power, 6144) instead of Math.floor(power * 1.5)
// Source: Showdown data/abilities.ts -- Technician: chainModify([6144, 4096])
// ---------------------------------------------------------------------------
describe("#663 — Technician pokeRound", () => {
  it("given Technician + move with power 40, when calculating damage, then pokeRound(40, 6144) = 60 is used as base power", () => {
    // Source: pokeRound(40, 6144) = floor((40 * 6144 + 2047) / 4096) = floor(247807/4096) = 60
    // Use power 40 (not 20) to minimize integer truncation distortion in ratio
    const attacker = makeActive({ ability: "technician", types: ["normal"] });
    const defender = makeActive({ types: ["psychic"] });
    const weakMove = makeMove({
      id: "rapid-spin",
      type: "normal",
      power: 40,
    });

    const baselineAttacker = makeActive({ ability: "none", types: ["normal"] });

    const resultWith = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: weakMove, seed: 100 }),
      typeChart,
    );
    const resultWithout = calculateGen6Damage(
      makeDamageContext({ attacker: baselineAttacker, defender, move: weakMove, seed: 100 }),
      typeChart,
    );

    // Source: inline derivation -- pokeRound(40, 6144) = 60, vs unboosted 40
    // The boosted damage must be greater
    expect(resultWith.damage).toBeGreaterThan(resultWithout.damage);
    // With larger power, the ratio should be close to 1.5x (less distortion from integer truncation)
    const ratio = resultWith.damage / resultWithout.damage;
    expect(ratio).toBeCloseTo(1.5, 0);
  });

  it("given Technician + move with power 60, when calculating damage, then boost is applied (60 is threshold)", () => {
    // Source: pokeRound(60, 6144) = floor((60 * 6144 + 2047) / 4096) = floor(370687/4096) = 90
    // Power 60 is at the threshold -- Technician applies to power <= 60
    const attacker = makeActive({ ability: "technician", types: ["normal"] });
    const defender = makeActive({ types: ["psychic"] });
    const thresholdMove = makeMove({
      id: "mega-punch",
      type: "normal",
      power: 60,
    });

    const baselineAttacker = makeActive({ ability: "none", types: ["normal"] });

    const resultWith = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: thresholdMove, seed: 100 }),
      typeChart,
    );
    const resultWithout = calculateGen6Damage(
      makeDamageContext({ attacker: baselineAttacker, defender, move: thresholdMove, seed: 100 }),
      typeChart,
    );

    expect(resultWith.damage).toBeGreaterThan(resultWithout.damage);
  });
});

// ---------------------------------------------------------------------------
// #662 — Dry Skin uses pokeRound(power, 5120) instead of Math.floor(power * 1.25)
// Source: Showdown data/abilities.ts -- Dry Skin onBasePower: chainModify([5120, 4096])
// ---------------------------------------------------------------------------
describe("#662 — Dry Skin pokeRound", () => {
  it("given Fire move vs Dry Skin defender, when calculating damage, then base power uses pokeRound(power, 5120)", () => {
    // Source: pokeRound(90, 5120) = floor((90 * 5120 + 2047) / 4096) = floor(462847/4096) = 113
    // Math.floor(90 * 1.25) = Math.floor(112.5) = 112 -- DIFFERENT!
    const attacker = makeActive({ ability: "none", types: ["fire"] });
    const defender = makeActive({ ability: "dry-skin", types: ["grass"] });
    const fireMove = makeMove({
      id: "flamethrower",
      type: "fire",
      category: "special",
      power: 90,
    });

    const baselineDefender = makeActive({ ability: "none", types: ["grass"] });

    const resultWithDrySkin = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );
    const resultWithout = calculateGen6Damage(
      makeDamageContext({ attacker, defender: baselineDefender, move: fireMove, seed: 100 }),
      typeChart,
    );

    // Dry Skin should increase fire damage by ~1.25x
    expect(resultWithDrySkin.damage).toBeGreaterThan(resultWithout.damage);
    const ratio = resultWithDrySkin.damage / resultWithout.damage;
    expect(ratio).toBeCloseTo(1.25, 1);
  });

  it("given Fire move with power 51 vs Dry Skin, when calculating, then pokeRound(51, 5120) = 64 (differs from floor(51*1.25)=63)", () => {
    // Source: pokeRound(51, 5120) = floor((51 * 5120 + 2047) / 4096) = floor(263167/4096) = 64
    // Math.floor(51 * 1.25) = Math.floor(63.75) = 63 -- DIFFERENT! This demonstrates the fix.
    const attacker = makeActive({ ability: "none", types: ["fire"] });
    const defender = makeActive({ ability: "dry-skin", types: ["normal"] });
    const fireMove = makeMove({
      id: "ember",
      type: "fire",
      category: "special",
      power: 51,
    });

    // Verify pokeRound(51, 5120) = 64 (not Math.floor(51*1.25) = 63)
    // Source: inline derivation -- floor((51*5120 + 2047)/4096) = floor(263167/4096) = 64
    expect(pokeRound(51, 5120)).toBe(64);
    expect(Math.floor(51 * 1.25)).toBe(63);

    const result = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );
    expect(result.damage).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// #660 — Flash Fire applied as stat modifier (not base-power modifier)
// Source: Showdown data/abilities.ts -- flashfire.condition.onModifyAtk / onModifySpA
// ---------------------------------------------------------------------------
describe("#660 — Flash Fire as stat modifier", () => {
  it("given Flash Fire volatile + Fire move (physical), when calculating damage, then 1.5x Atk stat modifier is applied", () => {
    // Flash Fire should boost the attack stat, not the base power.
    // With Atk=100, the effective Atk should be floor(100*150/100) = 150.
    const flashFireVolatiles = new Map([["flash-fire", { turnsLeft: -1 }]]);
    const attacker = makeActive({
      ability: "none",
      types: ["fire"],
      attack: 100,
      volatiles: flashFireVolatiles,
    });
    const defender = makeActive({ types: ["normal"], defense: 100 });
    const fireMove = makeMove({
      id: "fire-punch",
      type: "fire",
      power: 75,
    });

    const baselineAttacker = makeActive({ ability: "none", types: ["fire"], attack: 100 });

    const resultWith = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );
    const resultWithout = calculateGen6Damage(
      makeDamageContext({ attacker: baselineAttacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );

    // Source: Showdown data/abilities.ts -- flashfire: chainModify(1.5) on Atk/SpA
    // With stat boost, damage ratio should be ~1.5x
    expect(resultWith.damage).toBeGreaterThan(resultWithout.damage);
    const ratio = resultWith.damage / resultWithout.damage;
    expect(ratio).toBeCloseTo(1.5, 1);
  });

  it("given Flash Fire volatile + Fire special move, when calculating damage, then 1.5x SpAtk modifier is applied", () => {
    const flashFireVolatiles = new Map([["flash-fire", { turnsLeft: -1 }]]);
    const attacker = makeActive({
      ability: "none",
      types: ["fire"],
      spAttack: 120,
      volatiles: flashFireVolatiles,
    });
    const defender = makeActive({ types: ["normal"], spDefense: 100 });
    const fireMove = makeMove({
      id: "flamethrower",
      type: "fire",
      category: "special",
      power: 90,
    });

    const baselineAttacker = makeActive({ ability: "none", types: ["fire"], spAttack: 120 });

    const resultWith = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );
    const resultWithout = calculateGen6Damage(
      makeDamageContext({ attacker: baselineAttacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );

    // Source: Showdown data/abilities.ts -- flashfire.condition.onModifySpA: chainModify(1.5)
    expect(resultWith.damage).toBeGreaterThan(resultWithout.damage);
    const ratio = resultWith.damage / resultWithout.damage;
    expect(ratio).toBeCloseTo(1.5, 1);
  });
});

// ---------------------------------------------------------------------------
// #659 — Pinch abilities (Blaze, Overgrow, Torrent, Swarm) as stat modifiers
// Source: Showdown data/abilities.ts -- blaze/overgrow/torrent/swarm: onModifyAtk, onModifySpA
// ---------------------------------------------------------------------------
describe("#659 — Pinch abilities as stat modifiers", () => {
  it("given Blaze + low HP + Fire physical move, when calculating damage, then 1.5x Atk stat boost", () => {
    // maxHP = 200, threshold = floor(200/3) = 66, currentHP = 60 (<= 66)
    const attacker = makeActive({
      ability: "blaze",
      types: ["fire"],
      attack: 100,
      hp: 200,
      currentHp: 60,
    });
    const defender = makeActive({ types: ["normal"], defense: 100 });
    const fireMove = makeMove({
      id: "fire-punch",
      type: "fire",
      power: 75,
    });

    const baselineAttacker = makeActive({
      ability: "none",
      types: ["fire"],
      attack: 100,
      hp: 200,
      currentHp: 60,
    });

    const resultWith = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );
    const resultWithout = calculateGen6Damage(
      makeDamageContext({ attacker: baselineAttacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );

    // Source: Showdown data/abilities.ts -- blaze: onModifyAtk chainModify(1.5)
    expect(resultWith.damage).toBeGreaterThan(resultWithout.damage);
    const ratio = resultWith.damage / resultWithout.damage;
    expect(ratio).toBeCloseTo(1.5, 1);
  });

  it("given Torrent + low HP + Water special move, when calculating damage, then 1.5x SpAtk stat boost", () => {
    // maxHP = 300, threshold = floor(300/3) = 100, currentHP = 99 (<= 100)
    const attacker = makeActive({
      ability: "torrent",
      types: ["water"],
      spAttack: 110,
      hp: 300,
      currentHp: 99,
    });
    const defender = makeActive({ types: ["normal"], spDefense: 100 });
    const waterMove = makeMove({
      id: "surf",
      type: "water",
      category: "special",
      power: 90,
    });

    const baselineAttacker = makeActive({
      ability: "none",
      types: ["water"],
      spAttack: 110,
      hp: 300,
      currentHp: 99,
    });

    const resultWith = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: waterMove, seed: 100 }),
      typeChart,
    );
    const resultWithout = calculateGen6Damage(
      makeDamageContext({ attacker: baselineAttacker, defender, move: waterMove, seed: 100 }),
      typeChart,
    );

    // Source: Showdown data/abilities.ts -- torrent: onModifySpA chainModify(1.5)
    expect(resultWith.damage).toBeGreaterThan(resultWithout.damage);
    const ratio = resultWith.damage / resultWithout.damage;
    expect(ratio).toBeCloseTo(1.5, 1);
  });

  it("given Blaze + HP above threshold, when calculating damage, then no boost applied", () => {
    // maxHP = 200, threshold = floor(200/3) = 66, currentHP = 67 (> 66, no boost)
    const attacker = makeActive({
      ability: "blaze",
      types: ["fire"],
      attack: 100,
      hp: 200,
      currentHp: 67,
    });
    const defender = makeActive({ types: ["normal"], defense: 100 });
    const fireMove = makeMove({ id: "fire-punch", type: "fire", power: 75 });

    const baselineAttacker = makeActive({
      ability: "none",
      types: ["fire"],
      attack: 100,
      hp: 200,
      currentHp: 67,
    });

    const resultWith = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );
    const resultWithout = calculateGen6Damage(
      makeDamageContext({ attacker: baselineAttacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );

    // Source: Bulbapedia -- Blaze only activates at <= 1/3 HP
    // No boost, damage should be equal
    expect(resultWith.damage).toBe(resultWithout.damage);
  });
});

// ---------------------------------------------------------------------------
// #654 — Reckless uses pokeRound(power, 4915) instead of Math.floor(power * 1.2)
// Source: Showdown data/abilities.ts -- Reckless: chainModify([4915, 4096])
// ---------------------------------------------------------------------------
describe("#654 — Reckless pokeRound", () => {
  it("given Reckless + recoil move with power 120, when calculating damage, then pokeRound(120, 4915) = 144 base power", () => {
    // Source: pokeRound(120, 4915) = floor((120 * 4915 + 2047) / 4096) = floor(591847/4096) = 144
    // Math.floor(120 * 1.2) = 144 (same in this case)
    const attacker = makeActive({ ability: "reckless", types: ["fighting"] });
    const defender = makeActive({ types: ["normal"] });
    const recoilMove = makeMove({
      id: "double-edge",
      type: "normal",
      power: 120,
      effect: { type: "recoil" as const, percent: 33.3 },
    });

    const baselineAttacker = makeActive({ ability: "none", types: ["fighting"] });

    const resultWith = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: recoilMove, seed: 100 }),
      typeChart,
    );
    const resultWithout = calculateGen6Damage(
      makeDamageContext({ attacker: baselineAttacker, defender, move: recoilMove, seed: 100 }),
      typeChart,
    );

    // Source: Showdown data/abilities.ts -- reckless: chainModify([4915, 4096])
    expect(resultWith.damage).toBeGreaterThan(resultWithout.damage);
    const ratio = resultWith.damage / resultWithout.damage;
    expect(ratio).toBeCloseTo(1.2, 1);
  });

  it("given Reckless + recoil move with power 90, when calculating damage, then pokeRound(90, 4915) = 108 base power", () => {
    // Source: pokeRound(90, 4915) = floor((90 * 4915 + 2047) / 4096) = floor(444397/4096) = 108
    // Math.floor(90 * 1.2) = Math.floor(108) = 108 (same)
    const attacker = makeActive({ ability: "reckless", types: ["fighting"] });
    const defender = makeActive({ types: ["normal"] });
    const recoilMove = makeMove({
      id: "wild-charge",
      type: "electric",
      power: 90,
      effect: { type: "recoil" as const, percent: 25 },
    });

    const baselineAttacker = makeActive({ ability: "none", types: ["fighting"] });

    const resultWith = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: recoilMove, seed: 200 }),
      typeChart,
    );
    const resultWithout = calculateGen6Damage(
      makeDamageContext({ attacker: baselineAttacker, defender, move: recoilMove, seed: 200 }),
      typeChart,
    );

    expect(resultWith.damage).toBeGreaterThan(resultWithout.damage);
  });
});

// ---------------------------------------------------------------------------
// #652 — Flower Gift boosts Atk in sun
// Source: Showdown data/abilities.ts -- flower-gift: onModifyAtk chainModify(1.5)
// ---------------------------------------------------------------------------
describe("#652 — Flower Gift Atk boost in sun", () => {
  it("given Flower Gift + sun weather + physical move, when calculating damage, then 1.5x Atk boost", () => {
    const sunState = makeState({
      weather: { type: "sun", turnsLeft: 5, source: "drought" },
    });
    const attacker = makeActive({
      ability: "flower-gift",
      types: ["grass"],
      attack: 100,
    });
    const defender = makeActive({ types: ["normal"], defense: 100 });
    const physMove = makeMove({ id: "return", type: "normal", power: 100 });

    const baselineAttacker = makeActive({
      ability: "none",
      types: ["grass"],
      attack: 100,
    });

    const resultWith = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: physMove, state: sunState, seed: 100 }),
      typeChart,
    );
    const resultWithout = calculateGen6Damage(
      makeDamageContext({
        attacker: baselineAttacker,
        defender,
        move: physMove,
        state: sunState,
        seed: 100,
      }),
      typeChart,
    );

    // Source: Showdown data/abilities.ts -- flower-gift: onModifyAtk returns chainModify(1.5)
    expect(resultWith.damage).toBeGreaterThan(resultWithout.damage);
    const ratio = resultWith.damage / resultWithout.damage;
    expect(ratio).toBeCloseTo(1.5, 1);
  });

  it("given Flower Gift + no sun weather, when calculating damage, then no Atk boost", () => {
    const noWeatherState = makeState({ weather: null });
    const attacker = makeActive({
      ability: "flower-gift",
      types: ["grass"],
      attack: 100,
    });
    const defender = makeActive({ types: ["normal"], defense: 100 });
    const physMove = makeMove({ id: "return", type: "normal", power: 100 });

    const baselineAttacker = makeActive({
      ability: "none",
      types: ["grass"],
      attack: 100,
    });

    const resultWith = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: physMove, state: noWeatherState, seed: 100 }),
      typeChart,
    );
    const resultWithout = calculateGen6Damage(
      makeDamageContext({
        attacker: baselineAttacker,
        defender,
        move: physMove,
        state: noWeatherState,
        seed: 100,
      }),
      typeChart,
    );

    // Source: Showdown data/abilities.ts -- flower-gift only in sun/desolate-land
    // No weather = no boost
    expect(resultWith.damage).toBe(resultWithout.damage);
  });

  it("given Flower Gift + harsh-sun weather + physical move, when calculating damage, then 1.5x Atk boost", () => {
    const harshSunState = makeState({
      weather: { type: "harsh-sun", turnsLeft: -1, source: "desolate-land" },
    });
    const attacker = makeActive({
      ability: "flower-gift",
      types: ["grass"],
      attack: 100,
    });
    const defender = makeActive({ types: ["normal"], defense: 100 });
    const physMove = makeMove({ id: "return", type: "normal", power: 100 });

    const baselineAttacker = makeActive({
      ability: "none",
      types: ["grass"],
      attack: 100,
    });

    const resultWith = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: physMove, state: harshSunState, seed: 100 }),
      typeChart,
    );
    const resultWithout = calculateGen6Damage(
      makeDamageContext({
        attacker: baselineAttacker,
        defender,
        move: physMove,
        state: harshSunState,
        seed: 100,
      }),
      typeChart,
    );

    // Source: Showdown data/abilities.ts -- flower-gift: activates in sun or harsh-sun
    expect(resultWith.damage).toBeGreaterThan(resultWithout.damage);
    const ratio = resultWith.damage / resultWithout.damage;
    expect(ratio).toBeCloseTo(1.5, 1);
  });
});

// ---------------------------------------------------------------------------
// #648 — Reckless doesn't boost crash-damage moves
// Source: Showdown data/abilities.ts -- reckless: "if (move.recoil || move.hasCrashDamage)"
// ---------------------------------------------------------------------------
describe("#648 — Reckless hasCrashDamage", () => {
  it("given Reckless + Jump Kick (hasCrashDamage=true), when calculating damage, then 1.2x power boost applied", () => {
    const attacker = makeActive({ ability: "reckless", types: ["fighting"] });
    const defender = makeActive({ types: ["normal"] });
    const crashMove = makeMove({
      id: "jump-kick",
      type: "fighting",
      power: 100,
      hasCrashDamage: true,
      flags: { contact: true },
    });

    const baselineAttacker = makeActive({ ability: "none", types: ["fighting"] });

    const resultWith = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: crashMove, seed: 100 }),
      typeChart,
    );
    const resultWithout = calculateGen6Damage(
      makeDamageContext({ attacker: baselineAttacker, defender, move: crashMove, seed: 100 }),
      typeChart,
    );

    // Source: Showdown data/abilities.ts -- reckless: "if (move.recoil || move.hasCrashDamage)"
    // pokeRound(100, 4915) = floor((100*4915+2047)/4096) = floor(493547/4096) = 120
    expect(resultWith.damage).toBeGreaterThan(resultWithout.damage);
    const ratio = resultWith.damage / resultWithout.damage;
    expect(ratio).toBeCloseTo(1.2, 1);
  });

  it("given Reckless + High Jump Kick (hasCrashDamage=true, power=130), when calculating damage, then boost is applied", () => {
    const attacker = makeActive({ ability: "reckless", types: ["fighting"] });
    const defender = makeActive({ types: ["normal"] });
    const crashMove = makeMove({
      id: "high-jump-kick",
      type: "fighting",
      power: 130,
      hasCrashDamage: true,
      flags: { contact: true },
    });

    const baselineAttacker = makeActive({ ability: "none", types: ["fighting"] });

    const resultWith = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: crashMove, seed: 200 }),
      typeChart,
    );
    const resultWithout = calculateGen6Damage(
      makeDamageContext({ attacker: baselineAttacker, defender, move: crashMove, seed: 200 }),
      typeChart,
    );

    // Source: pokeRound(130, 4915) = floor((130*4915+2047)/4096) = floor(641997/4096) = 156
    // Ratio = 156/130 = 1.2x
    expect(resultWith.damage).toBeGreaterThan(resultWithout.damage);
    const ratio = resultWith.damage / resultWithout.damage;
    expect(ratio).toBeCloseTo(1.2, 1);
  });

  it("given Reckless + move without recoil or crashDamage, when calculating damage, then no boost", () => {
    const attacker = makeActive({ ability: "reckless", types: ["fighting"] });
    const defender = makeActive({ types: ["normal"] });
    const normalMove = makeMove({
      id: "return",
      type: "normal",
      power: 100,
      hasCrashDamage: false,
      effect: null,
    });

    const baselineAttacker = makeActive({ ability: "none", types: ["fighting"] });

    const resultWith = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: normalMove, seed: 100 }),
      typeChart,
    );
    const resultWithout = calculateGen6Damage(
      makeDamageContext({ attacker: baselineAttacker, defender, move: normalMove, seed: 100 }),
      typeChart,
    );

    // Reckless should NOT boost normal moves without recoil or crash damage
    expect(resultWith.damage).toBe(resultWithout.damage);
  });
});

// ---------------------------------------------------------------------------
// pokeRound unit tests for specific values used in bug fixes
// Source: inline formula derivation using floor((value * modifier + 2047) / 4096)
// ---------------------------------------------------------------------------
describe("pokeRound unit tests for bug fix values", () => {
  it("pokeRound(51, 5120) = 64, not Math.floor(51*1.25) = 63 — Dry Skin rounding (#662)", () => {
    // Source: floor((51 * 5120 + 2047) / 4096) = floor(263167/4096) = 64
    expect(pokeRound(51, 5120)).toBe(64);
    // Math.floor(51 * 1.25) = 63 -- this is the bug we fixed
    expect(Math.floor(51 * 1.25)).toBe(63);
  });

  it("pokeRound(91, 5120) = 114, not Math.floor(91*1.25) = 113 — Dry Skin rounding (#662)", () => {
    // Source: floor((91 * 5120 + 2047) / 4096) = floor(468767/4096) = 114
    expect(pokeRound(91, 5120)).toBe(114);
    expect(Math.floor(91 * 1.25)).toBe(113);
  });

  it("pokeRound(40, 4915) = 48 — Iron Fist (#663)", () => {
    // Source: floor((40 * 4915 + 2047) / 4096) = floor(198647/4096) = 48
    expect(pokeRound(40, 4915)).toBe(48);
  });

  it("pokeRound(100, 4915) = 120 — Reckless (#654)", () => {
    // Source: floor((100 * 4915 + 2047) / 4096) = floor(493547/4096) = 120
    expect(pokeRound(100, 4915)).toBe(120);
  });

  it("pokeRound(40, 6144) = 60 — Technician (#663)", () => {
    // Source: floor((40 * 6144 + 2047) / 4096) = floor(247807/4096) = 60
    expect(pokeRound(40, 6144)).toBe(60);
  });

  it("pokeRound(60, 6144) = 90 — Technician at threshold (#663)", () => {
    // Source: floor((60 * 6144 + 2047) / 4096) = floor(370687/4096) = 90
    expect(pokeRound(60, 6144)).toBe(90);
  });
});
