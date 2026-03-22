import type { ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { getGen1CritRate } from "../src/Gen1CritCalc";
import { Gen1Ruleset } from "../src/Gen1Ruleset";

/**
 * Gen 1 Mechanics Regression Tests — Bughunt Audit
 *
 * This file contains regression tests for Gen 1 mechanics verified against
 * pret/pokered disassembly during the bughunt/gen12-mechanics audit.
 *
 * Each test documents the source in pret/pokered and the expected value.
 */

// ---------------------------------------------------------------------------
// Test helpers (kept minimal — same pattern as gen1-mechanics.test.ts)
// ---------------------------------------------------------------------------

const ruleset = new Gen1Ruleset();

const DEFAULT_FLAGS: MoveData["flags"] = {
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
    id: "tackle",
    displayName: "Tackle",
    type: "normal" as PokemonType,
    category: "physical",
    power: 40,
    accuracy: 100,
    pp: 35,
    priority: 0,
    target: "adjacent-foe",
    flags: DEFAULT_FLAGS,
    effect: null,
    description: "A move.",
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
    stellarBoostedTypes: [],
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

// ---------------------------------------------------------------------------
// SECTION 1: Focus Energy crit rate bug (Gen 1)
// ---------------------------------------------------------------------------

describe("Gen 1 Focus Energy crit rate bug", () => {
  it("given base speed 100 Pokemon without Focus Energy, when calculating crit rate, then threshold = floor(100/2) = 50/256", () => {
    // Source: pret/pokered engine/battle/core.asm CriticalHitTest
    //   b = baseSpeed >> 1 = 50
    //   sla b (no FE) → b = 100
    //   srl b (normal move) → b = 50
    //   Final: 50/256 ≈ 19.5%
    const rate = getGen1CritRate(100, false, false);
    expect(rate).toBe(50 / 256);
  });

  it("given base speed 100 Pokemon with Focus Energy active, when calculating crit rate, then threshold = 12/256 (1/4 of normal — bugged)", () => {
    // Source: pret/pokered engine/battle/core.asm CriticalHitTest
    //   b = baseSpeed >> 1 = 50
    //   srl b (FE bug: single right-shift instead of left-shift) → b = 25
    //   srl b (normal move) → b = 12
    //   Final: 12/256 ≈ 4.7% — LESS than the 50/256 normal rate (the Gen 1 bug)
    // Intended behavior was 4× normal rate (200/256), but bug gives 1/4 normal rate (12/256).
    const rate = getGen1CritRate(100, true, false);
    expect(rate).toBe(12 / 256);
  });

  it("given Focus Energy active with base speed 100, when crit rate is computed, then rate is LOWER than without Focus Energy", () => {
    // Source: pret/pokered — Focus Energy bug causes the OPPOSITE of intended effect
    const normalRate = getGen1CritRate(100, false, false);
    const focusEnergyRate = getGen1CritRate(100, true, false);
    expect(focusEnergyRate).toBeLessThan(normalRate);
  });

  it("given base speed 80 Pokemon with Focus Energy, when calculating crit rate, then threshold = floor(floor(40/2)/2) = 10/256", () => {
    // Source: pret/pokered CriticalHitTest — same bug applies regardless of species
    //   b = 80 >> 1 = 40
    //   srl b (FE) → b = 20
    //   srl b (normal move) → b = 10
    //   Final: 10/256
    const rate = getGen1CritRate(80, true, false);
    expect(rate).toBe(10 / 256);
  });

  it("given a high-crit move (Slash) with base speed 100 and no Focus Energy, then threshold = min(255, 400) = 255/256", () => {
    // Source: pret/pokered CriticalHitTest — high-crit move path:
    //   b = 100 >> 1 = 50
    //   sla b (no FE: ×2) → b = 100
    //   sla b; sla b (high-crit ×4) → b = 400 → capped at 255
    //   Final: min(255, 400) = 255/256
    // Note: implementation does ×2 in step 2 then ×4 in step 3, not ×2 then ×2.
    const rate = getGen1CritRate(100, false, true);
    expect(rate).toBe(255 / 256);
  });
});

// ---------------------------------------------------------------------------
// SECTION 2: Gen 1 1/256 miss bug
// ---------------------------------------------------------------------------

describe("Gen 1 1/256 miss bug", () => {
  it("given a 100% accuracy move, when the RNG roll is 255, then the move MISSES (1/256 bug)", () => {
    // Source: pret/pokered engine/battle/core.asm CalcHitChance
    //   100% accuracy → threshold = 255 (stored as 0xFF)
    //   Hit check: random(0..255) < 255 → miss when random = 255
    //   This is 1/256 chance to miss even for 100% accurate moves.
    const attacker = makeActivePokemon();
    const defender = makeActivePokemon();
    const move = makeMove({ accuracy: 100, target: "adjacent-foe" });
    const state = makeBattleState();

    // Mock RNG that always returns 255 — the only roll that causes a miss for 100% accuracy
    const rng = { int: () => 255, chance: () => false } as unknown as SeededRandom;

    const hit = ruleset.doesMoveHit({ attacker, defender, move, state, rng });
    expect(hit).toBe(false);
  });

  it("given a 100% accuracy move, when the RNG roll is 254, then the move HITS", () => {
    // Source: pret/pokered — random(0..255) < 255 → hit for all rolls 0..254 (255/256 probability)
    const attacker = makeActivePokemon();
    const defender = makeActivePokemon();
    const move = makeMove({ accuracy: 100, target: "adjacent-foe" });
    const state = makeBattleState();

    const rng = { int: () => 254, chance: () => false } as unknown as SeededRandom;

    const hit = ruleset.doesMoveHit({ attacker, defender, move, state, rng });
    expect(hit).toBe(true);
  });

  it("given a self-targeting 100% accuracy move, when the RNG roll is 255, then the move HITS (self-targeting exempt)", () => {
    // Source: Showdown gen1 scripts.ts — self-targeting moves get +1 threshold (256), making
    // roll < 256 always true. This exempts moves like Recover, Agility from the 1/256 bug.
    const attacker = makeActivePokemon();
    const defender = makeActivePokemon();
    const move = makeMove({ accuracy: 100, target: "self" });
    const state = makeBattleState();

    const rng = { int: () => 255, chance: () => false } as unknown as SeededRandom;

    const hit = ruleset.doesMoveHit({ attacker, defender, move, state, rng });
    expect(hit).toBe(true);
  });

  it("given a move with null accuracy (Swift), when doesMoveHit is called, then always returns true (no RNG roll)", () => {
    // Source: pret/pokered — Swift uses EFFECT_SWIFT which skips the hit check entirely
    const attacker = makeActivePokemon();
    const defender = makeActivePokemon();
    const swiftMove = makeMove({ accuracy: null });
    const state = makeBattleState();

    // RNG that would normally cause a miss — irrelevant for Swift
    const rng = { int: () => 255, chance: () => false } as unknown as SeededRandom;

    const hit = ruleset.doesMoveHit({ attacker, defender, move: swiftMove, state, rng });
    expect(hit).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SECTION 3: Permanent freeze (Gen 1)
// ---------------------------------------------------------------------------

describe("Gen 1 permanent freeze", () => {
  it("given a frozen Pokemon, when checkFreezeThaw is called, then always returns false (no natural thaw)", () => {
    // Source: pret/pokered — there is no thaw check in Gen 1. Frozen Pokemon remain frozen
    // until hit by a Fire-type damaging move or cured by an item (or Haze).
    // IsFrozenText is printed and the Pokemon cannot act — no random thaw check.
    const pokemon = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        status: "freeze",
      } as PokemonInstance,
    });
    const rng = new SeededRandom(1);

    // Run 100 times to confirm: never thaws naturally
    for (let i = 0; i < 100; i++) {
      expect(ruleset.checkFreezeThaw(pokemon, rng)).toBe(false);
    }
  });

  it("given a frozen Pokemon, when processEndOfTurnDefrost is called, then always returns false (no EoT defrost in Gen 1)", () => {
    // Source: pret/pokered — Gen 1 has no end-of-turn defrost step.
    // The getEndOfTurnOrder() for Gen 1 does not include 'defrost'.
    const pokemon = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        status: "freeze",
      } as PokemonInstance,
    });
    const rng = new SeededRandom(999);

    for (let i = 0; i < 100; i++) {
      expect(ruleset.processEndOfTurnDefrost(pokemon, rng)).toBe(false);
    }
  });

  it("given Gen 1 end-of-turn order, when retrieved, then does not include 'defrost' effect", () => {
    // Source: pret/pokered — no thaw step in Gen 1 EoT processing
    const order = ruleset.getEndOfTurnOrder();
    expect(order).not.toContain("defrost");
  });
});

