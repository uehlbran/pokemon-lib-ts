import type {
  ActivePokemon,
  BattleState,
  DamageContext,
  MoveEffectContext,
} from "@pokemon-lib-ts/battle";
import type {
  PokemonType,
  PrimaryStatus,
  SeededRandom,
  StatBlock,
  TypeChart,
} from "@pokemon-lib-ts/core";
import {
  CORE_END_OF_TURN_EFFECT_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  createMoveSlot,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen2DataManager,
  GEN2_ITEM_IDS,
  GEN2_MOVE_IDS,
  GEN2_NATURE_IDS,
  GEN2_SPECIES_IDS,
  GEN2_TYPES,
} from "../../src";
import { calculateGen2Damage } from "../../src/Gen2DamageCalc";
import { applyMoveEffect, type MutableResult } from "../../src/Gen2MoveEffects";
import { Gen2Ruleset } from "../../src/Gen2Ruleset";
import { createSyntheticOnFieldPokemon as createSharedSyntheticOnFieldPokemon } from "../helpers/createSyntheticOnFieldPokemon";

const NORMAL = CORE_TYPE_IDS.normal;
const _FIRE = CORE_TYPE_IDS.fire;
const _WATER = CORE_TYPE_IDS.water;
const _ELECTRIC = CORE_TYPE_IDS.electric;
const _GRASS = CORE_TYPE_IDS.grass;
const _ICE = CORE_TYPE_IDS.ice;
const FIGHTING = CORE_TYPE_IDS.fighting;
const _POISON = CORE_TYPE_IDS.poison;
const _GROUND = CORE_TYPE_IDS.ground;
const _FLYING = CORE_TYPE_IDS.flying;
const _PSYCHIC = CORE_TYPE_IDS.psychic;
const _BUG = CORE_TYPE_IDS.bug;
const _ROCK = CORE_TYPE_IDS.rock;
const _GHOST = CORE_TYPE_IDS.ghost;
const _DRAGON = CORE_TYPE_IDS.dragon;
const _DARK = CORE_TYPE_IDS.dark;
const _STEEL = CORE_TYPE_IDS.steel;

const TACKLE = GEN2_MOVE_IDS.tackle;
const GROWL = GEN2_MOVE_IDS.growl;
const ENCORE = GEN2_MOVE_IDS.encore;
const DISABLE = GEN2_MOVE_IDS.disable;
const BATON_PASS = GEN2_MOVE_IDS.batonPass;
const RETURN = GEN2_MOVE_IDS.return;
const FRUSTRATION = GEN2_MOVE_IDS.frustration;
const FIRE_BLAST = GEN2_MOVE_IDS.fireBlast;
const _WATER_GUN = GEN2_MOVE_IDS.waterGun;
const _HYPER_BEAM = GEN2_MOVE_IDS.hyperBeam;
const _EXPLOSION = GEN2_MOVE_IDS.explosion;
const _SELF_DESTRUCT = GEN2_MOVE_IDS.selfDestruct;
const _MYSTIC_WATER = GEN2_ITEM_IDS.mysticWater;
const _LIGHT_BALL = GEN2_ITEM_IDS.lightBall;
const _METAL_POWDER = GEN2_ITEM_IDS.metalPowder;
const _THICK_CLUB = GEN2_ITEM_IDS.thickClub;
const POKE_BALL = GEN2_ITEM_IDS.pokeBall;
const ENCORE_COUNTDOWN = CORE_END_OF_TURN_EFFECT_IDS.encoreCountdown;
const DISABLE_COUNTDOWN = CORE_END_OF_TURN_EFFECT_IDS.disableCountdown;
const CONFUSION = CORE_VOLATILE_IDS.confusion;
const FOCUS_ENERGY = GEN2_MOVE_IDS.focusEnergy;
const LEECH_SEED = CORE_VOLATILE_IDS.leechSeed;
const DATA_MANAGER = createGen2DataManager();
const GENERIC_SPECIES = DATA_MANAGER.getSpecies(GEN2_SPECIES_IDS.bulbasaur);
const ENCORE_MOVE = DATA_MANAGER.getMove(ENCORE);
const DISABLE_MOVE = DATA_MANAGER.getMove(DISABLE);
const BATON_PASS_MOVE = DATA_MANAGER.getMove(BATON_PASS);
const RETURN_MOVE = DATA_MANAGER.getMove(RETURN);
const FRUSTRATION_MOVE = DATA_MANAGER.getMove(FRUSTRATION);
const ENCORE_VOLATILE = ENCORE_MOVE.id;
const DISABLE_VOLATILE = DISABLE_MOVE.id;
const DEFAULT_NATURE = GEN2_NATURE_IDS.hardy;

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

