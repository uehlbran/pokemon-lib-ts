import type { ActivePokemon, BattleState, MoveEffectContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { getGen1CritRate } from "../src/Gen1CritCalc";
import { Gen1Ruleset } from "../src/Gen1Ruleset";

/**
 * Gen 1 Tier 3 Move Handler Tests
 *
 * Tests for Focus Energy, Leech Seed, Disable, Substitute custom move handlers,
 * and the shared toxic counter bug (burn/poison/leech-seed share N/16 counter).
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
      moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
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
    ...overrides,
  };
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
// Focus Energy tests
// ============================================================================

describe("Gen 1 Focus Energy handler", () => {
  const focusEnergyMove = makeMove({
    id: "focus-energy",
    displayName: "Focus Energy",
    type: "normal" as PokemonType,
    category: "status",
    power: null,
    accuracy: null,
    target: "self",
    effect: { type: "volatile-status" as const, status: "focus-energy", chance: 100 },
  });

  it("given Focus Energy used, when checking attacker volatiles, then focus-energy volatile is set with turnsLeft -1", () => {
    // Arrange — attacker has no focus-energy volatile
    const attacker = makeActivePokemon();
    const context = makeMoveEffectContext({ move: focusEnergyMove, attacker, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    // Source: pret/pokered — Focus Energy sets SUBSTATUS_FOCUS_ENERGY, permanent until switch/Haze
    expect(result.selfVolatileInflicted).toBe("focus-energy");
    expect(result.selfVolatileData).toEqual({ turnsLeft: -1 });
  });

  it("given Focus Energy already active, when used again, then fails silently (no duplicate volatile)", () => {
    // Arrange — attacker already has focus-energy
    const focusStatuses = new Map();
    focusStatuses.set("focus-energy", { turnsLeft: -1 });
    const attacker = makeActivePokemon({ volatileStatuses: focusStatuses });
    const context = makeMoveEffectContext({ move: focusEnergyMove, attacker, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert — no volatile inflicted, no error messages
    expect(result.selfVolatileInflicted).toBeFalsy();
  });

  it("given Focus Energy active, when rolling crit for a 60-base-Speed attacker, then crit rate is 7/256 (bugged — srl b single right-shift)", () => {
    // Source: pret/pokered engine/battle/effect_commands.asm — Focus Energy uses srl b (>>1, divide by 2)
    // Source: pret/pokered engine/battle/effect_commands.asm — Focus Energy executes a single
    // `srl b` (>>1, divide by 2) instead of the intended `sla b` (<<1, multiply by 2).
    // Net result is 1/4 of the normal crit rate (divide by 2 vs multiply by 2 = 1/4 ratio).
    // Base speed 60, Focus Energy active, normal move:
    //   Step 1: floor(60/2) = 30
    //   Step 2 (Focus Energy >>1): floor(30/2) = 15
    //   Step 3 (normal move /2): floor(15/2) = 7
    //   Rate: 7/256
    // Without Focus Energy:
    //   Step 1: floor(60/2) = 30
    //   Step 2 (no Focus Energy): min(255, max(1, 30*2)) = 60
    //   Step 3 (normal move): floor(60/2) = 30
    //   Rate: 30/256
    const focusRate = getGen1CritRate(60, true, false);
    const normalRate = getGen1CritRate(60, false, false);
    // Assert — Focus Energy gives a WORSE crit rate (the famous Gen 1 bug — single srl b)
    expect(focusRate).toBe(7 / 256);
    expect(normalRate).toBe(30 / 256);
    expect(focusRate).toBeLessThan(normalRate);
  });

  it("given Focus Energy active, when rolling crit for a 100-base-Speed attacker, then crit rate is 12/256 (bugged — srl b single right-shift)", () => {
    // Source: pret/pokered engine/battle/effect_commands.asm — same single `srl b` (>>1) applies
    // Base speed 100, Focus Energy active, normal move:
    //   Step 1: floor(100/2) = 50
    //   Step 2 (Focus Energy >>1): floor(50/2) = 25
    //   Step 3 (normal move /2): floor(25/2) = 12
    //   Rate: 12/256
    const focusRate = getGen1CritRate(100, true, false);
    // Assert
    expect(focusRate).toBe(12 / 256);
  });
});

// ============================================================================
// Leech Seed tests
// ============================================================================

describe("Gen 1 Leech Seed handler", () => {
  const leechSeedMove = makeMove({
    id: "leech-seed",
    displayName: "Leech Seed",
    type: "grass" as PokemonType,
    category: "status",
    power: null,
    accuracy: 90,
    target: "adjacent-foe",
    effect: { type: "volatile-status" as const, status: "leech-seed", chance: 100 },
  });

  it("given non-Grass defender, when Leech Seed hits, then leech-seed volatile is set on defender", () => {
    // Arrange — defender is Normal type (not Grass)
    const defender = makeActivePokemon({ types: ["normal"] });
    const context = makeMoveEffectContext({ move: leechSeedMove, defender, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    // Source: pret/pokered — Leech Seed sets volatile, permanent until switch/Haze
    expect(result.volatileInflicted).toBe("leech-seed");
    expect(result.volatileData).toEqual({ turnsLeft: -1 });
  });

  it("given Grass-type defender (Bulbasaur), when Leech Seed used, then fails with immunity message", () => {
    // Arrange — defender is Grass type (immune to Leech Seed in all gens)
    // Source: pret/pokered — Grass types are immune to Leech Seed
    const defender = makeActivePokemon({
      types: ["grass", "poison"] as PokemonType[],
      pokemon: {
        ...makeActivePokemon().pokemon,
        speciesId: 1,
        nickname: "Bulbasaur",
      } as PokemonInstance,
    });
    const context = makeMoveEffectContext({ move: leechSeedMove, defender, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert — Grass immunity blocks Leech Seed
    expect(result.volatileInflicted).toBeNull();
    expect(result.messages.some((m) => m.includes("doesn't affect"))).toBe(true);
  });

  it("given defender already has leech-seed, when Leech Seed used again, then fails", () => {
    // Arrange — defender already seeded
    const seededStatuses = new Map();
    seededStatuses.set("leech-seed", { turnsLeft: -1 });
    const defender = makeActivePokemon({
      types: ["normal"] as PokemonType[],
      volatileStatuses: seededStatuses,
    });
    const context = makeMoveEffectContext({ move: leechSeedMove, defender, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.volatileInflicted).toBeNull();
    expect(result.messages).toContain("But it failed!");
  });

  it("given leech-seeded defender with 160 max HP, when EoT drain calculated, then drains floor(160/16)=10", () => {
    // Arrange — defender has leech-seed, standard drain is 1/16 max HP
    // Source: pret/pokered — Leech Seed drains 1/16 of max HP per turn
    // Calculation: floor(160/16) = 10
    const defender = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        currentHp: 160,
        calculatedStats: {
          hp: 160,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 120,
        },
      } as PokemonInstance,
    });
    // Act
    const drain = ruleset.calculateLeechSeedDrain(defender);
    // Assert
    expect(drain).toBe(10);
  });

  it("given leech-seeded defender with 200 max HP, when EoT drain calculated, then drains floor(200/16)=12", () => {
    // Arrange — second triangulation case
    // Source: pret/pokered — floor(200/16) = 12
    const defender = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        currentHp: 200,
        calculatedStats: {
          hp: 200,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 120,
        },
      } as PokemonInstance,
    });
    // Act
    const drain = ruleset.calculateLeechSeedDrain(defender);
    // Assert
    expect(drain).toBe(12);
  });
});

// ============================================================================
// Disable tests
// ============================================================================

describe("Gen 1 Disable handler", () => {
  const disableMove = makeMove({
    id: "disable",
    displayName: "Disable",
    type: "normal" as PokemonType,
    category: "status",
    power: null,
    accuracy: 55,
    target: "adjacent-foe",
    effect: { type: "custom" as const, handler: "disable" },
  });

  it("given defender has moves with PP, when Disable hits, then disable volatile set with a random moveId from defender's moveset", () => {
    // Arrange — defender has tackle with PP > 0
    // Source: pret/pokered DisableEffect — picks a RANDOM move slot with PP > 0
    // (NOT the last-used move; that's a Gen 2+ behavior)
    const defender = makeActivePokemon({
      types: ["normal"] as PokemonType[],
    });
    const rng = new SeededRandom(42);
    const context = makeMoveEffectContext({ move: disableMove, defender, damage: 0, rng });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.volatileInflicted).toBe("disable");
    expect(result.volatileData).toBeDefined();
    // The disabled move must be from the defender's moveset (tackle is the only move)
    expect(result.volatileData!.data).toEqual({ moveId: "tackle" });
    // Source: pret/pokered — duration is 1-8 turns (`and 7; inc a`)
    expect(result.volatileData!.turnsLeft).toBeGreaterThanOrEqual(1);
    expect(result.volatileData!.turnsLeft).toBeLessThanOrEqual(8);
  });

  it("given defender has two moves with PP and seed 99, when Disable hits, then disables 'tackle' (slot 0)", () => {
    // Source: pret/pokered DisableEffect — picks rng.int(0, validMoves.length - 1).
    // Derivation: SeededRandom(99).int(0, 1) = 0 → picks validMoves[0] = tackle.
    // Then SeededRandom(99).int(1, 8) = 7 → duration 7 turns.
    // This test would FAIL if the implementation always picks slot 0 (no-op "fix")
    // because the second triangulation test (seed 1 → thunderbolt) catches that.
    const defender = makeActivePokemon({
      types: ["electric"] as PokemonType[],
      pokemon: {
        ...makeActivePokemon().pokemon,
        moves: [
          { moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 },
          { moveId: "thunderbolt", currentPP: 15, maxPP: 15, ppUps: 0 },
        ],
      } as PokemonInstance,
    });
    const rng = new SeededRandom(99);
    const context = makeMoveEffectContext({ move: disableMove, defender, damage: 0, rng });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert — seed 99 deterministically picks slot 0 = "tackle"
    expect(result.volatileInflicted).toBe("disable");
    const disabledMoveId = (result.volatileData!.data as { moveId: string }).moveId;
    expect(disabledMoveId).toBe("tackle");
    // Duration: SeededRandom(99) after the move-pick call gives int(1, 8) = 7
    expect(result.volatileData!.turnsLeft).toBe(7);
  });

  it("given defender has two moves with PP and seed 1, when Disable hits, then disables 'thunderbolt' (slot 1)", () => {
    // Source: pret/pokered DisableEffect — picks rng.int(0, validMoves.length - 1).
    // Derivation: SeededRandom(1).int(0, 1) = 1 → picks validMoves[1] = thunderbolt.
    // Then SeededRandom(1).int(1, 8) = 1 → duration 1 turn.
    // Triangulation: proves random selection actually works (seed 99 picks slot 0,
    // seed 1 picks slot 1 — an always-slot-0 impl would fail this test).
    const defender = makeActivePokemon({
      types: ["electric"] as PokemonType[],
      pokemon: {
        ...makeActivePokemon().pokemon,
        moves: [
          { moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 },
          { moveId: "thunderbolt", currentPP: 15, maxPP: 15, ppUps: 0 },
        ],
      } as PokemonInstance,
    });
    const rng = new SeededRandom(1);
    const context = makeMoveEffectContext({ move: disableMove, defender, damage: 0, rng });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert — seed 1 deterministically picks slot 1 = "thunderbolt"
    expect(result.volatileInflicted).toBe("disable");
    const disabledMoveId = (result.volatileData!.data as { moveId: string }).moveId;
    expect(disabledMoveId).toBe("thunderbolt");
    // Duration: SeededRandom(1) after the move-pick call gives int(1, 8) = 1
    expect(result.volatileData!.turnsLeft).toBe(1);
  });

  it("given defender has all moves at 0 PP, when Disable used, then fails", () => {
    // Arrange — all moves at 0 PP, no valid target for Disable
    // Source: pret/pokered DisableEffect — fails if no valid move to disable
    const defender = makeActivePokemon({
      types: ["normal"] as PokemonType[],
      pokemon: {
        ...makeActivePokemon().pokemon,
        moves: [{ moveId: "tackle", currentPP: 0, maxPP: 35, ppUps: 0 }],
      } as PokemonInstance,
    });
    const context = makeMoveEffectContext({ move: disableMove, defender, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.volatileInflicted).toBeNull();
    expect(result.messages).toContain("But it failed!");
  });

  it("given defender already disabled, when Disable used again, then fails", () => {
    // Arrange — defender already has disable volatile
    const disabledStatuses = new Map();
    disabledStatuses.set("disable", { turnsLeft: 3, data: { moveId: "tackle" } });
    const defender = makeActivePokemon({
      types: ["normal"] as PokemonType[],
      lastMoveUsed: "tackle",
      volatileStatuses: disabledStatuses,
    });
    const context = makeMoveEffectContext({ move: disableMove, defender, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.volatileInflicted).toBeNull();
    expect(result.messages).toContain("But it failed!");
  });

  it("given disable-countdown is in EoT order, then getEndOfTurnOrder includes it after leech-seed", () => {
    // Arrange / Act
    // Source: pret/pokered — Disable countdown is processed end-of-turn
    const eotOrder = ruleset.getEndOfTurnOrder();
    // Assert
    expect(eotOrder).toContain("disable-countdown");
    const leechIdx = eotOrder.indexOf("leech-seed");
    const disableIdx = eotOrder.indexOf("disable-countdown");
    expect(disableIdx).toBeGreaterThan(leechIdx);
  });
});

// ============================================================================
// Substitute tests
// ============================================================================

describe("Gen 1 Substitute handler", () => {
  const substituteMove = makeMove({
    id: "substitute",
    displayName: "Substitute",
    type: "normal" as PokemonType,
    category: "status",
    power: null,
    accuracy: null,
    target: "self",
    effect: { type: "custom" as const, handler: "substitute" },
  });

  it("given attacker with full HP (100), when Substitute used, then substituteHp = 25 and currentHp = 75", () => {
    // Arrange
    // Source: pret/pokered SubstituteEffect — costs floor(maxHp/4)
    // maxHp=100, subHp=floor(100/4)=25, currentHp after: 100-25=75
    const attacker = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        currentHp: 100,
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
    const context = makeMoveEffectContext({ move: substituteMove, attacker, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert — HP cost is communicated via customDamage for engine to process;
    // substituteHp is set directly by the ruleset
    expect(attacker.substituteHp).toBe(25);
    expect(result.customDamage).toEqual({ target: "attacker", amount: 25, source: "substitute" });
    expect(result.selfVolatileInflicted).toBe("substitute");
    expect(result.selfVolatileData).toEqual({ turnsLeft: -1 });
    expect(result.messages.some((m) => m.includes("put in a substitute"))).toBe(true);
  });

  it("given attacker with 200 max HP and full HP, when Substitute used, then substituteHp = 50 and customDamage = 50", () => {
    // Arrange — second triangulation case: maxHp=200, subHp=floor(200/4)=50
    // Source: pret/pokered SubstituteEffect
    const attacker = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        currentHp: 200,
        calculatedStats: {
          hp: 200,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 120,
        },
      } as PokemonInstance,
    });
    const context = makeMoveEffectContext({ move: substituteMove, attacker, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert — HP cost via customDamage, substituteHp set directly
    expect(attacker.substituteHp).toBe(50);
    expect(result.customDamage).toEqual({ target: "attacker", amount: 50, source: "substitute" });
    expect(result.selfVolatileInflicted).toBe("substitute");
  });

  it("given attacker with exactly 25 HP out of 100, when Substitute used, then fails (boundary: currentHp <= subHp)", () => {
    // Arrange — Gen 1 uses <= check: at exactly 25% HP, Substitute FAILS
    // Source: pret/pokered SubstituteEffect — uses <= comparison: `cp b; jr c,.notEnoughHP`
    // where b = subCost and a = currentHP. The carry flag triggers when a <= b.
    // subHp = floor(100/4) = 25, currentHp = 25 <= 25, so it fails.
    const attacker = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        currentHp: 25,
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
    const context = makeMoveEffectContext({ move: substituteMove, attacker, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert — fails: HP unchanged, no substitute created
    expect(attacker.substituteHp).toBe(0);
    expect(result.selfVolatileInflicted).toBeFalsy();
    expect(result.messages).toContain("But it does not have enough HP!");
    // HP must remain at 25 — Substitute creation failed so no HP was deducted
    expect(attacker.pokemon.currentHp).toBe(25);
  });

  it("given attacker with 24 HP out of 100, when Substitute used, then fails (insufficient HP)", () => {
    // Arrange — 24 < 25 (subHp), so it should fail
    // Source: pret/pokered SubstituteEffect — fails when currentHp < subHp
    const attacker = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        currentHp: 24,
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
    const context = makeMoveEffectContext({ move: substituteMove, attacker, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert — fails: HP unchanged, no substitute created
    expect(attacker.pokemon.currentHp).toBe(24);
    expect(attacker.substituteHp).toBe(0);
    expect(result.selfVolatileInflicted).toBeFalsy();
    expect(result.messages).toContain("But it does not have enough HP!");
  });

  it("given substitute already active, when Substitute used again, then fails", () => {
    // Arrange — attacker already has a substitute
    const attacker = makeActivePokemon({
      substituteHp: 25,
      pokemon: {
        ...makeActivePokemon().pokemon,
        currentHp: 100,
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
    const context = makeMoveEffectContext({ move: substituteMove, attacker, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert — fails because substitute already active
    expect(attacker.pokemon.currentHp).toBe(100); // HP not deducted
    expect(result.selfVolatileInflicted).toBeFalsy();
    expect(result.messages).toContain("But it failed!");
  });
});

// ============================================================================
// Toxic counter shared bug tests
// ============================================================================

describe("Gen 1 shared toxic counter bug", () => {
  it("given burned Pokemon with toxic-counter over 3 EoT turns, then damage is 1/16, 2/16, 3/16 of max HP", () => {
    // Arrange
    // Source: gen1-ground-truth.md §8 — burn, poison, and Leech Seed share the toxic N/16 counter.
    // This bug only manifests when the toxic-counter volatile exists (from Toxic).
    // Pokemon has burn status + toxic-counter volatile (as if Toxic was used then status changed).
    // maxHp = 160: floor(160*1/16)=10, floor(160*2/16)=20, floor(160*3/16)=30
    const pokemon = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        currentHp: 160,
        status: "burn",
        calculatedStats: {
          hp: 160,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 120,
        },
      } as PokemonInstance,
    });
    // Set up toxic counter at 1 (as if Toxic was used)
    pokemon.volatileStatuses.set("toxic-counter", { turnsLeft: -1, data: { counter: 1 } });
    const state = makeBattleState();

    // Act — simulate 3 EoT ticks
    const dmg1 = ruleset.applyStatusDamage(pokemon, "burn", state);
    const dmg2 = ruleset.applyStatusDamage(pokemon, "burn", state);
    const dmg3 = ruleset.applyStatusDamage(pokemon, "burn", state);

    // Assert — damage escalates using the shared counter
    expect(dmg1).toBe(10); // floor(160*1/16) = 10
    expect(dmg2).toBe(20); // floor(160*2/16) = 20
    expect(dmg3).toBe(30); // floor(160*3/16) = 30
  });

  it("given poisoned Pokemon with toxic-counter over 3 EoT turns, then damage escalates same as burn", () => {
    // Arrange
    // Source: gen1-ground-truth.md §8 — poison shares the same counter
    // maxHp = 160: floor(160*1/16)=10, floor(160*2/16)=20, floor(160*3/16)=30
    const pokemon = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        currentHp: 160,
        status: "poison",
        calculatedStats: {
          hp: 160,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 120,
        },
      } as PokemonInstance,
    });
    pokemon.volatileStatuses.set("toxic-counter", { turnsLeft: -1, data: { counter: 1 } });
    const state = makeBattleState();

    // Act
    const dmg1 = ruleset.applyStatusDamage(pokemon, "poison", state);
    const dmg2 = ruleset.applyStatusDamage(pokemon, "poison", state);
    const dmg3 = ruleset.applyStatusDamage(pokemon, "poison", state);

    // Assert — damage escalates using the shared counter
    expect(dmg1).toBe(10); // floor(160*1/16) = 10
    expect(dmg2).toBe(20); // floor(160*2/16) = 20
    expect(dmg3).toBe(30); // floor(160*3/16) = 30
  });

  it("given burned Pokemon with no toxic-counter, when EoT runs, then damage is flat 1/16", () => {
    // Arrange — no toxic-counter volatile, so burn deals standard flat 1/16
    // Source: pret/pokered — standard burn damage is 1/16 max HP when not sharing toxic counter
    // maxHp = 160: floor(160/16) = 10 each turn (flat, no escalation)
    const pokemon = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        currentHp: 160,
        status: "burn",
        calculatedStats: {
          hp: 160,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 120,
        },
      } as PokemonInstance,
    });
    const state = makeBattleState();

    // Act
    const dmg1 = ruleset.applyStatusDamage(pokemon, "burn", state);
    const dmg2 = ruleset.applyStatusDamage(pokemon, "burn", state);

    // Assert — flat damage, no escalation
    expect(dmg1).toBe(10); // floor(160/16) = 10
    expect(dmg2).toBe(10); // still 10, no counter increment
  });

  it("given burned Pokemon that also has leech-seed and toxic-counter, when EoT runs, then leech seed drain uses next counter value after burn tick", () => {
    // Arrange
    // Source: gen1-ground-truth.md §8 — burn, poison, and Leech Seed share the N/16 counter.
    // Burn ticks first (status-damage comes before leech-seed in EoT order).
    // maxHp = 160, counter starts at 1:
    //   Burn tick: uses counter=1, deals floor(160*1/16)=10, increments to 2
    //   Leech Seed: uses counter=2, drains floor(160*2/16)=20, increments to 3
    const pokemon = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        currentHp: 160,
        status: "burn",
        calculatedStats: {
          hp: 160,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 120,
        },
      } as PokemonInstance,
    });
    pokemon.volatileStatuses.set("toxic-counter", { turnsLeft: -1, data: { counter: 1 } });
    pokemon.volatileStatuses.set("leech-seed", { turnsLeft: -1 });
    const state = makeBattleState();

    // Act — burn tick first, then leech seed
    const burnDmg = ruleset.applyStatusDamage(pokemon, "burn", state);
    const leechDrain = ruleset.calculateLeechSeedDrain(pokemon);

    // Assert — counter progresses: burn uses 1, leech uses 2
    expect(burnDmg).toBe(10); // floor(160*1/16) = 10
    expect(leechDrain).toBe(20); // floor(160*2/16) = 20
    // Counter should now be at 3 after both ticks
    const counter = pokemon.volatileStatuses.get("toxic-counter")?.data?.counter;
    expect(counter).toBe(3);
  });
});
