import type { ActivePokemon, BattleState, MoveEffectContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType, StatBlock } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_MOVE_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  createMoveSlot,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen4DataManager,
  executeGen4MoveEffect,
  GEN4_ABILITY_IDS,
  GEN4_ITEM_IDS,
  GEN4_MOVE_IDS,
  GEN4_NATURE_IDS,
  GEN4_SPECIES_IDS,
} from "../src";
import { createSyntheticOnFieldPokemon } from "./helpers/createSyntheticOnFieldPokemon";

/**
 * Gen 4 Wave 5B -- Combat Move Effects Tests
 *
 * Tests for Sucker Punch, Feint, Focus Punch, Trick/Switcheroo, and Doom Desire.
 *
 * Source: Showdown sim/battle-actions.ts Gen 4 mod
 * Source: Bulbapedia -- individual move pages
 */

// ---------------------------------------------------------------------------
// Test helpers (same pattern as wave5a-volatile-moves.test.ts)
// ---------------------------------------------------------------------------

const DATA_MANAGER = createGen4DataManager();
const ABILITIES = { ...CORE_ABILITY_IDS, ...GEN4_ABILITY_IDS } as const;
const ITEMS = { ...CORE_ITEM_IDS, ...GEN4_ITEM_IDS } as const;
const MOVES = { ...CORE_MOVE_IDS, ...GEN4_MOVE_IDS } as const;
const SPECIES = GEN4_SPECIES_IDS;
const NATURES = GEN4_NATURE_IDS;
const TYPES = CORE_TYPE_IDS;
const VOLATILES = CORE_VOLATILE_IDS;

const TACKLE = DATA_MANAGER.getMove(MOVES.tackle);
const EMBER = DATA_MANAGER.getMove(MOVES.ember);
const SUCKER_PUNCH = DATA_MANAGER.getMove(MOVES.suckerPunch);
const FEINT = DATA_MANAGER.getMove(MOVES.feint);
const FOCUS_PUNCH = DATA_MANAGER.getMove(MOVES.focusPunch);
const TRICK = DATA_MANAGER.getMove(MOVES.trick);
const SWITCHEROO = DATA_MANAGER.getMove(MOVES.switcheroo);
const DOOM_DESIRE = DATA_MANAGER.getMove(MOVES.doomDesire);
const TOXIC = DATA_MANAGER.getMove(MOVES.toxic);
const PROTECT = VOLATILES.protect;

function createMockRng(intReturnValue: number) {
  return {
    next: () => 0,
    int: (_min: number, _max: number) => intReturnValue,
    chance: () => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  };
}

function createActivePokemon(opts: {
  types: PokemonType[];
  status?: string | null;
  heldItem?: string | null;
  nickname?: string | null;
  currentHp?: number;
  maxHp?: number;
  level?: number;
  ability?: string;
  lastMoveUsed?: string | null;
  lastDamageTaken?: number;
  lastDamageCategory?: string | null;
  movedThisTurn?: boolean;
  moves?: Array<{ moveId: string; currentPP: number; maxPP: number }>;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
}): ActivePokemon {
  const maxHp = opts.maxHp ?? 200;
  const calculatedStats: StatBlock = {
    hp: maxHp,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    speed: 100,
  };
  const volatiles =
    opts.volatiles ?? new Map<string, { turnsLeft: number; data?: Record<string, unknown> }>();
  return createSyntheticOnFieldPokemon({
    ability: opts.ability ?? ABILITIES.none,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    calculatedStats,
    currentHp: opts.currentHp ?? maxHp,
    gender: CORE_GENDERS.male,
    heldItem: opts.heldItem ?? null,
    lastDamageCategory: opts.lastDamageCategory as ActivePokemon["lastDamageCategory"],
    lastDamageTaken: opts.lastDamageTaken ?? 0,
    lastMoveUsed: opts.lastMoveUsed ?? null,
    level: opts.level ?? 50,
    moveSlots: opts.moves ?? [
      createMoveSlot(TACKLE.id, TACKLE.pp),
      createMoveSlot(EMBER.id, EMBER.pp),
    ],
    movedThisTurn: opts.movedThisTurn ?? false,
    nickname: opts.nickname ?? null,
    nature: NATURES.hardy,
    pokeball: ITEMS.pokeBall,
    speciesId: opts.nickname === "Jirachi" ? SPECIES.jirachi : SPECIES.alakazam,
    status: opts.status ?? null,
    types: opts.types,
    volatileStatuses: volatiles,
  });
}

