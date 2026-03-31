import type { ActivePokemon, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import { BATTLE_EFFECT_TARGETS } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType, PrimaryStatus } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_STAT_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen2DataManager, GEN2_MOVE_IDS, GEN2_SPECIES_IDS, Gen2Ruleset } from "../../src";

function createMockActive(
  overrides: Partial<{
    level: number;
    currentHp: number;
    maxHp: number;
    status: PrimaryStatus | null;
    types: PokemonType[];
    nickname: string | null;
  }> = {},
): ActivePokemon {
  const maxHp = overrides.maxHp ?? 200;

  return {
    pokemon: {
      speciesId: GEN2_SPECIES_IDS.bulbasaur,
      level: overrides.level ?? 50,
      currentHp: overrides.currentHp ?? maxHp,
      status: overrides.status ?? null,
      heldItem: null,
      nickname: overrides.nickname ?? null,
      ivs: { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      moves: [],
      calculatedStats: {
        hp: maxHp,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
      },
    },
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
    types: overrides.types ?? [CORE_TYPE_IDS.normal],
    ability: CORE_ABILITY_IDS.none,
    lastMoveUsed: null,
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
    lastDamageTaken: 0,
    lastDamageCategory: null,
    lastDamageType: null,
  } as unknown as ActivePokemon;
}

function createMockSide(index: 0 | 1, active: ActivePokemon): BattleSide {
  return {
    index,
    trainer: null,
    team: [active.pokemon as unknown as PokemonInstance],
    active: [active],
    hazards: [],
    screens: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
    gimmickUsed: false,
  } as unknown as BattleSide;
}

function createMockState(side0: BattleSide, side1: BattleSide): BattleState {
  return {
    sides: [side0, side1],
    turn: 1,
    weather: null,
    terrain: null,
    trickRoom: null,
    format: { id: "singles", slots: 1 },
  } as unknown as BattleState;
}

const dataManager = createGen2DataManager();

function getMove(moveId: string): MoveData {
  return dataManager.getMove(moveId);
}

describe("Gen 2 custom move dispatch gaps", () => {
  const ruleset = new Gen2Ruleset();

  describe("Rest", () => {
    it("given a damaged badly-poisoned user, when Rest resolves, then it cures status, clears toxic tracking, restores max HP, and self-inflicts fixed 2-turn sleep", () => {
      // Source: pret/pokecrystal engine/battle/effect_commands.asm:6055-6101
      // Rest cures status, fully heals the user, and sets REST_SLEEP_TURNS + 1
      // which corresponds to a fixed 2-turn sleep countdown in the active state.
      const attacker = createMockActive({
        currentHp: 80,
        maxHp: 200,
        status: CORE_STATUS_IDS.poison,
      });
      attacker.volatileStatuses.set(CORE_VOLATILE_IDS.toxicCounter, {
        turnsLeft: -1,
        data: { counter: 3 },
      });
      const defender = createMockActive();
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move: getMove(GEN2_MOVE_IDS.rest),
        damage: 0,
        state,
        rng: new SeededRandom(42),
      });

      expect(result.healAmount).toBe(200);
      expect(result.statusCuredOnly).toEqual({ target: BATTLE_EFFECT_TARGETS.attacker });
      expect(result.volatilesToClear).toContainEqual({
        target: BATTLE_EFFECT_TARGETS.attacker,
        volatile: CORE_VOLATILE_IDS.toxicCounter,
      });
      expect(result.selfStatusInflicted).toBe(CORE_STATUS_IDS.sleep);
      expect(result.selfVolatileData).toEqual({ turnsLeft: 2 });
    });

    it("given a full-HP user, when Rest resolves, then it fails without healing or self-sleep", () => {
      // Source: pret/pokecrystal engine/battle/effect_commands.asm:6104-6108
      // Rest fails with HPIsFullText if the user is already at max HP.
      const attacker = createMockActive({
        currentHp: 200,
        maxHp: 200,
        status: CORE_STATUS_IDS.paralysis,
      });
      const defender = createMockActive();
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move: getMove(GEN2_MOVE_IDS.rest),
        damage: 0,
        state,
        rng: new SeededRandom(7),
      });

      expect(result.healAmount).toBe(0);
      expect(result.statusCuredOnly).toBeUndefined();
      expect(result.selfStatusInflicted).toBeUndefined();
      expect(result.messages).toContain("HP is full!");
    });
  });

  describe("Perish Song", () => {
    it("given two unaffected battlers, when Perish Song resolves, then both battlers receive the perish-song volatile with a 4-count", () => {
      // Source: pret/pokecrystal engine/battle/move_effects/perish_song.asm
      // The move sets SUBSTATUS_PERISH on both battlers and initializes each counter to 4,
      // which becomes 3 after the same turn's residual countdown.
      const attacker = createMockActive();
      const defender = createMockActive();
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move: getMove(GEN2_MOVE_IDS.perishSong),
        damage: 0,
        state,
        rng: new SeededRandom(11),
      });

      expect(result.selfVolatileInflicted).toBe(CORE_VOLATILE_IDS.perishSong);
      expect(result.selfVolatileData).toEqual({ turnsLeft: 4, data: { counter: 4 } });
      expect(result.volatileInflicted).toBe(CORE_VOLATILE_IDS.perishSong);
      expect(result.volatileData).toEqual({ turnsLeft: 4, data: { counter: 4 } });
    });
  });

  describe("Curse", () => {
    it("given a non-Ghost user, when Curse resolves, then it boosts Attack/Defense and lowers Speed on the user", () => {
      // Source: pret/pokecrystal engine/battle/effect_commands.asm CurseEffect
      const attacker = createMockActive({
        types: [CORE_TYPE_IDS.normal],
      });
      const defender = createMockActive();
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move: getMove(GEN2_MOVE_IDS.curse),
        damage: 0,
        state,
        rng: new SeededRandom(13),
      });

      expect(result.recoilDamage).toBe(0);
      expect(result.volatileInflicted).toBeNull();
      expect(result.statChanges).toEqual([
        { target: BATTLE_EFFECT_TARGETS.attacker, stat: CORE_STAT_IDS.speed, stages: -1 },
        { target: BATTLE_EFFECT_TARGETS.attacker, stat: CORE_STAT_IDS.attack, stages: 1 },
        { target: BATTLE_EFFECT_TARGETS.attacker, stat: CORE_STAT_IDS.defense, stages: 1 },
      ]);
    });

    it("given a Ghost user, when Curse resolves, then it halves the user's HP and inflicts curse on the target", () => {
      // Source: pret/pokecrystal engine/battle/effect_commands.asm CurseEffect
      const attacker = createMockActive({
        currentHp: 200,
        maxHp: 200,
        types: [CORE_TYPE_IDS.ghost],
      });
      const defender = createMockActive();
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move: getMove(GEN2_MOVE_IDS.curse),
        damage: 0,
        state,
        rng: new SeededRandom(17),
      });

      expect(result.recoilDamage).toBe(100);
      expect(result.volatileInflicted).toBe(CORE_VOLATILE_IDS.curse);
      expect(result.statChanges).toEqual([]);
    });

    it("given a Ghost user targeting a substitute, when Curse resolves, then it fails instead of cursing through the substitute", () => {
      // Source: move description in owned Gen 2 move data and cartridge behavior:
      // Ghost Curse fails if the target has a substitute.
      const attacker = createMockActive({
        currentHp: 200,
        maxHp: 200,
        types: [CORE_TYPE_IDS.ghost],
      });
      const defender = createMockActive();
      defender.substituteHp = 50;
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move: getMove(GEN2_MOVE_IDS.curse),
        damage: 0,
        state,
        rng: new SeededRandom(19),
      });

      expect(result.recoilDamage).toBe(0);
      expect(result.volatileInflicted).toBeNull();
      expect(result.messages).toContain("But it failed!");
    });
  });
});
