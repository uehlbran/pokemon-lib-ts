import type { AbilityContext, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  getDisguiseBreakDamage,
  getRKSType,
  handleGen7NewAbility,
  isComatoseAsleep,
  isComatoseStatusImmune,
  isDisguiseActive,
  isSchoolForm,
  isShieldsDownMeteorForm,
  MEMORY_TYPE_MAP,
  SCHOOLING_HP_THRESHOLD,
  SCHOOLING_MIN_LEVEL,
  shouldBattleBondTransform,
  shouldPowerConstructTransform,
} from "../src/Gen7AbilitiesNew";

/**
 * Gen 7 new signature ability tests.
 *
 * Tests abilities introduced in Gen 7:
 *   - Disguise (Mimikyu): blocks first hit, Gen 7 has no chip damage on break
 *   - Schooling (Wishiwashi): form change at 25% HP threshold
 *   - Battle Bond (Ash-Greninja): transforms on KO
 *   - Shields Down (Minior): form change at 50% HP, blocks status in Meteor Form
 *   - Power Construct (Zygarde): transforms to Complete at < 50% HP
 *   - RKS System (Silvally): type matches Memory item
 *   - Comatose (Komala): always asleep, immune to all statuses
 *
 * Source: Showdown data/abilities.ts
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
  level?: number;
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  return {
    uid: `test-${Math.random()}`,
    speciesId: overrides.speciesId ?? 1,
    nickname: overrides.nickname ?? null,
    level: overrides.level ?? 50,
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
    gender: "male",
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
  level?: number;
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
      level: overrides.level,
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
    generation: 7,
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
    generation: 7,
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
  level?: number;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
}): AbilityContext {
  const state = makeBattleState();
  const pokemon = makeActivePokemon({
    ability: opts.ability,
    types: opts.types,
    nickname: opts.nickname,
    heldItem: opts.heldItem,
    speciesId: opts.speciesId,
    status: opts.status,
    currentHp: opts.currentHp,
    maxHp: opts.maxHp,
    level: opts.level,
    volatiles: opts.volatiles,
  });

  return {
    pokemon,
    opponent: opts.opponent,
    state,
    rng: state.rng as any,
    trigger: opts.trigger as any,
    move: opts.move,
  };
}

// ---------------------------------------------------------------------------
// Tests: Disguise (Mimikyu)
// ---------------------------------------------------------------------------

describe("Disguise (Mimikyu)", () => {
  it("given Disguise not broken, when hit by a physical move, then blocks damage and breaks Disguise", () => {
    // Source: Showdown data/abilities.ts -- disguise: onDamage, blocks first hit
    // Source: Bulbapedia "Disguise" -- "The dummy takes the hit for the Pokemon"
    const ctx = makeContext({
      ability: "disguise",
      trigger: "on-damage-taken",
      nickname: "Mimikyu",
      move: makeMove("normal"),
    });

    const result = handleGen7NewAbility(ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toContainEqual({
      effectType: "volatile-inflict",
      target: "self",
      volatile: "disguise-broken",
    });
    expect(result.effects).toContainEqual({
      effectType: "damage-reduction",
      target: "self",
    });
    expect(result.messages[0]).toContain("Disguise was busted");
  });

  it("given Disguise already broken, when hit by a move, then does not block damage", () => {
    // Source: Showdown data/abilities.ts -- disguise: only blocks the first hit
    const ctx = makeContext({
      ability: "disguise",
      trigger: "on-damage-taken",
      nickname: "Mimikyu",
      move: makeMove("normal"),
      volatiles: new Map([["disguise-broken", { turnsLeft: -1 }]]),
    });

    const result = handleGen7NewAbility(ctx);

    expect(result.activated).toBe(false);
  });

  it("given Disguise not broken, when hit by a status move, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- disguise: only activates on damaging moves
    const ctx = makeContext({
      ability: "disguise",
      trigger: "on-damage-taken",
      nickname: "Mimikyu",
      move: makeMove("normal", { category: "status" }),
    });

    const result = handleGen7NewAbility(ctx);

    expect(result.activated).toBe(false);
  });

  describe("isDisguiseActive", () => {
    it("given Disguise holder with no disguise-broken volatile, then returns true", () => {
      // Source: Showdown -- Disguise active when volatile not set
      expect(isDisguiseActive("disguise", false)).toBe(true);
    });

    it("given Disguise holder with disguise-broken volatile, then returns false", () => {
      expect(isDisguiseActive("disguise", true)).toBe(false);
    });

    it("given non-Disguise ability, then returns false", () => {
      expect(isDisguiseActive("inner-focus", false)).toBe(false);
    });
  });

  describe("getDisguiseBreakDamage", () => {
    it("given Gen 7 Disguise, when Disguise breaks, then chip damage is 0 (no HP cost)", () => {
      // Source: Showdown data/abilities.ts -- Gen 7 disguise: no chip damage
      // Source: Bulbapedia "Disguise" -- Gen 7 had no damage on Disguise break
      //   (Gen 8 introduced 1/8 max HP chip)
      expect(getDisguiseBreakDamage(200)).toBe(0);
    });

    it("given Gen 7 Disguise with different max HP, when Disguise breaks, then chip damage is still 0", () => {
      // Source: Gen 7 Disguise break always deals 0 damage regardless of HP
      expect(getDisguiseBreakDamage(300)).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Schooling (Wishiwashi)
// ---------------------------------------------------------------------------

describe("Schooling (Wishiwashi)", () => {
  describe("isSchoolForm", () => {
    it("given Schooling, level 25, and HP at 100% (200/200), when checking form, then returns true (School Form)", () => {
      // Source: Showdown data/abilities.ts -- schooling: >= 25% HP and level >= 20
      // Source: Bulbapedia "Schooling" -- "Level 20 or above and more than 25% of max HP"
      // 200/200 = 100% >= 25% threshold, level 25 >= 20
      expect(isSchoolForm("schooling", 200, 200, 25)).toBe(true);
    });

    it("given Schooling, level 25, and HP at exactly 25% (50/200), when checking form, then returns true (School Form)", () => {
      // Source: Showdown -- threshold is >= 25%
      // ceil(200 * 0.25) = 50; 50 >= 50 = true
      expect(isSchoolForm("schooling", 50, 200, 25)).toBe(true);
    });

    it("given Schooling, level 25, and HP below 25% (49/200), when checking form, then returns false (Solo Form)", () => {
      // Source: Showdown -- below threshold reverts to Solo Form
      // ceil(200 * 0.25) = 50; 49 < 50 = false
      expect(isSchoolForm("schooling", 49, 200, 25)).toBe(false);
    });

    it("given Schooling, level 15 (below 20), and full HP, when checking form, then returns false (too low level)", () => {
      // Source: Bulbapedia "Schooling" -- "Level 20 or above"
      expect(isSchoolForm("schooling", 200, 200, 15)).toBe(false);
    });

    it("given non-Schooling ability, when checking form, then returns false", () => {
      expect(isSchoolForm("inner-focus", 200, 200, 50)).toBe(false);
    });
  });

  it("given Schooling Wishiwashi at full HP on switch-in, when ability triggers, then reports School Form", () => {
    // Source: Showdown data/abilities.ts -- schooling onStart
    const ctx = makeContext({
      ability: "schooling",
      trigger: "on-switch-in",
      nickname: "Wishiwashi",
      currentHp: 200,
      maxHp: 200,
      level: 25,
    });

    const result = handleGen7NewAbility(ctx);

    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("formed a school");
  });

  it("given Schooling Wishiwashi below 25% HP at turn end, when ability triggers, then reports Solo Form", () => {
    // Source: Showdown data/abilities.ts -- schooling onResidual
    const ctx = makeContext({
      ability: "schooling",
      trigger: "on-turn-end",
      nickname: "Wishiwashi",
      currentHp: 40,
      maxHp: 200,
      level: 25,
    });

    const result = handleGen7NewAbility(ctx);

    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("stopped schooling");
  });

  it("given SCHOOLING_HP_THRESHOLD constant, then it equals 0.25", () => {
    // Source: Bulbapedia "Schooling" -- 25% HP threshold
    expect(SCHOOLING_HP_THRESHOLD).toBe(0.25);
  });

  it("given SCHOOLING_MIN_LEVEL constant, then it equals 20", () => {
    // Source: Bulbapedia "Schooling" -- minimum level 20
    expect(SCHOOLING_MIN_LEVEL).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// Tests: Battle Bond (Ash-Greninja)
// ---------------------------------------------------------------------------

describe("Battle Bond (Ash-Greninja)", () => {
  it("given Battle Bond Greninja, when opponent faints, then transforms to Ash-Greninja", () => {
    // Source: Showdown data/abilities.ts -- battlebond: onSourceAfterFaint
    // Source: Bulbapedia "Battle Bond" -- "transforms into Ash-Greninja after causing a faint"
    const opponent = makeActivePokemon({ ability: "", currentHp: 0 });
    const ctx = makeContext({
      ability: "battle-bond",
      trigger: "on-after-move-used",
      nickname: "Greninja",
      opponent,
    });

    const result = handleGen7NewAbility(ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toContainEqual({
      effectType: "volatile-inflict",
      target: "self",
      volatile: "battle-bond-transformed",
    });
    expect(result.messages[0]).toContain("Ash-Greninja");
  });

  it("given Battle Bond Greninja, when opponent has not fainted, then does not transform", () => {
    // Source: Showdown -- only triggers on KO
    const opponent = makeActivePokemon({ ability: "", currentHp: 100 });
    const ctx = makeContext({
      ability: "battle-bond",
      trigger: "on-after-move-used",
      nickname: "Greninja",
      opponent,
    });

    const result = handleGen7NewAbility(ctx);

    expect(result.activated).toBe(false);
  });

  it("given Battle Bond Greninja already transformed, when causing another faint, then does not trigger again", () => {
    // Source: Showdown data/abilities.ts -- battlebond: checks if already transformed
    const opponent = makeActivePokemon({ ability: "", currentHp: 0 });
    const ctx = makeContext({
      ability: "battle-bond",
      trigger: "on-after-move-used",
      nickname: "Greninja",
      opponent,
      volatiles: new Map([["battle-bond-transformed", { turnsLeft: -1 }]]),
    });

    const result = handleGen7NewAbility(ctx);

    expect(result.activated).toBe(false);
  });

  describe("shouldBattleBondTransform", () => {
    it("given Battle Bond, opponent fainted, and not yet transformed, then returns true", () => {
      // Source: Showdown data/abilities.ts -- battlebond
      expect(shouldBattleBondTransform("battle-bond", true, false)).toBe(true);
    });

    it("given Battle Bond, opponent fainted, but already transformed, then returns false", () => {
      expect(shouldBattleBondTransform("battle-bond", true, true)).toBe(false);
    });

    it("given Battle Bond, opponent has NOT fainted, then returns false", () => {
      expect(shouldBattleBondTransform("battle-bond", false, false)).toBe(false);
    });

    it("given non-Battle Bond ability, then returns false", () => {
      expect(shouldBattleBondTransform("torrent", true, false)).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Shields Down (Minior)
// ---------------------------------------------------------------------------

describe("Shields Down (Minior)", () => {
  describe("isShieldsDownMeteorForm", () => {
    it("given Shields Down at full HP (200/200), when checking form, then returns true (Meteor Form)", () => {
      // Source: Showdown data/abilities.ts -- shieldsdown: > 50% HP = Meteor Form
      // Source: Bulbapedia "Shields Down" -- "above 50% HP: Meteor Form"
      // 200 > floor(200/2) = 200 > 100 = true
      expect(isShieldsDownMeteorForm("shields-down", 200, 200)).toBe(true);
    });

    it("given Shields Down at exactly 50% HP (100/200), when checking form, then returns false (Core Form)", () => {
      // Source: Showdown -- at exactly 50% = Core Form (not strictly greater)
      // 100 > floor(200/2) = 100 > 100 = false
      expect(isShieldsDownMeteorForm("shields-down", 100, 200)).toBe(false);
    });

    it("given Shields Down below 50% HP (80/200), when checking form, then returns false (Core Form)", () => {
      // Source: Showdown -- below 50% = Core Form
      // 80 > floor(200/2) = 80 > 100 = false
      expect(isShieldsDownMeteorForm("shields-down", 80, 200)).toBe(false);
    });

    it("given non-Shields Down ability, when checking, then returns false", () => {
      expect(isShieldsDownMeteorForm("inner-focus", 200, 200)).toBe(false);
    });
  });

  it("given Shields Down in Meteor Form, when status is inflicted, then blocks the status", () => {
    // Source: Showdown data/abilities.ts -- shieldsdown: onSetStatus returns false in Meteor Form
    // Source: Bulbapedia "Shields Down" -- "cannot be inflicted with status in Meteor Form"
    const ctx = makeContext({
      ability: "shields-down",
      trigger: "on-status-inflicted",
      nickname: "Minior",
      currentHp: 200,
      maxHp: 200,
    });

    const result = handleGen7NewAbility(ctx);

    expect(result.activated).toBe(true);
    expect(result.movePrevented).toBe(true);
    expect(result.messages[0]).toContain("Shields Down prevents status");
  });

  it("given Shields Down in Core Form (below 50% HP), when status is inflicted, then does not block", () => {
    // Source: Showdown -- Core Form can be statused normally
    const ctx = makeContext({
      ability: "shields-down",
      trigger: "on-status-inflicted",
      nickname: "Minior",
      currentHp: 80,
      maxHp: 200,
    });

    const result = handleGen7NewAbility(ctx);

    expect(result.activated).toBe(false);
  });

  it("given Shields Down on switch-in below 50% HP, when ability triggers, then reports shield drop", () => {
    // Source: Showdown data/abilities.ts -- shieldsdown: onStart
    const ctx = makeContext({
      ability: "shields-down",
      trigger: "on-switch-in",
      nickname: "Minior",
      currentHp: 80,
      maxHp: 200,
    });

    const result = handleGen7NewAbility(ctx);

    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("shields went down");
  });
});

// ---------------------------------------------------------------------------
// Tests: Power Construct (Zygarde)
// ---------------------------------------------------------------------------

describe("Power Construct (Zygarde)", () => {
  describe("shouldPowerConstructTransform", () => {
    it("given Power Construct at 40% HP (80/200), when checking, then returns true (below 50%)", () => {
      // Source: Showdown data/abilities.ts -- powerconstruct: < 50% HP triggers
      // Source: Bulbapedia "Power Construct" -- "when HP falls below half"
      // ceil(200/2) = 100; 80 < 100 = true
      expect(shouldPowerConstructTransform("power-construct", 80, 200, false)).toBe(true);
    });

    it("given Power Construct at exactly 50% HP (100/200), when checking, then returns false (at 50%, not below)", () => {
      // Source: Showdown -- strictly below 50%
      // ceil(200/2) = 100; 100 >= 100 = false
      expect(shouldPowerConstructTransform("power-construct", 100, 200, false)).toBe(false);
    });

    it("given Power Construct already transformed, when checking, then returns false", () => {
      // Source: Showdown -- only triggers once per battle
      expect(shouldPowerConstructTransform("power-construct", 80, 200, true)).toBe(false);
    });

    it("given non-Power Construct ability, when checking, then returns false", () => {
      expect(shouldPowerConstructTransform("aura-break", 80, 200, false)).toBe(false);
    });
  });

  it("given Power Construct Zygarde at 40% HP on damage taken, when ability triggers, then transforms to Complete Form", () => {
    // Source: Showdown data/abilities.ts -- powerconstruct: onResidual/onDamage
    const ctx = makeContext({
      ability: "power-construct",
      trigger: "on-damage-taken",
      nickname: "Zygarde",
      currentHp: 80,
      maxHp: 200,
    });

    const result = handleGen7NewAbility(ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toContainEqual({
      effectType: "volatile-inflict",
      target: "self",
      volatile: "power-construct-transformed",
    });
    expect(result.messages[0]).toContain("Complete Forme");
  });

  it("given Power Construct Zygarde already transformed, when taking more damage, then does not transform again", () => {
    // Source: Showdown -- once per battle
    const ctx = makeContext({
      ability: "power-construct",
      trigger: "on-damage-taken",
      nickname: "Zygarde",
      currentHp: 30,
      maxHp: 200,
      volatiles: new Map([["power-construct-transformed", { turnsLeft: -1 }]]),
    });

    const result = handleGen7NewAbility(ctx);

    expect(result.activated).toBe(false);
  });

  it("given Power Construct Zygarde at 60% HP, when checking, then does not transform (above 50%)", () => {
    // Source: Showdown -- must be below 50% to trigger
    const ctx = makeContext({
      ability: "power-construct",
      trigger: "on-damage-taken",
      nickname: "Zygarde",
      currentHp: 120,
      maxHp: 200,
    });

    const result = handleGen7NewAbility(ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: Comatose (Komala)
// ---------------------------------------------------------------------------

describe("Comatose (Komala)", () => {
  it("given Comatose holder, when any status is inflicted, then blocks the status", () => {
    // Source: Showdown data/abilities.ts -- comatose: onSetStatus returns false
    // Source: Bulbapedia "Comatose" -- "cannot be afflicted by a status condition"
    const ctx = makeContext({
      ability: "comatose",
      trigger: "on-status-inflicted",
      nickname: "Komala",
    });

    const result = handleGen7NewAbility(ctx);

    expect(result.activated).toBe(true);
    expect(result.movePrevented).toBe(true);
    expect(result.messages[0]).toContain("Comatose prevents status");
  });

  it("given Comatose holder, when switching in, then announces drowsing", () => {
    // Source: Showdown data/abilities.ts -- comatose: onStart
    const ctx = makeContext({
      ability: "comatose",
      trigger: "on-switch-in",
      nickname: "Komala",
    });

    const result = handleGen7NewAbility(ctx);

    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("drowsing");
  });

  describe("isComatoseStatusImmune", () => {
    it("given Comatose, when checking status immunity, then returns true", () => {
      // Source: Showdown -- Comatose blocks all statuses
      expect(isComatoseStatusImmune("comatose")).toBe(true);
    });

    it("given non-Comatose ability, when checking, then returns false", () => {
      expect(isComatoseStatusImmune("inner-focus")).toBe(false);
    });
  });

  describe("isComatoseAsleep", () => {
    it("given Comatose, when checking if asleep for Sleep Talk/Snore, then returns true", () => {
      // Source: Showdown data/abilities.ts -- comatose: treated as asleep for move purposes
      // Source: Bulbapedia -- "Sleep Talk and Snore can be used as if asleep"
      expect(isComatoseAsleep("comatose")).toBe(true);
    });

    it("given non-Comatose ability, when checking, then returns false", () => {
      expect(isComatoseAsleep("inner-focus")).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: RKS System (Silvally)
// ---------------------------------------------------------------------------

describe("RKS System (Silvally)", () => {
  describe("getRKSType", () => {
    it("given Fire Memory held item, when checking RKS type, then returns 'fire'", () => {
      // Source: Showdown data/items.ts -- Fire Memory -> Fire type
      // Source: Bulbapedia "RKS System" -- type determined by Memory item
      expect(getRKSType("fire-memory")).toBe("fire");
    });

    it("given Water Memory held item, when checking RKS type, then returns 'water'", () => {
      // Source: Showdown data/items.ts -- Water Memory -> Water type
      expect(getRKSType("water-memory")).toBe("water");
    });

    it("given Fairy Memory held item, when checking RKS type, then returns 'fairy'", () => {
      // Source: Showdown data/items.ts -- Fairy Memory -> Fairy type
      expect(getRKSType("fairy-memory")).toBe("fairy");
    });

    it("given no held item, when checking RKS type, then returns null (defaults to Normal)", () => {
      // Source: Showdown -- no Memory = Normal type (handled by base type)
      expect(getRKSType(null)).toBeNull();
    });

    it("given non-Memory held item, when checking RKS type, then returns null", () => {
      expect(getRKSType("leftovers")).toBeNull();
    });
  });

  it("given RKS System and Fire Memory, when switching in, then changes type to Fire", () => {
    // Source: Showdown data/abilities.ts -- rkssystem: onStart sets type
    const ctx = makeContext({
      ability: "rks-system",
      trigger: "on-switch-in",
      nickname: "Silvally",
      heldItem: "fire-memory",
    });

    const result = handleGen7NewAbility(ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toContainEqual({
      effectType: "type-change",
      target: "self",
      types: ["fire"],
    });
  });

  it("given RKS System and no Memory, when switching in, then does not activate", () => {
    // Source: Showdown -- no Memory = stays Normal (default)
    const ctx = makeContext({
      ability: "rks-system",
      trigger: "on-switch-in",
      nickname: "Silvally",
    });

    const result = handleGen7NewAbility(ctx);

    expect(result.activated).toBe(false);
  });

  describe("MEMORY_TYPE_MAP", () => {
    it("given the Memory type map, then it has exactly 17 entries (one per non-Normal type)", () => {
      // Source: Showdown data/items.ts -- 17 Memory items (no Normal Memory exists)
      expect(Object.keys(MEMORY_TYPE_MAP)).toHaveLength(17);
    });

    it("given the Memory type map, then every type except Normal is represented", () => {
      // Source: Bulbapedia -- Silvally can be any type except Normal via Memories
      const types = new Set(Object.values(MEMORY_TYPE_MAP));
      expect(types.has("fire")).toBe(true);
      expect(types.has("water")).toBe(true);
      expect(types.has("grass")).toBe(true);
      expect(types.has("electric")).toBe(true);
      expect(types.has("ice")).toBe(true);
      expect(types.has("fighting")).toBe(true);
      expect(types.has("poison")).toBe(true);
      expect(types.has("ground")).toBe(true);
      expect(types.has("flying")).toBe(true);
      expect(types.has("psychic")).toBe(true);
      expect(types.has("bug")).toBe(true);
      expect(types.has("rock")).toBe(true);
      expect(types.has("ghost")).toBe(true);
      expect(types.has("dragon")).toBe(true);
      expect(types.has("dark")).toBe(true);
      expect(types.has("steel")).toBe(true);
      expect(types.has("fairy")).toBe(true);
      // Normal should NOT be in the map (Silvally is Normal by default)
      expect(types.has("normal")).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Receiver / Power of Alchemy (stubs)
// ---------------------------------------------------------------------------

describe("Receiver / Power of Alchemy", () => {
  it("given Receiver in singles, when any trigger fires, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- receiver: onAllyFaint (doubles-only)
    const ctx = makeContext({
      ability: "receiver",
      trigger: "on-switch-in",
    });

    const result = handleGen7NewAbility(ctx);

    expect(result.activated).toBe(false);
  });

  it("given Power of Alchemy in singles, when any trigger fires, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- powerofalchemy: onAllyFaint (doubles-only)
    const ctx = makeContext({
      ability: "power-of-alchemy",
      trigger: "on-switch-in",
    });

    const result = handleGen7NewAbility(ctx);

    expect(result.activated).toBe(false);
  });
});
