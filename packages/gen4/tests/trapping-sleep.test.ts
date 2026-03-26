import type { ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import { createOnFieldPokemon } from "@pokemon-lib-ts/battle/utils";
import type { PokemonInstance, PrimaryStatus } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_SLOTS,
  CORE_ITEM_IDS,
  CORE_NATURE_IDS,
  CORE_STATUS_IDS,
  CORE_VOLATILE_IDS,
  createPokemonInstance,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen4DataManager } from "../src/data";
import { GEN4_SPECIES_IDS } from "../src/data/reference-ids";
import { Gen4Ruleset } from "../src/Gen4Ruleset";

const dataManager = createGen4DataManager();
const GEN4_TEST_LEVEL = 50;
const BASE_CURRENT_HP = 200;
const BASE_STAT = 100;

function createGen4Ruleset(): Gen4Ruleset {
  return new Gen4Ruleset(dataManager);
}

function createGen4PokemonInstance(
  speciesId: number,
  options: {
    abilitySlot?: PokemonInstance["abilitySlot"];
    currentHp?: number;
    heldItem?: string | null;
    seedOffset?: number;
    condition?: PrimaryStatus;
  } = {},
): PokemonInstance {
  const species = dataManager.getSpecies(speciesId);
  const pokemon = createPokemonInstance(
    species,
    GEN4_TEST_LEVEL,
    new SeededRandom(0x4d74 + speciesId + (options.seedOffset ?? 0)),
    {
      nature: CORE_NATURE_IDS.hardy,
      pokeball: CORE_ITEM_IDS.pokeBall,
      abilitySlot: options.abilitySlot ?? CORE_ABILITY_SLOTS.normal1,
      heldItem: options.heldItem ?? null,
    },
  );

  const currentHp = options.currentHp ?? BASE_CURRENT_HP;
  pokemon.currentHp = currentHp;
  pokemon.calculatedStats = {
    hp: currentHp,
    attack: BASE_STAT,
    defense: BASE_STAT,
    spAttack: BASE_STAT,
    spDefense: BASE_STAT,
    speed: BASE_STAT,
  };
  if (options.condition !== undefined) {
    pokemon.status = options.condition;
  }

  return pokemon;
}

function createGen4ActivePokemon(
  speciesId: number,
  options: {
    abilitySlot?: PokemonInstance["abilitySlot"];
    currentHp?: number;
    heldItem?: string | null;
    seedOffset?: number;
    condition?: PrimaryStatus;
    teamSlot?: number;
  } = {},
): ActivePokemon {
  const species = dataManager.getSpecies(speciesId);
  const pokemon = createGen4PokemonInstance(speciesId, options);
  return createOnFieldPokemon(pokemon, options.teamSlot ?? 0, [...species.types]);
}

function createBattleSide(index: 0 | 1, active: ActivePokemon) {
  return {
    index,
    trainer: null,
    team: [active.pokemon],
    active: [active],
    hazards: [],
    screens: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
    gimmickUsed: false,
  };
}

function createTwoSideBattleState(
  side0Pokemon: ActivePokemon,
  side1Pokemon: ActivePokemon,
): BattleState {
  return {
    phase: "action-select",
    generation: 4,
    format: "singles",
    turnNumber: 1,
    sides: [createBattleSide(0, side0Pokemon), createBattleSide(1, side1Pokemon)],
    weather: null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    turnHistory: [],
    rng: new SeededRandom(0),
    ended: false,
    winner: null,
  } as BattleState;
}

function setSleepCounter(activePokemon: ActivePokemon, turnsLeft: number): void {
  activePokemon.pokemon.status = CORE_STATUS_IDS.sleep;
  activePokemon.volatileStatuses.set(CORE_VOLATILE_IDS.sleepCounter, { turnsLeft });
}

