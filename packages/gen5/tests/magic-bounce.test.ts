import type { ActivePokemon, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import { createDefaultStatStages } from "@pokemon-lib-ts/battle/utils";
import type { MoveData, PokemonInstance, PokemonType, PrimaryStatus } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  createEvs,
  createFriendship,
  createIvs,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen5DataManager, GEN5_ABILITY_IDS, GEN5_MOVE_IDS } from "../src";
import {
  GEN5_REFLECTABLE_MOVES,
  isReflectableMove,
  shouldReflectMoveGen5,
} from "../src/Gen5MagicBounce";

const dataManager = createGen5DataManager();
const abilityIds = GEN5_ABILITY_IDS;
const moveIds = GEN5_MOVE_IDS;
const volatileIds = CORE_VOLATILE_IDS;
const typeIds = CORE_TYPE_IDS;
const itemIds = CORE_ITEM_IDS;
const abilitySlots = CORE_ABILITY_SLOTS;
const genders = CORE_GENDERS;

function getMagicBounceMessage(defender: ActivePokemon, move: MoveData): string {
  const defenderName = defender.pokemon.nickname ?? String(defender.pokemon.speciesId);
  const magicBounceName = dataManager.getAbility(abilityIds.magicBounce).displayName;
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

function createSyntheticPokemonInstance(overrides: {
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
    ivs: createIvs(),
    evs: createEvs(),
    currentHp: overrides.currentHp ?? maxHp,
    moves: [],
    ability: overrides.ability ?? CORE_ABILITY_IDS.none,
    abilitySlot: abilitySlots.normal1,
    heldItem: overrides.heldItem ?? null,
    status: overrides.status ?? null,
    friendship: createFriendship(0),
    gender: genders.male,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: itemIds.pokeBall,
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

function createSyntheticOnFieldPokemon(overrides: {
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
    pokemon: createSyntheticPokemonInstance({
      ability: overrides.ability,
      speciesId: overrides.speciesId,
      nickname: overrides.nickname,
      status: overrides.status,
      currentHp: overrides.currentHp,
      maxHp: overrides.maxHp,
      heldItem: overrides.heldItem,
    }),
    teamSlot: 0,
    statStages: createDefaultStatStages(),
    volatileStatuses: overrides.volatiles ?? new Map(),
    types: overrides.types ?? [typeIds.normal],
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
  } as unknown as BattleSide;
}

function createBattleState(): BattleState {
  return {
    phase: "turn-end",
    generation: 5,
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

function createCanonicalMove(id: string): MoveData {
  return dataManager.getMove(id);
}

// ---------------------------------------------------------------------------
// Tests: isReflectableMove
// ---------------------------------------------------------------------------

describe("isReflectableMove", () => {
  it("given spore, then returns true (reflectable status move)", () => {
    // Source: Showdown data/moves.ts -- spore has flags: { reflectable: 1 }
    expect(isReflectableMove(moveIds.spore)).toBe(true);
  });

  it("given thunder-wave, then returns true (reflectable status move)", () => {
    // Source: Showdown data/moves.ts -- thunderwave has flags: { reflectable: 1 }
    expect(isReflectableMove(moveIds.thunderWave)).toBe(true);
  });

  it("given toxic, then returns true (reflectable status move)", () => {
    // Source: Showdown data/moves.ts -- toxic has flags: { reflectable: 1 }
    expect(isReflectableMove(moveIds.toxic)).toBe(true);
  });

  it("given will-o-wisp, then returns true (reflectable status move)", () => {
    // Source: Showdown data/moves.ts -- willowisp has flags: { reflectable: 1 }
    expect(isReflectableMove(moveIds.willOWisp)).toBe(true);
  });

  it("given taunt, then returns true (reflectable volatile status move)", () => {
    // Source: Showdown data/moves.ts -- taunt has flags: { reflectable: 1 }
    expect(isReflectableMove(moveIds.taunt)).toBe(true);
  });

  it("given leech-seed, then returns true (reflectable volatile status move)", () => {
    // Source: Showdown data/moves.ts -- leechseed has flags: { reflectable: 1 }
    expect(isReflectableMove(moveIds.leechSeed)).toBe(true);
  });

  it("given stealth-rock, then returns true (reflectable entry hazard)", () => {
    // Source: Showdown data/moves.ts -- stealthrock has flags: { reflectable: 1 }
    expect(isReflectableMove(moveIds.stealthRock)).toBe(true);
  });

  it("given roar, then returns true (reflectable phazing move)", () => {
    // Source: Showdown data/moves.ts -- roar has flags: { reflectable: 1 }
    expect(isReflectableMove(moveIds.roar)).toBe(true);
  });

  it("given swords-dance, then returns false (self-targeting, not reflectable)", () => {
    // Source: Showdown data/moves.ts -- swordsdance does NOT have reflectable flag
    expect(isReflectableMove(moveIds.swordsDance)).toBe(false);
  });

  it("given recover, then returns false (self-targeting heal, not reflectable)", () => {
    // Source: Showdown data/moves.ts -- recover does NOT have reflectable flag
    expect(isReflectableMove(moveIds.recover)).toBe(false);
  });

  it("given flamethrower, then returns false (damaging move, not reflectable)", () => {
    // Source: Showdown data/moves.ts -- flamethrower does NOT have reflectable flag
    expect(isReflectableMove(moveIds.flamethrower)).toBe(false);
  });

  it("given trick, then returns false (non-reflectable opponent-targeting status)", () => {
    // Source: Showdown data/moves.ts -- trick does NOT have reflectable flag
    expect(isReflectableMove(moveIds.trick)).toBe(false);
  });

  it("given transform, then returns false (non-reflectable opponent-targeting status)", () => {
    // Source: Showdown data/moves.ts -- transform does NOT have reflectable flag
    expect(isReflectableMove(moveIds.transform)).toBe(false);
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
      moveIds.spore,
      moveIds.sleepPowder,
      moveIds.thunderWave,
      moveIds.toxic,
      moveIds.willOWisp,
      moveIds.stunSpore,
      moveIds.glare,
      moveIds.hypnosis,
      moveIds.darkVoid,
      moveIds.sing,
    ];
    for (const move of expected) {
      expect(GEN5_REFLECTABLE_MOVES.has(move)).toBe(true);
    }
  });

  it("contains all stat-lowering reflectable moves", () => {
    // Source: Showdown data/moves.ts -- these all have reflectable: 1
    const expected = [
      moveIds.growl,
      moveIds.leer,
      moveIds.charm,
      moveIds.screech,
      moveIds.fakeTears,
      moveIds.tailWhip,
      moveIds.sandAttack,
      moveIds.smokescreen,
    ];
    for (const move of expected) {
      expect(GEN5_REFLECTABLE_MOVES.has(move)).toBe(true);
    }
  });

  it("contains entry hazard moves", () => {
    // Source: Showdown data/moves.ts -- hazards have reflectable: 1
    expect(GEN5_REFLECTABLE_MOVES.has(moveIds.spikes)).toBe(true);
    expect(GEN5_REFLECTABLE_MOVES.has(moveIds.stealthRock)).toBe(true);
    expect(GEN5_REFLECTABLE_MOVES.has(moveIds.toxicSpikes)).toBe(true);
  });

  it("does not contain non-reflectable opponent-targeting status moves", () => {
    // Source: Showdown data/moves.ts -- these do NOT have reflectable: 1
    const excluded = [
      moveIds.trick,
      moveIds.switcheroo,
      moveIds.transform,
      moveIds.sketch,
      moveIds.mimic,
      moveIds.painSplit,
      moveIds.memento,
      moveIds.psychUp,
      moveIds.heartSwap,
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
    const attacker = createSyntheticOnFieldPokemon({ ability: abilityIds.overgrow });
    const defender = createSyntheticOnFieldPokemon({
      ability: abilityIds.magicBounce,
      nickname: "Espeon",
    });
    const move = createCanonicalMove(moveIds.spore);
    const state = createBattleState();

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
    const attacker = createSyntheticOnFieldPokemon({ ability: abilityIds.static });
    const defender = createSyntheticOnFieldPokemon({
      ability: abilityIds.magicBounce,
      nickname: "Natu",
    });
    const move = createCanonicalMove(moveIds.thunderWave);
    const state = createBattleState();

    const result = shouldReflectMoveGen5(move, attacker, defender, state);

    expect(result).toEqual({
      reflected: true,
      messages: [getMagicBounceMessage(defender, move)],
    });
  });

  it("given defender with magic-bounce, when Flamethrower targets it, then move is NOT reflected (damaging)", () => {
    // Source: Showdown data/abilities.ts -- magicbounce only checks reflectable flag
    // Source: Bulbapedia -- Magic Bounce: "does not reflect damaging moves"
    const attacker = createSyntheticOnFieldPokemon({ ability: abilityIds.blaze });
    const defender = createSyntheticOnFieldPokemon({ ability: abilityIds.magicBounce });
    const move = createCanonicalMove(moveIds.flamethrower);
    const state = createBattleState();

    const result = shouldReflectMoveGen5(move, attacker, defender, state);

    expect(result).toBeNull();
    expect(isReflectableMove(move.id)).toBe(false);
    expect(defender.ability).toBe(abilityIds.magicBounce);
  });

  it("given defender WITHOUT magic-bounce, when Spore targets it, then move is NOT reflected", () => {
    // Guard test: magic-bounce only activates for the holder
    const attacker = createSyntheticOnFieldPokemon({ ability: abilityIds.overgrow });
    const defender = createSyntheticOnFieldPokemon({ ability: abilityIds.pressure });
    const move = createCanonicalMove(moveIds.spore);
    const state = createBattleState();

    const result = shouldReflectMoveGen5(move, attacker, defender, state);

    expect(result).toBeNull();
    expect(isReflectableMove(move.id)).toBe(true);
    expect(defender.ability).toBe(abilityIds.pressure);
  });

  it("given defender with magic-bounce and attacker with mold-breaker, when Spore targets it, then move is NOT reflected", () => {
    // Source: Showdown data/abilities.ts -- magicbounce has { breakable: 1 }
    //   meaning Mold Breaker variants bypass it
    // Source: Bulbapedia -- Mold Breaker: "ignores abilities of other Pokemon"
    const attacker = createSyntheticOnFieldPokemon({ ability: abilityIds.moldBreaker });
    const defender = createSyntheticOnFieldPokemon({ ability: abilityIds.magicBounce });
    const move = createCanonicalMove(moveIds.spore);
    const state = createBattleState();

    const result = shouldReflectMoveGen5(move, attacker, defender, state);

    expect(result).toBeNull();
    expect(attacker.ability).toBe(abilityIds.moldBreaker);
    expect(defender.ability).toBe(abilityIds.magicBounce);
  });

  it("given defender with magic-bounce and attacker with teravolt, when Toxic targets it, then move is NOT reflected", () => {
    // Source: Showdown data/abilities.ts -- teravolt is a Mold Breaker variant
    // Source: Bulbapedia -- Teravolt: "ignores target's ability"
    const attacker = createSyntheticOnFieldPokemon({ ability: abilityIds.teravolt });
    const defender = createSyntheticOnFieldPokemon({ ability: abilityIds.magicBounce });
    const move = createCanonicalMove(moveIds.toxic);
    const state = createBattleState();

    const result = shouldReflectMoveGen5(move, attacker, defender, state);

    expect(result).toBeNull();
    expect(attacker.ability).toBe(abilityIds.teravolt);
    expect(defender.ability).toBe(abilityIds.magicBounce);
  });

  it("given defender with magic-bounce and attacker with turboblaze, when Will-O-Wisp targets it, then move is NOT reflected", () => {
    // Source: Showdown data/abilities.ts -- turboblaze is a Mold Breaker variant
    // Source: Bulbapedia -- Turboblaze: "ignores target's ability"
    const attacker = createSyntheticOnFieldPokemon({ ability: abilityIds.turboblaze });
    const defender = createSyntheticOnFieldPokemon({ ability: abilityIds.magicBounce });
    const move = createCanonicalMove(moveIds.willOWisp);
    const state = createBattleState();

    const result = shouldReflectMoveGen5(move, attacker, defender, state);

    expect(result).toBeNull();
    expect(attacker.ability).toBe(abilityIds.turboblaze);
    expect(defender.ability).toBe(abilityIds.magicBounce);
  });

  it("given defender with magic-bounce who is semi-invulnerable (flying), when Taunt targets it, then move is NOT reflected", () => {
    // Source: Showdown data/abilities.ts -- magicbounce checks target.isSemiInvulnerable()
    const attacker = createSyntheticOnFieldPokemon({ ability: abilityIds.keenEye });
    const flyingVolatiles = new Map<string, { turnsLeft: number }>();
    flyingVolatiles.set(volatileIds.flying, { turnsLeft: 1 });
    const defender = createSyntheticOnFieldPokemon({
      ability: abilityIds.magicBounce,
      volatiles: flyingVolatiles,
    });
    const move = createCanonicalMove(moveIds.taunt);
    const state = createBattleState();

    const result = shouldReflectMoveGen5(move, attacker, defender, state);

    expect(result).toBeNull();
    expect(defender.volatileStatuses.has(volatileIds.flying)).toBe(true);
    expect(defender.ability).toBe(abilityIds.magicBounce);
  });

  it("given defender with magic-bounce, when a non-reflectable status move (Trick) targets it, then move is NOT reflected", () => {
    // Source: Showdown data/moves.ts -- trick does NOT have reflectable flag
    // Source: Bulbapedia -- Magic Bounce only reflects moves with the reflectable property
    const attacker = createSyntheticOnFieldPokemon({ ability: abilityIds.frisk });
    const defender = createSyntheticOnFieldPokemon({ ability: abilityIds.magicBounce });
    const move = createCanonicalMove(moveIds.trick);
    const state = createBattleState();

    const result = shouldReflectMoveGen5(move, attacker, defender, state);

    expect(result).toBeNull();
    expect(isReflectableMove(move.id)).toBe(false);
    expect(defender.ability).toBe(abilityIds.magicBounce);
  });

  it("given defender with magic-bounce, when Stealth Rock targets it, then move is reflected (entry hazard)", () => {
    // Source: Showdown data/moves.ts -- stealthrock has reflectable: 1
    // Source: Bulbapedia -- Magic Bounce reflects Stealth Rock
    const attacker = createSyntheticOnFieldPokemon({ ability: abilityIds.sturdy });
    const defender = createSyntheticOnFieldPokemon({
      ability: abilityIds.magicBounce,
      nickname: "Xatu",
    });
    const move = createCanonicalMove(moveIds.stealthRock);
    const state = createBattleState();

    const result = shouldReflectMoveGen5(move, attacker, defender, state);

    expect(result).toEqual({
      reflected: true,
      messages: [getMagicBounceMessage(defender, move)],
    });
  });

  it("given defender with magic-bounce, when Roar targets it, then move is reflected", () => {
    // Source: Showdown data/moves.ts -- roar has reflectable: 1
    // Source: Bulbapedia -- Magic Bounce reflects Roar
    const attacker = createSyntheticOnFieldPokemon({ ability: abilityIds.intimidate });
    const defender = createSyntheticOnFieldPokemon({ ability: abilityIds.magicBounce });
    const move = createCanonicalMove(moveIds.roar);
    const state = createBattleState();

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
    const attacker = createSyntheticOnFieldPokemon({ ability: abilityIds.chlorophyll });
    const defender = createSyntheticOnFieldPokemon({
      ability: abilityIds.magicBounce,
      nickname: "Espeon",
    });
    const move = createCanonicalMove(moveIds.toxic);
    const state = createBattleState();

    const result = shouldReflectMoveGen5(move, attacker, defender, state);

    expect(result).toEqual({
      reflected: true,
      messages: [getMagicBounceMessage(defender, move)],
    });
  });

  it("given defender with magic-bounce but no nickname, reflection message uses speciesId", () => {
    // Verify fallback to speciesId when nickname is null
    const attacker = createSyntheticOnFieldPokemon({ ability: abilityIds.chlorophyll });
    const defender = createSyntheticOnFieldPokemon({
      ability: abilityIds.magicBounce,
      nickname: null,
      speciesId: 196,
    });
    const move = createCanonicalMove(moveIds.encore);
    const state = createBattleState();

    const result = shouldReflectMoveGen5(move, attacker, defender, state);

    expect(result).toEqual({
      reflected: true,
      messages: [getMagicBounceMessage(defender, move)],
    });
  });
});