/** A mock RNG whose int() always returns a fixed value. */
function createMockRng(intReturnValue: number): SeededRandom {
  return {
    next: () => 0,
    int: (_min: number, _max: number) => intReturnValue,
    chance: () => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  } as SeededRandom;
}

function createSyntheticOnFieldPokemon(opts: {
  level?: number;
  attack?: number;
  defense?: number;
  spAttack?: number;
  spDefense?: number;
  types?: PokemonType[];
  status?: PrimaryStatus | null;
  heldItem?: string | null;
  statStages?: Partial<Record<string, number>>;
  speciesId?: number;
  nickname?: string | null;
  lastMoveUsed?: string | null;
  friendship?: number;
  moves?: Array<{ moveId: string; currentPP: number; maxPP: number }>;
  currentHp?: number;
}): ActivePokemon {
  const stats: StatBlock = {
    hp: opts.currentHp ?? 200,
    attack: opts.attack ?? 100,
    defense: opts.defense ?? 100,
    spAttack: opts.spAttack ?? 100,
    spDefense: opts.spDefense ?? 100,
    speed: 100,
  };

  const moveSlots = opts.moves?.map((move) => ({
    moveId: move.moveId,
    currentPP: move.currentPP,
    maxPP: move.maxPP,
    ppUps: 0,
  })) ?? [createMoveSlot(TACKLE, DATA_MANAGER.getMove(TACKLE).pp)];
  const pokemon = createSharedSyntheticOnFieldPokemon({
    speciesId: opts.speciesId ?? GENERIC_SPECIES.id,
    level: opts.level ?? 50,
    currentHp: opts.currentHp ?? 200,
    heldItem: opts.heldItem ?? null,
    status: opts.status ?? null,
    friendship: opts.friendship ?? 70,
    moveSlots,
    nickname: opts.nickname ?? null,
    lastMoveUsed: opts.lastMoveUsed ?? null,
    calculatedStats: stats,
    types: opts.types ?? [NORMAL],
    statStages: {
      hp: 0,
      attack: opts.statStages?.attack ?? 0,
      defense: opts.statStages?.defense ?? 0,
      spAttack: opts.statStages?.spAttack ?? 0,
      spDefense: opts.statStages?.spDefense ?? 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
  });
  pokemon.pokemon.nature = DEFAULT_NATURE;
  pokemon.pokemon.pokeball = POKE_BALL;
  pokemon.forcedMove = null;
  return pokemon;
}

function createMockState(attacker: ActivePokemon, defender: ActivePokemon): BattleState {
  return {
    weather: null,
    sides: [
      {
        index: 0 as const,
        active: [attacker],
        team: [],
        hazards: [],
        screens: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
      },
      {
        index: 1 as const,
        active: [defender],
        team: [],
        hazards: [],
        screens: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
      },
    ],
  } as unknown as BattleState;
}

/** All-neutral type chart for 17 Gen 2 types. */
function createNeutralTypeChart(): TypeChart {
  const types: PokemonType[] = [...GEN2_TYPES];
  const chart = {} as Record<string, Record<string, number>>;
  for (const atk of types) {
    chart[atk] = {};
    for (const def of types) {
      (chart[atk] as Record<string, number>)[def] = 1;
    }
  }
  return chart as TypeChart;
}

/** Create a fresh MutableResult for effect testing. */
function createEmptyResult(): MutableResult {
  return {
    statusInflicted: null,
    volatileInflicted: null,
    statChanges: [],
    recoilDamage: 0,
    healAmount: 0,
    switchOut: false,
    messages: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Gen 2 Utility Moves", () => {
  // -------------------------------------------------------------------
  // Encore
  // -------------------------------------------------------------------

  describe("Encore", () => {
    it("given defender has used a move with PP remaining, when Encore is used, then volatile is set with moveIndex", () => {
      // Source: pret/pokecrystal engine/battle/effect_commands.asm EncoreEffect
      // Encore forces the target to repeat its last used move for 2-6 turns
      const attacker = createSyntheticOnFieldPokemon({});
      const defender = createSyntheticOnFieldPokemon({
        lastMoveUsed: TACKLE,
        moves: [
          { moveId: TACKLE, currentPP: 35, maxPP: 35 },
          { moveId: GROWL, currentPP: 40, maxPP: 40 },
        ],
      });
      const state = createMockState(attacker, defender);
      const rng = createMockRng(4); // rng.int(2, 6) returns 4 turns

      const result = createEmptyResult();
      const move = DATA_MANAGER.getMove(ENCORE);

      applyMoveEffect(move.effect!, move, result, {
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng,
      } as MoveEffectContext);

      // Assert
      expect(result.volatileInflicted).toBe(ENCORE_VOLATILE);
      expect(result.volatileData?.turnsLeft).toBe(4);
      expect(result.volatileData?.data?.moveIndex).toBe(0);
    });

    it("given defender has not used a move yet, when Encore is used, then it fails", () => {
      // Source: pret/pokecrystal engine/battle/effect_commands.asm EncoreEffect
      // Encore fails if the target has not yet used a move
      const attacker = createSyntheticOnFieldPokemon({});
      const defender = createSyntheticOnFieldPokemon({
        lastMoveUsed: null,
        moves: [{ moveId: TACKLE, currentPP: 35, maxPP: 35 }],
      });
      const state = createMockState(attacker, defender);
      const rng = createMockRng(3);

      const result = createEmptyResult();
      const move = ENCORE_MOVE;

      applyMoveEffect(move.effect!, move, result, {
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng,
      } as MoveEffectContext);

      // Assert
      expect(result.volatileInflicted).toBeNull();
      expect(result.messages).toContain("But it failed!");
    });

    it("given defender's last move has 0 PP, when Encore is used, then it fails", () => {
      // Source: pret/pokecrystal engine/battle/effect_commands.asm EncoreEffect
      // Encore fails if the encored move has 0 PP
      const attacker = createSyntheticOnFieldPokemon({});
      const defender = createSyntheticOnFieldPokemon({
        lastMoveUsed: TACKLE,
        moves: [{ moveId: TACKLE, currentPP: 0, maxPP: 35 }],
      });
      const state = createMockState(attacker, defender);
      const rng = createMockRng(3);

      const result = createEmptyResult();
      const move = ENCORE_MOVE;

      applyMoveEffect(move.effect!, move, result, {
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng,
      } as MoveEffectContext);

      // Assert
      expect(result.volatileInflicted).toBeNull();
      expect(result.messages).toContain("But it failed!");
    });

    it("given defender's last move is not in its current moveset, when Encore is used, then it fails", () => {
      // Source: pret/pokecrystal — Encore fails if the target no longer knows the move
      const attacker = createSyntheticOnFieldPokemon({});
      const defender = createSyntheticOnFieldPokemon({
        lastMoveUsed: FIRE_BLAST,
        moves: [{ moveId: TACKLE, currentPP: 35, maxPP: 35 }],
      });
      const state = createMockState(attacker, defender);
      const rng = createMockRng(3);

      const result = createEmptyResult();
      const move = ENCORE_MOVE;

      applyMoveEffect(move.effect!, move, result, {
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng,
      } as MoveEffectContext);

      // Assert
      expect(result.volatileInflicted).toBeNull();
      expect(result.messages).toContain("But it failed!");
    });
  });

  // -------------------------------------------------------------------
  // Disable
  // -------------------------------------------------------------------

  describe("Disable", () => {
    it("given defender has used a move with PP remaining, when Disable is used, then volatile is set with moveId", () => {
      // Source: pret/pokecrystal engine/battle/effect_commands.asm DisableEffect
      // Disable prevents the target from using its last-used move for 1-7 turns
      const attacker = createSyntheticOnFieldPokemon({});
      const defender = createSyntheticOnFieldPokemon({
        lastMoveUsed: TACKLE,
        moves: [
          { moveId: TACKLE, currentPP: 35, maxPP: 35 },
          { moveId: GROWL, currentPP: 40, maxPP: 40 },
        ],
      });
      const state = createMockState(attacker, defender);
      const rng = createMockRng(5); // rng.int(1, 7) returns 5 turns

      const result = createEmptyResult();
      const move = DISABLE_MOVE;

      applyMoveEffect(move.effect!, move, result, {
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng,
      } as MoveEffectContext);

      // Assert
      expect(result.volatileInflicted).toBe(DISABLE_VOLATILE);
      expect(result.volatileData?.turnsLeft).toBe(5);
      expect(result.volatileData?.data?.moveId).toBe(TACKLE);
    });

    it("given defender has not used a move yet, when Disable is used, then it fails", () => {
      // Source: pret/pokecrystal engine/battle/effect_commands.asm DisableEffect
      // Disable fails if the target has not yet used a move
      const attacker = createSyntheticOnFieldPokemon({});
      const defender = createSyntheticOnFieldPokemon({
        lastMoveUsed: null,
        moves: [{ moveId: TACKLE, currentPP: 35, maxPP: 35 }],
      });
      const state = createMockState(attacker, defender);
      const rng = createMockRng(3);

      const result = createEmptyResult();
      const move = DISABLE_MOVE;

      applyMoveEffect(move.effect!, move, result, {
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng,
      } as MoveEffectContext);

      // Assert
      expect(result.volatileInflicted).toBeNull();
      expect(result.messages).toContain("But it failed!");
    });

    it("given defender already has Disable volatile, when Disable is used, then it fails", () => {
      // Source: pret/pokecrystal — Disable fails if the target already has a disabled move
      const attacker = createSyntheticOnFieldPokemon({});
      const defender = createSyntheticOnFieldPokemon({
        lastMoveUsed: TACKLE,
        moves: [{ moveId: TACKLE, currentPP: 35, maxPP: 35 }],
      });
      defender.volatileStatuses.set(DISABLE_VOLATILE, { turnsLeft: 3, data: { moveId: GROWL } });
      const state = createMockState(attacker, defender);
      const rng = createMockRng(3);

      const result = createEmptyResult();
      const move = DISABLE_MOVE;

      applyMoveEffect(move.effect!, move, result, {
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng,
      } as MoveEffectContext);

      // Assert
      expect(result.volatileInflicted).toBeNull();
      expect(result.messages).toContain("But it failed!");
    });

    it("given defender's last move has 0 PP, when Disable is used, then it fails", () => {
      // Source: pret/pokecrystal — Disable fails if the move has 0 PP
      const attacker = createSyntheticOnFieldPokemon({});
      const defender = createSyntheticOnFieldPokemon({
        lastMoveUsed: TACKLE,
        moves: [{ moveId: TACKLE, currentPP: 0, maxPP: 35 }],
      });
      const state = createMockState(attacker, defender);
      const rng = createMockRng(3);

      const result = createEmptyResult();
      const move = DISABLE_MOVE;

      applyMoveEffect(move.effect!, move, result, {
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng,
      } as MoveEffectContext);

      // Assert
      expect(result.volatileInflicted).toBeNull();
      expect(result.messages).toContain("But it failed!");
    });
  });

  // -------------------------------------------------------------------
  // Baton Pass
  // -------------------------------------------------------------------

  describe("Baton Pass", () => {
    it("given switch-out effect with baton-pass id, when used, then switchOut and batonPass are true", () => {
      // Source: pret/pokecrystal engine/battle/effect_commands.asm BatonPassEffect
      // Baton Pass sets switchOut and batonPass flags for the engine
      const attacker = createSyntheticOnFieldPokemon({});
      const defender = createSyntheticOnFieldPokemon({});
      const state = createMockState(attacker, defender);
      const rng = createMockRng(0);

      const result = createEmptyResult();
      const move = BATON_PASS_MOVE;

      applyMoveEffect(move.effect!, move, result, {
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng,
      } as MoveEffectContext);

      // Assert
      expect(result.switchOut).toBe(true);
      expect(result.batonPass).toBe(true);
    });

    it("given custom-effect baton-pass, when used, then switchOut and batonPass are true", () => {
      // Source: pret/pokecrystal engine/battle/effect_commands.asm BatonPassEffect
      // The custom handler also sets both flags
      const attacker = createSyntheticOnFieldPokemon({});
      const defender = createSyntheticOnFieldPokemon({});
      const state = createMockState(attacker, defender);
      const rng = createMockRng(0);

      const result = createEmptyResult();
      const move = BATON_PASS_MOVE;

      applyMoveEffect(move.effect!, move, result, {
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng,
      } as MoveEffectContext);

      // Assert
      expect(result.switchOut).toBe(true);
      expect(result.batonPass).toBe(true);
    });

    it("given Baton Pass switch, when onSwitchOut is called, then confusion and focus-energy are preserved", () => {
      // Source: pret/pokecrystal engine/battle/effect_commands.asm BatonPassEffect
      // Baton Pass preserves confusion, focus-energy, leech-seed for the incoming Pokemon
      const ruleset = new Gen2Ruleset();
      const pokemon = createSyntheticOnFieldPokemon({ lastMoveUsed: BATON_PASS });
      pokemon.volatileStatuses.set(CONFUSION, { turnsLeft: 3 });
      pokemon.volatileStatuses.set(FOCUS_ENERGY, { turnsLeft: -1 });
      pokemon.volatileStatuses.set(LEECH_SEED, { turnsLeft: -1 });

      const state = createMockState(pokemon, createSyntheticOnFieldPokemon({}));

      // Act
      ruleset.onSwitchOut(pokemon, state);

      // Assert: baton-passable volatiles are preserved
      expect(pokemon.volatileStatuses.has(CONFUSION)).toBe(true);
      expect(pokemon.volatileStatuses.has(FOCUS_ENERGY)).toBe(true);
      expect(pokemon.volatileStatuses.has(LEECH_SEED)).toBe(true);
    });

    it("given normal switch, when onSwitchOut is called, then confusion and focus-energy are cleared", () => {
      // Source: pret/pokecrystal engine/battle/core.asm NewBattleMonStatus
      // Normal switch clears all non-persistent volatiles
      const ruleset = new Gen2Ruleset();
      const pokemon = createSyntheticOnFieldPokemon({ lastMoveUsed: TACKLE });
      pokemon.volatileStatuses.set(CONFUSION, { turnsLeft: 3 });
      pokemon.volatileStatuses.set(FOCUS_ENERGY, { turnsLeft: -1 });
      pokemon.volatileStatuses.set(LEECH_SEED, { turnsLeft: -1 });

      const state = createMockState(pokemon, createSyntheticOnFieldPokemon({}));

      // Act
      ruleset.onSwitchOut(pokemon, state);

      // Assert: volatiles are cleared
      expect(pokemon.volatileStatuses.has(CONFUSION)).toBe(false);
      expect(pokemon.volatileStatuses.has(FOCUS_ENERGY)).toBe(false);
      expect(pokemon.volatileStatuses.has(LEECH_SEED)).toBe(false);
    });

    it("given Baton Pass switch, when onSwitchOut is called, then encore/disable are still cleared", () => {
      // Source: pret/pokecrystal — encore and disable are tied to the user, not baton-passable
      const ruleset = new Gen2Ruleset();
      const pokemon = createSyntheticOnFieldPokemon({ lastMoveUsed: BATON_PASS });
      pokemon.volatileStatuses.set(ENCORE_VOLATILE, { turnsLeft: 3, data: { moveIndex: 0 } });
      pokemon.volatileStatuses.set(DISABLE_VOLATILE, { turnsLeft: 5, data: { moveId: TACKLE } });

      const state = createMockState(pokemon, createSyntheticOnFieldPokemon({}));

      // Act
      ruleset.onSwitchOut(pokemon, state);

      // Assert: encore and disable are always cleared (not baton-passable)
      expect(pokemon.volatileStatuses.has(ENCORE_VOLATILE)).toBe(false);
      expect(pokemon.volatileStatuses.has(DISABLE_VOLATILE)).toBe(false);
    });
  });

  // -------------------------------------------------------------------
  // Return and Frustration
  // -------------------------------------------------------------------

  describe("Return", () => {
    it("given max friendship (255), when Return is used, then base power = floor(255/2.5) = 102", () => {
      // Source: Bulbapedia — "Return does damage, and its base power is friendship / 2.5 (rounded down)"
      // floor(255 / 2.5) = floor(102) = 102
      // Use Fighting-type attacker to avoid Normal STAB
      const attacker = createSyntheticOnFieldPokemon({
        level: 50,
        attack: 100,
        friendship: 255,
        types: [FIGHTING],
      });
      const defender = createSyntheticOnFieldPokemon({
        level: 50,
        defense: 100,
      });
      const state = createMockState(attacker, defender);
      const typeChart = createNeutralTypeChart();
      const species = GENERIC_SPECIES;

      // Using max roll (255) for predictable damage
      const rng = createMockRng(255);

      const result = calculateGen2Damage(
        {
          attacker,
          defender,
          move: RETURN_MOVE,
          state,
          rng,
          isCrit: false,
        } as DamageContext,
        typeChart,
        species,
      );

      // With power=102, L50, 100 Atk vs 100 Def, no STAB, max roll (255):
      // levelFactor = floor(2*50/5)+2 = 22
      // Step 1: floor(floor(22 * 102 * 100) / 100 / 50) = floor(224400/100/50) = floor(44.88) = 44
      // Step 5: +2 = 46
      // Step 9: floor(46 * 255/255) = 46
      // Source: inline formula derivation
      expect(result.damage).toBe(46);
      expect(result.effectiveness).toBe(1);
    });

    it("given friendship 0, when Return is used, then base power = max(1, floor(0/2.5)) = 1", () => {
      // Source: Bulbapedia — "Return: base power = friendship / 2.5, minimum 1"
      // floor(0 / 2.5) = 0, minimum 1
      // Use Fighting-type attacker to avoid Normal STAB
      const attacker = createSyntheticOnFieldPokemon({
        level: 50,
        attack: 100,
        friendship: 0,
        types: [FIGHTING],
      });
      const defender = createSyntheticOnFieldPokemon({
        level: 50,
        defense: 100,
      });
      const state = createMockState(attacker, defender);
      const typeChart = createNeutralTypeChart();
      const species = GENERIC_SPECIES;
      const rng = createMockRng(255);

      const result = calculateGen2Damage(
        {
          attacker,
          defender,
          move: RETURN_MOVE,
          state,
          rng,
          isCrit: false,
        } as DamageContext,
        typeChart,
        species,
      );

      // With power=1, L50, 100 Atk vs 100 Def, no STAB:
      // levelFactor = 22
      // Step 1: floor(floor(22 * 1 * 100) / 100 / 50) = floor(2200/100/50) = floor(0.44) = 0
      // Step 4: clamp to min 1
      // Step 5: +2 = 3
      // Step 9: floor(3 * 255/255) = 3
      // Source: inline formula derivation
      expect(result.damage).toBe(3);
    });

    it("given friendship 100, when Return is used, then base power = floor(100/2.5) = 40", () => {
      // Source: Bulbapedia — "Return: base power = friendship / 2.5 (rounded down)"
      // floor(100 / 2.5) = floor(40) = 40
      // Use Fighting-type attacker to avoid Normal STAB
      const attacker = createSyntheticOnFieldPokemon({
        level: 50,
        attack: 100,
        friendship: 100,
        types: [FIGHTING],
      });
      const defender = createSyntheticOnFieldPokemon({
        level: 50,
        defense: 100,
      });
      const state = createMockState(attacker, defender);
      const typeChart = createNeutralTypeChart();
      const species = GENERIC_SPECIES;
      const rng = createMockRng(255);

      const result = calculateGen2Damage(
        {
          attacker,
          defender,
          move: RETURN_MOVE,
          state,
          rng,
          isCrit: false,
        } as DamageContext,
        typeChart,
        species,
      );

      // With power=40, L50, 100 Atk vs 100 Def, no STAB, max roll:
      // levelFactor = 22
      // Step 1: floor(floor(22 * 40 * 100) / 100 / 50) = floor(88000/100/50) = floor(17.6) = 17
      // Step 5: +2 = 19
      // Step 9: floor(19 * 255/255) = 19
      // Source: inline formula derivation
      expect(result.damage).toBe(19);
    });
  });

  describe("Frustration", () => {
    it("given friendship 0, when Frustration is used, then base power = floor((255-0)/2.5) = 102", () => {
      // Source: Bulbapedia — "Frustration: base power = (255 - friendship) / 2.5, rounded down"
      // floor(255 / 2.5) = 102
      // Use Fighting-type attacker to avoid Normal STAB
      const attacker = createSyntheticOnFieldPokemon({
        level: 50,
        attack: 100,
        friendship: 0,
        types: [FIGHTING],
      });
      const defender = createSyntheticOnFieldPokemon({
        level: 50,
        defense: 100,
      });
      const state = createMockState(attacker, defender);
      const typeChart = createNeutralTypeChart();
      const species = GENERIC_SPECIES;
      const rng = createMockRng(255);

      const result = calculateGen2Damage(
        {
          attacker,
          defender,
          move: FRUSTRATION_MOVE,
          state,
          rng,
          isCrit: false,
        } as DamageContext,
        typeChart,
        species,
      );

      // Same calc as Return at max friendship: power = 102, no STAB
      // levelFactor = 22
      // Step 1: floor(floor(22 * 102 * 100) / 100 / 50) = 44
      // Step 5: +2 = 46
      // Step 9: floor(46 * 255/255) = 46
      // Source: inline formula derivation
      expect(result.damage).toBe(46);
    });

    it("given friendship 255, when Frustration is used, then base power = max(1, floor(0/2.5)) = 1", () => {
      // Source: Bulbapedia — "Frustration: base power = (255 - friendship) / 2.5, minimum 1"
      // (255-255) / 2.5 = 0, minimum 1
      // Use Fighting-type attacker to avoid Normal STAB
      const attacker = createSyntheticOnFieldPokemon({
        level: 50,
        attack: 100,
        friendship: 255,
        types: [FIGHTING],
      });
      const defender = createSyntheticOnFieldPokemon({
        level: 50,
        defense: 100,
      });
      const state = createMockState(attacker, defender);
      const typeChart = createNeutralTypeChart();
      const species = GENERIC_SPECIES;
      const rng = createMockRng(255);

      const result = calculateGen2Damage(
        {
          attacker,
          defender,
          move: FRUSTRATION_MOVE,
          state,
          rng,
          isCrit: false,
        } as DamageContext,
        typeChart,
        species,
      );

      // Power = 1, same as Return at friendship=0, no STAB
      // levelFactor = 22
      // Step 1: floor(floor(22 * 1 * 100) / 100 / 50) = 0
      // Step 4: clamp to min 1
      // Step 5: +2 = 3
      // Step 9: floor(3 * 255/255) = 3
      // Source: inline formula derivation
      expect(result.damage).toBe(3);
    });
  });

  // -------------------------------------------------------------------
  // End-of-Turn Order
  // -------------------------------------------------------------------

  describe("End-of-Turn Order", () => {
    it("given Gen2Ruleset, when getEndOfTurnOrder is called, then disable-countdown is included", () => {
      // Source: pret/pokecrystal — Disable has a finite duration that counts down each turn
      const ruleset = new Gen2Ruleset();
      const eotOrder = ruleset.getEndOfTurnOrder();
      expect(eotOrder).toContain(DISABLE_COUNTDOWN);
    });

    it("given Gen2Ruleset, when getEndOfTurnOrder is called, then disable-countdown is before encore-countdown", () => {
      // Source: pret/pokecrystal engine/battle/core.asm HandleBetweenTurnEffects
      // Disable countdown fires before Encore (jp HandleEncore is the final call)
      const ruleset = new Gen2Ruleset();
      const eotOrder = ruleset.getEndOfTurnOrder();
      const encoreIdx = eotOrder.indexOf(ENCORE_COUNTDOWN);
      const disableIdx = eotOrder.indexOf(DISABLE_COUNTDOWN);
      expect(eotOrder).toEqual(expect.arrayContaining([DISABLE_COUNTDOWN, ENCORE_COUNTDOWN]));
      expect(eotOrder.slice(disableIdx, encoreIdx + 1)).toEqual([
        DISABLE_COUNTDOWN,
        ENCORE_COUNTDOWN,
      ]);
    });

    it("given Gen2Ruleset, when getEndOfTurnOrder is called, then encore-countdown is the last effect", () => {
      // Source: pret/pokecrystal engine/battle/core.asm:296 — jp HandleEncore is the final call
      const ruleset = new Gen2Ruleset();
      const eotOrder = ruleset.getEndOfTurnOrder();
      expect(eotOrder[eotOrder.length - 1]).toBe(ENCORE_COUNTDOWN);
    });
  });

  // -------------------------------------------------------------------
  // onSwitchOut clears encore and disable
  // -------------------------------------------------------------------

  describe("onSwitchOut volatile cleanup", () => {
    it("given Pokemon has encore volatile, when switching out normally, then encore is cleared", () => {
      // Source: pret/pokecrystal — volatile statuses are cleared on switch-out
      const ruleset = new Gen2Ruleset();
      const pokemon = createSyntheticOnFieldPokemon({ lastMoveUsed: TACKLE });
      pokemon.volatileStatuses.set(ENCORE_VOLATILE, { turnsLeft: 3, data: { moveIndex: 0 } });
      const state = createMockState(pokemon, createSyntheticOnFieldPokemon({}));

      ruleset.onSwitchOut(pokemon, state);

      expect(pokemon.volatileStatuses.has(ENCORE_VOLATILE)).toBe(false);
    });

    it("given Pokemon has disable volatile, when switching out normally, then disable is cleared", () => {
      // Source: pret/pokecrystal — volatile statuses are cleared on switch-out
      const ruleset = new Gen2Ruleset();
      const pokemon = createSyntheticOnFieldPokemon({ lastMoveUsed: TACKLE });
      pokemon.volatileStatuses.set(DISABLE_VOLATILE, { turnsLeft: 5, data: { moveId: GROWL } });
      const state = createMockState(pokemon, createSyntheticOnFieldPokemon({}));

      ruleset.onSwitchOut(pokemon, state);

      expect(pokemon.volatileStatuses.has(DISABLE_VOLATILE)).toBe(false);
    });
  });
});
