/**
 * Gen 9 (Scarlet/Violet) damage-modifying abilities tests.
 *
 * Covers:
 *   1. Supreme Overlord (new Gen 9): power boost based on fainted allies
 *   2. Orichalcum Pulse (new Gen 9): 5461/4096 Atk in Sun
 *   3. Hadron Engine (new Gen 9): 5461/4096 SpA on Electric Terrain
 *   4. Protean / Libero (Gen 9 nerf): once per switchin
 *   5. Intrepid Sword / Dauntless Shield (Gen 9 nerf): once per battle
 *   6. Fluffy: halves contact, doubles fire
 *   7. Ice Scales: halves special damage
 *   8. Inherited damage abilities: Filter/Solid Rock, Multiscale/Shadow Shield,
 *      Tinted Lens, Sheer Force, -ate abilities, Tough Claws, Strong Jaw,
 *      Mega Launcher, Iron Fist, Reckless, Parental Bond, Fur Coat
 *   9. Integration with calculateGen9Damage for Supreme Overlord,
 *      Orichalcum Pulse, Hadron Engine, Fluffy, Ice Scales
 *
 * Source: Showdown data/abilities.ts -- Gen 9 ability handlers
 * Source: Bulbapedia -- individual ability articles
 */
import type { ActivePokemon, BattleState, DamageContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType, VolatileStatus } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  getAteAbilityOverride,
  getFluffyModifier,
  getFurCoatMultiplier,
  getHadronEngineSpAModifier,
  getIceScalesModifier,
  getMegaLauncherMultiplier,
  getMultiscaleMultiplier,
  getOrichalcumPulseAtkModifier,
  getSheerForceMultiplier,
  getStrongJawMultiplier,
  getSturdyDamageCap,
  getSupremeOverlordModifier,
  getToughClawsMultiplier,
  handleGen9DamageCalcAbility,
  handleGen9DamageImmunityAbility,
  handleGen9DauntlessShield,
  handleGen9IntrepidSword,
  handleGen9ProteanTypeChange,
  hasSheerForceEligibleEffect,
  isParentalBondEligible,
  isSheerForceEligibleMove,
  SUPREME_OVERLORD_TABLE,
  sheerForceSuppressesLifeOrb,
  sturdyBlocksOHKO,
} from "../src/Gen9AbilitiesDamage";
import { calculateGen9Damage, pokeRound } from "../src/Gen9DamageCalc";
import { GEN9_TYPE_CHART } from "../src/Gen9TypeChart";

// Source: Showdown damage engine fixed-point arithmetic uses 4096 as the identity modifier.
const FIXED_POINT_IDENTITY = 4096;
// Source: Showdown data/abilities.ts -- Gen 7+ -ate abilities use chainModify([4915, 4096]).
const GEN7_PLUS_ATE_MODIFIER = 4915 / FIXED_POINT_IDENTITY;
// Source: the local makeActive helper defaults max HP to 200 unless overridden.
const DEFAULT_HP_FIXTURE = 200;
const TEST_ABILITY_IDS = {
  blaze: "blaze",
  sturdy: "sturdy",
} as const;

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
  isTerastallized?: boolean;
  teraType?: PokemonType | null;
  movedThisTurn?: boolean;
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
    types: overrides.types ?? ["normal"],
    ability: overrides.ability ?? "none",
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: 0,
    movedThisTurn: overrides.movedThisTurn ?? false,
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
    generation: 9,
    critRatio: overrides.critRatio ?? 0,
    hasCrashDamage: overrides.hasCrashDamage ?? false,
  } as MoveData;
}

