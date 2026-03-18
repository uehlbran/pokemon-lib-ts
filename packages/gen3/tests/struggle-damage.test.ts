import type { ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import type { PokemonInstance, PokemonType, StatBlock } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { Gen3Ruleset } from "../src";
import { createGen3DataManager } from "../src/data";

/**
 * Gen 3 Struggle Damage and Recoil Tests
 *
 * Gen 3 Struggle:
 * - Typeless physical damage (no STAB, no type effectiveness)
 * - 50 base power
 * - Formula: same structure as confusion self-hit but 50 BP
 *   BaseDamage = floor(floor(levelFactor * 50 * Atk) / Def / 50) + 2
 *   where levelFactor = floor(2 * Level / 5) + 2
 * - Recoil: 1/2 of damage dealt (Gen 3; Gen 4+ uses 1/4 max HP)
 *
 * Source: pret/pokeemerald src/battle_script_commands.c — Struggle recoil = damage / 2
 * Source: Showdown sim/battle.ts — Gen 3 Struggle is typeless physical
 */

const dataManager = createGen3DataManager();
const ruleset = new Gen3Ruleset(dataManager);

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createActivePokemon(opts: {
  level: number;
  attack: number;
  defense: number;
  types: PokemonType[];
  hp?: number;
}): ActivePokemon {
  const stats: StatBlock = {
    hp: opts.hp ?? 200,
    attack: opts.attack,
    defense: opts.defense,
    spAttack: 100,
    spDefense: 100,
    speed: 100,
  };

  const pokemon = {
    uid: "test",
    speciesId: 1,
    nickname: null,
    level: opts.level,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: opts.hp ?? 200,
    moves: [],
    ability: "",
    abilitySlot: "normal1" as const,
    heldItem: null,
    status: null,
    friendship: 0,
    gender: "male" as const,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: "pokeball",
    calculatedStats: stats,
  } as PokemonInstance;

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
    types: opts.types,
    ability: "",
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
  } as ActivePokemon;
}

function createMinimalBattleState(): BattleState {
  return {
    sides: [
      {
        active: [],
        team: [],
        screens: { reflect: null, lightScreen: null, auroraVeil: null },
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
        trainer: null,
      },
      {
        active: [],
        team: [],
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

describe("Gen 3 Struggle Damage", () => {
  it("given L50 attacker (100 Atk) vs defender (100 Def), when Struggle used, then damage follows typeless 50 BP formula", () => {
    // Source: Showdown sim/battle.ts — Struggle is typeless 50 BP physical
    // Formula: levelFactor = floor(2*50/5) + 2 = floor(20) + 2 = 22
    //   baseDamage = floor(floor(22 * 50 * 100) / 100 / 50) + 2
    //              = floor(floor(110000) / 100 / 50) + 2
    //              = floor(1100 / 50) + 2
    //              = floor(22) + 2 = 24
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      types: ["normal"],
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      types: ["ghost"],
    });
    const state = createMinimalBattleState();

    const damage = ruleset.calculateStruggleDamage(attacker, defender, state);

    // BaseDamage from formula: floor(floor(22 * 50 * 100) / 100 / 50) + 2 = 24
    // Typeless means Ghost type takes full damage (no immunity)
    expect(damage).toBe(24);
  });

  it("given L100 attacker (200 Atk) vs defender (100 Def), when Struggle used, then damage is higher", () => {
    // Source: Showdown sim/battle.ts — Struggle formula with higher level/attack
    // levelFactor = floor(2*100/5) + 2 = floor(40) + 2 = 42
    // baseDamage = floor(floor(42 * 50 * 200) / 100 / 50) + 2
    //            = floor(floor(420000) / 100 / 50) + 2
    //            = floor(4200 / 50) + 2
    //            = floor(84) + 2 = 86
    const attacker = createActivePokemon({
      level: 100,
      attack: 200,
      defense: 100,
      types: ["normal"],
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      types: ["normal"],
    });
    const state = createMinimalBattleState();

    const damage = ruleset.calculateStruggleDamage(attacker, defender, state);

    expect(damage).toBe(86);
  });
});

describe("Gen 3 Struggle Recoil", () => {
  it("given 100 damage dealt, when Struggle recoil calculated, then recoil = floor(100/4) = 25", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c:2636-2639
    // "case MOVE_EFFECT_RECOIL_25: gBattleMoveDamage = (gHpDealt) / 4;"
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      types: ["normal"],
    });

    const recoil = ruleset.calculateStruggleRecoil(attacker, 100);

    expect(recoil).toBe(25);
  });

  it("given 1 damage dealt, when Struggle recoil calculated, then min recoil = 1", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c:2638-2639
    // "if (gBattleMoveDamage == 0) gBattleMoveDamage = 1;"
    // floor(1/4) = 0, but Math.max(1, 0) = 1
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      types: ["normal"],
    });

    const recoil = ruleset.calculateStruggleRecoil(attacker, 1);

    expect(recoil).toBe(1);
  });

  it("given 99 damage dealt, when Struggle recoil calculated, then recoil = floor(99/4) = 24", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c:2637
    // "gBattleMoveDamage = (gHpDealt) / 4;" — floor(99/4) = 24
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      types: ["normal"],
    });

    const recoil = ruleset.calculateStruggleRecoil(attacker, 99);

    expect(recoil).toBe(24);
  });
});
