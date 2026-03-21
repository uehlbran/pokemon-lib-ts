import type { ActivePokemon, BattleState, MoveEffectContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType, StatBlock } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { executeGen4MoveEffect } from "../src/Gen4MoveEffects";

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
  const stats: StatBlock = {
    hp: maxHp,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    speed: 100,
  };

  const pokemon = {
    uid: `test-${Math.random().toString(36).slice(2, 8)}`,
    speciesId: 1,
    nickname: opts.nickname ?? null,
    level: opts.level ?? 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: opts.currentHp ?? maxHp,
    moves: opts.moves ?? [
      { moveId: "tackle", currentPP: 35, maxPP: 35 },
      { moveId: "ember", currentPP: 25, maxPP: 25 },
    ],
    ability: opts.ability ?? "",
    abilitySlot: "normal1" as const,
    heldItem: opts.heldItem ?? null,
    status: opts.status ?? null,
    friendship: 0,
    gender: "male" as const,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: "pokeball",
    calculatedStats: stats,
  } as PokemonInstance;

  const volatiles =
    opts.volatiles ?? new Map<string, { turnsLeft: number; data?: Record<string, unknown> }>();

  return {
    pokemon,
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
    volatileStatuses: volatiles,
    types: opts.types,
    ability: opts.ability ?? "",
    lastMoveUsed: opts.lastMoveUsed ?? null,
    lastDamageTaken: opts.lastDamageTaken ?? 0,
    lastDamageType: null,
    lastDamageCategory: (opts.lastDamageCategory ?? null) as any,
    turnsOnField: 0,
    movedThisTurn: opts.movedThisTurn ?? false,
    consecutiveProtects: 0,
    substituteHp: 0,
    transformed: false,
    transformedSpecies: null,
    isMega: false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
  } as ActivePokemon;
}

