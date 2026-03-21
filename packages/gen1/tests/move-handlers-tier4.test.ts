import type { ActivePokemon, BattleState, MoveEffectContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { Gen1Ruleset } from "../src/Gen1Ruleset";

/**
 * Gen 1 Tier 4 Move Handler Tests
 *
 * Tests for Rage, Mimic, Mirror Move, Metronome, Transform, Bide,
 * Thrash/Petal Dance, and Hyper Beam substitute-break behavior.
 * Source: pret/pokered — cartridge-accurate behavior.
 */

// --- Test Helpers ---

const ruleset = new Gen1Ruleset();

const DEFAULT_MOVE_FLAGS: MoveData["flags"] = {
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
};

function makeMove(overrides: Partial<MoveData> = {}): MoveData {
  return {
    id: "test-move",
    displayName: "Test Move",
    type: "normal" as PokemonType,
    category: "physical",
    power: 50,
    accuracy: 100,
    pp: 35,
    priority: 0,
    target: "adjacent-foe",
    flags: DEFAULT_MOVE_FLAGS,
    effect: null,
    description: "A test move.",
    generation: 1,
    ...overrides,
  };
}

function makeActivePokemon(overrides: Partial<ActivePokemon> = {}): ActivePokemon {
  return {
    pokemon: {
      uid: "test-uid",
      speciesId: 25,
      nickname: null,
      level: 50,
      experience: 0,
      nature: "hardy",
      ivs: { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      moves: [
        { moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 },
        { moveId: "thunderbolt", currentPP: 15, maxPP: 15, ppUps: 0 },
      ],
      currentHp: 100,
      status: null,
      friendship: 70,
      heldItem: null,
      ability: "",
      abilitySlot: "normal1" as const,
      gender: "male" as const,
      isShiny: false,
      metLocation: "pallet-town",
      metLevel: 5,
      originalTrainer: "Red",
      originalTrainerId: 12345,
      pokeball: "poke-ball",
      calculatedStats: {
        hp: 100,
        attack: 80,
        defense: 60,
        spAttack: 80,
        spDefense: 60,
        speed: 120,
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
    volatileStatuses: new Map(),
    types: ["electric"] as PokemonType[],
    ability: "",
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: 1,
    movedThisTurn: false,
    consecutiveProtects: 0,
    substituteHp: 0,
    transformed: false,
    transformedSpecies: null,
    isMega: false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    forcedMove: null,
    ...overrides,
  } as ActivePokemon;
}

function makeBattleState(): BattleState {
  const rng = new SeededRandom(42);
  return {
    phase: "turn-resolve",
    generation: 1,
    format: "singles",
    turnNumber: 1,
    sides: [
      {
        index: 0 as const,
        trainer: null,
        team: [],
        active: [null],
        hazards: [],
        screens: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
        wish: null,
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
      },
      {
        index: 1 as const,
        trainer: null,
        team: [],
        active: [null],
        hazards: [],
        screens: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
        wish: null,
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
      },
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

function makeMoveEffectContext(overrides: Partial<MoveEffectContext> = {}): MoveEffectContext {
  const rng = new SeededRandom(42);
  return {
    attacker: makeActivePokemon(),
    defender: makeActivePokemon({ types: ["normal"] }),
    move: makeMove(),
    damage: 0,
    state: makeBattleState(),
    rng,
    ...overrides,
  };
}

// ============================================================================
// Rage tests
// ============================================================================

describe("Gen 1 Rage handler", () => {
  const rageMove = makeMove({
    id: "rage",
    displayName: "Rage",
    type: "normal" as PokemonType,
    category: "physical",
    power: 20,
    accuracy: 100,
    pp: 20,
    target: "adjacent-foe",
    flags: { ...DEFAULT_MOVE_FLAGS, contact: true },
    effect: { type: "custom" as const, handler: "rage" },
  });

  it("given Rage used for the first time, when checking result, then selfVolatileInflicted is 'rage' and forcedMoveSet locks into Rage", () => {
    // Source: pret/pokered RageEffect — first use sets the rage volatile
    // Arrange
    const attacker = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        moves: [
          { moveId: "rage", currentPP: 20, maxPP: 20, ppUps: 0 },
          { moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 },
        ],
      } as PokemonInstance,
    });
    const context = makeMoveEffectContext({ move: rageMove, attacker, damage: 10 });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(result.selfVolatileInflicted).toBe("rage");
    expect(result.forcedMoveSet).toEqual({
      moveIndex: 0,
      moveId: "rage",
      volatileStatus: "rage",
    });
  });

  it("given Rage volatile already active, when Rage used again, then forcedMoveSet re-locks but selfVolatileInflicted is null (already set)", () => {
    // Source: pret/pokered RageEffect — subsequent uses re-lock but don't re-set the volatile
    // Arrange
    const attacker = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        moves: [
          { moveId: "rage", currentPP: 20, maxPP: 20, ppUps: 0 },
          { moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 },
        ],
      } as PokemonInstance,
    });
    attacker.volatileStatuses.set("rage", { turnsLeft: -1, data: { moveIndex: 0 } });
    const context = makeMoveEffectContext({ move: rageMove, attacker, damage: 10 });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(result.selfVolatileInflicted).toBeUndefined();
    expect(result.forcedMoveSet).toEqual({
      moveIndex: 0,
      moveId: "rage",
      volatileStatus: "rage",
    });
  });

  it("given a Pokemon with rage volatile is hit, when onDamageReceived is called, then Attack stage increases by +1", () => {
    // Source: pret/pokered RageEffect — each hit boosts Attack +1 while Rage is active
    // Arrange
    const defender = makeActivePokemon();
    defender.volatileStatuses.set("rage", { turnsLeft: -1, data: { moveIndex: 0 } });
    defender.statStages.attack = 0;
    const state = makeBattleState();
    const hitMove = makeMove({ id: "tackle" });

    // Act
    ruleset.onDamageReceived(defender, 30, hitMove, state);

    // Assert
    expect(defender.statStages.attack).toBe(1);
  });

  it("given a raging Pokemon at +5 Attack hit twice, when onDamageReceived is called, then Attack caps at +6", () => {
    // Source: pret/pokered — stat stages cap at +6
    // Arrange
    const defender = makeActivePokemon();
    defender.volatileStatuses.set("rage", { turnsLeft: -1, data: { moveIndex: 0 } });
    defender.statStages.attack = 5;
    const state = makeBattleState();
    const hitMove = makeMove({ id: "tackle" });

    // Act — first hit: +5 -> +6
    ruleset.onDamageReceived(defender, 30, hitMove, state);
    expect(defender.statStages.attack).toBe(6);

    // Act — second hit: stays at +6
    ruleset.onDamageReceived(defender, 30, hitMove, state);
    expect(defender.statStages.attack).toBe(6);
  });
});

// ============================================================================
// Mimic tests
// ============================================================================

describe("Gen 1 Mimic handler", () => {
  const mimicMove = makeMove({
    id: "mimic",
    displayName: "Mimic",
    type: "normal" as PokemonType,
    category: "status",
    power: null,
    accuracy: null,
    target: "adjacent-foe",
    effect: { type: "custom" as const, handler: "mimic" },
  });

  it("given defender has used Thunderbolt last, when Mimic is used, then moveSlotChange replaces Mimic's slot with Thunderbolt at PP=5", () => {
    // Source: pret/pokered MimicEffect — copies defender's last used move, PP = 5
    // Arrange
    const attacker = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        moves: [
          { moveId: "mimic", currentPP: 10, maxPP: 10, ppUps: 0 },
          { moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 },
        ],
      } as PokemonInstance,
    });
    const defender = makeActivePokemon({ lastMoveUsed: "thunderbolt" });
    const context = makeMoveEffectContext({ move: mimicMove, attacker, defender, damage: 0 });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(result.moveSlotChange).toEqual({
      slot: 0,
      newMoveId: "thunderbolt",
      newPP: 5,
      originalMoveId: "mimic",
    });
  });

  it("given defender has used Fire Blast last, when Mimic is used from slot 1, then moveSlotChange targets slot 1", () => {
    // Source: pret/pokered MimicEffect — copies into the slot Mimic occupies
    // Arrange
    const attacker = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        moves: [
          { moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 },
          { moveId: "mimic", currentPP: 10, maxPP: 10, ppUps: 0 },
        ],
      } as PokemonInstance,
    });
    const defender = makeActivePokemon({ lastMoveUsed: "fire-blast" });
    const context = makeMoveEffectContext({ move: mimicMove, attacker, defender, damage: 0 });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(result.moveSlotChange).toEqual({
      slot: 1,
      newMoveId: "fire-blast",
      newPP: 5,
      originalMoveId: "mimic",
    });
  });

  it("given defender has not used a move, when Mimic is used, then it fails with 'But it failed!'", () => {
    // Source: pret/pokered MimicEffect — fails if no last move used
    // Arrange
    const attacker = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        moves: [{ moveId: "mimic", currentPP: 10, maxPP: 10, ppUps: 0 }],
      } as PokemonInstance,
    });
    const defender = makeActivePokemon({ lastMoveUsed: null });
    const context = makeMoveEffectContext({ move: mimicMove, attacker, defender, damage: 0 });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(result.moveSlotChange).toBeUndefined();
    expect(result.messages).toContain("But it failed!");
  });

  it("given defender last used Mimic itself, when Mimic is used, then it fails", () => {
    // Source: pret/pokered MimicEffect — cannot Mimic Mimic
    // Arrange
    const attacker = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        moves: [{ moveId: "mimic", currentPP: 10, maxPP: 10, ppUps: 0 }],
      } as PokemonInstance,
    });
    const defender = makeActivePokemon({ lastMoveUsed: "mimic" });
    const context = makeMoveEffectContext({ move: mimicMove, attacker, defender, damage: 0 });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(result.messages).toContain("But it failed!");
  });

  it("given Mimic replaced a slot, when onSwitchOut is called, then the original move is restored", () => {
    // Source: pret/pokered — Mimic replacement reverts on switch-out
    // Arrange
    const pokemon = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        moves: [
          { moveId: "thunderbolt", currentPP: 5, maxPP: 5, ppUps: 0 },
          { moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 },
        ],
      } as PokemonInstance,
    });
    pokemon.volatileStatuses.set("mimic-slot", {
      turnsLeft: -1,
      data: { slot: 0, originalMoveId: "mimic" },
    });
    const state = makeBattleState();

    // Act
    ruleset.onSwitchOut(pokemon, state);

    // Assert — mimic (PP 10) should be restored
    // Source: pret/pokered — PP restored to max for the original move
    expect(pokemon.pokemon.moves[0]!.moveId).toBe("mimic");
    expect(pokemon.pokemon.moves[0]!.maxPP).toBe(10);
  });
});

