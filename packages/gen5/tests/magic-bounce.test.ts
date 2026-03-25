import type { ActivePokemon, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType, PrimaryStatus } from "@pokemon-lib-ts/core";
import { CORE_ABILITY_IDS, CORE_TYPE_IDS, CORE_VOLATILE_IDS } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen5DataManager, GEN5_ABILITY_IDS, GEN5_MOVE_IDS } from "../src";
import {
  GEN5_REFLECTABLE_MOVES,
  isReflectableMove,
  shouldReflectMoveGen5,
} from "../src/Gen5MagicBounce";

const dataManager = createGen5DataManager();
const A = GEN5_ABILITY_IDS;
const M = GEN5_MOVE_IDS;
const V = CORE_VOLATILE_IDS;

function getMagicBounceMessage(defender: ActivePokemon, move: MoveData): string {
  const defenderName = defender.pokemon.nickname ?? String(defender.pokemon.speciesId);
  const magicBounceName = dataManager.getAbility(A.magicBounce).displayName;
  return `${defenderName}'s ${magicBounceName} reflected ${move.displayName} back!`;
}

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
  status?: PrimaryStatus | null;
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
    ability: overrides.ability ?? CORE_ABILITY_IDS.none,
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
  status?: PrimaryStatus | null;
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
    types: overrides.types ?? [CORE_TYPE_IDS.normal],
    ability: overrides.ability ?? CORE_ABILITY_IDS.none,
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

function makeMove(id: string): MoveData {
  return dataManager.getMove(id);
}

// ---------------------------------------------------------------------------
// Tests: isReflectableMove
// ---------------------------------------------------------------------------

