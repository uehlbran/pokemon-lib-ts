import type { ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import type { PokemonType, StatBlock } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { GEN3_ABILITY_IDS, GEN3_NATURE_IDS, GEN3_SPECIES_IDS } from "../../src";
import { createGen3DataManager } from "../../src/data";
import { Gen3Ruleset } from "../../src/Gen3Ruleset";

/**
 * Gen 3 Trapping Abilities, Sleep Processing, and Switch-Out Tests
 *
 * Tests for:
 *   - canSwitch: Shadow Tag, Arena Trap, Magnet Pull, trapped volatile
 *   - processSleepTurn: Early Bird doubles sleep decrement
 *   - onSwitchOut: Natural Cure cures status
 *
 * Source hierarchy for Gen 3:
 *   1. pret/pokeemerald disassembly (ground truth)
 *   2. Pokemon Showdown Gen 3 mod
 *   3. Bulbapedia
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const dataManager = createGen3DataManager();
const ruleset = new Gen3Ruleset(dataManager);
const ABILITIES = { ...CORE_ABILITY_IDS, ...GEN3_ABILITY_IDS } as const;
const ITEMS = CORE_ITEM_IDS;
const SPECIES = GEN3_SPECIES_IDS;
const STATUSES = CORE_STATUS_IDS;
const TYPES = CORE_TYPE_IDS;
const VOLATILES = CORE_VOLATILE_IDS;

function createMockPokemon(opts: {
  types?: PokemonType[];
  ability?: string;
  status?: string | null;
  hp?: number;
  maxHp?: number;
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
    uid: "test-mon",
    speciesId: SPECIES.bulbasaur,
    nickname: null,
    level: 50,
    experience: 0,
    nature: GEN3_NATURE_IDS.hardy,
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: opts.hp ?? maxHp,
    moves: [],
    ability: opts.ability ?? ABILITIES.none,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    heldItem: null,
    status: opts.status ?? null,
    friendship: 0,
    gender: CORE_GENDERS.male,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: ITEMS.pokeBall,
    calculatedStats: stats,
  };

  return {
    pokemon,
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
    types: opts.types ?? [TYPES.normal],
    ability: opts.ability ?? ABILITIES.none,
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
    stellarBoostedTypes: [],
  } as unknown as ActivePokemon;
}

function createMinimalBattleState(
  side0Active: ActivePokemon,
  side1Active: ActivePokemon,
): BattleState {
  return {
    sides: [
      {
        active: [side0Active],
        team: [side0Active.pokemon],
        screens: { reflect: null, lightScreen: null, auroraVeil: null },
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
        trainer: null,
      },
      {
        active: [side1Active],
        team: [side1Active.pokemon],
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

// ===========================================================================
// canSwitch — trapping abilities
// ===========================================================================

describe("Gen 3 canSwitch (trapping abilities)", () => {
  // Source: pret/pokeemerald src/battle_util.c -- trapping ability checks

  describe("Shadow Tag", () => {
    // Source: pret/pokeemerald -- ABILITY_SHADOW_TAG traps all non-Shadow-Tag opponents
    // Source: Bulbapedia -- "Shadow Tag prevents opposing Pokemon from fleeing or switching out."

    it("given opponent has Shadow Tag, when checking switch, then Pokemon cannot switch", () => {
      const pokemon = createMockPokemon({ types: [TYPES.normal], ability: ABILITIES.blaze });
      const opponent = createMockPokemon({ types: [TYPES.ghost], ability: ABILITIES.shadowTag });
      const state = createMinimalBattleState(pokemon, opponent);

      expect(ruleset.canSwitch(pokemon, state)).toBe(false);
    });

    it("given opponent has Shadow Tag but Pokemon also has Shadow Tag, when checking switch, then Pokemon CAN switch", () => {
      // Source: pret/pokeemerald -- Shadow Tag does not trap other Shadow Tag holders
      const pokemon = createMockPokemon({ types: [TYPES.ghost], ability: ABILITIES.shadowTag });
      const opponent = createMockPokemon({ types: [TYPES.ghost], ability: ABILITIES.shadowTag });
      const state = createMinimalBattleState(pokemon, opponent);

      expect(ruleset.canSwitch(pokemon, state)).toBe(true);
    });
  });

  describe("Arena Trap", () => {
    // Source: pret/pokeemerald -- ABILITY_ARENA_TRAP traps non-Flying, non-Levitate foes
    // Source: Bulbapedia -- "Arena Trap prevents grounded adjacent foes from fleeing or switching."

    it("given opponent has Arena Trap and Pokemon is grounded, when checking switch, then Pokemon cannot switch", () => {
      const pokemon = createMockPokemon({ types: [TYPES.normal], ability: ABILITIES.blaze });
      const opponent = createMockPokemon({ types: [TYPES.ground], ability: ABILITIES.arenaTrap });
      const state = createMinimalBattleState(pokemon, opponent);

      expect(ruleset.canSwitch(pokemon, state)).toBe(false);
    });

    it("given opponent has Arena Trap and Pokemon is Flying-type, when checking switch, then Pokemon CAN switch", () => {
      const pokemon = createMockPokemon({
        types: [TYPES.normal, TYPES.flying],
        ability: ABILITIES.blaze,
      });
      const opponent = createMockPokemon({ types: [TYPES.ground], ability: ABILITIES.arenaTrap });
      const state = createMinimalBattleState(pokemon, opponent);

      expect(ruleset.canSwitch(pokemon, state)).toBe(true);
    });

    it("given opponent has Arena Trap and Pokemon has Levitate, when checking switch, then Pokemon CAN switch", () => {
      // Source: pret/pokeemerald -- Levitate grants immunity to Arena Trap
      const pokemon = createMockPokemon({
        types: [TYPES.ghost, TYPES.poison],
        ability: ABILITIES.levitate,
      });
      const opponent = createMockPokemon({ types: [TYPES.ground], ability: ABILITIES.arenaTrap });
      const state = createMinimalBattleState(pokemon, opponent);

      expect(ruleset.canSwitch(pokemon, state)).toBe(true);
    });
  });

  describe("Magnet Pull", () => {
    // Source: pret/pokeemerald -- ABILITY_MAGNET_PULL traps Steel-type opponents
    // Source: Bulbapedia -- "Magnet Pull prevents Steel-type Pokemon from fleeing or switching."

    it("given opponent has Magnet Pull and Pokemon is Steel-type, when checking switch, then Pokemon cannot switch", () => {
      const pokemon = createMockPokemon({ types: [TYPES.steel], ability: ABILITIES.sturdy });
      const opponent = createMockPokemon({
        types: [TYPES.electric, TYPES.steel],
        ability: ABILITIES.magnetPull,
      });
      const state = createMinimalBattleState(pokemon, opponent);

      expect(ruleset.canSwitch(pokemon, state)).toBe(false);
    });

    it("given opponent has Magnet Pull and Pokemon is NOT Steel-type, when checking switch, then Pokemon CAN switch", () => {
      const pokemon = createMockPokemon({ types: [TYPES.fire], ability: ABILITIES.blaze });
      const opponent = createMockPokemon({
        types: [TYPES.electric, TYPES.steel],
        ability: ABILITIES.magnetPull,
      });
      const state = createMinimalBattleState(pokemon, opponent);

      expect(ruleset.canSwitch(pokemon, state)).toBe(true);
    });
  });

  describe("Trapped volatile", () => {
    // Source: pret/pokeemerald -- Mean Look / Spider Web / Block set TRAPPED volatile

    it("given Pokemon has trapped volatile, when checking switch, then Pokemon cannot switch", () => {
      const pokemon = createMockPokemon({ types: [TYPES.normal] });
      (pokemon as any).volatileStatuses.set(VOLATILES.trapped, { turnsLeft: -1 });
      const opponent = createMockPokemon({ types: [TYPES.ghost] });
      const state = createMinimalBattleState(pokemon, opponent);

      expect(ruleset.canSwitch(pokemon, state)).toBe(false);
    });
  });

  describe("No restrictions", () => {
    it("given no trapping abilities and no trapped volatile, when checking switch, then Pokemon CAN switch", () => {
      const pokemon = createMockPokemon({ types: [TYPES.normal], ability: ABILITIES.blaze });
      const opponent = createMockPokemon({ types: [TYPES.fire], ability: ABILITIES.blaze });
      const state = createMinimalBattleState(pokemon, opponent);

      expect(ruleset.canSwitch(pokemon, state)).toBe(true);
    });

    it("given opponent is fainted, when checking switch, then Pokemon CAN switch", () => {
      const pokemon = createMockPokemon({ types: [TYPES.normal] });
      const opponent = createMockPokemon({
        types: [TYPES.ghost],
        ability: ABILITIES.shadowTag,
        hp: 0,
      });
      const state = createMinimalBattleState(pokemon, opponent);

      expect(ruleset.canSwitch(pokemon, state)).toBe(true);
    });
  });
});

// ===========================================================================
// processSleepTurn — Early Bird
// ===========================================================================

describe("Gen 3 processSleepTurn (Early Bird)", () => {
  // Source: pret/pokeemerald -- ABILITY_EARLY_BIRD doubles sleep decrement
  // Source: Bulbapedia -- "Early Bird causes sleep to last half as long"

  it("given Pokemon without Early Bird with 3 turns left, when sleep turn processed, then 2 turns remain", () => {
    // Normal decrement: 3 - 1 = 2
    const pokemon = createMockPokemon({
      types: [TYPES.normal],
      status: STATUSES.sleep,
      ability: ABILITIES.blaze,
    });
    (pokemon as any).volatileStatuses.set(VOLATILES.sleepCounter, { turnsLeft: 3 });
    const opponent = createMockPokemon({ types: [TYPES.normal] });
    const state = createMinimalBattleState(pokemon, opponent);

    const canAct = ruleset.processSleepTurn(pokemon, state);
    expect(canAct).toBe(false); // still sleeping
    expect(pokemon.volatileStatuses.get(VOLATILES.sleepCounter)!.turnsLeft).toBe(2);
    expect(pokemon.pokemon.status).toBe(STATUSES.sleep); // still asleep
  });

  it("given Pokemon with Early Bird with 3 turns left, when sleep turn processed, then 1 turn remains", () => {
    // Early Bird decrement: 3 - 2 = 1
    // Source: pret/pokeemerald -- ABILITY_EARLY_BIRD: sleepTimer decremented by 2
    const pokemon = createMockPokemon({
      types: [TYPES.normal],
      status: STATUSES.sleep,
      ability: ABILITIES.earlyBird,
    });
    (pokemon as any).volatileStatuses.set(VOLATILES.sleepCounter, { turnsLeft: 3 });
    const opponent = createMockPokemon({ types: [TYPES.normal] });
    const state = createMinimalBattleState(pokemon, opponent);

    const canAct = ruleset.processSleepTurn(pokemon, state);
    expect(canAct).toBe(false); // still sleeping
    expect(pokemon.volatileStatuses.get(VOLATILES.sleepCounter)!.turnsLeft).toBe(1);
  });

  it("given Pokemon with Early Bird with 2 turns left, when sleep turn processed, then wakes up", () => {
    // Early Bird decrement: 2 - 2 = 0, wake up
    const pokemon = createMockPokemon({
      types: [TYPES.normal],
      status: STATUSES.sleep,
      ability: ABILITIES.earlyBird,
    });
    (pokemon as any).volatileStatuses.set(VOLATILES.sleepCounter, { turnsLeft: 2 });
    const opponent = createMockPokemon({ types: [TYPES.normal] });
    const state = createMinimalBattleState(pokemon, opponent);

    const canAct = ruleset.processSleepTurn(pokemon, state);
    // Source: pret/pokeemerald src/battle_script_commands.c — Gen 3+ Pokemon CAN act on wake turn
    // Source: Bulbapedia — "Starting in Generation III, a Pokemon can attack on the turn it wakes up."
    expect(canAct).toBe(true); // Gen 3+: CAN act on wake turn
    expect(pokemon.pokemon.status).toBe(null); // woke up
    expect(pokemon.volatileStatuses.has(VOLATILES.sleepCounter)).toBe(false);
  });

  it("given Pokemon with Early Bird with 1 turn left, when sleep turn processed, then wakes up immediately", () => {
    // Early Bird decrement: max(0, 1 - 2) = 0, wake up
    const pokemon = createMockPokemon({
      types: [TYPES.normal],
      status: STATUSES.sleep,
      ability: ABILITIES.earlyBird,
    });
    (pokemon as any).volatileStatuses.set(VOLATILES.sleepCounter, { turnsLeft: 1 });
    const opponent = createMockPokemon({ types: [TYPES.normal] });
    const state = createMinimalBattleState(pokemon, opponent);

    const canAct = ruleset.processSleepTurn(pokemon, state);
    // Source: pret/pokeemerald — Gen 3+ CAN act on wake turn
    expect(canAct).toBe(true);
    expect(pokemon.pokemon.status).toBe(null);
    expect(pokemon.volatileStatuses.has(VOLATILES.sleepCounter)).toBe(false);
  });

  it("given Pokemon without Early Bird with 1 turn left, when sleep turn processed, then wakes up", () => {
    // Normal: 1 - 1 = 0, wake up
    const pokemon = createMockPokemon({
      types: [TYPES.normal],
      status: STATUSES.sleep,
      ability: ABILITIES.blaze,
    });
    (pokemon as any).volatileStatuses.set(VOLATILES.sleepCounter, { turnsLeft: 1 });
    const opponent = createMockPokemon({ types: [TYPES.normal] });
    const state = createMinimalBattleState(pokemon, opponent);

    const canAct = ruleset.processSleepTurn(pokemon, state);
    // Source: pret/pokeemerald — Gen 3+ CAN act on wake turn
    expect(canAct).toBe(true); // Gen 3+: CAN act on wake turn
    expect(pokemon.pokemon.status).toBe(null);
    expect(pokemon.volatileStatuses.has(VOLATILES.sleepCounter)).toBe(false);
  });

  it("given Pokemon with no sleep counter, when sleep turn processed, then wakes up immediately", () => {
    // Edge case: sleep status but no counter — wake up
    const pokemon = createMockPokemon({
      types: [TYPES.normal],
      status: STATUSES.sleep,
      ability: ABILITIES.blaze,
    });
    const opponent = createMockPokemon({ types: [TYPES.normal] });
    const state = createMinimalBattleState(pokemon, opponent);

    const canAct = ruleset.processSleepTurn(pokemon, state);
    // Source: pret/pokeemerald — Gen 3+ CAN act on wake turn
    expect(canAct).toBe(true); // Gen 3+: CAN act on wake turn
    expect(pokemon.pokemon.status).toBe(null);
  });
});

// ===========================================================================
// onSwitchOut — Natural Cure
// ===========================================================================

describe("Gen 3 onSwitchOut (Natural Cure)", () => {
  // Source: pret/pokeemerald -- ABILITY_NATURAL_CURE cures status on switch-out
  // Source: Bulbapedia -- "Natural Cure heals any status condition upon switching out."

  it("given Pokemon with Natural Cure and burn status, when switching out, then status is cured", () => {
    const pokemon = createMockPokemon({
      types: [TYPES.grass],
      ability: ABILITIES.naturalCure,
      status: STATUSES.burn,
    });
    const opponent = createMockPokemon({ types: [TYPES.normal] });
    const state = createMinimalBattleState(pokemon, opponent);

    ruleset.onSwitchOut(pokemon, state);
    expect(pokemon.pokemon.status).toBe(null);
  });

  it("given Pokemon with Natural Cure and poison status, when switching out, then status is cured", () => {
    const pokemon = createMockPokemon({
      types: [TYPES.grass],
      ability: ABILITIES.naturalCure,
      status: STATUSES.poison,
    });
    const opponent = createMockPokemon({ types: [TYPES.normal] });
    const state = createMinimalBattleState(pokemon, opponent);

    ruleset.onSwitchOut(pokemon, state);
    expect(pokemon.pokemon.status).toBe(null);
  });

  it("given Pokemon with Natural Cure and no status, when switching out, then nothing happens", () => {
    const pokemon = createMockPokemon({ types: [TYPES.grass], ability: ABILITIES.naturalCure });
    const opponent = createMockPokemon({ types: [TYPES.normal] });
    const state = createMinimalBattleState(pokemon, opponent);

    ruleset.onSwitchOut(pokemon, state);
    expect(pokemon.pokemon.status).toBe(null); // was already null
  });

  it("given Pokemon without Natural Cure and burn status, when switching out, then status remains", () => {
    const pokemon = createMockPokemon({
      types: [TYPES.grass],
      ability: ABILITIES.blaze,
      status: STATUSES.burn,
    });
    const opponent = createMockPokemon({ types: [TYPES.normal] });
    const state = createMinimalBattleState(pokemon, opponent);

    ruleset.onSwitchOut(pokemon, state);
    expect(pokemon.pokemon.status).toBe(STATUSES.burn); // not cured
  });

  it("given Pokemon switching out, when onSwitchOut called, then volatile statuses are cleared", () => {
    // BaseRuleset.onSwitchOut clears volatiles — verify Gen3 delegates properly
    const pokemon = createMockPokemon({
      types: [TYPES.grass],
      ability: ABILITIES.naturalCure,
      status: STATUSES.sleep,
    });
    (pokemon as any).volatileStatuses.set(VOLATILES.confusion, { turnsLeft: 3 });
    (pokemon as any).volatileStatuses.set(VOLATILES.sleepCounter, { turnsLeft: 2 });
    const opponent = createMockPokemon({ types: [TYPES.normal] });
    const state = createMinimalBattleState(pokemon, opponent);

    ruleset.onSwitchOut(pokemon, state);
    expect(pokemon.pokemon.status).toBe(null); // Natural Cure
    expect(pokemon.volatileStatuses.size).toBe(0); // volatiles cleared by BaseRuleset
  });
});