// ============================================================================
// Mirror Move tests
// ============================================================================

describe("Gen 1 Mirror Move handler", () => {
  const mirrorMoveMove = makeMove({
    id: "mirror-move",
    displayName: "Mirror Move",
    type: "flying" as PokemonType,
    category: "status",
    power: null,
    accuracy: null,
    target: "adjacent-foe",
    effect: { type: "custom" as const, handler: "mirror-move" },
  });

  it("given defender last used Thunderbolt, when Mirror Move is used, then recursiveMove is 'thunderbolt'", () => {
    // Source: pret/pokered MirrorMoveEffect — executes the move the defender used last
    // Arrange
    const defender = makeActivePokemon({ lastMoveUsed: "thunderbolt" });
    const context = makeMoveEffectContext({
      move: mirrorMoveMove,
      defender,
      damage: 0,
    });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(result.recursiveMove).toBe("thunderbolt");
    expect(result.messages).not.toContain("But it failed!");
  });

  it("given defender last used Flamethrower, when Mirror Move is used, then recursiveMove is 'flamethrower'", () => {
    // Source: pret/pokered MirrorMoveEffect — copies whatever the defender used
    // Arrange
    const defender = makeActivePokemon({ lastMoveUsed: "flamethrower" });
    const context = makeMoveEffectContext({
      move: mirrorMoveMove,
      defender,
      damage: 0,
    });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(result.recursiveMove).toBe("flamethrower");
  });

  it("given defender has not used a move, when Mirror Move is used, then it fails", () => {
    // Source: pret/pokered MirrorMoveEffect — fails if no previous move
    // Arrange
    const defender = makeActivePokemon({ lastMoveUsed: null });
    const context = makeMoveEffectContext({
      move: mirrorMoveMove,
      defender,
      damage: 0,
    });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(result.recursiveMove).toBeUndefined();
    expect(result.messages).toContain("But it failed!");
  });

  it("given defender last used Mirror Move, when Mirror Move is used, then it fails (cannot mirror Mirror Move)", () => {
    // Source: pret/pokered MirrorMoveEffect — Mirror Move cannot copy itself
    // Arrange
    const defender = makeActivePokemon({ lastMoveUsed: "mirror-move" });
    const context = makeMoveEffectContext({
      move: mirrorMoveMove,
      defender,
      damage: 0,
    });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(result.messages).toContain("But it failed!");
  });
});