function createMinimalBattleState(
  attacker: ActivePokemon,
  defender: ActivePokemon,
  overrides?: Partial<BattleState>,
): BattleState {
  return {
    sides: [
      {
        index: 0,
        active: [attacker],
        team: [attacker.pokemon],
        screens: [],
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
        wish: null,
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
        trainer: null,
      },
      {
        index: 1,
        active: [defender],
        team: [defender.pokemon],
        screens: [],
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
        wish: null,
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
        trainer: null,
      },
    ],
    weather: { type: null, turnsLeft: 0, source: null },
    terrain: { type: null, turnsLeft: 0, source: null },
    trickRoom: { active: false, turnsLeft: 0 },
    turnNumber: 1,
    turnHistory: [],
    phase: "action-select" as const,
    winner: null,
    ended: false,
    ...overrides,
  } as BattleState;
}

function createContext(
  attacker: ActivePokemon,
  defender: ActivePokemon,
  move: MoveData,
  rng: ReturnType<typeof createMockRng>,
  stateOverrides?: Partial<BattleState>,
  contextOverrides?: Partial<MoveEffectContext>,
): MoveEffectContext {
  const state = createMinimalBattleState(attacker, defender, stateOverrides);
  return {
    attacker,
    defender,
    move,
    damage: 0,
    state,
    rng,
    ...contextOverrides,
  } as MoveEffectContext;
}

// ===========================================================================
// Sucker Punch
// ===========================================================================

describe("Sucker Punch", () => {
  it("given defender selected a physical move this turn, when Sucker Punch is used, then it succeeds (no failure message)", () => {
    // Source: Showdown sim/battle-actions.ts Gen 4 — Sucker Punch succeeds if
    //   target selected a damaging move
    // Source: Bulbapedia — "Sucker Punch will succeed if the target has selected
    //   a physical or special move to use this turn"
    const attacker = createActivePokemon({ types: [TYPES.dark] });
    const defender = createActivePokemon({
      types: [TYPES.normal],
      movedThisTurn: false,
    });
    const move = SUCKER_PUNCH;
    const rng = createMockRng(0);
    // Engine populates defenderSelectedMove with the defender's chosen move and its category
    const ctx = createContext(
      attacker,
      defender,
      move,
      rng,
      {},
      {
        defenderSelectedMove: { id: TACKLE.id, category: "physical" },
      },
    );

    const result = executeGen4MoveEffect(ctx);

    // Sucker Punch succeeds — no "But it failed!" message
    expect(result.messages).not.toContain("But it failed!");
  });

  it("given defender selected a status move this turn, when Sucker Punch is used, then it fails", () => {
    // Source: Showdown sim/battle-actions.ts Gen 4 — Sucker Punch fails if
    //   target selected a status move
    // Source: Bulbapedia — "Sucker Punch will fail if the target does not select
    //   a move that deals damage"
    // The engine now populates defenderSelectedMove with the move's category,
    // so the effect handler can properly check for status moves.
    const attacker = createActivePokemon({ types: [TYPES.dark] });
    const defender = createActivePokemon({
      types: [TYPES.normal],
      movedThisTurn: false,
    });
    const move = SUCKER_PUNCH;
    const rng = createMockRng(0);
    // Defender selected Toxic (status move) — Sucker Punch should fail
    const ctx = createContext(
      attacker,
      defender,
      move,
      rng,
      {},
      {
        defenderSelectedMove: { id: TOXIC.id, category: "status" },
      },
    );

    const result = executeGen4MoveEffect(ctx);

    // Sucker Punch fails because the defender selected a status move
    expect(result.messages).toContain("But it failed!");
  });

  it("given defender is switching this turn, when Sucker Punch is used, then it fails", () => {
    // Source: Showdown sim/battle-actions.ts Gen 4 — Sucker Punch fails if
    //   target is not using a damaging move (switching counts as "not attacking")
    // Source: Bulbapedia — "Sucker Punch will fail if the target does not select
    //   a move that deals damage"
    const attacker = createActivePokemon({ types: [TYPES.dark] });
    const defender = createActivePokemon({
      types: [TYPES.normal],
      movedThisTurn: false,
    });
    const move = SUCKER_PUNCH;
    const rng = createMockRng(0);
    // Defender is switching — defenderSelectedMove is null (not using a move)
    const ctx = createContext(
      attacker,
      defender,
      move,
      rng,
      {},
      {
        defenderSelectedMove: null,
      },
    );

    const result = executeGen4MoveEffect(ctx);

    expect(result.messages).toContain("But it failed!");
  });

  it("given defender already moved this turn (higher priority), when Sucker Punch is used, then it fails", () => {
    // Source: Showdown Gen 4 — Sucker Punch fails if target already moved
    // Source: Bulbapedia — "Sucker Punch will fail if the target moves before
    //   the user"
    const attacker = createActivePokemon({ types: [TYPES.dark] });
    const defender = createActivePokemon({
      types: [TYPES.normal],
      movedThisTurn: true, // defender already acted
    });
    const move = SUCKER_PUNCH;
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.messages).toContain("But it failed!");
  });
});

