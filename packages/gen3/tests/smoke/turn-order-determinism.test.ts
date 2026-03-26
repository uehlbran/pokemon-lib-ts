import type { ActivePokemon, BattleAction, BattleState } from "@pokemon-lib-ts/battle";
import { createDefaultStatStages } from "@pokemon-lib-ts/battle/utils";
import type { PokemonInstance, StatBlock } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_MOVE_IDS,
  CORE_NATURE_IDS,
  CORE_TYPE_IDS,
  createEvs,
  createIvs,
  createMoveSlot,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { GEN3_SPECIES_IDS, Gen3Ruleset } from "../../src";
import { createGen3DataManager } from "../../src/data";

const dataManager = createGen3DataManager();
const ruleset = new Gen3Ruleset(dataManager);
const SPECIES_IDS = GEN3_SPECIES_IDS;
const TYPE_IDS = CORE_TYPE_IDS;

function createCanonicalTackleSlot() {
  const tackle = dataManager.getMove(CORE_MOVE_IDS.tackle);
  return createMoveSlot(tackle.id, tackle.pp);
}

function createSyntheticOnFieldPokemon(speed: number): ActivePokemon {
  const stats: StatBlock = {
    hp: 200,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    speed,
  };

  const pokemon = {
    uid: `turn-order-${speed}`,
    speciesId: SPECIES_IDS.bulbasaur,
    nickname: null,
    level: 50,
    experience: 0,
    nature: CORE_NATURE_IDS.hardy,
    ivs: createIvs({ hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 }),
    evs: createEvs(),
    currentHp: 200,
    moves: [createCanonicalTackleSlot()],
    ability: CORE_ABILITY_IDS.none,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    heldItem: null,
    status: null,
    friendship: 0,
    gender: CORE_GENDERS.male,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: CORE_ITEM_IDS.pokeBall,
    calculatedStats: stats,
  } as PokemonInstance;

  return {
    pokemon,
    teamSlot: 0,
    statStages: createDefaultStatStages(),
    volatileStatuses: new Map(),
    types: [TYPE_IDS.normal],
    ability: CORE_ABILITY_IDS.none,
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

function createBattleState(active0: ActivePokemon, active1: ActivePokemon): BattleState {
  return {
    sides: [
      {
        active: [active0],
        team: [active0.pokemon],
        screens: { reflect: null, lightScreen: null, auroraVeil: null },
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
        trainer: null,
      },
      {
        active: [active1],
        team: [active1.pokemon],
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

describe("Gen 3 Turn Order Smoke", () => {
  it("given the same speed tie and seed, when resolved repeatedly, then the first mover stays stable", () => {
    // Source: issue #120 — resolveTurnOrder must remain seed-deterministic across repeated calls.
    const state = createBattleState(
      createSyntheticOnFieldPokemon(100),
      createSyntheticOnFieldPokemon(100),
    );
    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0, target: 1 },
      { type: "move", side: 1, moveIndex: 0, target: 0 },
    ];

    const firstMovers = new Set<number>();
    for (let i = 0; i < 10; i++) {
      const order = ruleset.resolveTurnOrder([...actions], state, new SeededRandom(12345));
      firstMovers.add(order[0]!.side);
    }

    expect(firstMovers.size).toBe(1);
  });

  it("given many seeds for the same speed tie, when resolved across the smoke suite, then both battlers eventually move first", () => {
    // Source: pret/pokeemerald — equal-speed tiebreaks depend on RNG, so a seed sweep should exercise both sides.
    const state = createBattleState(
      createSyntheticOnFieldPokemon(100),
      createSyntheticOnFieldPokemon(100),
    );
    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0, target: 1 },
      { type: "move", side: 1, moveIndex: 0, target: 0 },
    ];

    const firstMovers = new Set<number>();
    for (let seed = 0; seed < 100; seed++) {
      const order = ruleset.resolveTurnOrder([...actions], state, new SeededRandom(seed));
      firstMovers.add(order[0]!.side);
    }

    expect(firstMovers.size).toBe(2);
  });
});