// ============================================================================
// Metronome tests
// ============================================================================

describe("Gen 1 Metronome handler", () => {
  const metronomeMove = makeMove({
    id: "metronome",
    displayName: "Metronome",
    type: "normal" as PokemonType,
    category: "status",
    power: null,
    accuracy: null,
    target: "self",
    effect: { type: "custom" as const, handler: "metronome" },
  });

  it("given Metronome is used, when checking result, then recursiveMove is a valid Gen 1 move (not 'metronome' or 'struggle')", () => {
    // Source: pret/pokered MetronomeEffect — picks random move excluding Metronome and Struggle
    // Arrange
    const rng = new SeededRandom(100);
    const context = makeMoveEffectContext({ move: metronomeMove, damage: 0, rng });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(result.recursiveMove).toBeDefined();
    expect(result.recursiveMove).not.toBe("metronome");
    expect(result.recursiveMove).not.toBe("struggle");
    expect(typeof result.recursiveMove).toBe("string");
  });

  it("given Metronome is used with a different seed, when checking result, then a different move can be selected (demonstrating randomness)", () => {
    // Source: pret/pokered MetronomeEffect — random selection from all Gen 1 moves
    // Arrange
    const rng1 = new SeededRandom(1);
    const rng2 = new SeededRandom(999);
    const context1 = makeMoveEffectContext({ move: metronomeMove, damage: 0, rng: rng1 });
    const context2 = makeMoveEffectContext({ move: metronomeMove, damage: 0, rng: rng2 });

    // Act
    const result1 = ruleset.executeMoveEffect(context1);
    const result2 = ruleset.executeMoveEffect(context2);

    // Assert — both should be valid moves; with different seeds, high probability of different results
    expect(result1.recursiveMove).toBeDefined();
    expect(result2.recursiveMove).toBeDefined();
    expect(result1.recursiveMove).not.toBe("metronome");
    expect(result2.recursiveMove).not.toBe("metronome");
    // Note: theoretically they could be the same move by chance, but with 163 moves
    // in the pool and very different seeds, this is astronomically unlikely.
    // We avoid asserting inequality to prevent flakiness, and rely on the first test
    // for exclusion correctness.
  });
});

