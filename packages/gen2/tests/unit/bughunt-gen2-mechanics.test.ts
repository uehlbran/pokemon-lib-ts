import type { ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import {
  createOnFieldPokemon as createBattleOnFieldPokemon,
  createTestPokemon,
} from "@pokemon-lib-ts/battle/utils";
import type { MoveData, PokemonInstance } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_END_OF_TURN_EFFECT_IDS,
  CORE_GENDERS,
  CORE_STATUS_IDS,
  CORE_VOLATILE_IDS,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen2DataManager,
  GEN2_ITEM_IDS,
  GEN2_MOVE_IDS,
  GEN2_SPECIES_IDS,
  Gen2Ruleset,
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
const END_OF_TURN_EFFECT_IDS = CORE_END_OF_TURN_EFFECT_IDS;
const ITEM_IDS = GEN2_ITEM_IDS;
const MOVE_IDS = GEN2_MOVE_IDS;
const SPECIES_IDS = GEN2_SPECIES_IDS;
const STATUS_IDS = CORE_STATUS_IDS;
const VOLATILE_IDS = { ...CORE_VOLATILE_IDS, focusEnergy: CORE_VOLATILE_IDS.focusEnergy } as const;
const GEN2_DATA_MANAGER = createGen2DataManager();
const DEFAULT_SPECIES = GEN2_DATA_MANAGER.getSpecies(SPECIES_IDS.bulbasaur);

function createCanonicalMove(moveId: keyof typeof MOVE_IDS): MoveData {
  return GEN2_DATA_MANAGER.getMove(moveId);
}

function createActivePokemon(overrides: Partial<ActivePokemon> = {}): ActivePokemon {
  const maxHp = overrides.pokemon?.calculatedStats?.hp ?? 100;
  const speed = overrides.pokemon?.calculatedStats?.speed ?? 100;
  const pokemon = createTestPokemon(DEFAULT_SPECIES.id, 50, {
    currentHp: maxHp,
    status: null,
    friendship: 70,
    heldItem: null,
    ability: CORE_ABILITY_IDS.none,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    gender: CORE_GENDERS.male,
    metLocation: "new-bark-town",
    metLevel: 5,
    originalTrainer: "Gold",
    originalTrainerId: 54321,
    pokeball: ITEM_IDS.pokeBall,
    calculatedStats: {
      hp: maxHp,
      attack: overrides.pokemon?.calculatedStats?.attack ?? 80,
      defense: overrides.pokemon?.calculatedStats?.defense ?? 60,
      spAttack: overrides.pokemon?.calculatedStats?.spAttack ?? 80,
      spDefense: overrides.pokemon?.calculatedStats?.spDefense ?? 60,
      speed,
    },
    ...overrides.pokemon,
  });

  const active = createBattleOnFieldPokemon(
    pokemon,
    overrides.teamSlot ?? 0,
    overrides.types ?? [...DEFAULT_SPECIES.types],
  );

  return {
    ...active,
    ...overrides,
    pokemon,
    teamSlot: overrides.teamSlot ?? active.teamSlot,
    types: overrides.types ?? active.types,
    statStages: overrides.statStages ?? active.statStages,
    volatileStatuses: overrides.volatileStatuses
      ? new Map(overrides.volatileStatuses)
      : active.volatileStatuses,
  };
}

function createBattleState(): BattleState {
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
    const attacker = createActivePokemon();
    const move = createCanonicalMove(MOVE_IDS.slash);
    const stage = getGen2CritStage(attacker, move);
    expect(stage).toBe(2);
  });

  it("given Karate Chop (high-crit move) with no other modifiers, when computing crit stage, then stage is 2", () => {
    // Source: pret/pokecrystal effect_commands.asm L1183-1184 — same logic for all CriticalHitMoves
    const attacker = createActivePokemon();
    const move = createCanonicalMove(MOVE_IDS.karateChop);
    const stage = getGen2CritStage(attacker, move);
    expect(stage).toBe(2);
  });

  it("given Cross Chop (high-crit move) with no other modifiers, when computing crit stage, then stage is 2", () => {
    // Source: pret/pokecrystal effect_commands.asm L1183-1184
    const attacker = createActivePokemon();
    const move = createCanonicalMove(MOVE_IDS.crossChop);
    const stage = getGen2CritStage(attacker, move);
    expect(stage).toBe(2);
  });

  it("given Aeroblast (high-crit move) with no other modifiers, when computing crit stage, then stage is 2", () => {
    // Source: pret/pokecrystal effect_commands.asm L1183-1184
    const attacker = createActivePokemon();
    const move = createCanonicalMove(MOVE_IDS.aeroblast);
    const stage = getGen2CritStage(attacker, move);
    expect(stage).toBe(2);
  });

  it("given high-crit move (stage 2), when rolling 10000 crits, then rate is approximately 64/256 = 25%", () => {
    // Source: pret/pokecrystal data/battle/critical_hit_chances.asm:
    //   Stage 2: "1 out_of 4" = 64/256 = 25%
    // The "out_of" macro expands to "* 256 /" yielding integer 64.
    const rng = new SeededRandom(8008);
    const attacker = createActivePokemon();
    const highCritMove = createCanonicalMove(MOVE_IDS.slash);
    const crits = Array.from({ length: 10000 }, () =>
      Number(rollGen2Critical(attacker, highCritMove, rng)),
    ).reduce((total, roll) => total + roll, 0);
    expect(crits).toBe(2361);
  });
});

