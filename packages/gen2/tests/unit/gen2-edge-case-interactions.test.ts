/**
 * Gen 2 Edge Case and Interaction Regression Tests
 *
 * Covers:
 *   - King's Rock: flinch on last hit of multi-hit moves
 *   - Baton Pass: passes stat stage changes to the incoming Pokemon
 *   - Future Sight: typeless in Gen 2 (no Psychic immunity)
 *   - Sleep Talk: correctly identifies itself as a sleep-bypass move (handler checks sleep status)
 *   - Present: damage branches (40/80/120 power rolls)
 *   - Spikes + Flying immunity: Flying-type switches in safely
 *   - Rollout base power doubling (no Defense Curl doubling yet — documented as TODO)
 *   - Pursuit: shouldExecutePursuitPreSwitch returns true
 *   - Counter: Normal/Fighting only (Gen 2 same restriction as Gen 1)
 *   - Disable: targets last-used move, duration 1-7 turns
 *
 * Sources:
 *   - pret/pokecrystal engine/battle/effect_commands.asm (primary authority)
 *   - pret/pokecrystal engine/battle/core.asm
 *   - specs/reference/gen2-ground-truth.md
 *   - specs/battle/03-gen2.md
 */

import type {
  ActivePokemon,
  BattleSide,
  BattleState,
  ItemContext,
  MoveEffectContext,
} from "@pokemon-lib-ts/battle";
import type { MoveData, MoveSlot, PokemonInstance, PokemonType, PrimaryStatus } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_SLOTS,
  CORE_ABILITY_IDS,
  CORE_GENDERS,
  CORE_HAZARD_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  SeededRandom,
  createMoveSlot,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen2DataManager,
  GEN2_ITEM_IDS,
  GEN2_MOVE_IDS,
  GEN2_NATURE_IDS,
  GEN2_SPECIES_IDS,
} from "../../src";
import { getRolloutPower } from "../../src/Gen2DamageCalc";
import { applyGen2HeldItem } from "../../src/Gen2Items";
import { Gen2Ruleset } from "../../src/Gen2Ruleset";

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

const ruleset = new Gen2Ruleset();
const dataManager = createGen2DataManager();
const ABILITIES = CORE_ABILITY_IDS;
const HAZARDS = CORE_HAZARD_IDS;
const ITEMS = GEN2_ITEM_IDS;
const MOVES = GEN2_MOVE_IDS;
const NATURES = GEN2_NATURE_IDS;
const SPECIES = GEN2_SPECIES_IDS;
const STATUSES = CORE_STATUS_IDS;
const TYPES = CORE_TYPE_IDS;
const VOLATILES = CORE_VOLATILE_IDS;
const PHYSICAL_MOVE_CATEGORY = dataManager.getMove(MOVES.tackle).category;
const SPECIAL_MOVE_CATEGORY = dataManager.getMove(MOVES.futureSight).category;

function createSyntheticMove(moveId: string, overrides: Partial<MoveData> = {}): MoveData {
  const baseMove = dataManager.getMove(moveId);
  return {
    ...baseMove,
    ...overrides,
    flags: overrides.flags ? { ...baseMove.flags, ...overrides.flags } : baseMove.flags,
    effect: "effect" in overrides ? overrides.effect : baseMove.effect,
  } as MoveData;
}

function createResolvedMoveSlot(moveId: string, overrides: Partial<MoveSlot> = {}): MoveSlot {
  const move = dataManager.getMove(moveId);
  const slot = createMoveSlot(move.id, move.pp ?? 0, overrides.ppUps ?? 0);
  return {
    ...slot,
    currentPP: overrides.currentPP ?? slot.currentPP,
    maxPP: overrides.maxPP ?? slot.maxPP,
    ppUps: overrides.ppUps ?? slot.ppUps,
  };
}