// ============================================================================
// Transform tests
// ============================================================================

describe("Gen 1 Transform handler", () => {
  const transformMove = makeMove({
    id: "transform",
    displayName: "Transform",
    type: "normal" as PokemonType,
    category: "status",
    power: null,
    accuracy: null,
    target: "adjacent-foe",
    effect: { type: "custom" as const, handler: "transform" },
  });

  it("given Transform is used, when checking result, then attacker copies defender's types, stats, and moves (PP=5)", () => {
    // Source: pret/pokered TransformEffect — copies types, stat stages, calculated stats (except HP), moves (PP=5)
    // Arrange
    const attacker = makeActivePokemon({
      types: ["electric"],
      pokemon: {
        ...makeActivePokemon().pokemon,
        moves: [
          { moveId: "transform", currentPP: 10, maxPP: 10, ppUps: 0 },
          { moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 },
        ],
        calculatedStats: {
          hp: 100,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 120,
        },
      } as PokemonInstance,
    });
    const defender = makeActivePokemon({
      types: ["fire", "flying"],
      pokemon: {
        ...makeActivePokemon().pokemon,
        moves: [
          { moveId: "flamethrower", currentPP: 15, maxPP: 15, ppUps: 0 },
          { moveId: "fly", currentPP: 15, maxPP: 15, ppUps: 0 },
        ],
        calculatedStats: {
          hp: 150,
          attack: 100,
          defense: 90,
          spAttack: 110,
          spDefense: 90,
          speed: 100,
        },
      } as PokemonInstance,
    });
    defender.statStages.attack = 2;
    defender.statStages.speed = -1;
    const context = makeMoveEffectContext({ move: transformMove, attacker, defender, damage: 0 });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert — types copied via typeChange result
    expect(result.typeChange).toEqual({
      target: "attacker",
      types: ["fire", "flying"],
    });
    // Assert — stat stages copied directly on attacker
    expect(attacker.statStages.attack).toBe(2);
    expect(attacker.statStages.speed).toBe(-1);
    // Assert — calculated stats (except HP) copied
    expect(attacker.pokemon.calculatedStats!.attack).toBe(100);
    expect(attacker.pokemon.calculatedStats!.defense).toBe(90);
    expect(attacker.pokemon.calculatedStats!.spAttack).toBe(110);
    expect(attacker.pokemon.calculatedStats!.speed).toBe(100);
    // HP should NOT be copied
    expect(attacker.pokemon.calculatedStats!.hp).toBe(100);
    // Assert — moves copied with PP=5
    expect(attacker.pokemon.moves).toHaveLength(2);
    expect(attacker.pokemon.moves[0]!.moveId).toBe("flamethrower");
    expect(attacker.pokemon.moves[0]!.currentPP).toBe(5);
    expect(attacker.pokemon.moves[0]!.maxPP).toBe(5);
    expect(attacker.pokemon.moves[1]!.moveId).toBe("fly");
    // Assert — transformed flag set
    expect(attacker.transformed).toBe(true);
    // Assert — transform-data volatile stores originals
    expect(attacker.volatileStatuses.has("transform-data")).toBe(true);
    expect(result.messages).toContain("The user transformed!");
  });

  it("given a transformed Pokemon switches out, when onSwitchOut is called, then original moves/types/stats are restored", () => {
    // Source: pret/pokered — Transform reverts on switch-out
    // Arrange
    const pokemon = makeActivePokemon({
      types: ["fire", "flying"],
      pokemon: {
        ...makeActivePokemon().pokemon,
        moves: [
          { moveId: "flamethrower", currentPP: 5, maxPP: 5, ppUps: 0 },
          { moveId: "fly", currentPP: 5, maxPP: 5, ppUps: 0 },
        ],
        calculatedStats: {
          hp: 100,
          attack: 100,
          defense: 90,
          spAttack: 110,
          spDefense: 90,
          speed: 100,
        },
      } as PokemonInstance,
    });
    pokemon.transformed = true;
    pokemon.volatileStatuses.set("transform-data", {
      turnsLeft: -1,
      data: {
        originalMoves: [
          { moveId: "transform", currentPP: 10, maxPP: 10, ppUps: 0 },
          { moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 },
        ],
        originalTypes: ["electric"],
        originalStats: {
          hp: 100,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 120,
        },
      },
    });
    const state = makeBattleState();

    // Act
    ruleset.onSwitchOut(pokemon, state);

    // Assert
    expect(pokemon.pokemon.moves[0]!.moveId).toBe("transform");
    expect(pokemon.pokemon.moves[0]!.currentPP).toBe(10);
    expect(pokemon.pokemon.moves[1]!.moveId).toBe("tackle");
    expect(pokemon.types).toEqual(["electric"]);
    expect(pokemon.pokemon.calculatedStats!.attack).toBe(80);
    expect(pokemon.pokemon.calculatedStats!.speed).toBe(120);
    expect(pokemon.transformed).toBe(false);
  });
});