function makeState(overrides?: {
  weather?: { type: string; turnsLeft: number; source: string } | null;
  terrain?: { type: string; turnsLeft: number; source: string } | null;
  format?: string;
  gravity?: { active: boolean; turnsLeft: number };
  magicRoom?: { active: boolean; turnsLeft: number };
  sides?: unknown[];
}): BattleState {
  return {
    weather: overrides?.weather ?? null,
    terrain: overrides?.terrain ?? null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: overrides?.magicRoom ?? { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: overrides?.gravity ?? { active: false, turnsLeft: 0 },
    format: overrides?.format ?? "singles",
    generation: 9,
    turnNumber: 1,
    sides: overrides?.sides ?? [{}, {}],
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
// Supreme Overlord
// ===========================================================================

describe("Supreme Overlord", () => {
  describe("getSupremeOverlordModifier", () => {
    it("given 0 fainted allies and Supreme Overlord, when getting modifier, then returns 4096 (no boost)", () => {
      // Source: Showdown data/abilities.ts:4649 -- powMod[0] = 4096
      const mod = getSupremeOverlordModifier("supreme-overlord", 0);
      expect(mod).toBe(4096);
    });

    it("given 1 fainted ally and Supreme Overlord, when getting modifier, then returns 4506 (~10% boost)", () => {
      // Source: Showdown data/abilities.ts:4649 -- powMod[1] = 4506
      const mod = getSupremeOverlordModifier("supreme-overlord", 1);
      expect(mod).toBe(4506);
    });

    it("given 2 fainted allies and Supreme Overlord, when getting modifier, then returns 4915 (~20% boost)", () => {
      // Source: Showdown data/abilities.ts:4649 -- powMod[2] = 4915
      const mod = getSupremeOverlordModifier("supreme-overlord", 2);
      expect(mod).toBe(4915);
    });

    it("given 3 fainted allies and Supreme Overlord, when getting modifier, then returns 5325 (~30% boost)", () => {
      // Source: Showdown data/abilities.ts:4649 -- powMod[3] = 5325
      const mod = getSupremeOverlordModifier("supreme-overlord", 3);
      expect(mod).toBe(5325);
    });

    it("given 4 fainted allies and Supreme Overlord, when getting modifier, then returns 5734 (~40% boost)", () => {
      // Source: Showdown data/abilities.ts:4649 -- powMod[4] = 5734
      const mod = getSupremeOverlordModifier("supreme-overlord", 4);
      expect(mod).toBe(5734);
    });

    it("given 5 fainted allies and Supreme Overlord, when getting modifier, then returns 6144 (50% cap)", () => {
      // Source: Showdown data/abilities.ts:4649 -- powMod[5] = 6144
      const mod = getSupremeOverlordModifier("supreme-overlord", 5);
      expect(mod).toBe(6144);
    });

    it("given 6 fainted allies (over cap), when getting modifier, then returns 6144 (capped at 5)", () => {
      // Source: Showdown data/abilities.ts:4638 -- Math.min(pokemon.side.totalFainted, 5)
      const mod = getSupremeOverlordModifier("supreme-overlord", 6);
      expect(mod).toBe(6144);
    });

    it("given non-Supreme Overlord ability, when getting modifier, then returns 4096 (no effect)", () => {
      const mod = getSupremeOverlordModifier(TEST_ABILITY_IDS.blaze, 5);
      expect(mod).toBe(FIXED_POINT_IDENTITY);
    });
  });

  describe("SUPREME_OVERLORD_TABLE", () => {
    it("has exactly 6 entries matching Showdown powMod array", () => {
      // Source: Showdown data/abilities.ts:4649 -- const powMod = [4096, 4506, 4915, 5325, 5734, 6144]
      expect(SUPREME_OVERLORD_TABLE).toEqual([
        FIXED_POINT_IDENTITY,
        4506,
        4915,
        5325,
        5734,
        6144,
      ]);
    });
  });

  describe("integration with calculateGen9Damage", () => {
    it("given 3 fainted allies, when calculating damage with Supreme Overlord, then power is boosted by ~30%", () => {
      const attacker = makeActive({ ability: "supreme-overlord", types: ["dark", "steel"] });
      const defender = makeActive({});
      const move = makeMove({ type: "dark", power: 100, flags: { contact: false } });

      const sides = [
        { active: [attacker], faintCount: 3, screens: [] },
        { active: [defender], faintCount: 0, screens: [] },
      ];
      const state = makeState({ sides });
      const ctx = makeDamageContext({ attacker, defender, move, state, seed: 100 });
      const resultBoosted = calculateGen9Damage(ctx, typeChart);

      // Compare with no ability
      const attackerNoAbility = makeActive({ ability: "none", types: ["dark", "steel"] });
      const sidesNoAbility = [
        { active: [attackerNoAbility], faintCount: 3, screens: [] },
        { active: [defender], faintCount: 0, screens: [] },
      ];
      const stateNoAbility = makeState({ sides: sidesNoAbility });
      const ctxNoAbility = makeDamageContext({
        attacker: attackerNoAbility,
        defender,
        move,
        state: stateNoAbility,
        seed: 100,
      });
      const resultNormal = calculateGen9Damage(ctxNoAbility, typeChart);

      // Supreme Overlord with 3 fainted = 5325/4096 ~= 1.2998x boost on base power
      // The boosted damage should be noticeably higher
      // Source: Showdown data/abilities.ts:4649 -- powMod[3] = 5325
      expect(resultBoosted.damage).toBeGreaterThan(resultNormal.damage);

      // Verify the ratio is approximately 1.3x (5325/4096)
      // pokeRound(power, 5325) for power=100: floor((100*5325 + 2047)/4096) = floor(534547/4096) = 130
      // So effective power = 130 vs 100
      const ratio = resultBoosted.damage / resultNormal.damage;
      expect(ratio).toBeGreaterThan(1.25);
      expect(ratio).toBeLessThan(1.35);
    });

    it("given 0 fainted allies, when calculating damage with Supreme Overlord, then no boost applied", () => {
      const attacker = makeActive({ ability: "supreme-overlord", types: ["dark", "steel"] });
      const defender = makeActive({});
      const move = makeMove({ type: "dark", power: 100, flags: { contact: false } });

      const sides = [
        { active: [attacker], faintCount: 0, screens: [] },
        { active: [defender], faintCount: 0, screens: [] },
      ];
      const state = makeState({ sides });
      const ctx = makeDamageContext({ attacker, defender, move, state, seed: 100 });
      const resultBoosted = calculateGen9Damage(ctx, typeChart);

      const attackerNoAbility = makeActive({ ability: "none", types: ["dark", "steel"] });
      const sidesNoAbility = [
        { active: [attackerNoAbility], faintCount: 0, screens: [] },
        { active: [defender], faintCount: 0, screens: [] },
      ];
      const stateNoAbility = makeState({ sides: sidesNoAbility });
      const ctxNoAbility = makeDamageContext({
        attacker: attackerNoAbility,
        defender,
        move,
        state: stateNoAbility,
        seed: 100,
      });
      const resultNormal = calculateGen9Damage(ctxNoAbility, typeChart);

      // Source: Showdown -- powMod[0] = 4096, so 4096/4096 = no boost
      expect(resultBoosted.damage).toBe(resultNormal.damage);
    });
  });
});

// ===========================================================================
// Orichalcum Pulse
// ===========================================================================

describe("Orichalcum Pulse", () => {
  describe("getOrichalcumPulseAtkModifier", () => {
    it("given Sun weather + Orichalcum Pulse, when getting modifier, then returns 5461", () => {
      // Source: Showdown data/abilities.ts:3028 -- chainModify([5461, 4096])
      const mod = getOrichalcumPulseAtkModifier("orichalcum-pulse", "sun");
      expect(mod).toBe(5461);
    });

    it("given harsh-sun (Desolate Land) weather + Orichalcum Pulse, when getting modifier, then returns 5461", () => {
      // Source: Showdown data/abilities.ts:3026 -- ['sunnyday', 'desolateland'].includes(...)
      const mod = getOrichalcumPulseAtkModifier("orichalcum-pulse", "harsh-sun");
      expect(mod).toBe(5461);
    });

    it("given no weather + Orichalcum Pulse, when getting modifier, then returns 4096 (no boost)", () => {
      // 4096 = identity modifier in the 4096-based system (no multiplication effect)
      // Source: Showdown data/abilities.ts -- orichalcumpulse: no modification when not in Sun/Harsh Sun
      const mod = getOrichalcumPulseAtkModifier("orichalcum-pulse", null);
      expect(mod).toBe(4096);
    });

    it("given rain weather + Orichalcum Pulse, when getting modifier, then returns 4096 (no boost)", () => {
      // 4096 = identity modifier in the 4096-based system (no multiplication effect)
      // Source: Showdown data/abilities.ts -- orichalcumpulse: only activates in ['sunnyday', 'desolateland']
      const mod = getOrichalcumPulseAtkModifier("orichalcum-pulse", "rain");
      expect(mod).toBe(4096);
    });

    it("given non-Orichalcum Pulse ability in sun, when getting modifier, then returns 4096 (no effect)", () => {
      // 4096 = identity modifier in the 4096-based system (no multiplication effect)
      // Source: Showdown data/abilities.ts -- orichalcumpulse: checks ability === 'orichalcumpulse'
      const mod = getOrichalcumPulseAtkModifier("blaze", "sun");
      expect(mod).toBe(4096);
    });
  });

  describe("integration with calculateGen9Damage", () => {
    it("given Orichalcum Pulse in Sun, when calculating physical damage, then Atk is boosted by ~33.3%", () => {
      const attacker = makeActive({
        ability: "orichalcum-pulse",
        attack: 150,
        types: ["fire", "dragon"],
      });
      const defender = makeActive({ defense: 100 });
      const move = makeMove({
        type: "fire",
        power: 80,
        category: "physical",
        flags: { contact: false },
      });
      const state = makeState({
        weather: { type: "sun", turnsLeft: 5, source: "orichalcum-pulse" },
      });
      const ctx = makeDamageContext({ attacker, defender, move, state, seed: 100 });
      const resultBoosted = calculateGen9Damage(ctx, typeChart);

      // Without the ability, same stats
      const attackerNoAbility = makeActive({
        ability: "none",
        attack: 150,
        types: ["fire", "dragon"],
      });
      const ctxNoAbility = makeDamageContext({
        attacker: attackerNoAbility,
        defender,
        move,
        state,
        seed: 100,
      });
      const resultNormal = calculateGen9Damage(ctxNoAbility, typeChart);

      // Both get Sun boost on Fire, but Orichalcum Pulse additionally boosts Atk stat
      // Source: Showdown -- Orichalcum Pulse: chainModify([5461, 4096]) on Atk
      // Effective Atk: floor((150 * 5461 + 2047) / 4096) = floor(821197/4096) = 200
      // vs base 150
      expect(resultBoosted.damage).toBeGreaterThan(resultNormal.damage);
    });

    it("given Orichalcum Pulse with no Sun, when calculating physical damage, then no Atk boost", () => {
      const attacker = makeActive({
        ability: "orichalcum-pulse",
        attack: 150,
        types: ["fire", "dragon"],
      });
      const defender = makeActive({ defense: 100 });
      const move = makeMove({
        type: "fire",
        power: 80,
        category: "physical",
        flags: { contact: false },
      });
      const state = makeState(); // no weather
      const ctx = makeDamageContext({ attacker, defender, move, state, seed: 100 });
      const resultOrichalcum = calculateGen9Damage(ctx, typeChart);

      const attackerNoAbility = makeActive({
        ability: "none",
        attack: 150,
        types: ["fire", "dragon"],
      });
      const ctxNoAbility = makeDamageContext({
        attacker: attackerNoAbility,
        defender,
        move,
        state,
        seed: 100,
      });
      const resultNormal = calculateGen9Damage(ctxNoAbility, typeChart);

      // Same damage -- no weather = no Orichalcum Pulse boost
      expect(resultOrichalcum.damage).toBe(resultNormal.damage);
    });
  });
});

// ===========================================================================
// Hadron Engine
// ===========================================================================

describe("Hadron Engine", () => {
  describe("getHadronEngineSpAModifier", () => {
    it("given Electric Terrain + Hadron Engine, when getting modifier, then returns 5461", () => {
      // Source: Showdown data/abilities.ts:1735 -- chainModify([5461, 4096])
      const mod = getHadronEngineSpAModifier("hadron-engine", "electric");
      expect(mod).toBe(5461);
    });

    it("given no terrain + Hadron Engine, when getting modifier, then returns 4096 (no boost)", () => {
      const mod = getHadronEngineSpAModifier("hadron-engine", null);
      expect(mod).toBe(FIXED_POINT_IDENTITY);
    });

    it("given Grassy Terrain + Hadron Engine, when getting modifier, then returns 4096 (wrong terrain)", () => {
      const mod = getHadronEngineSpAModifier("hadron-engine", "grassy");
      expect(mod).toBe(FIXED_POINT_IDENTITY);
    });

    it("given non-Hadron Engine ability on Electric Terrain, when getting modifier, then returns 4096", () => {
      const mod = getHadronEngineSpAModifier(TEST_ABILITY_IDS.blaze, "electric");
      expect(mod).toBe(FIXED_POINT_IDENTITY);
    });
  });

  describe("integration with calculateGen9Damage", () => {
    it("given Hadron Engine on Electric Terrain, when calculating special damage, then SpA is boosted by ~33.3%", () => {
      const attacker = makeActive({
        ability: "hadron-engine",
        spAttack: 150,
        types: ["electric", "dragon"],
      });
      const defender = makeActive({ spDefense: 100 });
      const move = makeMove({
        type: "electric",
        power: 80,
        category: "special",
        flags: { contact: false },
      });
      const state = makeState({
        terrain: { type: "electric", turnsLeft: 5, source: "hadron-engine" },
      });
      const ctx = makeDamageContext({ attacker, defender, move, state, seed: 100 });
      const resultBoosted = calculateGen9Damage(ctx, typeChart);

      const attackerNoAbility = makeActive({
        ability: "none",
        spAttack: 150,
        types: ["electric", "dragon"],
      });
      const ctxNoAbility = makeDamageContext({
        attacker: attackerNoAbility,
        defender,
        move,
        state,
        seed: 100,
      });
      const resultNormal = calculateGen9Damage(ctxNoAbility, typeChart);

      // Both get Electric Terrain boost on Electric move, but Hadron Engine adds SpA boost
      // Source: Showdown -- Hadron Engine: chainModify([5461, 4096]) on SpA
      expect(resultBoosted.damage).toBeGreaterThan(resultNormal.damage);
    });
  });
});

// ===========================================================================
// Protean / Libero (Gen 9 nerf: once per switchin)
// ===========================================================================

describe("Protean / Libero (Gen 9 nerf)", () => {
  it("given Protean Pokemon using Fire move for first time this switchin, when handling type change, then type changes to Fire", () => {
    // Source: Showdown data/abilities.ts -- protean: onPrepareHit
    const pokemon = makeActive({ ability: "protean", types: ["water"] });
    const events = handleGen9ProteanTypeChange(pokemon, "fire", 0);

    expect(events.length).toBe(1);
    expect(events[0].types).toEqual(["fire"]);
    expect(pokemon.types).toEqual(["fire"]);
    expect(pokemon.volatileStatuses.has("protean-used" as VolatileStatus)).toBe(true);
  });

  it("given Protean Pokemon using second move this switchin, when handling type change, then type does NOT change", () => {
    // Source: Showdown data/abilities.ts -- protean: if (this.effectState.protean) return;
    const pokemon = makeActive({ ability: "protean", types: ["fire"] });
    // Simulate first use
    pokemon.volatileStatuses.set("protean-used" as VolatileStatus, { turnsLeft: -1 });

    const events = handleGen9ProteanTypeChange(pokemon, "water", 0);

    expect(events.length).toBe(0);
    expect(pokemon.types).toEqual(["fire"]); // unchanged
  });

  it("given Libero Pokemon using Grass move, when handling type change, then type changes to Grass", () => {
    // Source: Showdown data/abilities.ts -- libero: same logic as protean
    const pokemon = makeActive({ ability: "libero", types: ["fire"] });
    const events = handleGen9ProteanTypeChange(pokemon, "grass", 1);

    expect(events.length).toBe(1);
    expect(events[0].types).toEqual(["grass"]);
    expect(pokemon.types).toEqual(["grass"]);
  });

  it("given Protean Pokemon already that type, when handling type change, then no event (already correct type)", () => {
    // Source: Showdown data/abilities.ts -- protean: source.getTypes().join() !== type check
    const pokemon = makeActive({ ability: "protean", types: ["fire"] });
    const events = handleGen9ProteanTypeChange(pokemon, "fire", 0);

    expect(events.length).toBe(0);
    // protean-used is NOT set if no change happened
    expect(pokemon.volatileStatuses.has("protean-used" as VolatileStatus)).toBe(false);
  });

  it("given non-Protean/Libero Pokemon, when handling type change, then no effect", () => {
    const pokemon = makeActive({ ability: "blaze", types: ["fire"] });
    const events = handleGen9ProteanTypeChange(pokemon, "water", 0);

    expect(events.length).toBe(0);
    expect(pokemon.types).toEqual(["fire"]);
  });
});

// ===========================================================================
// Intrepid Sword (Gen 9 nerf: once per battle)
// ===========================================================================

describe("Intrepid Sword (Gen 9 nerf)", () => {
  it("given fresh switch-in with Intrepid Sword, when ability triggers, then returns true (should boost Atk +1)", () => {
    // Source: Showdown data/abilities.ts -- intrepidsword: onStart: if (pokemon.swordBoost) return; pokemon.swordBoost = true;
    const pokemon = makeActive({ ability: "intrepid-sword" });
    const result = handleGen9IntrepidSword(pokemon);

    expect(result).toBe(true);
    // Flag stored on PokemonInstance (persists through switches), not volatileStatuses
    expect(pokemon.pokemon.swordBoost).toBe(true);
  });

  it("given Intrepid Sword already used this battle, when ability would trigger again, then returns false (blocked)", () => {
    // Source: Showdown data/abilities.ts -- intrepidsword: if (pokemon.swordBoost) return;
    // Persistent flag on PokemonInstance prevents re-activation even after switch-out/in
    const pokemon = makeActive({ ability: "intrepid-sword" });
    pokemon.pokemon.swordBoost = true;
    const result = handleGen9IntrepidSword(pokemon);

    expect(result).toBe(false);
  });

  it("given non-Intrepid Sword ability, when ability check runs, then returns false", () => {
    const pokemon = makeActive({ ability: "blaze" });
    const result = handleGen9IntrepidSword(pokemon);

    expect(result).toBe(false);
  });

  it("given Intrepid Sword activated, when switched out and back in (volatiles cleared), then ability is still blocked (once per battle)", () => {
    // Source: Showdown data/abilities.ts -- swordBoost stored on pokemon (PokemonInstance), not as volatile
    // This verifies the flag persists through switch-out (BaseRuleset.onSwitchOut clears volatileStatuses).
    const pokemon = makeActive({ ability: "intrepid-sword" });
    handleGen9IntrepidSword(pokemon);
    expect(pokemon.pokemon.swordBoost).toBe(true);

    // Simulate switch-out: clear volatile statuses (as BaseRuleset.onSwitchOut does)
    pokemon.volatileStatuses.clear();

    // swordBoost should still block re-activation — it lives on PokemonInstance
    const result = handleGen9IntrepidSword(pokemon);
    expect(result).toBe(false);
  });
});

// ===========================================================================
// Dauntless Shield (Gen 9 nerf: once per battle)
// ===========================================================================

describe("Dauntless Shield (Gen 9 nerf)", () => {
  it("given fresh switch-in with Dauntless Shield, when ability triggers, then returns true (should boost Def +1)", () => {
    // Source: Showdown data/abilities.ts -- dauntlessshield: onStart: if (pokemon.shieldBoost) return; pokemon.shieldBoost = true;
    const pokemon = makeActive({ ability: "dauntless-shield" });
    const result = handleGen9DauntlessShield(pokemon);

    expect(result).toBe(true);
    // Flag stored on PokemonInstance (persists through switches), not volatileStatuses
    expect(pokemon.pokemon.shieldBoost).toBe(true);
  });

  it("given Dauntless Shield already used this battle, when ability would trigger again, then returns false (blocked)", () => {
    // Source: Showdown data/abilities.ts -- dauntlessshield: if (pokemon.shieldBoost) return;
    // Persistent flag on PokemonInstance prevents re-activation even after switch-out/in
    const pokemon = makeActive({ ability: "dauntless-shield" });
    pokemon.pokemon.shieldBoost = true;
    const result = handleGen9DauntlessShield(pokemon);

    expect(result).toBe(false);
  });

  it("given non-Dauntless Shield ability, when ability check runs, then returns false", () => {
    const pokemon = makeActive({ ability: "blaze" });
    const result = handleGen9DauntlessShield(pokemon);

    expect(result).toBe(false);
  });

  it("given Dauntless Shield activated, when switched out and back in (volatiles cleared), then ability is still blocked (once per battle)", () => {
    // Source: Showdown data/abilities.ts -- shieldBoost stored on pokemon (PokemonInstance), not as volatile
    // This verifies the flag persists through switch-out (BaseRuleset.onSwitchOut clears volatileStatuses).
    const pokemon = makeActive({ ability: "dauntless-shield" });
    handleGen9DauntlessShield(pokemon);
    expect(pokemon.pokemon.shieldBoost).toBe(true);

    // Simulate switch-out: clear volatile statuses (as BaseRuleset.onSwitchOut does)
    pokemon.volatileStatuses.clear();

    // shieldBoost should still block re-activation — it lives on PokemonInstance
    const result = handleGen9DauntlessShield(pokemon);
    expect(result).toBe(false);
  });
});

// ===========================================================================
// Fluffy
// ===========================================================================

describe("Fluffy", () => {
  describe("getFluffyModifier", () => {
    it("given Fluffy defender hit by contact non-fire move, when getting modifier, then returns 2048 (0.5x)", () => {
      // Source: Showdown data/abilities.ts -- fluffy: if (move.flags['contact']) mod /= 2
      const mod = getFluffyModifier("fluffy", "normal", true);
      expect(mod).toBe(2048);
    });

    it("given Fluffy defender hit by fire non-contact move, when getting modifier, then returns 8192 (2.0x)", () => {
      // Source: Showdown data/abilities.ts -- fluffy: if (move.type === 'Fire') mod *= 2
      const mod = getFluffyModifier("fluffy", "fire", false);
      expect(mod).toBe(8192);
    });

    it("given Fluffy defender hit by fire contact move, when getting modifier, then returns 4096 (1.0x, cancel out)", () => {
      // Source: Showdown data/abilities.ts -- fluffy: both mods apply and cancel
      // 1 * 2 (fire) / 2 (contact) = 1.0x
      const mod = getFluffyModifier("fluffy", "fire", true);
      expect(mod).toBe(4096);
    });

    it("given Fluffy defender hit by non-fire non-contact move, when getting modifier, then returns 4096 (no effect)", () => {
      const mod = getFluffyModifier("fluffy", "normal", false);
      expect(mod).toBe(FIXED_POINT_IDENTITY);
    });

    it("given non-Fluffy defender, when getting modifier, then returns 4096 regardless", () => {
      const mod = getFluffyModifier(TEST_ABILITY_IDS.blaze, "fire", true);
      expect(mod).toBe(FIXED_POINT_IDENTITY);
    });
  });

  describe("integration with calculateGen9Damage", () => {
    it("given Fluffy defender hit by physical contact move, when calculating damage, then damage is halved", () => {
      const attacker = makeActive({});
      const defender = makeActive({ ability: "fluffy", types: ["normal"] });
      const move = makeMove({
        type: "fighting",
        power: 100,
        category: "physical",
        flags: { contact: true },
      });
      const ctx = makeDamageContext({ attacker, defender, move, seed: 100 });
      const resultFluffy = calculateGen9Damage(ctx, typeChart);

      const defenderNoAbility = makeActive({ ability: "none", types: ["normal"] });
      const ctxNormal = makeDamageContext({
        attacker,
        defender: defenderNoAbility,
        move,
        seed: 100,
      });
      const resultNormal = calculateGen9Damage(ctxNormal, typeChart);

      // Fluffy halves contact damage, so result should be ~50% of normal (plus SE on normal)
      // Source: Showdown data/abilities.ts -- fluffy: mod /= 2 for contact
      const ratio = resultFluffy.damage / resultNormal.damage;
      expect(ratio).toBeCloseTo(0.5, 1);
    });
  });
});

// ===========================================================================
// Ice Scales
// ===========================================================================

describe("Ice Scales", () => {
  describe("getIceScalesModifier", () => {
    it("given Ice Scales defender hit by special move, when getting modifier, then returns 2048 (0.5x)", () => {
      // Source: Showdown data/abilities.ts -- icescales: if (move.category === 'Special') chainModify(0.5)
      const mod = getIceScalesModifier("ice-scales", "special");
      expect(mod).toBe(2048);
    });

    it("given Ice Scales defender hit by physical move, when getting modifier, then returns 4096 (no effect)", () => {
      const mod = getIceScalesModifier("ice-scales", "physical");
      expect(mod).toBe(FIXED_POINT_IDENTITY);
    });

    it("given non-Ice Scales ability hit by special move, when getting modifier, then returns 4096", () => {
      const mod = getIceScalesModifier(TEST_ABILITY_IDS.blaze, "special");
      expect(mod).toBe(FIXED_POINT_IDENTITY);
    });
  });

  describe("integration with calculateGen9Damage", () => {
    it("given Ice Scales defender hit by special move, when calculating damage, then damage is halved", () => {
      const attacker = makeActive({});
      const defender = makeActive({ ability: "ice-scales", types: ["ice"] });
      const move = makeMove({
        type: "fire",
        power: 100,
        category: "special",
        flags: { contact: false },
      });
      const ctx = makeDamageContext({ attacker, defender, move, seed: 100 });
      const resultIceScales = calculateGen9Damage(ctx, typeChart);

      const defenderNoAbility = makeActive({ ability: "none", types: ["ice"] });
      const ctxNormal = makeDamageContext({
        attacker,
        defender: defenderNoAbility,
        move,
        seed: 100,
      });
      const resultNormal = calculateGen9Damage(ctxNormal, typeChart);

      // Ice Scales halves special damage
      // Source: Showdown data/abilities.ts -- icescales onSourceModifyDamage: chainModify(0.5)
      const ratio = resultIceScales.damage / resultNormal.damage;
      expect(ratio).toBeCloseTo(0.5, 1);
    });

    it("given Ice Scales defender hit by physical move, when calculating damage, then no reduction", () => {
      const attacker = makeActive({});
      const defender = makeActive({ ability: "ice-scales", types: ["ice"] });
      const move = makeMove({
        type: "fire",
        power: 100,
        category: "physical",
        flags: { contact: false },
      });
      const ctx = makeDamageContext({ attacker, defender, move, seed: 100 });
      const resultIceScales = calculateGen9Damage(ctx, typeChart);

      const defenderNoAbility = makeActive({ ability: "none", types: ["ice"] });
      const ctxNormal = makeDamageContext({
        attacker,
        defender: defenderNoAbility,
        move,
        seed: 100,
      });
      const resultNormal = calculateGen9Damage(ctxNormal, typeChart);

      // Physical: Ice Scales should not reduce damage
      expect(resultIceScales.damage).toBe(resultNormal.damage);
    });
  });
});

// ===========================================================================
// Multiscale / Shadow Shield
// ===========================================================================

describe("Multiscale / Shadow Shield", () => {
  describe("getMultiscaleMultiplier", () => {
    it("given Multiscale at full HP, when getting multiplier, then returns 0.5", () => {
      // Source: Showdown data/abilities.ts -- multiscale onSourceModifyDamage
      expect(getMultiscaleMultiplier("multiscale", 200, 200)).toBe(0.5);
    });

    it("given Multiscale at less than full HP, when getting multiplier, then returns 1", () => {
      expect(getMultiscaleMultiplier("multiscale", 199, 200)).toBe(1);
    });

    it("given Shadow Shield at full HP, when getting multiplier, then returns 0.5", () => {
      // Source: Showdown data/abilities.ts -- shadowshield: same as multiscale
      expect(getMultiscaleMultiplier("shadow-shield", 100, 100)).toBe(0.5);
    });

    it("given non-Multiscale ability at full HP, when getting multiplier, then returns 1", () => {
      expect(getMultiscaleMultiplier("blaze", 200, 200)).toBe(1);
    });
  });

  describe("integration with calculateGen9Damage", () => {
    it("given Multiscale defender at full HP, when calculating damage, then damage is halved", () => {
      const attacker = makeActive({});
      const defender = makeActive({ ability: "multiscale", hp: 200, currentHp: 200 });
      const move = makeMove({ power: 100, flags: { contact: false } });
      const ctx = makeDamageContext({ attacker, defender, move, seed: 100 });
      const resultMultiscale = calculateGen9Damage(ctx, typeChart);

      const defenderNoAbility = makeActive({ ability: "none", hp: 200, currentHp: 200 });
      const ctxNormal = makeDamageContext({
        attacker,
        defender: defenderNoAbility,
        move,
        seed: 100,
      });
      const resultNormal = calculateGen9Damage(ctxNormal, typeChart);

      // Source: Showdown -- Multiscale: pokeRound(damage, 2048) = 0.5x
      const ratio = resultMultiscale.damage / resultNormal.damage;
      expect(ratio).toBeCloseTo(0.5, 1);
    });

    it("given Multiscale defender not at full HP, when calculating damage, then no reduction", () => {
      const attacker = makeActive({});
      const defender = makeActive({ ability: "multiscale", hp: 200, currentHp: 150 });
      const move = makeMove({ power: 100, flags: { contact: false } });
      const ctx = makeDamageContext({ attacker, defender, move, seed: 100 });
      const resultMultiscale = calculateGen9Damage(ctx, typeChart);

      const defenderNoAbility = makeActive({ ability: "none", hp: 200, currentHp: 150 });
      const ctxNormal = makeDamageContext({
        attacker,
        defender: defenderNoAbility,
        move,
        seed: 100,
      });
      const resultNormal = calculateGen9Damage(ctxNormal, typeChart);

      expect(resultMultiscale.damage).toBe(resultNormal.damage);
    });
  });
});

// ===========================================================================
// Tinted Lens
// ===========================================================================

describe("Tinted Lens", () => {
  it("given Tinted Lens attacker using NVE move, when calculating damage, then damage is doubled", () => {
    const attacker = makeActive({ ability: "tinted-lens", types: ["fire"] });
    const defender = makeActive({ types: ["water"] }); // Fire vs Water = NVE (0.5x)
    const move = makeMove({
      type: "fire",
      power: 100,
      category: "special",
      flags: { contact: false },
    });
    const ctx = makeDamageContext({ attacker, defender, move, seed: 100 });
    const resultTinted = calculateGen9Damage(ctx, typeChart);

    const attackerNoAbility = makeActive({ ability: "none", types: ["fire"] });
    const ctxNormal = makeDamageContext({
      attacker: attackerNoAbility,
      defender,
      move,
      seed: 100,
    });
    const resultNormal = calculateGen9Damage(ctxNormal, typeChart);

    // Source: Showdown data/abilities.ts -- tintedlens: damage *= 2 for NVE
    // Tinted Lens doubles NVE damage, making it effectively 1x
    expect(resultTinted.damage).toBeGreaterThan(resultNormal.damage);
    const ratio = resultTinted.damage / resultNormal.damage;
    expect(ratio).toBeCloseTo(2.0, 0);
  });

  it("given Tinted Lens attacker using SE move, when calculating damage, then no boost (only NVE)", () => {
    const attacker = makeActive({ ability: "tinted-lens", types: ["fire"] });
    const defender = makeActive({ types: ["grass"] }); // Fire vs Grass = SE (2x)
    const move = makeMove({
      type: "fire",
      power: 100,
      category: "special",
      flags: { contact: false },
    });
    const ctx = makeDamageContext({ attacker, defender, move, seed: 100 });
    const resultTinted = calculateGen9Damage(ctx, typeChart);

    const attackerNoAbility = makeActive({ ability: "none", types: ["fire"] });
    const ctxNormal = makeDamageContext({
      attacker: attackerNoAbility,
      defender,
      move,
      seed: 100,
    });
    const resultNormal = calculateGen9Damage(ctxNormal, typeChart);

    // Tinted Lens should not affect SE moves
    expect(resultTinted.damage).toBe(resultNormal.damage);
  });
});

// ===========================================================================
// Filter / Solid Rock
// ===========================================================================

describe("Filter / Solid Rock", () => {
  it("given Filter defender hit by SE move, when calculating damage, then damage is reduced by 25%", () => {
    const attacker = makeActive({ types: ["fire"] });
    const defender = makeActive({ ability: "filter", types: ["grass"] });
    const move = makeMove({
      type: "fire",
      power: 100,
      category: "special",
      flags: { contact: false },
    });
    const ctx = makeDamageContext({ attacker, defender, move, seed: 100 });
    const resultFilter = calculateGen9Damage(ctx, typeChart);

    const defenderNoAbility = makeActive({ ability: "none", types: ["grass"] });
    const ctxNormal = makeDamageContext({
      attacker,
      defender: defenderNoAbility,
      move,
      seed: 100,
    });
    const resultNormal = calculateGen9Damage(ctxNormal, typeChart);

    // Source: Showdown data/abilities.ts -- filter: pokeRound(damage, 3072) = 0.75x
    const ratio = resultFilter.damage / resultNormal.damage;
    expect(ratio).toBeCloseTo(0.75, 1);
  });

  it("given Solid Rock defender hit by neutral move, when calculating damage, then no reduction", () => {
    const attacker = makeActive({});
    const defender = makeActive({ ability: "solid-rock", types: ["rock"] });
    const move = makeMove({
      type: "normal",
      power: 100,
      flags: { contact: false },
    });
    const ctx = makeDamageContext({ attacker, defender, move, seed: 100 });
    const resultSolidRock = calculateGen9Damage(ctx, typeChart);

    const defenderNoAbility = makeActive({ ability: "none", types: ["rock"] });
    const ctxNormal = makeDamageContext({
      attacker,
      defender: defenderNoAbility,
      move,
      seed: 100,
    });
    const resultNormal = calculateGen9Damage(ctxNormal, typeChart);

    // Filter/Solid Rock only reduce SE damage; neutral should be unchanged
    expect(resultSolidRock.damage).toBe(resultNormal.damage);
  });
});

// ===========================================================================
// -ate Abilities
// ===========================================================================

describe("-ate abilities (Gen 9: 1.2x)", () => {
  describe("getAteAbilityOverride", () => {
    it("given Pixilate with Normal-type move, when checking override, then returns fairy + 1.2x", () => {
      // Source: Showdown data/abilities.ts -- pixilate: Normal -> Fairy + 4915/4096
      const result = getAteAbilityOverride("pixilate", "normal");
      expect(result).not.toBeNull();
      expect(result!.type).toBe("fairy");
      expect(result!.multiplier).toBeCloseTo(4915 / 4096, 5);
    });

    it("given Aerilate with Normal-type move, when checking override, then returns flying + 1.2x", () => {
      // Source: Showdown data/abilities.ts -- aerilate: Normal -> Flying + 4915/4096
      const result = getAteAbilityOverride("aerilate", "normal");
      expect(result).not.toBeNull();
      expect(result!.type).toBe("flying");
    });

    it("given Refrigerate with Normal-type move, when checking override, then returns ice + 1.2x", () => {
      // Source: Showdown data/abilities.ts -- refrigerate: Normal -> Ice + 4915/4096
      const result = getAteAbilityOverride("refrigerate", "normal");
      expect(result).not.toBeNull();
      expect(result!.type).toBe("ice");
    });

    it("given Galvanize with Normal-type move, when checking override, then returns electric + 1.2x", () => {
      // Source: Showdown data/abilities.ts -- galvanize: Normal -> Electric + 4915/4096
      const result = getAteAbilityOverride("galvanize", "normal");
      expect(result).not.toBeNull();
      expect(result!.type).toBe("electric");
    });

    it("given Pixilate with non-Normal move, when checking override, then returns null", () => {
      expect(getAteAbilityOverride("pixilate", "fire")).toBeNull();
      expect(getAteAbilityOverride("pixilate", "normal")).toEqual({
        type: "fairy",
        multiplier: GEN7_PLUS_ATE_MODIFIER,
      });
    });

    it("given Normalize with Fire-type move, when checking override, then returns normal + 1.2x", () => {
      // Source: Showdown data/abilities.ts -- normalize: all moves become Normal + 1.2x (Gen 7+)
      const result = getAteAbilityOverride("normalize", "fire");
      expect(result).not.toBeNull();
      expect(result!.type).toBe("normal");
      expect(result!.multiplier).toBeCloseTo(4915 / 4096, 5);
    });

    it("given Liquid Voice with sound-based move, when checking override, then returns water with 1.0x", () => {
      // Source: Showdown data/abilities.ts -- liquidvoice: sound moves become Water (no power boost)
      const result = getAteAbilityOverride("liquid-voice", "normal", true);
      expect(result).not.toBeNull();
      expect(result!.type).toBe("water");
      expect(result!.multiplier).toBe(1);
    });

    it("given Liquid Voice with non-sound move, when checking override, then returns null", () => {
      expect(getAteAbilityOverride("liquid-voice", "normal", false)).toBeNull();
      expect(getAteAbilityOverride("liquid-voice", "normal", true)).toEqual({
        type: "water",
        multiplier: 1,
      });
    });
  });
});

// ===========================================================================
// Sheer Force
// ===========================================================================

describe("Sheer Force", () => {
  it("given Sheer Force with move that has status-chance, when getting multiplier, then returns 5325/4096", () => {
    // Source: Showdown data/abilities.ts -- sheerforce: chainModify([5325, 4096])
    const mult = getSheerForceMultiplier("sheer-force", {
      type: "status-chance",
      status: "burn",
      chance: 10,
    });
    expect(mult).toBeCloseTo(5325 / 4096, 5);
  });

  it("given Sheer Force with move that has no secondary, when getting multiplier, then returns 1", () => {
    const mult = getSheerForceMultiplier("sheer-force", null);
    expect(mult).toBe(1);
  });

  it("given non-Sheer Force ability, when getting multiplier, then returns 1", () => {
    const mult = getSheerForceMultiplier("blaze", {
      type: "status-chance",
      status: "burn",
      chance: 10,
    });
    expect(mult).toBe(1);
  });

  it("given Sheer Force with tri-attack (whitelist), when checking eligible, then returns true", () => {
    // Source: Showdown -- tri-attack has custom onHit secondaries
    expect(isSheerForceEligibleMove(null, "tri-attack")).toBe(true);
  });

  it("given Sheer Force, when checking if Life Orb recoil suppressed, then returns true for eligible move", () => {
    // Source: Showdown scripts.ts -- sheer force suppresses Life Orb recoil
    expect(
      sheerForceSuppressesLifeOrb("sheer-force", {
        type: "status-chance",
        status: "burn",
        chance: 10,
      }),
    ).toBe(true);
  });
});

// ===========================================================================
// Tough Claws / Strong Jaw / Mega Launcher / Iron Fist
// ===========================================================================

describe("move-type boosting abilities", () => {
  describe("getToughClawsMultiplier", () => {
    it("given Tough Claws with contact move, when getting multiplier, then returns 5325/4096 (~1.3x)", () => {
      // Source: Showdown data/abilities.ts -- toughclaws: chainModify([5325, 4096])
      expect(getToughClawsMultiplier("tough-claws", true)).toBeCloseTo(5325 / 4096, 5);
    });

    it("given Tough Claws with non-contact move, when getting multiplier, then returns 1", () => {
      expect(getToughClawsMultiplier("tough-claws", false)).toBe(1);
    });
  });

  describe("getStrongJawMultiplier", () => {
    it("given Strong Jaw with bite move, when getting multiplier, then returns 1.5", () => {
      // Source: Showdown data/abilities.ts -- strongjaw: chainModify(1.5)
      expect(getStrongJawMultiplier("strong-jaw", true)).toBe(1.5);
    });

    it("given Strong Jaw with non-bite move, when getting multiplier, then returns 1", () => {
      expect(getStrongJawMultiplier("strong-jaw", false)).toBe(1);
    });
  });

  describe("getMegaLauncherMultiplier", () => {
    it("given Mega Launcher with pulse move, when getting multiplier, then returns 1.5", () => {
      // Source: Showdown data/abilities.ts -- megalauncher: chainModify(1.5)
      expect(getMegaLauncherMultiplier("mega-launcher", true)).toBe(1.5);
    });

    it("given Mega Launcher with non-pulse move, when getting multiplier, then returns 1", () => {
      expect(getMegaLauncherMultiplier("mega-launcher", false)).toBe(1);
    });
  });
});

// ===========================================================================
// Sturdy
// ===========================================================================

describe("Sturdy", () => {
  describe("getSturdyDamageCap", () => {
    it("given Sturdy at full HP with lethal damage, when capping, then returns maxHp - 1", () => {
      // Source: Showdown data/abilities.ts -- sturdy onDamage: maxhp - 1
      expect(getSturdyDamageCap("sturdy", DEFAULT_HP_FIXTURE, DEFAULT_HP_FIXTURE, DEFAULT_HP_FIXTURE)).toBe(
        DEFAULT_HP_FIXTURE - 1,
      );
    });

    it("given Sturdy at full HP with non-lethal damage, when capping, then returns original damage", () => {
      expect(getSturdyDamageCap("sturdy", 100, 200, 200)).toBe(100);
    });

    it("given Sturdy NOT at full HP with lethal damage, when capping, then returns original damage (no cap)", () => {
      // Source: Sturdy only caps at full HP; once currentHp differs from maxHp the damage passes through unchanged.
      expect(getSturdyDamageCap("sturdy", DEFAULT_HP_FIXTURE, 150, DEFAULT_HP_FIXTURE)).toBe(
        DEFAULT_HP_FIXTURE,
      );
    });

    it("given non-Sturdy ability, when capping, then returns original damage", () => {
      expect(
        getSturdyDamageCap(
          TEST_ABILITY_IDS.blaze,
          DEFAULT_HP_FIXTURE,
          DEFAULT_HP_FIXTURE,
          DEFAULT_HP_FIXTURE,
        ),
      ).toBe(DEFAULT_HP_FIXTURE);
    });
  });

  describe("sturdyBlocksOHKO", () => {
    it("given Sturdy and OHKO move, when checking, then returns true", () => {
      // Source: Showdown data/abilities.ts -- sturdy onTryHit: OHKO blocked
      expect(sturdyBlocksOHKO("sturdy", { type: "ohko" })).toBe(true);
    });

    it("given Sturdy and non-OHKO move, when checking, then returns false", () => {
      expect(sturdyBlocksOHKO("sturdy", { type: "drain", percentage: 50 })).toBe(false);
    });

    it("given non-Sturdy and OHKO move, when checking, then returns false", () => {
      expect(sturdyBlocksOHKO(TEST_ABILITY_IDS.blaze, { type: "ohko" })).toBe(false);
    });
  });
});

// ===========================================================================
// Fur Coat
// ===========================================================================

describe("Fur Coat", () => {
  it("given Fur Coat against physical move, when getting multiplier, then returns 2.0", () => {
    // Source: Showdown data/abilities.ts -- furcoat: chainModify(2) on Def for physical
    expect(getFurCoatMultiplier("fur-coat", true)).toBe(2);
  });

  it("given Fur Coat against special move, when getting multiplier, then returns 1", () => {
    expect(getFurCoatMultiplier("fur-coat", false)).toBe(1);
  });

  it("given non-Fur Coat ability, when getting multiplier, then returns 1", () => {
    expect(getFurCoatMultiplier("blaze", true)).toBe(1);
  });
});

// ===========================================================================
// Parental Bond
// ===========================================================================

describe("Parental Bond", () => {
  it("given Parental Bond with damaging move, when checking eligibility, then returns true", () => {
    // Source: Showdown data/abilities.ts -- parentalbond
    expect(isParentalBondEligible("parental-bond", 80, null)).toBe(true);
  });

  it("given Parental Bond with multi-hit move, when checking eligibility, then returns false", () => {
    expect(isParentalBondEligible("parental-bond", 80, "multi-hit")).toBe(false);
  });

  it("given Parental Bond with status move, when checking eligibility, then returns false", () => {
    expect(isParentalBondEligible("parental-bond", 0, null)).toBe(false);
  });

  it("given non-Parental Bond ability, when checking eligibility, then returns false", () => {
    expect(isParentalBondEligible("blaze", 80, null)).toBe(false);
  });
});

// ===========================================================================
// handleGen9DamageCalcAbility handler tests
// ===========================================================================

describe("handleGen9DamageCalcAbility handler", () => {
  function makeAbilityContext(overrides: {
    abilityId: string;
    moveType?: PokemonType;
    moveCategory?: "physical" | "special" | "status";
    movePower?: number | null;
    moveFlags?: Partial<MoveData["flags"]>;
    moveEffect?: MoveData["effect"];
    moveId?: string;
    currentHp?: number;
    hp?: number;
    status?: string | null;
    weather?: string | null;
    terrain?: string | null;
    opponentMovedThisTurn?: boolean;
    types?: PokemonType[];
    attackerFaintCount?: number;
  }): Parameters<typeof handleGen9DamageCalcAbility>[0] {
    const pokemon = makeActive({
      ability: overrides.abilityId,
      currentHp: overrides.currentHp,
      hp: overrides.hp,
      status: overrides.status,
      types: overrides.types,
    });
    const opponent = overrides.opponentMovedThisTurn
      ? makeActive({ movedThisTurn: true })
      : makeActive({});
    const move =
      overrides.movePower !== undefined
        ? makeMove({
            id: overrides.moveId,
            type: overrides.moveType ?? "normal",
            category: overrides.moveCategory ?? "physical",
            power: overrides.movePower,
            flags: overrides.moveFlags,
            effect: overrides.moveEffect,
          })
        : makeMove({
            id: overrides.moveId,
            type: overrides.moveType ?? "normal",
            category: overrides.moveCategory ?? "physical",
            flags: overrides.moveFlags,
            effect: overrides.moveEffect,
          });
    const faintCount = overrides.attackerFaintCount ?? 0;
    const sides =
      faintCount > 0
        ? [
            { active: [pokemon], faintCount, screens: [] },
            { active: [opponent], faintCount: 0, screens: [] },
          ]
        : undefined;
    const state = makeState({
      weather: overrides.weather ? { type: overrides.weather, turnsLeft: 5, source: "test" } : null,
      terrain: overrides.terrain ? { type: overrides.terrain, turnsLeft: 5, source: "test" } : null,
      sides,
    });

    return {
      pokemon,
      opponent,
      state,
      rng: new SeededRandom(42),
      trigger: "on-damage" as any,
      move,
    };
  }

  it("given Supreme Overlord with 0 fainted allies, when handler called, then does not activate", () => {
    // Source: Showdown data/abilities.ts:4634-4658 -- supremeoverlord onBasePower
    // powMod[0] = 4096 (no boost), so handler should return NO_ACTIVATION
    const ctx = makeAbilityContext({ abilityId: "supreme-overlord" });
    const result = handleGen9DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Supreme Overlord with 2 fainted allies, when handler called, then activates with message", () => {
    // Source: Showdown data/abilities.ts:4649 -- powMod[2] = 4915 (~20% boost)
    const ctx = makeAbilityContext({ abilityId: "supreme-overlord", attackerFaintCount: 2 });
    const result = handleGen9DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.messages.length).toBeGreaterThan(0);
  });

  it("given Orichalcum Pulse in Sun, when handler called, then activates", () => {
    const ctx = makeAbilityContext({ abilityId: "orichalcum-pulse", weather: "sun" });
    const result = handleGen9DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Orichalcum Pulse without Sun, when handler called, then does not activate", () => {
    const ctx = makeAbilityContext({ abilityId: "orichalcum-pulse" });
    const result = handleGen9DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Hadron Engine on Electric Terrain, when handler called, then activates", () => {
    const ctx = makeAbilityContext({ abilityId: "hadron-engine", terrain: "electric" });
    const result = handleGen9DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Hadron Engine without Electric Terrain, when handler called, then does not activate", () => {
    const ctx = makeAbilityContext({ abilityId: "hadron-engine" });
    const result = handleGen9DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Fluffy hit by contact non-fire move, when handler called, then activates", () => {
    const ctx = makeAbilityContext({
      abilityId: "fluffy",
      moveType: "normal",
      moveFlags: { contact: true },
    });
    const result = handleGen9DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Fluffy hit by non-contact non-fire move, when handler called, then does not activate", () => {
    const ctx = makeAbilityContext({
      abilityId: "fluffy",
      moveType: "normal",
      moveFlags: { contact: false },
    });
    const result = handleGen9DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Ice Scales hit by special move, when handler called, then activates", () => {
    const ctx = makeAbilityContext({
      abilityId: "ice-scales",
      moveCategory: "special",
    });
    const result = handleGen9DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Ice Scales hit by physical move, when handler called, then does not activate", () => {
    const ctx = makeAbilityContext({
      abilityId: "ice-scales",
      moveCategory: "physical",
    });
    const result = handleGen9DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Technician with 60 power move, when handler called, then activates", () => {
    const ctx = makeAbilityContext({ abilityId: "technician", movePower: 60 });
    const result = handleGen9DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Technician with 70 power move, when handler called, then does not activate", () => {
    const ctx = makeAbilityContext({ abilityId: "technician", movePower: 70 });
    const result = handleGen9DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Adaptability with STAB move, when handler called, then activates", () => {
    const ctx = makeAbilityContext({
      abilityId: "adaptability",
      moveType: "fire",
      types: ["fire"],
    });
    const result = handleGen9DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Adaptability with non-STAB move, when handler called, then does not activate", () => {
    const ctx = makeAbilityContext({
      abilityId: "adaptability",
      moveType: "water",
      types: ["fire"],
    });
    const result = handleGen9DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Multiscale at full HP, when handler called, then activates", () => {
    const ctx = makeAbilityContext({
      abilityId: "multiscale",
      currentHp: 200,
      hp: 200,
    });
    const result = handleGen9DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Multiscale below full HP, when handler called, then does not activate", () => {
    const ctx = makeAbilityContext({
      abilityId: "multiscale",
      currentHp: 150,
      hp: 200,
    });
    const result = handleGen9DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// handleGen9DamageImmunityAbility handler tests
// ===========================================================================

describe("handleGen9DamageImmunityAbility handler", () => {
  it("given Sturdy and OHKO move, when handler called, then move is prevented", () => {
    const pokemon = makeActive({ ability: "sturdy" });
    const ctx = {
      pokemon,
      state: makeState(),
      rng: new SeededRandom(42),
      trigger: "on-damage" as any,
      move: makeMove({ effect: { type: "ohko" as const } }),
    };
    const result = handleGen9DamageImmunityAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.movePrevented).toBe(true);
  });

  it("given Sturdy and non-OHKO move, when handler called, then not activated", () => {
    const pokemon = makeActive({ ability: "sturdy" });
    const ctx = {
      pokemon,
      state: makeState(),
      rng: new SeededRandom(42),
      trigger: "on-damage" as any,
      move: makeMove({}),
    };
    const result = handleGen9DamageImmunityAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// hasSheerForceEligibleEffect unit tests
// ===========================================================================

describe("hasSheerForceEligibleEffect", () => {
  it("given status-chance effect, then returns true", () => {
    // Source: Showdown -- status-chance is always sheer force eligible
    expect(hasSheerForceEligibleEffect({ type: "status-chance", status: "burn", chance: 10 })).toBe(
      true,
    );
  });

  it("given foe stat-change with chance > 0, then returns true", () => {
    expect(
      hasSheerForceEligibleEffect({
        type: "stat-change",
        target: "foe",
        stat: "attack",
        stages: -1,
        chance: 30,
      } as any),
    ).toBe(true);
  });

  it("given self stat-change with fromSecondary=true, then returns true", () => {
    expect(
      hasSheerForceEligibleEffect({
        type: "stat-change",
        target: "self",
        stat: "attack",
        stages: 1,
        chance: 0,
        fromSecondary: true,
      } as any),
    ).toBe(true);
  });

  it("given volatile-status with chance > 0, then returns true", () => {
    expect(
      hasSheerForceEligibleEffect({
        type: "volatile-status",
        status: "flinch",
        chance: 30,
      }),
    ).toBe(true);
  });

  it("given null effect, then returns false", () => {
    expect(hasSheerForceEligibleEffect(null)).toBe(false);
  });

  it("given heal effect, then returns false", () => {
    expect(hasSheerForceEligibleEffect({ type: "heal", percentage: 50 })).toBe(false);
  });
});

// ===========================================================================
// pokeRound verification for ability modifiers
// ===========================================================================

describe("pokeRound verification for ability modifiers", () => {
  it("Supreme Overlord 3 fainted: pokeRound(100, 5325) = 130", () => {
    // Source: Showdown -- chainModify([5325, 4096])
    // floor((100 * 5325 + 2047) / 4096) = floor(534547/4096) = 130
    expect(pokeRound(100, 5325)).toBe(130);
  });

  it("Supreme Overlord 5 fainted: pokeRound(100, 6144) = 150", () => {
    // Source: Showdown -- chainModify([6144, 4096])
    // floor((100 * 6144 + 2047) / 4096) = floor(616447/4096) = 150
    expect(pokeRound(100, 6144)).toBe(150);
  });

  it("Ice Scales: pokeRound(200, 2048) = 100", () => {
    // Source: Showdown -- chainModify(0.5) = 2048/4096
    // floor((200 * 2048 + 2047) / 4096) = floor(411647/4096) = 100
    expect(pokeRound(200, 2048)).toBe(100);
  });

  it("Fluffy fire: pokeRound(100, 8192) = 200", () => {
    // Source: Showdown -- Fluffy fire: mod *= 2 => 8192/4096
    // floor((100 * 8192 + 2047) / 4096) = floor(821247/4096) = 200
    expect(pokeRound(100, 8192)).toBe(200);
  });

  it("Fluffy contact: pokeRound(100, 2048) = 50", () => {
    // Source: Showdown -- Fluffy contact: mod /= 2 => 2048/4096
    // floor((100 * 2048 + 2047) / 4096) = floor(206847/4096) = 50
    expect(pokeRound(100, 2048)).toBe(50);
  });

  it("Orichalcum Pulse stat: floor((150 * 5461 + 2047) / 4096) = 200", () => {
    // Source: Showdown -- chainModify([5461, 4096]) on Atk stat
    // floor((150 * 5461 + 2047) / 4096) = floor(821197/4096) = 200
    expect(Math.floor((150 * 5461 + 2047) / 4096)).toBe(200);
  });
});