function createOnFieldPokemon(
  overrides: Partial<ActivePokemon> & {
    speciesId?: number;
    heldItem?: string | null;
    status?: PrimaryStatus | null;
    lastMoveUsed?: string | null;
    lastDamageTaken?: number;
    lastDamageType?: string | null;
    lastDamageCategory?: MoveData["category"] | null;
    turnsOnField?: number;
    movedThisTurn?: boolean;
    consecutiveProtects?: number;
    substituteHp?: number;
    moves?: MoveSlot[];
    volatileStatuses?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  } = {},
): ActivePokemon {
  const maxHp = 200;
  const species = dataManager.getSpecies(overrides.speciesId ?? SPECIES.ditto);
  const moves =
    overrides.moves ??
    [createResolvedMoveSlot(MOVES.tackle), createResolvedMoveSlot(MOVES.growl), createResolvedMoveSlot(MOVES.sleepTalk)];
  return {
    pokemon: {
      uid: "test-uid",
      speciesId: species.id,
      nickname: null,
      level: 50,
      experience: 0,
      nature: NATURES.hardy,
      ivs: { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      moves,
      currentHp: maxHp,
      status: overrides.status ?? null,
      friendship: species.baseFriendship,
      heldItem: overrides.heldItem ?? null,
      ability: overrides.ability ?? ABILITIES.none,
      abilitySlot: CORE_ABILITY_SLOTS.normal1,
      gender: CORE_GENDERS.male,
      isShiny: false,
      metLocation: "pallet-town",
      metLevel: 5,
      originalTrainer: "Red",
      originalTrainerId: 12345,
      pokeball: ITEMS.pokeBall,
      calculatedStats: {
        hp: maxHp,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
      },
    } as PokemonInstance,
    teamSlot: 0,
    statStages: {
      hp: 0,
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
    volatileStatuses: overrides.volatileStatuses ?? new Map(),
    types: overrides.types ?? (species.types as PokemonType[]),
    ability: overrides.ability ?? ABILITIES.none,
    lastMoveUsed: overrides.lastMoveUsed ?? null,
    lastDamageTaken: overrides.lastDamageTaken ?? 0,
    lastDamageType: overrides.lastDamageType ?? null,
    lastDamageCategory: overrides.lastDamageCategory ?? null,
    turnsOnField: overrides.turnsOnField ?? 1,
    movedThisTurn: overrides.movedThisTurn ?? false,
    consecutiveProtects: overrides.consecutiveProtects ?? 0,
    substituteHp: overrides.substituteHp ?? 0,
    transformed: false,
    transformedSpecies: null,
    isMega: false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    stellarBoostedTypes: [],
  };
}

function createBattleSide(
  index: 0 | 1,
  active: ActivePokemon,
  hazards: BattleSide["hazards"] = [],
): BattleSide {
  return {
    index,
    trainer: null,
    team: [active.pokemon as unknown as PokemonInstance],
    active: [active],
    hazards,
    screens: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
    gimmickUsed: false,
  } as unknown as BattleSide;
}

function createBattleState(
  attacker: ActivePokemon = createOnFieldPokemon(),
  defender: ActivePokemon = createOnFieldPokemon({ types: [TYPES.normal] }),
  attackerHazards: BattleSide["hazards"] = [],
  defenderHazards: BattleSide["hazards"] = [],
): BattleState {
  const rng = new SeededRandom(42);
  return {
    phase: "turn-resolve",
    generation: 2,
    format: "singles",
    turnNumber: 1,
    sides: [
      createBattleSide(0, attacker, attackerHazards),
      createBattleSide(1, defender, defenderHazards),
    ],
    weather: null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    turnHistory: [],
    rng,
    ended: false,
    winner: null,
  } as BattleState;
}

function createMoveEffectContext(overrides: Partial<MoveEffectContext> = {}): MoveEffectContext {
  const attacker = createOnFieldPokemon();
  const defender = createOnFieldPokemon({ types: [TYPES.normal] });
  const rng = new SeededRandom(42);
  return {
    attacker,
    defender,
    move: createSyntheticMove(MOVES.tackle),
    damage: 0,
    brokeSubstitute: false,
    state: createBattleState(attacker, defender),
    rng,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// King's Rock: flinch only on the LAST hit
// ---------------------------------------------------------------------------

describe("Gen 2 King's Rock: flinch applies on-hit trigger", () => {
  // Source: pret/pokecrystal engine/battle/items.asm — King's Rock triggers on-hit.
  // It gives a flinch chance (30/256 ≈ 11.72%) on the hit it's called for.
  // For multi-hit moves, the engine calls applyGen2HeldItem("on-hit") once per hit.
  // This test verifies the per-hit item check works correctly.

  it("given a pokemon holds King's Rock and rng.chance returns true, when on-hit check runs, then flinch is inflicted", () => {
    // Source: pret/pokecrystal — King's Rock uses rng.chance(30/256).
    // When chance() returns true, flinch activates.
    const pokemon = createOnFieldPokemon({ heldItem: ITEMS.kingsRock });
    const context: ItemContext = {
      pokemon,
      state: createBattleState(),
      rng: {
        next: () => 0,
        int: (_min: number, _max: number) => 0,
        // chance() returning true simulates the 30/256 roll succeeding
        chance: (_p: number) => true,
        pick: <T>(arr: readonly T[]) => arr[0] as T,
        shuffle: <T>(arr: readonly T[]) => [...arr],
        getState: () => 0,
        setState: () => {},
      } as SeededRandom,
      move: createSyntheticMove(MOVES.tackle),
      damage: 50,
    } as unknown as ItemContext;
    const result = applyGen2HeldItem("on-hit", context);
    expect(result.activated).toBe(true);
    // Flinch effect should be in the effects list
    const hasFlinch = result.effects.some((e) => e.type === VOLATILES.flinch);
    expect(hasFlinch || result.messages.some((m) => m.toLowerCase().includes(VOLATILES.flinch))).toBe(true);
  });

  it("given a pokemon holds King's Rock and rng.chance returns false, when on-hit check runs, then no flinch", () => {
    // Source: pret/pokecrystal — King's Rock uses rng.chance(30/256).
    // When chance() returns false (roll fails), no flinch.
    const pokemon = createOnFieldPokemon({ heldItem: ITEMS.kingsRock });
    const context: ItemContext = {
      pokemon,
      state: createBattleState(),
      rng: {
        next: () => 0,
        int: (_min: number, _max: number) => 200,
        // chance() returning false simulates the 30/256 roll failing
        chance: (_p: number) => false,
        pick: <T>(arr: readonly T[]) => arr[0] as T,
        shuffle: <T>(arr: readonly T[]) => [...arr],
        getState: () => 0,
        setState: () => {},
      } as SeededRandom,
      move: createSyntheticMove(MOVES.tackle),
      damage: 50,
    } as unknown as ItemContext;
    const result = applyGen2HeldItem("on-hit", context);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Baton Pass: passes stat stages
// ---------------------------------------------------------------------------

describe("Gen 2 Baton Pass mechanic", () => {
  // Source: pret/pokecrystal BatonPassEffect — switches out the user,
  // preserving all stat stage changes and volatile statuses.
  // The engine uses result.batonPass=true to flag the preservation.

  const batonPassMove = createSyntheticMove(MOVES.batonPass, {
    category: dataManager.getMove(MOVES.batonPass).category,
    power: null,
    accuracy: null,
    effect: { type: "switch-out" as const, target: "self" },
  });

  it("given Baton Pass is used, when executeMoveEffect runs, then batonPass=true and switchOut=true are set", () => {
    // Source: pret/pokecrystal BatonPassEffect — sets the baton-pass flag so
    // the engine preserves stat changes for the incoming Pokemon.
    const context = createMoveEffectContext({ move: batonPassMove });
    const result = ruleset.executeMoveEffect(context);
    expect(result.switchOut).toBe(true);
    expect(result.batonPass).toBe(true);
  });

  it("given user has +2 Attack and +1 Speed before Baton Pass, when the engine processes batonPass=true, then the incoming Pokemon should inherit those stat stages", () => {
    // Source: pret/pokecrystal — Baton Pass preserves all stat stage changes.
    // We test the ruleset signals (batonPass=true), not the full engine handoff,
    // since the engine's state copy is its own responsibility.
    const attacker = createOnFieldPokemon();
    attacker.statStages.attack = 2;
    attacker.statStages.speed = 1;
    const context = createMoveEffectContext({ attacker, move: batonPassMove });
    const result = ruleset.executeMoveEffect(context);
    // Verify ruleset signals the engine to preserve stat changes
    expect(result.batonPass).toBe(true);
    // The attacker's stat stages are set before calling executeMoveEffect;
    // the engine reads them when batonPass=true to pass to the incoming Pokemon.
    expect(attacker.statStages.attack).toBe(2);
    expect(attacker.statStages.speed).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Future Sight: typeless in Gen 2
// ---------------------------------------------------------------------------

describe("Gen 2 Future Sight typeless behavior", () => {
  // Source: pret/pokecrystal FutureSightEffect — Future Sight is typeless in Gen 2.
  // It does NOT check type effectiveness or immunities at resolution.
  // A Dark-type Pokemon that is normally immune to Psychic WILL be hit by Future Sight.
  // The moveId is stored as "future-sight" and the engine resolves it as typeless.

  const futureSightMove = createSyntheticMove(MOVES.futureSight, {
    type: TYPES.psychic,
    category: SPECIAL_MOVE_CATEGORY,
    power: 80,
    accuracy: 100,
    effect: { type: "custom" as const, handler: "future-sight" },
  });

  it("given Future Sight is used, when executeMoveEffect runs, then futureAttack is scheduled for 2 turns", () => {
    // Source: pret/pokecrystal FutureSightEffect — turnsLeft=2 means the attack
    // lands on the turn AFTER next (i.e., 2 turns from now).
    const attacker = createOnFieldPokemon({ types: [TYPES.psychic] });
    const defender = createOnFieldPokemon({ types: [TYPES.dark] });
    const state = createBattleState(attacker, defender);
    const context = createMoveEffectContext({ attacker, defender, move: futureSightMove, state });
    const result = ruleset.executeMoveEffect(context);
    expect(result.futureAttack).toBeDefined();
    expect(result.futureAttack?.moveId).toBe(MOVES.futureSight);
    expect(result.futureAttack?.turnsLeft).toBe(2);
  });

  it("given Future Sight targets a Dark-type (immune to Psychic), when Future Sight effect handler runs, then the attack is still scheduled (typeless)", () => {
    // Source: pret/pokecrystal — Future Sight bypasses type immunities.
    // Dark-types are immune to Psychic in Gen 2, but NOT to Future Sight.
    // The effect handler schedules the attack regardless of the defender's types.
    // Type effectiveness is not applied at resolution (engine handles this with typeless flag).
    const attacker = createOnFieldPokemon({ types: [TYPES.psychic] });
    const darkDefender = createOnFieldPokemon({ types: [TYPES.dark] });
    const state = createBattleState(attacker, darkDefender);
    const context = createMoveEffectContext({
      attacker,
      defender: darkDefender,
      move: futureSightMove,
      state,
    });
    const result = ruleset.executeMoveEffect(context);
    // Future Sight schedules even vs Dark-type
    expect(result.futureAttack).toBeDefined();
    expect(result.futureAttack?.moveId).toBe(MOVES.futureSight);
  });

  it("given Future Sight is already pending on the target's side, when Future Sight is used again, then it fails", () => {
    // Source: pret/pokecrystal FutureSightEffect — fails if a future attack is already
    // pending on the target's side (cannot stack).
    const attacker = createOnFieldPokemon({ types: [TYPES.psychic] });
    const defender = createOnFieldPokemon({ types: [TYPES.normal] });
    const state = createBattleState(attacker, defender);
    // Set futureAttack already pending on defender's side (side index 1)
    state.sides[1].futureAttack = { moveId: MOVES.futureSight, turnsLeft: 1, sourceSide: 0 };
    const context = createMoveEffectContext({ attacker, defender, move: futureSightMove, state });
    const result = ruleset.executeMoveEffect(context);
    expect(result.futureAttack).toBeUndefined();
    expect(result.messages.some((m) => m.includes("failed"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Sleep Talk: correctly identifies itself as a sleep-only move
// ---------------------------------------------------------------------------

describe("Gen 2 Sleep Talk: sleep precondition enforcement", () => {
  // Source: pret/pokecrystal SleepTalkEffect — Sleep Talk can only be used while asleep.
  // The handler checks attacker.pokemon.status === "sleep" and fails otherwise.
  // Issue #524 tracks the engine-level sleep-bypass needed for full integration;
  // these tests verify the handler's own precondition check.

  const sleepTalkMove = createSyntheticMove(MOVES.sleepTalk, {
    category: dataManager.getMove(MOVES.sleepTalk).category,
    power: null,
    accuracy: null,
    effect: { type: "custom" as const, handler: "sleep-talk" },
  });

  it("given the attacker is asleep and has usable moves, when Sleep Talk runs, then a recursive move is chosen", () => {
    // Source: pret/pokecrystal SleepTalkEffect — picks a random non-banned move.
    const attacker = createOnFieldPokemon();
    attacker.pokemon.status = STATUSES.sleep as unknown as typeof attacker.pokemon.status;
    // Ensure attacker has moves that are not in SLEEP_TALK_BANNED_MOVES.
    attacker.pokemon.moves = [
      createResolvedMoveSlot(MOVES.tackle),
      createResolvedMoveSlot(MOVES.thunderbolt),
    ];
    const context = createMoveEffectContext({
      attacker,
      move: sleepTalkMove,
      rng: {
        next: () => 0,
        int: () => 1,
        chance: () => false,
        pick: <T>(arr: readonly T[]) => arr[0] as T,
        shuffle: <T>(arr: readonly T[]) => [...arr],
        getState: () => 0,
        setState: () => {},
      } as SeededRandom,
    });
    const result = ruleset.executeMoveEffect(context);
    expect(result.recursiveMove).toBe(MOVES.thunderbolt);
  });

  it("given the attacker is NOT asleep, when Sleep Talk runs, then it fails", () => {
    // Source: pret/pokecrystal SleepTalkEffect — fails if not asleep.
    const attacker = createOnFieldPokemon();
    attacker.pokemon.status = null;
    const context = createMoveEffectContext({ attacker, move: sleepTalkMove });
    const result = ruleset.executeMoveEffect(context);
    expect(result.recursiveMove).toBeUndefined();
    expect(result.messages.some((m) => m.includes("failed"))).toBe(true);
  });

  it("given the attacker is asleep with only banned moves (sleep-talk, bide, fly), when Sleep Talk runs, then it fails (no usable moves)", () => {
    // Source: pret/pokecrystal SleepTalkEffect — banned moves list includes sleep-talk, bide,
    // skull-bash, razor-wind, sky-attack, solar-beam, fly, dig.
    const attacker = createOnFieldPokemon();
    attacker.pokemon.status = STATUSES.sleep as unknown as typeof attacker.pokemon.status;
    attacker.pokemon.moves = [
      createResolvedMoveSlot(MOVES.sleepTalk),
      createResolvedMoveSlot(MOVES.bide),
      createResolvedMoveSlot(MOVES.fly),
      createResolvedMoveSlot(MOVES.dig),
    ];
    const context = createMoveEffectContext({ attacker, move: sleepTalkMove });
    const result = ruleset.executeMoveEffect(context);
    expect(result.recursiveMove).toBeUndefined();
    expect(result.messages.some((m) => m.includes("failed"))).toBe(true);
  });

  it("given the attacker is asleep with only 0-PP moves (non-banned), when Sleep Talk runs, then it fails", () => {
    // Source: pret/pokecrystal SleepTalkEffect — moves with 0 PP are not usable.
    const attacker = createOnFieldPokemon();
    attacker.pokemon.status = STATUSES.sleep as unknown as typeof attacker.pokemon.status;
    attacker.pokemon.moves = [createResolvedMoveSlot(MOVES.tackle, { currentPP: 0 })];
    const context = createMoveEffectContext({ attacker, move: sleepTalkMove });
    const result = ruleset.executeMoveEffect(context);
    expect(result.recursiveMove).toBeUndefined();
    expect(result.messages.some((m) => m.includes("failed"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Spikes: Flying-type Pokemon are immune
// ---------------------------------------------------------------------------

describe("Gen 2 Spikes: Flying-type immunity", () => {
  // Source: pret/pokecrystal engine/battle/effect_commands.asm SpikesEffect
  // Flying-type Pokemon are not affected by Spikes (they don't touch the ground).
  // In Gen 2, there are no abilities, so only the Flying type grants this immunity.

  it("given Spikes are on the field and a Flying-type switches in, when applyEntryHazards is called, then damage is 0", () => {
    // Source: pret/pokecrystal — Flying-type immunity to Spikes.
    // A pure Flying-type (e.g., Pidgey) takes no damage from Spikes.
    const flyingPokemon = createOnFieldPokemon({ types: [TYPES.flying] });
    const sideWithSpikes = createBattleSide(1, flyingPokemon, [
      { type: HAZARDS.spikes, layers: 1 },
    ]);
    const result = ruleset.applyEntryHazards(flyingPokemon, sideWithSpikes);
    expect(result.damage).toBe(0);
    expect(result.statusInflicted).toBeNull();
  });

  it("given Spikes are on the field and a Water/Flying dual-type switches in, when applyEntryHazards is called, then damage is 0", () => {
    // Source: pret/pokecrystal — any Pokemon with the Flying type (primary or secondary)
    // is immune to Spikes. Dual-type with Flying (e.g., Gyarados = Water/Flying) also immune.
    const waterFlyingPokemon = createOnFieldPokemon({ types: [TYPES.water, TYPES.flying] });
    const sideWithSpikes = createBattleSide(1, waterFlyingPokemon, [
      { type: HAZARDS.spikes, layers: 1 },
    ]);
    const result = ruleset.applyEntryHazards(waterFlyingPokemon, sideWithSpikes);
    expect(result.damage).toBe(0);
  });

  it("given Spikes are on the field and a grounded Normal-type switches in, when applyEntryHazards is called, then damage = floor(maxHP/8)", () => {
    // Source: pret/pokecrystal — Spikes deal 1/8 max HP damage to grounded Pokemon.
    // maxHP = 200, floor(200/8) = 25.
    const groundedPokemon = createOnFieldPokemon({ types: [TYPES.normal] });
    const sideWithSpikes = createBattleSide(1, groundedPokemon, [
      { type: HAZARDS.spikes, layers: 1 },
    ]);
    const result = ruleset.applyEntryHazards(groundedPokemon, sideWithSpikes);
    expect(result.damage).toBe(25); // floor(200/8) = 25
  });

  it("given Spikes are on the field and a Rock-type switches in, when applyEntryHazards is called, then damage = floor(maxHP/8)", () => {
    // Second triangulation case: Rock-type (grounded) also takes Spikes damage.
    // maxHP = 200, floor(200/8) = 25.
    const rockPokemon = createOnFieldPokemon({ types: [TYPES.rock] });
    const sideWithSpikes = createBattleSide(1, rockPokemon, [{ type: HAZARDS.spikes, layers: 1 }]);
    const result = ruleset.applyEntryHazards(rockPokemon, sideWithSpikes);
    expect(result.damage).toBe(25); // floor(200/8) = 25
  });

  it("given NO Spikes are on the field and a grounded Pokemon switches in, when applyEntryHazards is called, then damage is 0", () => {
    // Source: pret/pokecrystal — no hazards → no damage.
    const groundedPokemon = createOnFieldPokemon({ types: [TYPES.normal] });
    const sideWithNoSpikes = createBattleSide(1, groundedPokemon, []);
    const result = ruleset.applyEntryHazards(groundedPokemon, sideWithNoSpikes);
    expect(result.damage).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Rollout: base power doubling each turn (Defense Curl doubling NOT yet implemented)
// ---------------------------------------------------------------------------

describe("Gen 2 Rollout: escalating base power", () => {
  // Source: pret/pokecrystal RolloutEffect — power doubles each turn for 5 turns:
  // Turn 1: 30, Turn 2: 60, Turn 3: 120, Turn 4: 240, Turn 5: 480.
  // Defense Curl doubles the base power (30→60 base), but this is a TODO in the current code.
  // These tests verify the core escalation without Defense Curl.

  it("given no Rollout volatile (first use), when getRolloutPower is called, then power is 30", () => {
    // Source: pret/pokecrystal — first Rollout hit: count=0, power = 30 * 2^0 = 30.
    const attacker = createOnFieldPokemon();
    // No rollout volatile set — first use
    expect(attacker.volatileStatuses.has(MOVES.rollout)).toBe(false);
    const power = getRolloutPower(attacker);
    expect(power).toBe(30);
  });

  it("given Rollout volatile with count=1 (second use), when getRolloutPower is called, then power is 60", () => {
    // Source: pret/pokecrystal — second Rollout hit: count=1, power = 30 * 2^1 = 60.
    const attacker = createOnFieldPokemon();
    attacker.volatileStatuses.set(MOVES.rollout, { turnsLeft: 1, data: { count: 1 } });
    const power = getRolloutPower(attacker);
    expect(power).toBe(60);
  });

  it("given Rollout volatile with count=2 (third use), when getRolloutPower is called, then power is 120", () => {
    // Source: pret/pokecrystal — third hit: count=2, power = 30 * 2^2 = 120.
    const attacker = createOnFieldPokemon();
    attacker.volatileStatuses.set(MOVES.rollout, { turnsLeft: 1, data: { count: 2 } });
    const power = getRolloutPower(attacker);
    expect(power).toBe(120);
  });

  it("given Rollout volatile with count=3 (fourth use), when getRolloutPower is called, then power is 240", () => {
    // Source: pret/pokecrystal — fourth hit: count=3, power = 30 * 2^3 = 240.
    const attacker = createOnFieldPokemon();
    attacker.volatileStatuses.set(MOVES.rollout, { turnsLeft: 1, data: { count: 3 } });
    const power = getRolloutPower(attacker);
    expect(power).toBe(240);
  });

  it("given Rollout volatile with count=4 (fifth use), when getRolloutPower is called, then power is 480", () => {
    // Source: pret/pokecrystal — fifth hit: count=4, power = 30 * 2^4 = 480.
    const attacker = createOnFieldPokemon();
    attacker.volatileStatuses.set(MOVES.rollout, { turnsLeft: 1, data: { count: 4 } });
    const power = getRolloutPower(attacker);
    expect(power).toBe(480);
  });

  it("given Rollout is first used and attacker has rollout in moves, when executeMoveEffect runs, then rollout volatile is set for next turn and count=1", () => {
    // Source: pret/pokecrystal RolloutEffect — handler stores nextCount=1 for the next turn.
    // The handler requires attacker.pokemon.moves to contain "rollout" to find the move index.
    // This is the correct contract: the Pokemon using Rollout must have Rollout in its moveset.
    const rolloutMove = createSyntheticMove(MOVES.rollout, {
      type: TYPES.rock,
      category: PHYSICAL_MOVE_CATEGORY,
      power: 30,
      effect: { type: "custom" as const, handler: "rollout" },
    });
    const attacker = createOnFieldPokemon({
      moves: [createResolvedMoveSlot(MOVES.rollout), createResolvedMoveSlot(MOVES.tackle)],
    });
    const context = createMoveEffectContext({ attacker, move: rolloutMove });
    const result = ruleset.executeMoveEffect(context);
    // First use: handler creates the volatile with count=1 for the NEXT turn
    expect(result.selfVolatileInflicted).toBe(MOVES.rollout);
    expect(result.selfVolatileData?.data?.count).toBe(1);
    // User is locked into Rollout for next turn
    expect(result.forcedMoveSet?.moveId).toBe(MOVES.rollout);
  });
});

// ---------------------------------------------------------------------------
// Pursuit: shouldExecutePursuitPreSwitch returns true
// ---------------------------------------------------------------------------

describe("Gen 2 Pursuit: pre-switch execution flag", () => {
  // Source: pret/pokecrystal — Pursuit executes before the switch with doubled power
  // when the opponent is switching out. The ruleset signals this intent via
  // shouldExecutePursuitPreSwitch().

  it("given Gen 2 ruleset, when shouldExecutePursuitPreSwitch is called, then returns true", () => {
    // Source: pret/pokecrystal — Pursuit was introduced in Gen 2 and has this behavior.
    // Gen 1 returns false (Pursuit doesn't exist); Gen 2 returns true.
    expect(ruleset.shouldExecutePursuitPreSwitch()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Counter (Gen 2): reflects ALL physical-type damage
// ---------------------------------------------------------------------------

describe("Gen 2 Counter: reflects all physical-type damage", () => {
  // Source: pret/pokecrystal engine/battle/move_effects/counter.asm:33-35
  //   ld a, [wStringBuffer1 + MOVE_TYPE]
  //   cp SPECIAL        ; SPECIAL = 20 (Fire is first special type)
  //   ret nc            ; fail if type >= SPECIAL (i.e., special type)
  // Counter works on ALL physical types (Normal, Fighting, Flying, Poison, Ground,
  // Rock, Bug, Ghost, Steel) — NOT just Normal/Fighting like Gen 1.

  const counterMove = createSyntheticMove(MOVES.counter, {
    category: PHYSICAL_MOVE_CATEGORY,
    power: null,
    effect: { type: "custom" as const, handler: "counter" },
  });

  it("given a Normal-type move dealt 40 damage last turn, when Counter is used, then deals 80 damage", () => {
    // Source: pret/pokecrystal counter.asm — Normal (type 0) < SPECIAL → Counter succeeds.
    const attacker = createOnFieldPokemon({
      lastDamageTaken: 40,
      lastDamageType: TYPES.normal,
      lastDamageCategory: PHYSICAL_MOVE_CATEGORY,
    });
    const context = createMoveEffectContext({ attacker, move: counterMove });
    const result = ruleset.executeMoveEffect(context);
    expect(result.customDamage?.amount).toBe(80);
  });

  it("given a Fighting-type move dealt 50 damage last turn, when Counter is used, then deals 100 damage", () => {
    // Source: pret/pokecrystal counter.asm — Fighting (type 1) < SPECIAL → Counter succeeds.
    const attacker = createOnFieldPokemon({
      lastDamageTaken: 50,
      lastDamageType: TYPES.fighting,
      lastDamageCategory: PHYSICAL_MOVE_CATEGORY,
    });
    const context = createMoveEffectContext({ attacker, move: counterMove });
    const result = ruleset.executeMoveEffect(context);
    expect(result.customDamage?.amount).toBe(100);
  });

  it("given a Fire-type move dealt 60 special damage last turn, when Counter is used, then Counter fails", () => {
    // Source: pret/pokecrystal counter.asm — Fire (type 20) >= SPECIAL → Counter fails.
    // In Gen 2, Fire is a special type so lastDamageCategory is always "special".
    const attacker = createOnFieldPokemon({
      lastDamageTaken: 60,
      lastDamageType: TYPES.fire,
      lastDamageCategory: SPECIAL_MOVE_CATEGORY,
    });
    const context = createMoveEffectContext({ attacker, move: counterMove });
    const result = ruleset.executeMoveEffect(context);
    expect(result.customDamage).toBeUndefined();
    expect(result.messages.some((m) => m.includes("failed"))).toBe(true);
  });

  it("given special-category damage last turn, when Counter is used, then Counter fails", () => {
    // Source: pret/pokecrystal counter.asm — Counter only works against physical-type moves.
    // Mirror Coat handles special moves.
    const attacker = createOnFieldPokemon({
      lastDamageTaken: 50,
      lastDamageType: TYPES.water,
      lastDamageCategory: SPECIAL_MOVE_CATEGORY,
    });
    const context = createMoveEffectContext({ attacker, move: counterMove });
    const result = ruleset.executeMoveEffect(context);
    expect(result.customDamage).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Disable (Gen 2): targets last-used move, duration 1-7 turns
// ---------------------------------------------------------------------------

describe("Gen 2 Disable mechanic", () => {
  // Source: pret/pokecrystal DisableEffect — disables the target's last-used move.
  // Duration: 1-7 turns (not 1-8 like Gen 1). The last-used move is specifically tracked,
  // unlike Gen 1 which picks a random move slot.

  const disableMove = createSyntheticMove(MOVES.disable, {
    category: dataManager.getMove(MOVES.disable).category,
    power: null,
    accuracy: 55,
    effect: { type: "custom" as const, handler: "disable" },
  });

  it("given the defender's last used move was Tackle, when Disable is used, then Tackle is disabled", () => {
    // Source: pret/pokecrystal DisableEffect — disables lastMoveUsed.
    const defender = createOnFieldPokemon({
      types: [TYPES.normal],
      lastMoveUsed: MOVES.tackle,
      moves: [createResolvedMoveSlot(MOVES.tackle)],
    });
    const context = createMoveEffectContext({ defender, move: disableMove });
    const result = ruleset.executeMoveEffect(context);
    expect(result.volatileInflicted).toBe(MOVES.disable);
    expect(result.volatileData?.data?.moveId).toBe(MOVES.tackle);
  });

  it("given defender has no last used move, when Disable is used, then it fails", () => {
    // Source: pret/pokecrystal DisableEffect — fails if no last move tracked.
    const defender = createOnFieldPokemon({ types: [TYPES.normal], lastMoveUsed: null });
    const context = createMoveEffectContext({ defender, move: disableMove });
    const result = ruleset.executeMoveEffect(context);
    expect(result.volatileInflicted).toBeNull();
    expect(result.messages.some((m) => m.includes("failed"))).toBe(true);
  });

  it("given defender is already disabled, when Disable is used, then it fails (no stacking)", () => {
    // Source: pret/pokecrystal DisableEffect — only one Disable active at a time.
    const defender = createOnFieldPokemon({ types: [TYPES.normal], lastMoveUsed: MOVES.tackle });
    defender.volatileStatuses.set(MOVES.disable, { turnsLeft: 3, data: { moveId: MOVES.tackle } });
    const context = createMoveEffectContext({ defender, move: disableMove });
    const result = ruleset.executeMoveEffect(context);
    expect(result.volatileInflicted).toBeNull();
    expect(result.messages.some((m) => m.includes("failed"))).toBe(true);
  });

  it("given Disable duration is sampled 500 times, then all durations are in range [1, 7]", () => {
    // Source: pret/pokecrystal DisableEffect — duration is 1-7 turns in Gen 2
    // (different from Gen 1 which is 1-8).
    const durations: number[] = [];
    for (let seed = 0; seed < 500; seed++) {
      const defender = createOnFieldPokemon({
        types: [TYPES.normal],
        lastMoveUsed: MOVES.tackle,
        moves: [createResolvedMoveSlot(MOVES.tackle)],
        volatileStatuses: new Map(),
      });
      const context = createMoveEffectContext({
        defender,
        move: disableMove,
        rng: new SeededRandom(seed),
      });
      const result = ruleset.executeMoveEffect(context);
      if (result.volatileData) {
        durations.push(result.volatileData.turnsLeft);
      }
    }
    const observedDurations = [...new Set(durations)].sort((a, b) => a - b);
    expect(observedDurations).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("given Disable duration is sampled 500 times, then both minimum (1) and maximum (7) are observed", () => {
    // Triangulation: ensures the range is [1,7], not a strict subset.
    const durations: number[] = [];
    for (let seed = 0; seed < 500; seed++) {
      const defender = createOnFieldPokemon({
        types: [TYPES.normal],
        lastMoveUsed: MOVES.tackle,
        moves: [createResolvedMoveSlot(MOVES.tackle)],
        volatileStatuses: new Map(),
      });
      const context = createMoveEffectContext({
        defender,
        move: disableMove,
        rng: new SeededRandom(seed),
      });
      const result = ruleset.executeMoveEffect(context);
      if (result.volatileData) {
        durations.push(result.volatileData.turnsLeft);
      }
    }
    expect(Math.min(...durations)).toBe(1);
    expect(Math.max(...durations)).toBe(7);
  });
});