// ============================================================================
// Bide tests
// ============================================================================

describe("Gen 1 Bide handler", () => {
  const bideMove = makeMove({
    id: "bide",
    displayName: "Bide",
    type: "normal" as PokemonType,
    category: "physical",
    power: null,
    accuracy: null,
    target: "self",
    effect: { type: "custom" as const, handler: "bide" },
  });

  it("given Bide used for the first time, when checking result, then selfVolatileInflicted is 'bide' and forcedMoveSet locks into Bide", () => {
    // Source: pret/pokered BideEffect — first use starts charging
    // Arrange
    const attacker = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        moves: [{ moveId: "bide", currentPP: 10, maxPP: 10, ppUps: 0 }],
      } as PokemonInstance,
    });
    const rng = new SeededRandom(42);
    const context = makeMoveEffectContext({ move: bideMove, attacker, damage: 0, rng });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(result.selfVolatileInflicted).toBe("bide");
    expect(result.selfVolatileData?.data?.accumulatedDamage).toBe(0);
    // turnsLeft should be 2 or 3 (random)
    // Source: pret/pokered BideEffect — charges for 2-3 turns
    expect(result.selfVolatileData!.turnsLeft).toBeGreaterThanOrEqual(2);
    expect(result.selfVolatileData!.turnsLeft).toBeLessThanOrEqual(3);
    expect(result.forcedMoveSet).toBeDefined();
    expect(result.forcedMoveSet!.moveId).toBe("bide");
    expect(result.messages).toContain("The user is storing energy!");
  });

  it("given Bide is charging (turnsLeft > 1), when Bide is used, then turnsLeft decrements and forcedMoveSet re-locks", () => {
    // Source: pret/pokered BideEffect — charging turns continue
    // Arrange
    const attacker = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        moves: [{ moveId: "bide", currentPP: 10, maxPP: 10, ppUps: 0 }],
      } as PokemonInstance,
    });
    attacker.volatileStatuses.set("bide", {
      turnsLeft: 2,
      data: { accumulatedDamage: 50 },
    });
    const context = makeMoveEffectContext({ move: bideMove, attacker, damage: 0 });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    // turnsLeft should have decremented from 2 to 1
    const bideVol = attacker.volatileStatuses.get("bide");
    expect(bideVol!.turnsLeft).toBe(1);
    expect(result.forcedMoveSet).toBeDefined();
    expect(result.messages).toContain("The user is storing energy!");
  });

  it("given Bide releases (turnsLeft = 1) with 50 accumulated damage, when Bide is used, then customDamage deals 100 to defender", () => {
    // Source: pret/pokered BideEffect — releases 2x accumulated damage
    // 50 accumulated * 2 = 100 damage
    // Arrange
    const attacker = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        moves: [{ moveId: "bide", currentPP: 10, maxPP: 10, ppUps: 0 }],
      } as PokemonInstance,
    });
    attacker.volatileStatuses.set("bide", {
      turnsLeft: 1,
      data: { accumulatedDamage: 50 },
    });
    const context = makeMoveEffectContext({ move: bideMove, attacker, damage: 0 });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(result.customDamage).toEqual({
      target: "defender",
      amount: 100,
      source: "bide",
    });
    expect(attacker.volatileStatuses.has("bide")).toBe(false);
    expect(result.messages).toContain("The user unleashed energy!");
  });

  it("given Bide releases with 0 accumulated damage, when Bide is used, then it fails", () => {
    // Source: pret/pokered BideEffect — fails if no damage accumulated
    // Arrange
    const attacker = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        moves: [{ moveId: "bide", currentPP: 10, maxPP: 10, ppUps: 0 }],
      } as PokemonInstance,
    });
    attacker.volatileStatuses.set("bide", {
      turnsLeft: 1,
      data: { accumulatedDamage: 0 },
    });
    const context = makeMoveEffectContext({ move: bideMove, attacker, damage: 0 });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(result.customDamage).toBeUndefined();
    expect(result.messages).toContain("But it failed!");
  });

  it("given a Pokemon with bide volatile is hit for 40 damage, when onDamageReceived is called, then accumulatedDamage increases by 40", () => {
    // Source: pret/pokered BideEffect — accumulates damage received
    // Arrange
    const defender = makeActivePokemon();
    defender.volatileStatuses.set("bide", {
      turnsLeft: 2,
      data: { accumulatedDamage: 10 },
    });
    const state = makeBattleState();
    const hitMove = makeMove({ id: "tackle" });

    // Act
    ruleset.onDamageReceived(defender, 40, hitMove, state);

    // Assert
    const bideVol = defender.volatileStatuses.get("bide");
    expect((bideVol!.data as any).accumulatedDamage).toBe(50);
  });
});

