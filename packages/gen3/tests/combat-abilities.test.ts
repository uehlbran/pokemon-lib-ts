import type {
  ActivePokemon,
  BattleState,
  CritContext,
  MoveEffectContext,
} from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType, StatBlock } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen3DataManager } from "../src/data";
import { Gen3Ruleset } from "../src/Gen3Ruleset";

/**
 * Gen 3 Combat Abilities Tests
 *
 * Tests for:
 *   - Serene Grace: doubles secondary effect chance (cap at 100%)
 *   - Battle Armor / Shell Armor: immunity to critical hits
 *
 * Source hierarchy for Gen 3:
 *   1. pret/pokeemerald disassembly (ground truth)
 *   2. Pokemon Showdown Gen 3 mod
 *   3. Bulbapedia
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Create a mock RNG with configurable int result. */
function createMockRng(intReturnValue: number) {
  return {
    next: () => 0.5,
    int: (_min: number, _max: number) => intReturnValue,
    chance: (_percent: number) => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  };
}

/** Create a minimal ActivePokemon mock. */
function createMockPokemon(opts: {
  types?: PokemonType[];
  ability?: string;
  heldItem?: string | null;
  status?: string | null;
  speciesId?: number;
}): ActivePokemon {
  const stats: StatBlock = {
    hp: 200,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    speed: 100,
  };

  const pokemon = {
    uid: "test-mon",
    speciesId: opts.speciesId ?? 1,
    nickname: null,
    level: 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: 200,
    moves: [{ moveId: "tackle", pp: 35, maxPp: 35 }],
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
  };

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
    volatileStatuses: new Map(),
    types: opts.types ?? ["normal"],
    ability: opts.ability ?? "",
    lastMoveUsed: null,
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
  } as unknown as ActivePokemon;
}

/** Create a minimal move data object. */
function createMove(overrides?: Partial<MoveData>): MoveData {
  return {
    id: "tackle",
    name: "Tackle",
    type: "normal",
    category: "physical",
    power: 40,
    accuracy: 100,
    pp: 35,
    maxPp: 35,
    priority: 0,
    target: "single" as any,
    flags: {} as any,
    generation: 3,
    critRatio: 0,
    effectChance: null,
    effects: [],
    description: "",
    ...overrides,
  } as MoveData;
}

