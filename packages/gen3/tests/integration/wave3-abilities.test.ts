import type { AbilityContext, ActivePokemon, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import { createOnFieldPokemon } from "@pokemon-lib-ts/battle/utils";
import type { PokemonInstance, PrimaryStatus } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_SLOTS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  SeededRandom,
  createMoveSlot,
  createPokemonInstance,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  GEN3_ABILITY_IDS,
  GEN3_ITEM_IDS,
  GEN3_MOVE_IDS,
  GEN3_NATURE_IDS,
  GEN3_SPECIES_IDS,
  applyGen3Ability,
  createGen3DataManager,
  Gen3Ruleset,
} from "../../src";

/**
 * Gen 3 Wave 3 Ability Tests
 *
 * Tests for abilities introduced/refined in Wave 3:
 *   - Trace: copies opponent's ability on switch-in
 *   - Pressure: PP deducted is 2 when facing Pressure (via getPPCost)
 *   - Truant: alternates between acting and loafing (on-before-move)
 *   - Color Change: changes type to the type of the damaging move that hit it (on-damage-taken)
 *   - Synchronize: mirrors burn/paralysis/poison to opponent (on-status-inflicted)
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
const GEN3_DEFAULT_LEVEL = 50;
const GEN3_DEFAULT_HP = 200;
const GEN3_DEFAULT_SPEED = 100;
let nextPokemonSeed = 1;

const PRESSURE_DISPLAY_NAME = dataManager.getAbility(GEN3_ABILITY_IDS.pressure).displayName;
const FLAMETHROWER = dataManager.getMove(GEN3_MOVE_IDS.flamethrower);
const THUNDERBOLT = dataManager.getMove(GEN3_MOVE_IDS.thunderbolt);
const TRIGGER_ON_SWITCH_IN = CORE_ABILITY_TRIGGER_IDS.onSwitchIn;
const TRIGGER_ON_BEFORE_MOVE = CORE_ABILITY_TRIGGER_IDS.onBeforeMove;
const TRIGGER_ON_TURN_END = CORE_ABILITY_TRIGGER_IDS.onTurnEnd;
const TRIGGER_ON_DAMAGE_TAKEN = CORE_ABILITY_TRIGGER_IDS.onDamageTaken;
const TRIGGER_ON_STATUS_INFLICTED = CORE_ABILITY_TRIGGER_IDS.onStatusInflicted;

type Gen3AbilitySlot = (typeof CORE_ABILITY_SLOTS)[keyof typeof CORE_ABILITY_SLOTS];

function createCanonicalMoveSlots(moveIds: readonly string[]) {
  return moveIds.map((moveId) => {
    const move = dataManager.getMove(moveId);
    return createMoveSlot(move.id, move.pp);
  });
}

function createGen3PokemonInstance(
  speciesId: number,
  options: {
    abilitySlot?: Gen3AbilitySlot;
    currentHp?: number;
    moveIds?: readonly string[];
    nickname?: string;
    primaryStatus?: PrimaryStatus | null;
    speed?: number;
  } = {},
): PokemonInstance {
  const species = dataManager.getSpecies(speciesId);
  const pokemon = createPokemonInstance(species, GEN3_DEFAULT_LEVEL, new SeededRandom(0x3d70 + nextPokemonSeed++), {
    nature: GEN3_NATURE_IDS.hardy,
    abilitySlot: options.abilitySlot ?? CORE_ABILITY_SLOTS.normal1,
    pokeball: GEN3_ITEM_IDS.pokeBall,
    nickname: options.nickname ?? species.displayName,
  });

  pokemon.moves = createCanonicalMoveSlots(options.moveIds ?? [GEN3_MOVE_IDS.tackle]);
  pokemon.currentHp = options.currentHp ?? GEN3_DEFAULT_HP;
  pokemon.calculatedStats = {
    hp: options.currentHp ?? GEN3_DEFAULT_HP,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    speed: options.speed ?? GEN3_DEFAULT_SPEED,
  };
  if (options.primaryStatus !== undefined) {
    pokemon.status = options.primaryStatus;
  }

  return pokemon;
}

function createGen3ActivePokemon(
  speciesId: number,
  options: {
    abilitySlot?: Gen3AbilitySlot;
    currentHp?: number;
    moveIds?: readonly string[];
    nickname?: string;
    primaryStatus?: PrimaryStatus | null;
    speed?: number;
  } = {},
): ActivePokemon {
  const species = dataManager.getSpecies(speciesId);
  const pokemon = createGen3PokemonInstance(speciesId, options);
  return createOnFieldPokemon(pokemon, 0, [...species.types]);
}

function createBattleSide(index: 0 | 1, active: ActivePokemon): BattleSide {
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
  } as BattleSide;
}

function createBattleState(side0Active: ActivePokemon, side1Active: ActivePokemon): BattleState {
  return {
    phase: "action-select",
    generation: 3,
    format: "singles",
    turnNumber: 1,
    sides: [createBattleSide(0, side0Active), createBattleSide(1, side1Active)],
    weather: null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    turnHistory: [],
    rng: new SeededRandom(0),
    isWildBattle: false,
    fleeAttempts: 0,
    ended: false,
    winner: null,
  } as BattleState;
}

// ===========================================================================
// Trace -- copies opponent's ability on switch-in
// ===========================================================================

describe("Gen 3 Trace ability (on-switch-in)", () => {
  // Source: pret/pokeemerald — ABILITY_TRACE copies foe's ability on entry
  // Source: Bulbapedia — "Trace copies the opponent's Ability when entering battle"

  it("given a Pokemon with Trace, when switching in vs opponent with Intimidate, then copies Intimidate", () => {
    // Source: pret/pokeemerald — Trace copies the foe's ability, returns ability-change effect
    const tracer = createGen3ActivePokemon(GEN3_SPECIES_IDS.gardevoir, {
      abilitySlot: CORE_ABILITY_SLOTS.normal2,
    });
    const opponent = createGen3ActivePokemon(GEN3_SPECIES_IDS.tauros);
    const state = createBattleState(tracer, opponent);

    const context: AbilityContext = {
      pokemon: tracer,
      opponent,
      state,
      rng: new SeededRandom(0),
      trigger: TRIGGER_ON_SWITCH_IN,
    };

    const result = applyGen3Ability(TRIGGER_ON_SWITCH_IN, context);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      {
        effectType: "ability-change",
        target: "self",
        newAbility: GEN3_ABILITY_IDS.intimidate,
      },
    ]);
    expect(result.messages).toEqual([`Gardevoir traced Tauros's ${GEN3_ABILITY_IDS.intimidate}!`]);
  });

  it("given a Pokemon with Trace, when switching in vs opponent with Trace, then does not copy (banned)", () => {
    // Source: pret/pokeemerald — Trace cannot copy itself
    // Source: Bulbapedia — "Trace will not copy Trace"
    const tracer = createGen3ActivePokemon(GEN3_SPECIES_IDS.gardevoir, {
      abilitySlot: CORE_ABILITY_SLOTS.normal2,
    });
    const opponent = createGen3ActivePokemon(GEN3_SPECIES_IDS.gardevoir, {
      abilitySlot: CORE_ABILITY_SLOTS.normal2,
    });
    const state = createBattleState(tracer, opponent);

    const context: AbilityContext = {
      pokemon: tracer,
      opponent,
      state,
      rng: new SeededRandom(0),
      trigger: TRIGGER_ON_SWITCH_IN,
    };

    const result = applyGen3Ability(TRIGGER_ON_SWITCH_IN, context);
    expect(result.activated).toBe(false);
    expect(result.effects).toHaveLength(0);
  });

  it("given a Pokemon with Trace, when switching in vs opponent with Levitate, then copies Levitate", () => {
    // Source: pret/pokeemerald — Trace can copy any non-banned ability
    // Levitate is NOT in the Gen 3 banned list (only Trace itself is banned)
    const tracer = createGen3ActivePokemon(GEN3_SPECIES_IDS.gardevoir, {
      abilitySlot: CORE_ABILITY_SLOTS.normal2,
    });
    const opponent = createGen3ActivePokemon(GEN3_SPECIES_IDS.gengar);
    const state = createBattleState(tracer, opponent);

    const context: AbilityContext = {
      pokemon: tracer,
      opponent,
      state,
      rng: new SeededRandom(0),
      trigger: TRIGGER_ON_SWITCH_IN,
    };

    const result = applyGen3Ability(TRIGGER_ON_SWITCH_IN, context);
    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({
      effectType: "ability-change",
      target: "self",
      newAbility: GEN3_ABILITY_IDS.levitate,
    });
  });

  it("given a Pokemon with Trace, when switching in with no opponent, then does not activate", () => {
    // Edge case: no opponent present (e.g., fainted or empty slot)
    const tracer = createGen3ActivePokemon(GEN3_SPECIES_IDS.gardevoir, {
      abilitySlot: CORE_ABILITY_SLOTS.normal2,
    });
    const opponent = createGen3ActivePokemon(GEN3_SPECIES_IDS.tauros);
    const state = createBattleState(tracer, opponent);

    const context: AbilityContext = {
      pokemon: tracer,
      opponent: undefined,
      state,
      rng: new SeededRandom(0),
      trigger: TRIGGER_ON_SWITCH_IN,
    };

    const result = applyGen3Ability(TRIGGER_ON_SWITCH_IN, context);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Pressure -- PP cost doubles, announced on switch-in
// ===========================================================================

describe("Gen 3 Pressure ability", () => {
  // Source: pret/pokeemerald — ABILITY_PRESSURE deducts extra PP
  // Source: Bulbapedia — "Pressure causes moves targeting the Ability-bearer to use 2 PP"

  describe("on-switch-in announcement", () => {
    it("given a Pokemon with Pressure, when switching in, then announces message", () => {
      // Source: pret/pokeemerald — Pressure announces on entry with no battle effect
      const pressureMon = createGen3ActivePokemon(GEN3_SPECIES_IDS.articuno);
      const opponent = createGen3ActivePokemon(GEN3_SPECIES_IDS.tauros);
      const state = createBattleState(pressureMon, opponent);

      const context: AbilityContext = {
        pokemon: pressureMon,
        opponent,
        state,
        rng: new SeededRandom(0),
        trigger: TRIGGER_ON_SWITCH_IN,
      };

      const result = applyGen3Ability(TRIGGER_ON_SWITCH_IN, context);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([]);
      expect(result.messages).toEqual([`Articuno is exerting its ${PRESSURE_DISPLAY_NAME}!`]);
    });
  });

  describe("getPPCost via Gen3Ruleset", () => {
    it("given a defender with Pressure, when actor uses a move, then PP cost is 2", () => {
      // Source: pret/pokeemerald — ABILITY_PRESSURE: deductsExtraMove
      // Source: Bulbapedia — "moves targeting the Ability-bearer use 2 PP"
      const ruleset = new Gen3Ruleset();
      const actor = createGen3ActivePokemon(GEN3_SPECIES_IDS.tauros);
      const defender = createGen3ActivePokemon(GEN3_SPECIES_IDS.articuno);
      const state = createBattleState(actor, defender);

      const ppCost = ruleset.getPPCost(actor, defender, state);
      expect(ppCost).toBe(2);
    });

    it("given a defender without Pressure, when actor uses a move, then PP cost is 1", () => {
      // Source: pret/pokeemerald — default PP cost is 1 without Pressure
      const ruleset = new Gen3Ruleset();
      const actor = createGen3ActivePokemon(GEN3_SPECIES_IDS.tauros);
      const defender = createGen3ActivePokemon(GEN3_SPECIES_IDS.gardevoir);
      const state = createBattleState(actor, defender);

      const ppCost = ruleset.getPPCost(actor, defender, state);
      expect(ppCost).toBe(1);
    });

    it("given no defender (null), when actor uses a move, then PP cost is 1", () => {
      // Edge case: defender is null (e.g., field-targeting move or fainted opponent)
      const ruleset = new Gen3Ruleset();
      const actor = createGen3ActivePokemon(GEN3_SPECIES_IDS.tauros);
      const state = createBattleState(actor, createGen3ActivePokemon(GEN3_SPECIES_IDS.gardevoir));

      const ppCost = ruleset.getPPCost(actor, null, state);
      expect(ppCost).toBe(1);
    });
  });
});

// ===========================================================================
// Truant -- alternates acting and loafing
// ===========================================================================

describe("Gen 3 Truant ability (on-before-move)", () => {
  // Source: pret/pokeemerald src/battle_util.c — ABILITY_TRUANT
  // Source: Bulbapedia — "Truant causes the Pokemon to use a move only every other turn"

  it("given Truant with no truant-turn volatile (first turn), when on-before-move fires, then move proceeds and volatile is NOT set (toggle is at end-of-turn)", () => {
    // Source: pret/pokeemerald -- Truant toggle at ABILITYEFFECT_ENDTURN, not at move execution
    // Source: pret/pokeemerald -- Truant acts on the turn it switches in
    const slaking = createGen3ActivePokemon(GEN3_SPECIES_IDS.slaking);
    const opponent = createGen3ActivePokemon(GEN3_SPECIES_IDS.tauros);
    const state = createBattleState(slaking, opponent);

    const context: AbilityContext = {
      pokemon: slaking,
      opponent,
      state,
      rng: new SeededRandom(0),
      trigger: TRIGGER_ON_BEFORE_MOVE,
    };

    const result = applyGen3Ability(TRIGGER_ON_BEFORE_MOVE, context);
    expect(result.activated).toBe(false);
    expect(result.movePrevented).toBeUndefined();
  });

  it("given Truant with truant-turn volatile (second turn), when on-before-move fires, then move is prevented", () => {
    // Source: pret/pokeemerald -- Truant check at ABILITYEFFECT_MOVES_BLOCK
    // Source: pret/pokeemerald -- Truant toggle at ABILITYEFFECT_ENDTURN
    const slaking = createGen3ActivePokemon(GEN3_SPECIES_IDS.slaking);
    const opponent = createGen3ActivePokemon(GEN3_SPECIES_IDS.tauros);
    const state = createBattleState(slaking, opponent);
    const context: AbilityContext = {
      pokemon: slaking,
      opponent,
      state,
      rng: new SeededRandom(0),
      trigger: TRIGGER_ON_BEFORE_MOVE,
    };

    const firstTurn = applyGen3Ability(TRIGGER_ON_BEFORE_MOVE, context);
    expect(firstTurn.activated).toBe(false);
    applyGen3Ability(TRIGGER_ON_TURN_END, {
      ...context,
      trigger: TRIGGER_ON_TURN_END,
    });

    const secondTurn = applyGen3Ability(TRIGGER_ON_BEFORE_MOVE, context);
    expect(secondTurn.activated).toBe(true);
    expect(secondTurn.movePrevented).toBe(true);
    expect(secondTurn.messages[0]).toContain("Slaking");
    expect(secondTurn.messages[0]).toContain("loafing around");

    applyGen3Ability(TRIGGER_ON_TURN_END, {
      ...context,
      trigger: TRIGGER_ON_TURN_END,
    });

    const thirdTurn = applyGen3Ability(TRIGGER_ON_BEFORE_MOVE, context);
    expect(thirdTurn.activated).toBe(false);
    expect(thirdTurn.movePrevented).toBeUndefined();
  });

  it("given a non-Truant Pokemon, when on-before-move fires, then move proceeds normally", () => {
    // Non-Truant abilities should not block moves
    const normal = createGen3ActivePokemon(GEN3_SPECIES_IDS.alakazam, {
      abilitySlot: CORE_ABILITY_SLOTS.normal2,
    });
    const opponent = createGen3ActivePokemon(GEN3_SPECIES_IDS.tauros);
    const state = createBattleState(normal, opponent);

    const context: AbilityContext = {
      pokemon: normal,
      opponent,
      state,
      rng: new SeededRandom(0),
      trigger: TRIGGER_ON_BEFORE_MOVE,
    };

    const result = applyGen3Ability(TRIGGER_ON_BEFORE_MOVE, context);
    expect(result.activated).toBe(false);
    expect(result.movePrevented).toBeUndefined();
  });
});

// ===========================================================================
// Color Change -- changes type to move's type on being hit
// ===========================================================================

describe("Gen 3 Color Change ability (on-damage-taken)", () => {
  // Source: pret/pokeemerald src/battle_util.c — ABILITY_COLOR_CHANGE
  // Source: Bulbapedia — "Color Change changes the user's type to that of the move that hits it"

  it("given a Pokemon with Color Change hit by a Fire move, when on-damage-taken fires, then type changes to Fire", () => {
    // Source: pret/pokeemerald — Color Change sets holder's type to the incoming move's type
    const kecleon = createGen3ActivePokemon(GEN3_SPECIES_IDS.kecleon);
    const opponent = createGen3ActivePokemon(GEN3_SPECIES_IDS.tauros);
    const state = createBattleState(kecleon, opponent);

    const context: AbilityContext = {
      pokemon: kecleon,
      opponent,
      state,
      rng: new SeededRandom(0),
      trigger: TRIGGER_ON_DAMAGE_TAKEN,
      move: FLAMETHROWER,
      damage: 50,
    };

    const result = applyGen3Ability(TRIGGER_ON_DAMAGE_TAKEN, context);
    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({
      effectType: "type-change",
      target: "self",
      types: [CORE_TYPE_IDS.fire],
    });
    expect(result.messages).toEqual([`Kecleon's Color Change made it the fire type!`]);
  });

  it("given a Pokemon with Color Change hit by an Electric move, when on-damage-taken fires, then type changes to Electric", () => {
    // Second triangulation case: different move type
    // Source: pret/pokeemerald — Color Change activates for any damaging move type
    const kecleon = createGen3ActivePokemon(GEN3_SPECIES_IDS.kecleon);
    const opponent = createGen3ActivePokemon(GEN3_SPECIES_IDS.tauros);
    const state = createBattleState(kecleon, opponent);

    const context: AbilityContext = {
      pokemon: kecleon,
      opponent,
      state,
      rng: new SeededRandom(0),
      trigger: TRIGGER_ON_DAMAGE_TAKEN,
      move: THUNDERBOLT,
      damage: 60,
    };

    const result = applyGen3Ability(TRIGGER_ON_DAMAGE_TAKEN, context);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "type-change",
      target: "self",
      types: [CORE_TYPE_IDS.electric],
    });
  });

  it("given a mono-Fire Kecleon hit by a Fire move, when on-damage-taken fires, then no type change", () => {
    // Source: pret/pokeemerald — Color Change does not activate if already that mono-type
    // Source: Bulbapedia — "Color Change does not activate if the Pokemon is already the type"
    const kecleon = createGen3ActivePokemon(GEN3_SPECIES_IDS.kecleon);
    kecleon.types = [CORE_TYPE_IDS.fire];
    const opponent = createGen3ActivePokemon(GEN3_SPECIES_IDS.tauros);
    const state = createBattleState(kecleon, opponent);

    const context: AbilityContext = {
      pokemon: kecleon,
      opponent,
      state,
      rng: new SeededRandom(0),
      trigger: TRIGGER_ON_DAMAGE_TAKEN,
      move: FLAMETHROWER,
      damage: 50,
    };

    const result = applyGen3Ability(TRIGGER_ON_DAMAGE_TAKEN, context);
    expect(result.activated).toBe(false);
    expect(result.effects).toHaveLength(0);
  });

  it("given a dual-typed (Fire/Flying) Pokemon with Color Change hit by a Fire move, when on-damage-taken fires, then Color Change does NOT activate", () => {
    // pokeemerald IS_BATTLER_OF_TYPE checks both type slots — if EITHER matches, no activation.
    // Source: pret/pokeemerald src/battle_util.c line 2757 —
    //   gBattleMons[battler].types[0] == type || gBattleMons[battler].types[1] == type
    const kecleon = createGen3ActivePokemon(GEN3_SPECIES_IDS.kecleon);
    kecleon.types = [CORE_TYPE_IDS.fire, CORE_TYPE_IDS.flying];
    const opponent = createGen3ActivePokemon(GEN3_SPECIES_IDS.tauros);
    const state = createBattleState(kecleon, opponent);

    const context: AbilityContext = {
      pokemon: kecleon,
      opponent,
      state,
      rng: new SeededRandom(0),
      trigger: TRIGGER_ON_DAMAGE_TAKEN,
      move: FLAMETHROWER,
      damage: 50,
    };

    const result = applyGen3Ability(TRIGGER_ON_DAMAGE_TAKEN, context);
    expect(result.activated).toBe(false);
    expect(result.effects).toHaveLength(0);
  });

  it("given a non-Color-Change Pokemon, when on-damage-taken fires, then no type change", () => {
    // Other abilities should not trigger type changes
    const normal = createGen3ActivePokemon(GEN3_SPECIES_IDS.tauros);
    const opponent = createGen3ActivePokemon(GEN3_SPECIES_IDS.tauros);
    const state = createBattleState(normal, opponent);

    const context: AbilityContext = {
      pokemon: normal,
      opponent,
      state,
      rng: new SeededRandom(0),
      trigger: TRIGGER_ON_DAMAGE_TAKEN,
      move: FLAMETHROWER,
      damage: 50,
    };

    const result = applyGen3Ability(TRIGGER_ON_DAMAGE_TAKEN, context);
    expect(result.activated).toBe(false);
  });

  it("given Color Change with no move in context, when on-damage-taken fires, then no activation", () => {
    // Edge case: no move information present
    const kecleon = createGen3ActivePokemon(GEN3_SPECIES_IDS.kecleon);
    const opponent = createGen3ActivePokemon(GEN3_SPECIES_IDS.tauros);
    const state = createBattleState(kecleon, opponent);

    const context: AbilityContext = {
      pokemon: kecleon,
      opponent,
      state,
      rng: new SeededRandom(0),
      trigger: TRIGGER_ON_DAMAGE_TAKEN,
      // No move
    };

    const result = applyGen3Ability(TRIGGER_ON_DAMAGE_TAKEN, context);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Synchronize -- mirrors burn/paralysis/poison to opponent
// ===========================================================================

describe("Gen 3 Synchronize ability (on-status-inflicted)", () => {
  // Source: pret/pokeemerald src/battle_util.c — ABILITY_SYNCHRONIZE
  // Source: Bulbapedia — "Synchronize passes burn, paralysis, and poison to the opponent"

  it("given a Pokemon with Synchronize that received paralysis, when on-status-inflicted fires, then opponent gets paralysis", () => {
    // Source: pret/pokeemerald — Synchronize mirrors paralysis to foe
    const syncer = createGen3ActivePokemon(GEN3_SPECIES_IDS.gardevoir);
    const opponent = createGen3ActivePokemon(GEN3_SPECIES_IDS.tauros);
    syncer.pokemon.status = CORE_STATUS_IDS.paralysis;
    const state = createBattleState(syncer, opponent);

    const context: AbilityContext = {
      pokemon: syncer,
      opponent,
      state,
      rng: new SeededRandom(0),
      trigger: TRIGGER_ON_STATUS_INFLICTED,
    };

    const result = applyGen3Ability(TRIGGER_ON_STATUS_INFLICTED, context);
    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({
      effectType: "status-inflict",
      target: "opponent",
      status: CORE_STATUS_IDS.paralysis,
    });
    expect(result.messages).toEqual([`Gardevoir's Synchronize shared its paralysis with Tauros!`]);
  });

  it("given a Pokemon with Synchronize that received burn, when on-status-inflicted fires, then opponent gets burn", () => {
    // Source: pret/pokeemerald — Synchronize mirrors burn
    const syncer = createGen3ActivePokemon(GEN3_SPECIES_IDS.gardevoir);
    const opponent = createGen3ActivePokemon(GEN3_SPECIES_IDS.snorlax);
    syncer.pokemon.status = CORE_STATUS_IDS.burn;
    const state = createBattleState(syncer, opponent);

    const context: AbilityContext = {
      pokemon: syncer,
      opponent,
      state,
      rng: new SeededRandom(0),
      trigger: TRIGGER_ON_STATUS_INFLICTED,
    };

    const result = applyGen3Ability(TRIGGER_ON_STATUS_INFLICTED, context);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "status-inflict",
      target: "opponent",
      status: CORE_STATUS_IDS.burn,
    });
  });

  it("given a Pokemon with Synchronize that received poison, when on-status-inflicted fires, then opponent gets poison", () => {
    // Source: pret/pokeemerald — Synchronize mirrors poison
    const syncer = createGen3ActivePokemon(GEN3_SPECIES_IDS.gardevoir);
    const opponent = createGen3ActivePokemon(GEN3_SPECIES_IDS.slaking);
    syncer.pokemon.status = CORE_STATUS_IDS.poison;
    const state = createBattleState(syncer, opponent);

    const context: AbilityContext = {
      pokemon: syncer,
      opponent,
      state,
      rng: new SeededRandom(0),
      trigger: TRIGGER_ON_STATUS_INFLICTED,
    };

    const result = applyGen3Ability(TRIGGER_ON_STATUS_INFLICTED, context);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "status-inflict",
      target: "opponent",
      status: CORE_STATUS_IDS.poison,
    });
  });

  it("given a Pokemon with Synchronize that received badly-poisoned, when on-status-inflicted fires, then opponent gets regular poison (Gen 3 downgrade)", () => {
    // In Gen 3, Synchronize downgrades badly-poisoned to regular poison before mirroring.
    // Source: pret/pokeemerald src/battle_util.c lines 2976-2977, 2992-2993 —
    //   if (synchronizeMoveEffect == MOVE_EFFECT_TOXIC) synchronizeMoveEffect = MOVE_EFFECT_POISON
    const syncer = createGen3ActivePokemon(GEN3_SPECIES_IDS.gardevoir);
    const opponent = createGen3ActivePokemon(GEN3_SPECIES_IDS.tauros);
    syncer.pokemon.status = CORE_STATUS_IDS.badlyPoisoned;
    const state = createBattleState(syncer, opponent);

    const context: AbilityContext = {
      pokemon: syncer,
      opponent,
      state,
      rng: new SeededRandom(0),
      trigger: TRIGGER_ON_STATUS_INFLICTED,
    };

    const result = applyGen3Ability(TRIGGER_ON_STATUS_INFLICTED, context);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "status-inflict",
      target: "opponent",
      status: CORE_STATUS_IDS.poison,
    });
  });

  it("given a Pokemon with Synchronize that received sleep, when on-status-inflicted fires, then does NOT mirror sleep", () => {
    // Source: pret/pokeemerald — Synchronize does NOT work with sleep
    // Source: Bulbapedia — "Synchronize does not activate for Sleep or Freeze"
    const syncer = createGen3ActivePokemon(GEN3_SPECIES_IDS.gardevoir);
    const opponent = createGen3ActivePokemon(GEN3_SPECIES_IDS.tauros);
    syncer.pokemon.status = CORE_STATUS_IDS.sleep;
    const state = createBattleState(syncer, opponent);

    const context: AbilityContext = {
      pokemon: syncer,
      opponent,
      state,
      rng: new SeededRandom(0),
      trigger: TRIGGER_ON_STATUS_INFLICTED,
    };

    const result = applyGen3Ability(TRIGGER_ON_STATUS_INFLICTED, context);
    expect(result.activated).toBe(false);
    expect(result.effects).toHaveLength(0);
  });

  it("given a Pokemon with Synchronize that received freeze, when on-status-inflicted fires, then does NOT mirror freeze", () => {
    // Source: pret/pokeemerald — Synchronize does NOT work with freeze
    // Source: Bulbapedia — "Synchronize does not activate for Sleep or Freeze"
    const syncer = createGen3ActivePokemon(GEN3_SPECIES_IDS.gardevoir);
    const opponent = createGen3ActivePokemon(GEN3_SPECIES_IDS.tauros);
    syncer.pokemon.status = CORE_STATUS_IDS.freeze;
    const state = createBattleState(syncer, opponent);

    const context: AbilityContext = {
      pokemon: syncer,
      opponent,
      state,
      rng: new SeededRandom(0),
      trigger: TRIGGER_ON_STATUS_INFLICTED,
    };

    const result = applyGen3Ability(TRIGGER_ON_STATUS_INFLICTED, context);
    expect(result.activated).toBe(false);
    expect(result.effects).toHaveLength(0);
  });

  it("given a Pokemon with Synchronize and paralyzed opponent, when on-status-inflicted fires, then does NOT trigger (opponent already has status)", () => {
    // Source: pret/pokeemerald — cannot synchronize if opponent already has a primary status
    const syncer = createGen3ActivePokemon(GEN3_SPECIES_IDS.gardevoir);
    const opponent = createGen3ActivePokemon(GEN3_SPECIES_IDS.tauros);
    syncer.pokemon.status = CORE_STATUS_IDS.paralysis;
    opponent.pokemon.status = CORE_STATUS_IDS.paralysis;
    const state = createBattleState(syncer, opponent);

    const context: AbilityContext = {
      pokemon: syncer,
      opponent,
      state,
      rng: new SeededRandom(0),
      trigger: TRIGGER_ON_STATUS_INFLICTED,
    };

    const result = applyGen3Ability(TRIGGER_ON_STATUS_INFLICTED, context);
    expect(result.activated).toBe(false);
    expect(result.effects).toHaveLength(0);
  });

  it("given a Pokemon with Synchronize but no status, when on-status-inflicted fires, then does not activate", () => {
    // Edge case: trigger fires but the pokemon has no status (shouldn't normally happen)
    const syncer = createGen3ActivePokemon(GEN3_SPECIES_IDS.gardevoir);
    const opponent = createGen3ActivePokemon(GEN3_SPECIES_IDS.tauros);
    const state = createBattleState(syncer, opponent);

    const context: AbilityContext = {
      pokemon: syncer,
      opponent,
      state,
      rng: new SeededRandom(0),
      trigger: TRIGGER_ON_STATUS_INFLICTED,
    };

    const result = applyGen3Ability(TRIGGER_ON_STATUS_INFLICTED, context);
    expect(result.activated).toBe(false);
  });

  it("given a non-Synchronize Pokemon that received paralysis, when on-status-inflicted fires, then does not activate", () => {
    // Other abilities should not trigger synchronize logic
    const normal = createGen3ActivePokemon(GEN3_SPECIES_IDS.alakazam, {
      abilitySlot: CORE_ABILITY_SLOTS.normal2,
    });
    normal.pokemon.status = CORE_STATUS_IDS.paralysis;
    const opponent = createGen3ActivePokemon(GEN3_SPECIES_IDS.tauros);
    const state = createBattleState(normal, opponent);

    const context: AbilityContext = {
      pokemon: normal,
      opponent,
      state,
      rng: new SeededRandom(0),
      trigger: TRIGGER_ON_STATUS_INFLICTED,
    };

    const result = applyGen3Ability(TRIGGER_ON_STATUS_INFLICTED, context);
    expect(result.activated).toBe(false);
  });
});