// ---------------------------------------------------------------------------
// SECTION 4: Gen 1 sleep counter — cannot act on wake turn
// ---------------------------------------------------------------------------

describe("Gen 1 sleep counter — cannot act on wake turn", () => {
  it("given a Pokemon with sleep-counter turnsLeft=1, when processSleepTurn is called, then returns false (cannot act on wake turn)", () => {
    // Source: pret/pokered engine/battle/core.asm — wake-up path:
    //   dec a (decrement counter) → jumps to .wokeUp when counter hits 0
    //   .sleepDone: sets 'enemy can't move this turn' → cannot act
    // Gen 1: wake turn wastes the action. Return false = cannot act.
    const pokemon = makeActivePokemon({
      pokemon: { ...makeActivePokemon().pokemon, status: "sleep" } as PokemonInstance,
    });
    pokemon.volatileStatuses.set("sleep-counter", { turnsLeft: 1 });

    const state = makeBattleState();
    const canAct = ruleset.processSleepTurn(pokemon, state);

    expect(canAct).toBe(false);
    // Status should be cleared (woke up)
    expect(pokemon.pokemon.status).toBeNull();
  });

  it("given a Pokemon with sleep-counter turnsLeft=3, when processSleepTurn is called, then returns false (still asleep) and decrements counter", () => {
    // Source: pret/pokered — dec a decrements the sleep counter before the zero check
    // Returning false means the Pokemon cannot act this turn.
    const pokemon = makeActivePokemon({
      pokemon: { ...makeActivePokemon().pokemon, status: "sleep" } as PokemonInstance,
    });
    pokemon.volatileStatuses.set("sleep-counter", { turnsLeft: 3 });

    const state = makeBattleState();
    const canAct = ruleset.processSleepTurn(pokemon, state);

    expect(canAct).toBe(false);
    expect(pokemon.volatileStatuses.get("sleep-counter")?.turnsLeft).toBe(2);
    // Status remains sleep (not yet at 0)
    expect(pokemon.pokemon.status).toBe("sleep");
  });

  it("given sleep duration rolled by rollSleepTurns, when result is verified, then range is 1-7 (Gen 1 range)", () => {
    // Source: pret/pokered engine/battle/move_effects/sleep.asm — Gen 1 sleep counter:
    //   BattleRandom AND 7, reject 0 and 7, giving range 1-6. Actually: pret/pokered
    //   adds 1, gives 1-7 inclusive.
    // Verify via sampling with known seeds.
    const rng = new SeededRandom(12345);
    const results = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const turns = ruleset.rollSleepTurns(rng);
      expect(turns).toBeGreaterThanOrEqual(1);
      expect(turns).toBeLessThanOrEqual(7);
      results.add(turns);
    }
    // Should cover multiple values in the range
    expect(results.size).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// SECTION 5: Toxic + shared counter (Gen 1)
// ---------------------------------------------------------------------------

describe("Gen 1 Toxic counter shared with burn/poison/Leech Seed", () => {
  it("given a badly-poisoned Pokemon with toxic-counter at 1, when applyStatusDamage is called, then takes 1/16 max HP", () => {
    // Source: gen1-ground-truth.md §8 — Toxic deals N/16 max HP where N = counter value
    // Counter starts at 1 on the first EoT tick.
    const pokemon = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        status: "badly-poisoned",
        calculatedStats: {
          hp: 160,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 100,
        },
      } as PokemonInstance,
    });
    pokemon.volatileStatuses.set("toxic-counter", { turnsLeft: -1, data: { counter: 1 } });

    const state = makeBattleState();
    const damage = ruleset.applyStatusDamage(pokemon, "badly-poisoned", state);

    // 1/16 of 160 = 10
    expect(damage).toBe(10);
  });

  it("given a badly-poisoned Pokemon with toxic-counter at 3, when applyStatusDamage is called, then takes 3/16 max HP", () => {
    // Source: gen1-ground-truth.md §8 — counter escalates each EoT by 1
    // At counter=3: 3/16 of 160 = 30
    const pokemon = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        status: "badly-poisoned",
        calculatedStats: {
          hp: 160,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 100,
        },
      } as PokemonInstance,
    });
    pokemon.volatileStatuses.set("toxic-counter", { turnsLeft: -1, data: { counter: 3 } });

    const state = makeBattleState();
    const damage = ruleset.applyStatusDamage(pokemon, "badly-poisoned", state);

    // 3/16 of 160 = 30
    expect(damage).toBe(30);
  });

  it("given a badly-poisoned Pokemon with toxic-counter present, when applyStatusDamage is called, then counter increments for next turn", () => {
    // Source: gen1-ground-truth.md §8 — counter is incremented each turn within applyStatusDamage
    const pokemon = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        status: "badly-poisoned",
        calculatedStats: {
          hp: 160,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 100,
        },
      } as PokemonInstance,
    });
    const counterState = { turnsLeft: -1, data: { counter: 2 } };
    pokemon.volatileStatuses.set("toxic-counter", counterState);

    const state = makeBattleState();
    ruleset.applyStatusDamage(pokemon, "badly-poisoned", state);

    // Counter should have incremented to 3
    expect(counterState.data.counter).toBe(3);
  });

  it("given a poisoned Pokemon without toxic-counter volatile, when applyStatusDamage is called, then deals standard 1/16 max HP", () => {
    // Source: gen1-ground-truth.md §8 — regular poison (without toxic-counter) deals 1/16 max HP per turn
    const pokemon = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        status: "poison",
        calculatedStats: {
          hp: 160,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 100,
        },
      } as PokemonInstance,
    });
    // No toxic-counter volatile

    const state = makeBattleState();
    const damage = ruleset.applyStatusDamage(pokemon, "poison", state);

    // Standard poison: 1/16 of 160 = 10
    expect(damage).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// SECTION 6: Toxic counter reset on Gen 1 switch-out
