import type { ActivePokemon, BattleState, DamageContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  getSheerForceMultiplier,
  hasSheerForceEligibleEffect,
  isSheerForceEligibleMove,
  isSheerForceWhitelistedMove,
  sheerForceSuppressesLifeOrb,
} from "../src/Gen5AbilitiesDamage";
import { calculateGen5Damage, pokeRound } from "../src/Gen5DamageCalc";
import { GEN5_TYPE_CHART } from "../src/Gen5TypeChart";

// ---------------------------------------------------------------------------
// Helper factories (duplicated from damage-calc.test.ts for isolation)
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
// Unit tests for isSheerForceWhitelistedMove
// ---------------------------------------------------------------------------

describe("isSheerForceWhitelistedMove", () => {
  it("given Tri Attack move ID, when checking whitelist, then returns true", () => {
    // Source: Showdown data/moves.ts -- triattack has secondary.onHit with chance: 20
    //   which qualifies for Sheer Force, but our importer stores effect=null
    expect(isSheerForceWhitelistedMove("tri-attack")).toBe(true);
  });

  it("given Earthquake move ID (no secondary), when checking whitelist, then returns false", () => {
    // Source: Showdown data/moves.ts -- earthquake has no secondary field
    expect(isSheerForceWhitelistedMove("earthquake")).toBe(false);
  });

  it("given Flamethrower move ID (secondary representable in MoveEffect), when checking whitelist, then returns false", () => {
    // Source: Flamethrower's secondary (10% burn) is representable as status-chance;
    //   it does NOT need to be whitelisted
    expect(isSheerForceWhitelistedMove("flamethrower")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Unit tests for isSheerForceEligibleMove (combined check)
// ---------------------------------------------------------------------------

describe("isSheerForceEligibleMove", () => {
  it("given Tri Attack (effect=null, whitelisted move ID), when checking eligibility, then returns true", () => {
    // Source: Showdown data/moves.ts -- triattack has secondary with chance: 20
    //   Our data stores effect=null because the onHit function is not serializable
    //   The whitelist compensates for this data limitation
    expect(isSheerForceEligibleMove(null, "tri-attack")).toBe(true);
  });

  it("given Flamethrower (status-chance effect, not whitelisted), when checking eligibility, then returns true via effect", () => {
    // Source: Showdown data/moves.ts -- flamethrower secondary: { chance: 10, status: 'brn' }
    const effect = { type: "status-chance" as const, status: "burn" as const, chance: 10 };
    expect(isSheerForceEligibleMove(effect, "flamethrower")).toBe(true);
  });

  it("given Earthquake (effect=null, not whitelisted), when checking eligibility, then returns false", () => {
    // Source: Showdown data/moves.ts -- earthquake has no secondary
    expect(isSheerForceEligibleMove(null, "earthquake")).toBe(false);
  });

  it("given Close Combat (self stat drop, not from secondary), when checking eligibility, then returns false", () => {
    // Source: Showdown data/moves.ts -- closecombat uses self.boosts (primary self-effect)
    //   not secondary.self.boosts, so Sheer Force does NOT suppress it
    const effect = {
      type: "stat-change" as const,
      target: "self" as const,
      stats: { defense: -1, spDefense: -1 },
      chance: 100,
    };
    expect(isSheerForceEligibleMove(effect, "close-combat")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getSheerForceMultiplier with move ID
// ---------------------------------------------------------------------------

describe("getSheerForceMultiplier with move ID whitelist", () => {
  it("given Sheer Force ability and Tri Attack (effect=null), when getting multiplier, then returns 5325/4096", () => {
    // Source: Showdown data/abilities.ts -- sheerforce: onBasePower chainModify([5325, 4096])
    // Tri Attack qualifies via whitelist because its secondary.onHit is not serializable
    const result = getSheerForceMultiplier("sheer-force", null, "tri-attack");
    expect(result).toBeCloseTo(5325 / 4096, 10);
  });

  it("given Sheer Force ability and Earthquake (effect=null, no whitelist), when getting multiplier, then returns 1", () => {
    // Source: Showdown data/abilities.ts -- earthquake has no secondaries, no Sheer Force boost
    const result = getSheerForceMultiplier("sheer-force", null, "earthquake");
    expect(result).toBe(1);
  });

  it("given non-Sheer-Force ability and Tri Attack, when getting multiplier, then returns 1", () => {
    // Source: Only Sheer Force ability triggers the boost
    const result = getSheerForceMultiplier("blaze", null, "tri-attack");
    expect(result).toBe(1);
  });

  it("given Sheer Force ability and Flamethrower (status-chance effect), when getting multiplier without moveId, then still returns 5325/4096", () => {
    // Backward compatibility: the effect-based check still works without a moveId
    const effect = { type: "status-chance" as const, status: "burn" as const, chance: 10 };
    const result = getSheerForceMultiplier("sheer-force", effect);
    expect(result).toBeCloseTo(5325 / 4096, 10);
  });
});

// ---------------------------------------------------------------------------
// sheerForceSuppressesLifeOrb with move ID
// ---------------------------------------------------------------------------

describe("sheerForceSuppressesLifeOrb with move ID whitelist", () => {
  it("given Sheer Force ability and Tri Attack (effect=null), when checking Life Orb suppression, then returns true", () => {
    // Source: Showdown scripts.ts -- if move.hasSheerForce, skip Life Orb recoil
    // Tri Attack sets hasSheerForce=true in Showdown because it has secondaries
    expect(sheerForceSuppressesLifeOrb("sheer-force", null, "tri-attack")).toBe(true);
  });

  it("given Sheer Force ability and Earthquake (no secondary), when checking Life Orb suppression, then returns false", () => {
    // Source: Showdown -- Sheer Force only suppresses Life Orb when move has secondaries
    expect(sheerForceSuppressesLifeOrb("sheer-force", null, "earthquake")).toBe(false);
  });

  it("given non-Sheer-Force ability and Tri Attack, when checking Life Orb suppression, then returns false", () => {
    // Source: Only Sheer Force suppresses Life Orb recoil
    expect(sheerForceSuppressesLifeOrb("blaze", null, "tri-attack")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Integration: Tri Attack damage with Sheer Force in full damage calc
// ---------------------------------------------------------------------------

describe("Sheer Force + Tri Attack in damage calc", () => {
  it("given Sheer Force user using Tri Attack (effect=null, whitelisted), when calculating damage, then power is boosted by 5325/4096", () => {
    // Source: Showdown data/abilities.ts -- sheerforce: onBasePower chainModify([5325, 4096])
    // Source: Showdown data/moves.ts -- triattack has secondary with chance: 20
    //   (custom onHit, stored as effect=null in our data)
    //
    // Derivation:
    //   base power 80
    //   Sheer Force: pokeRound(80, 5325) = floor((80*5325 + 2047) / 4096)
    //     = floor((426000 + 2047) / 4096) = floor(428047 / 4096) = floor(104.50...) = 104
    //   L50, spAtk 100 vs spDef 100, normal vs normal (neutral)
    //   levelFactor = floor(2*50/5) + 2 = 22
    //   baseDamage = floor(floor(22 * 104 * 100 / 100) / 50) = floor(2288 / 50) = floor(45.76) = 45
    //   +2 => 47
    //   random(seed=42) = 94 => floor(47 * 94 / 100) = floor(44.18) = 44
    //   STAB? attacker is psychic, move is normal => no STAB
    //   Type effectiveness: normal vs psychic = 1x (neutral)
    //   No burn => final damage = 44
    const attacker = makeActive({ spAttack: 100, ability: "sheer-force", types: ["psychic"] });
    const defender = makeActive({ spDefense: 100, types: ["psychic"] });
    const move = makeMove({
      id: "tri-attack",
      type: "normal",
      category: "special",
      power: 80,
      flags: { contact: false },
      effect: null, // Our data stores null because Showdown's onHit is not serializable
    });
    const ctx = makeDamageContext({ attacker, defender, move, seed: 42 });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    expect(result.damage).toBe(44);
  });

  it("given non-Sheer-Force user using Tri Attack (effect=null), when calculating damage, then power is NOT boosted", () => {
    // Source: Showdown -- only sheer-force ability triggers the boost
    //
    // Derivation (no boost):
    //   base power 80, no Sheer Force
    //   L50, spAtk 100 vs spDef 100, normal vs psychic (neutral)
    //   levelFactor = 22
    //   baseDamage = floor(floor(22 * 80 * 100 / 100) / 50) = floor(1760 / 50) = floor(35.2) = 35
    //   +2 => 37
    //   random(seed=42) = 94 => floor(37 * 94 / 100) = floor(34.78) = 34
    //   No STAB, neutral type => final damage = 34
    const attacker = makeActive({ spAttack: 100, ability: "blaze", types: ["psychic"] });
    const defender = makeActive({ spDefense: 100, types: ["psychic"] });
    const move = makeMove({
      id: "tri-attack",
      type: "normal",
      category: "special",
      power: 80,
      flags: { contact: false },
      effect: null,
    });
    const ctx = makeDamageContext({ attacker, defender, move, seed: 42 });
    const result = calculateGen5Damage(
      ctx,
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    expect(result.damage).toBe(34);
  });
});