describe("isReflectableMove", () => {
  it("given spore, then returns true (reflectable status move)", () => {
    // Source: Showdown data/moves.ts -- spore has flags: { reflectable: 1 }
    expect(isReflectableMove(M.spore)).toBe(true);
  });

  it("given thunder-wave, then returns true (reflectable status move)", () => {
    // Source: Showdown data/moves.ts -- thunderwave has flags: { reflectable: 1 }
    expect(isReflectableMove(M.thunderWave)).toBe(true);
  });

  it("given toxic, then returns true (reflectable status move)", () => {
    // Source: Showdown data/moves.ts -- toxic has flags: { reflectable: 1 }
    expect(isReflectableMove(M.toxic)).toBe(true);
  });

  it("given will-o-wisp, then returns true (reflectable status move)", () => {
    // Source: Showdown data/moves.ts -- willowisp has flags: { reflectable: 1 }
    expect(isReflectableMove(M.willOWisp)).toBe(true);
  });

  it("given taunt, then returns true (reflectable volatile status move)", () => {
    // Source: Showdown data/moves.ts -- taunt has flags: { reflectable: 1 }
    expect(isReflectableMove(M.taunt)).toBe(true);
  });

  it("given leech-seed, then returns true (reflectable volatile status move)", () => {
    // Source: Showdown data/moves.ts -- leechseed has flags: { reflectable: 1 }
    expect(isReflectableMove(M.leechSeed)).toBe(true);
  });

  it("given stealth-rock, then returns true (reflectable entry hazard)", () => {
    // Source: Showdown data/moves.ts -- stealthrock has flags: { reflectable: 1 }
    expect(isReflectableMove(M.stealthRock)).toBe(true);
  });

  it("given roar, then returns true (reflectable phazing move)", () => {
    // Source: Showdown data/moves.ts -- roar has flags: { reflectable: 1 }
    expect(isReflectableMove(M.roar)).toBe(true);
  });

  it("given swords-dance, then returns false (self-targeting, not reflectable)", () => {
    // Source: Showdown data/moves.ts -- swordsdance does NOT have reflectable flag
    expect(isReflectableMove(M.swordsDance)).toBe(false);
  });

  it("given recover, then returns false (self-targeting heal, not reflectable)", () => {
    // Source: Showdown data/moves.ts -- recover does NOT have reflectable flag
    expect(isReflectableMove(M.recover)).toBe(false);
  });

  it("given flamethrower, then returns false (damaging move, not reflectable)", () => {
    // Source: Showdown data/moves.ts -- flamethrower does NOT have reflectable flag
    expect(isReflectableMove(M.flamethrower)).toBe(false);
  });

  it("given trick, then returns false (non-reflectable opponent-targeting status)", () => {
    // Source: Showdown data/moves.ts -- trick does NOT have reflectable flag
    expect(isReflectableMove(M.trick)).toBe(false);
  });

  it("given transform, then returns false (non-reflectable opponent-targeting status)", () => {
    // Source: Showdown data/moves.ts -- transform does NOT have reflectable flag
    expect(isReflectableMove(M.transform)).toBe(false);
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
      M.spore,
      M.sleepPowder,
      M.thunderWave,
      M.toxic,
      M.willOWisp,
      M.stunSpore,
      M.glare,
      M.hypnosis,
      M.darkVoid,
      M.sing,
    ];
    for (const move of expected) {
      expect(GEN5_REFLECTABLE_MOVES.has(move)).toBe(true);
    }
  });

  it("contains all stat-lowering reflectable moves", () => {
    // Source: Showdown data/moves.ts -- these all have reflectable: 1
    const expected = [
      M.growl,
      M.leer,
      M.charm,
      M.screech,
      M.fakeTears,
      M.tailWhip,
      M.sandAttack,
      M.smokescreen,
    ];
    for (const move of expected) {
      expect(GEN5_REFLECTABLE_MOVES.has(move)).toBe(true);
    }
  });

  it("contains entry hazard moves", () => {
    // Source: Showdown data/moves.ts -- hazards have reflectable: 1
    expect(GEN5_REFLECTABLE_MOVES.has(M.spikes)).toBe(true);
    expect(GEN5_REFLECTABLE_MOVES.has(M.stealthRock)).toBe(true);
    expect(GEN5_REFLECTABLE_MOVES.has(M.toxicSpikes)).toBe(true);
  });

  it("does not contain non-reflectable opponent-targeting status moves", () => {
    // Source: Showdown data/moves.ts -- these do NOT have reflectable: 1
    const excluded = [
      M.trick,
      M.switcheroo,
      M.transform,
      M.sketch,
      M.mimic,
      M.painSplit,
      M.memento,
      M.psychUp,
      M.heartSwap,
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
    const attacker = makeActivePokemon({ ability: A.overgrow });
    const defender = makeActivePokemon({ ability: A.magicBounce, nickname: "Espeon" });
    const move = makeMove(M.spore);
    const state = makeBattleState();

    const result = shouldReflectMoveGen5(move, attacker, defender, state);

    expect(result).toEqual({
      reflected: true,
      messages: [getMagicBounceMessage(defender, move)],
    });
    expect(result!.messages).toHaveLength(1);
    expect(result!.messages[0]).toContain("Magic Bounce");
    expect(result!.messages[0]).toContain("Spore");
  });

  it("given defender with magic-bounce, when Thunder Wave targets it, then move is reflected", () => {
    // Source: Showdown data/abilities.ts -- thunderwave has reflectable flag
    // Source: Bulbapedia -- Magic Bounce reflects status-inducing moves
    const attacker = makeActivePokemon({ ability: A.static });
    const defender = makeActivePokemon({ ability: A.magicBounce, nickname: "Natu" });
    const move = makeMove(M.thunderWave);
    const state = makeBattleState();

    const result = shouldReflectMoveGen5(move, attacker, defender, state);

    expect(result).toEqual({
      reflected: true,
      messages: [getMagicBounceMessage(defender, move)],
    });
  });

  it("given defender with magic-bounce, when Flamethrower targets it, then move is NOT reflected (damaging)", () => {
    // Source: Showdown data/abilities.ts -- magicbounce only checks reflectable flag
    // Source: Bulbapedia -- Magic Bounce: "does not reflect damaging moves"
    const attacker = makeActivePokemon({ ability: A.blaze });
    const defender = makeActivePokemon({ ability: A.magicBounce });
    const move = makeMove(M.flamethrower);
    const state = makeBattleState();

    const result = shouldReflectMoveGen5(move, attacker, defender, state);

    expect(result).toBeNull();
    expect(isReflectableMove(move.id)).toBe(false);
    expect(defender.ability).toBe(A.magicBounce);
  });

  it("given defender WITHOUT magic-bounce, when Spore targets it, then move is NOT reflected", () => {
    // Guard test: magic-bounce only activates for the holder
    const attacker = makeActivePokemon({ ability: A.overgrow });
    const defender = makeActivePokemon({ ability: A.pressure });
    const move = makeMove(M.spore);
    const state = makeBattleState();

    const result = shouldReflectMoveGen5(move, attacker, defender, state);

    expect(result).toBeNull();
    expect(isReflectableMove(move.id)).toBe(true);
    expect(defender.ability).toBe(A.pressure);
  });

  it("given defender with magic-bounce and attacker with mold-breaker, when Spore targets it, then move is NOT reflected", () => {
    // Source: Showdown data/abilities.ts -- magicbounce has { breakable: 1 }
    //   meaning Mold Breaker variants bypass it
    // Source: Bulbapedia -- Mold Breaker: "ignores abilities of other Pokemon"
    const attacker = makeActivePokemon({ ability: A.moldBreaker });
    const defender = makeActivePokemon({ ability: A.magicBounce });
    const move = makeMove(M.spore);
    const state = makeBattleState();

    const result = shouldReflectMoveGen5(move, attacker, defender, state);

    expect(result).toBeNull();
    expect(attacker.ability).toBe(A.moldBreaker);
    expect(defender.ability).toBe(A.magicBounce);
  });

  it("given defender with magic-bounce and attacker with teravolt, when Toxic targets it, then move is NOT reflected", () => {
    // Source: Showdown data/abilities.ts -- teravolt is a Mold Breaker variant
    // Source: Bulbapedia -- Teravolt: "ignores target's ability"
    const attacker = makeActivePokemon({ ability: A.teravolt });
    const defender = makeActivePokemon({ ability: A.magicBounce });
    const move = makeMove(M.toxic);
    const state = makeBattleState();

    const result = shouldReflectMoveGen5(move, attacker, defender, state);

    expect(result).toBeNull();
    expect(attacker.ability).toBe(A.teravolt);
    expect(defender.ability).toBe(A.magicBounce);
  });

  it("given defender with magic-bounce and attacker with turboblaze, when Will-O-Wisp targets it, then move is NOT reflected", () => {
    // Source: Showdown data/abilities.ts -- turboblaze is a Mold Breaker variant
    // Source: Bulbapedia -- Turboblaze: "ignores target's ability"
    const attacker = makeActivePokemon({ ability: A.turboblaze });
    const defender = makeActivePokemon({ ability: A.magicBounce });
    const move = makeMove(M.willOWisp);
    const state = makeBattleState();

    const result = shouldReflectMoveGen5(move, attacker, defender, state);

    expect(result).toBeNull();
    expect(attacker.ability).toBe(A.turboblaze);
    expect(defender.ability).toBe(A.magicBounce);
  });

  it("given defender with magic-bounce who is semi-invulnerable (flying), when Taunt targets it, then move is NOT reflected", () => {
    // Source: Showdown data/abilities.ts -- magicbounce checks target.isSemiInvulnerable()
    const attacker = makeActivePokemon({ ability: A.keenEye });
    const flyingVolatiles = new Map<string, { turnsLeft: number }>();
    flyingVolatiles.set(V.flying, { turnsLeft: 1 });
    const defender = makeActivePokemon({
      ability: A.magicBounce,
      volatiles: flyingVolatiles,
    });
    const move = makeMove(M.taunt);
    const state = makeBattleState();

    const result = shouldReflectMoveGen5(move, attacker, defender, state);

    expect(result).toBeNull();
    expect(defender.volatileStatuses.has(V.flying)).toBe(true);
    expect(defender.ability).toBe(A.magicBounce);
  });

  it("given defender with magic-bounce, when a non-reflectable status move (Trick) targets it, then move is NOT reflected", () => {
    // Source: Showdown data/moves.ts -- trick does NOT have reflectable flag
    // Source: Bulbapedia -- Magic Bounce only reflects moves with the reflectable property
    const attacker = makeActivePokemon({ ability: A.frisk });
    const defender = makeActivePokemon({ ability: A.magicBounce });
    const move = makeMove(M.trick);
    const state = makeBattleState();

    const result = shouldReflectMoveGen5(move, attacker, defender, state);

    expect(result).toBeNull();
    expect(isReflectableMove(move.id)).toBe(false);
    expect(defender.ability).toBe(A.magicBounce);
  });

  it("given defender with magic-bounce, when Stealth Rock targets it, then move is reflected (entry hazard)", () => {
    // Source: Showdown data/moves.ts -- stealthrock has reflectable: 1
    // Source: Bulbapedia -- Magic Bounce reflects Stealth Rock
    const attacker = makeActivePokemon({ ability: A.sturdy });
    const defender = makeActivePokemon({ ability: A.magicBounce, nickname: "Xatu" });
    const move = makeMove(M.stealthRock);
    const state = makeBattleState();

    const result = shouldReflectMoveGen5(move, attacker, defender, state);

    expect(result).toEqual({
      reflected: true,
      messages: [getMagicBounceMessage(defender, move)],
    });
  });

  it("given defender with magic-bounce, when Roar targets it, then move is reflected", () => {
    // Source: Showdown data/moves.ts -- roar has reflectable: 1
    // Source: Bulbapedia -- Magic Bounce reflects Roar
    const attacker = makeActivePokemon({ ability: A.intimidate });
    const defender = makeActivePokemon({ ability: A.magicBounce });
    const move = makeMove(M.roar);
    const state = makeBattleState();

    const result = shouldReflectMoveGen5(move, attacker, defender, state);

    expect(result).toEqual({
      reflected: true,
      messages: [getMagicBounceMessage(defender, move)],
    });
  });

  it("given defender with magic-bounce, reflection message includes defender nickname and move name", () => {
    // Source: Showdown data/abilities.ts -- magicbounce.onTryHit emits
    // "[target]'s Magic Bounce reflected [move] back!" (this.add '-ability', target, 'Magic Bounce')
    // Format: "{nickname}'s Magic Bounce reflected {displayName} back!"
    const attacker = makeActivePokemon({ ability: A.chlorophyll });
    const defender = makeActivePokemon({ ability: A.magicBounce, nickname: "Espeon" });
    const move = makeMove(M.toxic);
    const state = makeBattleState();

    const result = shouldReflectMoveGen5(move, attacker, defender, state);

    expect(result).toEqual({
      reflected: true,
      messages: [getMagicBounceMessage(defender, move)],
    });
  });

  it("given defender with magic-bounce but no nickname, reflection message uses speciesId", () => {
    // Verify fallback to speciesId when nickname is null
    const attacker = makeActivePokemon({ ability: A.chlorophyll });
    const defender = makeActivePokemon({
      ability: A.magicBounce,
      nickname: null,
      speciesId: 196,
    });
    const move = makeMove(M.encore);
    const state = makeBattleState();

    const result = shouldReflectMoveGen5(move, attacker, defender, state);

    expect(result).toEqual({
      reflected: true,
      messages: [getMagicBounceMessage(defender, move)],
    });
  });
});