const GEN4_CHARMANDER = GEN4_SPECIES_IDS.charmander;
const GEN4_DIGLETT = GEN4_SPECIES_IDS.diglett;
const GEN4_GENGAR = GEN4_SPECIES_IDS.gengar;
const GEN4_MAGNEMITE = GEN4_SPECIES_IDS.magnemite;
const GEN4_PIDGEY = GEN4_SPECIES_IDS.pidgey;
const GEN4_STEELIX = GEN4_SPECIES_IDS.steelix;
const GEN4_WOBBUFFET = GEN4_SPECIES_IDS.wobbuffet;

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
    const ruleset = createGen4Ruleset();
    const mon = createGen4ActivePokemon(GEN4_CHARMANDER, { primaryStatus: CORE_STATUS_IDS.sleep });
    const opponent = createGen4ActivePokemon(GEN4_CHARMANDER);
    setSleepCounter(mon, 0);

    const canAct = ruleset.processSleepTurn(mon, createTwoSideBattleState(mon, opponent));
    expect(canAct).toBe(true);
  });

  it("given sleep counter is 1, when processSleepTurn called, then counter decrements to 0, Pokemon wakes, and returns true (can act)", () => {
    // Source: specs/battle/05-gen4.md — counter reaching 0 means wake + can act
    // Source: Showdown Gen 4 mod — Gen 3-4: can act on wake turn
    // With turnsLeft=1: decrement to 0, wake up, return true (Bug #354 fix)
    const ruleset = createGen4Ruleset();
    const mon = createGen4ActivePokemon(GEN4_CHARMANDER, { primaryStatus: CORE_STATUS_IDS.sleep });
    const opponent = createGen4ActivePokemon(GEN4_CHARMANDER);
    setSleepCounter(mon, 1);

    const canAct = ruleset.processSleepTurn(mon, createTwoSideBattleState(mon, opponent));
    expect(canAct).toBe(true);
  });

  it("given sleep counter reaches 0 after decrement, when processSleepTurn called, then clears status and sleep-counter volatile", () => {
    // Source: specs/battle/05-gen4.md — when sleep counter hits 0, status is cleared
    // Verify both pokemon.status and the volatile are cleaned up
    const ruleset = createGen4Ruleset();
    const mon = createGen4ActivePokemon(GEN4_CHARMANDER, { primaryStatus: CORE_STATUS_IDS.sleep });
    const opponent = createGen4ActivePokemon(GEN4_CHARMANDER);
    setSleepCounter(mon, 1);

    ruleset.processSleepTurn(mon, createTwoSideBattleState(mon, opponent));

    expect(mon.pokemon.status).toBeNull();
    expect(mon.volatileStatuses.has(CORE_VOLATILE_IDS.sleepCounter)).toBe(false);
  });

  it("given sleep counter is 3, when processSleepTurn called, then counter decrements to 2 and pokemon stays asleep (cannot act)", () => {
    // Source: specs/battle/05-gen4.md — counter > 0 after decrement: still sleeping
    // turnsLeft=3: decrement to 2, still sleeping, return false
    const ruleset = createGen4Ruleset();
    const mon = createGen4ActivePokemon(GEN4_CHARMANDER, { primaryStatus: CORE_STATUS_IDS.sleep });
    const opponent = createGen4ActivePokemon(GEN4_CHARMANDER);
    setSleepCounter(mon, 3);

    const canAct = ruleset.processSleepTurn(mon, createTwoSideBattleState(mon, opponent));

    expect(canAct).toBe(false);
    expect(mon.pokemon.status).toBe(CORE_STATUS_IDS.sleep);
    expect(mon.volatileStatuses.get(CORE_VOLATILE_IDS.sleepCounter)?.turnsLeft).toBe(2);
  });

  it("given no sleep-counter volatile present, when processSleepTurn called, then clears status and returns true (can act)", () => {
    // Source: specs/battle/05-gen4.md — if sleep counter is missing, treat as woken up
    // Edge case: sleep status present but no volatile counter — treats as immediate wake
    // Bug #354 fix: wake means can act (Gen 3-4)
    const ruleset = createGen4Ruleset();
    const mon = createGen4ActivePokemon(GEN4_CHARMANDER, { primaryStatus: CORE_STATUS_IDS.sleep });
    const opponent = createGen4ActivePokemon(GEN4_CHARMANDER);

    const canAct = ruleset.processSleepTurn(mon, createTwoSideBattleState(mon, opponent));

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
    const ruleset = createGen4Ruleset();
    const self = createGen4ActivePokemon(GEN4_CHARMANDER);
    const opponent = createGen4ActivePokemon(GEN4_WOBBUFFET);
    const state = createTwoSideBattleState(self, opponent);

    expect(ruleset.canSwitch(self, state)).toBe(false);
  });

  it("given both Pokemon have Shadow Tag, when canSwitch called, then returns true", () => {
    // Source: Showdown Gen 4 mod — Shadow Tag does not trap other Shadow Tag holders
    // Source: Bulbapedia — "A Pokemon with Shadow Tag will not be trapped by another Pokemon with Shadow Tag"
    const ruleset = createGen4Ruleset();
    const self = createGen4ActivePokemon(GEN4_WOBBUFFET);
    const opponent = createGen4ActivePokemon(GEN4_WOBBUFFET);
    const state = createTwoSideBattleState(self, opponent);

    expect(ruleset.canSwitch(self, state)).toBe(true);
  });

  it("given opponent has Arena Trap and self is grounded (non-Flying), when canSwitch called, then returns false", () => {
    // Source: Showdown Gen 4 mod — Arena Trap traps grounded opponents
    // Source: Bulbapedia — "Arena Trap prevents opposing Pokemon from fleeing or switching out
    //   as long as the opponent is grounded"
    const ruleset = createGen4Ruleset();
    const self = createGen4ActivePokemon(GEN4_CHARMANDER);
    const opponent = createGen4ActivePokemon(GEN4_DIGLETT, {
      abilitySlot: CORE_ABILITY_SLOTS.normal2,
    });
    const state = createTwoSideBattleState(self, opponent);

    expect(ruleset.canSwitch(self, state)).toBe(false);
  });

  it("given opponent has Arena Trap and self is Flying-type, when canSwitch called, then returns true", () => {
    // Source: Bulbapedia — "Arena Trap does not affect Flying-type Pokemon"
    // Flying-type is not grounded, so Arena Trap does not trap
    const ruleset = createGen4Ruleset();
    const self = createGen4ActivePokemon(GEN4_PIDGEY);
    const opponent = createGen4ActivePokemon(GEN4_DIGLETT, {
      abilitySlot: CORE_ABILITY_SLOTS.normal2,
    });
    const state = createTwoSideBattleState(self, opponent);

    expect(ruleset.canSwitch(self, state)).toBe(true);
  });

  it("given opponent has Arena Trap and self has Levitate, when canSwitch called, then returns true", () => {
    // Source: Bulbapedia — "Arena Trap does not affect Pokemon with the Levitate Ability"
    // Levitate makes the Pokemon non-grounded
    const ruleset = createGen4Ruleset();
    const self = createGen4ActivePokemon(GEN4_GENGAR);
    const opponent = createGen4ActivePokemon(GEN4_DIGLETT, {
      abilitySlot: CORE_ABILITY_SLOTS.normal2,
    });
    const state = createTwoSideBattleState(self, opponent);

    expect(ruleset.canSwitch(self, state)).toBe(true);
  });

  it("given opponent has Magnet Pull and self is Steel-type, when canSwitch called, then returns false", () => {
    // Source: Showdown Gen 4 mod — Magnet Pull traps Steel-type opponents
    // Source: Bulbapedia — "Magnet Pull prevents opposing Steel-type Pokemon from fleeing or switching"
    const ruleset = createGen4Ruleset();
    const self = createGen4ActivePokemon(GEN4_STEELIX, { abilitySlot: CORE_ABILITY_SLOTS.normal2 });
    const opponent = createGen4ActivePokemon(GEN4_MAGNEMITE);
    const state = createTwoSideBattleState(self, opponent);

    expect(ruleset.canSwitch(self, state)).toBe(false);
  });

  it("given opponent has Magnet Pull and self is non-Steel type, when canSwitch called, then returns true", () => {
    // Source: Bulbapedia — Magnet Pull only traps Steel-type Pokemon; non-Steel are unaffected
    const ruleset = createGen4Ruleset();
    const self = createGen4ActivePokemon(GEN4_CHARMANDER);
    const opponent = createGen4ActivePokemon(GEN4_MAGNEMITE);
    const state = createTwoSideBattleState(self, opponent);

    expect(ruleset.canSwitch(self, state)).toBe(true);
  });

  it("given pokemon has trapped volatile status, when canSwitch called, then returns false", () => {
    // Source: Showdown Gen 4 mod — Mean Look/Spider Web/Block set "trapped" volatile
    // Source: Bulbapedia — Mean Look: "prevents the target from switching out"
    const ruleset = createGen4Ruleset();
    const self = createGen4ActivePokemon(GEN4_CHARMANDER);
    self.volatileStatuses.set(CORE_VOLATILE_IDS.trapped, { turnsLeft: -1 });
    const opponent = createGen4ActivePokemon(GEN4_CHARMANDER);
    const state = createTwoSideBattleState(self, opponent);

    expect(ruleset.canSwitch(self, state)).toBe(false);
  });

  it("given opponent is fainted, when canSwitch called, then returns true regardless of opponent ability", () => {
    // Source: Showdown — fainted opponents cannot trap
    // Edge case: opponent has Shadow Tag but is fainted (0 HP)
    const ruleset = createGen4Ruleset();
    const self = createGen4ActivePokemon(GEN4_CHARMANDER);
    const opponent = createGen4ActivePokemon(GEN4_WOBBUFFET);
    opponent.pokemon.currentHp = 0;
    const state = createTwoSideBattleState(self, opponent);

    expect(ruleset.canSwitch(self, state)).toBe(true);
  });

  it("given no trapping conditions present, when canSwitch called, then returns true", () => {
    // Source: Showdown — default: Pokemon can switch freely when not trapped
    // Baseline: no trapping ability, no trapped volatile
    const ruleset = createGen4Ruleset();
    const self = createGen4ActivePokemon(GEN4_CHARMANDER);
    const opponent = createGen4ActivePokemon(GEN4_CHARMANDER);
    const state = createTwoSideBattleState(self, opponent);

    expect(ruleset.canSwitch(self, state)).toBe(true);
  });
});