/** Create a minimal BattleState. */
function createMinimalBattleState(attacker: ActivePokemon, defender: ActivePokemon): BattleState {
  return {
    sides: [
      {
        active: [attacker],
        team: [attacker.pokemon],
        screens: { reflect: null, lightScreen: null, auroraVeil: null },
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
        trainer: null,
      },
      {
        active: [defender],
        team: [defender.pokemon],
        screens: { reflect: null, lightScreen: null, auroraVeil: null },
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
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
    phase: "action-select" as const,
    winner: null,
    ended: false,
  } as BattleState;
}

const dataManager = createGen3DataManager();
const ruleset = new Gen3Ruleset(dataManager);

// ===========================================================================
// Serene Grace -- doubles secondary effect chance
// ===========================================================================

describe("Gen 3 Serene Grace ability", () => {
  // Source: Bulbapedia -- "Serene Grace doubles the chance of moves' secondary
  //   effects occurring."
  // Source: pret/pokeemerald src/battle_util.c -- ABILITY_SERENE_GRACE check
  //   doubles percentChance before the Random() % 100 < percentChance comparison.

  it("given attacker with Serene Grace, when move has 30% secondary effect chance, then chance is doubled to 60%", () => {
    // Source: Bulbapedia -- Thunder has 30% paralysis chance; with Serene Grace -> 60%.
    // pret/pokeemerald: percentChance *= 2 when attacker has ABILITY_SERENE_GRACE.
    //
    // Setup: attacker has Serene Grace, Thunder has 30% paralysis chance.
    // Mock RNG returns 59 (0-indexed), which is < 60 (doubled) but >= 30 (original).
    // Without Serene Grace: rng.int(0, 99) returns 59, 59 < 30 = false -> no status.
    // With Serene Grace:    rng.int(0, 99) returns 59, 59 < 60 = true  -> status inflicted.
    const attacker = createMockPokemon({ types: ["electric"], ability: "serene-grace" });
    const defender = createMockPokemon({ types: ["normal"] });
    const state = createMinimalBattleState(attacker, defender);

    // Thunder: 30% chance to paralyze
    const thunderMove = createMove({
      id: "thunder",
      name: "Thunder",
      type: "electric",
      category: "special",
      power: 120,
      effect: {
        type: "status-chance",
        status: "paralysis",
        chance: 30,
      },
    });

    // rng.int(0, 99) returns 59 -> 59 < 60 (doubled) = true
    const rng = createMockRng(59);
    const context: MoveEffectContext = {
      attacker,
      defender,
      move: thunderMove,
      damage: 100,
      state,
      rng,
    } as MoveEffectContext;

    const result = ruleset.executeMoveEffect(context);

    // Serene Grace doubles 30% -> 60%; rng returns 59 which is < 60 -> status inflicted
    expect(result.statusInflicted).toBe("paralysis");
  });

  it("given attacker with Serene Grace, when move has 60% secondary effect chance, then chance is capped at 100%", () => {
    // Source: Bulbapedia -- Serene Grace doubles the chance but cannot exceed 100%.
    // pret/pokeemerald: Math.min(chance * 2, 100) -> 60% * 2 = 120% -> capped at 100%.
    //
    // Any rng value from 0-99 should be < 100 -> always succeeds.
    const attacker = createMockPokemon({ types: ["normal"], ability: "serene-grace" });
    const defender = createMockPokemon({ types: ["normal"] });
    const state = createMinimalBattleState(attacker, defender);

    // Hypothetical move with 60% flinch chance (doubled = 120% -> capped to 100%)
    const move = createMove({
      id: "headbutt",
      name: "Headbutt",
      type: "normal",
      category: "physical",
      power: 70,
      effect: {
        type: "volatile-status",
        status: "flinch",
        chance: 60,
      },
    });

    // rng.int(0, 99) returns 99 -> even the max value < 100 -> always succeeds
    const rng = createMockRng(99);
    const context: MoveEffectContext = {
      attacker,
      defender,
      move,
      damage: 80,
      state,
      rng,
    } as MoveEffectContext;

    const result = ruleset.executeMoveEffect(context);

    // 60% doubled = 120% -> capped at 100%; rng 99 < 100 -> inflicted
    expect(result.volatileInflicted).toBe("flinch");
  });

  it("given attacker without Serene Grace, when move has 30% secondary effect chance and rng is 59, then effect does not trigger", () => {
    // Source: pret/pokeemerald -- without ABILITY_SERENE_GRACE, percentChance stays at 30.
    // rng.int(0, 99) returns 59, 59 < 30 = false -> no status inflicted.
    const attacker = createMockPokemon({ types: ["electric"], ability: "" });
    const defender = createMockPokemon({ types: ["normal"] });
    const state = createMinimalBattleState(attacker, defender);

    const thunderMove = createMove({
      id: "thunder",
      name: "Thunder",
      type: "electric",
      category: "special",
      power: 120,
      effect: {
        type: "status-chance",
        status: "paralysis",
        chance: 30,
      },
    });

    // rng.int(0, 99) returns 59 -> 59 < 30 = false -> no status
    const rng = createMockRng(59);
    const context: MoveEffectContext = {
      attacker,
      defender,
      move: thunderMove,
      damage: 100,
      state,
      rng,
    } as MoveEffectContext;

    const result = ruleset.executeMoveEffect(context);

    // Without Serene Grace: 30% unchanged; 59 >= 30 -> no status
    expect(result.statusInflicted).toBe(null);
  });

  it("given attacker with Serene Grace, when move has 10% stat change chance, then chance is doubled to 20%", () => {
    // Source: Bulbapedia -- Serene Grace doubles ALL secondary effect chances.
    // 10% -> 20%. rng.int(0, 99) returns 19 -> 19 < 20 = true.
    const attacker = createMockPokemon({ types: ["normal"], ability: "serene-grace" });
    const defender = createMockPokemon({ types: ["normal"] });
    const state = createMinimalBattleState(attacker, defender);

    // Move with 10% stat change chance
    const move = createMove({
      id: "test-move",
      name: "Test Move",
      type: "normal",
      category: "physical",
      power: 80,
      effect: {
        type: "stat-change",
        target: "opponent",
        chance: 10,
        changes: [{ stat: "defense", stages: -1 }],
      },
    });

    // rng returns 19 -> 19 < 20 (doubled from 10) -> true
    // Without Serene Grace: 19 < 10 = false
    const rng = createMockRng(19);
    const context: MoveEffectContext = {
      attacker,
      defender,
      move,
      damage: 80,
      state,
      rng,
    } as MoveEffectContext;

    const result = ruleset.executeMoveEffect(context);

    // 10% doubled to 20%; rng 19 < 20 -> stat change applied
    expect(result.statChanges.length).toBe(1);
    expect(result.statChanges[0]!.stat).toBe("defense");
    expect(result.statChanges[0]!.stages).toBe(-1);
  });
});

// ===========================================================================
// Battle Armor / Shell Armor -- critical hit immunity
// ===========================================================================

describe("Gen 3 Battle Armor / Shell Armor abilities", () => {
  // Source: Bulbapedia -- "Battle Armor: The Pokemon is protected against critical hits."
  //   "Shell Armor: The Pokemon is protected against critical hits."
  // Source: pret/pokeemerald src/battle_util.c -- ABILITY_BATTLE_ARMOR / ABILITY_SHELL_ARMOR
  //   check in CalcCritChanceStage prevents crits entirely.

  it("given defender with Battle Armor, when rollCritical is called, then returns false", () => {
    // Source: pret/pokeemerald -- ABILITY_BATTLE_ARMOR prevents crits entirely.
    // Even with rng returning 1 (which normally guarantees a crit), Battle Armor
    // should override and return false.
    const attacker = createMockPokemon({ types: ["normal"] });
    const defender = createMockPokemon({ types: ["normal"], ability: "battle-armor" });

    const move = createMove();

    // rng.int(1, 16) returns 1 -> would normally be a crit at stage 0 (1/16)
    const rng = createMockRng(1);
    const state = createMinimalBattleState(attacker, defender);

    const critContext: CritContext = {
      attacker,
      move,
      state,
      rng: rng as CritContext["rng"],
      defender,
    };

    const isCrit = ruleset.rollCritical(critContext);
    // Battle Armor: always false regardless of RNG
    expect(isCrit).toBe(false);
  });

  it("given defender with Shell Armor, when rollCritical is called, then returns false", () => {
    // Source: pret/pokeemerald -- ABILITY_SHELL_ARMOR has the same effect as ABILITY_BATTLE_ARMOR.
    // Both prevent critical hits entirely.
    const attacker = createMockPokemon({ types: ["normal"] });
    const defender = createMockPokemon({ types: ["water"], ability: "shell-armor" });

    const move = createMove();

    // rng.int(1, 16) returns 1 -> would normally be a crit
    const rng = createMockRng(1);
    const state = createMinimalBattleState(attacker, defender);

    const critContext: CritContext = {
      attacker,
      move,
      state,
      rng: rng as CritContext["rng"],
      defender,
    };

    const isCrit = ruleset.rollCritical(critContext);
    // Shell Armor: always false regardless of RNG
    expect(isCrit).toBe(false);
  });

  it("given defender without crit immunity ability, when rollCritical is called with rng returning 1, then defers to normal logic and crits", () => {
    // Source: pret/pokeemerald -- without ABILITY_BATTLE_ARMOR or ABILITY_SHELL_ARMOR,
    // the normal crit calculation applies.
    // At stage 0, denominator = 16. rng.int(1, 16) returning 1 means 1 === 1 -> crit.
    const attacker = createMockPokemon({ types: ["normal"] });
    const defender = createMockPokemon({ types: ["normal"], ability: "" });

    const move = createMove();

    // rng.int(1, 16) returns 1 -> crit
    const rng = createMockRng(1);
    const state = createMinimalBattleState(attacker, defender);

    const critContext: CritContext = {
      attacker,
      move,
      state,
      rng: rng as CritContext["rng"],
      defender,
    };

    const isCrit = ruleset.rollCritical(critContext);
    // No crit immunity: stage 0, denominator 16, rng 1 === 1 -> true
    expect(isCrit).toBe(true);
  });

  it("given defender with Battle Armor and attacker with high crit stage, when rollCritical is called, then still returns false", () => {
    // Source: pret/pokeemerald -- Battle Armor overrides ALL crit stages.
    // Even with Scope Lens + high-crit move (stage 2, denominator 4), Battle Armor
    // prevents the crit entirely.
    const attacker = createMockPokemon({
      types: ["normal"],
      heldItem: "scope-lens",
    });
    const defender = createMockPokemon({ types: ["normal"], ability: "battle-armor" });

    // Slash has critRatio: 1, plus Scope Lens = stage 2
    const move = createMove({
      id: "slash",
      name: "Slash",
      type: "normal",
      category: "physical",
      power: 70,
      critRatio: 1,
    });

    // rng.int(1, 4) returns 1 -> would be crit at stage 2 (denominator 4)
    const rng = createMockRng(1);
    const state = createMinimalBattleState(attacker, defender);

    const critContext: CritContext = {
      attacker,
      move,
      state,
      rng: rng as CritContext["rng"],
      defender,
    };

    const isCrit = ruleset.rollCritical(critContext);
    // Battle Armor still prevents the crit
    expect(isCrit).toBe(false);
  });
});
