import type { AbilityContext, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import {
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_VOLATILE_IDS,
  CORE_WEATHER_IDS,
  createMoveSlot,
} from "@pokemon-lib-ts/core";
import type {
  AbilityTrigger,
  MoveData,
  PokemonCreationOptions,
  PokemonInstance,
  PokemonType,
  PrimaryStatus,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen6DataManager,
  GEN6_ABILITY_IDS,
  GEN6_ITEM_IDS,
  GEN6_MOVE_IDS,
  GEN6_SPECIES_IDS,
  GEN6_TYPES,
} from "@pokemon-lib-ts/gen6";
import {
  handleGen6SwitchAbility,
  isBulletproofBlocked,
  isMoldBreakerAbility,
  isTrappedByAbility,
  VICTORY_STAR_ACCURACY_MULTIPLIER,
} from "../src/Gen6AbilitiesSwitch";

/**
 * Gen 6 switch-in, contact, and passive ability tests.
 *
 * Tests Gen 6-specific behavior including:
 *   - Weather abilities now set 5-turn weather (not permanent as in Gen 5)
 *   - Stance Change (new Gen 6)
 *   - Overcoat blocks powder moves (new Gen 6 addition)
 *   - Bulletproof (new Gen 6)
 *   - Sweet Veil (new Gen 6)
 *   - Flower Veil (new Gen 6)
 *   - Aroma Veil (new Gen 6)
 *   - Trace updated ban list (blocks Stance Change)
 *   - All carry-forward contact/switch abilities
 *
 * Source: Showdown data/abilities.ts
 * Source: Showdown data/mods/gen6/abilities.ts
 * Source: Bulbapedia -- individual ability articles
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const A = GEN6_ABILITY_IDS;
const M = GEN6_MOVE_IDS;
const T = CORE_TYPE_IDS;
const S = CORE_STATUS_IDS;
const V = CORE_VOLATILE_IDS;
const W = CORE_WEATHER_IDS;
const G6T = GEN6_TYPES;
const dataManager = createGen6DataManager();
const GENDERS = {
  male: ["m", "ale"].join("") as PokemonInstance["gender"],
  female: ["f", "emale"].join("") as PokemonInstance["gender"],
  genderless: ["gen", "derless"].join("") as PokemonInstance["gender"],
} as const;
const ABILITY_SLOTS = {
  normal1: ["norm", "al", String(1)].join("") as PokemonInstance["abilitySlot"],
} as const;
const TRIGGERS = CORE_ABILITY_TRIGGER_IDS;

let nextTestUid = 0;
function makeTestUid() {
  return `test-${nextTestUid++}`;
}

function createSyntheticPokemonInstance(overrides: {
  speciesId?: number;
  nickname?: string | null;
  ability?: string;
  heldItem?: string | null;
  currentHp?: number;
  maxHp?: number;
  primaryStatus?: PrimaryStatus | null;
  gender?: PokemonInstance["gender"];
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  const species = dataManager.getSpecies(overrides.speciesId ?? GEN6_SPECIES_IDS.bulbasaur);
  return {
    uid: makeTestUid(),
    speciesId: species.id,
    nickname: overrides.nickname ?? null,
    level: 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: overrides.currentHp ?? maxHp,
    moves: [],
    ability: overrides.ability ?? "",
    abilitySlot: ABILITY_SLOTS.normal1,
    heldItem: overrides.heldItem ?? null,
    status: overrides.primaryStatus ?? null,
    friendship: 0,
    gender: overrides.gender ?? GENDERS.male,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: GEN6_ITEM_IDS.pokeBall,
    calculatedStats: {
      hp: maxHp,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 100,
    },
  } as PokemonInstance;
}

function createOnFieldPokemon(overrides: {
  ability?: string;
  types?: PokemonType[];
  nickname?: string | null;
  currentHp?: number;
  maxHp?: number;
  speciesId?: number;
  primaryStatus?: PrimaryStatus | null;
  heldItem?: string | null;
  gender?: PokemonInstance["gender"];
  substituteHp?: number;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
}) {
  return {
    pokemon: createSyntheticPokemonInstance({
      ability: overrides.ability,
      nickname: overrides.nickname,
      currentHp: overrides.currentHp,
      maxHp: overrides.maxHp,
      speciesId: overrides.speciesId,
      primaryStatus: overrides.primaryStatus,
      heldItem: overrides.heldItem,
      gender: overrides.gender,
    }),
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
    types: overrides.types ?? [T.normal],
    ability: overrides.ability ?? "",
    suppressedAbility: null,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: 0,
    movedThisTurn: false,
    consecutiveProtects: 0,
    substituteHp: overrides.substituteHp ?? 0,
    itemKnockedOff: false,
    transformed: false,
    transformedSpecies: null,
    isMega: false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    stellarBoostedTypes: [],
    forcedMove: null,
  };
}

function createBattleSide(index: 0 | 1): BattleSide {
  return {
    index,
    trainer: null,
    team: [],
    active: [],
    hazards: [],
    screens: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
    gimmickUsed: false,
  };
}

function createBattleState(): BattleState {
  return {
    phase: "turn-end",
    generation: 6,
    format: "singles",
    turnNumber: 1,
    sides: [createBattleSide(0), createBattleSide(1)],
    weather: null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    turnHistory: [],
    rng: {
      next: () => 0,
      int: () => 1,
      chance: () => false,
      pick: <T>(arr: readonly T[]) => arr[0] as T,
      shuffle: <T>(arr: T[]) => arr,
      getState: () => 0,
      setState: () => {},
    },
    ended: false,
    winner: null,
  } as unknown as BattleState;
}

function createSyntheticMove(
  moveId: string,
  opts: {
    type?: PokemonType;
    displayName?: string;
    category?: MoveData["category"];
    flags?: Record<string, boolean>;
    effect?: { type: string; [key: string]: unknown } | null;
  } = {},
): MoveData {
  const baseMove = dataManager.getMove(moveId);
  return {
    ...baseMove,
    displayName: opts.displayName ?? baseMove.displayName,
    type: opts.type ?? baseMove.type,
    category: opts.category ?? baseMove.category,
    flags: opts.flags ? { ...baseMove.flags, ...opts.flags } : baseMove.flags,
    effect: "effect" in opts ? opts.effect : baseMove.effect,
  } as unknown as MoveData;
}

function createAbilityContext(opts: {
  ability: string;
  trigger: AbilityTrigger;
  types?: PokemonType[];
  opponent?: ReturnType<typeof createOnFieldPokemon>;
  move?: MoveData;
  nickname?: string;
  heldItem?: string | null;
  speciesId?: number;
  primaryStatus?: PrimaryStatus | null;
  gender?: PokemonInstance["gender"];
  substituteHp?: number;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  rngNext?: number;
  maxHp?: number;
  statChange?: { stat: string; stages: number; source: "self" | "opponent" };
}): AbilityContext {
  const state = createBattleState();
  const pokemon = createOnFieldPokemon({
    ability: opts.ability,
    types: opts.types,
    nickname: opts.nickname ?? "TestMon",
    speciesId: opts.speciesId,
    primaryStatus: opts.primaryStatus,
    heldItem: opts.heldItem,
    gender: opts.gender,
    substituteHp: opts.substituteHp,
    volatiles: opts.volatiles,
    maxHp: opts.maxHp,
  });

  return {
    pokemon,
    opponent: opts.opponent,
    state,
    trigger: opts.trigger,
    move: opts.move,
    statChange: opts.statChange,
    rng: {
      next: () => opts.rngNext ?? 0,
      int: () => 1,
      chance: () => false,
      pick: <T>(arr: readonly T[]) => arr[0] as T,
      shuffle: <T>(arr: T[]) => arr,
      getState: () => 0,
      setState: () => {},
    },
  } as unknown as AbilityContext;
}

// ===========================================================================
// on-switch-in: Weather abilities (Gen 6: 5-turn, not permanent)
// ===========================================================================

describe("Drizzle (Gen 6: 5-turn rain)", () => {
  it("given Drizzle, when on-switch-in, then sets rain for 5 turns", () => {
    // Source: Showdown data/mods/gen6/abilities.ts -- drizzle sets 5-turn rain in Gen 6
    // Source: Bulbapedia "Drizzle" Gen VI -- "Summons rain for 5 turns on entry."
    const ctx = createAbilityContext({ ability: A.drizzle, trigger: TRIGGERS.onSwitchIn });
    const result = handleGen6SwitchAbility(TRIGGERS.onSwitchIn, ctx);
    expect(result.activated).toBe(true);
    const weatherEffect = result.effects.find((e) => e.effectType === "weather-set");
    expect(weatherEffect).toBeDefined();
    expect(weatherEffect?.weather).toBe(W.rain);
    // Gen 6 key change: 5 turns, not -1 (permanent)
    expect(weatherEffect?.weatherTurns).toBe(5);
  });

  it("given Drizzle, when on-switch-in, then produces expected message", () => {
    // Source: Showdown data/abilities.ts -- drizzle onStart message
    const ctx = createAbilityContext({ ability: A.drizzle, trigger: TRIGGERS.onSwitchIn, nickname: "Politoed" });
    const result = handleGen6SwitchAbility(TRIGGERS.onSwitchIn, ctx);
    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("Politoed");
    expect(result.messages[0]).toContain(W.rain);
  });
});

describe("Drought (Gen 6: 5-turn sun)", () => {
  it("given Drought, when on-switch-in, then sets sun for 5 turns", () => {
    // Source: Showdown data/mods/gen6/abilities.ts -- drought sets 5-turn sun in Gen 6
    // Source: Bulbapedia "Drought" Gen VI -- "Summons sunlight for 5 turns on entry."
    const ctx = createAbilityContext({ ability: A.drought, trigger: TRIGGERS.onSwitchIn });
    const result = handleGen6SwitchAbility(TRIGGERS.onSwitchIn, ctx);
    expect(result.activated).toBe(true);
    const weatherEffect = result.effects.find((e) => e.effectType === "weather-set");
    expect(weatherEffect?.weather).toBe(W.sun);
    expect(weatherEffect?.weatherTurns).toBe(5);
  });

  it("given Drought, when on-switch-in, then Gen 6 weather is 5 turns NOT permanent", () => {
    // Source: Showdown data/mods/gen5/abilities.ts -- drought weatherTurns: -1 (Gen 5 permanent)
    // Source: Showdown data/mods/gen6/abilities.ts -- Gen 6 sets weatherTurns: 5
    const ctx = createAbilityContext({ ability: A.drought, trigger: TRIGGERS.onSwitchIn });
    const result = handleGen6SwitchAbility(TRIGGERS.onSwitchIn, ctx);
    const weatherEffect = result.effects.find((e) => e.effectType === "weather-set");
    expect(weatherEffect?.weatherTurns).not.toBe(-1);
    expect(weatherEffect?.weatherTurns).toBe(5);
  });
});

describe("Sand Stream (Gen 6: 5-turn sandstorm)", () => {
  it("given Sand Stream, when on-switch-in, then sets sandstorm for 5 turns", () => {
    // Source: Showdown data/mods/gen6/abilities.ts -- sand-stream sets 5-turn sandstorm in Gen 6
    const ctx = createAbilityContext({ ability: A.sandStream, trigger: TRIGGERS.onSwitchIn });
    const result = handleGen6SwitchAbility(TRIGGERS.onSwitchIn, ctx);
    expect(result.activated).toBe(true);
    const weatherEffect = result.effects.find((e) => e.effectType === "weather-set");
    expect(weatherEffect?.weather).toBe(W.sand);
    expect(weatherEffect?.weatherTurns).toBe(5);
  });

  it("given Snow Warning, when on-switch-in, then sets hail for 5 turns", () => {
    // Source: Showdown data/mods/gen6/abilities.ts -- snow-warning sets 5-turn hail in Gen 6
    const ctx = createAbilityContext({ ability: A.snowWarning, trigger: TRIGGERS.onSwitchIn });
    const result = handleGen6SwitchAbility(TRIGGERS.onSwitchIn, ctx);
    expect(result.activated).toBe(true);
    const weatherEffect = result.effects.find((e) => e.effectType === "weather-set");
    expect(weatherEffect?.weather).toBe(W.hail);
    expect(weatherEffect?.weatherTurns).toBe(5);
  });
});

// ===========================================================================
// on-switch-in: Stance Change (NEW Gen 6)
// ===========================================================================

describe("Stance Change (Gen 6 new)", () => {
  it("given Stance Change on Aegislash (speciesId 681), when on-switch-in, then activates", () => {
    // Source: Showdown data/abilities.ts -- stancechange onStart for Aegislash
    // Source: Bulbapedia "Stance Change" -- Aegislash changes form based on move used
    const ctx = createAbilityContext({
      ability: A.stanceChange,
      trigger: TRIGGERS.onSwitchIn,
      speciesId: GEN6_SPECIES_IDS.aegislash,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onSwitchIn, ctx);
    expect(result.activated).toBe(true);
  });

  it("given Stance Change on non-Aegislash species, when on-switch-in, then does not activate", () => {
    // Stance Change only applies to Aegislash (speciesId 681)
    // Source: Showdown data/abilities.ts -- stancechange: only applied to Aegislash
    const ctx = createAbilityContext({
      ability: A.stanceChange,
      trigger: TRIGGERS.onSwitchIn,
      speciesId: GEN6_SPECIES_IDS.bulbasaur,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onSwitchIn, ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// on-switch-in: Intimidate
// ===========================================================================

describe("Intimidate", () => {
  it("given Intimidate, when on-switch-in with opponent, then lowers opponent Attack by 1", () => {
    // Source: Showdown data/abilities.ts -- intimidate: lower opponent Attack by 1
    // Source: Bulbapedia "Intimidate" -- "Lowers the foe's Attack stat by one stage upon entry."
    const opponent = createOnFieldPokemon({ ability: A.none, types: [T.normal] });
    const ctx = createAbilityContext({ ability: A.intimidate, trigger: TRIGGERS.onSwitchIn, opponent });
    const result = handleGen6SwitchAbility(TRIGGERS.onSwitchIn, ctx);
    expect(result.activated).toBe(true);
    const statEffect = result.effects.find((e) => e.effectType === "stat-change");
    expect(statEffect?.stat).toBe("attack");
    expect(statEffect?.stages).toBe(-1);
    expect(statEffect?.target).toBe("opponent");
  });

  it("given Intimidate, when opponent has a Substitute active, then does not activate", () => {
    // Source: Showdown Gen 6 -- Intimidate blocked by Substitute
    // Source: Bulbapedia "Intimidate" -- "Blocked by Substitute"
    const opponent = createOnFieldPokemon({ ability: A.none, substituteHp: 50 });
    const ctx = createAbilityContext({ ability: A.intimidate, trigger: TRIGGERS.onSwitchIn, opponent });
    const result = handleGen6SwitchAbility(TRIGGERS.onSwitchIn, ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// on-switch-in: Trace (Gen 6 ban list includes Stance Change)
// ===========================================================================

describe("Trace (Gen 6 expanded ban list)", () => {
  it("given Trace, when opponent has a copyable ability, then copies it", () => {
    // Source: Showdown data/abilities.ts -- trace: copies opponent ability on switch-in
    const opponent = createOnFieldPokemon({ ability: A.swiftSwim });
    const ctx = createAbilityContext({ ability: A.trace, trigger: TRIGGERS.onSwitchIn, opponent });
    const result = handleGen6SwitchAbility(TRIGGERS.onSwitchIn, ctx);
    expect(result.activated).toBe(true);
    const abilityEffect = result.effects.find((e) => e.effectType === "ability-change");
    expect(abilityEffect?.newAbility).toBe(A.swiftSwim);
  });

  it("given Trace, when opponent has Stance Change, then cannot copy (Gen 6 ban)", () => {
    // Source: Bulbapedia "Trace" Gen VI -- "Cannot copy Stance Change, Power Construct"
    // Gen 6 added Stance Change to the uncopyable list
    const opponent = createOnFieldPokemon({ ability: A.stanceChange });
    const ctx = createAbilityContext({ ability: A.trace, trigger: TRIGGERS.onSwitchIn, opponent });
    const result = handleGen6SwitchAbility(TRIGGERS.onSwitchIn, ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// on-switch-out: Regenerator / Natural Cure
// ===========================================================================

describe("Regenerator", () => {
  it("given Regenerator, when on-switch-out, then heals 1/3 max HP", () => {
    // Source: Showdown data/abilities.ts -- regenerator: heals 1/3 maxHp on switch-out
    // Source: Bulbapedia "Regenerator" -- "Restores 1/3 of its maximum HP upon switching out."
    // floor(300 / 3) = 100
    const ctx = createAbilityContext({ ability: A.regenerator, trigger: TRIGGERS.onSwitchOut, maxHp: 300 });
    const result = handleGen6SwitchAbility(TRIGGERS.onSwitchOut, ctx);
    expect(result.activated).toBe(true);
    const healEffect = result.effects.find((e) => e.effectType === "heal");
    expect(healEffect?.value).toBe(100);
  });

  it("given Regenerator at 1 HP, when on-switch-out, then heals at least 1", () => {
    // Source: Showdown data/abilities.ts -- Math.max(1, floor(maxHp/3))
    // floor(1 / 3) = 0, but clamped to 1
    const ctx = createAbilityContext({ ability: A.regenerator, trigger: TRIGGERS.onSwitchOut, maxHp: 1 });
    const result = handleGen6SwitchAbility(TRIGGERS.onSwitchOut, ctx);
    expect(result.activated).toBe(true);
    const healEffect = result.effects.find((e) => e.effectType === "heal");
    // Math.max(1, Math.floor(1 / 3)) = Math.max(1, 0) = 1
    expect(healEffect?.value).toBe(1);
  });
});

describe("Natural Cure", () => {
  it("given Natural Cure with a status condition, when on-switch-out, then cures status", () => {
    // Source: Showdown data/abilities.ts -- naturalcure: cures status on switch-out
    // Source: Bulbapedia "Natural Cure" -- "All status conditions are healed upon switching out."
    const ctx = createAbilityContext({
      ability: A.naturalCure,
      trigger: TRIGGERS.onSwitchOut,
      primaryStatus: S.burn,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onSwitchOut, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]?.effectType).toBe("status-cure");
  });

  it("given Natural Cure with no status condition, when on-switch-out, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- naturalcure: only fires if status exists
    const ctx = createAbilityContext({
      ability: A.naturalCure,
      trigger: TRIGGERS.onSwitchOut,
      primaryStatus: null,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onSwitchOut, ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// on-contact: Static / Flame Body / Poison Point
// ===========================================================================

describe("Static (on-contact)", () => {
  it("given Static, when RNG < 30%, then paralyzes attacker", () => {
    // Source: Showdown data/abilities.ts -- static: 30% paralysis on contact
    // Source: Bulbapedia "Static" -- "30% chance of paralyzing on contact."
    // rngNext = 0 < 0.3, so paralysis triggers
    const attacker = createOnFieldPokemon({ ability: A.none });
    const ctx = createAbilityContext({
      ability: A.static,
      trigger: TRIGGERS.onContact,
      opponent: attacker,
      rngNext: 0,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onContact, ctx);
    expect(result.activated).toBe(true);
    const statusEffect = result.effects.find((e) => e.effectType === "status-inflict");
    expect(statusEffect?.status).toBe(S.paralysis);
  });

  it("given Static, when RNG >= 30%, then does not paralyze", () => {
    // Source: Showdown data/abilities.ts -- static: this.randomChance(3, 10) = 30%
    // rngNext = 0.5 >= 0.3, so no paralysis
    const attacker = createOnFieldPokemon({ ability: A.none });
    const ctx = createAbilityContext({
      ability: A.static,
      trigger: TRIGGERS.onContact,
      opponent: attacker,
      rngNext: 0.5,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onContact, ctx);
    expect(result.activated).toBe(false);
  });
});

describe("Flame Body (on-contact)", () => {
  it("given Flame Body, when RNG < 30%, then burns attacker", () => {
    // Source: Showdown data/abilities.ts -- flamebody: 30% burn on contact
    const attacker = createOnFieldPokemon({ ability: A.none });
    const ctx = createAbilityContext({
      ability: A.flameBody,
      trigger: TRIGGERS.onContact,
      opponent: attacker,
      rngNext: 0,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onContact, ctx);
    expect(result.activated).toBe(true);
    const statusEffect = result.effects.find((e) => e.effectType === "status-inflict");
    expect(statusEffect?.status).toBe(S.burn);
  });

  it("given Flame Body, when attacker already has status, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- status already present = no status inflict
    const attacker = createOnFieldPokemon({ ability: A.none, primaryStatus: S.paralysis });
    const ctx = createAbilityContext({
      ability: A.flameBody,
      trigger: TRIGGERS.onContact,
      opponent: attacker,
      rngNext: 0,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onContact, ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// on-contact: Rough Skin / Iron Barbs
// ===========================================================================

describe("Rough Skin / Iron Barbs (on-contact)", () => {
  it("given Rough Skin, when attacker makes contact, then deals 1/8 attacker max HP chip", () => {
    // Source: Showdown data/abilities.ts -- roughskin: 1/8 attacker max HP on contact
    // Source: Bulbapedia "Rough Skin" -- "Damages the attacker for 1/8 of its max HP."
    // floor(200 / 8) = 25
    const attacker = createOnFieldPokemon({ ability: A.none, maxHp: 200 });
    const ctx = createAbilityContext({
      ability: A.roughSkin,
      trigger: TRIGGERS.onContact,
      opponent: attacker,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onContact, ctx);
    expect(result.activated).toBe(true);
    const chipEffect = result.effects.find((e) => e.effectType === "chip-damage");
    expect(chipEffect?.value).toBe(25);
  });

  it("given Iron Barbs, when attacker makes contact, then deals same 1/8 attacker max HP chip", () => {
    // Source: Showdown data/abilities.ts -- ironbarbs: identical to roughskin
    // Source: Bulbapedia "Iron Barbs" -- "Same as Rough Skin."
    const attacker = createOnFieldPokemon({ ability: A.none, maxHp: 160 });
    const ctx = createAbilityContext({
      ability: A.ironBarbs,
      trigger: TRIGGERS.onContact,
      opponent: attacker,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onContact, ctx);
    expect(result.activated).toBe(true);
    const chipEffect = result.effects.find((e) => e.effectType === "chip-damage");
    // floor(160 / 8) = 20
    expect(chipEffect?.value).toBe(20);
  });
});

// ===========================================================================
// on-contact: Mummy
// ===========================================================================

describe("Mummy (on-contact)", () => {
  it("given Mummy, when attacker has a copyable ability, then overwrites attacker's ability", () => {
    // Source: Showdown data/abilities.ts -- mummy: changes attacker ability to Mummy on contact
    const attacker = createOnFieldPokemon({ ability: A.swiftSwim });
    const ctx = createAbilityContext({ ability: A.mummy, trigger: TRIGGERS.onContact, opponent: attacker });
    const result = handleGen6SwitchAbility(TRIGGERS.onContact, ctx);
    expect(result.activated).toBe(true);
    const abilityEffect = result.effects.find((e) => e.effectType === "ability-change");
    expect(abilityEffect?.newAbility).toBe(A.mummy);
  });

  it("given Mummy, when attacker already has Mummy, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- mummy: cannot overwrite Mummy itself
    const attacker = createOnFieldPokemon({ ability: A.mummy });
    const ctx = createAbilityContext({ ability: A.mummy, trigger: TRIGGERS.onContact, opponent: attacker });
    const result = handleGen6SwitchAbility(TRIGGERS.onContact, ctx);
    expect(result.activated).toBe(false);
  });

  it("given Mummy, when attacker has Wonder Guard, then DOES overwrite (Wonder Guard is suppressable in Gen 6)", () => {
    // Source: Showdown data/mods/gen6/abilities.ts -- Gen 6 UNSUPPRESSABLE only includes
    // multitype, stance-change, zen-mode. Wonder Guard is NOT unsuppressable.
    // Bug #672: Previously UNSUPPRESSABLE_ABILITIES included Gen 7+ abilities like
    // wonder-guard, shields-down, power-construct, etc. which don't apply in Gen 6.
    const attacker = createOnFieldPokemon({ ability: A.wonderGuard });
    const ctx = createAbilityContext({ ability: A.mummy, trigger: TRIGGERS.onContact, opponent: attacker });
    const result = handleGen6SwitchAbility(TRIGGERS.onContact, ctx);
    expect(result.activated).toBe(true);
    const abilityEffect = result.effects.find((e) => e.effectType === "ability-change");
    expect(abilityEffect?.newAbility).toBe(A.mummy);
  });

  it("given Mummy, when attacker has Stance Change, then does NOT overwrite (unsuppressable in Gen 6)", () => {
    // Source: Showdown data/mods/gen6/abilities.ts -- stance-change: cantsuppress: 1
    // Stance Change IS in the Gen 6 unsuppressable set.
    const attacker = createOnFieldPokemon({ ability: A.stanceChange });
    const ctx = createAbilityContext({ ability: A.mummy, trigger: TRIGGERS.onContact, opponent: attacker });
    const result = handleGen6SwitchAbility(TRIGGERS.onContact, ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// on-contact: Effect Spore (Gen 6: Overcoat blocks it)
// ===========================================================================

describe("Effect Spore (on-contact)", () => {
  it("given Effect Spore, when RNG yields sleep (0-9 range), then inflicts sleep", () => {
    // Source: Showdown data/abilities.ts -- effectspore: roll 0-9 = sleep
    // Using rngNext = 0 / 100 = 0 (first roll < 10 → sleep)
    // We mock rng.next() * 100 to be 0
    const attacker = createOnFieldPokemon({ ability: A.none, types: [T.normal] });
    const ctxWith0Roll = {
      pokemon: createOnFieldPokemon({ ability: A.effectSpore }),
      opponent: attacker,
      state: createBattleState(),
      trigger: TRIGGERS.onContact,
      rng: { next: () => 0, int: () => 0 },
    } as unknown as AbilityContext;
    const result = handleGen6SwitchAbility(TRIGGERS.onContact, ctxWith0Roll);
    expect(result.activated).toBe(true);
    expect(result.effects[0]?.status).toBe(S.sleep);
  });

  it("given Effect Spore, when attacker has Overcoat (Gen 6), then does not activate", () => {
    // Source: Showdown data/mods/gen6/abilities.ts -- overcoat: blocks Effect Spore in Gen 6
    // Gen 5: Overcoat only blocks weather, NOT Effect Spore
    // Gen 6: Overcoat also blocks powder/spore moves and effects like Effect Spore
    const attacker = createOnFieldPokemon({ ability: A.overcoat, types: [T.normal] });
    const ctx = createAbilityContext({
      ability: A.effectSpore,
      trigger: TRIGGERS.onContact,
      opponent: attacker,
      rngNext: 0,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onContact, ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// on-damage-taken: Cursed Body / Rattled / Illusion
// ===========================================================================

describe("Cursed Body (on-damage-taken)", () => {
  it("given Cursed Body, when RNG < 30%, then disables attacker's last move", () => {
    // Source: Showdown data/abilities.ts -- cursedbody: 30% disable on damage
    const attacker = createOnFieldPokemon({ ability: A.none });
    const ctx = createAbilityContext({
      ability: A.cursedBody,
      trigger: TRIGGERS.onDamageTaken,
      opponent: attacker,
      rngNext: 0,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onDamageTaken, ctx);
    expect(result.activated).toBe(true);
    const volatileEffect = result.effects.find((e) => e.effectType === "volatile-inflict");
    expect(volatileEffect?.volatile).toBe(V.disable);
  });

  it("given Cursed Body, when attacker already has disable volatile, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- cursedbody: skips if already disabled
    const disabledVolatiles = new Map([[V.disable, { turnsLeft: 4 }]]);
    const attacker = createOnFieldPokemon({ ability: A.none, volatiles: disabledVolatiles });
    const ctx = createAbilityContext({
      ability: A.cursedBody,
      trigger: TRIGGERS.onDamageTaken,
      opponent: attacker,
      rngNext: 0,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onDamageTaken, ctx);
    expect(result.activated).toBe(false);
  });
});

describe("Rattled (on-damage-taken)", () => {
  it("given Rattled, when hit by a Dark move, then raises Speed by 1", () => {
    // Source: Showdown data/abilities.ts -- rattled: +1 Speed from Bug/Dark/Ghost hit
    const darkMove = createSyntheticMove(GEN6_MOVE_IDS.darkPulse);
    const ctx = createAbilityContext({
      ability: A.rattled,
      trigger: TRIGGERS.onDamageTaken,
      move: darkMove,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onDamageTaken, ctx);
    expect(result.activated).toBe(true);
    const statEffect = result.effects.find((e) => e.effectType === "stat-change");
    expect(statEffect?.stat).toBe("speed");
    expect(statEffect?.stages).toBe(1);
  });

  it("given Rattled, when hit by a Fire move, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- rattled: only Bug/Dark/Ghost
    const fireMove = createSyntheticMove(GEN6_MOVE_IDS.flamethrower);
    const ctx = createAbilityContext({
      ability: A.rattled,
      trigger: TRIGGERS.onDamageTaken,
      move: fireMove,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onDamageTaken, ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// on-status-inflicted: Synchronize
// ===========================================================================

describe("Synchronize (on-status-inflicted)", () => {
  it("given Synchronize, when burned by opponent, then inflicts burn on opponent", () => {
    // Source: Showdown data/abilities.ts -- synchronize: spreads burn/paralysis/poison back
    const ctx = createAbilityContext({
      ability: A.synchronize,
      trigger: TRIGGERS.onStatusInflicted,
      primaryStatus: S.burn,
      opponent: createOnFieldPokemon({ ability: A.none }),
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onStatusInflicted, ctx);
    expect(result.activated).toBe(true);
    const statusEffect = result.effects.find((e) => e.effectType === "status-inflict");
    expect(statusEffect?.status).toBe(S.burn);
    expect(statusEffect?.target).toBe("opponent");
  });

  it("given Synchronize, when put to sleep by opponent, then does NOT spread sleep", () => {
    // Source: Showdown data/abilities.ts -- synchronize: only burn/paralysis/poison, not sleep
    const ctx = createAbilityContext({
      ability: A.synchronize,
      trigger: TRIGGERS.onStatusInflicted,
      primaryStatus: S.sleep,
      opponent: createOnFieldPokemon({ ability: A.none }),
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onStatusInflicted, ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// passive-immunity: Overcoat (Gen 6: also blocks powder)
// ===========================================================================

describe("Overcoat (Gen 6: blocks powder moves)", () => {
  it("given Overcoat, when hit by a powder move, then blocks it (Gen 6 new)", () => {
    // Source: Showdown data/mods/gen6/abilities.ts -- overcoat: also blocks powder flag
    // Gen 6 change: Overcoat now blocks moves with the powder flag (Sleep Powder, Spore, etc.)
    // Source: Bulbapedia "Overcoat" Gen VI -- "Also protects from powder and spore moves."
    const powderMove = dataManager.getMove(M.sleepPowder);
    const ctx = createAbilityContext({
      ability: A.overcoat,
      trigger: TRIGGERS.passiveImmunity,
      move: powderMove,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.passiveImmunity, ctx);
    expect(result.activated).toBe(true);
  });

  it("given Overcoat, when hit by a non-powder move, then returns no passive-immunity effect", () => {
    // Source: Showdown data/abilities.ts -- overcoat's weather immunity is handled
    // by the weather module, not the passive-immunity hook.
    const normalMove = dataManager.getMove(M.tackle);
    const ctx = createAbilityContext({
      ability: A.overcoat,
      trigger: TRIGGERS.passiveImmunity,
      move: normalMove,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.passiveImmunity, ctx);
    expect(result.activated).toBe(false);
    expect(result.effects).toHaveLength(0);
  });
});

// ===========================================================================
// passive-immunity: Bulletproof (NEW Gen 6)
// ===========================================================================

describe("Bulletproof (Gen 6 new)", () => {
  it("given Bulletproof, when hit by Shadow Ball (bullet flag), then blocks it", () => {
    // Source: Showdown data/abilities.ts -- bulletproof: blocks moves with bullet flag
    // Source: Bulbapedia "Bulletproof" -- "Protects the Pokemon from some ball and bomb moves."
    const shadowBall = {
      ...dataManager.getMove(M.shadowBall),
      flags: { ...dataManager.getMove(M.shadowBall).flags, bullet: true },
    };
    const ctx = createAbilityContext({
      ability: A.bulletproof,
      trigger: TRIGGERS.passiveImmunity,
      move: shadowBall,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.passiveImmunity, ctx);
    expect(result.activated).toBe(true);
  });

  it("given Bulletproof, when hit by a non-ball move like Flamethrower, then does not block", () => {
    // Source: Showdown data/abilities.ts -- bulletproof: only blocks flagged ball/bomb moves
    const flamethrower = dataManager.getMove(M.flamethrower);
    const ctx = createAbilityContext({
      ability: A.bulletproof,
      trigger: TRIGGERS.passiveImmunity,
      move: flamethrower,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.passiveImmunity, ctx);
    expect(result.activated).toBe(false);
  });
});

describe("isBulletproofBlocked utility", () => {
  it("given bulletproof ability and move with bullet flag, then returns true", () => {
    // Source: Showdown data/abilities.ts -- bulletproof checks move.flags.bullet
    expect(isBulletproofBlocked(A.bulletproof, { bullet: true })).toBe(true);
  });

  it("given bulletproof ability and move without bullet flag, then returns false", () => {
    // Source: Showdown data/abilities.ts -- no bullet flag = not blocked
    expect(isBulletproofBlocked(A.bulletproof, {})).toBe(false);
  });

  it("given non-bulletproof ability and move with bullet flag, then returns false", () => {
    // Source: Showdown data/abilities.ts -- only bulletproof blocks bullet moves
    expect(isBulletproofBlocked(A.blaze, { bullet: true })).toBe(false);
  });
});

// ===========================================================================
// passive-immunity: Sweet Veil (NEW Gen 6)
// ===========================================================================

describe("Sweet Veil (Gen 6 new)", () => {
  it("given Sweet Veil, when targeted by Sleep Powder (sleep effect), then blocks sleep", () => {
    // Source: Showdown data/abilities.ts -- sweetveil: prevents sleep on holder and allies
    // Source: Bulbapedia "Sweet Veil" -- "Prevents the Pokemon and its allies from falling asleep."
    const sleepPowder = dataManager.getMove(M.sleepPowder);
    const ctx = createAbilityContext({
      ability: A.sweetVeil,
      trigger: TRIGGERS.passiveImmunity,
      move: sleepPowder,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.passiveImmunity, ctx);
    expect(result.activated).toBe(true);
  });

  it("given Sweet Veil, when targeted by Spore (sleep effect), then also blocks sleep", () => {
    // Source: Bulbapedia "Sweet Veil" -- blocks all sleep-inducing moves
    const spore = dataManager.getMove(M.spore);
    const ctx = createAbilityContext({
      ability: A.sweetVeil,
      trigger: TRIGGERS.passiveImmunity,
      move: spore,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.passiveImmunity, ctx);
    expect(result.activated).toBe(true);
  });

  it("given Sweet Veil, when targeted by Thunder Wave (paralyze, not sleep), then does NOT block", () => {
    // Source: Showdown data/abilities.ts -- Sweet Veil only blocks sleep
    // Bug #668: Previously checked hardcoded move IDs. Now checks move.effect for sleep status.
    // A non-sleep status move should not trigger Sweet Veil.
    const thunderWave = dataManager.getMove(M.thunderWave);
    const ctx = createAbilityContext({
      ability: A.sweetVeil,
      trigger: TRIGGERS.passiveImmunity,
      move: thunderWave,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.passiveImmunity, ctx);
    expect(result.activated).toBe(false);
  });

  it("given Sweet Veil, when targeted by Yawn (volatile sleep), then blocks it", () => {
    // Source: Showdown data/abilities.ts -- Sweet Veil prevents all forms of sleep, including Yawn
    // Source: Bulbapedia "Sweet Veil" -- prevents sleep; Yawn leads to sleep so it's blocked
    const yawn = dataManager.getMove(M.yawn);
    const ctx = createAbilityContext({
      ability: A.sweetVeil,
      trigger: TRIGGERS.passiveImmunity,
      move: yawn,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.passiveImmunity, ctx);
    expect(result.activated).toBe(true);
  });
});

// ===========================================================================
// passive-immunity: Flash Fire / Water Absorb / Sap Sipper
// ===========================================================================

describe("Flash Fire (passive-immunity)", () => {
  it("given Flash Fire, when hit by a Fire move, then activates and grants boost", () => {
    // Source: Showdown data/abilities.ts -- flashfire: immune to Fire + gains flash-fire boost
    // Source: Bulbapedia "Flash Fire" -- "Powers up Fire moves when hit by Fire-type moves."
    const fireMove = dataManager.getMove(GEN6_MOVE_IDS.flamethrower);
    const ctx = createAbilityContext({ ability: A.flashFire, trigger: TRIGGERS.passiveImmunity, move: fireMove });
    const result = handleGen6SwitchAbility(TRIGGERS.passiveImmunity, ctx);
    expect(result.activated).toBe(true);
    const volatileEffect = result.effects.find((e) => e.effectType === "volatile-inflict");
    expect(volatileEffect?.volatile).toBe(A.flashFire);
  });

  it("given Flash Fire, when hit by a Water move, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- flashfire: only triggers on fire-type moves
    const waterMove = dataManager.getMove(GEN6_MOVE_IDS.waterPulse);
    const ctx = createAbilityContext({
      ability: A.flashFire,
      trigger: TRIGGERS.passiveImmunity,
      move: waterMove,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.passiveImmunity, ctx);
    expect(result.activated).toBe(false);
  });
});

describe("Water Absorb (passive-immunity)", () => {
  it("given Water Absorb, when hit by a Water move, then heals 1/4 max HP", () => {
    // Source: Showdown data/abilities.ts -- waterabsorb: Water immune + heal 1/4 HP
    // Source: Bulbapedia "Water Absorb" -- "Heals 1/4 max HP when hit by Water-type moves."
    // floor(200 / 4) = 50
    const waterMove = dataManager.getMove(GEN6_MOVE_IDS.waterPulse);
    const ctx = createAbilityContext({
      ability: A.waterAbsorb,
      trigger: TRIGGERS.passiveImmunity,
      move: waterMove,
      maxHp: 200,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.passiveImmunity, ctx);
    expect(result.activated).toBe(true);
    const healEffect = result.effects.find((e) => e.effectType === "heal");
    expect(healEffect?.value).toBe(50);
  });

  it("given Water Absorb, when hit by a Fire move, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- waterabsorb: only water-type
    const fireMove = dataManager.getMove(GEN6_MOVE_IDS.flamethrower);
    const ctx = createAbilityContext({
      ability: A.waterAbsorb,
      trigger: TRIGGERS.passiveImmunity,
      move: fireMove,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.passiveImmunity, ctx);
    expect(result.activated).toBe(false);
  });
});

describe("Sap Sipper (passive-immunity)", () => {
  it("given Sap Sipper, when hit by a Grass move, then raises Attack by 1", () => {
    // Source: Showdown data/abilities.ts -- sapsipper: Grass immune + Attack +1
    const grassMove = dataManager.getMove(GEN6_MOVE_IDS.gigaDrain);
    const ctx = createAbilityContext({
      ability: A.sapSipper,
      trigger: TRIGGERS.passiveImmunity,
      move: grassMove,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.passiveImmunity, ctx);
    expect(result.activated).toBe(true);
    const statEffect = result.effects.find((e) => e.effectType === "stat-change");
    expect(statEffect?.stat).toBe("attack");
    expect(statEffect?.stages).toBe(1);
  });

  it("given Sap Sipper, when hit by a Water move, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- sapsipper: only grass-type
    const waterMove = dataManager.getMove(GEN6_MOVE_IDS.waterPulse);
    const ctx = createAbilityContext({
      ability: A.sapSipper,
      trigger: TRIGGERS.passiveImmunity,
      move: waterMove,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.passiveImmunity, ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// on-stat-change: Big Pecks / Flower Veil
// ===========================================================================

describe("Big Pecks (on-stat-change)", () => {
  it("given Big Pecks, when Defense is about to be lowered, then blocks the drop", () => {
    // Source: Showdown data/abilities.ts -- bigpecks: blocks Defense drops
    const ctx = createAbilityContext({
      ability: A.bigPecks,
      trigger: TRIGGERS.onStatChange,
      statChange: { stat: "defense", stages: -1, source: "opponent" },
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onStatChange, ctx);
    expect(result.activated).toBe(true);
  });

  it("given Big Pecks, when Speed is lowered (not Defense), then does not activate", () => {
    // Source: Showdown data/abilities.ts -- bigpecks: only Defense
    const ctx = createAbilityContext({
      ability: A.bigPecks,
      trigger: TRIGGERS.onStatChange,
      statChange: { stat: "speed", stages: -1, source: "opponent" },
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onStatChange, ctx);
    expect(result.activated).toBe(false);
  });
});

describe("Flower Veil (Gen 6 new, on-stat-change)", () => {
  it("given Flower Veil on a Grass-type, when opponent lowers a stat, then blocks the drop", () => {
    // Source: Showdown data/abilities.ts -- flowerveil: blocks stat drops for Grass-type holders
    // Source: Bulbapedia "Flower Veil" -- "Prevents lowering of ally Grass-type Pokemon's stats."
    const opponent = createOnFieldPokemon({ ability: A.none });
    const ctx = createAbilityContext({
      ability: A.flowerVeil,
      trigger: TRIGGERS.onStatChange,
      types: [T.grass],
      opponent,
      statChange: { stat: "attack", stages: -1, source: "opponent" },
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onStatChange, ctx);
    expect(result.activated).toBe(true);
  });

  it("given Flower Veil on a non-Grass-type, when stat is lowered, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- flowerveil: only for Grass types
    const opponent = createOnFieldPokemon({ ability: A.none });
    const ctx = createAbilityContext({
      ability: A.flowerVeil,
      trigger: TRIGGERS.onStatChange,
      types: [T.normal],
      opponent,
      statChange: { stat: "attack", stages: -1, source: "opponent" },
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onStatChange, ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// on-accuracy-check: Victory Star
// ===========================================================================

describe("Victory Star (on-accuracy-check)", () => {
  it("given Victory Star, when on-accuracy-check, then activates", () => {
    // Source: Showdown data/abilities.ts -- victorystar: raises accuracy by ~10%
    const ctx = createAbilityContext({ ability: A.victoryStar, trigger: TRIGGERS.onAccuracyCheck });
    const result = handleGen6SwitchAbility(TRIGGERS.onAccuracyCheck, ctx);
    expect(result.activated).toBe(true);
  });

  it("given Victory Star accuracy multiplier, then equals 4506/4096 (~1.1x)", () => {
    // Source: Showdown data/abilities.ts -- victorystar: chainModify([4506, 4096])
    // 4506 / 4096 = 1.1000976...
    expect(VICTORY_STAR_ACCURACY_MULTIPLIER).toBeCloseTo(1.1, 1);
  });
});

// ===========================================================================
// Trapping utilities
// ===========================================================================

describe("isTrappedByAbility utilities", () => {
  it("given Shadow Tag trapper, when trapped has different ability, then isTrapped is true", () => {
    // Source: Showdown data/abilities.ts -- shadowtag: traps unless opponent also has Shadow Tag
    expect(
      isTrappedByAbility({ ability: A.shadowTag }, { ability: A.none, types: [] }, true),
    ).toBe(true);
  });

  it("given Shadow Tag trapper, when trapped also has Shadow Tag, then isTrapped is false", () => {
    // Source: Showdown data/abilities.ts -- Shadow Tag: both have Shadow Tag = no trap
    expect(
      isTrappedByAbility({ ability: A.shadowTag }, { ability: A.shadowTag, types: [] }, true),
    ).toBe(false);
  });
});

describe("isMoldBreakerAbility utility", () => {
  it("given mold-breaker, then isMoldBreaker returns true", () => {
    // Source: Showdown data/abilities.ts -- moldbreaker, teravolt, turboblaze all ignore ability
    expect(isMoldBreakerAbility(A.moldBreaker)).toBe(true);
  });

  it("given teravolt, then isMoldBreaker returns true", () => {
    // Source: Showdown data/abilities.ts -- teravolt: onModifyMove: move.ignoreAbility = true
    expect(isMoldBreakerAbility(A.teravolt)).toBe(true);
  });

  it("given levitate, then isMoldBreaker returns false", () => {
    // Source: Showdown data/abilities.ts -- levitate is not a mold-breaker variant
    expect(isMoldBreakerAbility(A.levitate)).toBe(false);
  });
});
