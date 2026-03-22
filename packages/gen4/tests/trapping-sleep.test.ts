import type { ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import type { PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen4DataManager } from "../src/data";
import { Gen4Ruleset } from "../src/Gen4Ruleset";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeRuleset(): Gen4Ruleset {
  return new Gen4Ruleset(createGen4DataManager());
}

/** Minimal PokemonInstance for mechanic tests. */
function makePokemonInstance(overrides: {
  maxHp?: number;
  speed?: number;
  status?: PokemonInstance["status"];
  ability?: string;
  heldItem?: string | null;
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  const speed = overrides.speed ?? 100;
  return {
    uid: "test",
    speciesId: 1,
    nickname: null,
    level: 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: maxHp,
    moves: [],
    ability: overrides.ability ?? "",
    abilitySlot: "normal1" as const,
    heldItem: overrides.heldItem ?? null,
    status: overrides.status ?? null,
    friendship: 0,
    gender: "male" as const,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: "pokeball",
    calculatedStats: {
      hp: maxHp,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed,
    },
  } as PokemonInstance;
}

/** Minimal ActivePokemon for mechanic tests. */
function makeActivePokemon(overrides: {
  maxHp?: number;
  speed?: number;
  status?: PokemonInstance["status"];
  types?: PokemonType[];
  ability?: string;
  heldItem?: string | null;
}): ActivePokemon {
  return {
    pokemon: makePokemonInstance(overrides),
    teamSlot: 0,
    statStages: {
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
    volatileStatuses: new Map(),
    types: overrides.types ?? ["normal"],
    ability: overrides.ability ?? "",
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    turnsOnField: 0,
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
  } as ActivePokemon;
}

/**
 * Build a minimal BattleState with two sides for canSwitch tests.
 * side0 = the pokemon being tested for switching, side1 = the opponent.
 */
function buildTwoSideState(side0Pokemon: ActivePokemon, side1Pokemon: ActivePokemon): BattleState {
  const makeSide = (index: 0 | 1, active: ActivePokemon) => ({
    index,
    trainer: null,
    team: [],
    active: [active],
    hazards: [],
    screens: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
    gimmickUsed: false,
  });

  return {
    phase: "action-select",
    generation: 4,
    format: "singles",
    turnNumber: 1,
    sides: [makeSide(0, side0Pokemon), makeSide(1, side1Pokemon)],
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
      chance: () => false,
      pick: <T>(arr: readonly T[]) => arr[0] as T,
      shuffle: <T>(arr: T[]) => arr,
      getState: () => 0,
      setState: () => {},
    },
    ended: false,
    winner: null,
  } as unknown as BattleState;
}

/** Minimal BattleState stub for processSleepTurn (doesn't need sides). */
const STUB_STATE = {} as BattleState;

// ---------------------------------------------------------------------------
// processSleepTurn
// ---------------------------------------------------------------------------

describe("Gen4Ruleset processSleepTurn", () => {
  it("given sleep counter already at 0, when processSleepTurn called, then returns true (CAN act on wake turn — Gen 3-4 behavior)", () => {
    // Source: specs/battle/05-gen4.md line 531 —
    //   "Counter decrements at start of turn before action selection;
    //    if counter reaches 0, Pokemon wakes and acts normally that turn"
    // Source: Showdown Gen 4 mod — BaseRuleset processSleepTurn returns true on wake
    // Gen 4 wake behavior: Pokemon CAN act (unlike Gen 1-2 where wake turn is lost)
    // Bug #354: previous code incorrectly returned false here
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ status: "sleep" });
    mon.volatileStatuses.set("sleep-counter", { turnsLeft: 0 });

    const canAct = ruleset.processSleepTurn(mon, STUB_STATE);
    expect(canAct).toBe(true);
  });

  it("given sleep counter is 1, when processSleepTurn called, then counter decrements to 0, Pokemon wakes, and returns true (can act)", () => {
    // Source: specs/battle/05-gen4.md — counter reaching 0 means wake + can act
    // Source: Showdown Gen 4 mod — Gen 3-4: can act on wake turn
    // With turnsLeft=1: decrement to 0, wake up, return true (Bug #354 fix)
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ status: "sleep" });
    mon.volatileStatuses.set("sleep-counter", { turnsLeft: 1 });

    const canAct = ruleset.processSleepTurn(mon, STUB_STATE);
    expect(canAct).toBe(true);
  });

  it("given sleep counter reaches 0 after decrement, when processSleepTurn called, then clears status and sleep-counter volatile", () => {
    // Source: specs/battle/05-gen4.md — when sleep counter hits 0, status is cleared
    // Verify both pokemon.status and the volatile are cleaned up
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ status: "sleep" });
    mon.volatileStatuses.set("sleep-counter", { turnsLeft: 1 });

    ruleset.processSleepTurn(mon, STUB_STATE);

    expect(mon.pokemon.status).toBeNull();
    expect(mon.volatileStatuses.has("sleep-counter")).toBe(false);
  });

  it("given sleep counter is 3, when processSleepTurn called, then counter decrements to 2 and pokemon stays asleep (cannot act)", () => {
    // Source: specs/battle/05-gen4.md — counter > 0 after decrement: still sleeping
    // turnsLeft=3: decrement to 2, still sleeping, return false
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ status: "sleep" });
    mon.volatileStatuses.set("sleep-counter", { turnsLeft: 3 });

    const canAct = ruleset.processSleepTurn(mon, STUB_STATE);

    expect(canAct).toBe(false);
    expect(mon.pokemon.status).toBe("sleep");
    expect(mon.volatileStatuses.get("sleep-counter")?.turnsLeft).toBe(2);
  });

  it("given no sleep-counter volatile present, when processSleepTurn called, then clears status and returns true (can act)", () => {
    // Source: specs/battle/05-gen4.md — if sleep counter is missing, treat as woken up
    // Edge case: sleep status present but no volatile counter — treats as immediate wake
    // Bug #354 fix: wake means can act (Gen 3-4)
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ status: "sleep" });
    // Deliberately not setting sleep-counter volatile

    const canAct = ruleset.processSleepTurn(mon, STUB_STATE);

    expect(canAct).toBe(true);
    expect(mon.pokemon.status).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// canSwitch — trapping abilities and volatile