// ===========================================================================
// Feint
// ===========================================================================

describe("Feint", () => {
  it("given defender is using Protect, when Feint is used, then Protect is removed and Feint deals damage", () => {
    // Source: Showdown sim/battle-actions.ts Gen 4 — Feint breaks through Protect
    // Source: Bulbapedia — "If the target has used Protect or Detect, Feint will
    //   remove the effect and damage the target normally"
    const attacker = createActivePokemon({ types: [TYPES.normal] });
    const protectVolatiles = new Map<string, { turnsLeft: number }>();
    protectVolatiles.set(PROTECT, { turnsLeft: 1 });
    const defender = createActivePokemon({
      types: [TYPES.normal],
      nickname: "Blissey",
      volatiles: protectVolatiles,
    });
    const move = FEINT;
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    // Feint removes the protect volatile
    expect(result.volatilesToClear).toEqual([{ target: "defender", volatile: PROTECT }]);
    // Success message
    expect(result.messages).toContain("Blissey fell for the feint!");
    // No failure
    expect(result.messages).not.toContain("But it failed!");
  });

  it("given defender is NOT using Protect or Detect, when Feint is used, then it fails", () => {
    // Source: Showdown sim/battle-actions.ts Gen 4 — Feint fails if target is
    //   not protecting
    // Source: Bulbapedia — "Feint will fail if the target has not used Protect
    //   or Detect during the turn"
    const attacker = createActivePokemon({ types: [TYPES.normal] });
    const defender = createActivePokemon({ types: [TYPES.normal] });
    const move = FEINT;
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.messages).toContain("But it failed!");
    // No volatiles to clear since protect wasn't active
    expect(result.volatilesToClear).toBeUndefined();
  });

  it("given defender has PROTECT volatile from Detect, when Feint is used, then it succeeds", () => {
    // Source: Showdown Gen 4 — Detect and Protect both set the same PROTECT
    //   volatile status; Feint removes it in either case
    // Source: Bulbapedia — Detect "functions identically to Protect"
    const attacker = createActivePokemon({ types: [TYPES.normal] });
    const protectVolatiles = new Map<string, { turnsLeft: number }>();
    protectVolatiles.set(PROTECT, { turnsLeft: 1 }); // Detect also uses the PROTECT volatile
    const defender = createActivePokemon({
      types: [TYPES.normal],
      nickname: "Starmie",
      volatiles: protectVolatiles,
    });
    const move = FEINT;
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.volatilesToClear).toEqual([{ target: "defender", volatile: PROTECT }]);
    expect(result.messages).toContain("Starmie fell for the feint!");
  });
});

// ===========================================================================
// Focus Punch
// ===========================================================================