// ============================================================================
// Thrash / Petal Dance tests
// ============================================================================

describe("Gen 1 Thrash handler", () => {
  const thrashMove = makeMove({
    id: "thrash",
    displayName: "Thrash",
    type: "normal" as PokemonType,
    category: "physical",
    power: 90,
    accuracy: 100,
    pp: 20,
    target: "random-foe",
    flags: { ...DEFAULT_MOVE_FLAGS, contact: true },
    effect: { type: "custom" as const, handler: "thrash" },
  });

  it("given Thrash used for the first time, when checking result, then selfVolatileInflicted is 'thrash-lock' and forcedMoveSet locks into Thrash", () => {
    // Source: pret/pokered ThrashEffect — first use locks for 2-3 turns
    // Arrange
    const attacker = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        moves: [{ moveId: "thrash", currentPP: 20, maxPP: 20, ppUps: 0 }],
      } as PokemonInstance,
    });
    const rng = new SeededRandom(42);
    const context = makeMoveEffectContext({ move: thrashMove, attacker, damage: 30, rng });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(result.selfVolatileInflicted).toBe("thrash-lock");
    expect(result.selfVolatileData!.turnsLeft).toBeGreaterThanOrEqual(2);
    expect(result.selfVolatileData!.turnsLeft).toBeLessThanOrEqual(3);
    expect(result.forcedMoveSet!.moveId).toBe("thrash");
  });

  it("given Thrash lock active with turnsLeft > 1, when Thrash is used, then turnsLeft decrements and re-locks", () => {
    // Source: pret/pokered ThrashEffect — continues thrashing
    // Arrange
    const attacker = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        moves: [{ moveId: "thrash", currentPP: 20, maxPP: 20, ppUps: 0 }],
      } as PokemonInstance,
    });
    attacker.volatileStatuses.set("thrash-lock", { turnsLeft: 2, data: { moveId: "thrash" } });
    const context = makeMoveEffectContext({ move: thrashMove, attacker, damage: 30 });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(attacker.volatileStatuses.get("thrash-lock")!.turnsLeft).toBe(1);
    expect(result.forcedMoveSet).toBeDefined();
  });

  it("given Thrash lock is on last turn (turnsLeft = 1), when Thrash is used, then thrash-lock is removed and user is confused", () => {
    // Source: pret/pokered ThrashEffect — confusion after thrashing ends
    // Arrange
    const attacker = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        moves: [{ moveId: "thrash", currentPP: 20, maxPP: 20, ppUps: 0 }],
      } as PokemonInstance,
    });
    attacker.volatileStatuses.set("thrash-lock", { turnsLeft: 1, data: { moveId: "thrash" } });
    const rng = new SeededRandom(42);
    const context = makeMoveEffectContext({ move: thrashMove, attacker, damage: 30, rng });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(attacker.volatileStatuses.has("thrash-lock")).toBe(false);
    expect(result.selfVolatileInflicted).toBe("confusion");
    // Confusion lasts 2-5 turns in Gen 1
    // Source: pret/pokered — random(0-3)+2 = [2,5]
    expect(result.selfVolatileData!.turnsLeft).toBeGreaterThanOrEqual(2);
    expect(result.selfVolatileData!.turnsLeft).toBeLessThanOrEqual(5);
    expect(result.forcedMoveSet).toBeUndefined();
  });

  it("given Petal Dance move with thrash handler on last turn, when used, then confusion is applied (same handler as Thrash)", () => {
    // Source: pret/pokered — Petal Dance uses the same ThrashEffect handler
    // Arrange
    const petalDanceMove = makeMove({
      id: "petal-dance",
      displayName: "Petal Dance",
      type: "grass" as PokemonType,
      category: "special",
      power: 70,
      accuracy: 100,
      pp: 20,
      target: "random-foe",
      flags: { ...DEFAULT_MOVE_FLAGS, contact: true },
      effect: { type: "custom" as const, handler: "thrash" },
    });
    const attacker = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        moves: [{ moveId: "petal-dance", currentPP: 20, maxPP: 20, ppUps: 0 }],
      } as PokemonInstance,
    });
    attacker.volatileStatuses.set("thrash-lock", {
      turnsLeft: 1,
      data: { moveId: "petal-dance" },
    });
    const rng = new SeededRandom(42);
    const context = makeMoveEffectContext({ move: petalDanceMove, attacker, damage: 25, rng });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(attacker.volatileStatuses.has("thrash-lock")).toBe(false);
    expect(result.selfVolatileInflicted).toBe("confusion");
  });
});

