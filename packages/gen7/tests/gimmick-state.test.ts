import type { ActivePokemon, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_NATURE_IDS,
  createMoveSlot,
} from "@pokemon-lib-ts/core";
import {
  createGen7DataManager,
  GEN7_ITEM_IDS,
  GEN7_MOVE_IDS,
  GEN7_SPECIES_IDS,
} from "@pokemon-lib-ts/gen7";
import { describe, expect, it } from "vitest";
import { Gen7MegaEvolution } from "../src/Gen7MegaEvolution";
import { Gen7ZMove } from "../src/Gen7ZMove";

const dataManager = createGen7DataManager();
const DEFAULT_SPECIES = dataManager.getSpecies(GEN7_SPECIES_IDS.pikachu);
const DEFAULT_MOVE = dataManager.getMove(GEN7_MOVE_IDS.tackle);

function createSyntheticBattlePokemon(overrides: {
  speciesId?: number;
  heldItem?: string | null;
  moveId?: string;
  isMega?: boolean;
}): ActivePokemon {
  const species = dataManager.getSpecies(overrides.speciesId ?? DEFAULT_SPECIES.id);
  const move = dataManager.getMove(overrides.moveId ?? DEFAULT_MOVE.id);

  return {
    pokemon: {
      uid: "test",
      speciesId: species.id,
      nickname: null,
      level: 50,
      experience: 0,
      nature: CORE_NATURE_IDS.hardy,
      ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: 200,
      moves: [createMoveSlot(move.id, move.pp)],
      ability: CORE_ABILITY_IDS.none,
      abilitySlot: CORE_ABILITY_SLOTS.normal1,
      heldItem:
        overrides.heldItem === null
          ? null
          : overrides.heldItem
            ? dataManager.getItem(overrides.heldItem).id
            : null,
      status: null,
      friendship: 0,
      gender: CORE_GENDERS.male,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: CORE_ITEM_IDS.pokeBall,
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
    volatileStatuses: new Map(),
    types: [...species.types],
    ability: CORE_ABILITY_IDS.none,
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

function createSyntheticBattleSide(index: 0 | 1): BattleSide {
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

function createSyntheticBattleState(): BattleState {
  return {
    phase: "action-select",
    generation: 7,
    format: "singles",
    turnNumber: 1,
    sides: [createSyntheticBattleSide(0), createSyntheticBattleSide(1)],
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
    const pokemon = createSyntheticBattlePokemon({
      speciesId: GEN7_SPECIES_IDS.pikachu,
      heldItem: GEN7_ITEM_IDS.electriumZ,
      moveId: GEN7_MOVE_IDS.thunderbolt,
    });
    const side = createSyntheticBattleSide(0);
    const state = createSyntheticBattleState();

    gimmick.restoreState({ usedBySide: [0] });

    expect(gimmick.canUse(pokemon, side, state)).toBe(false);
    expect(gimmick.serializeState()).toEqual({ usedBySide: [0] });
  });

  it("given malformed serialized Z-Move state, when restoreState is called, then it ignores the payload and leaves usage available", () => {
    const gimmick = new Gen7ZMove();
    const pokemon = createSyntheticBattlePokemon({
      speciesId: GEN7_SPECIES_IDS.pikachu,
      heldItem: GEN7_ITEM_IDS.electriumZ,
      moveId: GEN7_MOVE_IDS.thunderbolt,
    });
    const side = createSyntheticBattleSide(0);
    const state = createSyntheticBattleState();

    expect(() => gimmick.restoreState({ usedBySide: ["invalid"] })).not.toThrow();

    expect(gimmick.canUse(pokemon, side, state)).toBe(true);
    expect(gimmick.serializeState()).toEqual({ usedBySide: [] });
  });

  it("given a serialized used-side list for Mega Evolution, when restoreState is called, then the same side cannot mega evolve again", () => {
    const gimmick = new Gen7MegaEvolution();
    const pokemon = createSyntheticBattlePokemon({
      speciesId: GEN7_SPECIES_IDS.charizard,
      heldItem: GEN7_ITEM_IDS.charizarditeX,
    });
    const side = createSyntheticBattleSide(0);
    const state = createSyntheticBattleState();

    gimmick.restoreState({ usedBySide: [0] });

    expect(gimmick.canUse(pokemon, side, state)).toBe(false);
    expect(gimmick.serializeState()).toEqual({ usedBySide: [0] });
  });

  it("given malformed serialized Mega Evolution state, when restoreState is called, then it ignores the payload and leaves usage available", () => {
    const gimmick = new Gen7MegaEvolution();
    const pokemon = createSyntheticBattlePokemon({
      speciesId: GEN7_SPECIES_IDS.charizard,
      heldItem: GEN7_ITEM_IDS.charizarditeX,
    });
    const side = createSyntheticBattleSide(0);
    const state = createSyntheticBattleState();

    expect(() => gimmick.restoreState({ usedBySide: ["invalid"] })).not.toThrow();

    expect(gimmick.canUse(pokemon, side, state)).toBe(true);
    expect(gimmick.serializeState()).toEqual({ usedBySide: [] });
  });
});