// ---------------------------------------------------------------------------
// SECTION 2: Gen 2 crit stage stacking correctness
// ---------------------------------------------------------------------------

describe("Gen 2 crit stage stacking with corrected high-crit value", () => {
  it("given high-crit move + Focus Energy, when computing crit stage, then stage is 3 (high-crit +2, FE +1)", () => {
    // Source: pret/pokecrystal effect_commands.asm — FE is L1170 (+1); high-crit is L1183-1184 (+2)
    const volatiles = new Map();
    volatiles.set(VOLATILE_IDS.focusEnergy, { turnsLeft: -1 });
    const attacker = createActivePokemon({ volatileStatuses: volatiles });
    const move = createCanonicalMove(MOVE_IDS.slash);
    const stage = getGen2CritStage(attacker, move);
    // 2 (high-crit) + 1 (Focus Energy) = 3, capped at max 4
    expect(stage).toBe(3);
  });

  it("given high-crit move + Scope Lens, when computing crit stage, then stage is 3 (high-crit +2, Scope Lens +1)", () => {
    // Source: pret/pokecrystal effect_commands.asm — Scope Lens is L1195 (+1); high-crit is L1183-1184 (+2)
    const attacker = createActivePokemon({
      pokemon: {
        ...createActivePokemon().pokemon,
        heldItem: ITEM_IDS.scopeLens,
      } as PokemonInstance,
    });
    const move = createCanonicalMove(MOVE_IDS.slash);
    const stage = getGen2CritStage(attacker, move);
    // 2 (high-crit) + 1 (Scope Lens) = 3
    expect(stage).toBe(3);
  });

  it("given high-crit move + Focus Energy + Scope Lens, when computing crit stage, then stage is 4 (capped)", () => {
    // Source: pret/pokecrystal — 2 + 1 + 1 = 4 = max stage (128/256 = 50%)
    const volatiles = new Map();
    volatiles.set(VOLATILE_IDS.focusEnergy, { turnsLeft: -1 });
    const attacker = createActivePokemon({
      volatileStatuses: volatiles,
      pokemon: {
        ...createActivePokemon().pokemon,
        heldItem: ITEM_IDS.scopeLens,
      } as PokemonInstance,
    });
    const move = createCanonicalMove(MOVE_IDS.slash);
    const stage = getGen2CritStage(attacker, move);
    expect(stage).toBe(4);
  });

  it("given stage 4 (Scope Lens + Focus Energy + high-crit), when rolling 10000 crits, then the seeded run returns 5015 crits", () => {
    // Source: pret/pokecrystal data/battle/critical_hit_chances.asm:
    //   Stage 4: "1 out_of 2" = 128/256 = 50%
    const rng = new SeededRandom(5555);
    const volatiles = new Map([[VOLATILE_IDS.focusEnergy, { turnsLeft: -1 }]]);
    const attacker = createActivePokemon({
      volatileStatuses: volatiles,
      pokemon: {
        ...createActivePokemon().pokemon,
        heldItem: ITEM_IDS.scopeLens,
      } as PokemonInstance,
    });
    const move = createCanonicalMove(MOVE_IDS.slash);
    const crits = Array.from({ length: 10000 }, () =>
      Number(rollGen2Critical(attacker, move, rng)),
    ).reduce((total, roll) => total + roll, 0);
    expect(crits).toBe(5015);
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
    const pokemon = createActivePokemon({
      pokemon: { ...createActivePokemon().pokemon, status: STATUS_IDS.freeze } as PokemonInstance,
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
    const pokemon = createActivePokemon({
      pokemon: { ...createActivePokemon().pokemon, status: STATUS_IDS.freeze } as PokemonInstance,
    });

    const rng = { int: () => 24 } as unknown as SeededRandom;
    const thawed = ruleset.processEndOfTurnDefrost(pokemon, rng);
    expect(thawed).toBe(true);
  });

  it("given a frozen Pokemon not just-frozen, when processEndOfTurnDefrost rolls 25, then does NOT thaw", () => {
    // Source: pret/pokecrystal — threshold is < 25 (roll 25 fails the check)
    const pokemon = createActivePokemon({
      pokemon: { ...createActivePokemon().pokemon, status: STATUS_IDS.freeze } as PokemonInstance,
    });

    const rng = { int: () => 25 } as unknown as SeededRandom;
    const thawed = ruleset.processEndOfTurnDefrost(pokemon, rng);
    expect(thawed).toBe(false);
  });

  it("given a just-frozen Pokemon, when processEndOfTurnDefrost is called, then returns false (no thaw on the freeze turn)", () => {
    // Source: pret/pokecrystal engine/battle/core.asm HandleDefrost — wPlayerJustGotFrozen guard:
    //   if the Pokemon was frozen this turn, skip the thaw roll
    const pokemon = createActivePokemon({
      pokemon: { ...createActivePokemon().pokemon, status: STATUS_IDS.freeze } as PokemonInstance,
    });
    pokemon.volatileStatuses.set(VOLATILE_IDS.justFrozen, { turnsLeft: 1 });

    const rng = { int: () => 0 } as unknown as SeededRandom; // Would thaw normally
    const thawed = ruleset.processEndOfTurnDefrost(pokemon, rng);
    expect(thawed).toBe(false);
    // just-frozen volatile should be cleared
    expect(pokemon.volatileStatuses.has(VOLATILE_IDS.justFrozen)).toBe(false);
  });

  it("given a frozen Pokemon not just-frozen, when processEndOfTurnDefrost is sampled 10000 times, then rate is approximately 9.8% (25/256)", () => {
    // Source: pret/pokecrystal HandleDefrost — 25/256 ≈ 9.77% thaw chance per EoT
    const rng = new SeededRandom(1234);
    const trials = 10000;
    const thawCount = Array.from({ length: trials }, () => {
      const pokemon = createActivePokemon({
        pokemon: { ...createActivePokemon().pokemon, status: STATUS_IDS.freeze } as PokemonInstance,
      });
      return Number(ruleset.processEndOfTurnDefrost(pokemon, rng));
    }).reduce((total, thawed) => total + thawed, 0);
    expect(thawCount).toBe(984);
  });

  it("given Gen 2 end-of-turn order, when retrieved, then includes the thaw step (unlike Gen 1)", () => {
    // Source: pret/pokecrystal — Gen 2 has an explicit EoT defrost step; Gen 1 does not
    const order = ruleset.getEndOfTurnOrder();
    expect(order).toContain(END_OF_TURN_EFFECT_IDS.defrost);
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
    const pokemon = createActivePokemon({
      pokemon: { ...createActivePokemon().pokemon, status: STATUS_IDS.sleep } as PokemonInstance,
    });
    pokemon.volatileStatuses.set(VOLATILE_IDS.sleepCounter, { turnsLeft: 1 });

    const state = createBattleState();
    const canAct = ruleset.processSleepTurn(pokemon, state);

    expect(canAct).toBe(true);
    // Status should be cleared (woke up)
    expect(pokemon.pokemon.status).toBeNull();
  });

  it("given a Pokemon with sleep-counter turnsLeft=3, when processSleepTurn is called, then returns false (still asleep)", () => {
    // Source: pret/pokecrystal — Pokemon only acts if counter reaches 0 this turn
    const pokemon = createActivePokemon({
      pokemon: { ...createActivePokemon().pokemon, status: STATUS_IDS.sleep } as PokemonInstance,
    });
    pokemon.volatileStatuses.set(VOLATILE_IDS.sleepCounter, { turnsLeft: 3 });

    const state = createBattleState();
    const canAct = ruleset.processSleepTurn(pokemon, state);

    expect(canAct).toBe(false);
    expect(pokemon.volatileStatuses.get(VOLATILE_IDS.sleepCounter)?.turnsLeft).toBe(2);
    expect(pokemon.pokemon.status).toBe(STATUS_IDS.sleep);
  });

  it("given Gen 2 sleep duration, when rollSleepTurns is sampled 20 times, then the exact deterministic sequence is returned", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm:3608-3621
    //   BattleRandom AND 7, reject 0 and 7 (range 1-6 after mask), then INC A → range 2-7
    const rng = new SeededRandom(7777);
    const turns = Array.from({ length: 20 }, () => ruleset.rollSleepTurns(rng));
    expect(turns).toEqual([2, 5, 5, 7, 3, 3, 6, 7, 6, 7, 7, 4, 4, 3, 2, 3, 4, 5, 3, 7]);
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
    const pokemon = createActivePokemon({
      pokemon: {
        ...createActivePokemon().pokemon,
        status: STATUS_IDS.badlyPoisoned,
      } as PokemonInstance,
    });
    pokemon.volatileStatuses.set(VOLATILE_IDS.toxicCounter, {
      turnsLeft: -1,
      data: { counter: 5 },
    });

    const state = createBattleState();
    ruleset.onSwitchOut(pokemon, state);

    expect(pokemon.pokemon.status).toBe(STATUS_IDS.poison);
    expect(pokemon.volatileStatuses.has(VOLATILE_IDS.toxicCounter)).toBe(false);
  });

  it("given a badly-poisoned Pokemon with toxic-counter at 8, when onSwitchOut is called, then counter is cleared (not preserved)", () => {
    // Source: pret/pokecrystal NewBattleMonStatus — volatile statuses are cleared on switch.
    // The toxic counter does NOT persist to the next switch-in.
    // This differs from Gen 1 where the counter also resets (but for a different internal reason).
    const pokemon = createActivePokemon({
      pokemon: {
        ...createActivePokemon().pokemon,
        status: STATUS_IDS.badlyPoisoned,
      } as PokemonInstance,
    });
    pokemon.volatileStatuses.set(VOLATILE_IDS.toxicCounter, {
      turnsLeft: -1,
      data: { counter: 8 },
    });

    const state = createBattleState();
    ruleset.onSwitchOut(pokemon, state);

    expect(pokemon.volatileStatuses.has(VOLATILE_IDS.toxicCounter)).toBe(false);
  });

  it("given a burned Pokemon that switches out normally, when onSwitchOut is called, then burn status is preserved", () => {
    // Source: pret/pokecrystal — burn is stored in the party status byte, not a volatile.
    // It persists through switch-out unchanged.
    const pokemon = createActivePokemon({
      pokemon: {
        ...createActivePokemon().pokemon,
        status: STATUS_IDS.burn,
      } as PokemonInstance,
    });

    const state = createBattleState();
    ruleset.onSwitchOut(pokemon, state);

    expect(pokemon.pokemon.status).toBe(STATUS_IDS.burn);
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
    const catchWithSleep = ruleset.rollCatchAttempt(45, 100, 100, STATUS_IDS.sleep, 1, rng);
    expect(catchWithSleep.caught).toBe(true); // roll 5 <= finalRate 11 → caught

    const rng2 = { int: () => 5 } as unknown as SeededRandom;
    const catchNoStatus = ruleset.rollCatchAttempt(45, 100, 100, null, 1, rng2);
    expect(catchNoStatus.caught).toBe(false); // roll 5 > finalRate 1 → not caught
  });

  it("given a frozen Pokemon, when rollCatchAttempt is called with roll=1, then catches (FRZ adds +10 bonus)", () => {
    // Source: pret/pokecrystal — FRZ adds +10 status bonus (same as SLP)
    const rng = { int: () => 1 } as unknown as SeededRandom;
    const catchWithFreeze = ruleset.rollCatchAttempt(45, 100, 100, STATUS_IDS.freeze, 1, rng);
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
    const catchWithParRoll2 = ruleset.rollCatchAttempt(45, 100, 100, STATUS_IDS.paralysis, 1, rng2);
    expect(catchWithParRoll2.caught).toBe(false); // roll=2 > finalRate=1 (no bonus) → not caught

    // Verify same roll=2 would catch with SLP (finalRate=11 with +10 bonus)
    const rng3 = { int: () => 2 } as unknown as SeededRandom;
    const catchWithSleepRoll2 = ruleset.rollCatchAttempt(45, 100, 100, STATUS_IDS.sleep, 1, rng3);
    expect(catchWithSleepRoll2.caught).toBe(true); // roll=2 <= finalRate=11 → caught
  });

  it("given a burned Pokemon, when rollCatchAttempt is called with roll=2, then does NOT catch (BRN has no bonus — cartridge bug)", () => {
    // Source: pret/pokecrystal — same bug as PAR, BRN gives no status bonus
    const rng = { int: () => 2 } as unknown as SeededRandom;
    const catchWithBurn = ruleset.rollCatchAttempt(45, 100, 100, STATUS_IDS.burn, 1, rng);
    // finalRate = 1 (no bonus); roll=2 > 1 → not caught
    expect(catchWithBurn.caught).toBe(false);
  });

  it("given a badly-poisoned Pokemon, when rollCatchAttempt is called with roll=2, then does NOT catch (PSN has no bonus — cartridge bug)", () => {
    // Source: pret/pokecrystal — badly-poisoned is a subtype of poison, also gets no bonus
    const rng = { int: () => 2 } as unknown as SeededRandom;
    const catchWithBadPoison = ruleset.rollCatchAttempt(
      45,
      100,
      100,
      STATUS_IDS.badlyPoisoned,
      1,
      rng,
    );
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
    volatiles.set(VOLATILE_IDS.focusEnergy, { turnsLeft: -1 });
    const attacker = createActivePokemon({ volatileStatuses: volatiles });
    const normalMove = createCanonicalMove(MOVE_IDS.tackle);

    const stage = getGen2CritStage(attacker, normalMove);
    expect(stage).toBe(1);
  });

  it("given Focus Energy active, when crit rate is computed vs no Focus Energy, then rate is HIGHER with Focus Energy (fixed from Gen 1)", () => {
    // Source: pret/pokecrystal — Focus Energy adds +1 stage (CORRECT behavior, unlike Gen 1 which
    // applied srl b = right-shift that DIVIDED the rate by 4 instead of multiplying)
    const attacker = createActivePokemon();
    const attackerWithFE = createActivePokemon();
    attackerWithFE.volatileStatuses.set(VOLATILE_IDS.focusEnergy, { turnsLeft: -1 });
    const normalMove = createCanonicalMove(MOVE_IDS.tackle);

    const rng1 = new SeededRandom(100);
    const rng2 = new SeededRandom(100);

    const [normalCrits, feCrits] = Array.from({ length: 10000 }, () => [
      Number(rollGen2Critical(attacker, normalMove, rng1)),
      Number(rollGen2Critical(attackerWithFE, normalMove, rng2)),
    ]).reduce(
      ([normalTotal, feTotal], [normalRoll, feRoll]) => [
        normalTotal + normalRoll,
        feTotal + feRoll,
      ],
      [0, 0],
    );

    // Focus Energy (stage 1 = 32/256 ≈ 12.5%) is higher than base (stage 0 = 17/256 ≈ 6.6%).
    expect(normalCrits).toBe(718);
    expect(feCrits).toBe(1291);
  });
});

// ---------------------------------------------------------------------------
// SECTION 8: Gen 2 paralysis full-para chance (same as Gen 1: 63/256)
// ---------------------------------------------------------------------------

describe("Gen 2 paralysis full-para chance", () => {
  it("given a paralyzed Pokemon, when checkFullParalysis is sampled 10000 times, then the seeded run returns 2398 full-paralysis rolls", () => {
    // Source: pret/pokecrystal engine/battle/core.asm — same 25PERCENT constant (63/256) as Gen 1
    // Shared via gen1to2FullParalysisCheck in packages/core/src/logic/gen12-shared.ts
    const rng = new SeededRandom(888);
    const pokemon = createActivePokemon({
      pokemon: {
        ...createActivePokemon().pokemon,
        status: STATUS_IDS.paralysis,
      } as PokemonInstance,
    });

    const trials = 10000;
    const paralyzedCount = Array.from({ length: trials }, () =>
      Number(ruleset.checkFullParalysis(pokemon, rng)),
    ).reduce((total, roll) => total + roll, 0);

    expect(paralyzedCount).toBe(2398);
  });
});