function createMove(id: string, overrides?: Partial<MoveData>): MoveData {
  return {
    id,
    name: id,
    type: "normal",
    category: "physical",
    power: 80,
    accuracy: 100,
    pp: 10,
    maxPp: 10,
    priority: 0,
    target: "adjacent-foe",
    flags: [],
    effect: null,
    critRatio: 0,
    generation: 4,
    isContact: false,
    isSound: false,
    isPunch: false,
    isBite: false,
    isBullet: false,
    description: "",
    ...overrides,
  } as MoveData;
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
): MoveEffectContext {
  const state = createMinimalBattleState(attacker, defender, stateOverrides);
  return { attacker, defender, move, damage: 0, state, rng } as MoveEffectContext;
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
    const attacker = createActivePokemon({ types: ["dark"] });
    const defender = createActivePokemon({
      types: ["normal"],
      movedThisTurn: false,
    });
    const move = createMove("sucker-punch", { type: "dark", power: 80, priority: 1 });
    const rng = createMockRng(0);
    // Set up turnHistory with current turn showing defender selected a move action
    const ctx = createContext(attacker, defender, move, rng, {
      turnNumber: 1,
      turnHistory: [
        {
          turn: 1,
          actions: [
            { type: "move", side: 0 as const, moveIndex: 0 },
            { type: "move", side: 1 as const, moveIndex: 0 }, // defender using Tackle (physical)
          ],
          events: [],
        },
      ],
    });

    const result = executeGen4MoveEffect(ctx);

    // Sucker Punch succeeds — no "But it failed!" message
    expect(result.messages).not.toContain("But it failed!");
  });

  it("given defender selected a status move this turn, when Sucker Punch is used, then it succeeds because move category cannot be checked from effect handler alone", () => {
    // Source: Showdown sim/battle-actions.ts Gen 4 — Sucker Punch fails if
    //   target selected a status move. However, our effect handler can only
    //   verify the defender submitted a "move" action — it cannot look up the
    //   move's category without DataManager access.
    // Note: Full category check requires engine-level support (passing move
    //   metadata to the effect context). For now, any move action passes.
    const attacker = createActivePokemon({ types: ["dark"] });
    const defender = createActivePokemon({
      types: ["normal"],
      movedThisTurn: false,
      moves: [
        { moveId: "toxic", currentPP: 10, maxPP: 10 },
        { moveId: "ember", currentPP: 25, maxPP: 25 },
      ],
    });
    const move = createMove("sucker-punch", { type: "dark", power: 80, priority: 1 });
    const rng = createMockRng(0);
    // Defender selected move index 0 (Toxic — status move)
    const ctx = createContext(attacker, defender, move, rng, {
      turnNumber: 1,
      turnHistory: [
        {
          turn: 1,
          actions: [
            { type: "move", side: 0 as const, moveIndex: 0 },
            { type: "move", side: 1 as const, moveIndex: 0 }, // defender using Toxic
          ],
          events: [],
        },
      ],
    });

    const result = executeGen4MoveEffect(ctx);

    // Currently succeeds because category check requires DataManager.
    // The move action type is "move" which passes the non-move check.
    expect(result.messages).not.toContain("But it failed!");
  });

  it("given defender is switching this turn, when Sucker Punch is used, then it fails", () => {
    // Source: Showdown sim/battle-actions.ts Gen 4 — Sucker Punch fails if
    //   target is not using a damaging move (switching counts as "not attacking")
    // Source: Bulbapedia — "Sucker Punch will fail if the target does not select
    //   a move that deals damage"
    const attacker = createActivePokemon({ types: ["dark"] });
    const defender = createActivePokemon({
      types: ["normal"],
      movedThisTurn: false,
    });
    const move = createMove("sucker-punch", { type: "dark", power: 80, priority: 1 });
    const rng = createMockRng(0);
    // turnHistory shows defender selected a switch action
    const ctx = createContext(attacker, defender, move, rng, {
      turnNumber: 1,
      turnHistory: [
        {
          turn: 1,
          actions: [
            { type: "move", side: 0 as const, moveIndex: 0 },
            { type: "switch", side: 1 as const, switchTo: 1 },
          ],
          events: [],
        },
      ],
    });

    const result = executeGen4MoveEffect(ctx);

    expect(result.messages).toContain("But it failed!");
  });

  it("given defender already moved this turn (higher priority), when Sucker Punch is used, then it fails", () => {
    // Source: Showdown Gen 4 — Sucker Punch fails if target already moved
    // Source: Bulbapedia — "Sucker Punch will fail if the target moves before
    //   the user"
    const attacker = createActivePokemon({ types: ["dark"] });
    const defender = createActivePokemon({
      types: ["normal"],
      movedThisTurn: true, // defender already acted
    });
    const move = createMove("sucker-punch", { type: "dark", power: 80, priority: 1 });
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
    const attacker = createActivePokemon({ types: ["normal"] });
    const protectVolatiles = new Map<string, { turnsLeft: number }>();
    protectVolatiles.set("protect", { turnsLeft: 1 });
    const defender = createActivePokemon({
      types: ["normal"],
      nickname: "Blissey",
      volatiles: protectVolatiles,
    });
    const move = createMove("feint", { type: "normal", power: 50, priority: 2 });
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    // Feint removes the protect volatile
    expect(result.volatilesToClear).toEqual([{ target: "defender", volatile: "protect" }]);
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
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("feint", { type: "normal", power: 50, priority: 2 });
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.messages).toContain("But it failed!");
    // No volatiles to clear since protect wasn't active
    expect(result.volatilesToClear).toBeUndefined();
  });

  it("given defender has Protect volatile from Detect (both use 'protect' volatile), when Feint is used, then it succeeds", () => {
    // Source: Showdown Gen 4 — Detect and Protect both set the same "protect"
    //   volatile status; Feint removes it in either case
    // Source: Bulbapedia — Detect "functions identically to Protect"
    const attacker = createActivePokemon({ types: ["normal"] });
    const protectVolatiles = new Map<string, { turnsLeft: number }>();
    protectVolatiles.set("protect", { turnsLeft: 1 }); // Detect also uses "protect" volatile
    const defender = createActivePokemon({
      types: ["normal"],
      nickname: "Starmie",
      volatiles: protectVolatiles,
    });
    const move = createMove("feint", { type: "normal", power: 50, priority: 2 });
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.volatilesToClear).toEqual([{ target: "defender", volatile: "protect" }]);
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
      types: ["fighting"],
      lastDamageTaken: 0, // no damage taken this turn
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("focus-punch", {
      type: "fighting",
      power: 150,
      priority: -3,
    });
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
      types: ["fighting"],
      nickname: "Breloom",
      lastDamageTaken: 45, // took 45 damage this turn
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("focus-punch", {
      type: "fighting",
      power: 150,
      priority: -3,
    });
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.messages).toContain("Breloom lost its focus and couldn't move!");
  });

  it("given attacker took exactly 1 HP of damage this turn, when Focus Punch is used, then it still fails", () => {
    // Source: Showdown Gen 4 — any non-zero damage causes Focus Punch to fail
    // Even minimal chip damage (1 HP) interrupts Focus Punch
    const attacker = createActivePokemon({
      types: ["fighting"],
      nickname: "Infernape",
      lastDamageTaken: 1, // minimal damage still interrupts
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("focus-punch", {
      type: "fighting",
      power: 150,
      priority: -3,
    });
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
      types: ["psychic"],
      nickname: "Alakazam",
      heldItem: "choice-scarf",
    });
    const defender = createActivePokemon({
      types: ["normal"],
      nickname: "Blissey",
      heldItem: "leftovers",
    });
    const move = createMove("trick", { type: "psychic", category: "status", power: 0 });
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    // Items swapped
    expect(attacker.pokemon.heldItem).toBe("leftovers");
    expect(defender.pokemon.heldItem).toBe("choice-scarf");
    expect(result.itemTransfer).toEqual({ from: "defender", to: "attacker" });
    expect(result.messages).toContain("Alakazam switched items with Blissey!");
  });

  it("given attacker has item but defender does not, when Switcheroo is used, then attacker gives its item to defender", () => {
    // Source: Showdown Gen 4 — Trick/Switcheroo swap works even if one side
    //   has no item (the other gets nothing)
    // Source: Bulbapedia — "If one Pokemon has an item and the other does not,
    //   then the item is simply transferred"
    const attacker = createActivePokemon({
      types: ["dark"],
      nickname: "Lopunny",
      heldItem: "toxic-orb",
    });
    const defender = createActivePokemon({
      types: ["normal"],
      nickname: "Snorlax",
      heldItem: null,
    });
    const move = createMove("switcheroo", { type: "dark", category: "status", power: 0 });
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    // Attacker gave its item away, now has nothing
    expect(attacker.pokemon.heldItem).toBeNull();
    expect(defender.pokemon.heldItem).toBe("toxic-orb");
    expect(result.itemTransfer).toEqual({ from: "defender", to: "attacker" });
    expect(result.messages).toContain("Lopunny gave toxic-orb to Snorlax!");
  });

  it("given neither Pokemon holds an item, when Trick is used, then it fails", () => {
    // Source: Showdown Gen 4 — Trick fails if neither holds an item
    // Source: Bulbapedia — "Trick will fail if neither the user nor the target
    //   is holding an item"
    const attacker = createActivePokemon({
      types: ["psychic"],
      heldItem: null,
    });
    const defender = createActivePokemon({
      types: ["normal"],
      heldItem: null,
    });
    const move = createMove("trick", { type: "psychic", category: "status", power: 0 });
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
      types: ["psychic"],
      heldItem: "choice-scarf",
    });
    const defender = createActivePokemon({
      types: ["poison"],
      nickname: "Muk",
      heldItem: "black-sludge",
      ability: "sticky-hold",
    });
    const move = createMove("trick", { type: "psychic", category: "status", power: 0 });
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.messages).toContain("Muk's Sticky Hold made Trick fail!");
    // Items unchanged
    expect(attacker.pokemon.heldItem).toBe("choice-scarf");
    expect(defender.pokemon.heldItem).toBe("black-sludge");
  });

  it("given either has Multitype ability, when Trick is used, then it fails", () => {
    // Source: Showdown Gen 4 — Trick fails if either Pokemon has Multitype
    // Source: Bulbapedia — "Trick will fail if either Pokemon has the Multitype
    //   Ability" (Arceus with type-changing plates)
    const attacker = createActivePokemon({
      types: ["normal"],
      heldItem: "choice-scarf",
      ability: "multitype",
    });
    const defender = createActivePokemon({
      types: ["normal"],
      heldItem: "leftovers",
    });
    const move = createMove("trick", { type: "psychic", category: "status", power: 0 });
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.messages).toContain("But it failed!");
    // Items unchanged
    expect(attacker.pokemon.heldItem).toBe("choice-scarf");
    expect(defender.pokemon.heldItem).toBe("leftovers");
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
    const attacker = createActivePokemon({ types: ["steel"], nickname: "Jirachi" });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("doom-desire", {
      type: "steel",
      category: "special",
      power: 120,
    });
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.futureAttack).not.toBeNull();
    expect(result.futureAttack!.moveId).toBe("doom-desire");
    expect(result.futureAttack!.turnsLeft).toBe(3);
    expect(result.messages).toContain("Jirachi chose Doom Desire as its destiny!");
  });

  it("given Doom Desire is used by side 0, then sourceSide is 0", () => {
    // Source: Showdown Gen 4 — sourceSide tracks which side used the future attack
    //   for damage calculation at hit time
    const attacker = createActivePokemon({ types: ["steel"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("doom-desire", {
      type: "steel",
      category: "special",
      power: 120,
    });
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
    const attacker = createActivePokemon({ types: ["steel"], nickname: "Jirachi" });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("doom-desire", {
      type: "steel",
      category: "special",
      power: 120,
    });
    const rng = createMockRng(0);
    const state = createMinimalBattleState(attacker, defender);
    // Set an existing future attack on the target (side 1)
    state.sides[1].futureAttack = {
      moveId: "future-sight",
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
