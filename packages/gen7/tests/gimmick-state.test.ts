import type { ActivePokemon, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import { describe, expect, it } from "vitest";
import { Gen7MegaEvolution } from "../src/Gen7MegaEvolution";
import { Gen7ZMove } from "../src/Gen7ZMove";

function createActivePokemon(overrides: {
  speciesId: number;
  heldItem: string;
  moveId?: string;
  isMega?: boolean;
}): ActivePokemon {
  return {
    pokemon: {
      uid: "test",
      speciesId: overrides.speciesId,
      nickname: null,
      level: 50,
      experience: 0,
      nature: "hardy",
      ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: 200,
      moves: [{ moveId: overrides.moveId ?? "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
      ability: "none",
      abilitySlot: "normal1",
      heldItem: overrides.heldItem,
      status: null,
      friendship: 0,
      gender: "male",
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: "pokeball",
      calculatedStats: {
        hp: 200,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
      },
    },
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
    types: ["normal"],
    ability: "none",
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: 0,
    movedThisTurn: false,
    consecutiveProtects: 0,
    substituteHp: 0,
    itemKnockedOff: false,
    transformed: false,
    transformedSpecies: null,
    isMega: overrides.isMega ?? false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    stellarBoostedTypes: [],
    suppressedAbility: null,
    forcedMove: null,
  } as ActivePokemon;
}

function createSide(index: 0 | 1): BattleSide {
  return {
    index,
    active: [],
    hazards: [],
    screens: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
    gimmickUsed: false,
    trainer: null,
    team: [],
  };
}

function createState(): BattleState {
  return {
    phase: "action-select",
    generation: 7,
    format: "singles",
    turnNumber: 1,
    sides: [createSide(0), createSide(1)],
    weather: null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    turnHistory: [],
    rng: {} as BattleState["rng"],
    isWildBattle: false,
    fleeAttempts: 0,
    ended: false,
    winner: null,
  };
}

describe("Gen 7 gimmick state serialization", () => {
  it("given a serialized used-side list for Z-Move, when restoreState is called, then the same side cannot use Z-Move again", () => {
    const gimmick = new Gen7ZMove();
    const pokemon = createActivePokemon({
      speciesId: 25,
      heldItem: "electrium-z",
      moveId: "thunderbolt",
    });
    const side = createSide(0);
    const state = createState();

    gimmick.restoreState({ usedBySide: [0] });

    expect(gimmick.canUse(pokemon, side, state)).toBe(false);
    expect(gimmick.serializeState()).toEqual({ usedBySide: [0] });
  });

  it("given malformed serialized Z-Move state, when restoreState is called, then it ignores the payload and leaves usage available", () => {
    const gimmick = new Gen7ZMove();
    const pokemon = createActivePokemon({
      speciesId: 25,
      heldItem: "electrium-z",
      moveId: "thunderbolt",
    });
    const side = createSide(0);
    const state = createState();

    expect(() => gimmick.restoreState({ usedBySide: ["invalid"] })).not.toThrow();

    expect(gimmick.canUse(pokemon, side, state)).toBe(true);
    expect(gimmick.serializeState()).toEqual({ usedBySide: [] });
  });

  it("given a serialized used-side list for Mega Evolution, when restoreState is called, then the same side cannot mega evolve again", () => {
    const gimmick = new Gen7MegaEvolution();
    const pokemon = createActivePokemon({
      speciesId: 6,
      heldItem: "charizardite-x",
    });
    const side = createSide(0);
    const state = createState();

    gimmick.restoreState({ usedBySide: [0] });

    expect(gimmick.canUse(pokemon, side, state)).toBe(false);
    expect(gimmick.serializeState()).toEqual({ usedBySide: [0] });
  });

  it("given malformed serialized Mega Evolution state, when restoreState is called, then it ignores the payload and leaves usage available", () => {
    const gimmick = new Gen7MegaEvolution();
    const pokemon = createActivePokemon({
      speciesId: 6,
      heldItem: "charizardite-x",
    });
    const side = createSide(0);
    const state = createState();

    expect(() => gimmick.restoreState({ usedBySide: ["invalid"] })).not.toThrow();

    expect(gimmick.canUse(pokemon, side, state)).toBe(true);
    expect(gimmick.serializeState()).toEqual({ usedBySide: [] });
  });
});