// ---------------------------------------------------------------------------

describe("Gen 1 Toxic counter reset on switch-out", () => {
  it("given a badly-poisoned Pokemon that switches out, when onSwitchOut is called, then status reverts to regular poison", () => {
    // Source: gen1-ground-truth.md §8 — Toxic reverts to regular poison on switch-out
    // The toxic-counter volatile is also cleared (part of full volatile clear).
    const pokemon = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        status: "badly-poisoned",
      } as PokemonInstance,
    });
    pokemon.volatileStatuses.set("toxic-counter", { turnsLeft: -1, data: { counter: 5 } });

    const state = makeBattleState();
    ruleset.onSwitchOut(pokemon, state);

    expect(pokemon.pokemon.status).toBe("poison");
    expect(pokemon.volatileStatuses.has("toxic-counter")).toBe(false);
  });

  it("given a burned Pokemon that switches out, when onSwitchOut is called, then burn status is preserved (burn does not reset on switch)", () => {
    // Source: pret/pokered — burn persists through switch-out (status byte in party data)
    const pokemon = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        status: "burn",
      } as PokemonInstance,
    });

    const state = makeBattleState();
    ruleset.onSwitchOut(pokemon, state);

    expect(pokemon.pokemon.status).toBe("burn");
  });
});

// ---------------------------------------------------------------------------
// SECTION 7: Paralysis full-para chance (Gen 1)
// ---------------------------------------------------------------------------

