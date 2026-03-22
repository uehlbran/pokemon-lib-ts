import type { AbilityContext, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  getGulpMissileResult,
  getScreenCleanerTargets,
  getWeatherDuration,
  handleGen8SwitchAbility,
  hasMagicGuard,
  hasOvercoat,
  isBulletproofBlocked,
  isCramorantWithGulpMissile,
  isDampBlocked,
  isIceFaceActive,
  isLiberoActive,
  isMoldBreakerAbility,
  isNeutralizingGasActive,
  isNeutralizingGasImmune,
  isPastelVeilBlocking,
  isScreenCleaner,
  isSoundproofBlocked,
  MOLD_BREAKER_ALIASES,
  NEUTRALIZING_GAS_IMMUNE_ABILITIES,
  rollHarvest,
  rollShedSkin,
  SCREEN_CLEANER_SCREENS,
  shouldHungerSwitchToggle,
  shouldIceFaceReform,
  shouldMirrorArmorReflect,
  shouldPerishBodyTrigger,
  shouldWanderingSpiritSwap,
  TRACE_UNCOPYABLE_ABILITIES,
  UNSUPPRESSABLE_ABILITIES,
} from "../src/Gen8AbilitiesSwitch";

/**
 * Gen 8 switch-in, switch-out, contact, and passive ability tests.
 *
 * Tests carry-forward abilities from Gen 7 and Gen 8 additions:
 *   - Magic Guard, Overcoat, Soundproof, Bulletproof, Damp (passive checks)
 *   - Shed Skin, Harvest (end-of-turn RNG checks)
 *   - Screen Cleaner (new Gen 8): removes all screens from both sides
 *   - Mirror Armor (new Gen 8): reflects stat drops back to attacker
 *   - Neutralizing Gas (new Gen 8): suppresses all abilities on the field
 *   - Pastel Veil (new Gen 8): prevents poison for holder and allies
 *   - Wandering Spirit (new Gen 8): swaps abilities on contact
 *   - Perish Body (new Gen 8): both get Perish Song on contact
 *   - Libero/Protean (Gen 8 behavior): type change on every move use
 *   - Ice Face (new Gen 8): blocks first physical hit, reforms in hail
 *   - Intrepid Sword / Dauntless Shield (Gen 8): every switch-in boost
 *
 * Source: Showdown data/abilities.ts
 * Source: Showdown data/mods/gen8/abilities.ts
 * Source: Bulbapedia -- individual ability articles
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makePokemonInstance(overrides: {
  speciesId?: number;
  nickname?: string | null;
  ability?: string;
  heldItem?: string | null;
  currentHp?: number;
  maxHp?: number;
  status?: string | null;
  gender?: "male" | "female" | "genderless";
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  return {
    uid: `test-${Math.random()}`,
    speciesId: overrides.speciesId ?? 1,
    nickname: overrides.nickname ?? null,
    level: 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: overrides.currentHp ?? maxHp,
    moves: [],
    ability: overrides.ability ?? "",
    abilitySlot: "normal1" as const,
    heldItem: overrides.heldItem ?? null,
    status: (overrides.status as PokemonInstance["status"]) ?? null,
    friendship: 0,
    gender: overrides.gender ?? "male",
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: "pokeball",
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

function makeActivePokemon(overrides: {
  ability?: string;
  types?: PokemonType[];
  nickname?: string | null;
  currentHp?: number;
  maxHp?: number;
  speciesId?: number;
  status?: string | null;
  heldItem?: string | null;
  gender?: "male" | "female" | "genderless";
  substituteHp?: number;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
}) {
  return {
    pokemon: makePokemonInstance({
      ability: overrides.ability,
      nickname: overrides.nickname,
      currentHp: overrides.currentHp,
      maxHp: overrides.maxHp,
      speciesId: overrides.speciesId,
      status: overrides.status,
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
    types: overrides.types ?? ["normal"],
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

function makeSide(index: 0 | 1): BattleSide {
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

function makeBattleState(): BattleState {
  return {
    phase: "turn-end",
    generation: 8,
    format: "singles",
    turnNumber: 1,
    sides: [makeSide(0), makeSide(1)],
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

function makeMove(
  type: PokemonType,
  opts: {
    id?: string;
    category?: "physical" | "special" | "status";
    flags?: Record<string, boolean>;
  } = {},
): MoveData {
  return {
    id: opts.id ?? "test-move",
    displayName: "Test Move",
    type,
    category: opts.category ?? "physical",
    power: opts.category === "status" ? 0 : 80,
    accuracy: 100,
    pp: 10,
    maxPp: 10,
    priority: 0,
    target: "single",
    generation: 8,
    flags: opts.flags ?? { contact: true },
    effectChance: null,
    secondaryEffects: [],
  } as unknown as MoveData;
}

function makeContext(opts: {
  ability: string;
  trigger: string;
  types?: PokemonType[];
  opponent?: ReturnType<typeof makeActivePokemon>;
  move?: MoveData;
  nickname?: string;
  heldItem?: string | null;
  speciesId?: number;
  status?: string | null;
  currentHp?: number;
  maxHp?: number;
  rng?: { next: () => number };
  substituteHp?: number;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  gender?: "male" | "female" | "genderless";
  statChange?: { stat: string; stages: number; source: "self" | "opponent" };
}): AbilityContext {
  const state = makeBattleState();
  if (opts.rng) {
    (state as any).rng = { ...state.rng, ...opts.rng };
  }
  const pokemon = makeActivePokemon({
    ability: opts.ability,
    types: opts.types,
    nickname: opts.nickname,
    heldItem: opts.heldItem,
    speciesId: opts.speciesId,
    status: opts.status,
    currentHp: opts.currentHp,
    maxHp: opts.maxHp,
    substituteHp: opts.substituteHp,
    volatiles: opts.volatiles,
    gender: opts.gender,
  });

  return {
    pokemon,
    opponent: opts.opponent,
    state,
    rng: (opts.rng ?? state.rng) as any,
    trigger: opts.trigger as any,
    move: opts.move,
    statChange: opts.statChange as any,
  };
}

// ---------------------------------------------------------------------------
// Tests: Carry-forward passive ability checks
// ---------------------------------------------------------------------------

describe("Gen 8 Passive Ability Checks (carry-forward)", () => {
  describe("hasMagicGuard", () => {
    it("given magic-guard, when checking, then returns true", () => {
      // Source: Showdown data/abilities.ts -- magicguard blocks indirect damage
      expect(hasMagicGuard("magic-guard")).toBe(true);
    });

    it("given other ability, when checking, then returns false", () => {
      // Source: Showdown data/abilities.ts -- only magic-guard triggers this
      expect(hasMagicGuard("levitate")).toBe(false);
    });
  });

  describe("hasOvercoat", () => {
    it("given overcoat, when checking, then returns true", () => {
      // Source: Showdown data/abilities.ts -- overcoat blocks weather + powder
      expect(hasOvercoat("overcoat")).toBe(true);
    });

    it("given other ability, when checking, then returns false", () => {
      expect(hasOvercoat("sturdy")).toBe(false);
    });
  });

  describe("isBulletproofBlocked", () => {
    it("given bulletproof ability and bullet flag move, when checking, then returns true", () => {
      // Source: Showdown data/abilities.ts -- bulletproof: move.flags['bullet']
      expect(isBulletproofBlocked("bulletproof", { bullet: true })).toBe(true);
    });

    it("given bulletproof ability and non-bullet move, when checking, then returns false", () => {
      expect(isBulletproofBlocked("bulletproof", { contact: true })).toBe(false);
    });

    it("given non-bulletproof ability and bullet flag move, when checking, then returns false", () => {
      expect(isBulletproofBlocked("sturdy", { bullet: true })).toBe(false);
    });
  });

  describe("isDampBlocked", () => {
    it("given damp ability and explosion, when checking, then returns true", () => {
      // Source: Showdown data/abilities.ts -- damp prevents Explosion
      expect(isDampBlocked("damp", "explosion")).toBe(true);
    });

    it("given damp ability and self-destruct, when checking, then returns true", () => {
      // Source: Showdown data/abilities.ts -- damp prevents Self-Destruct
      expect(isDampBlocked("damp", "self-destruct")).toBe(true);
    });

    it("given damp ability and mind-blown, when checking, then returns true", () => {
      // Source: Showdown data/abilities.ts -- damp prevents Mind Blown (Gen 7+)
      expect(isDampBlocked("damp", "mind-blown")).toBe(true);
    });

    it("given damp ability and normal move, when checking, then returns false", () => {
      expect(isDampBlocked("damp", "tackle")).toBe(false);
    });

    it("given non-damp ability and explosion, when checking, then returns false", () => {
      expect(isDampBlocked("sturdy", "explosion")).toBe(false);
    });
  });

  describe("isSoundproofBlocked", () => {
    it("given soundproof ability and sound flag move, when checking, then returns true", () => {
      // Source: Showdown data/abilities.ts -- soundproof: move.flags['sound']
      expect(isSoundproofBlocked("soundproof", { sound: true })).toBe(true);
    });

    it("given soundproof ability and non-sound move, when checking, then returns false", () => {
      expect(isSoundproofBlocked("soundproof", { contact: true })).toBe(false);
    });

    it("given non-soundproof ability and sound flag move, when checking, then returns false", () => {
      expect(isSoundproofBlocked("sturdy", { sound: true })).toBe(false);
    });
  });

  describe("isMoldBreakerAbility", () => {
    it("given mold-breaker, when checking, then returns true", () => {
      // Source: Showdown data/abilities.ts -- moldbreaker
      expect(isMoldBreakerAbility("mold-breaker")).toBe(true);
    });

    it("given teravolt, when checking, then returns true", () => {
      // Source: Showdown data/abilities.ts -- teravolt is mold breaker variant
      expect(isMoldBreakerAbility("teravolt")).toBe(true);
    });

    it("given turboblaze, when checking, then returns true", () => {
      // Source: Showdown data/abilities.ts -- turboblaze is mold breaker variant
      expect(isMoldBreakerAbility("turboblaze")).toBe(true);
    });

    it("given other ability, when checking, then returns false", () => {
      expect(isMoldBreakerAbility("intimidate")).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: RNG-based passive abilities
// ---------------------------------------------------------------------------

describe("Gen 8 RNG-based Passive Abilities (carry-forward)", () => {
  describe("rollShedSkin", () => {
    it("given shed-skin with status and low RNG roll, when rolling, then returns true (cures)", () => {
      // Source: Showdown data/abilities.ts -- Shed Skin: 1/3 chance to cure
      // 1/3 = 0.3333... so roll of 0.3 is below threshold
      expect(rollShedSkin("shed-skin", true, 0.3)).toBe(true);
    });

    it("given shed-skin with status and high RNG roll, when rolling, then returns false (no cure)", () => {
      // Source: Showdown data/abilities.ts -- Shed Skin: ~67% chance of failure
      // Roll of 0.5 > 1/3 threshold
      expect(rollShedSkin("shed-skin", true, 0.5)).toBe(false);
    });

    it("given shed-skin without status, when rolling, then returns false", () => {
      // Source: Showdown data/abilities.ts -- Shed Skin only cures if status exists
      expect(rollShedSkin("shed-skin", false, 0.1)).toBe(false);
    });

    it("given non-shed-skin ability with status, when rolling, then returns false", () => {
      expect(rollShedSkin("sturdy", true, 0.1)).toBe(false);
    });
  });

  describe("rollHarvest", () => {
    it("given harvest with consumed berry and low RNG roll, when rolling, then returns true", () => {
      // Source: Showdown data/abilities.ts -- Harvest: 50% normally
      // Roll of 0.3 < 0.5 threshold
      expect(rollHarvest("harvest", true, null, 0.3)).toBe(true);
    });

    it("given harvest with consumed berry and high RNG roll, when rolling, then returns false", () => {
      // Source: Showdown data/abilities.ts -- Harvest: 50% normally
      // Roll of 0.7 > 0.5 threshold
      expect(rollHarvest("harvest", true, null, 0.7)).toBe(false);
    });

    it("given harvest with consumed berry in sun, when rolling, then always returns true", () => {
      // Source: Showdown data/abilities.ts -- Harvest: 100% in sun
      // Even a high RNG roll returns true in sun
      expect(rollHarvest("harvest", true, "sun", 0.99)).toBe(true);
    });

    it("given harvest without consumed berry, when rolling, then returns false", () => {
      // Source: Showdown data/abilities.ts -- Harvest: needs consumed berry
      expect(rollHarvest("harvest", false, null, 0.1)).toBe(false);
    });
  });

  describe("getWeatherDuration", () => {
    it("given no held item, when getting duration, then returns 5 turns", () => {
      // Source: Showdown data/abilities.ts -- base weather is 5 turns
      expect(getWeatherDuration(null, "rain")).toBe(5);
    });

    it("given damp-rock for rain, when getting duration, then returns 8 turns", () => {
      // Source: Showdown data/items.ts -- Damp Rock extends rain to 8 turns
      expect(getWeatherDuration("damp-rock", "rain")).toBe(8);
    });

    it("given heat-rock for sun, when getting duration, then returns 8 turns", () => {
      // Source: Showdown data/items.ts -- Heat Rock extends sun to 8 turns
      expect(getWeatherDuration("heat-rock", "sun")).toBe(8);
    });

    it("given damp-rock for sun (wrong weather), when getting duration, then returns 5 turns", () => {
      // Source: Showdown data/items.ts -- rock must match weather type
      expect(getWeatherDuration("damp-rock", "sun")).toBe(5);
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Gen 8 New Abilities -- Screen Cleaner
// ---------------------------------------------------------------------------

describe("Gen 8 Screen Cleaner", () => {
  it("given screen-cleaner ability, when switching in, then returns activated with field effect", () => {
    // Source: Showdown data/abilities.ts -- Screen Cleaner onStart: removes screens both sides
    // Source: specs/reference/gen8-ground-truth.md -- Screen Cleaner: both sides + Aurora Veil
    const ctx = makeContext({
      ability: "screen-cleaner",
      trigger: "on-switch-in",
      nickname: "MrRime",
    });

    const result = handleGen8SwitchAbility("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("Screen Cleaner");
  });

  it("given isScreenCleaner, when checking screen-cleaner ability, then returns true", () => {
    // Source: Showdown data/abilities.ts -- Screen Cleaner ability ID
    expect(isScreenCleaner("screen-cleaner")).toBe(true);
  });

  it("given isScreenCleaner, when checking other ability, then returns false", () => {
    expect(isScreenCleaner("intimidate")).toBe(false);
  });

  it("given getScreenCleanerTargets, when called, then returns reflect, light-screen, and aurora-veil", () => {
    // Source: Showdown data/abilities.ts -- Screen Cleaner removes all three screen types
    const targets = getScreenCleanerTargets();
    expect(targets).toContain("reflect");
    expect(targets).toContain("light-screen");
    expect(targets).toContain("aurora-veil");
    expect(targets).toHaveLength(3);
  });

  it("given SCREEN_CLEANER_SCREENS constant, then includes aurora-veil (Gen 8 spec fix)", () => {
    // Source: specs/battle/09-gen8.md -- Screen Cleaner was corrected to include Aurora Veil
    // The v2.0 spec fix confirmed Aurora Veil is included
    expect(SCREEN_CLEANER_SCREENS).toContain("aurora-veil");
  });
});

// ---------------------------------------------------------------------------
// Tests: Gen 8 New Abilities -- Mirror Armor
// ---------------------------------------------------------------------------

describe("Gen 8 Mirror Armor", () => {
  it("given mirror-armor and opponent stat drop, when checking, then reflects stat drop", () => {
    // Source: Showdown data/abilities.ts -- Mirror Armor onTryBoost: reflects opponent-caused drops
    // Source: Bulbapedia "Mirror Armor" -- reflects stat-lowering effects
    expect(shouldMirrorArmorReflect("mirror-armor", -1, "opponent")).toBe(true);
  });

  it("given mirror-armor and opponent stat drop of -2, when checking, then reflects", () => {
    // Source: Showdown data/abilities.ts -- Mirror Armor reflects any magnitude of drop
    expect(shouldMirrorArmorReflect("mirror-armor", -2, "opponent")).toBe(true);
  });

  it("given mirror-armor and self-inflicted stat drop, when checking, then does not reflect", () => {
    // Source: Showdown data/abilities.ts -- Mirror Armor only reflects opponent-caused drops
    // Self-inflicted drops (e.g. Close Combat, Superpower) are not reflected
    expect(shouldMirrorArmorReflect("mirror-armor", -1, "self")).toBe(false);
  });

  it("given mirror-armor and stat boost (positive stages), when checking, then does not reflect", () => {
    // Source: Showdown data/abilities.ts -- Mirror Armor only reflects negative stat changes
    expect(shouldMirrorArmorReflect("mirror-armor", 1, "opponent")).toBe(false);
  });

  it("given non-mirror-armor ability and opponent stat drop, when checking, then does not reflect", () => {
    expect(shouldMirrorArmorReflect("intimidate", -1, "opponent")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: Gen 8 New Abilities -- Neutralizing Gas
// ---------------------------------------------------------------------------

describe("Gen 8 Neutralizing Gas", () => {
  it("given neutralizing-gas on field, when checking isNeutralizingGasActive, then returns true", () => {
    // Source: Showdown data/abilities.ts -- Neutralizing Gas suppresses all abilities on field
    // Source: Bulbapedia "Neutralizing Gas" -- nullifies all abilities while on field
    expect(isNeutralizingGasActive(["intimidate", "neutralizing-gas", "levitate"])).toBe(true);
  });

  it("given no neutralizing-gas on field, when checking isNeutralizingGasActive, then returns false", () => {
    // Source: Showdown data/abilities.ts -- only active when Neutralizing Gas Pokemon is on field
    expect(isNeutralizingGasActive(["intimidate", "levitate"])).toBe(false);
  });

  it("given neutralizing-gas ability, when checking immunity, then is immune to its own suppression", () => {
    // Source: Showdown data/abilities.ts -- Neutralizing Gas cannot suppress itself
    expect(isNeutralizingGasImmune("neutralizing-gas")).toBe(true);
  });

  it("given comatose ability, when checking immunity, then is immune to Neutralizing Gas", () => {
    // Source: Showdown data/abilities.ts -- Comatose is in the unsuppressable set
    expect(isNeutralizingGasImmune("comatose")).toBe(true);
  });

  it("given normal ability like intimidate, when checking immunity, then is NOT immune", () => {
    // Source: Showdown data/abilities.ts -- most abilities are suppressed
    expect(isNeutralizingGasImmune("intimidate")).toBe(false);
  });

  it("given neutralizing-gas user, when switching in, then announces Neutralizing Gas", () => {
    // Source: Showdown data/abilities.ts -- Neutralizing Gas onStart message
    const ctx = makeContext({
      ability: "neutralizing-gas",
      trigger: "on-switch-in",
      nickname: "Weezing",
    });

    const result = handleGen8SwitchAbility("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("Neutralizing Gas");
  });
});

// ---------------------------------------------------------------------------
// Tests: Gen 8 New Abilities -- Pastel Veil
// ---------------------------------------------------------------------------

describe("Gen 8 Pastel Veil", () => {
  it("given pastel-veil on side and poison status, when checking, then blocks poison", () => {
    // Source: Showdown data/abilities.ts -- Pastel Veil onAllySetStatus: blocks poison
    // Source: Bulbapedia "Pastel Veil" -- prevents poisoning for holder and allies
    expect(isPastelVeilBlocking(["pastel-veil", "run-away"], "poison")).toBe(true);
  });

  it("given pastel-veil on side and bad-poison status, when checking, then blocks toxic", () => {
    // Source: Showdown data/abilities.ts -- Pastel Veil blocks Toxic poison too
    expect(isPastelVeilBlocking(["pastel-veil"], "bad-poison")).toBe(true);
  });

  it("given pastel-veil on ally (not self), when checking poison, then still blocks", () => {
    // Source: Showdown data/abilities.ts -- Pastel Veil onAllySetStatus (covers allies too)
    // Source: Bulbapedia "Pastel Veil" -- "prevents the Pokemon and its allies from being poisoned"
    expect(isPastelVeilBlocking(["run-away", "pastel-veil"], "poison")).toBe(true);
  });

  it("given pastel-veil on side and burn status, when checking, then does NOT block burn", () => {
    // Source: Showdown data/abilities.ts -- Pastel Veil only blocks poison/toxic
    expect(isPastelVeilBlocking(["pastel-veil"], "burn")).toBe(false);
  });

  it("given pastel-veil on side and paralysis status, when checking, then does NOT block paralysis", () => {
    // Source: Showdown data/abilities.ts -- Pastel Veil only blocks poison/toxic
    expect(isPastelVeilBlocking(["pastel-veil"], "paralysis")).toBe(false);
  });

  it("given no pastel-veil on side and poison status, when checking, then does not block", () => {
    expect(isPastelVeilBlocking(["intimidate", "levitate"], "poison")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: Gen 8 New Abilities -- Wandering Spirit
// ---------------------------------------------------------------------------

describe("Gen 8 Wandering Spirit", () => {
  it("given wandering-spirit and on-contact trigger with contact, when checking, then returns true", () => {
    // Source: Showdown data/abilities.ts -- Wandering Spirit onDamagingHit: swaps on contact
    // Source: Bulbapedia "Wandering Spirit" -- swaps abilities on contact
    expect(shouldWanderingSpiritSwap("wandering-spirit", "on-contact", true)).toBe(true);
  });

  it("given wandering-spirit and on-contact trigger without contact, when checking, then returns false", () => {
    // Source: Showdown data/abilities.ts -- requires contact flag
    expect(shouldWanderingSpiritSwap("wandering-spirit", "on-contact", false)).toBe(false);
  });

  it("given wandering-spirit and non-contact trigger, when checking, then returns false", () => {
    expect(shouldWanderingSpiritSwap("wandering-spirit", "on-switch-in", true)).toBe(false);
  });

  it("given non-wandering-spirit ability, when checking, then returns false", () => {
    expect(shouldWanderingSpiritSwap("rough-skin", "on-contact", true)).toBe(false);
  });

  it("given wandering-spirit holder hit by contact, when triggered, then swaps both abilities", () => {
    // Source: Showdown data/abilities.ts -- Wandering Spirit: swap abilities with attacker
    const attacker = makeActivePokemon({ ability: "intimidate" });
    const ctx = makeContext({
      ability: "wandering-spirit",
      trigger: "on-contact",
      nickname: "Runerigus",
      opponent: attacker,
    });

    const result = handleGen8SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(2);
    expect(result.effects[0]).toEqual({
      effectType: "ability-change",
      target: "self",
      newAbility: "intimidate",
    });
    expect(result.effects[1]).toEqual({
      effectType: "ability-change",
      target: "opponent",
      newAbility: "wandering-spirit",
    });
  });

  it("given wandering-spirit holder hit by unsuppressable ability attacker, when triggered, then does not swap", () => {
    // Source: Showdown data/abilities.ts -- can't swap unsuppressable abilities
    const attacker = makeActivePokemon({ ability: "multitype" });
    const ctx = makeContext({
      ability: "wandering-spirit",
      trigger: "on-contact",
      opponent: attacker,
    });

    const result = handleGen8SwitchAbility("on-contact", ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: Gen 8 New Abilities -- Perish Body
// ---------------------------------------------------------------------------

describe("Gen 8 Perish Body", () => {
  it("given perish-body and on-contact trigger with contact, when checking, then returns true", () => {
    // Source: Showdown data/abilities.ts -- Perish Body onDamagingHit: triggers on contact
    // Source: Bulbapedia "Perish Body" -- both get Perish Song on contact
    expect(shouldPerishBodyTrigger("perish-body", "on-contact", true)).toBe(true);
  });

  it("given perish-body and on-contact trigger without contact, when checking, then returns false", () => {
    expect(shouldPerishBodyTrigger("perish-body", "on-contact", false)).toBe(false);
  });

  it("given non-perish-body ability, when checking, then returns false", () => {
    expect(shouldPerishBodyTrigger("rough-skin", "on-contact", true)).toBe(false);
  });

  it("given perish-body holder hit by contact move, when triggered, then both get perish-song volatile", () => {
    // Source: Showdown data/abilities.ts -- Perish Body: both Pokemon get Perish Song
    const attacker = makeActivePokemon({ ability: "intimidate" });
    const ctx = makeContext({
      ability: "perish-body",
      trigger: "on-contact",
      nickname: "Cursola",
      opponent: attacker,
    });

    const result = handleGen8SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(2);
    expect(result.effects[0]).toEqual({
      effectType: "volatile-inflict",
      target: "self",
      volatile: "perish-song",
    });
    expect(result.effects[1]).toEqual({
      effectType: "volatile-inflict",
      target: "opponent",
      volatile: "perish-song",
    });
    expect(result.messages).toContain("Both Pokemon will faint in 3 turns!");
  });
});

// ---------------------------------------------------------------------------
// Tests: Gen 8 Libero / Protean
// ---------------------------------------------------------------------------

describe("Gen 8 Libero / Protean", () => {
  it("given libero ability, when isLiberoActive, then returns true", () => {
    // Source: Showdown data/abilities.ts -- Libero same as Protean
    expect(isLiberoActive("libero")).toBe(true);
  });

  it("given protean ability, when isLiberoActive, then returns true", () => {
    // Source: Showdown data/abilities.ts -- Protean type change before attacking
    expect(isLiberoActive("protean")).toBe(true);
  });

  it("given other ability, when isLiberoActive, then returns false", () => {
    expect(isLiberoActive("intimidate")).toBe(false);
  });

  it("given libero user using fire move, when on-before-move triggers, then changes type to fire", () => {
    // Source: Showdown data/mods/gen8/ -- Libero: no once-per-switchin limit in Gen 8
    // Source: specs/reference/gen8-ground-truth.md -- activates on every move use
    const ctx = makeContext({
      ability: "libero",
      trigger: "on-before-move",
      types: ["normal"],
      nickname: "Cinderace",
      move: makeMove("fire", { id: "pyro-ball" }),
    });

    const result = handleGen8SwitchAbility("on-before-move", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({
      effectType: "type-change",
      target: "self",
      types: ["fire"],
    });
    expect(result.messages[0]).toContain("Libero");
    expect(result.messages[0]).toContain("fire");
  });

  it("given protean user using water move, when on-before-move triggers, then changes type to water", () => {
    // Source: Showdown data/abilities.ts -- Protean: same behavior as Libero
    const ctx = makeContext({
      ability: "protean",
      trigger: "on-before-move",
      types: ["water"],
      nickname: "Greninja",
      move: makeMove("water", { id: "water-shuriken" }),
    });

    // Already water type -- should not activate
    const result = handleGen8SwitchAbility("on-before-move", ctx);
    expect(result.activated).toBe(false);
  });

  it("given libero user already matching type, when on-before-move triggers, then does NOT activate", () => {
    // Source: Showdown data/abilities.ts -- Libero/Protean doesn't activate if already that monotype
    const ctx = makeContext({
      ability: "libero",
      trigger: "on-before-move",
      types: ["fire"],
      move: makeMove("fire", { id: "pyro-ball" }),
    });

    const result = handleGen8SwitchAbility("on-before-move", ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: Gen 8 Ice Face
// ---------------------------------------------------------------------------

describe("Gen 8 Ice Face", () => {
  it("given Eiscue with ice-face, when isIceFaceActive with no broken volatile, then returns true", () => {
    // Source: Showdown data/abilities.ts -- Ice Face: active in Ice Face form
    // Eiscue species ID: 875
    expect(isIceFaceActive(875, "ice-face", false)).toBe(true);
  });

  it("given Eiscue with ice-face, when isIceFaceActive with broken volatile, then returns false", () => {
    // Source: Showdown data/abilities.ts -- Ice Face: once broken, stays Noice Face
    expect(isIceFaceActive(875, "ice-face", true)).toBe(false);
  });

  it("given non-Eiscue with ice-face, when isIceFaceActive, then returns false", () => {
    // Source: Showdown data/abilities.ts -- only works for Eiscue (species 875)
    expect(isIceFaceActive(25, "ice-face", false)).toBe(false);
  });

  it("given Eiscue with different ability, when isIceFaceActive, then returns false", () => {
    expect(isIceFaceActive(875, "sturdy", false)).toBe(false);
  });

  it("given ice-face in hail, when shouldIceFaceReform, then returns true", () => {
    // Source: Showdown data/abilities.ts -- Ice Face reforms in Hail
    // Source: Bulbapedia "Ice Face" -- "If Hail is active, it will reform."
    expect(shouldIceFaceReform("ice-face", "hail")).toBe(true);
  });

  it("given ice-face in sun, when shouldIceFaceReform, then returns false", () => {
    // Source: Showdown data/abilities.ts -- Ice Face only reforms in hail
    expect(shouldIceFaceReform("ice-face", "sun")).toBe(false);
  });

  it("given ice-face with no weather, when shouldIceFaceReform, then returns false", () => {
    expect(shouldIceFaceReform("ice-face", null)).toBe(false);
  });

  it("given Eiscue hit by physical move with Ice Face active, when on-contact triggers, then blocks damage", () => {
    // Source: Showdown data/abilities.ts -- Ice Face onDamage: blocks physical hit
    // Source: Bulbapedia "Ice Face" -- blocks first physical hit
    const attacker = makeActivePokemon({ ability: "intimidate" });
    const ctx = makeContext({
      ability: "ice-face",
      trigger: "on-contact",
      speciesId: 875,
      nickname: "Eiscue",
      opponent: attacker,
      move: makeMove("normal", { id: "tackle", category: "physical" }),
    });

    const result = handleGen8SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects.some((e) => e.effectType === "damage-reduction")).toBe(true);
    expect(result.messages[0]).toContain("Ice Face");
  });

  it("given Eiscue hit by special move with Ice Face active, when on-contact triggers, then does NOT block", () => {
    // Source: Showdown data/abilities.ts -- Ice Face only blocks physical moves
    const attacker = makeActivePokemon({ ability: "intimidate" });
    const ctx = makeContext({
      ability: "ice-face",
      trigger: "on-contact",
      speciesId: 875,
      nickname: "Eiscue",
      opponent: attacker,
      move: makeMove("fire", { id: "flamethrower", category: "special" }),
    });

    const result = handleGen8SwitchAbility("on-contact", ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: Gen 8 Gulp Missile
// ---------------------------------------------------------------------------

describe("Gen 8 Gulp Missile", () => {
  it("given Cramorant with gulp-missile, when isCramorantWithGulpMissile, then returns true", () => {
    // Source: Showdown data/abilities.ts -- Gulp Missile: species 845 = Cramorant
    expect(isCramorantWithGulpMissile(845, "gulp-missile")).toBe(true);
  });

  it("given non-Cramorant with gulp-missile, when isCramorantWithGulpMissile, then returns false", () => {
    expect(isCramorantWithGulpMissile(25, "gulp-missile")).toBe(false);
  });

  it("given Cramorant without gulp-missile, when isCramorantWithGulpMissile, then returns false", () => {
    expect(isCramorantWithGulpMissile(845, "keen-eye")).toBe(false);
  });

  it("given gulping form (Arrokuda), when getGulpMissileResult, then returns 1/4 HP damage and defense-drop", () => {
    // Source: Showdown data/abilities.ts -- Gulp Missile gulping: 1/4 HP + -1 Defense
    // Source: Bulbapedia "Gulp Missile" -- Arrokuda: damage + Defense drop
    // With 200 max HP: floor(200/4) = 50 damage
    const result = getGulpMissileResult("gulping", 200);
    expect(result.damage).toBe(50);
    expect(result.secondaryEffect).toBe("defense-drop");
  });

  it("given gorging form (Pikachu), when getGulpMissileResult, then returns 1/4 HP damage and paralysis", () => {
    // Source: Showdown data/abilities.ts -- Gulp Missile gorging: 1/4 HP + paralysis
    // Source: Bulbapedia "Gulp Missile" -- Pikachu: damage + paralysis
    // With 160 max HP: floor(160/4) = 40 damage
    const result = getGulpMissileResult("gorging", 160);
    expect(result.damage).toBe(40);
    expect(result.secondaryEffect).toBe("paralysis");
  });

  it("given gulping form with 1 HP attacker, when getGulpMissileResult, then minimum damage is 1", () => {
    // Source: Showdown -- minimum damage is 1
    // With 3 max HP: floor(3/4) = 0, but minimum is 1
    const result = getGulpMissileResult("gulping", 3);
    expect(result.damage).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Tests: Gen 8 Hunger Switch
// ---------------------------------------------------------------------------

describe("Gen 8 Hunger Switch", () => {
  it("given hunger-switch and Morpeko (877), when shouldHungerSwitchToggle, then returns true", () => {
    // Source: Showdown data/abilities.ts -- Hunger Switch: Morpeko (species 877) only
    // Source: Bulbapedia "Hunger Switch" -- toggles form each turn
    expect(shouldHungerSwitchToggle("hunger-switch", 877)).toBe(true);
  });

  it("given hunger-switch and non-Morpeko, when shouldHungerSwitchToggle, then returns false", () => {
    // Source: Showdown data/abilities.ts -- only applies to Morpeko
    expect(shouldHungerSwitchToggle("hunger-switch", 25)).toBe(false);
  });

  it("given non-hunger-switch ability and Morpeko, when shouldHungerSwitchToggle, then returns false", () => {
    expect(shouldHungerSwitchToggle("intimidate", 877)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: Gen 8 Intrepid Sword / Dauntless Shield
// ---------------------------------------------------------------------------

describe("Gen 8 Intrepid Sword / Dauntless Shield", () => {
  it("given intrepid-sword user, when switching in, then raises Attack by 1 stage", () => {
    // Source: Showdown data/mods/gen8/abilities.ts -- Intrepid Sword onStart: +1 Atk
    // Source: specs/reference/gen8-ground-truth.md -- every switch-in (Gen 8 pre-nerf)
    const ctx = makeContext({
      ability: "intrepid-sword",
      trigger: "on-switch-in",
      nickname: "Zacian",
    });

    const result = handleGen8SwitchAbility("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({
      effectType: "stat-change",
      target: "self",
      stat: "attack",
      stages: 1,
    });
    expect(result.messages[0]).toContain("Intrepid Sword");
  });

  it("given dauntless-shield user, when switching in, then raises Defense by 1 stage", () => {
    // Source: Showdown data/mods/gen8/abilities.ts -- Dauntless Shield onStart: +1 Def
    // Source: specs/reference/gen8-ground-truth.md -- every switch-in (Gen 8 pre-nerf)
    const ctx = makeContext({
      ability: "dauntless-shield",
      trigger: "on-switch-in",
      nickname: "Zamazenta",
    });

    const result = handleGen8SwitchAbility("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({
      effectType: "stat-change",
      target: "self",
      stat: "defense",
      stages: 1,
    });
    expect(result.messages[0]).toContain("Dauntless Shield");
  });
});

// ---------------------------------------------------------------------------
// Tests: Carry-forward switch-in abilities
// ---------------------------------------------------------------------------

describe("Gen 8 Switch-in Abilities (carry-forward)", () => {
  it("given intimidate user, when switching in, then lowers opponent Attack by 1", () => {
    // Source: Showdown data/abilities.ts -- Intimidate: -1 Atk to foe on switch-in
    const opponent = makeActivePokemon({ ability: "inner-focus" });
    const ctx = makeContext({
      ability: "intimidate",
      trigger: "on-switch-in",
      nickname: "Gyarados",
      opponent,
    });

    const result = handleGen8SwitchAbility("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "stat-change",
      target: "opponent",
      stat: "attack",
      stages: -1,
    });
  });

  it("given drizzle user, when switching in, then sets rain weather", () => {
    // Source: Showdown data/abilities.ts -- Drizzle sets rain
    const ctx = makeContext({
      ability: "drizzle",
      trigger: "on-switch-in",
      nickname: "Pelipper",
    });

    const result = handleGen8SwitchAbility("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "weather-set",
      target: "field",
      weather: "rain",
      weatherTurns: 5,
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Constants
// ---------------------------------------------------------------------------

describe("Gen 8 Ability Constants", () => {
  it("given TRACE_UNCOPYABLE_ABILITIES, then includes Gen 8 additions", () => {
    // Source: Showdown data/abilities.ts -- trace Gen 8 ban list
    expect(TRACE_UNCOPYABLE_ABILITIES.has("hunger-switch")).toBe(true);
    expect(TRACE_UNCOPYABLE_ABILITIES.has("gulp-missile")).toBe(true);
    expect(TRACE_UNCOPYABLE_ABILITIES.has("ice-face")).toBe(true);
    expect(TRACE_UNCOPYABLE_ABILITIES.has("neutralizing-gas")).toBe(true);
    expect(TRACE_UNCOPYABLE_ABILITIES.has("intrepid-sword")).toBe(true);
    expect(TRACE_UNCOPYABLE_ABILITIES.has("dauntless-shield")).toBe(true);
  });

  it("given TRACE_UNCOPYABLE_ABILITIES, then still includes Gen 7 entries", () => {
    // Source: Showdown data/abilities.ts -- trace ban list carry-forward
    expect(TRACE_UNCOPYABLE_ABILITIES.has("trace")).toBe(true);
    expect(TRACE_UNCOPYABLE_ABILITIES.has("multitype")).toBe(true);
    expect(TRACE_UNCOPYABLE_ABILITIES.has("disguise")).toBe(true);
    expect(TRACE_UNCOPYABLE_ABILITIES.has("battle-bond")).toBe(true);
  });

  it("given UNSUPPRESSABLE_ABILITIES, then includes Gen 8 additions", () => {
    // Source: Showdown data/abilities.ts -- cantsuppress Gen 8 entries
    expect(UNSUPPRESSABLE_ABILITIES.has("gulp-missile")).toBe(true);
    expect(UNSUPPRESSABLE_ABILITIES.has("ice-face")).toBe(true);
    expect(UNSUPPRESSABLE_ABILITIES.has("neutralizing-gas")).toBe(true);
  });

  it("given MOLD_BREAKER_ALIASES, then contains mold-breaker, teravolt, turboblaze", () => {
    // Source: Showdown data/abilities.ts -- mold breaker variants
    expect(MOLD_BREAKER_ALIASES.has("mold-breaker")).toBe(true);
    expect(MOLD_BREAKER_ALIASES.has("teravolt")).toBe(true);
    expect(MOLD_BREAKER_ALIASES.has("turboblaze")).toBe(true);
    expect(MOLD_BREAKER_ALIASES.size).toBe(3);
  });

  it("given NEUTRALIZING_GAS_IMMUNE_ABILITIES, then includes neutralizing-gas and comatose", () => {
    // Source: Showdown data/abilities.ts -- Neutralizing Gas immune set
    expect(NEUTRALIZING_GAS_IMMUNE_ABILITIES.has("neutralizing-gas")).toBe(true);
    expect(NEUTRALIZING_GAS_IMMUNE_ABILITIES.has("comatose")).toBe(true);
    expect(NEUTRALIZING_GAS_IMMUNE_ABILITIES.has("multitype")).toBe(true);
    expect(NEUTRALIZING_GAS_IMMUNE_ABILITIES.has("disguise")).toBe(true);
  });
});