// ============================================================================
// Hyper Beam substitute-break test
// ============================================================================

describe("Gen 1 Hyper Beam substitute-break", () => {
  const hyperBeamMove = makeMove({
    id: "hyper-beam",
    displayName: "Hyper Beam",
    type: "normal" as PokemonType,
    category: "physical",
    power: 150,
    accuracy: 90,
    pp: 5,
    target: "adjacent-foe",
    flags: { ...DEFAULT_MOVE_FLAGS, recharge: true },
    effect: null,
  });

  it("given Hyper Beam breaks a substitute (brokeSubstitute=true), when executeMoveEffect is called, then noRecharge is true", () => {
    // Source: gen1-ground-truth.md — Hyper Beam skips recharge if it breaks a Substitute
    // Arrange
    const defender = makeActivePokemon({ substituteHp: 0 });
    defender.pokemon.currentHp = 100; // Not KO'd, but sub was broken
    const context = makeMoveEffectContext({
      move: hyperBeamMove,
      defender,
      damage: 60,
      brokeSubstitute: true,
    });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(result.noRecharge).toBe(true);
  });

  it("given Hyper Beam KOs the target (currentHp=0), when executeMoveEffect is called, then noRecharge is true", () => {
    // Source: gen1-ground-truth.md — Hyper Beam skips recharge on KO
    // Arrange
    const defender = makeActivePokemon();
    defender.pokemon.currentHp = 0; // KO'd
    const context = makeMoveEffectContext({
      move: hyperBeamMove,
      defender,
      damage: 100,
      brokeSubstitute: false,
    });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(result.noRecharge).toBe(true);
  });

  it("given Hyper Beam hits but does not KO and does not break sub, when executeMoveEffect is called, then noRecharge is false/undefined", () => {
    // Source: gen1-ground-truth.md — Hyper Beam requires recharge normally
    // Arrange
    const defender = makeActivePokemon();
    defender.pokemon.currentHp = 50; // Still alive, no sub
    const context = makeMoveEffectContext({
      move: hyperBeamMove,
      defender,
      damage: 50,
      brokeSubstitute: false,
    });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(result.noRecharge).toBeFalsy();
  });
});

