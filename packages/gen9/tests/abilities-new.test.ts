import type { AbilityContext, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType, SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  canToxicChainApply,
  EMBODY_ASPECT_BOOSTS,
  getSupremeOverlordFloatMultiplier,
  getSupremeOverlordMultiplier,
  handleDauntlessShieldGen9,
  handleEmbodyAspect,
  handleGen9DauntlessShield,
  handleGen9DauntlessShieldTrigger,
  handleGen9IntrepidSword,
  handleGen9IntrepidSwordTrigger,
  handleGen9NewAbility,
  handleGen9Protean,
  handleGen9ProteanTrigger,
  handleGoodAsGold,
  handleIntrepidSwordGen9,
  handleMyceliumMight,
  handleProteanGen9,
  handleToxicChain,
  hasMyceliumMightPriorityReduction,
  isBlockedByGoodAsGold,
  isEmbodyAspect,
  isMyceliumMightBypassingAbility,
  SUPREME_OVERLORD_TABLE,
} from "../src/Gen9AbilitiesNew";

/**
 * Gen 9 new and nerfed ability tests.
 *
 * Source: Showdown data/abilities.ts
 * Source: specs/battle/10-gen9.md -- New Abilities section
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
    gender: "male" as const,
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
  substituteHp?: number;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  isTerastallized?: boolean;
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
    isTerastallized: overrides.isTerastallized ?? false,
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

function makeRng(overrides?: Partial<SeededRandom>): SeededRandom {
  return {
    next: () => 0,
    int: () => 1,
    chance: () => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: T[]) => arr,
    getState: () => 0,
    setState: () => {},
    ...overrides,
  };
}

function makeBattleState(): BattleState {
  return {
    phase: "turn-end",
    generation: 9,
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
    rng: makeRng(),
  } as BattleState;
}

function makeMove(overrides: Partial<MoveData>): MoveData {
  return {
    id: overrides.id ?? "tackle",
    name: overrides.name ?? "Tackle",
    type: overrides.type ?? "normal",
    category: overrides.category ?? "physical",
    power: overrides.power ?? 40,
    accuracy: overrides.accuracy ?? 100,
    pp: overrides.pp ?? 35,
    maxPp: overrides.maxPp ?? 56,
    priority: overrides.priority ?? 0,
    target: overrides.target ?? "normal",
    flags: overrides.flags ?? { contact: true },
    effects: overrides.effects ?? [],
    generation: overrides.generation ?? 9,
    ...overrides,
  } as MoveData;
}

function makeAbilityContext(overrides: {
  pokemon: ReturnType<typeof makeActivePokemon>;
  opponent?: ReturnType<typeof makeActivePokemon>;
  trigger: string;
  move?: MoveData;
  rng?: Partial<SeededRandom>;
}): AbilityContext {
  return {
    pokemon: overrides.pokemon as any,
    opponent: overrides.opponent as any,
    state: makeBattleState(),
    rng: makeRng(overrides.rng),
    trigger: overrides.trigger as any,
    move: overrides.move,
  };
}

// ---------------------------------------------------------------------------
// Toxic Chain
// ---------------------------------------------------------------------------

describe("handleToxicChain", () => {
  it("given on-after-move-used with physical move and 30% roll succeeds, when handling, then badly poisons target", () => {
    // Source: Showdown data/abilities.ts:5001-5014
    // "this.randomChance(3, 10)" -- 30% chance
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "toxic-chain" }),
      opponent: makeActivePokemon({ types: ["normal"] }),
      trigger: "on-after-move-used",
      move: makeMove({ category: "physical" }),
      rng: { chance: () => true },
    });
    const result = handleToxicChain(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(
      expect.objectContaining({
        effectType: "status-inflict",
        target: "opponent",
        status: "badly-poisoned",
      }),
    );
  });

  it("given on-after-move-used with special move and 30% roll succeeds, when handling, then badly poisons target", () => {
    // Source: Showdown data/abilities.ts:5001-5014 -- works on any damaging move
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "toxic-chain" }),
      opponent: makeActivePokemon({ types: ["normal"] }),
      trigger: "on-after-move-used",
      move: makeMove({ category: "special" }),
      rng: { chance: () => true },
    });
    const result = handleToxicChain(ctx);
    expect(result.activated).toBe(true);
  });

  it("given status move, when handling, then does not activate (status moves excluded)", () => {
    // Source: Showdown data/abilities.ts:5001-5014 -- only triggers on damage-dealing moves
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "toxic-chain" }),
      opponent: makeActivePokemon({ types: ["normal"] }),
      trigger: "on-after-move-used",
      move: makeMove({ category: "status" }),
      rng: { chance: () => true },
    });
    const result = handleToxicChain(ctx);
    expect(result.activated).toBe(false);
  });

  it("given 30% roll fails, when handling, then does not activate", () => {
    // Source: Showdown data/abilities.ts:5001-5014
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "toxic-chain" }),
      opponent: makeActivePokemon({ types: ["normal"] }),
      trigger: "on-after-move-used",
      move: makeMove({ category: "physical" }),
      rng: { chance: () => false },
    });
    const result = handleToxicChain(ctx);
    expect(result.activated).toBe(false);
  });

  it("given target already has a status, when handling, then does not activate", () => {
    // Source: Showdown data/abilities.ts:5001-5014
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "toxic-chain" }),
      opponent: makeActivePokemon({ types: ["normal"], status: "paralysis" }),
      trigger: "on-after-move-used",
      move: makeMove({ category: "physical" }),
      rng: { chance: () => true },
    });
    const result = handleToxicChain(ctx);
    expect(result.activated).toBe(false);
  });

  it("given target is Poison-type, when handling, then does not activate (type immunity)", () => {
    // Source: Showdown data/abilities.ts:5001-5014 -- type immunity check
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "toxic-chain" }),
      opponent: makeActivePokemon({ types: ["poison"] }),
      trigger: "on-after-move-used",
      move: makeMove({ category: "physical" }),
      rng: { chance: () => true },
    });
    const result = handleToxicChain(ctx);
    expect(result.activated).toBe(false);
  });

  it("given target is Steel-type, when handling, then does not activate (type immunity)", () => {
    // Source: Showdown data/abilities.ts:5001-5014
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "toxic-chain" }),
      opponent: makeActivePokemon({ types: ["steel"] }),
      trigger: "on-after-move-used",
      move: makeMove({ category: "physical" }),
      rng: { chance: () => true },
    });
    const result = handleToxicChain(ctx);
    expect(result.activated).toBe(false);
  });

  it("given no opponent, when handling, then does not activate", () => {
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "toxic-chain" }),
      trigger: "on-after-move-used",
      move: makeMove({ category: "physical" }),
      rng: { chance: () => true },
    });
    const result = handleToxicChain(ctx);
    expect(result.activated).toBe(false);
  });

  it("given wrong trigger, when handling, then does not activate", () => {
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "toxic-chain" }),
      opponent: makeActivePokemon({ types: ["normal"] }),
      trigger: "on-switch-in",
      move: makeMove({ category: "physical" }),
      rng: { chance: () => true },
    });
    const result = handleToxicChain(ctx);
    expect(result.activated).toBe(false);
  });
});

describe("canToxicChainApply", () => {
  it("given physical move, no status, non-immune types, when checking, then returns true", () => {
    // Source: Showdown data/abilities.ts:5001-5014
    const move = makeMove({ category: "physical" });
    expect(canToxicChainApply(move, null, ["normal"])).toBe(true);
  });

  it("given status move, when checking, then returns false", () => {
    const move = makeMove({ category: "status" });
    expect(canToxicChainApply(move, null, ["normal"])).toBe(false);
  });

  it("given target has burn, when checking, then returns false", () => {
    const move = makeMove({ category: "physical" });
    expect(canToxicChainApply(move, "burn", ["normal"])).toBe(false);
  });

  it("given target is Poison type, when checking, then returns false", () => {
    const move = makeMove({ category: "physical" });
    expect(canToxicChainApply(move, null, ["poison", "flying"])).toBe(false);
  });

  it("given target is Steel type, when checking, then returns false", () => {
    const move = makeMove({ category: "physical" });
    expect(canToxicChainApply(move, null, ["steel"])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Good as Gold
// ---------------------------------------------------------------------------

describe("handleGoodAsGold", () => {
  it("given on-before-move with Status-category move, when handling, then blocks the move", () => {
    // Source: Showdown data/abilities.ts:1573-1584
    // "if (move.category === 'Status' && target !== source) return null"
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "good-as-gold" }),
      trigger: "on-before-move",
      move: makeMove({ category: "status", id: "toxic" }),
    });
    const result = handleGoodAsGold(ctx);
    expect(result.activated).toBe(true);
    expect(result.movePrevented).toBe(true);
  });

  it("given on-before-move with Physical-category move, when handling, then does not block", () => {
    // Source: Showdown data/abilities.ts:1573-1584 -- only blocks Status
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "good-as-gold" }),
      trigger: "on-before-move",
      move: makeMove({ category: "physical" }),
    });
    const result = handleGoodAsGold(ctx);
    expect(result.activated).toBe(false);
  });

  it("given on-before-move with Special-category move, when handling, then does not block", () => {
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "good-as-gold" }),
      trigger: "on-before-move",
      move: makeMove({ category: "special" }),
    });
    const result = handleGoodAsGold(ctx);
    expect(result.activated).toBe(false);
  });

  it("given wrong trigger (on-switch-in), when handling, then does not activate", () => {
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "good-as-gold" }),
      trigger: "on-switch-in",
      move: makeMove({ category: "status" }),
    });
    const result = handleGoodAsGold(ctx);
    expect(result.activated).toBe(false);
  });

  it("given no move in context, when handling, then does not activate", () => {
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "good-as-gold" }),
      trigger: "on-before-move",
    });
    const result = handleGoodAsGold(ctx);
    expect(result.activated).toBe(false);
  });
});

describe("isBlockedByGoodAsGold", () => {
  it("given good-as-gold and status category, when checking, then returns true", () => {
    expect(isBlockedByGoodAsGold("good-as-gold", "status")).toBe(true);
  });

  it("given good-as-gold and physical category, when checking, then returns false", () => {
    expect(isBlockedByGoodAsGold("good-as-gold", "physical")).toBe(false);
  });

  it("given different ability and status category, when checking, then returns false", () => {
    expect(isBlockedByGoodAsGold("intimidate", "status")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Embody Aspect
// ---------------------------------------------------------------------------

describe("handleEmbodyAspect", () => {
  it("given Teal Embody Aspect on Tera'd switch-in, when handling, then boosts Speed", () => {
    // Source: Showdown data/abilities.ts:1162-1212
    // embodyaspectteal: spe +1
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({
        ability: "embody-aspect-teal",
        isTerastallized: true,
      }),
      trigger: "on-switch-in",
    });
    const result = handleEmbodyAspect(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(2); // volatile-inflict + stat-change
    expect(result.effects[0]).toEqual(
      expect.objectContaining({
        effectType: "volatile-inflict",
        volatile: "embody-aspect-used",
      }),
    );
    expect(result.effects[1]).toEqual(
      expect.objectContaining({
        effectType: "stat-change",
        stat: "speed",
        stages: 1,
      }),
    );
  });

  it("given Hearthflame Embody Aspect on Tera'd switch-in, when handling, then boosts Attack", () => {
    // Source: Showdown data/abilities.ts:1162-1212
    // embodyaspecthearthflame: atk +1
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({
        ability: "embody-aspect-hearthflame",
        isTerastallized: true,
      }),
      trigger: "on-switch-in",
    });
    const result = handleEmbodyAspect(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[1]).toEqual(
      expect.objectContaining({
        effectType: "stat-change",
        stat: "attack",
        stages: 1,
      }),
    );
  });

  it("given Wellspring Embody Aspect on Tera'd switch-in, when handling, then boosts SpDefense", () => {
    // Source: Showdown data/abilities.ts:1162-1212
    // embodyaspectwellspring: spd +1
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({
        ability: "embody-aspect-wellspring",
        isTerastallized: true,
      }),
      trigger: "on-switch-in",
    });
    const result = handleEmbodyAspect(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[1]).toEqual(
      expect.objectContaining({
        effectType: "stat-change",
        stat: "spDefense",
        stages: 1,
      }),
    );
  });

  it("given Cornerstone Embody Aspect on Tera'd switch-in, when handling, then boosts Defense", () => {
    // Source: Showdown data/abilities.ts:1162-1212
    // embodyaspectcornerstone: def +1
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({
        ability: "embody-aspect-cornerstone",
        isTerastallized: true,
      }),
      trigger: "on-switch-in",
    });
    const result = handleEmbodyAspect(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[1]).toEqual(
      expect.objectContaining({
        effectType: "stat-change",
        stat: "defense",
        stages: 1,
      }),
    );
  });

  it("given not Terastallized, when handling, then does not activate", () => {
    // Source: Showdown data/abilities.ts:1162-1212
    // "if (!pokemon.terastallized) return"
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({
        ability: "embody-aspect-teal",
        isTerastallized: false,
      }),
      trigger: "on-switch-in",
    });
    const result = handleEmbodyAspect(ctx);
    expect(result.activated).toBe(false);
  });

  it("given already used (volatile set), when handling, then does not activate again (once per battle)", () => {
    // Source: Showdown data/abilities.ts:1162-1212 -- once per battle check
    const volatiles = new Map([["embody-aspect-used", { turnsLeft: -1 }]]);
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({
        ability: "embody-aspect-teal",
        isTerastallized: true,
        volatiles: volatiles as any,
      }),
      trigger: "on-switch-in",
    });
    const result = handleEmbodyAspect(ctx);
    expect(result.activated).toBe(false);
  });

  it("given wrong trigger (on-contact), when handling, then does not activate", () => {
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({
        ability: "embody-aspect-teal",
        isTerastallized: true,
      }),
      trigger: "on-contact",
    });
    const result = handleEmbodyAspect(ctx);
    expect(result.activated).toBe(false);
  });
});

describe("isEmbodyAspect", () => {
  it("given embody-aspect-teal, when checking, then returns true", () => {
    expect(isEmbodyAspect("embody-aspect-teal")).toBe(true);
  });

  it("given embody-aspect-hearthflame, when checking, then returns true", () => {
    expect(isEmbodyAspect("embody-aspect-hearthflame")).toBe(true);
  });

  it("given embody-aspect-wellspring, when checking, then returns true", () => {
    expect(isEmbodyAspect("embody-aspect-wellspring")).toBe(true);
  });

  it("given embody-aspect-cornerstone, when checking, then returns true", () => {
    expect(isEmbodyAspect("embody-aspect-cornerstone")).toBe(true);
  });

  it("given unrelated ability, when checking, then returns false", () => {
    expect(isEmbodyAspect("intimidate")).toBe(false);
  });
});

describe("EMBODY_ASPECT_BOOSTS", () => {
  it("maps teal to speed", () => {
    // Source: Showdown data/abilities.ts:1162-1212
    expect(EMBODY_ASPECT_BOOSTS["embody-aspect-teal"]).toBe("speed");
  });
  it("maps hearthflame to attack", () => {
    expect(EMBODY_ASPECT_BOOSTS["embody-aspect-hearthflame"]).toBe("attack");
  });
  it("maps wellspring to spDefense", () => {
    expect(EMBODY_ASPECT_BOOSTS["embody-aspect-wellspring"]).toBe("spDefense");
  });
  it("maps cornerstone to defense", () => {
    expect(EMBODY_ASPECT_BOOSTS["embody-aspect-cornerstone"]).toBe("defense");
  });
});

// ---------------------------------------------------------------------------
// Mycelium Might
// ---------------------------------------------------------------------------

describe("handleMyceliumMight", () => {
  it("given on-priority-check with status move, when handling, then activates", () => {
    // Source: Showdown data/abilities.ts:2722-2738
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "mycelium-might" }),
      trigger: "on-priority-check",
      move: makeMove({ category: "status" }),
    });
    const result = handleMyceliumMight(ctx);
    expect(result.activated).toBe(true);
  });

  it("given on-priority-check with physical move, when handling, then does not activate", () => {
    // Source: Showdown data/abilities.ts:2722-2738 -- only for status moves
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "mycelium-might" }),
      trigger: "on-priority-check",
      move: makeMove({ category: "physical" }),
    });
    const result = handleMyceliumMight(ctx);
    expect(result.activated).toBe(false);
  });

  it("given wrong trigger (on-switch-in), when handling, then does not activate", () => {
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "mycelium-might" }),
      trigger: "on-switch-in",
      move: makeMove({ category: "status" }),
    });
    const result = handleMyceliumMight(ctx);
    expect(result.activated).toBe(false);
  });
});

describe("hasMyceliumMightPriorityReduction", () => {
  it("given mycelium-might and status move, when checking, then returns true", () => {
    // Source: Showdown data/abilities.ts:2722-2728
    expect(hasMyceliumMightPriorityReduction("mycelium-might", "status")).toBe(true);
  });

  it("given mycelium-might and physical move, when checking, then returns false", () => {
    expect(hasMyceliumMightPriorityReduction("mycelium-might", "physical")).toBe(false);
  });

  it("given different ability and status move, when checking, then returns false", () => {
    expect(hasMyceliumMightPriorityReduction("intimidate", "status")).toBe(false);
  });
});

describe("isMyceliumMightBypassingAbility", () => {
  it("given mycelium-might and status move, when checking, then returns true", () => {
    // Source: Showdown data/abilities.ts:2730-2738
    expect(isMyceliumMightBypassingAbility("mycelium-might", "status")).toBe(true);
  });

  it("given mycelium-might and special move, when checking, then returns false", () => {
    expect(isMyceliumMightBypassingAbility("mycelium-might", "special")).toBe(false);
  });

  it("given other ability and status move, when checking, then returns false", () => {
    expect(isMyceliumMightBypassingAbility("protean", "status")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Supreme Overlord
// ---------------------------------------------------------------------------

describe("getSupremeOverlordFloatMultiplier", () => {
  it("given 0 fainted allies, when getting multiplier, then returns 1.0x", () => {
    // Source: Showdown data/abilities.ts:4634-4658
    // "const dominated = [4096, 4506, 4915, 5325, 5734, 6144]"
    expect(getSupremeOverlordFloatMultiplier(0)).toBe(4096 / 4096);
  });

  it("given 1 fainted ally, when getting multiplier, then returns ~1.10x (4506/4096)", () => {
    // Source: Showdown data/abilities.ts:4634-4658
    expect(getSupremeOverlordFloatMultiplier(1)).toBeCloseTo(4506 / 4096, 10);
  });

  it("given 2 fainted allies, when getting multiplier, then returns ~1.20x (4915/4096)", () => {
    // Source: Showdown data/abilities.ts:4634-4658
    expect(getSupremeOverlordFloatMultiplier(2)).toBeCloseTo(4915 / 4096, 10);
  });

  it("given 3 fainted allies, when getting multiplier, then returns ~1.30x (5325/4096)", () => {
    // Source: Showdown data/abilities.ts:4634-4658
    expect(getSupremeOverlordFloatMultiplier(3)).toBeCloseTo(5325 / 4096, 10);
  });

  it("given 4 fainted allies, when getting multiplier, then returns ~1.40x (5734/4096)", () => {
    // Source: Showdown data/abilities.ts:4634-4658
    expect(getSupremeOverlordFloatMultiplier(4)).toBeCloseTo(5734 / 4096, 10);
  });

  it("given 5 fainted allies, when getting multiplier, then returns 1.50x (6144/4096)", () => {
    // Source: Showdown data/abilities.ts:4634-4658
    expect(getSupremeOverlordFloatMultiplier(5)).toBeCloseTo(6144 / 4096, 10);
  });

  it("given 6 fainted allies (exceeds max), when getting multiplier, then caps at 5 and returns 1.50x", () => {
    // Source: Showdown data/abilities.ts:4634-4658 -- capped at 5
    expect(getSupremeOverlordFloatMultiplier(6)).toBeCloseTo(6144 / 4096, 10);
  });

  it("given negative fainted allies, when getting multiplier, then clamps to 0 and returns 1.0x", () => {
    expect(getSupremeOverlordFloatMultiplier(-1)).toBe(1);
  });

  it("keeps getSupremeOverlordMultiplier as a compatibility alias", () => {
    expect(getSupremeOverlordMultiplier).toBe(getSupremeOverlordFloatMultiplier);
  });
});

describe("SUPREME_OVERLORD_TABLE", () => {
  it("has exactly 6 entries (0 through 5 fainted allies)", () => {
    // Source: Showdown data/abilities.ts:4634-4658
    expect(SUPREME_OVERLORD_TABLE).toHaveLength(6);
  });

  it("values monotonically increase", () => {
    for (let i = 1; i < SUPREME_OVERLORD_TABLE.length; i++) {
      expect(SUPREME_OVERLORD_TABLE[i]!).toBeGreaterThan(SUPREME_OVERLORD_TABLE[i - 1]!);
    }
  });
});

// ---------------------------------------------------------------------------
// Intrepid Sword (Gen 9 nerf -- once per battle)
// ---------------------------------------------------------------------------

describe("handleGen9IntrepidSwordTrigger", () => {
  it("given on-switch-in with no prior usage, when handling, then boosts Attack and sets volatile", () => {
    // Source: Showdown data/abilities.ts -- intrepidsword: once per battle in Gen 9
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "intrepid-sword" }),
      trigger: "on-switch-in",
    });
    const result = handleGen9IntrepidSwordTrigger(ctx);
    expect(result.activated).toBe(true);
    expect(ctx.pokemon.pokemon.swordBoost).toBe(true);
    expect(result.effects).toHaveLength(2);
    expect(result.effects[0]).toEqual(
      expect.objectContaining({
        effectType: "volatile-inflict",
        volatile: "intrepid-sword-used",
      }),
    );
    expect(result.effects[1]).toEqual(
      expect.objectContaining({
        effectType: "stat-change",
        stat: "attack",
        stages: 1,
      }),
    );
  });

  it("given already used this battle, when handling, then does not activate", () => {
    // Source: specs/battle/10-gen9.md -- "Intrepid Sword: once per battle (nerfed from Gen 8)"
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({
        ability: "intrepid-sword",
      }),
      trigger: "on-switch-in",
    });
    ctx.pokemon.pokemon.swordBoost = true;
    const result = handleGen9IntrepidSwordTrigger(ctx);
    expect(result.activated).toBe(false);
  });

  it("given wrong trigger, when handling, then does not activate", () => {
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "intrepid-sword" }),
      trigger: "on-contact",
    });
    const result = handleGen9IntrepidSwordTrigger(ctx);
    expect(result.activated).toBe(false);
  });

  it("keeps the legacy aliases wired to the trigger handler", () => {
    expect(handleGen9IntrepidSword).toBe(handleGen9IntrepidSwordTrigger);
    expect(handleIntrepidSwordGen9).toBe(handleGen9IntrepidSwordTrigger);
  });

  it("stays blocked after switch-out clears volatiles because the once-per-battle flag is persistent", () => {
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "intrepid-sword" }),
      trigger: "on-switch-in",
    });

    handleGen9IntrepidSwordTrigger(ctx);
    ctx.pokemon.volatileStatuses.clear();

    const secondResult = handleGen9IntrepidSwordTrigger(ctx);
    expect(secondResult.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Dauntless Shield (Gen 9 nerf -- once per battle)
// ---------------------------------------------------------------------------

describe("handleGen9DauntlessShieldTrigger", () => {
  it("given on-switch-in with no prior usage, when handling, then boosts Defense and sets volatile", () => {
    // Source: Showdown data/abilities.ts -- dauntlessshield: once per battle in Gen 9
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "dauntless-shield" }),
      trigger: "on-switch-in",
    });
    const result = handleGen9DauntlessShieldTrigger(ctx);
    expect(result.activated).toBe(true);
    expect(ctx.pokemon.pokemon.shieldBoost).toBe(true);
    expect(result.effects).toHaveLength(2);
    expect(result.effects[0]).toEqual(
      expect.objectContaining({
        effectType: "volatile-inflict",
        volatile: "dauntless-shield-used",
      }),
    );
    expect(result.effects[1]).toEqual(
      expect.objectContaining({
        effectType: "stat-change",
        stat: "defense",
        stages: 1,
      }),
    );
  });

  it("given already used this battle, when handling, then does not activate", () => {
    // Source: specs/battle/10-gen9.md -- "Dauntless Shield: once per battle (nerfed from Gen 8)"
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({
        ability: "dauntless-shield",
      }),
      trigger: "on-switch-in",
    });
    ctx.pokemon.pokemon.shieldBoost = true;
    const result = handleGen9DauntlessShieldTrigger(ctx);
    expect(result.activated).toBe(false);
  });

  it("given wrong trigger, when handling, then does not activate", () => {
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "dauntless-shield" }),
      trigger: "on-turn-end",
    });
    const result = handleGen9DauntlessShieldTrigger(ctx);
    expect(result.activated).toBe(false);
  });

  it("keeps the legacy aliases wired to the trigger handler", () => {
    expect(handleGen9DauntlessShield).toBe(handleGen9DauntlessShieldTrigger);
    expect(handleDauntlessShieldGen9).toBe(handleGen9DauntlessShieldTrigger);
  });

  it("stays blocked after switch-out clears volatiles because the once-per-battle flag is persistent", () => {
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "dauntless-shield" }),
      trigger: "on-switch-in",
    });

    handleGen9DauntlessShieldTrigger(ctx);
    ctx.pokemon.volatileStatuses.clear();

    const secondResult = handleGen9DauntlessShieldTrigger(ctx);
    expect(secondResult.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Protean / Libero (Gen 9 nerf -- once per switch-in)
// ---------------------------------------------------------------------------

describe("handleProteanGen9", () => {
  it("given on-before-move with no prior usage, when handling, then changes type and sets volatile", () => {
    // Source: Showdown data/abilities.ts -- protean/libero: once per switchin in Gen 9
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "protean", types: ["normal"] }),
      trigger: "on-before-move",
      move: makeMove({ type: "fire" }),
    });
    const result = handleProteanGen9(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(2);
    expect(result.effects[0]).toEqual(
      expect.objectContaining({
        effectType: "volatile-inflict",
        volatile: "protean-used",
      }),
    );
    expect(result.effects[1]).toEqual(
      expect.objectContaining({
        effectType: "type-change",
        target: "self",
        types: ["fire"],
      }),
    );
  });

  it("given Libero ability, when handling, then also works and message says Libero", () => {
    // Source: Showdown data/abilities.ts -- libero: same as protean
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "libero", types: ["grass"] }),
      trigger: "on-before-move",
      move: makeMove({ type: "fire" }),
    });
    const result = handleProteanGen9(ctx);
    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("Libero");
  });

  it("given already used (volatile set), when handling, then does not activate (once per switch-in)", () => {
    // Source: specs/battle/10-gen9.md -- "Protean/Libero: once per switchin"
    const volatiles = new Map([["protean-used", { turnsLeft: -1 }]]);
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({
        ability: "protean",
        types: ["normal"],
        volatiles: volatiles as any,
      }),
      trigger: "on-before-move",
      move: makeMove({ type: "fire" }),
    });
    const result = handleProteanGen9(ctx);
    expect(result.activated).toBe(false);
  });

  it("given already the move's type (single type matches), when handling, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- doesn't activate if already the type
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "protean", types: ["fire"] }),
      trigger: "on-before-move",
      move: makeMove({ type: "fire" }),
    });
    const result = handleProteanGen9(ctx);
    expect(result.activated).toBe(false);
  });

  it("given dual type where one matches move type, when handling, then activates (changes to mono-type)", () => {
    // Dual-type means types.length !== 1, so the single-type check doesn't block
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "protean", types: ["fire", "flying"] }),
      trigger: "on-before-move",
      move: makeMove({ type: "fire" }),
    });
    const result = handleProteanGen9(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[1]).toEqual(expect.objectContaining({ types: ["fire"] }));
  });

  it("given wrong trigger, when handling, then does not activate", () => {
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "protean" }),
      trigger: "on-switch-in",
      move: makeMove({ type: "fire" }),
    });
    const result = handleProteanGen9(ctx);
    expect(result.activated).toBe(false);
  });

  it("given no move in context, when handling, then does not activate", () => {
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "protean" }),
      trigger: "on-before-move",
    });
    const result = handleProteanGen9(ctx);
    expect(result.activated).toBe(false);
  });

  it("keeps the legacy aliases wired to the trigger handler", () => {
    expect(handleGen9Protean).toBe(handleGen9ProteanTrigger);
    expect(handleProteanGen9).toBe(handleGen9ProteanTrigger);
  });
});

// ---------------------------------------------------------------------------
// handleGen9NewAbility dispatch
// ---------------------------------------------------------------------------

describe("handleGen9NewAbility", () => {
  it("given toxic-chain ability, when dispatching, then routes to handleToxicChain", () => {
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "toxic-chain" }),
      opponent: makeActivePokemon({ types: ["normal"] }),
      trigger: "on-after-move-used",
      move: makeMove({ category: "physical" }),
      rng: { chance: () => true },
    });
    const result = handleGen9NewAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given good-as-gold ability with status move, when dispatching, then routes to handleGoodAsGold", () => {
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "good-as-gold" }),
      trigger: "on-before-move",
      move: makeMove({ category: "status" }),
    });
    const result = handleGen9NewAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.movePrevented).toBe(true);
  });

  it("given intrepid-sword ability, when dispatching, then routes to handleIntrepidSwordGen9", () => {
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "intrepid-sword" }),
      trigger: "on-switch-in",
    });
    const result = handleGen9NewAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given dauntless-shield ability, when dispatching, then routes to handleDauntlessShieldGen9", () => {
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "dauntless-shield" }),
      trigger: "on-switch-in",
    });
    const result = handleGen9NewAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given protean ability, when dispatching, then routes to handleProteanGen9", () => {
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "protean", types: ["normal"] }),
      trigger: "on-before-move",
      move: makeMove({ type: "water" }),
    });
    const result = handleGen9NewAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given libero ability, when dispatching, then routes to handleProteanGen9", () => {
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "libero", types: ["grass"] }),
      trigger: "on-before-move",
      move: makeMove({ type: "fire" }),
    });
    const result = handleGen9NewAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given unrelated ability, when dispatching, then returns inactive", () => {
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "levitate" }),
      trigger: "on-switch-in",
    });
    const result = handleGen9NewAbility(ctx);
    expect(result.activated).toBe(false);
  });
});