describe("Focus Punch", () => {
  it("given attacker did NOT take damage this turn, when Focus Punch is used, then it succeeds", () => {
    // Source: Showdown sim/battle-actions.ts Gen 4 — Focus Punch succeeds if
    //   user was not hit before executing
    // Source: Bulbapedia — "If the user is not hit by a damaging move before
    //   it can attack, Focus Punch deals damage normally"
    const attacker = createActivePokemon({
      types: [TYPES.fighting],
      lastDamageTaken: 0, // no damage taken this turn
    });
    const defender = createActivePokemon({ types: [TYPES.normal] });
    const move = FOCUS_PUNCH;
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    // Success — no failure message
    expect(result.messages).not.toContain("lost its focus and couldn't move!");
  });

  it("given attacker took damage this turn before moving, when Focus Punch is used, then it fails with focus lost message", () => {
    // Source: Showdown sim/battle-actions.ts Gen 4 — Focus Punch fails if
    //   pokemon.lastDamageTaken > 0
    // Source: Bulbapedia — "The user will lose its focus and be unable to attack
    //   if it is hit by a damaging move before it can execute Focus Punch"
    const attacker = createActivePokemon({
      types: [TYPES.fighting],
      nickname: "Breloom",
      lastDamageTaken: 45, // took 45 damage this turn
    });
    const defender = createActivePokemon({ types: [TYPES.normal] });
    const move = FOCUS_PUNCH;
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.messages).toContain("Breloom lost its focus and couldn't move!");
  });

  it("given attacker took exactly 1 HP of damage this turn, when Focus Punch is used, then it still fails", () => {
    // Source: Showdown Gen 4 — any non-zero damage causes Focus Punch to fail
    // Even minimal chip damage (1 HP) interrupts Focus Punch
    const attacker = createActivePokemon({
      types: [TYPES.fighting],
      nickname: "Infernape",
      lastDamageTaken: 1, // minimal damage still interrupts
    });
    const defender = createActivePokemon({ types: [TYPES.normal] });
    const move = FOCUS_PUNCH;
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.messages).toContain("Infernape lost its focus and couldn't move!");
  });
});

// ===========================================================================
// Trick / Switcheroo
// ===========================================================================

describe("Trick / Switcheroo", () => {
  it("given both Pokemon hold items, when Trick is used, then items are swapped", () => {
    // Source: Showdown sim/battle-actions.ts Gen 4 — Trick swaps held items
    // Source: Bulbapedia — "The user swaps its held item with the target's held item"
    const attacker = createActivePokemon({
      types: [TYPES.psychic],
      nickname: "Alakazam",
      heldItem: ITEMS.choiceScarf,
    });
    const defender = createActivePokemon({
      types: [TYPES.normal],
      nickname: "Blissey",
      heldItem: ITEMS.leftovers,
    });
    const move = TRICK;
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    // Items swapped
    expect(attacker.pokemon.heldItem).toBe(ITEMS.leftovers);
    expect(defender.pokemon.heldItem).toBe(ITEMS.choiceScarf);
    expect(result.itemTransfer).toEqual({ from: "defender", to: "attacker" });
    expect(result.messages).toContain("Alakazam switched items with Blissey!");
  });

  it("given attacker has item but defender does not, when Switcheroo is used, then attacker gives its item to defender", () => {
    // Source: Showdown Gen 4 — Trick/Switcheroo swap works even if one side
    //   has no item (the other gets nothing)
    // Source: Bulbapedia — "If one Pokemon has an item and the other does not,
    //   then the item is simply transferred"
    const attacker = createActivePokemon({
      types: [TYPES.dark],
      nickname: "Lopunny",
      heldItem: ITEMS.toxicOrb,
    });
    const defender = createActivePokemon({
      types: [TYPES.normal],
      nickname: "Snorlax",
      heldItem: null,
    });
    const move = SWITCHEROO;
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    // Attacker gave its item away, now has nothing
    expect(attacker.pokemon.heldItem).toBeNull();
    expect(defender.pokemon.heldItem).toBe(ITEMS.toxicOrb);
    expect(result.itemTransfer).toEqual({ from: "defender", to: "attacker" });
    expect(result.messages).toContain("Lopunny gave toxic-orb to Snorlax!");
  });

  it("given neither Pokemon holds an item, when Trick is used, then it fails", () => {
    // Source: Showdown Gen 4 — Trick fails if neither holds an item
    // Source: Bulbapedia — "Trick will fail if neither the user nor the target
    //   is holding an item"
    const attacker = createActivePokemon({
      types: [TYPES.psychic],
      heldItem: null,
    });
    const defender = createActivePokemon({
      types: [TYPES.normal],
      heldItem: null,
    });
    const move = TRICK;
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.messages).toContain("But it failed!");
    expect(result.itemTransfer).toBeUndefined();
  });

  it("given defender has Sticky Hold ability, when Trick is used, then it fails", () => {
    // Source: Showdown data/abilities.ts — Sticky Hold blocks item removal
    // Source: Bulbapedia — "Sticky Hold prevents the Pokemon's held item from
    //   being taken or removed by the foe"
    const attacker = createActivePokemon({
      types: [TYPES.psychic],
      heldItem: ITEMS.choiceScarf,
    });
    const defender = createActivePokemon({
      types: [TYPES.poison],
      nickname: "Muk",
      heldItem: ITEMS.blackSludge,
      ability: ABILITIES.stickyHold,
    });
    const move = TRICK;
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.messages).toContain("Muk's Sticky Hold made Trick fail!");
    // Items unchanged
    expect(attacker.pokemon.heldItem).toBe(ITEMS.choiceScarf);
    expect(defender.pokemon.heldItem).toBe(ITEMS.blackSludge);
  });

  it("given either has Multitype ability, when Trick is used, then it fails", () => {
    // Source: Showdown Gen 4 — Trick fails if either Pokemon has Multitype
    // Source: Bulbapedia — "Trick will fail if either Pokemon has the Multitype
    //   Ability" (Arceus with type-changing plates)
    const attacker = createActivePokemon({
      types: [TYPES.normal],
      heldItem: ITEMS.choiceScarf,
      ability: ABILITIES.multitype,
    });
    const defender = createActivePokemon({
      types: [TYPES.normal],
      heldItem: ITEMS.leftovers,
    });
    const move = TRICK;
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.messages).toContain("But it failed!");
    // Items unchanged
    expect(attacker.pokemon.heldItem).toBe(ITEMS.choiceScarf);
    expect(defender.pokemon.heldItem).toBe(ITEMS.leftovers);
  });
});