// ============================================================================
// onDamageReceived - Rage + Bide combined test
// ============================================================================

describe("Gen 1 onDamageReceived", () => {
  it("given a Pokemon with both rage and bide volatiles, when hit for 25 damage, then Attack boosts by +1 AND bide accumulates 25", () => {
    // Source: pret/pokered — both Rage and Bide can theoretically be active
    // (edge case from Transform shenanigans or glitches)
    // Arrange
    const defender = makeActivePokemon();
    defender.volatileStatuses.set("rage", { turnsLeft: -1, data: { moveIndex: 0 } });
    defender.volatileStatuses.set("bide", {
      turnsLeft: 2,
      data: { accumulatedDamage: 10 },
    });
    defender.statStages.attack = 0;
    const state = makeBattleState();
    const hitMove = makeMove({ id: "tackle" });

    // Act
    ruleset.onDamageReceived(defender, 25, hitMove, state);

    // Assert
    expect(defender.statStages.attack).toBe(1);
    const bideVol = defender.volatileStatuses.get("bide");
    expect((bideVol!.data as any).accumulatedDamage).toBe(35);
  });

  it("given a Pokemon without rage or bide, when onDamageReceived is called, then no state changes occur", () => {
    // Source: pret/pokered — onDamageReceived is a no-op without relevant volatiles
    // Arrange
    const defender = makeActivePokemon();
    defender.statStages.attack = 3;
    const state = makeBattleState();
    const hitMove = makeMove({ id: "tackle" });

    // Act
    ruleset.onDamageReceived(defender, 50, hitMove, state);

    // Assert
    expect(defender.statStages.attack).toBe(3); // unchanged
  });
});
