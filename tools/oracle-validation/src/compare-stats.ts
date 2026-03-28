import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_MOVE_IDS,
  CORE_NATURE_IDS,
} from "../../../packages/core/src/constants/index.js";
import { DataManager } from "../../../packages/core/src/data/data-manager.js";
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
import { createGen4DataManager } from "../../../packages/gen4/src/data/index.js";
import { createGen5DataManager } from "../../../packages/gen5/src/data/index.js";
import { createGen6DataManager } from "../../../packages/gen6/src/data/index.js";
import { createGen7DataManager } from "../../../packages/gen7/src/data/index.js";
import { createGen8DataManager } from "../../../packages/gen8/src/data/index.js";
import { createGen9DataManager } from "../../../packages/gen9/src/data/index.js";
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

function createGen3PlusPokemon(speciesId: number, tacklePp: number): PokemonInstance {
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

// Gen 3+ stat formula (Bulbapedia):
// HP = floor(((2*base + IV + floor(EV/4)) * level) / 100) + level + 10
// Other = floor((floor(((2*base + IV + floor(EV/4)) * level) / 100) + 5) * natureModifier)
// With Hardy nature (1.0), IVs 31, EVs 0:
// HP = floor(((2*base + 31) * 50) / 100) + 50 + 10
// Other = floor(((2*base + 31) * 50) / 100) + 5
function expectedGen3PlusStat(baseStat: number, isHp: boolean): number {
  const raw = Math.floor(((2 * baseStat + 31) * 50) / 100);
  return isHp ? raw + 50 + 10 : raw + 5;
}

const GEN_DATA_FACTORIES: Record<number, () => DataManager> = {
  3: createGen3DataManager,
  4: createGen4DataManager,
  5: createGen5DataManager,
  6: createGen6DataManager,
  7: createGen7DataManager,
  8: createGen8DataManager,
  9: createGen9DataManager,
};

function runGen3PlusStatCheck(gen: number): string[] {
  const factory = GEN_DATA_FACTORIES[gen];
  if (!factory) return [`Gen ${gen}: no data manager factory available`];

  const dataManager = factory();
  const species = dataManager.getSpeciesByName("charizard");
  const tackle = dataManager.getMove(CORE_MOVE_IDS.tackle);
  const nature = dataManager.getNature(CORE_NATURE_IDS.hardy);
  if (!nature) {
    return [`Gen ${gen}: Hardy nature is missing from the data manager`];
  }
  const pokemon = createGen3PlusPokemon(species.id, tackle.pp);
  const stats = calculateAllStats(pokemon, species, nature);

  const failures: string[] = [];

  // Charizard base stats: HP 78 / Atk 84 / Def 78 / SpA 109 / SpD 85 / Spe 100
  // Source: Bulbapedia Charizard base stats (unchanged Gen 3-9)
  const expectedHp = expectedGen3PlusStat(78, true); // 153
  const expectedAtk = expectedGen3PlusStat(84, false); // 104
  const expectedDef = expectedGen3PlusStat(78, false); // 98
  const expectedSpA = expectedGen3PlusStat(109, false); // 129
  const expectedSpD = expectedGen3PlusStat(85, false); // 105
  const expectedSpe = expectedGen3PlusStat(100, false); // 120

  if (stats.hp !== expectedHp) {
    failures.push(`Gen ${gen}: Charizard HP expected=${expectedHp}, got=${stats.hp}`);
  }
  if (stats.attack !== expectedAtk) {
    failures.push(`Gen ${gen}: Charizard Atk expected=${expectedAtk}, got=${stats.attack}`);
  }
  if (stats.defense !== expectedDef) {
    failures.push(`Gen ${gen}: Charizard Def expected=${expectedDef}, got=${stats.defense}`);
  }
  if (stats.spAttack !== expectedSpA) {
    failures.push(`Gen ${gen}: Charizard SpA expected=${expectedSpA}, got=${stats.spAttack}`);
  }
  if (stats.spDefense !== expectedSpD) {
    failures.push(`Gen ${gen}: Charizard SpD expected=${expectedSpD}, got=${stats.spDefense}`);
  }
  if (stats.speed !== expectedSpe) {
    failures.push(`Gen ${gen}: Charizard Spe expected=${expectedSpe}, got=${stats.speed}`);
  }

  return failures;
}

export function runStatsSuite(generation: ImplementedGeneration): SuiteResult {
  const failures: string[] = [];

  if (generation.gen === 1) {
    const dataManager = createGen1DataManager();
    const species = dataManager.getSpeciesByName("charizard");
    const tackle = dataManager.getMove(CORE_MOVE_IDS.tackle);
    const stats = calculateGen1Stats(createGen12Pokemon(species.id, tackle.pp), species);
    // Source: pokered engine/battle/core.asm — Gen 1 stat calc uses DVs + stat exp
    // Level 50 Charizard with max DVs (15), zero stat exp: all stats must be positive
    if (stats.hp <= 0 || stats.attack <= 0 || stats.spAttack <= 0 || stats.spDefense <= 0) {
      failures.push("Gen 1: expected positive derived stats for level 50 Charizard");
    }
  }

  if (generation.gen === 2) {
    const dataManager = createGen2DataManager();
    const species = dataManager.getSpeciesByName("charizard");
    const tackle = dataManager.getMove(CORE_MOVE_IDS.tackle);
    const stats = calculateGen2Stats(createGen12Pokemon(species.id, tackle.pp), species);
    // Source: pokecrystal engine/battle/core.asm — Gen 2 stat calc uses DVs + stat exp
    if (stats.hp <= 0 || stats.attack <= 0 || stats.spAttack <= 0) {
      failures.push("Gen 2: expected positive derived stats for level 50 Charizard");
    }
  }

  if (generation.gen >= 3) {
    failures.push(...runGen3PlusStatCheck(generation.gen));
  }

  return {
    status: failures.length === 0 ? "pass" : "fail",
    suitePassed: failures.length === 0,
    failed: failures.length,
    skipped: 0,
    failures,
    notes: [],
    matchedKnownDisagreements: [],
    staleDisagreements: [],
    oracleChecks: [],
  };
}
