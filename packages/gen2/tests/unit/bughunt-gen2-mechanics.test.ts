import type { ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import type {
  MoveData,
  PokemonInstance,
  PokemonType,
  VolatileStatus,
} from "@pokemon-lib-ts/core";
import {
  CORE_END_OF_TURN_EFFECT_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  NEUTRAL_NATURES,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  GEN2_ITEM_IDS,
  GEN2_MOVE_IDS,
  GEN2_SPECIES_IDS,
  Gen2Ruleset,
  createGen2DataManager,
  getGen2CritStage,
  rollGen2Critical,
} from "../../src";

/**
 * Gen 2 Mechanics Regression Tests — Bughunt Audit
 *
 * This file contains regression tests for Gen 2 mechanics verified against
 * pret/pokecrystal disassembly during the bughunt/gen12-mechanics audit.
 *
 * Each test documents the source in pret/pokecrystal and the expected value.
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const ruleset = new Gen2Ruleset();
const END_OF_TURN = CORE_END_OF_TURN_EFFECT_IDS;
const ITEMS = GEN2_ITEM_IDS;
const MOVES = GEN2_MOVE_IDS;
const SPECIES = GEN2_SPECIES_IDS;
const STATUSES = CORE_STATUS_IDS;
const TYPES = CORE_TYPE_IDS;
const VOLATILES = { ...CORE_VOLATILE_IDS, focusEnergy: GEN2_MOVE_IDS.focusEnergy } as const;
const GEN2_DATA = createGen2DataManager();
const TACKLE_DATA = GEN2_DATA.getMove(MOVES.tackle);

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
    id: MOVES.tackle,
    displayName: "Tackle",
    type: TYPES.normal as PokemonType,
    category: "physical",
    power: TACKLE_DATA.power,
    accuracy: 100,
    pp: TACKLE_DATA.pp,
    priority: 0,
    target: "adjacent-foe",
    flags: DEFAULT_FLAGS,
    effect: null,
    description: "A move.",
    generation: 2,
    ...overrides,
  };
}

function makeActivePokemon(overrides: Partial<ActivePokemon> = {}): ActivePokemon {
  return {
    pokemon: {
      uid: "test-uid",
      speciesId: SPECIES.bulbasaur,
      nickname: null,
      level: 50,
      experience: 0,
      nature: NEUTRAL_NATURES[0],
      ivs: { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      moves: [{ moveId: MOVES.tackle, currentPP: TACKLE_DATA.pp, maxPP: TACKLE_DATA.pp, ppUps: 0 }],
      currentHp: 100,
      status: null,
      friendship: 70,
      heldItem: null,
      ability: "",
      abilitySlot: "normal1" as const,
      gender: "male" as const,
      isShiny: false,
      metLocation: "new-bark-town",
      metLevel: 5,
      originalTrainer: "Gold",
      originalTrainerId: 54321,
      pokeball: ITEMS.pokeBall,
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
    volatileStatuses: new Map<VolatileStatus, { turnsLeft: number; data?: Record<string, unknown> }>(),
    types: [TYPES.normal] as PokemonType[],
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
    generation: 2,
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
// SECTION 1: Gen 2 high-crit move crit stage (+2, not +1)
// ---------------------------------------------------------------------------

describe("Gen 2 high-crit move crit stage is +2", () => {
  it("given Slash (high-crit move) with no other modifiers, when computing crit stage, then stage is 2", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm L1183-1184
    //   BattleCommand_Critical .CheckCritical:
    //     "inc c"  ; +1
    //     "inc c"  ; +1 (total +2)
    // The CriticalHitMoves list adds TWO increments to register c, not one.
    const attacker = makeActivePokemon();
    const move = makeMove({ id: MOVES.slash });
    const stage = getGen2CritStage(attacker, move);
    expect(stage).toBe(2);
  });

  it("given Karate Chop (high-crit move) with no other modifiers, when computing crit stage, then stage is 2", () => {
    // Source: pret/pokecrystal effect_commands.asm L1183-1184 — same logic for all CriticalHitMoves
    const attacker = makeActivePokemon();
    const move = makeMove({ id: MOVES.karateChop });
    const stage = getGen2CritStage(attacker, move);
    expect(stage).toBe(2);
  });

  it("given Cross Chop (high-crit move) with no other modifiers, when computing crit stage, then stage is 2", () => {
    // Source: pret/pokecrystal effect_commands.asm L1183-1184
    const attacker = makeActivePokemon();
    const move = makeMove({ id: MOVES.crossChop });
    const stage = getGen2CritStage(attacker, move);
    expect(stage).toBe(2);
  });

  it("given Aeroblast (high-crit move) with no other modifiers, when computing crit stage, then stage is 2", () => {
    // Source: pret/pokecrystal effect_commands.asm L1183-1184
    const attacker = makeActivePokemon();
    const move = makeMove({ id: MOVES.aeroblast });
    const stage = getGen2CritStage(attacker, move);
    expect(stage).toBe(2);
  });

  it("given high-crit move (stage 2), when rolling 10000 crits, then rate is approximately 64/256 = 25%", () => {
    // Source: pret/pokecrystal data/battle/critical_hit_chances.asm:
    //   Stage 2: "1 out_of 4" = 64/256 = 25%
    // The "out_of" macro expands to "* 256 /" yielding integer 64.
    const rng = new SeededRandom(8008);
    const attacker = makeActivePokemon();
    const highCritMove = makeMove({ id: MOVES.slash });
    const crits = Array.from({ length: 10000 }, () =>
      Number(rollGen2Critical(attacker, highCritMove, rng)),
    ).reduce((total, roll) => total + roll, 0);
    const rate = crits / 10000;

    // 64/256 = 25%, tolerance ±3%
    expect(rate).toBeGreaterThan(0.22);
    expect(rate).toBeLessThan(0.28);
  });
});

// ---------------------------------------------------------------------------
// SECTION 2: Gen 2 crit stage stacking correctness
// ---------------------------------------------------------------------------

describe("Gen 2 crit stage stacking with corrected high-crit value", () => {
  it("given high-crit move + Focus Energy, when computing crit stage, then stage is 3 (high-crit +2, FE +1)", () => {
    // Source: pret/pokecrystal effect_commands.asm — FE is L1170 (+1); high-crit is L1183-1184 (+2)
    const volatiles = new Map();
    volatiles.set(VOLATILES.focusEnergy, { turnsLeft: -1 });
    const attacker = makeActivePokemon({ volatileStatuses: volatiles });
    const move = makeMove({ id: MOVES.slash });
    const stage = getGen2CritStage(attacker, move);
    // 2 (high-crit) + 1 (Focus Energy) = 3, capped at max 4
    expect(stage).toBe(3);
  });

  it("given high-crit move + Scope Lens, when computing crit stage, then stage is 3 (high-crit +2, Scope Lens +1)", () => {
    // Source: pret/pokecrystal effect_commands.asm — Scope Lens is L1195 (+1); high-crit is L1183-1184 (+2)
    const attacker = makeActivePokemon({
      pokemon: { ...makeActivePokemon().pokemon, heldItem: ITEMS.scopeLens } as PokemonInstance,
    });
    const move = makeMove({ id: MOVES.slash });
    const stage = getGen2CritStage(attacker, move);
    // 2 (high-crit) + 1 (Scope Lens) = 3
    expect(stage).toBe(3);
  });

  it("given high-crit move + Focus Energy + Scope Lens, when computing crit stage, then stage is 4 (capped)", () => {
    // Source: pret/pokecrystal — 2 + 1 + 1 = 4 = max stage (128/256 = 50%)
    const volatiles = new Map();
    volatiles.set(VOLATILES.focusEnergy, { turnsLeft: -1 });
    const attacker = makeActivePokemon({
      volatileStatuses: volatiles,
      pokemon: { ...makeActivePokemon().pokemon, heldItem: ITEMS.scopeLens } as PokemonInstance,
    });
    const move = makeMove({ id: MOVES.slash });
    const stage = getGen2CritStage(attacker, move);
    expect(stage).toBe(4);
  });

  it("given stage 4 (Scope Lens + Focus Energy + high-crit), when rolling 10000 crits, then rate is approximately 128/256 = 50%", () => {
    // Source: pret/pokecrystal data/battle/critical_hit_chances.asm:
    //   Stage 4: "1 out_of 2" = 128/256 = 50%
    const rng = new SeededRandom(5555);
    const volatiles = new Map([[VOLATILES.focusEnergy, { turnsLeft: -1 }]]);
    const attacker = makeActivePokemon({
      volatileStatuses: volatiles,
      pokemon: { ...makeActivePokemon().pokemon, heldItem: ITEMS.scopeLens } as PokemonInstance,
    });
    const move = makeMove({ id: MOVES.slash });
    const crits = Array.from({ length: 10000 }, () =>
      Number(rollGen2Critical(attacker, move, rng)),
    ).reduce((total, roll) => total + roll, 0);
    const rate = crits / 10000;

    // 128/256 = 50%, tolerance ±3%
    expect(rate).toBeGreaterThan(0.47);
    expect(rate).toBeLessThan(0.53);
  });
});

// ---------------------------------------------------------------------------
// SECTION 3: Gen 2 freeze thaw rate (~9.8% = 25/256 per EoT)
// ---------------------------------------------------------------------------

describe("Gen 2 freeze thaw mechanics", () => {
  it("given a frozen Pokemon, when checkFreezeThaw is called, then always returns false (thaw happens at EoT, not pre-move)", () => {
    // Source: pret/pokecrystal engine/battle/core.asm:289 HandleDefrost
    // In Gen 2, frozen Pokemon cannot move — checkFreezeThaw is the pre-move check which
    // always returns false. Actual thaw is in processEndOfTurnDefrost.
    const pokemon = makeActivePokemon({
      pokemon: { ...makeActivePokemon().pokemon, status: STATUSES.freeze } as PokemonInstance,
    });
    const rng = new SeededRandom(42);

    for (let i = 0; i < 100; i++) {
      expect(ruleset.checkFreezeThaw(pokemon, rng)).toBe(false);
    }
  });

  it("given a frozen Pokemon not just-frozen, when processEndOfTurnDefrost rolls 24, then thaws (25/256 chance: roll < 25)", () => {
    // Source: pret/pokecrystal engine/battle/core.asm:1524-1581 HandleDefrost
    //   BattleRandom; cp 25; jr c, .defrost — thaws if roll < 25
    //   Equivalent to our: rng.int(0, 255) < 25 → thaw when roll is 0..24
    const pokemon = makeActivePokemon({
      pokemon: { ...makeActivePokemon().pokemon, status: STATUSES.freeze } as PokemonInstance,
    });

    const rng = { int: () => 24 } as unknown as SeededRandom;
    const thawed = ruleset.processEndOfTurnDefrost(pokemon, rng);
    expect(thawed).toBe(true);
  });

  it("given a frozen Pokemon not just-frozen, when processEndOfTurnDefrost rolls 25, then does NOT thaw", () => {
    // Source: pret/pokecrystal — threshold is < 25 (roll 25 fails the check)
    const pokemon = makeActivePokemon({
      pokemon: { ...makeActivePokemon().pokemon, status: STATUSES.freeze } as PokemonInstance,
    });

    const rng = { int: () => 25 } as unknown as SeededRandom;
    const thawed = ruleset.processEndOfTurnDefrost(pokemon, rng);
    expect(thawed).toBe(false);
  });

  it("given a just-frozen Pokemon, when processEndOfTurnDefrost is called, then returns false (no thaw on the freeze turn)", () => {
    // Source: pret/pokecrystal engine/battle/core.asm HandleDefrost — wPlayerJustGotFrozen guard:
    //   if the Pokemon was frozen this turn, skip the thaw roll
    const pokemon = makeActivePokemon({
      pokemon: { ...makeActivePokemon().pokemon, status: STATUSES.freeze } as PokemonInstance,
    });
    pokemon.volatileStatuses.set(VOLATILES.justFrozen, { turnsLeft: 1 });

    const rng = { int: () => 0 } as unknown as SeededRandom; // Would thaw normally
    const thawed = ruleset.processEndOfTurnDefrost(pokemon, rng);
    expect(thawed).toBe(false);
    // just-frozen volatile should be cleared
    expect(pokemon.volatileStatuses.has(VOLATILES.justFrozen)).toBe(false);
  });

  it("given a frozen Pokemon not just-frozen, when processEndOfTurnDefrost is sampled 10000 times, then rate is approximately 9.8% (25/256)", () => {
    // Source: pret/pokecrystal HandleDefrost — 25/256 ≈ 9.77% thaw chance per EoT
    const rng = new SeededRandom(1234);
    const trials = 10000;
    const thawCount = Array.from({ length: trials }, () => {
      const pokemon = makeActivePokemon({
        pokemon: { ...makeActivePokemon().pokemon, status: STATUSES.freeze } as PokemonInstance,
      });
      return Number(ruleset.processEndOfTurnDefrost(pokemon, rng));
    }).reduce((total, thawed) => total + thawed, 0);

    const rate = thawCount / trials;
    // 25/256 ≈ 9.77%, tolerance ±2%
    expect(rate).toBeGreaterThan(0.0777);
    expect(rate).toBeLessThan(0.1177);
  });

  it("given Gen 2 end-of-turn order, when retrieved, then includes the thaw step (unlike Gen 1)", () => {
    // Source: pret/pokecrystal — Gen 2 has an explicit EoT defrost step; Gen 1 does not
    const order = ruleset.getEndOfTurnOrder();
    expect(order).toContain(END_OF_TURN.defrost);
  });
});

// ---------------------------------------------------------------------------
// SECTION 4: Gen 2 sleep wake — CAN act on wake turn
// ---------------------------------------------------------------------------

describe("Gen 2 sleep wake — can act on wake turn", () => {
  it("given a Pokemon with sleep-counter turnsLeft=1, when processSleepTurn is called, then returns true (CAN act on wake turn)", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm — Gen 2 sleep:
    //   On wake, the Pokemon can still attack this turn (unlike Gen 1 which blocks the action).
    //   Return true = can act this turn.
    const pokemon = makeActivePokemon({
      pokemon: { ...makeActivePokemon().pokemon, status: STATUSES.sleep } as PokemonInstance,
    });
    pokemon.volatileStatuses.set(VOLATILES.sleepCounter, { turnsLeft: 1 });

    const state = makeBattleState();
    const canAct = ruleset.processSleepTurn(pokemon, state);

    expect(canAct).toBe(true);
    // Status should be cleared (woke up)
    expect(pokemon.pokemon.status).toBeNull();
  });

  it("given a Pokemon with sleep-counter turnsLeft=3, when processSleepTurn is called, then returns false (still asleep)", () => {
    // Source: pret/pokecrystal — Pokemon only acts if counter reaches 0 this turn
    const pokemon = makeActivePokemon({
      pokemon: { ...makeActivePokemon().pokemon, status: STATUSES.sleep } as PokemonInstance,
    });
    pokemon.volatileStatuses.set(VOLATILES.sleepCounter, { turnsLeft: 3 });

    const state = makeBattleState();
    const canAct = ruleset.processSleepTurn(pokemon, state);

    expect(canAct).toBe(false);
    expect(pokemon.volatileStatuses.get(VOLATILES.sleepCounter)?.turnsLeft).toBe(2);
    expect(pokemon.pokemon.status).toBe(STATUSES.sleep);
  });

  it("given Gen 2 sleep duration, when rollSleepTurns is sampled 500 times, then range is always 2-7", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm:3608-3621
    //   BattleRandom AND 7, reject 0 and 7 (range 1-6 after mask), then INC A → range 2-7
    const rng = new SeededRandom(7777);
    const results = new Set<number>();

    for (let i = 0; i < 500; i++) {
      const turns = ruleset.rollSleepTurns(rng);
      expect(turns).toBeGreaterThanOrEqual(2);
      expect(turns).toBeLessThanOrEqual(7);
      results.add(turns);
    }
    // Should cover multiple values (not a constant)
    expect(results.size).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// SECTION 5: Gen 2 Toxic counter reset on switch-out
// ---------------------------------------------------------------------------

describe("Gen 2 Toxic counter reset on switch-out", () => {
  it("given a badly-poisoned Pokemon that switches out normally, when onSwitchOut is called, then status reverts to regular poison", () => {
    // Source: pret/pokecrystal engine/battle/core.asm:4078-4104 NewBattleMonStatus
    //   Zeros wPlayerSubStatus1-5 (including SUBSTATUS_TOXIC)
    //   badly-poisoned → poison on switch-out
    const pokemon = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        status: STATUSES.badlyPoisoned,
      } as PokemonInstance,
    });
    pokemon.volatileStatuses.set(VOLATILES.toxicCounter, { turnsLeft: -1, data: { counter: 5 } });

    const state = makeBattleState();
    ruleset.onSwitchOut(pokemon, state);

    expect(pokemon.pokemon.status).toBe(STATUSES.poison);
    expect(pokemon.volatileStatuses.has(VOLATILES.toxicCounter)).toBe(false);
  });

  it("given a badly-poisoned Pokemon with toxic-counter at 8, when onSwitchOut is called, then counter is cleared (not preserved)", () => {
    // Source: pret/pokecrystal NewBattleMonStatus — volatile statuses are cleared on switch.
    // The toxic counter does NOT persist to the next switch-in.
    // This differs from Gen 1 where the counter also resets (but for a different internal reason).
    const pokemon = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        status: STATUSES.badlyPoisoned,
      } as PokemonInstance,
    });
    pokemon.volatileStatuses.set(VOLATILES.toxicCounter, { turnsLeft: -1, data: { counter: 8 } });

    const state = makeBattleState();
    ruleset.onSwitchOut(pokemon, state);

    expect(pokemon.volatileStatuses.has(VOLATILES.toxicCounter)).toBe(false);
  });

  it("given a burned Pokemon that switches out normally, when onSwitchOut is called, then burn status is preserved", () => {
    // Source: pret/pokecrystal — burn is stored in the party status byte, not a volatile.
    // It persists through switch-out unchanged.
    const pokemon = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        status: STATUSES.burn,
      } as PokemonInstance,
    });

    const state = makeBattleState();
    ruleset.onSwitchOut(pokemon, state);

    expect(pokemon.pokemon.status).toBe(STATUSES.burn);
  });
});

// ---------------------------------------------------------------------------
// SECTION 6: Gen 2 catch rate — BRN/PSN/PAR give no status bonus (cartridge bug)
// ---------------------------------------------------------------------------

describe("Gen 2 catch rate — status bonus bug (BRN/PSN/PAR give no bonus)", () => {
  it("given a sleeping Pokemon at full HP, when rollCatchAttempt rolls 5, then catches (SLP adds +10 bonus, finalRate=11)", () => {
    // Source: pret/pokecrystal engine/items/item_effects.asm:340-352
    //   Only FRZ and SLP add +10 to the catch rate. BRN/PSN/PAR do NOT.
    // At full HP: hpFactor = 1 (minimum from formula), statusBonus = 10, finalRate = 11.
    // Roll=5 <= 11 → caught. Same roll with no status: finalRate=1, roll=5 > 1 → not caught.
    const rng = { int: () => 5 } as unknown as SeededRandom;
    const catchWithSleep = ruleset.rollCatchAttempt(45, 100, 100, STATUSES.sleep, 1, rng);
    expect(catchWithSleep.caught).toBe(true); // roll 5 <= finalRate 11 → caught

    const rng2 = { int: () => 5 } as unknown as SeededRandom;
    const catchNoStatus = ruleset.rollCatchAttempt(45, 100, 100, null, 1, rng2);
    expect(catchNoStatus.caught).toBe(false); // roll 5 > finalRate 1 → not caught
  });

  it("given a frozen Pokemon, when rollCatchAttempt is called with roll=1, then catches (FRZ adds +10 bonus)", () => {
    // Source: pret/pokecrystal — FRZ adds +10 status bonus (same as SLP)
    const rng = { int: () => 1 } as unknown as SeededRandom;
    const catchWithFreeze = ruleset.rollCatchAttempt(45, 100, 100, STATUSES.freeze, 1, rng);
    // hpFactor=1 (full HP, min), statusBonus=10, finalRate=11; roll=1 <= 11 → caught
    expect(catchWithFreeze.caught).toBe(true);
  });

  it("given a paralyzed Pokemon, when rollCatchAttempt is called with roll=1, then does NOT catch (PAR has no bonus — cartridge bug)", () => {
    // Source: pret/pokecrystal engine/items/item_effects.asm:340-352 — PAR case missing in decomp
    // This is a verified cartridge bug: BRN/PSN/PAR give no status bonus despite Bulbapedia
    // older articles claiming they did. The decomp confirms only FRZ/SLP add +10.
    // hpFactor=1 (full HP, min), statusBonus=0, finalRate=1; roll=1 <= 1 → caught
    // Use roll=2 to clearly test PAR gives no bonus (vs SLP at +10 which would still catch).
    const rng2 = { int: () => 2 } as unknown as SeededRandom;
    const catchWithParRoll2 = ruleset.rollCatchAttempt(45, 100, 100, STATUSES.paralysis, 1, rng2);
    expect(catchWithParRoll2.caught).toBe(false); // roll=2 > finalRate=1 (no bonus) → not caught

    // Verify same roll=2 would catch with SLP (finalRate=11 with +10 bonus)
    const rng3 = { int: () => 2 } as unknown as SeededRandom;
    const catchWithSleepRoll2 = ruleset.rollCatchAttempt(45, 100, 100, STATUSES.sleep, 1, rng3);
    expect(catchWithSleepRoll2.caught).toBe(true); // roll=2 <= finalRate=11 → caught
  });

  it("given a burned Pokemon, when rollCatchAttempt is called with roll=2, then does NOT catch (BRN has no bonus — cartridge bug)", () => {
    // Source: pret/pokecrystal — same bug as PAR, BRN gives no status bonus
    const rng = { int: () => 2 } as unknown as SeededRandom;
    const catchWithBurn = ruleset.rollCatchAttempt(45, 100, 100, STATUSES.burn, 1, rng);
    // finalRate = 1 (no bonus); roll=2 > 1 → not caught
    expect(catchWithBurn.caught).toBe(false);
  });

  it("given a badly-poisoned Pokemon, when rollCatchAttempt is called with roll=2, then does NOT catch (PSN has no bonus — cartridge bug)", () => {
    // Source: pret/pokecrystal — badly-poisoned is a subtype of poison, also gets no bonus
    const rng = { int: () => 2 } as unknown as SeededRandom;
    const catchWithBadPoison = ruleset.rollCatchAttempt(45, 100, 100, STATUSES.badlyPoisoned, 1, rng);
    expect(catchWithBadPoison.caught).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SECTION 7: Gen 2 Focus Energy crit stage is +1 (FIXED from Gen 1)
// ---------------------------------------------------------------------------

describe("Gen 2 Focus Energy crit stage is +1 (bug fixed vs Gen 1)", () => {
  it("given Focus Energy active with a normal move, when computing crit stage, then stage is 1", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm L1170
    //   .FocusEnergy: bit SUBSTATUS_FOCUS_ENERGY, a; jr z, .CheckCritical
    //   inc c  ; +1 (just ONE increment — correctly adds +1, not the Gen 1 bug)
    const volatiles = new Map();
    volatiles.set(VOLATILES.focusEnergy, { turnsLeft: -1 });
    const attacker = makeActivePokemon({ volatileStatuses: volatiles });
    const normalMove = makeMove();

    const stage = getGen2CritStage(attacker, normalMove);
    expect(stage).toBe(1);
  });

  it("given Focus Energy active, when crit rate is computed vs no Focus Energy, then rate is HIGHER with Focus Energy (fixed from Gen 1)", () => {
    // Source: pret/pokecrystal — Focus Energy adds +1 stage (CORRECT behavior, unlike Gen 1 which
    // applied srl b = right-shift that DIVIDED the rate by 4 instead of multiplying)
    const attacker = makeActivePokemon();
    const attackerWithFE = makeActivePokemon();
    attackerWithFE.volatileStatuses.set(VOLATILES.focusEnergy, { turnsLeft: -1 });
    const normalMove = makeMove();

    const rng1 = new SeededRandom(100);
    const rng2 = new SeededRandom(100);

    const [normalCrits, feCrits] = Array.from({ length: 10000 }, () => [
      Number(rollGen2Critical(attacker, normalMove, rng1)),
      Number(rollGen2Critical(attackerWithFE, normalMove, rng2)),
    ]).reduce(
      ([normalTotal, feTotal], [normalRoll, feRoll]) => [normalTotal + normalRoll, feTotal + feRoll],
      [0, 0],
    );

    // Focus Energy (stage 1 = 32/256 ≈ 12.5%) should be higher than base (stage 0 = 17/256 ≈ 6.6%)
    expect(feCrits).toBeGreaterThan(normalCrits);
  });
});

// ---------------------------------------------------------------------------
// SECTION 8: Gen 2 paralysis full-para chance (same as Gen 1: 63/256)
// ---------------------------------------------------------------------------

describe("Gen 2 paralysis full-para chance", () => {
  it("given a paralyzed Pokemon, when checkFullParalysis is sampled 10000 times, then rate is approximately 63/256 (~24.6%)", () => {
    // Source: pret/pokecrystal engine/battle/core.asm — same 25PERCENT constant (63/256) as Gen 1
    // Shared via gen1to2FullParalysisCheck in packages/core/src/logic/gen12-shared.ts
    const rng = new SeededRandom(888);
    const pokemon = makeActivePokemon({
      pokemon: { ...makeActivePokemon().pokemon, status: STATUSES.paralysis } as PokemonInstance,
    });

    const trials = 10000;
    const paralyzedCount = Array.from({ length: trials }, () =>
      Number(ruleset.checkFullParalysis(pokemon, rng)),
    ).reduce((total, roll) => total + roll, 0);

    const rate = paralyzedCount / trials;
    // 63/256 ≈ 24.6%, tolerance ±3%
    expect(rate).toBeGreaterThan(0.216);
    expect(rate).toBeLessThan(0.276);
  });
});
