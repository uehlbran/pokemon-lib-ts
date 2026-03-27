import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_MOVE_IDS,
  CORE_NATURE_IDS,
} from "../../../packages/core/src/constants/index.js";
import type { NatureData } from "../../../packages/core/src/entities/nature.js";
import type { PokemonInstance } from "../../../packages/core/src/entities/pokemon.js";
import { createFriendship } from "../../../packages/core/src/logic/friendship-inputs.js";
import { createMoveSlot } from "../../../packages/core/src/logic/pokemon-factory.js";
import { calculateAllStats } from "../../../packages/core/src/logic/stat-calc.js";
import {
  createDvs,
  createEvs,
  createIvs,
  createStatExp,
} from "../../../packages/core/src/logic/stat-inputs.js";
import { createGen1DataManager } from "../../../packages/gen1/src/data/index.js";
import { calculateGen1Stats } from "../../../packages/gen1/src/Gen1StatCalc.js";
import { createGen2DataManager } from "../../../packages/gen2/src/data/index.js";
import { calculateGen2Stats } from "../../../packages/gen2/src/Gen2StatCalc.js";
import { createGen3DataManager } from "../../../packages/gen3/src/data/index.js";
import type { ImplementedGeneration } from "./gen-discovery.js";
import type { SuiteResult } from "./result-schema.js";

function createGen12Pokemon(speciesId: number, tacklePp: number): PokemonInstance {
  return {
    uid: "oracle-fast-path",
    speciesId,
    nickname: null,
    level: 50,
    experience: 0,
    nature: CORE_NATURE_IDS.hardy,
    ivs: createDvs(),
    evs: createStatExp(),
    currentHp: 1,
    moves: [createMoveSlot(CORE_MOVE_IDS.tackle, tacklePp)],
    ability: CORE_ABILITY_IDS.none,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    heldItem: null,
    status: null,
    friendship: createFriendship(70),
    gender: CORE_GENDERS.male,
    isShiny: false,
    metLocation: "oracle",
    metLevel: 50,
    originalTrainer: "oracle",
    originalTrainerId: 1,
    pokeball: CORE_ITEM_IDS.pokeBall,
    calculatedStats: {
      hp: 1,
      attack: 1,
      defense: 1,
      spAttack: 1,
      spDefense: 1,
      speed: 1,
    },
  };
}

function createGen3Pokemon(speciesId: number, tacklePp: number): PokemonInstance {
  return {
    uid: "oracle-fast-path",
    speciesId,
    nickname: null,
    level: 50,
    experience: 0,
    nature: CORE_NATURE_IDS.hardy,
    ivs: createIvs(),
    evs: createEvs(),
    currentHp: 1,
    moves: [createMoveSlot(CORE_MOVE_IDS.tackle, tacklePp)],
    ability: CORE_ABILITY_IDS.none,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    heldItem: null,
    status: null,
    friendship: createFriendship(70),
    gender: CORE_GENDERS.male,
    isShiny: false,
    metLocation: "oracle",
    metLevel: 50,
    originalTrainer: "oracle",
    originalTrainerId: 1,
    pokeball: CORE_ITEM_IDS.pokeBall,
  };
}

export function runStatsSuite(generation: ImplementedGeneration): SuiteResult {
  if (generation.gen > 3) {
    return {
      status: "skip",
      passed: 0,
      failed: 0,
      skipped: 1,
      failures: [],
      notes: [],
      skipReason: "Initial fast path only implements Gen 1-3 stat checks",
    };
  }

  const failures: string[] = [];

  if (generation.gen === 1) {
    const dataManager = createGen1DataManager();
    const species = dataManager.getSpeciesByName("charizard");
    const tackle = dataManager.getMove(CORE_MOVE_IDS.tackle);
    const stats = calculateGen1Stats(createGen12Pokemon(species.id, tackle.pp), species);
    if (stats.hp <= 0 || stats.attack <= 0 || stats.spAttack <= 0 || stats.spDefense <= 0) {
      failures.push("Gen 1: expected positive derived stats for level 50 Charizard");
    }
  }

  if (generation.gen === 2) {
    const dataManager = createGen2DataManager();
    const species = dataManager.getSpeciesByName("charizard");
    const tackle = dataManager.getMove(CORE_MOVE_IDS.tackle);
    const stats = calculateGen2Stats(createGen12Pokemon(species.id, tackle.pp), species);
    if (stats.hp <= 0 || stats.attack <= 0 || stats.spAttack <= 0) {
      failures.push("Gen 2: expected positive derived stats for level 50 Charizard");
    }
  }

  if (generation.gen === 3) {
    const dataManager = createGen3DataManager();
    const species = dataManager.getSpeciesByName("charizard");
    const tackle = dataManager.getMove(CORE_MOVE_IDS.tackle);
    const nature = dataManager.getNature(CORE_NATURE_IDS.hardy) as NatureData;
    const stats = calculateAllStats(createGen3Pokemon(species.id, tackle.pp), species, nature);
    if (stats.hp !== 153 || stats.spAttack !== 129 || stats.speed !== 120) {
      failures.push(
        `Gen 3: expected level 50 Hardy Charizard stats hp=153/spAttack=129/speed=120, got hp=${stats.hp}/spAttack=${stats.spAttack}/speed=${stats.speed}`,
      );
    }
  }

  return {
    status: failures.length === 0 ? "pass" : "fail",
    passed: failures.length === 0 ? 1 : 0,
    failed: failures.length,
    skipped: 0,
    failures,
    notes: [],
  };
}