// ===========================================================================
// Doom Desire
// ===========================================================================

describe("Doom Desire", () => {
  it("given no pending future attack on target side, when Doom Desire is used, then futureAttack is set with moveId=doom-desire and turnsLeft=3", () => {
    // Source: Showdown sim/battle-actions.ts Gen 4 — Doom Desire schedules a
    //   future attack targeting the opponent's side
    // Source: Bulbapedia — "Doom Desire deals damage 2 turns after it is used
    //   (3 end-of-turn ticks later). It is Steel-type with 120 base power in Gen 4."
    const attacker = createActivePokemon({ types: [TYPES.steel], nickname: "Jirachi" });
    const defender = createActivePokemon({ types: [TYPES.normal] });
    const move = DOOM_DESIRE;
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.futureAttack).not.toBeNull();
    expect(result.futureAttack!.moveId).toBe(MOVES.doomDesire);
    expect(result.futureAttack!.turnsLeft).toBe(3);
    expect(result.messages).toContain("Jirachi chose Doom Desire as its destiny!");
  });

  it("given Doom Desire is used by side 0, then sourceSide is 0", () => {
    // Source: Showdown Gen 4 — sourceSide tracks which side used the future attack
    //   for damage calculation at hit time
    const attacker = createActivePokemon({ types: [TYPES.steel] });
    const defender = createActivePokemon({ types: [TYPES.normal] });
    const move = DOOM_DESIRE;
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.futureAttack!.sourceSide).toBe(0);
  });

  it("given a future attack is already pending on the target side, when Doom Desire is used, then it fails", () => {
    // Source: Showdown Gen 4 — Doom Desire/Future Sight fails if a future attack
    //   is already set on the target's side
    // Source: Bulbapedia — "Doom Desire fails if a future attack is already pending
    //   for the target's position"
    const attacker = createActivePokemon({ types: [TYPES.steel], nickname: "Jirachi" });
    const defender = createActivePokemon({ types: [TYPES.normal] });
    const move = DOOM_DESIRE;
    const rng = createMockRng(0);
    const state = createMinimalBattleState(attacker, defender);
    // Set an existing future attack on the target (side 1)
    state.sides[1].futureAttack = {
      moveId: MOVES.futureSight,
      turnsLeft: 2,
      damage: 100,
      sourceSide: 0,
    };
    const ctx = { attacker, defender, move, damage: 0, state, rng } as MoveEffectContext;

    const result = executeGen4MoveEffect(ctx);

    expect(result.futureAttack).toBeUndefined();
    expect(result.messages).toContain("But it failed!");
  });
});