// ---------------------------------------------------------------------------

describe("Gen4Ruleset canSwitch", () => {
  it("given opponent has Shadow Tag and self has different ability, when canSwitch called, then returns false", () => {
    // Source: Showdown Gen 4 mod — Shadow Tag traps non-Shadow-Tag opponents
    // Source: Bulbapedia — Shadow Tag: "prevents adjacent opposing Pokemon from fleeing or switching"
    const ruleset = makeRuleset();
    const self = makeActivePokemon({ ability: "blaze", types: ["fire"] });
    const opponent = makeActivePokemon({ ability: "shadow-tag", types: ["ghost"] });
    const state = buildTwoSideState(self, opponent);

    expect(ruleset.canSwitch(self, state)).toBe(false);
  });

  it("given both Pokemon have Shadow Tag, when canSwitch called, then returns true", () => {
    // Source: Showdown Gen 4 mod — Shadow Tag does not trap other Shadow Tag holders
    // Source: Bulbapedia — "A Pokemon with Shadow Tag will not be trapped by another Pokemon with Shadow Tag"
    const ruleset = makeRuleset();
    const self = makeActivePokemon({ ability: "shadow-tag", types: ["ghost"] });
    const opponent = makeActivePokemon({ ability: "shadow-tag", types: ["ghost"] });
    const state = buildTwoSideState(self, opponent);

    expect(ruleset.canSwitch(self, state)).toBe(true);
  });

  it("given opponent has Arena Trap and self is grounded (non-Flying), when canSwitch called, then returns false", () => {
    // Source: Showdown Gen 4 mod — Arena Trap traps grounded opponents
    // Source: Bulbapedia — "Arena Trap prevents opposing Pokemon from fleeing or switching out
    //   as long as the opponent is grounded"
    const ruleset = makeRuleset();
    const self = makeActivePokemon({ ability: "blaze", types: ["fire"] });
    const opponent = makeActivePokemon({ ability: "arena-trap", types: ["ground"] });
    const state = buildTwoSideState(self, opponent);

    expect(ruleset.canSwitch(self, state)).toBe(false);
  });

  it("given opponent has Arena Trap and self is Flying-type, when canSwitch called, then returns true", () => {
    // Source: Bulbapedia — "Arena Trap does not affect Flying-type Pokemon"
    // Flying-type is not grounded, so Arena Trap does not trap
    const ruleset = makeRuleset();
    const self = makeActivePokemon({ ability: "keen-eye", types: ["normal", "flying"] });
    const opponent = makeActivePokemon({ ability: "arena-trap", types: ["ground"] });
    const state = buildTwoSideState(self, opponent);

    expect(ruleset.canSwitch(self, state)).toBe(true);
  });

  it("given opponent has Arena Trap and self has Levitate, when canSwitch called, then returns true", () => {
    // Source: Bulbapedia — "Arena Trap does not affect Pokemon with the Levitate Ability"
    // Levitate makes the Pokemon non-grounded
    const ruleset = makeRuleset();
    const self = makeActivePokemon({ ability: "levitate", types: ["ghost"] });
    const opponent = makeActivePokemon({ ability: "arena-trap", types: ["ground"] });
    const state = buildTwoSideState(self, opponent);

    expect(ruleset.canSwitch(self, state)).toBe(true);
  });

  it("given opponent has Magnet Pull and self is Steel-type, when canSwitch called, then returns false", () => {
    // Source: Showdown Gen 4 mod — Magnet Pull traps Steel-type opponents
    // Source: Bulbapedia — "Magnet Pull prevents opposing Steel-type Pokemon from fleeing or switching"
    const ruleset = makeRuleset();
    const self = makeActivePokemon({ ability: "sturdy", types: ["steel", "rock"] });
    const opponent = makeActivePokemon({ ability: "magnet-pull", types: ["electric", "steel"] });
    const state = buildTwoSideState(self, opponent);

    expect(ruleset.canSwitch(self, state)).toBe(false);
  });

  it("given opponent has Magnet Pull and self is non-Steel type, when canSwitch called, then returns true", () => {
    // Source: Bulbapedia — Magnet Pull only traps Steel-type Pokemon; non-Steel are unaffected
    const ruleset = makeRuleset();
    const self = makeActivePokemon({ ability: "blaze", types: ["fire"] });
    const opponent = makeActivePokemon({ ability: "magnet-pull", types: ["electric", "steel"] });
    const state = buildTwoSideState(self, opponent);

    expect(ruleset.canSwitch(self, state)).toBe(true);
  });

  it("given pokemon has trapped volatile status, when canSwitch called, then returns false", () => {
    // Source: Showdown Gen 4 mod — Mean Look/Spider Web/Block set "trapped" volatile
    // Source: Bulbapedia — Mean Look: "prevents the target from switching out"
    const ruleset = makeRuleset();
    const self = makeActivePokemon({ ability: "blaze", types: ["fire"] });
    self.volatileStatuses.set("trapped", { turnsLeft: -1 });
    const opponent = makeActivePokemon({ ability: "blaze", types: ["fire"] });
    const state = buildTwoSideState(self, opponent);

    expect(ruleset.canSwitch(self, state)).toBe(false);
  });

  it("given opponent is fainted, when canSwitch called, then returns true regardless of opponent ability", () => {
    // Source: Showdown — fainted opponents cannot trap
    // Edge case: opponent has Shadow Tag but is fainted (0 HP)
    const ruleset = makeRuleset();
    const self = makeActivePokemon({ ability: "blaze", types: ["fire"] });
    const opponent = makeActivePokemon({ ability: "shadow-tag", types: ["ghost"], maxHp: 200 });
    opponent.pokemon.currentHp = 0;
    const state = buildTwoSideState(self, opponent);

    expect(ruleset.canSwitch(self, state)).toBe(true);
  });

  it("given no trapping conditions present, when canSwitch called, then returns true", () => {
    // Source: Showdown — default: Pokemon can switch freely when not trapped
    // Baseline: no trapping ability, no trapped volatile
    const ruleset = makeRuleset();
    const self = makeActivePokemon({ ability: "blaze", types: ["fire"] });
    const opponent = makeActivePokemon({ ability: "blaze", types: ["fire"] });
    const state = buildTwoSideState(self, opponent);

    expect(ruleset.canSwitch(self, state)).toBe(true);
  });
});