describe("Gen 1 paralysis full-para chance", () => {
  it("given a paralyzed Pokemon, when checkFullParalysis is sampled 10000 times, then rate is approximately 63/256 (~24.6%)", () => {
    // Source: pret/pokered engine/battle/core.asm:3454 — cp 25 PERCENT (= 63 out of 256)
    // The check is: BattleRandom; cp 25PERCENT; ret nc — paralysis if A < 63
    const rng = new SeededRandom(777);
    const pokemon = makeActivePokemon({
      pokemon: { ...makeActivePokemon().pokemon, status: "paralysis" } as PokemonInstance,
    });

    let paralyzedCount = 0;
    const trials = 10000;
    for (let i = 0; i < trials; i++) {
      if (ruleset.checkFullParalysis(pokemon, rng)) {
        paralyzedCount++;
      }
    }

    const rate = paralyzedCount / trials;
    // Expected: 63/256 ≈ 24.6%, tolerance ±3%
    expect(rate).toBeGreaterThan(0.216);
    expect(rate).toBeLessThan(0.276);
  });
});

// ---------------------------------------------------------------------------
// SECTION 8: Hyper Beam recharge skip on KO (Gen 1)
// ---------------------------------------------------------------------------

describe("Gen 1 Hyper Beam recharge skip on KO", () => {
  it("given Hyper Beam hits and defender HP goes to 0 (KO), when executeMoveEffect is called, then noRecharge is true", () => {
    // Source: gen1-ground-truth.md §7 — Hyper Beam: if the target faints, attacker skips recharge.
    // Implementation: brokeSubstitute check also triggers noRecharge (Gen 1 specific).
    // Source: pret/pokered — HyperBeam skips recharge on KO AND on miss AND on breaking substitute.
    const attacker = makeActivePokemon();
    const defender = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        currentHp: 0, // Already at 0 = KO
      } as PokemonInstance,
    });

    const hyperBeamMove = makeMove({
      id: "hyper-beam",
      power: 150,
      flags: { ...DEFAULT_FLAGS, recharge: true },
    });

    const context = {
      attacker,
      defender,
      move: hyperBeamMove,
      damage: 100, // damage > 0 required for noRecharge to trigger
      state: makeBattleState(),
      rng: new SeededRandom(42),
      brokeSubstitute: false,
    };

    const result = ruleset.executeMoveEffect(context);
    expect(result.noRecharge).toBe(true);
  });

  it("given Hyper Beam hits but defender survives, when executeMoveEffect is called, then noRecharge is not set", () => {
    // Source: gen1-ground-truth.md §7 — Hyper Beam recharge only skipped on KO or Substitute break
    const attacker = makeActivePokemon();
    const defender = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        currentHp: 50, // Survived
      } as PokemonInstance,
    });

    const hyperBeamMove = makeMove({
      id: "hyper-beam",
      power: 150,
      flags: { ...DEFAULT_FLAGS, recharge: true },
    });

    const context = {
      attacker,
      defender,
      move: hyperBeamMove,
      damage: 40,
      state: makeBattleState(),
      rng: new SeededRandom(42),
      brokeSubstitute: false,
    };

    const result = ruleset.executeMoveEffect(context);
    expect(result.noRecharge).toBeUndefined(); // noRecharge is absent (not set) when defender survives — field is undefined, not false
  });

  it("given Hyper Beam breaks defender's Substitute, when executeMoveEffect is called, then noRecharge is true (Gen 1 only)", () => {
    // Source: gen1-ground-truth.md §7 — Gen 1 Hyper Beam also skips recharge on Substitute break.
    // This differs from Gen 2+ where only KO skips recharge.
    const attacker = makeActivePokemon();
    const defender = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        currentHp: 80, // Survived — did not KO
      } as PokemonInstance,
    });

    const hyperBeamMove = makeMove({
      id: "hyper-beam",
      power: 150,
      flags: { ...DEFAULT_FLAGS, recharge: true },
    });

    const context = {
      attacker,
      defender,
      move: hyperBeamMove,
      damage: 50,
      state: makeBattleState(),
      rng: new SeededRandom(42),
      brokeSubstitute: true, // Broke a substitute — Gen 1 skips recharge
    };

    const result = ruleset.executeMoveEffect(context);
    expect(result.noRecharge).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SECTION 9: Confusion self-hit uses own Attack/Defense (not opponent's) in Gen 1
// ---------------------------------------------------------------------------

describe("Gen 1 confusion self-hit formula correctness", () => {
  it("given L50 Pokemon with Atk=80 Def=60, when calculateConfusionDamage is called, then uses 40 BP typeless formula (not maxHP/8)", () => {
    // Source: pret/pokered engine/battle/core.asm — confusion self-hit formula:
    //   levelFactor = floor(2*50/5) + 2 = 22
    //   base = floor(floor(22 * 40 * 80) / 60 / 50) + 2 = floor(1173.3/50) + 2 = 23 + 2 = 25
    // The result must NOT be maxHP/8 (which would be 37 for 300 HP).
    const pokemon = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        level: 50,
        calculatedStats: {
          hp: 300,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 100,
        },
      } as PokemonInstance,
    });
    const state = makeBattleState();
    const rng = new SeededRandom(42);

    const damage = ruleset.calculateConfusionDamage(pokemon, state, rng);

    expect(damage).toBe(25);
    expect(damage).not.toBe(Math.floor(300 / 8)); // Must not be maxHP/8 = 37
  });

  it("given Gen 1, when confusionSelfHitTargetsOpponentSub is called, then returns true (Gen 1 bug: hits opponent sub)", () => {
    // Source: pret/pokered engine/battle/core.asm — Gen 1 cartridge bug:
    // confusion self-hit damage is applied to the opponent's Substitute if one is active.
    // Gen 2 fixed this bug.
    expect(ruleset.confusionSelfHitTargetsOpponentSub()).toBe(true);
  });
});
