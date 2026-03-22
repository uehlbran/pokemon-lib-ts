import type {
  AbilityContext,
  ActivePokemon,
  BattleSide,
  BattleState,
} from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  GEN5_REFLECTABLE_MOVES,
  isReflectableMove,
  shouldReflectMoveGen5,
} from "../src/Gen5MagicBounce";

/**
 * Gen 5 Magic Bounce ability tests.
 *
 * Source: Showdown data/abilities.ts -- magicbounce.onTryHit
 * Source: Bulbapedia -- Magic Bounce ability page
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makePokemonInstance(overrides: {
  speciesId?: number;
  nickname?: string | null;
  ability?: string;
  heldItem?: string | null;
  status?: "burn" | "poison" | "badly-poisoned" | "paralysis" | "sleep" | "freeze" | null;
  currentHp?: number;
  maxHp?: number;
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  return {
    uid: "test",
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
    status: overrides.status ?? null,
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
  speciesId?: number;
  nickname?: string | null;
  status?: "burn" | "poison" | "badly-poisoned" | "paralysis" | "sleep" | "freeze" | null;
  currentHp?: number;
  maxHp?: number;
  heldItem?: string | null;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
}): ActivePokemon {
  return {
    pokemon: makePokemonInstance({
      ability: overrides.ability,
      speciesId: overrides.speciesId,
      nickname: overrides.nickname,
      status: overrides.status,
      currentHp: overrides.currentHp,
      maxHp: overrides.maxHp,
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
  } as ActivePokemon;
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
  } as unknown as BattleSide;
}

function makeBattleState(): BattleState {
  return {
    phase: "turn-end",
    generation: 5,
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
      chance: (_p: number) => false,
      pick: <T>(arr: readonly T[]) => arr[0] as T,
      shuffle: <T>(arr: T[]) => arr,
      getState: () => 0,
      setState: () => {},
    },
    ended: false,
    winner: null,
  } as unknown as BattleState;
}

function makeStatusMove(id: string, displayName: string): MoveData {
  return {
    id,
    displayName,
    type: "normal",
    category: "status",
    power: null,
    accuracy: 100,
    pp: 10,
    maxPP: 16,
    priority: 0,
    target: "adjacent-foe",
    effect: null,
    flags: {
      contact: false,
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
    },
    generation: 5,
  } as MoveData;
}

function makeDamagingMove(id: string, displayName: string): MoveData {
  return {
    id,
    displayName,
    type: "fire",
    category: "special",
    power: 90,
    accuracy: 100,
    pp: 15,
    maxPP: 24,
    priority: 0,
    target: "adjacent-foe",
    effect: null,
    flags: {
      contact: false,
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
    },
    generation: 5,
  } as MoveData;
}

// ---------------------------------------------------------------------------
// Tests: isReflectableMove
// ---------------------------------------------------------------------------

describe("isReflectableMove", () => {
  it("given spore, then returns true (reflectable status move)", () => {
    // Source: Showdown data/moves.ts -- spore has flags: { reflectable: 1 }
    expect(isReflectableMove("spore")).toBe(true);
  });

  it("given thunder-wave, then returns true (reflectable status move)", () => {
    // Source: Showdown data/moves.ts -- thunderwave has flags: { reflectable: 1 }
    expect(isReflectableMove("thunder-wave")).toBe(true);
  });

  it("given toxic, then returns true (reflectable status move)", () => {
    // Source: Showdown data/moves.ts -- toxic has flags: { reflectable: 1 }
    expect(isReflectableMove("toxic")).toBe(true);
  });

  it("given will-o-wisp, then returns true (reflectable status move)", () => {
    // Source: Showdown data/moves.ts -- willowisp has flags: { reflectable: 1 }
    expect(isReflectableMove("will-o-wisp")).toBe(true);
  });

  it("given taunt, then returns true (reflectable volatile status move)", () => {
    // Source: Showdown data/moves.ts -- taunt has flags: { reflectable: 1 }
    expect(isReflectableMove("taunt")).toBe(true);
  });

  it("given leech-seed, then returns true (reflectable volatile status move)", () => {
    // Source: Showdown data/moves.ts -- leechseed has flags: { reflectable: 1 }
    expect(isReflectableMove("leech-seed")).toBe(true);
  });

  it("given stealth-rock, then returns true (reflectable entry hazard)", () => {
    // Source: Showdown data/moves.ts -- stealthrock has flags: { reflectable: 1 }
    expect(isReflectableMove("stealth-rock")).toBe(true);
  });

  it("given roar, then returns true (reflectable phazing move)", () => {
    // Source: Showdown data/moves.ts -- roar has flags: { reflectable: 1 }
    expect(isReflectableMove("roar")).toBe(true);
  });

  it("given swords-dance, then returns false (self-targeting, not reflectable)", () => {
    // Source: Showdown data/moves.ts -- swordsdance does NOT have reflectable flag
    expect(isReflectableMove("swords-dance")).toBe(false);
  });

  it("given recover, then returns false (self-targeting heal, not reflectable)", () => {
    // Source: Showdown data/moves.ts -- recover does NOT have reflectable flag
    expect(isReflectableMove("recover")).toBe(false);
  });

  it("given flamethrower, then returns false (damaging move, not reflectable)", () => {
    // Source: Showdown data/moves.ts -- flamethrower does NOT have reflectable flag
    expect(isReflectableMove("flamethrower")).toBe(false);
  });

  it("given trick, then returns false (non-reflectable opponent-targeting status)", () => {
    // Source: Showdown data/moves.ts -- trick does NOT have reflectable flag
    expect(isReflectableMove("trick")).toBe(false);
  });

  it("given transform, then returns false (non-reflectable opponent-targeting status)", () => {
    // Source: Showdown data/moves.ts -- transform does NOT have reflectable flag
    expect(isReflectableMove("transform")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: GEN5_REFLECTABLE_MOVES set
// ---------------------------------------------------------------------------

describe("GEN5_REFLECTABLE_MOVES", () => {
  it("contains exactly 66 moves matching Showdown's Gen 5 reflectable set", () => {
    // Source: Cross-reference of Showdown data/moves.ts reflectable flag
    // against Gen 5 move pool
    expect(GEN5_REFLECTABLE_MOVES.size).toBe(66);
  });

  it("contains all core status-inflicting reflectable moves", () => {
    // Source: Showdown data/moves.ts -- these all have reflectable: 1
    const expected = [
      "spore",
      "sleep-powder",
      "thunder-wave",
      "toxic",
      "will-o-wisp",
      "stun-spore",
      "glare",
      "hypnosis",
      "dark-void",
      "sing",
    ];
    for (const move of expected) {
      expect(GEN5_REFLECTABLE_MOVES.has(move)).toBe(true);
    }
  });

  it("contains all stat-lowering reflectable moves", () => {
    // Source: Showdown data/moves.ts -- these all have reflectable: 1
    const expected = [
      "growl",
      "leer",
      "charm",
      "screech",
      "fake-tears",
      "tail-whip",
      "sand-attack",
      "smokescreen",
    ];
    for (const move of expected) {
      expect(GEN5_REFLECTABLE_MOVES.has(move)).toBe(true);
    }
  });

  it("contains entry hazard moves", () => {
    // Source: Showdown data/moves.ts -- hazards have reflectable: 1
    expect(GEN5_REFLECTABLE_MOVES.has("spikes")).toBe(true);
    expect(GEN5_REFLECTABLE_MOVES.has("stealth-rock")).toBe(true);
    expect(GEN5_REFLECTABLE_MOVES.has("toxic-spikes")).toBe(true);
  });

  it("does not contain non-reflectable opponent-targeting status moves", () => {
    // Source: Showdown data/moves.ts -- these do NOT have reflectable: 1
    const excluded = [
      "trick",
      "switcheroo",
      "transform",
      "sketch",
      "mimic",
      "pain-split",
      "memento",
      "psych-up",
      "heart-swap",
    ];
    for (const move of excluded) {
      expect(GEN5_REFLECTABLE_MOVES.has(move)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: shouldReflectMoveGen5
// ---------------------------------------------------------------------------

describe("shouldReflectMoveGen5", () => {
  it("given defender with magic-bounce, when Spore targets it, then move is reflected", () => {
    // Source: Showdown data/abilities.ts -- magicbounce.onTryHit:
    //   reflects moves with 'reflectable' flag
    // Source: Bulbapedia -- Magic Bounce: "reflects non-damaging moves"
    const attacker = makeActivePokemon({ ability: "overgrow" });
    const defender = makeActivePokemon({ ability: "magic-bounce", nickname: "Espeon" });
    const move = makeStatusMove("spore", "Spore");
    const state = makeBattleState();

    const result = shouldReflectMoveGen5(move, attacker, defender, state);

    expect(result).not.toBeNull();
    expect(result!.reflected).toBe(true);
    expect(result!.messages).toHaveLength(1);
    expect(result!.messages[0]).toContain("Magic Bounce");
    expect(result!.messages[0]).toContain("Spore");
  });

  it("given defender with magic-bounce, when Thunder Wave targets it, then move is reflected", () => {
    // Source: Showdown data/abilities.ts -- thunderwave has reflectable flag
    // Source: Bulbapedia -- Magic Bounce reflects status-inducing moves
    const attacker = makeActivePokemon({ ability: "static" });
    const defender = makeActivePokemon({ ability: "magic-bounce", nickname: "Natu" });
    const move = makeStatusMove("thunder-wave", "Thunder Wave");
    const state = makeBattleState();

    const result = shouldReflectMoveGen5(move, attacker, defender, state);

    expect(result).not.toBeNull();
    expect(result!.reflected).toBe(true);
  });

  it("given defender with magic-bounce, when Flamethrower targets it, then move is NOT reflected (damaging)", () => {
    // Source: Showdown data/abilities.ts -- magicbounce only checks reflectable flag
    // Source: Bulbapedia -- Magic Bounce: "does not reflect damaging moves"
    const attacker = makeActivePokemon({ ability: "blaze" });
    const defender = makeActivePokemon({ ability: "magic-bounce" });
    const move = makeDamagingMove("flamethrower", "Flamethrower");
    const state = makeBattleState();

    const result = shouldReflectMoveGen5(move, attacker, defender, state);

    expect(result).toBeNull();
  });

  it("given defender WITHOUT magic-bounce, when Spore targets it, then move is NOT reflected", () => {
    // Guard test: magic-bounce only activates for the holder
    const attacker = makeActivePokemon({ ability: "overgrow" });
    const defender = makeActivePokemon({ ability: "pressure" });
    const move = makeStatusMove("spore", "Spore");
    const state = makeBattleState();

    const result = shouldReflectMoveGen5(move, attacker, defender, state);

    expect(result).toBeNull();
  });

  it("given defender with magic-bounce and attacker with mold-breaker, when Spore targets it, then move is NOT reflected", () => {
    // Source: Showdown data/abilities.ts -- magicbounce has { breakable: 1 }
    //   meaning Mold Breaker variants bypass it
    // Source: Bulbapedia -- Mold Breaker: "ignores abilities of other Pokemon"
    const attacker = makeActivePokemon({ ability: "mold-breaker" });
    const defender = makeActivePokemon({ ability: "magic-bounce" });
    const move = makeStatusMove("spore", "Spore");
    const state = makeBattleState();

    const result = shouldReflectMoveGen5(move, attacker, defender, state);

    expect(result).toBeNull();
  });

  it("given defender with magic-bounce and attacker with teravolt, when Toxic targets it, then move is NOT reflected", () => {
    // Source: Showdown data/abilities.ts -- teravolt is a Mold Breaker variant
    // Source: Bulbapedia -- Teravolt: "ignores target's ability"
    const attacker = makeActivePokemon({ ability: "teravolt" });
    const defender = makeActivePokemon({ ability: "magic-bounce" });
    const move = makeStatusMove("toxic", "Toxic");
    const state = makeBattleState();

    const result = shouldReflectMoveGen5(move, attacker, defender, state);

    expect(result).toBeNull();
  });

  it("given defender with magic-bounce and attacker with turboblaze, when Will-O-Wisp targets it, then move is NOT reflected", () => {
    // Source: Showdown data/abilities.ts -- turboblaze is a Mold Breaker variant
    // Source: Bulbapedia -- Turboblaze: "ignores target's ability"
    const attacker = makeActivePokemon({ ability: "turboblaze" });
    const defender = makeActivePokemon({ ability: "magic-bounce" });
    const move = makeStatusMove("will-o-wisp", "Will-O-Wisp");
    const state = makeBattleState();

    const result = shouldReflectMoveGen5(move, attacker, defender, state);

    expect(result).toBeNull();
  });

  it("given defender with magic-bounce who is semi-invulnerable (flying), when Taunt targets it, then move is NOT reflected", () => {
    // Source: Showdown data/abilities.ts -- magicbounce checks target.isSemiInvulnerable()
    const attacker = makeActivePokemon({ ability: "keen-eye" });
    const flyingVolatiles = new Map<string, { turnsLeft: number }>();
    flyingVolatiles.set("flying", { turnsLeft: 1 });
    const defender = makeActivePokemon({
      ability: "magic-bounce",
      volatiles: flyingVolatiles,
    });
    const move = makeStatusMove("taunt", "Taunt");
    const state = makeBattleState();

    const result = shouldReflectMoveGen5(move, attacker, defender, state);

    expect(result).toBeNull();
  });

  it("given defender with magic-bounce, when a non-reflectable status move (Trick) targets it, then move is NOT reflected", () => {
    // Source: Showdown data/moves.ts -- trick does NOT have reflectable flag
    // Source: Bulbapedia -- Magic Bounce only reflects moves with the reflectable property
    const attacker = makeActivePokemon({ ability: "frisk" });
    const defender = makeActivePokemon({ ability: "magic-bounce" });
    const move = makeStatusMove("trick", "Trick");
    const state = makeBattleState();

    const result = shouldReflectMoveGen5(move, attacker, defender, state);

    expect(result).toBeNull();
  });

  it("given defender with magic-bounce, when Stealth Rock targets it, then move is reflected (entry hazard)", () => {
    // Source: Showdown data/moves.ts -- stealthrock has reflectable: 1
    // Source: Bulbapedia -- Magic Bounce reflects Stealth Rock
    const attacker = makeActivePokemon({ ability: "sturdy" });
    const defender = makeActivePokemon({ ability: "magic-bounce", nickname: "Xatu" });
    const move = makeStatusMove("stealth-rock", "Stealth Rock");
    const state = makeBattleState();

    const result = shouldReflectMoveGen5(move, attacker, defender, state);

    expect(result).not.toBeNull();
    expect(result!.reflected).toBe(true);
  });

  it("given defender with magic-bounce, when Roar targets it, then move is reflected", () => {
    // Source: Showdown data/moves.ts -- roar has reflectable: 1
    // Source: Bulbapedia -- Magic Bounce reflects Roar
    const attacker = makeActivePokemon({ ability: "intimidate" });
    const defender = makeActivePokemon({ ability: "magic-bounce" });
    const move = makeStatusMove("roar", "Roar");
    const state = makeBattleState();

    const result = shouldReflectMoveGen5(move, attacker, defender, state);

    expect(result).not.toBeNull();
    expect(result!.reflected).toBe(true);
  });

  it("given defender with magic-bounce, reflection message includes defender nickname and move name", () => {
    // Verify the message format for UI/logging consumers
    const attacker = makeActivePokemon({ ability: "chlorophyll" });
    const defender = makeActivePokemon({ ability: "magic-bounce", nickname: "Espeon" });
    const move = makeStatusMove("toxic", "Toxic");
    const state = makeBattleState();

    const result = shouldReflectMoveGen5(move, attacker, defender, state);

    expect(result).not.toBeNull();
    expect(result!.messages[0]).toBe("Espeon's Magic Bounce reflected Toxic back!");
  });

  it("given defender with magic-bounce but no nickname, reflection message uses speciesId", () => {
    // Verify fallback to speciesId when nickname is null
    const attacker = makeActivePokemon({ ability: "chlorophyll" });
    const defender = makeActivePokemon({
      ability: "magic-bounce",
      nickname: null,
      speciesId: 196,
    });
    const move = makeStatusMove("encore", "Encore");
    const state = makeBattleState();

    const result = shouldReflectMoveGen5(move, attacker, defender, state);

    expect(result).not.toBeNull();
    expect(result!.messages[0]).toContain("196");
    expect(result!.messages[0]).toContain("Encore");
  });
});
